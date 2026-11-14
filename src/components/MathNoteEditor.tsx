import { useEffect, useRef } from 'react'
import katex from 'katex'
import { mathSpans } from '../lib/math'
import { registerMathEditor } from '../lib/mathEditorBridge'

interface MathNoteEditorProps {
  value: string
  onChange: (source: string) => void
  onSave: () => void
  onCancel: () => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

interface Piece {
  sourceStart: number
  sourceEnd: number
  displayStart: number
  displayLength: number
  formula: boolean
  sourceText: string
  texStart: number
  texEnd: number
}

interface SelectionRange {
  start: number
  end: number
}

interface EditorApi {
  input: () => void
  keyDown: (event: KeyboardEvent) => void
  paste: (event: ClipboardEvent) => void
  copy: (event: ClipboardEvent, cut: boolean) => void
  mouseDown: (event: MouseEvent) => void
  compositionStart: () => void
  compositionEnd: () => void
  insert: (text: string) => void
  queue: (text: string) => void
  reflect: (value: string) => void
}

const htmlCache = new Map<string, string>()

/// The note is shown as it will read: every `$...$` run becomes an inline formula. Moving the
/// caret into or beside one turns the whole note back into source, so typing never reflows
/// around a rendered formula, and a pause after leaving it folds everything back — the same
/// contract as the macOS editor.
function formulaHtml(tex: string): string {
  const cached = htmlCache.get(tex)
  if (cached != null) return cached
  let html = ''
  try {
    html = katex.renderToString(tex, {
      displayMode: false,
      throwOnError: true,
      strict: false,
      trust: false,
      output: 'html'
    })
  } catch {
    html = ''
  }
  if (htmlCache.size > 400) htmlCache.clear()
  htmlCache.set(tex, html)
  return html
}

const SENTINEL = '\u200B'

/// A zero-width space closes the editable text. Without it a caret after a trailing newline has
/// no glyph after it, and Blink sends the next typed character back before the newline.
function isTrailing(editor: HTMLElement, node: Node): boolean {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === Node.TEXT_NODE && (next as Text).data === '') continue
    return false
  }
  return true
}

function contentText(editor: HTMLElement, node: Text): string {
  const data = node.data
  if (data.endsWith(SENTINEL) && isTrailing(editor, node)) return data.slice(0, -1)
  return data
}

function nodeSize(node: Node, editor: HTMLElement): number {
  if (node.nodeType === Node.TEXT_NODE) return contentText(editor, node as Text).length
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement
    if (element.classList.contains('math-live')) return 1
    let size = 0
    for (const child of Array.from(element.childNodes)) size += nodeSize(child, editor)
    return size
  }
  return 0
}

function formulaElementFor(node: Node | null): HTMLElement | null {
  if (!node) return null
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains('math-live')) {
    return node as HTMLElement
  }
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  return element?.closest('.math-live') ?? null
}

function displayOffsetFor(editor: HTMLElement, target: Node, targetOffset: number): number | null {
  const formula = formulaElementFor(target)
  if (formula) {
    if (!editor.contains(formula)) return null
    let count = 0
    for (const child of Array.from(editor.childNodes)) {
      if (child === formula) {
        const offset = target === formula ? Math.min(Math.max(0, targetOffset), 1) : 0
        return count + offset
      }
      count += nodeSize(child, editor)
    }
    return null
  }

  let count = 0
  const visit = (node: Node): number | null => {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = contentText(editor, node as Text).length
        return count + Math.min(Math.max(0, targetOffset), length)
      }
      const children = Array.from(node.childNodes)
      const limit = Math.min(Math.max(0, targetOffset), children.length)
      for (let i = 0; i < limit; i += 1) count += nodeSize(children[i], editor)
      return count
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += contentText(editor, node as Text).length
      return null
    }
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains('math-live')) {
      count += 1
      return null
    }
    for (const child of Array.from(node.childNodes)) {
      const hit = visit(child)
      if (hit != null) return hit
    }
    return null
  }
  return visit(editor)
}

/// Where each piece of the current display sits in the plain-text note. Rendered formulas count
/// as one display character but keep the whole `$...$` run as their source, so every selection
/// and undo step can be translated between the two.
function snapshotPieces(editor: HTMLElement): Piece[] {
  const pieces: Piece[] = []
  let sourceCursor = 0
  let displayCursor = 0

  const appendText = (text: string) => {
    pieces.push({
      sourceStart: sourceCursor,
      sourceEnd: sourceCursor + text.length,
      displayStart: displayCursor,
      displayLength: text.length,
      formula: false,
      sourceText: text,
      texStart: 0,
      texEnd: 0
    })
    sourceCursor += text.length
    displayCursor += text.length
  }

  for (const child of Array.from(editor.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = contentText(editor, child as Text)
      if (text) appendText(text)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const element = child as HTMLElement
    if (element.classList.contains('math-live')) {
      const sourceText = element.dataset.source ?? ''
      pieces.push({
        sourceStart: sourceCursor,
        sourceEnd: sourceCursor + sourceText.length,
        displayStart: displayCursor,
        displayLength: 1,
        formula: true,
        sourceText,
        texStart: Number(element.dataset.texStart ?? 0),
        texEnd: Number(element.dataset.texEnd ?? 0)
      })
      sourceCursor += sourceText.length
      displayCursor += 1
    } else {
      appendText(element.textContent ?? '')
    }
  }
  return pieces
}

function readSource(editor: HTMLElement): string {
  let source = ''
  for (const child of Array.from(editor.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      source += contentText(editor, child as Text)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const element = child as HTMLElement
    source += element.classList.contains('math-live')
      ? element.dataset.source ?? ''
      : element.textContent ?? ''
  }
  return source
}

function sourceOffsetForDisplay(displayOffset: number, pieces: Piece[], sourceLength: number): number {
  for (const piece of pieces) {
    const start = piece.displayStart
    const end = start + piece.displayLength
    if (displayOffset <= start) return piece.sourceStart
    if (displayOffset < end) {
      return piece.formula ? piece.sourceStart : piece.sourceStart + (displayOffset - start)
    }
    if (displayOffset === end) return piece.sourceEnd
  }
  return sourceLength
}

function displayOffsetForSource(sourceOffset: number, pieces: Piece[]): number {
  for (const piece of pieces) {
    if (sourceOffset < piece.sourceStart) return piece.displayStart
    if (sourceOffset === piece.sourceStart) return piece.displayStart
    if (sourceOffset < piece.sourceEnd) {
      return piece.formula
        ? piece.displayStart + 1
        : piece.displayStart + (sourceOffset - piece.sourceStart)
    }
    if (sourceOffset === piece.sourceEnd) return piece.displayStart + piece.displayLength
  }
  return pieces.length
    ? pieces[pieces.length - 1].displayStart + pieces[pieces.length - 1].displayLength
    : 0
}

function pointForDisplayOffset(editor: HTMLElement, offset: number): { node: Node; offset: number } {
  const children = Array.from(editor.childNodes)
  let remaining = Math.max(0, offset)
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    const size = nodeSize(child, editor)
    if (remaining === 0) {
      return child.nodeType === Node.TEXT_NODE
        ? { node: child, offset: 0 }
        : { node: editor, offset: i }
    }
    if (remaining < size) {
      return child.nodeType === Node.TEXT_NODE
        ? { node: child, offset: remaining }
        : { node: editor, offset: i }
    }
    if (remaining === size) {
      return child.nodeType === Node.TEXT_NODE
        ? { node: child, offset: size }
        : { node: editor, offset: i + 1 }
    }
    remaining -= size
  }
  return { node: editor, offset: children.length }
}

function setSelection(editor: HTMLElement, pieces: Piece[], start: number, end: number): void {
  const from = pointForDisplayOffset(editor, displayOffsetForSource(start, pieces))
  const to = pointForDisplayOffset(editor, displayOffsetForSource(end, pieces))
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  const selection = document.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
  const rect = range.getBoundingClientRect()
  const bounds = editor.getBoundingClientRect()
  if (rect.height > 0 && (rect.top < bounds.top || rect.bottom > bounds.bottom)) {
    editor.scrollTop += rect.top - bounds.top - (bounds.height - rect.height) / 2
  }
}

function buildDisplay(editor: HTMLElement, source: string, editing: boolean): Piece[] {
  editor.replaceChildren()
  const pieces: Piece[] = []
  let sourceCursor = 0
  let displayCursor = 0

  const appendText = (from: number, to: number) => {
    if (to <= from) return
    const text = source.slice(from, to)
    editor.appendChild(document.createTextNode(text))
    pieces.push({
      sourceStart: from,
      sourceEnd: to,
      displayStart: displayCursor,
      displayLength: text.length,
      formula: false,
      sourceText: text,
      texStart: 0,
      texEnd: 0
    })
    displayCursor += text.length
    sourceCursor = to
  }

  for (const span of mathSpans(source)) {
    if (span.start > sourceCursor) appendText(sourceCursor, span.start)
    const sourceText = source.slice(span.start, span.end)
    const texStart = source.indexOf(span.tex, span.start)
    const texEnd = texStart >= 0 ? texStart + span.tex.length : texStart
    const html = editing || texStart < 0 ? '' : formulaHtml(span.tex)
    if (html) {
      const element = document.createElement('span')
      element.className = 'math-live'
      element.contentEditable = 'false'
      element.dataset.source = sourceText
      element.dataset.tex = span.tex
      element.dataset.texStart = String(texStart)
      element.dataset.texEnd = String(texEnd)
      element.innerHTML = html
      editor.appendChild(element)
      pieces.push({
        sourceStart: span.start,
        sourceEnd: span.end,
        displayStart: displayCursor,
        displayLength: 1,
        formula: true,
        sourceText,
        texStart,
        texEnd
      })
      displayCursor += 1
      sourceCursor = span.end
    } else {
      appendText(span.start, span.end)
    }
  }
  if (sourceCursor < source.length) appendText(sourceCursor, source.length)
  editor.appendChild(document.createTextNode(SENTINEL))
  editor.dataset.empty = source.length ? 'false' : 'true'
  return pieces
}

function normalizeRange(editor: HTMLElement, range: Range): Range {
  const startFormula = formulaElementFor(range.startContainer)
  const endFormula = formulaElementFor(range.endContainer)
  let startNode: Node = range.startContainer
  let startOffset = range.startOffset
  let endNode: Node = range.endContainer
  let endOffset = range.endOffset

  if (startFormula && editor.contains(startFormula) && !(startNode === startFormula && startOffset === 0)) {
    const parent = startFormula.parentNode
    if (parent) {
      startNode = parent
      startOffset = Array.prototype.indexOf.call(parent.childNodes, startFormula)
    }
  }
  if (endFormula && editor.contains(endFormula) && !(endNode === endFormula && endOffset === 1)) {
    const parent = endFormula.parentNode
    if (parent) {
      endNode = parent
      endOffset = Array.prototype.indexOf.call(parent.childNodes, endFormula) + 1
    }
  }
  const normalized = document.createRange()
  normalized.setStart(startNode, startOffset)
  normalized.setEnd(endNode, endOffset)
  return normalized
}

function commonPrefix(from: string, to: string): number {
  const limit = Math.min(from.length, to.length)
  let index = 0
  while (index < limit && from.charCodeAt(index) === to.charCodeAt(index)) index += 1
  return index
}

export function MathNoteEditor({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder,
  className,
  autoFocus = true
}: MathNoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  const apiRef = useRef<EditorApi | null>(null)
  const propsRef = useRef({ onChange, onSave, onCancel })
  propsRef.current = { onChange, onSave, onCancel }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    let source = valueRef.current
    let pieces: Piece[] = []
    let showsSource = false
    let rebuilding = false
    let composing = false
    let pressed = false
    let suppressSelection = false
    let settleTimer: number | null = null
    let sourceTimer: number | null = null
    let focusTimer: number | null = null
    const undoStack: Array<{ source: string; caret: number }> = []
    const redoStack: Array<{ source: string; caret: number }> = []

    const clearSettle = () => {
      if (settleTimer != null) {
        window.clearTimeout(settleTimer)
        settleTimer = null
      }
    }

    const clearSourceWork = () => {
      if (sourceTimer != null) {
        window.clearTimeout(sourceTimer)
        sourceTimer = null
      }
    }

    const applyDisplay = (editing: boolean, selection: SelectionRange) => {
      clearSourceWork()
      rebuilding = true
      pieces = buildDisplay(editor, source, editing)
      showsSource = editing
      setSelection(editor, pieces, selection.start, selection.end)
      rebuilding = false
    }

    const adopt = () => {
      const next = readSource(editor)
      if (next === source) return
      undoStack.push({ source, caret: commonPrefix(source, next) })
      if (undoStack.length > 300) undoStack.shift()
      redoStack.length = 0
      source = next
      valueRef.current = next
      editor.dataset.empty = source.length ? 'false' : 'true'
      propsRef.current.onChange(next)
    }

    const touchesFormula = (selection: SelectionRange): boolean => {
      for (const span of mathSpans(source)) {
        if (selection.start === selection.end) {
          if (selection.start >= span.start && selection.start <= span.end) return true
        } else if (selection.start < span.end && selection.end > span.start) {
          return true
        }
      }
      return false
    }

    const currentSelection = (): SelectionRange | null => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0) return null
      const range = selection.getRangeAt(0)
      if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null
      const snapshot = snapshotPieces(editor)
      const startDisplay = displayOffsetFor(editor, range.startContainer, range.startOffset)
      const endDisplay = displayOffsetFor(editor, range.endContainer, range.endOffset)
      if (startDisplay == null || endDisplay == null) return null
      const length = snapshot.reduce((sum, piece) => sum + piece.sourceText.length, 0)
      const start = sourceOffsetForDisplay(startDisplay, snapshot, length)
      const end = sourceOffsetForDisplay(endDisplay, snapshot, length)
      return { start: Math.min(start, end), end: Math.max(start, end) }
    }

    const scheduleSettle = () => {
      clearSettle()
      settleTimer = window.setTimeout(settle, 200)
    }

    const settle = () => {
      settleTimer = null
      if (rebuilding || composing) return
      if (pressed) {
        scheduleSettle()
        return
      }
      if (document.activeElement !== editor) return
      adopt()
      const selection = currentSelection()
      if (!selection || touchesFormula(selection)) return
      const attached = snapshotPieces(editor).filter((piece) => piece.formula).length
      const available = mathSpans(source).filter((span) => formulaHtml(span.tex) !== '').length
      if (showsSource || attached < available) applyDisplay(false, selection)
    }

    const showSourceIfTouchesFormula = () => {
      sourceTimer = null
      if (rebuilding || composing || showsSource) return
      if (pressed || document.activeElement !== editor) return
      adopt()
      const selection = currentSelection()
      if (!selection || !touchesFormula(selection)) return
      clearSettle()
      applyDisplay(true, selection)
    }

    const scheduleSource = () => {
      clearSourceWork()
      sourceTimer = window.setTimeout(showSourceIfTouchesFormula, 0)
    }

    const ensureSentinel = () => {
      let last: Node | null = editor.lastChild
      while (last && last.nodeType === Node.TEXT_NODE && (last as Text).data === '') last = last.previousSibling
      if (last && last.nodeType === Node.TEXT_NODE && (last as Text).data.endsWith(SENTINEL)) return
      editor.appendChild(document.createTextNode(SENTINEL))
    }

    const mutate = () => {
      if (rebuilding || composing) return
      ensureSentinel()
      adopt()
      const selection = currentSelection()
      if (!selection) return
      if (touchesFormula(selection)) {
        clearSettle()
        if (!showsSource) scheduleSource()
      } else {
        scheduleSettle()
      }
    }

    const selectionChanged = () => {
      if (rebuilding || composing || pressed || suppressSelection) return
      adopt()
      const selection = currentSelection()
      if (!selection) return
      if (touchesFormula(selection)) {
        clearSettle()
        if (!showsSource) scheduleSource()
      } else if (showsSource) {
        scheduleSettle()
      }
    }

    const restore = (text: string, caret: number) => {
      source = text
      valueRef.current = text
      propsRef.current.onChange(text)
      const selection = {
        start: Math.min(Math.max(0, caret), text.length),
        end: Math.min(Math.max(0, caret), text.length)
      }
      applyDisplay(touchesFormula(selection), selection)
      if (document.activeElement !== editor) editor.focus()
    }

    const undo = (): boolean => {
      if (document.activeElement !== editor) return false
      adopt()
      const entry = undoStack.pop()
      if (!entry) return false
      const selection = currentSelection()
      redoStack.push({ source, caret: selection?.start ?? source.length })
      restore(entry.source, entry.caret)
      return true
    }

    const redo = (): boolean => {
      if (document.activeElement !== editor) return false
      const entry = redoStack.pop()
      if (!entry) return false
      const selection = currentSelection()
      undoStack.push({ source, caret: selection?.start ?? source.length })
      restore(entry.source, entry.caret)
      return true
    }

    const expandFormula = (formula: HTMLElement, fraction: number) => {
      adopt()
      const snapshot = snapshotPieces(editor)
      let display = 0
      for (const child of Array.from(editor.childNodes)) {
        if (child === formula) break
        display += nodeSize(child, editor)
      }
      const piece = snapshot.find((entry) => entry.formula && entry.displayStart === display)
      if (!piece) return
      const tex = formula.dataset.tex ?? ''
      const located = tex ? source.indexOf(tex, piece.sourceStart) : -1
      const texStart = located >= 0 && located + tex.length <= piece.sourceEnd
        ? located
        : piece.sourceStart
      const offset = texStart + Math.round(Math.min(1, Math.max(0, fraction)) * tex.length)
      clearSettle()
      applyDisplay(true, { start: offset, end: offset })
      editor.focus()
    }

    const insertText = (text: string) => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0) return
      if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return
      const range = normalizeRange(editor, selection.getRangeAt(0))
      range.deleteContents()
      const node = document.createTextNode(text)
      range.insertNode(node)
      const caret = document.createRange()
      caret.setStart(node, node.data.length)
      caret.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caret)
      mutate()
    }

    /// A key or paste event restores Blink's own caret once its handlers return, so content the
    /// editor inserts itself is written just after the event — where nothing can move the caret
    /// back behind the new text.
    const queueInsert = (text: string) => {
      window.setTimeout(() => insertText(text), 0)
    }

    const deleteSelection = () => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const range = normalizeRange(editor, selection.getRangeAt(0))
      range.deleteContents()
      const caret = document.createRange()
      caret.setStart(range.startContainer, range.startOffset)
      caret.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caret)
      mutate()
    }

    const copy = (event: ClipboardEvent, cut: boolean) => {
      const selection = currentSelection()
      if (!selection || selection.start === selection.end) return
      const text = source.slice(selection.start, selection.end)
      event.preventDefault()
      if (event.clipboardData) event.clipboardData.setData('text/plain', text)
      else void navigator.clipboard?.writeText(text)
      if (cut) deleteSelection()
    }

    const paste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain')
      if (!text) return
      event.preventDefault()
      queueInsert(text.replace(/\r\n?/g, '\n'))
    }

    const mouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const formula = formulaElementFor(target)
      if (!formula || !editor.contains(formula)) return
      event.preventDefault()
      clearSettle()
      clearSourceWork()
      const rect = formula.getBoundingClientRect()
      const fraction = rect.width > 0
        ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        : 0.5
      expandFormula(formula, fraction)
    }

    const keyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const mod = event.metaKey || event.ctrlKey
      if (event.key === 'Escape') {
        event.preventDefault()
        clearSettle()
        clearSourceWork()
        propsRef.current.onCancel()
        return
      }
      if (event.key === 'Enter' && mod) {
        event.preventDefault()
        adopt()
        if (source.trim()) propsRef.current.onSave()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        queueInsert('\n')
        return
      }
      if (mod && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }

    const onMouseDown = () => {
      pressed = true
    }
    const onMouseUp = () => {
      if (!pressed) return
      pressed = false
      selectionChanged()
    }
    const onSelectionChange = () => {
      selectionChanged()
    }

    const focusEditor = (tries: number) => {
      if (document.activeElement !== editor) editor.focus()
      if (document.activeElement !== editor && tries < 4) {
        focusTimer = window.setTimeout(() => focusEditor(tries + 1), 100)
        return
      }
      suppressSelection = true
      setSelection(editor, pieces, source.length, source.length)
      window.setTimeout(() => {
        suppressSelection = false
      }, 0)
    }

    applyDisplay(false, { start: source.length, end: source.length })
    if (autoFocus) focusTimer = window.setTimeout(() => focusEditor(0), 80)

    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mouseup', onMouseUp, true)
    const unregister = registerMathEditor({ undo, redo })

    apiRef.current = {
      input: mutate,
      keyDown,
      paste,
      copy,
      mouseDown,
      compositionStart: () => {
        composing = true
      },
      compositionEnd: () => {
        composing = false
        mutate()
      },
      insert: insertText,
      queue: queueInsert,
      reflect: (next) => {
        if (next === source) return
        undoStack.length = 0
        redoStack.length = 0
        source = next
        valueRef.current = next
        applyDisplay(false, { start: source.length, end: source.length })
        if (document.activeElement === editor) editor.focus()
      }
    }

    return () => {
      clearSettle()
      clearSourceWork()
      if (focusTimer != null) window.clearTimeout(focusTimer)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      unregister()
      apiRef.current = null
    }
    // The editor owns its DOM; the mount effect wires it to the store and never rebuilds on props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (value === valueRef.current) return
    apiRef.current?.reflect(value)
  }, [value])

  return (
    <div
      ref={editorRef}
      className={className ? `note-input ${className}` : 'note-input'}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder ?? ''}
      data-empty="true"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      onInput={() => apiRef.current?.input()}
      onKeyDown={(event) => apiRef.current?.keyDown(event.nativeEvent)}
      onPaste={(event) => apiRef.current?.paste(event.nativeEvent)}
      onCopy={(event) => apiRef.current?.copy(event.nativeEvent, false)}
      onCut={(event) => apiRef.current?.copy(event.nativeEvent, true)}
      onMouseDown={(event) => apiRef.current?.mouseDown(event.nativeEvent)}
      onCompositionStart={() => apiRef.current?.compositionStart()}
      onCompositionEnd={() => apiRef.current?.compositionEnd()}
      onDrop={(event) => {
        event.preventDefault()
        const text = event.dataTransfer.getData('text/plain')
        if (text) apiRef.current?.queue(text.replace(/\r\n?/g, '\n'))
      }}
    />
  )
}

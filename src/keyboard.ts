import { useEffect, useRef } from 'react'
import { useAppStore } from './store'
import { visibleShelf } from './lib/library'

function isHelpKey(event: KeyboardEvent): boolean {
  return event.key === '?' || event.key === '？' || (event.code === 'Slash' && event.shiftKey)
}

function isSlashKey(event: KeyboardEvent): boolean {
  return event.key === '/' || event.key === '／' || (event.code === 'Slash' && !event.shiftKey)
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return Boolean(target?.closest('input, textarea, [contenteditable="true"]'))
}

export function useGlobalKeyboard(): void {
  const lastG = useRef(0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key === 'Process') return
      const state = useAppStore.getState()

      if (event.key === 'Escape') {
        if (state.noteEditor) {
          state.cancelNote()
          event.preventDefault()
          return
        }
        if (state.deckEditing) {
          state.cancelCardEditing()
          event.preventDefault()
          return
        }
        if (state.dialog) {
          state.setDialog(null)
          event.preventDefault()
          return
        }
        if (state.search.open) {
          state.closeSearch()
          event.preventDefault()
          return
        }
        if (state.libraryPanel) {
          state.setLibraryPanel(null)
          event.preventDefault()
          return
        }
        if (state.notePopupId) {
          state.closeNotePopup()
          event.preventDefault()
          return
        }
        if (state.page === 'reader' && state.tocOpen) {
          state.toggleToc()
          event.preventDefault()
          return
        }
        if (state.annotationsOpen) {
          state.toggleAnnotations()
          event.preventDefault()
        }
        return
      }

      if (state.noteEditor) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          if (state.noteEditor.draft.trim()) state.saveNote()
          event.preventDefault()
        }
        return
      }

      if (state.deckEditing) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          if (state.deckEditing.draft.trim()) state.saveCardEditing()
          event.preventDefault()
        }
        return
      }

      if (state.dialog) {
        if (isHelpKey(event) && state.dialog === 'shortcuts') {
          state.setDialog(null)
          event.preventDefault()
        }
        return
      }

      if (isTyping(event)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (state.loadingLabel) return

      if (state.page === 'library') {
        handleLibrary(event, state)
        return
      }
      if (!state.doc) return
      if (state.page === 'deck') {
        handleDeck(event, state)
        return
      }
      if (state.page === 'reader') handleReader(event, state, lastG)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

type Store = ReturnType<typeof useAppStore.getState>

function handleLibrary(event: KeyboardEvent, state: Store): void {
  const visible = visibleShelf(state.shelf, state.libraryQuery, state.sort)
  const forward = event.key === 'ArrowDown' || event.code === 'KeyJ'
  const backward = event.key === 'ArrowUp' || event.code === 'KeyK'
  const right = event.key === 'ArrowRight' || event.code === 'KeyL'
  const left = event.key === 'ArrowLeft' || event.code === 'KeyH'
  const grid = state.viewMode === 'grid'

  if ((forward || backward || right || left) && visible.length) {
    let index = visible.findIndex((item) => item.id === state.selectedId)
    if (index < 0) index = 0
    const step = grid ? 4 : 1
    if (forward) index += step
    if (backward) index -= step
    if (right && grid) index += 1
    if (left && grid) index -= 1
    if (right && !grid) return
    if (left && !grid) return
    index = Math.max(0, Math.min(visible.length - 1, index))
    const next = visible[index]
    if (next && next.id !== state.selectedId) state.selectItem(next.id)
    event.preventDefault()
    return
  }

  if (event.key === 'Enter') {
    const item = visible.find((entry) => entry.id === state.selectedId)
    if (item) {
      state.selectItem(item.id)
      void state.openShelfItem(item)
    }
    event.preventDefault()
    return
  }

  if (isHelpKey(event)) {
    state.setDialog('set-default')
    event.preventDefault()
    return
  }

  switch (event.code) {
    case 'KeyO':
      void state.openPdfDialog()
      break
    case 'KeyF':
      state.setLibraryPanel(state.libraryPanel === 'search' ? null : 'search')
      break
    case 'KeyV':
      state.setViewMode(state.viewMode === 'grid' ? 'list' : 'grid')
      break
    case 'KeyN':
      void state.openSelectedDeck()
      break
    case 'KeyX': {
      const item = visible.find((entry) => entry.id === state.selectedId)
      if (item) {
        state.selectItem(item.id)
        state.setDialog('remove')
      }
      break
    }
    case 'KeyM':
      state.toggleLanguage()
      break
    default:
      return
  }
  event.preventDefault()
}

function handleReader(event: KeyboardEvent, state: Store, lastG: { current: number }): void {
  const doc = state.doc
  if (!doc) return
  const code = event.code

  if (event.key === 'ArrowDown' || code === 'KeyJ') {
    state.nextParagraph()
  } else if (event.key === 'ArrowUp' || code === 'KeyK') {
    state.previousParagraph()
  } else if (event.key === 'ArrowRight' || code === 'KeyD') {
    state.nextPage()
  } else if (event.key === 'ArrowLeft' || code === 'KeyU') {
    state.previousPage()
  } else if (code === 'BracketLeft' || event.key === '【') {
    state.previousSection()
  } else if (code === 'BracketRight' || event.key === '】') {
    state.nextSection()
  } else if (code === 'KeyG') {
    if (event.shiftKey || event.key === 'G') {
      state.goLast()
    } else {
      const now = Date.now()
      if (now - lastG.current < 400) {
        state.goFirst()
        lastG.current = 0
      } else {
        lastG.current = now
      }
    }
  } else if (code === 'KeyT') {
    state.toggleToc()
  } else if (code === 'KeyB') {
    state.toggleAnnotations()
  } else if (code === 'KeyF') {
    if (state.search.open) state.closeSearch()
    else state.openSearch()
  } else if (code === 'KeyN') {
    state.startNote()
  } else if (code === 'KeyH') {
    state.toggleHighlight()
  } else if (code === 'KeyX') {
    state.deleteCurrentAnnotation()
  } else if (code === 'KeyZ') {
    state.undo()
  } else if (code === 'KeyC') {
    void state.copyParagraph()
  } else if (code === 'KeyP') {
    state.speakParagraph()
  } else if (code === 'KeyE') {
    void state.exportNotes()
  } else if (code === 'KeyO') {
    void state.openPdfDialog()
  } else if (code === 'KeyQ') {
    state.closeDocument()
  } else if (event.key === 'Enter') {
    if (state.search.open && state.search.executed) state.nextSearchResult()
    else return
  } else if (isHelpKey(event) || isSlashKey(event)) {
    state.setDialog('shortcuts')
  } else {
    return
  }
  event.preventDefault()
}

function handleDeck(event: KeyboardEvent, state: Store): void {
  const code = event.code
  if (event.key === 'ArrowDown' || code === 'KeyJ') {
    state.nextCard()
  } else if (event.key === 'ArrowUp' || code === 'KeyK') {
    state.previousCard()
  } else if (code === 'KeyG') {
    if (event.shiftKey || event.key === 'G') state.lastCard()
    else {
      const now = Date.now()
      if (now - lastGDeck.current < 400) {
        state.firstCard()
        lastGDeck.current = 0
      } else {
        lastGDeck.current = now
      }
    }
  } else if (code === 'KeyN') {
    state.startCardEditing()
  } else if (code === 'KeyB') {
    state.toggleAnnotations()
  } else if (code === 'KeyF') {
    if (state.search.open) state.closeSearch()
    else state.openSearch()
  } else if (code === 'KeyQ') {
    state.closeDeck()
  } else if (event.key === 'Enter') {
    if (state.search.open && state.search.executed) state.nextSearchResult()
    else return
  } else if (isHelpKey(event) || isSlashKey(event)) {
    state.setDialog('shortcuts')
  } else {
    return
  }
  event.preventDefault()
}

const lastGDeck = { current: 0 }

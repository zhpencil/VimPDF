import { create } from 'zustand'
import type {
  Annotation,
  AppInfo,
  Language,
  OpenDocument,
  PdfReadResult,
  ShelfItem,
  ShelfViewMode,
  SortKey,
  TocItem
} from './types'
import { translate } from './i18n'
import { detectDocument, loadPdf, readMetadataTitle, renderCover, titleFromPath } from './lib/pdf'
import { buildToc } from './lib/toc'
import { buildMarkdown } from './lib/markdown'
import { fileStem } from './lib/library'
import { isSpeaking, speak, stopSpeech } from './lib/speech'

export type PageName = 'library' | 'reader' | 'deck'
export type DialogName = 'shortcuts' | 'about' | 'set-default' | 'remove' | null

export interface SearchState {
  open: boolean
  query: string
  executed: string
  readerResults: number[]
  readerIndex: number
  deckResults: string[]
  deckIndex: number
  matchParagraph: number | null
}

interface NoteEditorState {
  id: string | null
  paragraphIndex: number
  draft: string
}

interface StatusMessage {
  text: string
  seq: number
}

interface UndoEntry {
  kind: 'added' | 'removed'
  annotation: Annotation
}

export interface AppStore {
  booted: boolean
  info: AppInfo | null
  language: Language
  page: PageName
  shelf: ShelfItem[]
  selectedId: number | null
  selectionSeq: number
  viewMode: ShelfViewMode
  sort: SortKey
  libraryQuery: string
  libraryPanel: 'search' | 'sort' | null
  doc: OpenDocument | null
  loadingLabel: string | null
  errorKind: 'notext' | null
  scrollSeq: number
  scrollMode: 'auto' | 'smooth'
  zoom: number
  tocOpen: boolean
  annotationsOpen: boolean
  dialog: DialogName
  noteEditor: NoteEditorState | null
  notePopupId: string | null
  noteCardId: string | null
  deckEditing: { draft: string } | null
  search: SearchState
  status: StatusMessage | null
  fullScreen: boolean
  undoStack: UndoEntry[]

  boot: () => Promise<void>
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  setStatus: (text: string | null) => void
  refreshShelf: (preferredId?: number | null) => Promise<void>
  selectItem: (id: number) => void
  setViewMode: (mode: ShelfViewMode) => void
  setSort: (sort: SortKey) => void
  setLibraryQuery: (query: string) => void
  setLibraryPanel: (panel: 'search' | 'sort' | null) => void
  openPdfDialog: () => Promise<void>
  openPath: (path: string) => Promise<void>
  openShelfItem: (item: ShelfItem) => Promise<void>
  openShelfDeck: (item: ShelfItem) => Promise<void>
  openSelectedDeck: () => Promise<void>
  removeShelfItem: (item: ShelfItem) => Promise<void>
  closeDocument: () => void
  setFocus: (index: number, mode?: 'auto' | 'smooth') => void
  nextParagraph: () => void
  previousParagraph: () => void
  nextPage: () => void
  previousPage: () => void
  nextSection: () => void
  previousSection: () => void
  goFirst: () => void
  goLast: () => void
  toggleToc: () => void
  toggleAnnotations: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  openSearch: () => void
  closeSearch: () => void
  setSearchQuery: (query: string) => void
  submitSearch: () => void
  nextSearchResult: () => void
  previousSearchResult: () => void
  startNote: () => void
  editNote: (id: string) => void
  setNoteDraft: (draft: string) => void
  saveNote: () => void
  cancelNote: () => void
  toggleHighlight: () => void
  deleteCurrentAnnotation: () => void
  deleteAnnotation: (id: string) => void
  openNotePopup: (id: string) => void
  closeNotePopup: () => void
  undo: () => void
  copyParagraph: () => Promise<void>
  speakParagraph: () => void
  exportNotes: () => Promise<void>
  openDeck: () => void
  closeDeck: () => void
  selectCard: (id: string) => void
  nextCard: () => void
  previousCard: () => void
  firstCard: () => void
  lastCard: () => void
  startCardEditing: () => void
  setCardDraft: (draft: string) => void
  saveCardEditing: () => void
  cancelCardEditing: () => void
  setDialog: (dialog: DialogName) => void
  confirmRemove: () => Promise<void>
  setDefaultReader: () => Promise<void>
  handleMenuCommand: (command: string) => void
  handleLanguageChange: (language: Language) => void
  handleOpenPath: (path: string) => void
  setFullScreen: (fullScreen: boolean) => void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

let openToken = 0
let positionTimer: ReturnType<typeof setTimeout> | null = null
let pendingPosition: { documentId: number; paragraph: number; page: number } | null = null
let zoomTimer: ReturnType<typeof setTimeout> | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampZoom(value: number): number {
  return clamp(Math.round(value * 10) / 10, MIN_ZOOM, MAX_ZOOM)
}

function emptySearch(): SearchState {
  return {
    open: false,
    query: '',
    executed: '',
    readerResults: [],
    readerIndex: 0,
    deckResults: [],
    deckIndex: 0,
    matchParagraph: null
  }
}

function sortedCards(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort((a, b) =>
    a.paragraphIndex === b.paragraphIndex
      ? a.createdAt - b.createdAt
      : a.paragraphIndex - b.paragraphIndex
  )
}

function sectionStarts(doc: OpenDocument): number[] {
  return [...new Set(
    doc.toc.filter((item) => item.paragraphIndex >= 0).map((item) => item.paragraphIndex)
  )].sort((a, b) => a - b)
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  const lower = haystack.toLowerCase()
  let count = 0
  let from = 0
  for (;;) {
    const at = lower.indexOf(needle, from)
    if (at < 0) return count
    count += 1
    from = at + needle.length
  }
}

function schedulePosition(documentId: number, paragraph: number, page: number): void {
  pendingPosition = { documentId, paragraph, page }
  if (positionTimer) clearTimeout(positionTimer)
  positionTimer = setTimeout(() => flushPosition(), 300)
}

function flushPosition(): void {
  if (positionTimer) {
    clearTimeout(positionTimer)
    positionTimer = null
  }
  if (!pendingPosition) return
  const payload = pendingPosition
  pendingPosition = null
  void window.vimpdf.library.savePosition({
    documentId: payload.documentId,
    paragraph: payload.paragraph,
    page: payload.page
  })
}

function scheduleZoom(documentId: number, zoom: number): void {
  if (zoomTimer) clearTimeout(zoomTimer)
  zoomTimer = setTimeout(() => {
    zoomTimer = null
    void window.vimpdf.library.saveZoom({ documentId, zoom })
  }, 250)
}

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'notes'
}

export const useAppStore = create<AppStore>((set, get) => {
  const t = (key: string, ...args: Array<string | number>) => translate(get().language, key, ...args)

  const patchSearch = (patch: Partial<SearchState>) => {
    set({ search: { ...get().search, ...patch } })
  }

  const setStatus = (text: string | null) => {
    if (!text) {
      set({ status: null })
      return
    }
    set({ status: { text, seq: (get().status?.seq ?? 0) + 1 } })
  }

  const currentParagraph = () => {
    const doc = get().doc
    if (!doc || !doc.paragraphs.length) return null
    return doc.paragraphs[clamp(doc.focus, 0, doc.paragraphs.length - 1)] ?? null
  }

  const refreshShelf = async (preferredId?: number | null) => {
    const shelf = await window.vimpdf.library.list()
    const wanted = preferredId !== undefined ? preferredId : get().selectedId
    let selectedId: number | null = wanted != null && shelf.some((item) => item.id === wanted)
      ? wanted
      : shelf[0]?.id ?? null
    if (selectedId == null) selectedId = shelf[0]?.id ?? null
    set({ shelf, selectedId })
  }

  const reselectCard = (previousId: string | null, fallbackIndex: number) => {
    const doc = get().doc
    if (!doc) return
    const cards = sortedCards(doc.annotations)
    if (!cards.length) {
      set({ noteCardId: null })
      return
    }
    const index = previousId
      ? cards.findIndex((card) => card.id === previousId)
      : -1
    const next = cards[clamp(index >= 0 ? index : fallbackIndex, 0, cards.length - 1)]
    set({ noteCardId: next.id, doc: { ...get().doc!, focus: next.paragraphIndex } })
    void window.vimpdf.library.saveNoteCard({ documentId: doc.documentId, annotationId: next.id })
  }

  const removeAnnotationEntity = (annotation: Annotation, undoable: boolean) => {
    const doc = get().doc
    if (!doc || !doc.annotations.some((item) => item.id === annotation.id)) return
    const cardsBefore = sortedCards(doc.annotations)
    const fallbackIndex = Math.max(0, cardsBefore.findIndex((card) => card.id === annotation.id))
    const annotations = doc.annotations.filter((item) => item.id !== annotation.id)
    const wasCurrentCard = get().noteCardId === annotation.id
    set({
      doc: { ...doc, annotations },
      notePopupId: get().notePopupId === annotation.id ? null : get().notePopupId,
      noteEditor: get().noteEditor?.id === annotation.id ? null : get().noteEditor,
      deckEditing: wasCurrentCard ? null : get().deckEditing,
      undoStack: undoable ? [...get().undoStack, { kind: 'removed', annotation }] : get().undoStack
    })
    void window.vimpdf.annotations.remove(annotation.id)
    if (get().page === 'deck' && wasCurrentCard) reselectCard(null, fallbackIndex)
  }

  const addAnnotation = (annotation: Annotation) => {
    const doc = get().doc
    if (!doc) return
    set({
      doc: { ...doc, annotations: [...doc.annotations, annotation] },
      undoStack: [...get().undoStack, { kind: 'added', annotation }]
    })
    void window.vimpdf.annotations.upsert({
      documentId: doc.documentId,
      annotation,
      anchor: doc.paragraphs[annotation.paragraphIndex]?.searchKey ?? ''
    })
  }

  const setFocus = (index: number, mode: 'auto' | 'smooth' = 'smooth') => {
    const doc = get().doc
    if (!doc || !doc.paragraphs.length) return
    const focus = clamp(index, 0, doc.paragraphs.length - 1)
    set({
      doc: { ...doc, focus },
      scrollSeq: get().scrollSeq + 1,
      scrollMode: mode,
      notePopupId: null
    })
    schedulePosition(doc.documentId, focus, doc.paragraphs[focus].pageIndex)
  }

  const jumpToPage = (delta: number) => {
    const doc = get().doc
    if (!doc) return
    const paragraph = currentParagraph()
    if (!paragraph) return
    const targetPage = clamp(paragraph.pageIndex + delta, 0, doc.pageCount - 1)
    if (targetPage === paragraph.pageIndex) return
    const candidates = doc.paragraphs
    const forward = delta > 0
    let target: number | null = null
    for (let page = targetPage; forward ? page < doc.pageCount : page >= 0; page += forward ? 1 : -1) {
      const found = candidates.find((item) => item.pageIndex === page)
      if (found) {
        target = found.index
        break
      }
    }
    if (target != null) setFocus(target)
  }

  const zoomTo = (zoom: number) => {
    const doc = get().doc
    if (!doc || get().page !== 'reader') return
    const next = clampZoom(zoom)
    set({ zoom: next })
    scheduleZoom(doc.documentId, next)
    setStatus(t('Zoom %d%%', Math.round(next * 100)))
  }

  const selectCard = (id: string) => {
    const doc = get().doc
    if (!doc) return
    const card = doc.annotations.find((annotation) => annotation.id === id)
    if (!card) return
    if (get().deckEditing && get().noteCardId !== id) {
      set({ deckEditing: null })
    }
    set({
      noteCardId: id,
      doc: { ...doc, focus: card.paragraphIndex }
    })
    void window.vimpdf.library.saveNoteCard({ documentId: doc.documentId, annotationId: id })
  }

  const moveCard = (delta: number) => {
    const doc = get().doc
    if (!doc) return
    const cards = sortedCards(doc.annotations)
    if (!cards.length) return
    const index = cards.findIndex((card) => card.id === get().noteCardId)
    const target = index < 0
      ? (delta > 0 ? 0 : cards.length - 1)
      : clamp(index + delta, 0, cards.length - 1)
    selectCard(cards[target].id)
  }

  const moveSearch = (delta: number) => {
    const { doc, page, search } = get()
    if (!doc || !search.executed) return
    if (page === 'deck') {
      if (!search.deckResults.length) return
      const length = search.deckResults.length
      const index = (search.deckIndex + delta + length) % length
      patchSearch({ deckIndex: index })
      selectCard(search.deckResults[index])
      return
    }
    if (!search.readerResults.length) return
    const length = search.readerResults.length
    const index = (search.readerIndex + delta + length) % length
    patchSearch({ readerIndex: index, matchParagraph: search.readerResults[index] })
    setFocus(search.readerResults[index])
  }

  const openReadResult = async (result: PdfReadResult, target: 'reader' | 'deck') => {
    flushPosition()
    const token = ++openToken
    const previous = get().doc
    const previousPage = get().page
    set({
      loadingLabel: t('Loading document...'),
      errorKind: null,
      page: previous ? previousPage : 'reader',
      dialog: null,
      noteEditor: null,
      notePopupId: null,
      deckEditing: null
    })

    try {
      const pdf = await loadPdf(result.bytes)
      if (token !== openToken) {
        void pdf.loadingTask.destroy()
        return
      }
      set({ loadingLabel: t('Detecting paragraphs…') })
      const detected = await detectDocument(pdf)
      if (token !== openToken) {
        void pdf.loadingTask.destroy()
        return
      }
      const metadataTitle = await readMetadataTitle(pdf)
      const title = metadataTitle || titleFromPath(result.path)

      const registration = await window.vimpdf.library.register({
        filePath: result.path,
        pageCount: detected.pageCount,
        title
      })
      if (token !== openToken) {
        void pdf.loadingTask.destroy()
        return
      }
      if ('error' in registration || !registration.documentId) {
        throw new Error(registration && 'error' in registration ? registration.error : 'register')
      }
      const documentId = registration.documentId

      const [savedAnnotations, lastPosition, savedZoom, savedCard] = await Promise.all([
        window.vimpdf.annotations.list(documentId),
        window.vimpdf.library.lastPosition(documentId),
        window.vimpdf.library.getZoom(documentId),
        window.vimpdf.library.getNoteCard(documentId)
      ])
      if (token !== openToken) {
        void pdf.loadingTask.destroy()
        return
      }

      const paragraphs = detected.paragraphs
      const annotations: Annotation[] = []
      for (const saved of savedAnnotations) {
        let index = -1
        if (saved.anchor) {
          const hit = paragraphs.findIndex((paragraph) => paragraph.searchKey === saved.anchor)
          if (hit >= 0) index = hit
        }
        if (index < 0 && saved.paragraphIndex >= 0 && saved.paragraphIndex < paragraphs.length) {
          index = saved.paragraphIndex
        }
        if (index < 0) {
          void window.vimpdf.annotations.remove(saved.id)
          continue
        }
        annotations.push({ ...saved, paragraphIndex: index, pageIndex: paragraphs[index].pageIndex })
      }

      const toc = await buildToc(pdf, paragraphs)
      if (token !== openToken) {
        void pdf.loadingTask.destroy()
        return
      }

      const focus = clamp(lastPosition?.paragraph ?? 0, 0, Math.max(0, paragraphs.length - 1))
      const zoom = clampZoom(savedZoom ?? 1)
      const cards = sortedCards(annotations)
      const noteCardId = savedCard && cards.some((card) => card.id === savedCard)
        ? savedCard
        : cards[0]?.id ?? null
      const focusedCard = target === 'deck' && noteCardId
        ? annotations.find((annotation) => annotation.id === noteCardId)
        : null

      const doc: OpenDocument = {
        pdf,
        documentId,
        path: result.path,
        name: result.name,
        title,
        pageCount: detected.pageCount,
        paragraphs,
        paragraphsByPage: detected.paragraphsByPage,
        toc,
        annotations,
        focus: focusedCard ? focusedCard.paragraphIndex : focus,
        zoom,
        fitScale: 1,
        pageWidth: detected.pageWidth,
        pageHeight: detected.pageHeight
      }

      if (previous) {
        flushPosition()
        const oldPdf = previous.pdf
        setTimeout(() => { void oldPdf.loadingTask.destroy() }, 80)
      }

      set({
        doc,
        page: target === 'deck' ? 'deck' : 'reader',
        errorKind: detected.hasText ? null : 'notext',
        loadingLabel: null,
        zoom,
        scrollSeq: 0,
        scrollMode: 'auto',
        tocOpen: false,
        annotationsOpen: false,
        noteCardId,
        deckEditing: null,
        search: emptySearch(),
        undoStack: []
      })

      await refreshShelf(documentId)
      if (target === 'deck' && noteCardId) {
        void window.vimpdf.library.saveNoteCard({ documentId, annotationId: noteCardId })
      }
      if (detected.hasText) {
        void (async () => {
          const fresh = get().shelf.find((item) => item.id === documentId)
          if (fresh?.coverUrl || get().doc?.documentId !== documentId) return
          const dataUrl = await renderCover(pdf)
          if (!dataUrl || get().doc?.documentId !== documentId) return
          const response = await window.vimpdf.library.setCover({ documentId, dataUrl })
          if (response.coverUrl) void get().refreshShelf(documentId)
        })()
      }
    } catch {
      if (token !== openToken) return
      set({
        loadingLabel: null,
        page: previous ? previousPage : 'library',
        errorKind: previous ? get().errorKind : null
      })
      setStatus(t('Cannot open %@', result.name))
      void refreshShelf()
    }
  }

  const openResolvedPath = async (path: string, target: 'reader' | 'deck') => {
    const resolved = await window.vimpdf.library.resolve(path)
    if (!resolved || 'error' in resolved) {
      setStatus(t('File is no longer available'))
      void refreshShelf()
      return
    }
    await openReadResult(resolved, target)
  }

  return {
    booted: false,
    info: null,
    language: 'en',
    page: 'library',
    shelf: [],
    selectedId: null,
    selectionSeq: 0,
    viewMode: 'grid',
    sort: 'recent',
    libraryQuery: '',
    libraryPanel: null,
    doc: null,
    loadingLabel: null,
    errorKind: null,
    scrollSeq: 0,
    scrollMode: 'auto',
    zoom: 1,
    tocOpen: false,
    annotationsOpen: false,
    dialog: null,
    noteEditor: null,
    notePopupId: null,
    noteCardId: null,
    deckEditing: null,
    search: emptySearch(),
    status: null,
    fullScreen: false,
    undoStack: [],

    boot: async () => {
      if (get().booted) return
      const [info, settings, shelf, fullScreen] = await Promise.all([
        window.vimpdf.app.info(),
        window.vimpdf.app.getSettings(),
        window.vimpdf.library.list(),
        window.vimpdf.window.isFullScreen()
      ])
      document.documentElement.dataset.platform = info.platform
      document.documentElement.lang = settings.language === 'zh' ? 'zh-CN' : 'en'
      set({
        booted: true,
        info,
        language: settings.language,
        viewMode: settings.shelfViewMode,
        shelf,
        selectedId: shelf[0]?.id ?? null,
        fullScreen,
        sort: 'recent'
      })
      if (info.migratedFrom) setStatus(translate(settings.language, 'Imported your macOS library'))
    },

    setLanguage: (language) => {
      if (get().language === language) return
      set({ language })
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
      void window.vimpdf.app.updateSettings({ language })
    },

    toggleLanguage: () => {
      get().setLanguage(get().language === 'zh' ? 'en' : 'zh')
    },

    setStatus,

    refreshShelf,

    selectItem: (id) => set({ selectedId: id, selectionSeq: get().selectionSeq + 1 }),

    setViewMode: (mode) => {
      set({ viewMode: mode })
      void window.vimpdf.app.updateSettings({ shelfViewMode: mode })
    },

    setSort: (sort) => set({ sort, libraryPanel: null }),

    setLibraryQuery: (libraryQuery) => set({ libraryQuery }),

    setLibraryPanel: (libraryPanel) => set({ libraryPanel }),

    openPdfDialog: async () => {
      const result = await window.vimpdf.library.pick()
      if (!result) return
      if ('error' in result) {
        setStatus(t('File is no longer available'))
        return
      }
      await openReadResult(result, 'reader')
    },

    openPath: async (path) => {
      await openResolvedPath(path, 'reader')
    },

    openShelfItem: async (item) => {
      await openResolvedPath(item.path, 'reader')
    },

    openShelfDeck: async (item) => {
      await openResolvedPath(item.path, 'deck')
    },

    openSelectedDeck: async () => {
      const { shelf, selectedId } = get()
      const item = shelf.find((entry) => entry.id === selectedId)
      if (!item) return
      await openResolvedPath(item.path, 'deck')
    },

    removeShelfItem: async (item) => {
      await window.vimpdf.library.remove(item.id)
      await refreshShelf(null)
      setStatus(null)
    },

    closeDocument: () => {
      const doc = get().doc
      if (doc) {
        flushPosition()
        stopSpeech()
        const pdf = doc.pdf
        setTimeout(() => { void pdf.loadingTask.destroy() }, 60)
      }
      set({
        doc: null,
        page: 'library',
        errorKind: null,
        tocOpen: false,
        annotationsOpen: false,
        search: emptySearch(),
        noteEditor: null,
        notePopupId: null,
        noteCardId: null,
        deckEditing: null,
        zoom: 1,
        undoStack: []
      })
      void refreshShelf()
    },

    setFocus,

    nextParagraph: () => {
      const doc = get().doc
      if (doc) setFocus(doc.focus + 1)
    },

    previousParagraph: () => {
      const doc = get().doc
      if (doc) setFocus(doc.focus - 1)
    },

    nextPage: () => jumpToPage(1),
    previousPage: () => jumpToPage(-1),

    nextSection: () => {
      const doc = get().doc
      if (!doc) return
      const starts = sectionStarts(doc)
      if (!starts.length) {
        setStatus(t('No table of contents in this document'))
        return
      }
      const target = starts.find((start) => start > doc.focus)
      if (target == null) {
        setStatus(t('Already in the last section'))
        return
      }
      setFocus(target)
    },

    previousSection: () => {
      const doc = get().doc
      if (!doc) return
      const starts = sectionStarts(doc)
      if (!starts.length) {
        setStatus(t('No table of contents in this document'))
        return
      }
      const target = [...starts].reverse().find((start) => start < doc.focus)
      if (target == null) {
        setStatus(t('Already in the first section'))
        return
      }
      setFocus(target)
    },

    goFirst: () => setFocus(0),

    goLast: () => {
      const doc = get().doc
      if (!doc) return
      const starts = sectionStarts(doc)
      if (starts.length) setFocus(starts[starts.length - 1])
      else setFocus(doc.paragraphs.length - 1)
    },

    toggleToc: () => {
      if (get().page !== 'reader') return
      set({ tocOpen: !get().tocOpen })
    },

    toggleAnnotations: () => {
      if (get().page === 'library') return
      set({ annotationsOpen: !get().annotationsOpen })
    },

    zoomIn: () => zoomTo(get().zoom + 0.1),
    zoomOut: () => zoomTo(get().zoom - 0.1),
    resetZoom: () => zoomTo(1),

    openSearch: () => {
      if (!get().doc) return
      set({
        search: { ...emptySearch(), open: true },
        noteEditor: null,
        dialog: null
      })
    },

    closeSearch: () => patchSearch({ open: false, matchParagraph: null }),

    setSearchQuery: (query) => patchSearch({ query }),

    submitSearch: () => {
      const { doc, page, search } = get()
      if (!doc) return
      const query = search.query.trim()
      if (!query) return
      const lower = query.toLowerCase()

      if (page === 'deck') {
        const cards = sortedCards(doc.annotations)
        if (search.executed !== query || !search.deckResults.length) {
          const results = cards
            .filter((card) => {
              const quote = doc.paragraphs[card.paragraphIndex]?.text ?? ''
              return `${quote}\n${card.content}`.toLowerCase().includes(lower)
            })
            .map((card) => card.id)
          if (!results.length) {
            patchSearch({ executed: query, deckResults: [], deckIndex: 0 })
            setStatus(t('No matches for “%@”', query))
            return
          }
          patchSearch({ executed: query, deckResults: results, deckIndex: 0 })
          selectCard(results[0])
        } else {
          get().nextSearchResult()
        }
        return
      }

      if (search.executed !== query || !search.readerResults.length) {
        const results: number[] = []
        for (const paragraph of doc.paragraphs) {
          const hits = countOccurrences(paragraph.text, lower)
          for (let hit = 0; hit < hits; hit += 1) results.push(paragraph.index)
        }
        if (!results.length) {
          patchSearch({ executed: query, readerResults: [], readerIndex: 0, matchParagraph: null })
          setStatus(t('No matches for “%@”', query))
          return
        }
        patchSearch({ executed: query, readerResults: results, readerIndex: 0, matchParagraph: results[0] })
        setFocus(results[0])
      } else {
        get().nextSearchResult()
      }
    },

    nextSearchResult: () => moveSearch(1),
    previousSearchResult: () => moveSearch(-1),

    startNote: () => {
      const doc = get().doc
      const paragraph = currentParagraph()
      if (!doc || !paragraph) return
      const existing = [...doc.annotations].reverse().find(
        (annotation) => annotation.paragraphIndex === paragraph.index && annotation.type === 'note'
      )
      set({
        noteEditor: existing
          ? { id: existing.id, paragraphIndex: paragraph.index, draft: existing.content }
          : { id: null, paragraphIndex: paragraph.index, draft: '' },
        notePopupId: null
      })
    },

    editNote: (id) => {
      const doc = get().doc
      if (!doc) return
      const note = doc.annotations.find((annotation) => annotation.id === id && annotation.type === 'note')
      if (!note) return
      set({
        noteEditor: { id: note.id, paragraphIndex: note.paragraphIndex, draft: note.content },
        notePopupId: null
      })
    },

    setNoteDraft: (draft) => {
      const editor = get().noteEditor
      if (!editor) return
      set({ noteEditor: { ...editor, draft } })
    },

    saveNote: () => {
      const doc = get().doc
      const editor = get().noteEditor
      if (!doc || !editor) return
      const content = editor.draft.trim()
      if (!content) return
      const paragraph = doc.paragraphs[editor.paragraphIndex]
      if (!paragraph) {
        set({ noteEditor: null })
        return
      }
      if (editor.id) {
        const existing = doc.annotations.find((annotation) => annotation.id === editor.id)
        if (!existing) {
          set({ noteEditor: null })
          return
        }
        const updated: Annotation = { ...existing, content }
        set({
          doc: {
            ...doc,
            annotations: doc.annotations.map((annotation) =>
              annotation.id === updated.id ? updated : annotation
            )
          },
          noteEditor: null
        })
        void window.vimpdf.annotations.upsert({
          documentId: doc.documentId,
          annotation: updated,
          anchor: paragraph.searchKey
        })
        setStatus(t('Note updated'))
        if (get().page === 'deck') selectCard(updated.id)
      } else {
        const annotation: Annotation = {
          id: crypto.randomUUID(),
          paragraphIndex: paragraph.index,
          pageIndex: paragraph.pageIndex,
          anchor: paragraph.searchKey,
          type: 'note',
          content,
          createdAt: Date.now()
        }
        addAnnotation(annotation)
        set({ noteEditor: null })
        if (get().page === 'deck') selectCard(annotation.id)
      }
    },

    cancelNote: () => set({ noteEditor: null }),

    toggleHighlight: () => {
      const doc = get().doc
      const paragraph = currentParagraph()
      if (!doc || !paragraph) return
      const existing = doc.annotations.find(
        (annotation) => annotation.paragraphIndex === paragraph.index && annotation.type === 'highlight'
      )
      if (existing) {
        removeAnnotationEntity(existing, true)
        return
      }
      addAnnotation({
        id: crypto.randomUUID(),
        paragraphIndex: paragraph.index,
        pageIndex: paragraph.pageIndex,
        anchor: paragraph.searchKey,
        type: 'highlight',
        content: '',
        createdAt: Date.now()
      })
    },

    deleteCurrentAnnotation: () => {
      const paragraph = currentParagraph()
      const doc = get().doc
      if (!paragraph || !doc) return
      const target = doc.annotations.find(
        (annotation) => annotation.paragraphIndex === paragraph.index
      )
      if (!target) {
        setStatus(t('Nothing to delete here'))
        return
      }
      removeAnnotationEntity(target, true)
    },

    deleteAnnotation: (id) => {
      const doc = get().doc
      if (!doc) return
      const target = doc.annotations.find((annotation) => annotation.id === id)
      if (!target) return
      removeAnnotationEntity(target, true)
    },

    openNotePopup: (id) => set({ notePopupId: id }),
    closeNotePopup: () => set({ notePopupId: null }),

    undo: () => {
      const stack = [...get().undoStack]
      const step = stack.pop()
      if (!step) {
        setStatus(t('Nothing to undo'))
        return
      }
      const doc = get().doc
      if (!doc) return
      if (step.kind === 'added') {
        set({ undoStack: stack })
        const cardsBefore = sortedCards(doc.annotations)
        const fallbackIndex = Math.max(0, cardsBefore.findIndex((card) => card.id === step.annotation.id))
        const wasCurrent = get().noteCardId === step.annotation.id
        set({
          doc: {
            ...doc,
            annotations: doc.annotations.filter((annotation) => annotation.id !== step.annotation.id)
          },
          notePopupId: get().notePopupId === step.annotation.id ? null : get().notePopupId,
          noteEditor: get().noteEditor?.id === step.annotation.id ? null : get().noteEditor
        })
        void window.vimpdf.annotations.remove(step.annotation.id)
        if (get().page === 'deck' && wasCurrent) reselectCard(null, fallbackIndex)
      } else {
        const existing = {
          ...step.annotation,
          pageIndex: doc.paragraphs[step.annotation.paragraphIndex]?.pageIndex ?? step.annotation.pageIndex
        }
        set({
          undoStack: stack,
          doc: { ...doc, annotations: [...doc.annotations, existing] }
        })
        void window.vimpdf.annotations.upsert({
          documentId: doc.documentId,
          annotation: existing,
          anchor: doc.paragraphs[existing.paragraphIndex]?.searchKey ?? ''
        })
      }
    },

    copyParagraph: async () => {
      const paragraph = currentParagraph()
      if (!paragraph) return
      try {
        await navigator.clipboard.writeText(paragraph.text)
        setStatus(t('Paragraph copied'))
      } catch {
        setStatus(t('Paragraph copied'))
      }
    },

    speakParagraph: () => {
      const paragraph = currentParagraph()
      if (!paragraph) return
      if (isSpeaking()) {
        stopSpeech()
        setStatus(t('Stopped reading'))
        return
      }
      if (speak(paragraph.text)) setStatus(t('Reading aloud'))
    },

    exportNotes: async () => {
      const doc = get().doc
      if (!doc) return
      if (!doc.annotations.length) {
        setStatus(t('No notes to export'))
        return
      }
      const documentName = fileStem(doc.path) || doc.title
      const markdown = buildMarkdown(documentName, doc.paragraphs, doc.annotations, get().language)
      const response = await window.vimpdf.files.saveMarkdown({
        defaultName: `${sanitizeName(documentName)}.md`,
        content: markdown
      })
      if (response?.canceled) return
      if (response?.ok && response.path) {
        const fileName = response.path.split(/[\\/]/).pop() || ''
        setStatus(t('Exported %@', fileName))
      } else {
        setStatus(t('Export failed'))
      }
    },

    openDeck: () => {
      const doc = get().doc
      if (!doc) return
      if (!doc.annotations.length) {
        set({
          page: 'deck',
          deckEditing: null,
          noteCardId: null,
          notePopupId: null,
          search: emptySearch(),
          annotationsOpen: false
        })
        return
      }
      const cards = sortedCards(doc.annotations)
      const current = cards.find((card) => card.id === get().noteCardId)
      const card = current ?? cards[0]
      set({
        page: 'deck',
        noteCardId: card.id,
        deckEditing: null,
        notePopupId: null,
        search: emptySearch(),
        annotationsOpen: false,
        doc: { ...doc, focus: card.paragraphIndex }
      })
      void window.vimpdf.library.saveNoteCard({ documentId: doc.documentId, annotationId: card.id })
    },

    closeDeck: () => get().closeDocument(),

    selectCard,

    nextCard: () => moveCard(1),
    previousCard: () => moveCard(-1),

    firstCard: () => {
      const doc = get().doc
      if (!doc) return
      const cards = sortedCards(doc.annotations)
      if (cards.length) selectCard(cards[0].id)
    },

    lastCard: () => {
      const doc = get().doc
      if (!doc) return
      const cards = sortedCards(doc.annotations)
      if (cards.length) selectCard(cards[cards.length - 1].id)
    },

    startCardEditing: () => {
      const doc = get().doc
      if (!doc) return
      const card = doc.annotations.find((annotation) => annotation.id === get().noteCardId)
      if (!card) return
      if (card.type === 'note') {
        set({ deckEditing: { draft: card.content } })
      } else {
        const existing = [...doc.annotations].reverse().find(
          (annotation) => annotation.paragraphIndex === card.paragraphIndex && annotation.type === 'note'
        )
        set({
          noteEditor: existing
            ? { id: existing.id, paragraphIndex: existing.paragraphIndex, draft: existing.content }
            : { id: null, paragraphIndex: card.paragraphIndex, draft: '' }
        })
      }
    },

    setCardDraft: (draft) => {
      if (!get().deckEditing) return
      set({ deckEditing: { draft } })
    },

    saveCardEditing: () => {
      const doc = get().doc
      const editing = get().deckEditing
      const card = doc?.annotations.find((annotation) => annotation.id === get().noteCardId)
      if (!doc || !editing || !card) return
      const content = editing.draft.trim()
      if (!content) return
      const updated: Annotation = { ...card, content }
      set({
        doc: {
          ...doc,
          annotations: doc.annotations.map((annotation) =>
            annotation.id === updated.id ? updated : annotation
          )
        },
        deckEditing: null
      })
      void window.vimpdf.annotations.upsert({
        documentId: doc.documentId,
        annotation: updated,
        anchor: doc.paragraphs[updated.paragraphIndex]?.searchKey ?? ''
      })
      setStatus(t('Note updated'))
    },

    cancelCardEditing: () => set({ deckEditing: null }),

    setDialog: (dialog) => set({ dialog }),

    confirmRemove: async () => {
      const { shelf, selectedId } = get()
      const item = shelf.find((entry) => entry.id === selectedId)
      set({ dialog: null })
      if (!item) return
      await window.vimpdf.library.remove(item.id)
      await get().refreshShelf(null)
    },

    setDefaultReader: async () => {
      set({ dialog: null })
      const response = await window.vimpdf.app.setDefaultReader()
      if (response?.error) setStatus(t('Could not set VimPDF as the default PDF reader'))
      else setStatus(t('Opening system settings…'))
    },

    handleMenuCommand: (command) => {
      switch (command) {
        case 'open':
          void get().openPdfDialog()
          break
        case 'close-document':
          if (get().page === 'library') void window.vimpdf.app.closeWindow()
          else get().closeDocument()
          break
        case 'export-notes':
          void get().exportNotes()
          break
        case 'find':
          get().openSearch()
          break
        case 'toggle-toc':
          get().toggleToc()
          break
        case 'toggle-annotations':
          get().toggleAnnotations()
          break
        case 'open-deck':
          if (get().doc) get().openDeck()
          else void get().openSelectedDeck()
          break
        case 'zoom-in':
          get().zoomIn()
          break
        case 'zoom-out':
          get().zoomOut()
          break
        case 'zoom-reset':
          get().resetZoom()
          break
        case 'shortcuts':
          set({ dialog: 'shortcuts' })
          break
        case 'about':
          set({ dialog: 'about' })
          break
        case 'set-default':
          set({ dialog: 'set-default' })
          break
        default:
          break
      }
    },

    handleLanguageChange: (language) => {
      if (get().language === language) return
      set({ language })
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    },

    handleOpenPath: (path) => {
      void get().openPath(path)
    },

    setFullScreen: (fullScreen) => set({ fullScreen })
  }
})

export function tocSectionFor(doc: OpenDocument | null): TocItem | null {
  if (!doc) return null
  let current: TocItem | null = null
  for (const item of doc.toc) {
    if (item.paragraphIndex >= 0 && item.paragraphIndex <= doc.focus) current = item
  }
  return current
}

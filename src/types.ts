import type { PDFDocumentProxy } from 'pdfjs-dist'

export type Language = 'en' | 'zh'
export type Platform = 'darwin' | 'win32' | 'linux'
export type ShelfViewMode = 'grid' | 'list'
export type SortKey = 'recent' | 'oldest' | 'title-asc' | 'title-desc' | 'pages' | 'progress' | 'notes'
export type AnnotationType = 'note' | 'highlight'
export type ParagraphKind = 'body' | 'heading' | 'caption' | 'list'

export interface AppInfo {
  platform: Platform
  language: Language
  version: string
  name: string
  isPackaged: boolean
  migratedFrom: string | null
  userData: string
}

export interface AppSettings {
  language: Language
  shelfViewMode: ShelfViewMode
}

export interface ShelfItem {
  id: number
  path: string
  lastParagraphIndex: number
  lastPage: number
  pageCount: number
  openedAt: number
  coverPath: string
  coverUrl: string | null
  metadataTitle: string | null
  noteCount: number
}

export interface Annotation {
  id: string
  paragraphIndex: number
  pageIndex: number
  anchor: string
  type: AnnotationType
  content: string
  createdAt: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Paragraph {
  index: number
  pageIndex: number
  text: string
  searchKey: string
  kind: ParagraphKind
  rect: Rect
  lineRects: Rect[]
  fontSize: number
}

export interface TocItem {
  id: string
  title: string
  depth: number
  pageIndex: number
  paragraphIndex: number
}

export interface PdfReadResult {
  ok: true
  path: string
  name: string
  bytes: Uint8Array
}

export interface PdfError {
  error: string
}

export interface OpenDocument {
  pdf: PDFDocumentProxy
  documentId: number
  path: string
  name: string
  title: string
  pageCount: number
  paragraphs: Paragraph[]
  paragraphsByPage: Paragraph[][]
  toc: TocItem[]
  annotations: Annotation[]
  focus: number
  zoom: number
  fitScale: number
  pageWidth: number
  pageHeight: number
}

export interface VimPDFApi {
  platform: Platform
  versions: { electron: string; chrome: string }
  app: {
    info: () => Promise<AppInfo>
    getSettings: () => Promise<AppSettings>
    updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
    quit: () => Promise<void>
    closeWindow: () => Promise<void>
    openExternal: (url: string) => Promise<{ ok?: boolean; error?: string }>
    setDefaultReader: () => Promise<{ ok?: boolean; error?: string }>
    showInFolder: (filePath: string) => Promise<{ ok?: boolean; error?: string }>
  }
  window: {
    setFullScreen: (flag: boolean) => Promise<boolean>
    toggleFullScreen: () => Promise<boolean>
    isFullScreen: () => Promise<boolean>
    onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void
  }
  library: {
    list: () => Promise<ShelfItem[]>
    pick: () => Promise<PdfReadResult | PdfError | null>
    resolve: (filePath: string) => Promise<PdfReadResult | PdfError>
    register: (payload: { filePath: string; pageCount: number; title: string }) => Promise<{ documentId: number } | PdfError>
    remove: (documentId: number) => Promise<{ ok?: boolean; error?: string }>
    savePosition: (payload: { documentId: number; paragraph: number; page: number }) => Promise<{ ok?: boolean }>
    saveZoom: (payload: { documentId: number; zoom: number }) => Promise<{ ok?: boolean }>
    getZoom: (documentId: number) => Promise<number | null>
    lastPosition: (documentId: number) => Promise<{ paragraph: number; page: number } | null>
    getNoteCard: (documentId: number) => Promise<string | null>
    saveNoteCard: (payload: { documentId: number; annotationId: string | null }) => Promise<{ ok?: boolean }>
    saveTitle: (payload: { documentId: number; title: string }) => Promise<{ ok?: boolean }>
    setCover: (payload: { documentId: number; dataUrl: string }) => Promise<{ coverUrl?: string; error?: string }>
  }
  annotations: {
    list: (documentId: number) => Promise<Annotation[]>
    upsert: (payload: { documentId: number; annotation: Annotation; anchor: string }) => Promise<{ ok?: boolean; error?: string }>
    remove: (annotationId: string) => Promise<{ ok?: boolean; error?: string }>
  }
  files: {
    saveMarkdown: (payload: { defaultName: string; content: string }) => Promise<{ ok?: boolean; canceled?: boolean; path?: string; error?: string }>
    pathForFile: (file: File) => string
  }
  events: {
    onCommand: (callback: (command: string) => void) => () => void
    onOpenPath: (callback: (filePath: string) => void) => () => void
    onLanguageChange: (callback: (language: Language) => void) => () => void
    ready: () => void
  }
}

declare global {
  interface Window {
    vimpdf: VimPDFApi
  }
}

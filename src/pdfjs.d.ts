declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: {
    workerSrc: string
    workerPort: Worker | null
  }

  export const Util: {
    transform(a: number[], b: number[]): number[]
  }

  export interface PDFPageViewport {
    width: number
    height: number
    scale: number
    rotation: number
    transform: number[]
  }

  export interface TextContentItem {
    str?: string
    transform?: number[]
    width?: number
    height?: number
    fontName?: string
    hasEOL?: boolean
    type?: string
  }

  export interface RenderTask {
    promise: Promise<void>
    cancel(): void
  }

  export interface PDFPageProxy {
    pageNumber: number
    getViewport(params: { scale?: number; rotation?: number }): PDFPageViewport
    getTextContent(): Promise<{ items: TextContentItem[] }>
    render(params: {
      canvasContext?: CanvasRenderingContext2D
      canvas?: HTMLCanvasElement
      viewport: PDFPageViewport
      transform?: number[]
      background?: string
      intent?: string
    }): RenderTask
    cleanup(): void
  }

  export interface PDFDocumentLoadingTask {
    destroy(): Promise<void>
  }

  export interface PDFDocumentProxy {
    numPages: number
    loadingTask: PDFDocumentLoadingTask
    getPage(pageNumber: number): Promise<PDFPageProxy>
    getMetadata(): Promise<{ info?: Record<string, unknown>; metadata?: unknown }>
    getOutline(): Promise<unknown[] | null>
    getDestination(id: string): Promise<unknown[] | null>
    getPageIndex(ref: unknown): Promise<number>
  }

  export function getDocument(src: {
    data?: Uint8Array | ArrayBuffer
    url?: string
    cMapUrl?: string
    cMapPacked?: boolean
    standardFontDataUrl?: string
    wasmUrl?: string
    iccUrl?: string
    isEvalSupported?: boolean
    [key: string]: unknown
  }): { promise: Promise<PDFDocumentProxy>; destroy(): Promise<void> }
}

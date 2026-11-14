import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Paragraph } from '../types'
import { buildParagraphs, extractLines } from './paragraphs'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const assetBase = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${assetBase}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}pdfjs/standard_fonts/`,
    wasmUrl: `${assetBase}pdfjs/wasm/`,
    isEvalSupported: false
  })
  return task.promise
}

export interface DetectedDocument {
  pageCount: number
  paragraphs: Paragraph[]
  paragraphsByPage: Paragraph[][]
  pageWidth: number
  pageHeight: number
  hasText: boolean
}

export async function detectDocument(
  pdf: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void
): Promise<DetectedDocument> {
  const paragraphsByPage: Paragraph[][] = []
  let nextIndex = 0
  let pageWidth = 612
  let pageHeight = 792
  let hasText = false

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    if (pageNumber === 1) {
      const viewport = page.getViewport({ scale: 1 })
      pageWidth = viewport.width
      pageHeight = viewport.height
    }
    const lines = await extractLines(page)
    if (lines.length) hasText = true
    const paragraphs = buildParagraphs(lines, pageNumber - 1, nextIndex)
    nextIndex += paragraphs.length
    paragraphsByPage.push(paragraphs)
    onProgress?.(pageNumber, pdf.numPages)
    page.cleanup()
    if (pageNumber % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    pageCount: pdf.numPages,
    paragraphs: paragraphsByPage.flat(),
    paragraphsByPage,
    pageWidth,
    pageHeight,
    hasText
  }
}

export async function readMetadataTitle(pdf: PDFDocumentProxy): Promise<string> {
  try {
    const metadata = await pdf.getMetadata()
    const info = metadata.info as Record<string, unknown> | undefined
    const title = info?.Title
    if (typeof title === 'string' && title.trim().length > 1) return title.trim()
  } catch {
    /* metadata is optional */
  }
  return ''
}

export async function renderCover(pdf: PDFDocumentProxy): Promise<string | null> {
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = 640 / base.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    await page.render({ canvasContext: context, viewport }).promise
    const dataUrl = canvas.toDataURL('image/png')
    page.cleanup()
    return dataUrl
  } catch {
    return null
  }
}

export function titleFromPath(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() || 'Untitled'
  return name.replace(/\.pdf$/i, '')
}

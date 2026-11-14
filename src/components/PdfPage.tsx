import { Fragment, useEffect, useRef, useState } from 'react'
import type { RenderTask } from 'pdfjs-dist'
import type { Annotation, OpenDocument, Paragraph, Rect } from '../types'

interface PdfPageProps {
  doc: OpenDocument
  pageIndex: number
  scale: number
  width: number
  height: number
  focusIndex: number
  annotations: Annotation[]
  searchParagraph: number | null
  searchRects: Rect[]
  onMarker: (id: string) => void
}

const MARKER_SIDE = 13

export function PdfPage({
  doc,
  pageIndex,
  scale,
  width,
  height,
  focusIndex,
  annotations,
  searchParagraph,
  searchRects,
  onMarker
}: PdfPageProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const root = shell.closest('.stage')
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { root: root instanceof Element ? root : null, rootMargin: '1200px 0px' }
    )
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!near || width <= 0) return
    const pdf = doc.pdf
    let cancelled = false
    let task: RenderTask | null = null
    setRendered(false)

    void (async () => {
      const page = await pdf.getPage(pageIndex + 1)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      task = page.render({
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0]
      })
      await task.promise
      if (!cancelled) setRendered(true)
    })().catch(() => {
      /* a cancelled render is the normal path while zooming */
    })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc.pdf, pageIndex, width, near])

  const paragraphs = doc.paragraphsByPage[pageIndex] ?? []
  const highlighted = new Set(
    annotations.filter((annotation) => annotation.type === 'highlight').map((annotation) => annotation.paragraphIndex)
  )
  const notes = annotations.filter((annotation) => annotation.type === 'note')
  const markers = markerLayout(paragraphs, notes, doc.pageWidth)
  const focusedParagraph = paragraphs.find((paragraph) => paragraph.index === focusIndex)
  const searchedParagraph = searchParagraph == null
    ? undefined
    : paragraphs.find((paragraph) => paragraph.index === searchParagraph)

  return (
    <div
      ref={shellRef}
      className="page-shell"
      data-page={pageIndex}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <canvas ref={canvasRef} />
      {!rendered && <div className="page-loading">{pageIndex + 1}</div>}
      <div className="page-overlay">
        {paragraphs.map((paragraph) => {
          const isFocus = paragraph.index === focusIndex
          const isHighlight = highlighted.has(paragraph.index)
          if (!isFocus && !isHighlight) return null
          return (
            <Fragment key={paragraph.index}>
              {isHighlight && paragraph.lineRects.map((rect, lineIndex) => (
                <div
                  key={`h-${lineIndex}`}
                  className="hl-rect highlight"
                  style={{
                    left: rect.x * scale,
                    top: rect.y * scale,
                    width: rect.width * scale,
                    height: rect.height * scale
                  }}
                />
              ))}
              {isFocus && paragraph.lineRects.map((rect, lineIndex) => (
                <div
                  key={`f-${lineIndex}`}
                  className="hl-rect focus"
                  style={{
                    left: rect.x * scale,
                    top: rect.y * scale,
                    width: rect.width * scale,
                    height: rect.height * scale
                  }}
                />
              ))}
            </Fragment>
          )
        })}
        {searchedParagraph && searchRects.map((rect, lineIndex) => (
          <div
            key={`search-${lineIndex}`}
            className="hl-rect search"
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale
            }}
          />
        ))}
        {notes.map((annotation) => {
          const marker = markers.get(annotation.id)
          if (!marker) return null
          return (
            <button
              key={annotation.id}
              className="note-marker"
              data-note-marker={annotation.id}
              style={{
                left: marker.x * scale,
                top: marker.y * scale,
                width: MARKER_SIDE * scale,
                height: MARKER_SIDE * scale
              }}
              onClick={(event) => {
                event.stopPropagation()
                onMarker(annotation.id)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function markerLayout(
  paragraphs: Paragraph[],
  notes: Annotation[],
  pageWidth: number
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>()
  if (!paragraphs.length) return layout
  const boxes = paragraphs.map((paragraph) => ({
    x: paragraph.rect.x - 2,
    y: paragraph.rect.y - 2,
    width: paragraph.rect.width + 4,
    height: paragraph.rect.height + 4
  }))

  for (const note of notes) {
    const paragraph = paragraphs.find((item) => item.index === note.paragraphIndex)
    if (!paragraph) continue
    const rect = paragraph.rect
    const y = rect.y
    const candidates = [rect.x - MARKER_SIDE - 4, rect.x + rect.width + 4, 3, pageWidth - MARKER_SIDE - 3]
    let placed: number | null = null
    for (const x of candidates) {
      if (x < 0 || x + MARKER_SIDE > pageWidth) continue
      const intersects = boxes.some((box) =>
        box.x < x + MARKER_SIDE && box.x + box.width > x && box.y < y + MARKER_SIDE && box.y + box.height > y
      )
      if (!intersects) {
        placed = x
        break
      }
    }
    if (placed == null) {
      placed = Math.min(Math.max(rect.x + rect.width + 4, 0), pageWidth - MARKER_SIDE - 1)
    }
    layout.set(note.id, { x: placed, y })
  }
  return layout
}

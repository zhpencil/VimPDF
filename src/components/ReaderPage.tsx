import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { useT } from '../lib/useT'
import { animateScrollTop } from '../lib/scroll'
import { Icon } from './Icon'
import { PdfPage } from './PdfPage'
import { AnnotationsSidebar, TocSidebar } from './Sidebars'
import { SearchBar } from './SearchBar'
import { StatusBar } from './StatusBar'
import { NotePopup } from './NotePopup'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function ReaderPage() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const zoom = useAppStore((state) => state.zoom)
  const tocOpen = useAppStore((state) => state.tocOpen)
  const annotationsOpen = useAppStore((state) => state.annotationsOpen)
  const errorKind = useAppStore((state) => state.errorKind)
  const scrollSeq = useAppStore((state) => state.scrollSeq)
  const scrollMode = useAppStore((state) => state.scrollMode)
  const search = useAppStore((state) => state.search)
  const notePopupId = useAppStore((state) => state.notePopupId)
  const openNotePopup = useAppStore((state) => state.openNotePopup)
  const closeNotePopup = useAppStore((state) => state.closeNotePopup)
  const closeDocument = useAppStore((state) => state.closeDocument)
  const openPdfDialog = useAppStore((state) => state.openPdfDialog)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageWidth, setStageWidth] = useState(0)
  const previousScale = useRef(0)

  const hasDoc = Boolean(doc)

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => setStageWidth(stage.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [errorKind, hasDoc])

  const fitScale = doc && stageWidth > 0
    ? clamp((stageWidth - 48) / doc.pageWidth, 0.2, 3)
    : 0
  const scale = fitScale * zoom
  const pageWidth = doc ? doc.pageWidth * scale : 0
  const pageHeight = doc ? doc.pageHeight * scale : 0

  useEffect(() => {
    const stage = stageRef.current
    if (!doc || !stage || fitScale <= 0) return
    const paragraph = doc.paragraphs[clamp(doc.focus, 0, Math.max(0, doc.paragraphs.length - 1))]
    if (!paragraph) return
    const shell = stage.querySelector<HTMLElement>(`[data-page="${paragraph.pageIndex}"]`)
    if (!shell) return
    const stageRect = stage.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const shellTop = shellRect.top - stageRect.top + stage.scrollTop
    const visibleHeight = stage.clientHeight
    const paragraphHeight = paragraph.rect.height * scale
    const paragraphTop = shellTop + paragraph.rect.y * scale
    // A paragraph the screen can hold is centred; a taller one pins its opening line to the top
    // edge so a switch never hides where the paragraph starts. The bounding box's top belongs to
    // the last column read, so the opening line is what gets anchored.
    const openingTop = shellTop + (paragraph.lineRects[0]?.y ?? paragraph.rect.y) * scale
    let target = paragraphHeight + 24 <= visibleHeight
      ? paragraphTop + paragraphHeight / 2 - visibleHeight / 2
      : openingTop - 12
    target = clamp(target, 0, Math.max(0, stage.scrollHeight - visibleHeight))
    const animate = previousScale.current !== 0 && previousScale.current !== scale
      ? false
      : scrollMode === 'smooth'
    previousScale.current = scale
    if (animate) animateScrollTop(stage, target, 200)
    else stage.scrollTop = target

    if (pageWidth > stage.clientWidth) {
      const left = shellRect.left - stageRect.left + stage.scrollLeft + paragraph.rect.x * scale
      const right = left + paragraph.rect.width * scale
      const visibleLeft = stage.scrollLeft
      const visibleRight = visibleLeft + stage.clientWidth
      if (left < visibleLeft || right > visibleRight) {
        stage.scrollLeft = Math.max(0, left - 24)
      }
    }
  }, [doc?.documentId, doc?.focus, scrollSeq, scale, fitScale, pageWidth])

  useEffect(() => {
    const stage = stageRef.current
    if (!doc || !stage || fitScale <= 0) return
    if (!search.open || search.matchParagraph == null || !search.matchRects.length) return
    const paragraph = doc.paragraphs[search.matchParagraph]
    if (!paragraph) return
    const shell = stage.querySelector<HTMLElement>(`[data-page="${paragraph.pageIndex}"]`)
    if (!shell) return
    const stageRect = stage.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const shellTop = shellRect.top - stageRect.top + stage.scrollTop
    const top = Math.min(...search.matchRects.map((rect) => rect.y))
    const bottom = Math.max(...search.matchRects.map((rect) => rect.y + rect.height))
    const matchTop = shellTop + top * scale
    const matchHeight = (bottom - top) * scale
    const visibleHeight = stage.clientHeight
    const target = clamp(
      matchHeight + 24 <= visibleHeight
        ? matchTop + matchHeight / 2 - visibleHeight / 2
        : matchTop - 12,
      0,
      Math.max(0, stage.scrollHeight - visibleHeight)
    )
    animateScrollTop(stage, target)

    if (pageWidth > stage.clientWidth) {
      const shellLeft = shellRect.left - stageRect.left + stage.scrollLeft
      const left = shellLeft + Math.min(...search.matchRects.map((rect) => rect.x)) * scale
      const right = shellLeft + Math.max(...search.matchRects.map((rect) => rect.x + rect.width)) * scale
      if (left < stage.scrollLeft || right > stage.scrollLeft + stage.clientWidth) {
        stage.scrollLeft = Math.max(0, left - 24)
      }
    }
  }, [search.open, search.executed, search.readerIndex, search.matchParagraph, search.matchRects, doc?.documentId, scale, fitScale, pageWidth])

  useEffect(() => {
    if (!doc || !doc.annotations.length) {
      if (notePopupId) closeNotePopup()
      return
    }
    if (notePopupId && !doc.annotations.some((annotation) => annotation.id === notePopupId)) {
      closeNotePopup()
    }
  }, [doc, notePopupId, closeNotePopup])

  if (!doc) return null

  if (errorKind === 'notext') {
    return (
      <div className="empty-wrap" style={{ flex: 1 }}>
        <Icon name="warning" />
        <div className="empty-title">{t('No Text Found')}</div>
        <div className="empty-desc">{t('This PDF might be a scanned image without a text layer.')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={closeDocument}>{t('Back to Library')}</button>
          <button className="btn primary" onClick={() => void openPdfDialog()}>{t('Open Another PDF...')}</button>
        </div>
      </div>
    )
  }

  const paragraph = doc.paragraphs[doc.focus]
  const left = paragraph ? t('Paragraph %1$d / %2$d', doc.focus + 1, doc.paragraphs.length) : ''

  return (
    <>
      <div className="reader-main">
        {tocOpen && <TocSidebar />}
        <div className="stage" ref={stageRef}>
          <div className="pages">
            {fitScale > 0 && Array.from({ length: doc.pageCount }, (_, index) => (
              <PdfPage
                key={index}
                doc={doc}
                pageIndex={index}
                scale={scale}
                width={pageWidth}
                height={pageHeight}
                focusIndex={doc.focus}
                annotations={doc.annotations.filter(
                  (annotation) => doc.paragraphs[annotation.paragraphIndex]?.pageIndex === index
                )}
                searchParagraph={search.matchParagraph}
                searchRects={search.matchRects}
                onMarker={(id) => {
                  if (notePopupId === id) closeNotePopup()
                  else openNotePopup(id)
                }}
              />
            ))}
          </div>
        </div>
        {annotationsOpen && <AnnotationsSidebar />}
        {search.open && <SearchBar />}
      </div>
      <StatusBar
        left={left}
        section=""
        right={paragraph ? t('Page %d', paragraph.pageIndex + 1) : ''}
      />
      <NotePopup />
    </>
  )
}

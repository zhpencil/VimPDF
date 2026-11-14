import { useEffect, useMemo, useRef } from 'react'
import { useAppStore, tocSectionFor } from '../store'
import type { Annotation, OpenDocument } from '../types'
import { animateScrollTop } from '../lib/scroll'
import { useT } from '../lib/useT'
import { Icon } from './Icon'
import { MathText } from './MathText'

export function TocSidebar() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const setFocus = useAppStore((state) => state.setFocus)
  const toggleToc = useAppStore((state) => state.toggleToc)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  const current = tocSectionFor(doc)

  useEffect(() => {
    if (!current) return
    const scroll = scrollRef.current
    const node = scroll?.querySelector<HTMLElement>(`[data-toc-id="${current.id}"]`)
    if (!scroll || !node) return
    const scrollRect = scroll.getBoundingClientRect()
    const rowRect = node.getBoundingClientRect()
    const target = Math.max(0, Math.min(
      scroll.scrollTop + rowRect.top - scrollRect.top - (scroll.clientHeight - rowRect.height) / 2,
      Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    ))
    if (mounted.current) {
      animateScrollTop(scroll, target, 150)
    } else {
      scroll.scrollTop = target
      mounted.current = true
    }
  }, [current?.id])

  if (!doc) return null

  return (
    <aside className="side left">
      <div className="side-header">
        <span>{t('Contents')}</span>
        <span className="spacer" />
        <button className="icon-btn" title={t('Close')} onClick={toggleToc}>
          <Icon name="close" small />
        </button>
      </div>
      <div className="side-scroll" ref={scrollRef}>
        {!doc.toc.length ? (
          <div className="side-empty">{t('No contents in this PDF')}</div>
        ) : (
          doc.toc.map((item) => {
            const depth = Math.min(item.depth, 3)
            const disabled = item.paragraphIndex < 0
            return (
              <button
                key={item.id}
                data-toc-id={item.id}
                className={
                  'toc-row' +
                  (depth > 0 ? ` d${depth}` : '') +
                  (disabled ? ' muted' : '') +
                  (current?.id === item.id ? ' active' : '')
                }
                title={item.title}
                onClick={() => {
                  if (!disabled) setFocus(item.paragraphIndex)
                }}
              >
                {item.title}
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

export function AnnotationsSidebar() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const page = useAppStore((state) => state.page)
  const noteCardId = useAppStore((state) => state.noteCardId)
  const toggleAnnotations = useAppStore((state) => state.toggleAnnotations)
  const setFocus = useAppStore((state) => state.setFocus)
  const selectCard = useAppStore((state) => state.selectCard)
  const editNote = useAppStore((state) => state.editNote)
  const deleteAnnotation = useAppStore((state) => state.deleteAnnotation)

  const groups = useMemo(() => {
    if (!doc) return { notes: [] as Annotation[], highlights: [] as Annotation[] }
    const ordered = [...doc.annotations].sort((a, b) =>
      a.paragraphIndex === b.paragraphIndex
        ? a.createdAt - b.createdAt
        : a.paragraphIndex - b.paragraphIndex
    )
    return {
      notes: ordered.filter((annotation) => annotation.type === 'note'),
      highlights: ordered.filter((annotation) => annotation.type === 'highlight')
    }
  }, [doc])

  if (!doc) return null

  const open = (annotation: Annotation) => {
    if (page === 'deck') selectCard(annotation.id)
    else setFocus(annotation.paragraphIndex)
  }

  const row = (annotation: Annotation) => {
    const paragraph = doc.paragraphs[annotation.paragraphIndex]
    if (!paragraph) return null
    const isActive = page === 'deck'
      ? noteCardId === annotation.id
      : doc.focus === annotation.paragraphIndex
    const preview = annotation.type === 'note' ? annotation.content : paragraph.text
    return (
      <div
        key={annotation.id}
        className={`ann-row${isActive ? ' active' : ''}`}
        onClick={() => open(annotation)}
        onDoubleClick={() => {
          if (annotation.type === 'note') editNote(annotation.id)
        }}
      >
        <div className="head">
          <span>{t('Page %d', paragraph.pageIndex + 1)}</span>
          <span className="spacer" />
          <button
            className="delete"
            title={t('Delete annotation')}
            onClick={(event) => {
              event.stopPropagation()
              deleteAnnotation(annotation.id)
            }}
          >
            <Icon name="trash" small />
          </button>
        </div>
        <div className={`body${annotation.type === 'highlight' ? ' hl' : ''}`}>
          <MathText text={preview} />
        </div>
      </div>
    )
  }

  return (
    <aside className="side right">
      <div className="side-header">
        <span>{t('Annotations')}</span>
        <span className="spacer" />
        <button className="icon-btn" title={t('Close')} onClick={toggleAnnotations}>
          <Icon name="close" small />
        </button>
      </div>
      <div className={`side-scroll${doc.annotations.length ? '' : ' fill'}`}>
        {!doc.annotations.length ? (
          <div className="side-empty annotated">
            <Icon name="highlight" />
            <div>{t('No annotations yet')}</div>
            <div className="footnote">
              {page === 'deck' ? t('J / K moves between cards') : t('H highlights, N adds a note')}
            </div>
          </div>
        ) : (
          <>
            {groups.notes.length > 0 && (
              <div className="side-section">{t('Notes (%d)', groups.notes.length)}</div>
            )}
            {groups.notes.map(row)}
            {groups.highlights.length > 0 && (
              <div className="side-section">{t('Highlights (%d)', groups.highlights.length)}</div>
            )}
            {groups.highlights.map(row)}
          </>
        )}
      </div>
    </aside>
  )
}

export function sectionTitle(doc: OpenDocument | null): string {
  return tocSectionFor(doc)?.title ?? ''
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { useT } from '../lib/useT'
import { Icon } from './Icon'
import { MathText } from './MathText'

export function NotePopup() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const popupId = useAppStore((state) => state.notePopupId)
  const closeNotePopup = useAppStore((state) => state.closeNotePopup)
  const editNote = useAppStore((state) => state.editNote)
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  const annotation = doc?.annotations.find((item) => item.id === popupId)
  const paragraph = annotation ? doc?.paragraphs[annotation.paragraphIndex] : undefined

  const place = useCallback(() => {
    if (!popupId) return
    const marker = document.querySelector<HTMLElement>(`[data-note-marker="${CSS.escape(popupId)}"]`)
    const popup = popupRef.current
    if (!marker || !popup) {
      setPosition(null)
      return
    }
    const rect = marker.getBoundingClientRect()
    const stage = marker.closest<HTMLElement>('.stage')
    const bounds = stage?.getBoundingClientRect()
    if (bounds && (rect.bottom < bounds.top || rect.top > bounds.bottom)) {
      closeNotePopup()
      return
    }
    const width = popup.offsetWidth || 260
    const height = popup.offsetHeight || 160
    // Same rule as the macOS card: centred inside the reader surface with 8pt of slack per
    // side, flipped above the marker past 55% of the surface height, its facing edge 10pt off.
    const view = bounds ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    const above = rect.top + rect.height / 2 - view.top > view.height * 0.55
    const center = Math.min(Math.max(rect.left + rect.width / 2 - view.left, 138),
                            Math.max(138, view.width - 138))
    setPosition({
      left: view.left + center - width / 2,
      top: above ? rect.top - height - 10 : rect.bottom + 10
    })
  }, [popupId, closeNotePopup])

  useLayoutEffect(() => {
    setPosition(null)
    place()
  }, [place, annotation?.content])

  useEffect(() => {
    if (!popupId) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.note-pop')) return
      const marker = target.closest('[data-note-marker]')
      if (marker?.getAttribute('data-note-marker') === popupId) return
      closeNotePopup()
    }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    document.addEventListener('mousedown', onDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('mousedown', onDown)
    }
  }, [popupId, place, closeNotePopup])

  if (!doc || !annotation || !paragraph) return null

  return (
    <div
      className="note-pop"
      key={popupId}
      ref={popupRef}
      style={{
        left: position?.left ?? -1000,
        top: position?.top ?? -1000,
        opacity: position ? 1 : 0
      }}
    >
      <div className="head">
        <span>{t('Page %d', paragraph.pageIndex + 1)}</span>
        <span className="spacer" />
        <button className="icon-btn" title={t('Edit this note')} onClick={() => editNote(annotation.id)}>
          <Icon name="pencil" small />
        </button>
        <button className="icon-btn" title={t('Close')} onClick={closeNotePopup}>
          <Icon name="close" small />
        </button>
      </div>
      <div className="text">
        <MathText text={annotation.content} />
      </div>
    </div>
  )
}

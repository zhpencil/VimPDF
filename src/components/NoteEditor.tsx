import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { useT } from '../lib/useT'
import { MathText } from './MathText'

export function NoteEditor() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const editor = useAppStore((state) => state.noteEditor)
  const setNoteDraft = useAppStore((state) => state.setNoteDraft)
  const saveNote = useAppStore((state) => state.saveNote)
  const cancelNote = useAppStore((state) => state.cancelNote)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(editor?.draft ?? '')

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setPreview(editor?.draft ?? ''), 150)
    return () => clearTimeout(timer)
  }, [editor?.draft])

  if (!doc || !editor) return null
  const paragraph = doc.paragraphs[editor.paragraphIndex]
  if (!paragraph) return null
  const blank = !editor.draft.trim()

  return (
    <div className="overlay">
      <div className="modal note-modal" role="dialog" aria-modal="true">
        <div className="head">
          <span className="title">{editor.id ? t('Edit Note') : t('New Note')}</span>
          <span className="spacer" />
          <span className="page">{t('Page %d', paragraph.pageIndex + 1)}</span>
        </div>
        <div className="quote">{paragraph.text}</div>
        <textarea
          ref={textareaRef}
          value={editor.draft}
          placeholder={t('Use $…$ for inline math')}
          onChange={(event) => setNoteDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelNote()
            } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (!blank) saveNote()
            }
          }}
        />
        <div className="preview-box">
          <div className="preview-label">{t('Live preview')}</div>
          <div className="preview-text">
            {blank ? t('Use $…$ for inline math') : <MathText text={preview} />}
          </div>
        </div>
        <div className="foot">
          <button className="btn ghost" onClick={cancelNote}>{t('Cancel')}</button>
          <span className="spacer" />
          <button className="btn primary" disabled={blank} onClick={saveNote}>
            {editor.id ? t('Update') : t('Save')}
          </button>
        </div>
      </div>
    </div>
  )
}

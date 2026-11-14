import { useAppStore } from '../store'
import { useT } from '../lib/useT'
import { MathNoteEditor } from './MathNoteEditor'

export function NoteEditor() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const editor = useAppStore((state) => state.noteEditor)
  const setNoteDraft = useAppStore((state) => state.setNoteDraft)
  const saveNote = useAppStore((state) => state.saveNote)
  const cancelNote = useAppStore((state) => state.cancelNote)

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
        <MathNoteEditor
          value={editor.draft}
          onChange={setNoteDraft}
          onSave={saveNote}
          onCancel={cancelNote}
        />
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

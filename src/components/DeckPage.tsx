import { useEffect, useRef } from 'react'
import { useAppStore, tocSectionFor } from '../store'
import type { Annotation } from '../types'
import { useT } from '../lib/useT'
import { AnnotationsSidebar } from './Sidebars'
import { Icon } from './Icon'
import { MathNoteEditor } from './MathNoteEditor'
import { MathText } from './MathText'
import { SearchBar } from './SearchBar'
import { StatusBar } from './StatusBar'

export function DeckPage() {
  const t = useT()
  const doc = useAppStore((state) => state.doc)
  const noteCardId = useAppStore((state) => state.noteCardId)
  const annotationsOpen = useAppStore((state) => state.annotationsOpen)
  const deckEditing = useAppStore((state) => state.deckEditing)
  const search = useAppStore((state) => state.search)
  const previousIndex = useRef(0)

  const cards = doc
    ? [...doc.annotations].sort((a, b) =>
        a.paragraphIndex === b.paragraphIndex
          ? a.createdAt - b.createdAt
          : a.paragraphIndex - b.paragraphIndex
      )
    : []
  const index = cards.findIndex((card) => card.id === noteCardId)
  const card = index >= 0 ? cards[index] : null
  const direction = index >= previousIndex.current ? 'from-next' : 'from-previous'

  useEffect(() => {
    previousIndex.current = index
  }, [index, noteCardId])

  if (!doc) return null

  if (!cards.length) {
    return (
      <>
        <div className="deck-body">
          <div className="deck-empty">
            <Icon name="cards" />
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t('No annotations yet')}</div>
            <div>{t('Notes and highlights you make in the reader appear here as flashcards.')}</div>
          </div>
        </div>
        <StatusBar left="" section="" right="" />
      </>
    )
  }

  const section = card ? tocSectionFor(doc)?.title ?? '' : ''

  return (
    <>
      <div className="reader-main" style={{ background: '#fff' }}>
        <div className="deck-body">
          {card && (
            <article className={`deck-card ${direction}`} key={card.id}>
              <Quote card={card} />
              {card.type === 'note' && (
                <>
                  <div className="divider" />
                  {deckEditing ? (
                    <InlineEditor />
                  ) : (
                    <div className="deck-note"><MathText text={card.content} /></div>
                  )}
                </>
              )}
            </article>
          )}
          {search.open && <SearchBar />}
        </div>
        {annotationsOpen && <AnnotationsSidebar />}
      </div>
      <StatusBar
        left={index >= 0 ? t('Card %1$d / %2$d', index + 1, cards.length) : ''}
        section={section}
        right=""
      />
    </>
  )
}

function Quote({ card }: { card: Annotation }) {
  const doc = useAppStore((state) => state.doc)
  const text = (doc?.paragraphs[card.paragraphIndex]?.text ?? '').replace(/\n+/g, ' ').trim()
  return (
    <div className="deck-quote">
      <span className="bar" />
      <span><MathText text={text} /></span>
    </div>
  )
}

function InlineEditor() {
  const t = useT()
  const draft = useAppStore((state) => state.deckEditing?.draft ?? '')
  const setCardDraft = useAppStore((state) => state.setCardDraft)
  const saveCardEditing = useAppStore((state) => state.saveCardEditing)
  const cancelCardEditing = useAppStore((state) => state.cancelCardEditing)

  const blank = !draft.trim()

  return (
    <div className="deck-note-editor">
      <MathNoteEditor
        value={draft}
        onChange={setCardDraft}
        onSave={saveCardEditing}
        onCancel={cancelCardEditing}
      />
      <div className="deck-editor-actions">
        <span className="hint-mono">{t('⌘↩ Update · Esc Cancel')}</span>
        <button className="btn ghost" onClick={cancelCardEditing}>{t('Cancel')}</button>
        <button className="btn primary" disabled={blank} onClick={saveCardEditing}>{t('Update')}</button>
      </div>
    </div>
  )
}

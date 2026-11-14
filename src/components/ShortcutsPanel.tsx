import { useAppStore } from '../store'
import { useT } from '../lib/useT'

const READING: Array<[string, string]> = [
  ['↓ / J', 'Next paragraph'],
  ['↑ / K', 'Previous paragraph'],
  ['→ / D', 'Next page'],
  ['← / U', 'Previous page'],
  ['[ / ]', 'Previous / next section'],
  ['G G', 'Back to the top'],
  ['G', 'Last section'],
  ['T', 'Table of contents'],
  ['B', 'Annotations sidebar'],
  ['F', 'Search'],
  ['P', 'Read paragraph aloud'],
  ['↩', 'Jump to match / next match'],
  ['?', 'Show / hide shortcuts'],
  ['O', 'Open another PDF'],
  ['Esc', 'Close overlay / dialog']
]

const EDITING: Array<[string, string]> = [
  ['N', 'Create / edit note'],
  ['H', 'Highlight paragraph'],
  ['X', 'Delete annotation'],
  ['Z', 'Undo'],
  ['C', 'Copy paragraph text'],
  ['E', 'Export notes as Markdown'],
  ['Q', 'Back to library'],
  ['⌘↩', 'Save note'],
  ['⌘= / ⌘-', 'Zoom in / out']
]

const CARDS: Array<[string, string]> = [
  ['↓ / J', 'Next card'],
  ['↑ / K', 'Previous card'],
  ['G G', 'First card'],
  ['G', 'Last card'],
  ['N', 'Edit note'],
  ['B', 'Annotations sidebar'],
  ['F', 'Search all annotations'],
  ['↩', 'Jump to match / next match'],
  ['?', 'Show / hide shortcuts'],
  ['Q', 'Back to library']
]

const LIBRARY: Array<[string, string]> = [
  ['↑↓←→', 'Select a book'],
  ['JKHL', 'Select a book'],
  ['Return', 'Open it'],
  ['O', 'Open PDF'],
  ['F', 'Search the library'],
  ['V', 'Grid / list view'],
  ['N', 'Review notes (flashcards)'],
  ['X', 'Remove from library'],
  ['M', 'Switch Chinese / English'],
  ['?', 'Default PDF reader']
]

export function ShortcutsPanel() {
  const t = useT()
  const setDialog = useAppStore((state) => state.setDialog)

  const column = (title: string, rows: Array<[string, string]>) => (
    <div className="shortcut-col">
      <h2>{t(title)}</h2>
      {rows.map(([key, label]) => (
        <div className="sc-row" key={`${title}-${key}-${label}`}>
          <span className="key">{key}</span>
          <span>{t(label)}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDialog(null)
      }}
    >
      <div className="modal shortcut-panel" role="dialog" aria-modal="true">
        <h1>{t('Keyboard Shortcuts')}</h1>
        <div className="rule" />
        <div className="shortcut-cols">
          {column('Reading', READING)}
          {column('Editing', EDITING)}
          {column('Flashcards', CARDS)}
          {column('Library', LIBRARY)}
        </div>
      </div>
    </div>
  )
}

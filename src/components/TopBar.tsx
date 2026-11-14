import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useAppStore } from '../store'
import { useT } from '../lib/useT'
import { fileStem, SORT_KEYS, SORT_LABEL_KEYS, visibleShelf } from '../lib/library'
import { Icon } from './Icon'

export function TopBar() {
  const t = useT()
  const page = useAppStore((state) => state.page)
  const doc = useAppStore((state) => state.doc)
  const openPdfDialog = useAppStore((state) => state.openPdfDialog)
  const title = page === 'library' ? 'VimPDF' : fileStem(doc?.path ?? '') || doc?.title || ''

  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn" title={t('Open PDF (O)')} onClick={() => void openPdfDialog()}>
          <Icon name="folder" />
        </button>
      </div>
      <div className="topbar-title" title={title}>{title}</div>
      <div className="topbar-actions">
        {page === 'library' ? <ShelfActions /> : page === 'deck' ? <DeckActions /> : <ReaderActions />}
      </div>
    </header>
  )
}

function ShelfActions() {
  const t = useT()
  const panel = useAppStore((state) => state.libraryPanel)
  const setPanel = useAppStore((state) => state.setLibraryPanel)
  const viewMode = useAppStore((state) => state.viewMode)
  const setViewMode = useAppStore((state) => state.setViewMode)
  const sort = useAppStore((state) => state.sort)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (panel !== 'search') return
    const timer = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [panel])

  useEffect(() => {
    if (!panel) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.search-pop') || target.closest('.dropdown') || target.closest('.topbar-actions')) return
      setPanel(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [panel, setPanel])

  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      <button
        className="icon-btn"
        title={viewMode === 'grid' ? t('List view (V)') : t('Grid view (V)')}
        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
      >
        <Icon name={viewMode === 'grid' ? 'grid' : 'list'} />
      </button>
      <button
        className="icon-btn"
        title={t('Search the library (F)')}
        onClick={() => setPanel(panel === 'search' ? null : 'search')}
      >
        <Icon name="search" />
      </button>
      <button
        className="icon-btn"
        title={t('Sort: %@', t(SORT_LABEL_KEYS[sort]))}
        onClick={() => setPanel(panel === 'sort' ? null : 'sort')}
      >
        <Icon name="sort" />
      </button>
      {panel === 'search' && <ShelfSearchPopover inputRef={inputRef} />}
      {panel === 'sort' && <SortDropdown />}
    </div>
  )
}

function ShelfSearchPopover({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const t = useT()
  const query = useAppStore((state) => state.libraryQuery)
  const setQuery = useAppStore((state) => state.setLibraryQuery)
  const shelf = useAppStore((state) => state.shelf)
  const sort = useAppStore((state) => state.sort)
  const setPanel = useAppStore((state) => state.setLibraryPanel)
  const visible = visibleShelf(shelf, query, sort)

  return (
    <div className="search-pop">
      <div className="field">
        <Icon name="search" small />
        <input
          ref={inputRef}
          value={query}
          placeholder={t('Search titles')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setPanel(null)
            }
          }}
        />
        {query && (
          <button className="icon-btn" style={{ width: 20, height: 20 }} title={t('Clear')}
            onClick={() => setQuery('')}>
            <Icon name="close" small />
          </button>
        )}
      </div>
      <div className="count">
        {query
          ? t('%1$d of %2$d match', visible.length, shelf.length)
          : t('%d documents', shelf.length)}
      </div>
    </div>
  )
}

function SortDropdown() {
  const t = useT()
  const sort = useAppStore((state) => state.sort)
  const setSort = useAppStore((state) => state.setSort)

  return (
    <div className="dropdown">
      {SORT_KEYS.map((key) => (
        <button key={key} onClick={() => setSort(key)}>
          <span className="check">{sort === key && <Icon name="check" small />}</span>
          {t(SORT_LABEL_KEYS[key])}
        </button>
      ))}
    </div>
  )
}

function ReaderActions() {
  const t = useT()
  const toggleToc = useAppStore((state) => state.toggleToc)
  const toggleAnnotations = useAppStore((state) => state.toggleAnnotations)
  const setDialog = useAppStore((state) => state.setDialog)
  const closeDocument = useAppStore((state) => state.closeDocument)

  return (
    <>
      <button className="icon-btn" title={t('Contents (T)')} onClick={toggleToc}>
        <Icon name="toc" />
      </button>
      <button className="icon-btn" title={t('Annotations (B)')} onClick={toggleAnnotations}>
        <Icon name="sidebar" />
      </button>
      <button className="icon-btn" title={t('Shortcuts (?)')} onClick={() => setDialog('shortcuts')}>
        <Icon name="keyboard" />
      </button>
      <button className="icon-btn" title={t('Back to library (Q)')} onClick={closeDocument}>
        <Icon name="books" />
      </button>
    </>
  )
}

function DeckActions() {
  const t = useT()
  const toggleAnnotations = useAppStore((state) => state.toggleAnnotations)
  const openSearch = useAppStore((state) => state.openSearch)
  const setDialog = useAppStore((state) => state.setDialog)
  const closeDeck = useAppStore((state) => state.closeDeck)

  return (
    <>
      <button className="icon-btn" title={t('Annotations (B)')} onClick={toggleAnnotations}>
        <Icon name="sidebar" />
      </button>
      <button className="icon-btn" title={t('Search (F)')} onClick={openSearch}>
        <Icon name="search" />
      </button>
      <button className="icon-btn" title={t('Shortcuts (?)')} onClick={() => setDialog('shortcuts')}>
        <Icon name="keyboard" />
      </button>
      <button className="icon-btn" title={t('Back to library (Q)')} onClick={closeDeck}>
        <Icon name="books" />
      </button>
    </>
  )
}

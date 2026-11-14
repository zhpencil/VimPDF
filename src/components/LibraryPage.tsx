import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../store'
import type { ShelfItem } from '../types'
import { displayTitle, progressLabel, visibleShelf } from '../lib/library'
import { useT } from '../lib/useT'
import { Icon } from './Icon'

interface ItemMenuState {
  item: ShelfItem
  x: number
  y: number
}

export function LibraryPage() {
  const t = useT()
  const shelf = useAppStore((state) => state.shelf)
  const viewMode = useAppStore((state) => state.viewMode)
  const sort = useAppStore((state) => state.sort)
  const query = useAppStore((state) => state.libraryQuery)
  const selectedId = useAppStore((state) => state.selectedId)
  const selectionSeq = useAppStore((state) => state.selectionSeq)
  const selectItem = useAppStore((state) => state.selectItem)
  const language = useAppStore((state) => state.language)
  const platform = useAppStore((state) => state.info?.platform)
  const openShelfItem = useAppStore((state) => state.openShelfItem)
  const openPdfDialog = useAppStore((state) => state.openPdfDialog)
  const setLibraryQuery = useAppStore((state) => state.setLibraryQuery)
  const setDialog = useAppStore((state) => state.setDialog)
  const [menu, setMenu] = useState<ItemMenuState | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => visibleShelf(shelf, query, sort), [shelf, query, sort])

  useEffect(() => {
    if (!visible.length) return
    if (!visible.some((item) => item.id === selectedId)) selectItem(visible[0].id)
  }, [visible, selectedId, selectItem])

  useEffect(() => {
    if (!selectedId) return
    const node = bodyRef.current?.querySelector<HTMLElement>(`[data-shelf-id="${selectedId}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectionSeq, selectedId])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.menu')) setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const openMenu = (event: ReactMouseEvent, item: ShelfItem) => {
    event.stopPropagation()
    selectItem(item.id)
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.min(Math.max(8, rect.right - 190), window.innerWidth - 198)
    const y = Math.min(rect.bottom + 4, window.innerHeight - 150)
    setMenu({ item, x, y })
  }

  const openItem = (item: ShelfItem) => {
    selectItem(item.id)
    void openShelfItem(item)
  }

  const removeItem = (item: ShelfItem) => {
    selectItem(item.id)
    setDialog('remove')
  }

  if (!shelf.length) {
    return (
      <>
        <div className="library-body">
          <div className="empty-wrap">
            <Icon name="books" />
            <div className="empty-title">{t('No documents yet')}</div>
            <div className="empty-desc">
              {t('Open a PDF to start reading. Everything you open stays here with its last position and notes.')}
            </div>
            <button className="btn primary" onClick={() => void openPdfDialog()}>{t('Open PDF...')}</button>
          </div>
        </div>
        <LibraryHints />
      </>
    )
  }

  if (!visible.length) {
    const name = query.trim()
    return (
      <>
        <div className="library-body">
          <div className="empty-wrap">
            <Icon name="search" />
            <div className="empty-title">{t('No document named “%@”', name)}</div>
            <button className="btn" onClick={() => setLibraryQuery('')}>{t('Clear search')}</button>
          </div>
        </div>
        <LibraryHints />
      </>
    )
  }

  return (
    <>
      <div className="library-body" ref={bodyRef}>
        {viewMode === 'grid' ? (
          <div className="library-grid">
            {visible.map((item) => (
              <article
                key={item.id}
                data-shelf-id={item.id}
                className={`book-card${item.id === selectedId ? ' selected' : ''}`}
                onClick={() => openItem(item)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openMenu(event, item)
                }}
              >
                <CoverImage item={item} />
                <div className="book-meta">
                  <div className="name">{displayTitle(item)}</div>
                  <div className="progress">{progressLabel(item, language)}</div>
                </div>
                <button
                  className="card-menu"
                  title={t('Open')}
                  onClick={(event) => openMenu(event, item)}
                >
                  <Icon name="dots" small />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="library-list">
            {visible.map((item) => (
              <div
                key={item.id}
                data-shelf-id={item.id}
                className={`book-row${item.id === selectedId ? ' selected' : ''}`}
                onClick={() => openItem(item)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openMenu(event, item)
                }}
              >
                <div className="thumb">
                  {item.coverUrl
                    ? <img src={item.coverUrl} alt="" draggable={false} />
                    : <Icon name="doc" small />}
                </div>
                <div className="meta">
                  <div className="name">{displayTitle(item)}</div>
                  <div className="progress">{progressLabel(item, language)}</div>
                </div>
                <div className="row-actions">
                  <button className="icon-btn" title={t('Open')} onClick={(event) => openMenu(event, item)}>
                    <Icon name="dots" small />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <LibraryHints />
      {menu && createPortal(
        <div className="menu" style={{ left: menu.x, top: menu.y }}>
          <button onClick={() => { setMenu(null); openItem(menu.item) }}>{t('Open')}</button>
          <button onClick={() => {
            setMenu(null)
            void window.vimpdf.app.showInFolder(menu.item.path)
          }}>
            {t(platform === 'win32'
              ? 'Show in Explorer'
              : platform === 'linux'
                ? 'Show in File Manager'
                : 'Show in Finder')}
          </button>
          <div className="divider" />
          <button className="danger" onClick={() => { setMenu(null); removeItem(menu.item) }}>
            {t('Remove from Shelf')}
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

function CoverImage({ item }: { item: ShelfItem }) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const show = item.coverUrl && !failed

  return (
    <div className="cover">
      {show ? (
        <img src={item.coverUrl!} alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <div className="cover-empty">
          <Icon name="doc" />
          <span>{t('PDF')}</span>
        </div>
      )}
    </div>
  )
}

function LibraryHints() {
  const t = useT()
  const viewMode = useAppStore((state) => state.viewMode)
  return (
    <footer className="hints">
      <span className="hint">
        <span className="key">{viewMode === 'grid' ? '↑↓←→ / JKHL' : '↑↓ / JK'}</span>
        {t('Select')}
      </span>
      <span className="hint"><span className="key">Return</span>{t('Open')}</span>
      <span className="hint"><span className="key">O</span>{t('Open PDF')}</span>
      <span className="hint"><span className="key">F</span>{t('Search')}</span>
      <span className="hint"><span className="key">V</span>{t('View')}</span>
      <span className="hint"><span className="key">N</span>{t('Flashcards')}</span>
      <span className="hint"><span className="key">X</span>{t('Remove')}</span>
      <span className="hint"><span className="key">M</span>{t('Language')}</span>
      <span className="hint"><span className="key">?</span>{t('Make default')}</span>
      <span className="spacer" />
    </footer>
  )
}

import { useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import { useT } from '../lib/useT'
import { Icon } from './Icon'

export function SearchBar() {
  const t = useT()
  const page = useAppStore((state) => state.page)
  const search = useAppStore((state) => state.search)
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)
  const submitSearch = useAppStore((state) => state.submitSearch)
  const nextSearchResult = useAppStore((state) => state.nextSearchResult)
  const previousSearchResult = useAppStore((state) => state.previousSearchResult)
  const closeSearch = useAppStore((state) => state.closeSearch)
  const inputRef = useRef<HTMLInputElement>(null)
  const deck = page === 'deck'

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [])

  const total = deck ? search.deckResults.length : search.readerResults.length
  const index = deck ? search.deckIndex : search.readerIndex
  const count = total
    ? `${index + 1} / ${total}`
    : search.executed && search.executed === search.query.trim()
      ? t('No results')
      : ''

  return (
    <div className="search-bar">
      <span className="field">
        <Icon name="search" small />
        <input
          ref={inputRef}
          value={search.query}
          placeholder={deck ? t('Search annotations...') : t('Search in document...')}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.shiftKey) previousSearchResult()
              else submitSearch()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              closeSearch()
            }
          }}
        />
      </span>
      <span className="count">{count}</span>
      <button
        className="icon-btn"
        title={t('Previous match')}
        disabled={!total}
        onClick={previousSearchResult}
      >
        <Icon name="chevron-up" small />
      </button>
      <button
        className="icon-btn"
        title={t('Next match')}
        disabled={!total}
        onClick={nextSearchResult}
      >
        <Icon name="chevron-down" small />
      </button>
      <button className="icon-btn" title={t('Close')} onClick={closeSearch}>
        <Icon name="close" small />
      </button>
    </div>
  )
}

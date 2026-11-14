import type { Language, ShelfItem, SortKey } from '../types'
import { translate } from '../i18n'

export const SORT_KEYS: SortKey[] = [
  'recent',
  'oldest',
  'title-asc',
  'title-desc',
  'pages',
  'progress',
  'notes'
]

export const SORT_LABEL_KEYS: Record<SortKey, string> = {
  recent: 'Recently opened',
  oldest: 'Longest ago opened',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
  pages: 'Most pages',
  progress: 'Furthest read',
  notes: 'Most notes'
}

export function fileStem(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() || ''
  return name.replace(/\.pdf$/i, '')
}

export function displayTitle(item: ShelfItem): string {
  const metadata = (item.metadataTitle || '').trim()
  if (metadata.length > 0) return metadata
  return fileStem(item.path) || translate('en', 'Untitled')
}

export function progressLabel(item: ShelfItem, language: Language): string {
  if (!item.pageCount) return translate(language, 'Not opened yet')
  const page = Math.min(item.pageCount, item.lastPage + 1)
  const percent = Math.round((page / item.pageCount) * 100)
  return translate(language, 'Page %1$d of %2$d · %3$d%%', page, item.pageCount, percent)
}

export function filterShelf(items: ShelfItem[], query: string): ShelfItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => displayTitle(item).toLowerCase().includes(needle))
}

export function sortShelf(items: ShelfItem[], sort: SortKey): ShelfItem[] {
  const copy = [...items]
  const byTitle = (a: ShelfItem, b: ShelfItem) =>
    displayTitle(a).localeCompare(displayTitle(b), undefined, { numeric: true, sensitivity: 'base' })
  switch (sort) {
    case 'oldest':
      copy.sort((a, b) => a.openedAt - b.openedAt)
      break
    case 'title-asc':
      copy.sort(byTitle)
      break
    case 'title-desc':
      copy.sort((a, b) => byTitle(b, a))
      break
    case 'pages':
      copy.sort((a, b) => b.pageCount - a.pageCount || b.openedAt - a.openedAt)
      break
    case 'progress':
      copy.sort((a, b) => {
        const ratio = (item: ShelfItem) => item.pageCount ? (item.lastPage + 1) / item.pageCount : 0
        return ratio(b) - ratio(a) || b.openedAt - a.openedAt
      })
      break
    case 'notes':
      copy.sort((a, b) => b.noteCount - a.noteCount || b.openedAt - a.openedAt)
      break
    case 'recent':
    default:
      copy.sort((a, b) => b.openedAt - a.openedAt)
      break
  }
  return copy
}

export function visibleShelf(items: ShelfItem[], query: string, sort: SortKey): ShelfItem[] {
  return sortShelf(filterShelf(items, query), sort)
}

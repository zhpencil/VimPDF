export type IconName =
  | 'folder'
  | 'search'
  | 'sort'
  | 'grid'
  | 'list'
  | 'toc'
  | 'note'
  | 'sidebar'
  | 'help'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'dots'
  | 'trash'
  | 'doc'
  | 'books'
  | 'check'
  | 'pencil'
  | 'arrow-left'
  | 'keyboard'
  | 'info'
  | 'speaker'
  | 'copy'
  | 'export'
  | 'highlight'
  | 'undo'
  | 'plus'
  | 'external'
  | 'cards'
  | 'warning'

export function Icon({ name, small = false }: { name: IconName; small?: boolean }) {
  return (
    <svg className={`icon${small ? ' small' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {paths(name)}
    </svg>
  )
}

function paths(name: IconName) {
  switch (name) {
    case 'folder':
      return <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m16.5 16.5 4.5 4.5" />
        </>
      )
    case 'sort':
      return (
        <>
          <path d="M3 6h12M3 12h8M3 18h5" />
          <path d="M18 7v10m-3-3 3 3 3-3" />
        </>
      )
    case 'grid':
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      )
    case 'list':
      return (
        <>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <circle cx="3.8" cy="6" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="3.8" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="3.8" cy="18" r="1.1" fill="currentColor" stroke="none" />
        </>
      )
    case 'toc':
      return (
        <>
          <path d="M4 6h16M4 11h11M4 16h16M4 21h9" />
        </>
      )
    case 'note':
      return (
        <>
          <path d="M5 3h9l5 5v13H5z" />
          <path d="M14 3v6h6" />
        </>
      )
    case 'sidebar':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
        </>
      )
    case 'help':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.2 9a2.9 2.9 0 1 1 4.2 2.6c-.8.4-1.4 1-1.4 1.9v.3" />
          <circle cx="12" cy="17.2" r="0.9" />
        </>
      )
    case 'close':
      return <path d="M6 6l12 12M18 6 6 18" />
    case 'chevron-left':
      return <path d="m15 5-7 7 7 7" />
    case 'chevron-right':
      return <path d="m9 5 7 7-7 7" />
    case 'chevron-up':
      return <path d="m5 15 7-7 7 7" />
    case 'chevron-down':
      return <path d="m5 9 7 7 7-7" />
    case 'dots':
      return (
        <>
          <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </>
      )
    case 'trash':
      return (
        <>
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
          <path d="M10 11v6M14 11v6" />
        </>
      )
    case 'doc':
      return (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5" />
        </>
      )
    case 'books':
      return (
        <>
          <path d="M4 4h5v16H4zM10 4h5v16h-5z" />
          <path d="m16.5 5 4 15-5 1-4-15" />
        </>
      )
    case 'check':
      return <path d="m4 12 5 5L20 6" />
    case 'pencil':
      return (
        <>
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
          <path d="m14 7 3 3" />
        </>
      )
    case 'arrow-left':
      return <path d="M19 12H5m6-6-6 6 6 6" />
    case 'keyboard':
      return (
        <>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h1M10 10h1M14 10h1M18 10h.5M6 14h1M18 14h.5M10 14h4" />
        </>
      )
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="8" r="0.9" />
        </>
      )
    case 'speaker':
      return (
        <>
          <path d="M11 5 6 9H3v6h3l5 4z" />
          <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" />
        </>
      )
    case 'copy':
      return (
        <>
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </>
      )
    case 'export':
      return (
        <>
          <path d="M12 3v12m-5-5 5 5 5-5" />
          <path d="M4 17v3h16v-3" />
        </>
      )
    case 'highlight':
      return (
        <>
          <path d="m9 12 7-7 4 4-7 7H9z" />
          <path d="M4 20h16" />
        </>
      )
    case 'undo':
      return (
        <>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </>
      )
    case 'plus':
      return <path d="M12 5v14M5 12h14" />
    case 'external':
      return (
        <>
          <path d="M14 4h6v6M20 4l-9 9" />
          <path d="M19 14v5H5V5h5" />
        </>
      )
    case 'cards':
      return (
        <>
          <rect x="3" y="4" width="12" height="9" rx="1.5" />
          <path d="M8 16h11a2 2 0 0 0 2-2V8" />
        </>
      )
    case 'warning':
      return (
        <>
          <path d="M12 4 21 19.5H3z" />
          <path d="M12 9.5v4.5M12 17h.01" />
        </>
      )
    default:
      return null
  }
}

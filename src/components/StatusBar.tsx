import { useAppStore } from '../store'

export function StatusBar({ left, section, right }: { left: string; section: string; right: string }) {
  const status = useAppStore((state) => state.status)
  return (
    <footer className="statusbar">
      {left && <span>{left}</span>}
      {section && <span className="section" title={section}>{section}</span>}
      <span className="spacer" />
      {right && <span>{right}</span>}
      {status && (
        <>
          <span className="spacer" />
          <span className="status-chip">{status.text}</span>
        </>
      )}
    </footer>
  )
}

import type { ReactNode } from 'react'
import { useAppStore } from '../store'
import { displayTitle } from '../lib/library'
import { useT } from '../lib/useT'
import { Icon } from './Icon'

export function Dialogs() {
  const dialog = useAppStore((state) => state.dialog)
  if (!dialog) return null
  if (dialog === 'shortcuts') return null
  if (dialog === 'remove') return <RemoveDialog />
  if (dialog === 'set-default') return <DefaultDialog />
  return <AboutDialog />
}

function Overlay({ children }: { children: ReactNode }) {
  const setDialog = useAppStore((state) => state.setDialog)
  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDialog(null)
      }}
    >
      {children}
    </div>
  )
}

function RemoveDialog() {
  const t = useT()
  const shelf = useAppStore((state) => state.shelf)
  const selectedId = useAppStore((state) => state.selectedId)
  const platform = useAppStore((state) => state.info?.platform)
  const confirmRemove = useAppStore((state) => state.confirmRemove)
  const setDialog = useAppStore((state) => state.setDialog)
  const item = shelf.find((entry) => entry.id === selectedId)
  const title = item ? displayTitle(item) : ''

  return (
    <Overlay>
      <div className="modal confirm-modal" role="dialog" aria-modal="true">
        <div className="title">{t('Remove from Library?')}</div>
        <div className="body">
          {platform === 'darwin'
            ? t('“%@” and its notes will be deleted. The PDF itself stays on your Mac.', title)
            : t('“%@” and its notes will be deleted. The PDF file stays on your computer.', title)}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setDialog(null)}>{t('Cancel')}</button>
          <button className="btn danger" onClick={() => void confirmRemove()}>{t('Remove')}</button>
        </div>
      </div>
    </Overlay>
  )
}

function DefaultDialog() {
  const t = useT()
  const platform = useAppStore((state) => state.info?.platform)
  const setDialog = useAppStore((state) => state.setDialog)
  const setDefaultReader = useAppStore((state) => state.setDefaultReader)

  return (
    <Overlay>
      <div className="modal confirm-modal" role="dialog" aria-modal="true">
        <div className="title">{t('Make VimPDF the default PDF reader?')}</div>
        <div className="body">
          {platform === 'darwin'
            ? t('VimPDF will open every PDF file on this Mac. You can change it back in System Settings anytime.')
            : t('VimPDF will open every PDF file on this computer. You can change it back in system settings anytime.')}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setDialog(null)}>{t('Not Now')}</button>
          <button className="btn primary" onClick={() => void setDefaultReader()}>{t('Set as Default')}</button>
        </div>
      </div>
    </Overlay>
  )
}

function AboutDialog() {
  const t = useT()
  const info = useAppStore((state) => state.info)
  const setDialog = useAppStore((state) => state.setDialog)

  return (
    <Overlay>
      <div className="modal about-modal">
        <div className="logo"><Icon name="books" /></div>
        <div className="name">VimPDF</div>
        <div className="tagline">{t('PDF Reader for Vim Enthusiast')}</div>
        <div className="version">Version {info?.version ?? '1.0.1'}</div>
        <div className="credits">
          {t('Made by Qwen, Qoder.')}
          <br />
          {t('Designed in Jinjiang, China.')}
        </div>
        <button className="btn" onClick={() => setDialog(null)}>{t('Close')}</button>
      </div>
    </Overlay>
  )
}

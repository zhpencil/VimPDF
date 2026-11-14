import { useEffect } from 'react'
import { useAppStore } from './store'
import { useGlobalKeyboard } from './keyboard'
import { TopBar } from './components/TopBar'
import { LibraryPage } from './components/LibraryPage'
import { ReaderPage } from './components/ReaderPage'
import { DeckPage } from './components/DeckPage'
import { ShortcutsPanel } from './components/ShortcutsPanel'
import { Dialogs } from './components/Dialogs'
import { NoteEditor } from './components/NoteEditor'

export default function App() {
  const booted = useAppStore((state) => state.booted)
  const page = useAppStore((state) => state.page)
  const dialog = useAppStore((state) => state.dialog)
  const noteEditor = useAppStore((state) => state.noteEditor)
  const loadingLabel = useAppStore((state) => state.loadingLabel)
  const fullScreen = useAppStore((state) => state.fullScreen)

  useEffect(() => {
    void useAppStore.getState().boot()
    const offCommand = window.vimpdf.events.onCommand((command) => {
      useAppStore.getState().handleMenuCommand(command)
    })
    const offOpen = window.vimpdf.events.onOpenPath((path) => {
      useAppStore.getState().handleOpenPath(path)
    })
    const offLanguage = window.vimpdf.events.onLanguageChange((language) => {
      useAppStore.getState().handleLanguageChange(language)
    })
    const offFullScreen = window.vimpdf.window.onFullScreenChange((flag) => {
      useAppStore.getState().setFullScreen(flag)
    })
    window.vimpdf.events.ready()
    return () => {
      offCommand()
      offOpen()
      offLanguage()
      offFullScreen()
    }
  }, [])

  useGlobalKeyboard()

  if (!booted) return <div className="app-shell" />

  const immersive = fullScreen && page !== 'library'

  return (
    <div className="app-shell" data-immersive={immersive}>
      <TopBar />
      <div className="page-body" key={page}>
        {page === 'library' && <LibraryPage />}
        {page === 'reader' && <ReaderPage />}
        {page === 'deck' && <DeckPage />}
      </div>
      {dialog === 'shortcuts' && <ShortcutsPanel />}
      <Dialogs />
      {noteEditor && <NoteEditor />}
      {loadingLabel && (
        <div className="loading-screen">
          <div className="spinner" />
          <div>{loadingLabel}</div>
        </div>
      )}
      <StatusToast />
    </div>
  )
}

function StatusToast() {
  const page = useAppStore((state) => state.page)
  const status = useAppStore((state) => state.status)
  const setStatus = useAppStore((state) => state.setStatus)

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(null), 2000)
    return () => clearTimeout(timer)
  }, [status?.seq, setStatus])

  if (!status || page !== 'library') return null
  return <div className="library-toast">{status.text}</div>
}

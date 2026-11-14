const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const { LibraryStore } = require('./store.cjs')
const { Settings } = require('./settings.cjs')
const { buildMenu } = require('./menu.cjs')

const execFileAsync = promisify(execFile)

app.setName('VimPDF')
app.setPath('userData', process.env.VIMPDF_USER_DATA || path.join(app.getPath('appData'), 'VimPDF-Desktop'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'vimpdf', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  bootstrap()
}

let mainWindow = null
let store = null
let settings = null
let rendererReady = false
let pendingPaths = []
let saveBoundsTimer = null

function effectiveLanguage() {
  const chosen = settings ? settings.get('language') : null
  if (chosen === 'zh' || chosen === 'en') return chosen
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function sendCommand(name) {
  if (name === 'language:en' || name === 'language:zh') {
    setLanguage(name.slice(-2))
    return
  }
  mainWindow?.webContents.send('menu:command', name)
}

function setLanguage(language) {
  settings.patch({ language })
  rebuildMenu()
  mainWindow?.webContents.send('app:language', language)
}

function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu({ language: effectiveLanguage(), send: sendCommand }))
}

function legacyRoots() {
  const home = app.getPath('home')
  const support = 'Library/Application Support'
  const candidates = [
    path.join(home, support, 'VimPDF'),
    path.join(home, 'Library/Containers/com.jinbaoyao.VimPDF/Data', support, 'VimPDF'),
    path.join(home, support, 'KeyReader'),
    path.join(home, 'Library/Containers/com.jinbaoyao.KeyReader/Data', support, 'KeyReader')
  ]
  return candidates.filter((root) => fs.existsSync(root))
}

function safeBounds(saved) {
  if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') return null
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapX = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x)
    const overlapY = Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y)
    return overlapX > 120 && overlapY > 80
  })
  if (!visible) return null
  return {
    x: Math.round(saved.x),
    y: Math.round(saved.y),
    width: Math.max(Math.round(saved.width), 980),
    height: Math.max(Math.round(saved.height), 640)
  }
}

function isPdfPath(candidate) {
  return typeof candidate === 'string' && /\.pdf$/i.test(candidate) && fs.existsSync(candidate)
}

function queueOpenPath(filePath) {
  if (!isPdfPath(filePath)) return
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  if (rendererReady && mainWindow) {
    mainWindow.webContents.send('app:open-path', filePath)
  } else {
    pendingPaths.push(filePath)
  }
}

function flushPendingPaths() {
  if (!rendererReady || !mainWindow) return
  for (const filePath of pendingPaths.splice(0)) {
    mainWindow.webContents.send('app:open-path', filePath)
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const bounds = safeBounds(settings.get('windowBounds'))

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 800,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff',
    title: 'VimPDF',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 17 } }
      : { titleBarOverlay: { color: '#ffffff', symbolColor: '#3a3a3c', height: 46 } }),
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })

  if (!isMac) mainWindow.setMenuBarVisibility(false)

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.on('did-start-loading', () => { rendererReady = false })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.on('resize', scheduleBoundsSave)
  mainWindow.on('move', scheduleBoundsSave)
  mainWindow.on('close', saveBoundsNow)
  mainWindow.on('closed', () => { mainWindow = null; rendererReady = false })

  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('app:fullscreen', true))
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('app:fullscreen', false))

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadURL('app://vimpdf/index.html')
  }
}

function scheduleBoundsSave() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(saveBoundsNow, 400)
}

function saveBoundsNow() {
  if (saveBoundsTimer) {
    clearTimeout(saveBoundsTimer)
    saveBoundsTimer = null
  }
  if (!settings || !mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return
  settings.patch({ windowBounds: mainWindow.getNormalBounds() })
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream'
}

function registerAppProtocol() {
  const root = path.join(__dirname, '../dist/renderer')
  protocol.handle('app', async (request) => {
    let pathname = '/index.html'
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'vimpdf') return new Response('Not found', { status: 404 })
      pathname = decodeURIComponent(url.pathname)
      if (pathname === '/' || pathname === '') pathname = '/index.html'
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const file = path.normalize(path.join(root, pathname))
    if (file !== root && !file.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await fs.promises.readFile(file)
      return new Response(data, {
        headers: { 'content-type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerCoverProtocol() {
  protocol.handle('vimpdf', async (request) => {
    let name = ''
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'cover') return new Response('Not found', { status: 404 })
      name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (!name || name !== path.basename(name)) return new Response('Bad request', { status: 400 })
    const file = path.join(app.getPath('userData'), 'covers', name)
    if (!fs.existsSync(file)) return new Response('Not found', { status: 404 })
    try {
      const data = await fs.promises.readFile(file)
      return new Response(data, {
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function readPdf(filePath) {
  if (!isPdfPath(filePath)) return { error: 'missing' }
  try {
    const bytes = fs.readFileSync(filePath)
    return { ok: true, path: filePath, name: path.basename(filePath), bytes }
  } catch {
    return { error: 'missing' }
  }
}

function registerIpc() {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      if (mainWindow && event.sender !== mainWindow.webContents) return { error: 'forbidden' }
      try {
        return await fn(payload, event)
      } catch (error) {
        return { error: String(error?.message || error) }
      }
    })
  }

  handle('app:info', () => ({
    platform: process.platform,
    language: effectiveLanguage(),
    version: app.getVersion(),
    name: app.getName(),
    isPackaged: app.isPackaged,
    migratedFrom: store?.migratedFrom || null,
    userData: app.getPath('userData')
  }))

  handle('app:settings:get', () => ({
    language: effectiveLanguage(),
    shelfViewMode: settings.get('shelfViewMode')
  }))

  handle('app:settings:set', (patch) => {
    const next = {}
    if (patch && (patch.language === 'en' || patch.language === 'zh')) next.language = patch.language
    if (patch && (patch.shelfViewMode === 'grid' || patch.shelfViewMode === 'list')) {
      next.shelfViewMode = patch.shelfViewMode
    }
    if (Object.keys(next).length) {
      settings.patch(next)
      if (next.language) {
        rebuildMenu()
        mainWindow?.webContents.send('app:language', next.language)
      }
    }
    return {
      language: effectiveLanguage(),
      shelfViewMode: settings.get('shelfViewMode')
    }
  })

  handle('app:quit', () => app.quit())
  handle('app:close-window', () => mainWindow?.close())

  handle('app:show-in-folder', (filePath) => {
    if (!isPdfPath(filePath)) return { error: 'missing' }
    shell.showItemInFolder(filePath)
    return { ok: true }
  })

  handle('app:open-external', async (url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { error: 'unsupported' }
    await shell.openExternal(url)
    return { ok: true }
  })

  handle('app:set-default', async () => {
    try {
      if (process.platform === 'darwin') {
        await shell.openExternal('x-apple.systempreferences:com.apple.Desktop-Settings.extension')
      } else if (process.platform === 'win32') {
        await shell.openExternal('ms-settings:defaultapps')
      } else {
        await execFileAsync('xdg-mime', ['default', 'vimpdf.desktop', 'application/pdf'])
      }
      return { ok: true }
    } catch (error) {
      return { error: String(error?.message || error) }
    }
  })

  handle('window:fullscreen:set', (flag) => {
    mainWindow?.setFullScreen(Boolean(flag))
    return Boolean(flag)
  })

  handle('window:fullscreen:toggle', () => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
  })

  handle('window:fullscreen:get', () => Boolean(mainWindow?.isFullScreen()))

  handle('library:list', () => store.shelfItems())

  handle('library:resolve', (filePath) => readPdf(filePath))

  handle('library:register', ({ filePath, pageCount, title } = {}) => {
    if (!isPdfPath(filePath)) return { error: 'missing' }
    const documentId = store.register({
      filePath,
      pageCount: Number(pageCount) || 0,
      title: typeof title === 'string' ? title.slice(0, 300) : ''
    })
    return { documentId }
  })

  handle('library:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePaths.length) return null
    return readPdf(result.filePaths[0])
  })

  handle('library:remove', (documentId) => {
    store.removeDocument(Number(documentId))
    return { ok: true }
  })

  handle('library:save-position', ({ documentId, paragraph, page } = {}) => {
    store.savePosition(Number(documentId), Math.max(0, Number(paragraph) || 0), Math.max(0, Number(page) || 0))
    return { ok: true }
  })

  handle('library:save-zoom', ({ documentId, zoom } = {}) => {
    const value = Number(zoom)
    store.saveZoom(Number(documentId), Number.isFinite(value) ? value : null)
    return { ok: true }
  })

  handle('library:last-position', (documentId) => store.lastPosition(Number(documentId)))

  handle('library:zoom:get', (documentId) => store.zoom(Number(documentId)))

  handle('library:note-card:get', (documentId) => store.noteCard(Number(documentId)))

  handle('library:note-card:save', ({ documentId, annotationId } = {}) => {
    store.saveNoteCard(Number(documentId), annotationId ? String(annotationId) : null)
    return { ok: true }
  })

  handle('library:save-title', ({ documentId, title } = {}) => {
    store.saveMetadataTitle(Number(documentId), typeof title === 'string' ? title.slice(0, 300) : '')
    return { ok: true }
  })

  handle('library:set-cover', ({ documentId, dataUrl } = {}) => {
    if (typeof dataUrl !== 'string' || dataUrl.length > 24 * 1024 * 1024) return { error: 'invalid' }
    const coverUrl = store.setCover(Number(documentId), dataUrl)
    return coverUrl ? { coverUrl } : { error: 'invalid' }
  })

  handle('annotations:list', (documentId) => store.annotations(Number(documentId)))

  handle('annotations:upsert', ({ documentId, annotation, anchor } = {}) => {
    if (!documentId || !annotation || typeof annotation.id !== 'string') return { error: 'invalid' }
    store.upsertAnnotation(Number(documentId), {
      id: annotation.id,
      paragraphIndex: Math.max(0, Number(annotation.paragraphIndex) || 0),
      pageIndex: Math.max(0, Number(annotation.pageIndex) || 0),
      type: annotation.type === 'note' ? 'note' : 'highlight',
      content: typeof annotation.content === 'string' ? annotation.content : '',
      createdAt: Number(annotation.createdAt) || Date.now()
    }, typeof anchor === 'string' ? anchor.slice(0, 120) : '')
    return { ok: true }
  })

  handle('annotations:remove', (annotationId) => {
    if (typeof annotationId !== 'string') return { error: 'invalid' }
    store.removeAnnotation(annotationId)
    return { ok: true }
  })

  handle('file:save-markdown', async ({ defaultName, content } = {}) => {
    if (typeof content !== 'string') return { error: 'invalid' }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'notes.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await fs.promises.writeFile(result.filePath, content, 'utf8')
    return { ok: true, path: result.filePath }
  })
}

function bootstrap() {
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    queueOpenPath(filePath)
  })

  app.on('second-instance', (_event, argv) => {
    for (const arg of argv) {
      if (/\.pdf$/i.test(arg)) queueOpenPath(arg)
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    settings = new Settings(app.getPath('userData'))

    try {
      store = await new LibraryStore({
        userData: app.getPath('userData'),
        coversDir: path.join(app.getPath('userData'), 'covers'),
        legacyRoots: legacyRoots()
      }).open()
    } catch (error) {
      dialog.showErrorBox('VimPDF', `Could not open the library database.\n\n${error}`)
      app.quit()
      return
    }

    registerAppProtocol()
    registerCoverProtocol()
    registerIpc()
    rebuildMenu()
    createWindow()

    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.on('will-download', (event) => event.preventDefault())

    ipcMain.on('renderer:ready', () => {
      rendererReady = true
      flushPendingPaths()
    })

    for (const arg of process.argv) {
      if (isPdfPath(arg)) pendingPaths.push(arg)
    }

    app.on('activate', () => {
      if (!mainWindow) createWindow()
    })
  })

  app.on('before-quit', () => {
    saveBoundsNow()
    store?.close()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

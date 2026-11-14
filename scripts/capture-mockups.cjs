const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const shots = [
  ['01-library-grid', 'library'],
  ['02-library-list', 'library-list'],
  ['03-reader', 'reader'],
  ['04-reader-toc', 'reader-toc'],
  ['05-reader-notes', 'reader-notes'],
  ['06-note-editor', 'note-editor'],
  ['07-notes-deck', 'deck'],
  ['08-search', 'search'],
  ['09-shortcuts', 'shortcuts'],
  ['10-library-empty', 'library-empty']
]

const outDir = path.join(__dirname, '..', 'design', 'screenshots')
const mockup = path.join(__dirname, '..', 'design', 'mockups.html')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  await fs.mkdir(outDir, { recursive: true })
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  win.webContents.setFrameRate(60)

  for (const [name, screen] of shots) {
    await win.loadFile(mockup, { query: { screen } })
    await delay(500)
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) throw new Error(`Empty capture for ${name}`)
    await fs.writeFile(path.join(outDir, `${name}.png`), image.toPNG())
    console.log(`captured ${name} (${image.getSize().width}x${image.getSize().height})`)
  }

  app.quit()
}).catch(error => {
  console.error(error)
  app.exit(1)
})

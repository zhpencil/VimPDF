const { contextBridge, ipcRenderer, webUtils } = require('electron')

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)

const subscribe = (channel, callback) => {
  const handler = (_event, data) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('vimpdf', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },
  app: {
    info: () => invoke('app:info'),
    getSettings: () => invoke('app:settings:get'),
    updateSettings: (patch) => invoke('app:settings:set', patch),
    quit: () => invoke('app:quit'),
    closeWindow: () => invoke('app:close-window'),
    openExternal: (url) => invoke('app:open-external', url),
    setDefaultReader: () => invoke('app:set-default'),
    showInFolder: (filePath) => invoke('app:show-in-folder', filePath)
  },
  window: {
    setFullScreen: (flag) => invoke('window:fullscreen:set', flag),
    toggleFullScreen: () => invoke('window:fullscreen:toggle'),
    isFullScreen: () => invoke('window:fullscreen:get'),
    onFullScreenChange: (callback) => subscribe('app:fullscreen', callback)
  },
  library: {
    list: () => invoke('library:list'),
    pick: () => invoke('library:pick'),
    resolve: (filePath) => invoke('library:resolve', filePath),
    register: (payload) => invoke('library:register', payload),
    remove: (documentId) => invoke('library:remove', documentId),
    savePosition: (payload) => invoke('library:save-position', payload),
    saveZoom: (payload) => invoke('library:save-zoom', payload),
    getZoom: (documentId) => invoke('library:zoom:get', documentId),
    lastPosition: (documentId) => invoke('library:last-position', documentId),
    getNoteCard: (documentId) => invoke('library:note-card:get', documentId),
    saveNoteCard: (payload) => invoke('library:note-card:save', payload),
    saveTitle: (payload) => invoke('library:save-title', payload),
    setCover: (payload) => invoke('library:set-cover', payload)
  },
  annotations: {
    list: (documentId) => invoke('annotations:list', documentId),
    upsert: (payload) => invoke('annotations:upsert', payload),
    remove: (annotationId) => invoke('annotations:remove', annotationId)
  },
  files: {
    saveMarkdown: (payload) => invoke('file:save-markdown', payload),
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  events: {
    onCommand: (callback) => subscribe('menu:command', callback),
    onOpenPath: (callback) => subscribe('app:open-path', callback),
    onLanguageChange: (callback) => subscribe('app:language', callback),
    ready: () => ipcRenderer.send('renderer:ready')
  }
})

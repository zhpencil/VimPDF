const { Menu, app } = require('electron')

const TEXT = {
  en: {
    about: 'About VimPDF',
    setDefault: 'Set as Default PDF Reader…',
    hide: 'Hide VimPDF',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit VimPDF',
    file: 'File',
    open: 'Open PDF…',
    closeDoc: 'Close Document',
    exportNotes: 'Export Notes as Markdown…',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    find: 'Find',
    view: 'View',
    toc: 'Table of Contents',
    annotations: 'Annotations',
    deck: 'Notes Deck',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    actualSize: 'Actual Size',
    language: 'Language',
    english: 'English',
    chinese: '简体中文',
    fullscreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    bringAll: 'Bring All to Front',
    help: 'Help',
    shortcuts: 'Keyboard Shortcuts…',
    readerGuide: 'Reader Guide'
  },
  zh: {
    about: '关于 VimPDF',
    setDefault: '设为默认 PDF 阅读器…',
    hide: '隐藏 VimPDF',
    hideOthers: '隐藏其他',
    unhide: '全部显示',
    quit: '退出 VimPDF',
    file: '文件',
    open: '打开 PDF…',
    closeDoc: '关闭文档',
    exportNotes: '导出笔记为 Markdown…',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    find: '查找',
    view: '显示',
    toc: '目录',
    annotations: '标注',
    deck: '笔记卡片',
    zoomIn: '放大',
    zoomOut: '缩小',
    actualSize: '实际大小',
    language: '语言',
    english: 'English',
    chinese: '简体中文',
    fullscreen: '切换全屏',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    bringAll: '前置全部窗口',
    help: '帮助',
    shortcuts: '键盘快捷键…',
    readerGuide: '阅读指南'
  }
}

function buildMenu({ language, send }) {
  const L = TEXT[language === 'zh' ? 'zh' : 'en']
  const isMac = process.platform === 'darwin'
  const cmd = (name) => () => send(name)

  const template = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { label: L.about, click: cmd('about') },
        { type: 'separator' },
        { label: L.setDefault, click: cmd('set-default') },
        { type: 'separator' },
        { role: 'hide', label: L.hide },
        { role: 'hideOthers', label: L.hideOthers },
        { role: 'unhide', label: L.unhide },
        { type: 'separator' },
        { role: 'quit', label: L.quit }
      ]
    })
  }

  template.push({
    label: L.file,
    submenu: [
      { label: L.open, accelerator: 'CmdOrCtrl+O', click: cmd('open') },
      { label: L.closeDoc, accelerator: 'CmdOrCtrl+W', click: cmd('close-document') },
      ...(isMac ? [] : [{ type: 'separator' }, { label: L.setDefault, click: cmd('set-default') }]),
      { type: 'separator' },
      { label: L.exportNotes, accelerator: 'CmdOrCtrl+Shift+E', click: cmd('export-notes') },
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: L.quit }])
    ]
  })

  template.push({
    label: L.edit,
    submenu: [
      { label: L.undo, accelerator: 'CmdOrCtrl+Z', click: cmd('undo') },
      { label: L.redo, accelerator: 'Shift+CmdOrCtrl+Z', click: cmd('redo') },
      { type: 'separator' },
      { role: 'cut', label: L.cut },
      { role: 'copy', label: L.copy },
      { role: 'paste', label: L.paste },
      { role: 'selectAll', label: L.selectAll },
      { type: 'separator' },
      { label: L.find, accelerator: 'CmdOrCtrl+F', click: cmd('find') }
    ]
  })

  template.push({
    label: L.view,
    submenu: [
      { label: L.toc, accelerator: 'CmdOrCtrl+1', click: cmd('toggle-toc') },
      { label: L.annotations, accelerator: 'CmdOrCtrl+2', click: cmd('toggle-annotations') },
      { label: L.deck, accelerator: 'CmdOrCtrl+3', click: cmd('open-deck') },
      { type: 'separator' },
      { label: L.zoomIn, accelerator: 'CmdOrCtrl+=', click: cmd('zoom-in') },
      { label: L.zoomOut, accelerator: 'CmdOrCtrl+-', click: cmd('zoom-out') },
      { label: L.actualSize, accelerator: 'CmdOrCtrl+0', click: cmd('zoom-reset') },
      { type: 'separator' },
      {
        label: L.language,
        submenu: [
          { label: L.english, type: 'radio', checked: language !== 'zh', click: cmd('language:en') },
          { label: L.chinese, type: 'radio', checked: language === 'zh', click: cmd('language:zh') }
        ]
      },
      { type: 'separator' },
      { role: 'togglefullscreen', label: L.fullscreen }
    ]
  })

  template.push({
    label: L.window,
    submenu: isMac
      ? [
          { role: 'minimize', label: L.minimize },
          { role: 'zoom', label: L.zoom },
          { type: 'separator' },
          { role: 'front', label: L.bringAll }
        ]
      : [{ role: 'minimize', label: L.minimize }, { role: 'close', label: L.closeDoc }]
  })

  template.push({
    label: L.help,
    role: 'help',
    submenu: [
      { label: L.shortcuts, accelerator: 'CmdOrCtrl+/', click: cmd('shortcuts') },
      ...(isMac
        ? []
        : [{ type: 'separator' }, { label: L.about, click: cmd('about') }])
    ]
  })

  return Menu.buildFromTemplate(template)
}

module.exports = { buildMenu }

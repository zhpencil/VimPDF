import type { Language } from './types'

const zh: Record<string, string> = {
  // Reader status line
  'Paragraph %1$d / %2$d': '第 %1$d 段 / 共 %2$d 段',
  'Page %d': '第 %d 页',

  // Note card and note editor
  'Edit this note': '编辑这条笔记',
  Close: '关闭',
  'Edit Note': '编辑笔记',
  'New Note': '新建笔记',
  'Use $…$ for inline math': '用 $…$ 输入行内公式',
  'Live preview': '实时预览',
  'Previous match': '上一个匹配',
  'Next match': '下一个匹配',
  Cancel: '取消',
  Update: '更新',
  '⌘↩ Update · Esc Cancel': '⌘↩ 更新 · Esc 取消',
  Save: '保存',
  '⌘↩ Save · Esc Cancel': '⌘↩ 保存 · Esc 取消',

  // Library removal dialog
  'Remove from Library?': '从书库中移除？',
  Remove: '移除',
  '“%@” and its notes will be deleted. The PDF file stays on your computer.':
    '“%@”及其笔记将被删除，PDF 文件仍保留在你的电脑上。',
  '“%@” and its notes will be deleted. The PDF itself stays on your Mac.':
    '“%@”及其笔记将被删除，PDF 文件仍保留在你的 Mac 上。',

  // Loading and unreadable documents
  'Loading document...': '正在载入文档…',
  'No Text Found': '未找到文本',
  'This PDF might be a scanned image without a text layer.':
    '这个 PDF 可能是没有文本层的扫描图片。',
  'Back to Library': '返回书库',
  'Open Another PDF...': '打开其他 PDF…',

  // Search
  'Search in document...': '在文档中搜索…',
  'No results': '无结果',
  'Search annotations...': '搜索标注…',

  // Keyboard shortcut help
  'Keyboard Shortcuts': '键盘快捷键',
  Reading: '阅读',
  Editing: '编辑',
  Library: '书库',
  'Next paragraph': '下一段',
  'Previous paragraph': '上一段',
  'Next page': '下一页',
  'Previous page': '上一页',
  'Previous / next section': '上一节 / 下一节',
  'Back to the top': '回到顶部',
  'Last section': '最后一节',
  'Table of contents': '目录',
  'Annotations sidebar': '标注侧栏',
  Search: '搜索',
  'Jump to match / next match': '跳到匹配 / 下一个匹配',
  'Show / hide shortcuts': '显示 / 隐藏快捷键',
  'Open another PDF': '打开其他 PDF',
  'Close overlay / dialog': '关闭浮层 / 对话框',
  'Create / edit note': '新建 / 编辑笔记',
  'Highlight paragraph': '高亮本段',
  'Delete annotation': '删除标注',
  Undo: '撤销',
  'Copy paragraph text': '复制段落文本',
  'Read paragraph aloud': '朗读本段',
  'Reading aloud': '正在朗读',
  'Stopped reading': '已停止朗读',
  'Export notes as Markdown': '导出笔记为 Markdown',
  'Back to library': '返回书库',
  'Save note': '保存笔记',
  'Zoom in / out': '放大 / 缩小',
  'Select a book': '选择书籍',
  'Open it': '打开',
  'Open PDF': '打开 PDF',
  'Search the library': '搜索书库',
  'Review notes (flashcards)': '复习笔记（卡片）',
  'Remove from library': '从书库移除',
  'Switch Chinese / English': '切换中文 / 英文',

  // Flashcards
  Flashcards: '笔记卡片',
  'Next card': '下一张卡片',
  'Previous card': '上一张卡片',
  'Next / previous card': '下一张 / 上一张卡片',
  'First card': '第一张卡片',
  'Last card': '最后一张卡片',
  'First / last card': '第一张 / 最后一张卡片',
  'Edit note': '编辑笔记',
  'Search all annotations': '搜索所有标注',
  'Search (F)': '搜索（F）',
  Note: '笔记',
  Highlight: '高亮',
  'Notes and highlights you make in the reader appear here as flashcards.':
    '你在阅读中记下的笔记和高亮会以卡片形式出现在这里。',
  'No notes or highlights yet.': '还没有笔记或高亮。',
  'Card %1$d / %2$d': '第 %1$d / %2$d 张卡片',
  'J / K moves between cards': 'J / K 切换卡片',

  // Toolbar
  'Open PDF (O)': '打开 PDF（O）',
  'Search the library (F)': '搜索书库（F）',
  'List view (V)': '列表视图（V）',
  'Grid view (V)': '网格视图（V）',
  'Sort: %@': '排序：%@',
  'Contents (T)': '目录（T）',
  'Annotations (B)': '标注（B）',
  'Shortcuts (?)': '快捷键（?）',
  'Back to library (Q)': '返回书库（Q）',
  'Search titles': '搜索标题',
  Clear: '清除',
  '%d documents': '%d 本文档',
  '%1$d of %2$d match': '匹配 %1$d / %2$d 篇',

  // Library page
  Select: '选择',
  View: '视图',
  'Grid / list view': '网格 / 列表视图',
  Open: '打开',
  Notes: '笔记',
  'No document named “%@”': '没有名为“%@”的文档',
  'Clear search': '清除搜索',
  'No documents yet': '还没有文档',
  'Open a PDF to start reading. Everything you open stays here with its last position and notes.':
    '打开一个 PDF 开始阅读。你打开过的文档都会留在这里，连同阅读位置和笔记。',
  'Open PDF...': '打开 PDF…',
  'Show in Finder': '在访达中显示',
  'Show in Explorer': '在资源管理器中显示',
  'Show in File Manager': '在文件管理器中显示',
  'Remove from Shelf': '从书架移除',
  Language: '语言',
  'Not opened yet': '尚未打开',
  'Page %1$d of %2$d · %3$d%%': '第 %1$d / %2$d 页 · %3$d%%',

  // Annotations sidebar
  Annotations: '标注',
  'No annotations yet': '还没有标注',
  'H highlights, N adds a note': 'H 高亮，N 记笔记',
  'Notes (%d)': '笔记（%d）',
  'Highlights (%d)': '高亮（%d）',

  // Contents sidebar
  Contents: '目录',
  'No contents in this PDF': '这个 PDF 没有目录',

  // Shelf sorting
  'Recently opened': '最近打开',
  'Longest ago opened': '最久未打开',
  'Title A–Z': '标题 A–Z',
  'Title Z–A': '标题 Z–A',
  'Most pages': '页数最多',
  'Furthest read': '读得最远',
  'Most notes': '笔记最多',

  // Status messages
  'Note updated': '笔记已更新',
  'File is no longer available': '文件已无法访问',
  'Cannot open %@': '无法打开 %@',
  'No table of contents in this document': '这份文档没有目录',
  'Already in the last section': '已经在最后一节',
  'Already in the first section': '已经在第一节',
  'Zoom %d%%': '缩放 %d%%',
  'Nothing to delete here': '这里没有可删除的内容',
  'Nothing to undo': '没有可撤销的操作',
  'Paragraph copied': '段落已复制',
  'No matches for “%@”': '没有找到“%@”',
  'No notes to export': '没有可导出的笔记',
  'Exported %@': '已导出 %@',
  'Export failed': '导出失败',

  // Menus and the about panel
  'About VimPDF': '关于 VimPDF',
  'VimPDF Help': 'VimPDF 帮助',
  'PDF Reader for Vim Enthusiast': '为 Vim 爱好者打造的 PDF 阅读器',
  'Made by Qwen, Qoder.': '由 Qwen、Qoder 制作。',
  'Designed in Jinjiang, China.': '于中国晋江设计。',

  // Export
  '(Page %d)': '（第 %d 页）',
  '**Note:** %@': '**笔记：** %@',

  // Default reader
  'Make VimPDF the default PDF reader?': '将 VimPDF 设为默认 PDF 阅读器？',
  'VimPDF will open every PDF file on this computer. You can change it back in system settings anytime.':
    '设置后，这台电脑上的 PDF 文件都会用 VimPDF 打开。你可以随时在系统设置中改回去。',
  'VimPDF will open every PDF file on this Mac. You can change it back in System Settings anytime.':
    '设置后，这台 Mac 上的 PDF 文件都会用 VimPDF 打开。你可以随时在系统设置中改回去。',
  'Set as Default': '设为默认',
  'Make default': '设为默认',
  'Not Now': '以后再说',
  'Default PDF reader': '设为默认 PDF 阅读器',
  'Opening system settings…': '正在打开系统设置…',
  'Could not set VimPDF as the default PDF reader': '无法将 VimPDF 设为默认 PDF 阅读器',

  // Misc
  'Detecting paragraphs…': '正在识别段落…',
  'Imported your macOS library': '已导入 macOS 版书库',
  'Page': '页',
  'of': '/',
  'PDF': 'PDF',
  'Untitled': '未命名'
}

export function translate(lang: Language, key: string, ...args: Array<string | number>): string {
  const template = lang === 'zh' ? (zh[key] ?? key) : key
  return format(template, args)
}

function format(template: string, args: Array<string | number>): string {
  const literal = template.replace(/%%/g, '%')
  if (!args.length) return literal
  let out = literal
  out = out.replace(/%(\d+)\$([ds@])/g, (match, position: string, kind: string) => {
    const value = args[Number(position) - 1]
    return value == null ? match : String(value)
  })
  let cursor = 0
  out = out.replace(/%([ds@])/g, (match, kind: string) => {
    if (cursor >= args.length) return match
    const value = args[cursor]
    cursor += 1
    return kind === 'd' ? String(Math.round(Number(value))) : String(value)
  })
  return out
}

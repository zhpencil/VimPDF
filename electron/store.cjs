const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS document(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  bookmark BLOB,
  last_paragraph INTEGER NOT NULL DEFAULT 0,
  last_page INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  opened_at REAL NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  zoom REAL,
  note_card TEXT,
  title TEXT
);
CREATE TABLE IF NOT EXISTS annotation(
  id TEXT PRIMARY KEY,
  document_id INTEGER NOT NULL,
  paragraph_index INTEGER NOT NULL,
  page_index INTEGER NOT NULL,
  anchor TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotation_document ON annotation(document_id);
`

class LibraryStore {
  constructor({ userData, coversDir, legacyRoots = [] }) {
    this.userData = userData
    this.coversDir = coversDir
    this.legacyRoots = legacyRoots
    this.dbPath = path.join(userData, 'library.sqlite')
    this.db = null
    this.saveTimer = null
    this.migratedFrom = null
  }

  async open() {
    fs.mkdirSync(this.userData, { recursive: true })
    fs.mkdirSync(this.coversDir, { recursive: true })
    this.importLegacy()

    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const SQL = await initSqlJs({ locateFile: () => wasmPath })
    const exists = fs.existsSync(this.dbPath)
    this.db = exists
      ? new SQL.Database(new Uint8Array(fs.readFileSync(this.dbPath)))
      : new SQL.Database()
    this.db.run(SCHEMA)
    this.migrateColumns()
    if (!exists) this.saveNow()
    return this
  }

  // The macOS build keeps its library under Application Support/VimPDF. Copy it once so the
  // desktop build opens with the same shelf, positions and notes.
  importLegacy() {
    if (fs.existsSync(this.dbPath)) return
    for (const root of this.legacyRoots) {
      const dbFile = path.join(root, 'library.sqlite')
      if (!fs.existsSync(dbFile)) continue
      fs.copyFileSync(dbFile, this.dbPath)
      const legacyCovers = path.join(root, 'Covers')
      if (fs.existsSync(legacyCovers)) {
        for (const name of fs.readdirSync(legacyCovers)) {
          if (!name.toLowerCase().endsWith('.png')) continue
          try {
            fs.copyFileSync(path.join(legacyCovers, name), path.join(this.coversDir, name))
          } catch { /* a cover is cosmetic; never fail the import over one */ }
        }
      }
      this.migratedFrom = root
      return
    }
  }

  migrateColumns() {
    const names = this.query('PRAGMA table_info(document);').map(row => row.name)
    const add = (name, sql) => {
      if (names.includes(name)) return
      this.db.run(`ALTER TABLE document ADD COLUMN ${sql};`)
    }
    add('zoom', 'zoom REAL')
    add('note_card', 'note_card TEXT')
    add('title', 'title TEXT')
  }

  query(sql, params = []) {
    if (!this.db) return []
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      const rows = []
      while (stmt.step()) rows.push(stmt.getAsObject())
      return rows
    } finally {
      stmt.free()
    }
  }

  run(sql, params = []) {
    if (!this.db) return
    this.db.run(sql, params)
    this.scheduleSave()
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveNow(), 200)
  }

  saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (!this.db) return
    const tmp = `${this.dbPath}.tmp`
    fs.writeFileSync(tmp, Buffer.from(this.db.export()))
    fs.renameSync(tmp, this.dbPath)
  }

  close() {
    this.saveNow()
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  coverUrl(coverPath) {
    if (!coverPath) return null
    const name = path.basename(coverPath)
    if (!fs.existsSync(path.join(this.coversDir, name))) return null
    return `vimpdf://cover/${encodeURIComponent(name)}`
  }

  shelfItems() {
    return this.query(`
      SELECT d.id, d.path, d.last_paragraph, d.last_page, d.page_count, d.opened_at,
             d.cover, d.title,
             (SELECT COUNT(*) FROM annotation a WHERE a.document_id = d.id) AS note_count
      FROM document d
      ORDER BY d.opened_at DESC;
    `).map(row => ({
      id: Number(row.id),
      path: String(row.path),
      lastParagraphIndex: Number(row.last_paragraph) || 0,
      lastPage: Number(row.last_page) || 0,
      pageCount: Number(row.page_count) || 0,
      openedAt: Number(row.opened_at) * 1000,
      coverPath: String(row.cover || ''),
      coverUrl: this.coverUrl(String(row.cover || '')),
      metadataTitle: row.title == null ? null : String(row.title),
      noteCount: Number(row.note_count) || 0
    }))
  }

  register({ filePath, pageCount, title }) {
    const existing = this.query('SELECT id, title FROM document WHERE path = ?;', [filePath])[0]
    const now = Date.now() / 1000
    if (existing) {
      const nextTitle = title || String(existing.title || '')
      this.run('UPDATE document SET opened_at=?, page_count=?, title=? WHERE id=?;',
        [now, pageCount, nextTitle, existing.id])
      return Number(existing.id)
    }
    this.run('INSERT INTO document(path, opened_at, page_count, title) VALUES(?,?,?,?);',
      [filePath, now, pageCount, title || ''])
    return Number(this.query('SELECT last_insert_rowid() AS id;')[0].id)
  }

  savePosition(documentId, paragraph, page) {
    if (!documentId) return
    this.run('UPDATE document SET last_paragraph=?, last_page=? WHERE id=?;',
      [paragraph, page, documentId])
  }

  lastPosition(documentId) {
    if (!documentId) return null
    const row = this.query('SELECT last_paragraph, last_page FROM document WHERE id=?;', [documentId])[0]
    if (!row) return null
    return { paragraph: Number(row.last_paragraph) || 0, page: Number(row.last_page) || 0 }
  }

  zoom(documentId) {
    if (!documentId) return null
    const row = this.query('SELECT zoom FROM document WHERE id=?;', [documentId])[0]
    if (!row || row.zoom == null) return null
    return Number(row.zoom)
  }

  saveZoom(documentId, scale) {
    if (!documentId) return
    this.run('UPDATE document SET zoom=? WHERE id=?;', [scale, documentId])
  }

  noteCard(documentId) {
    if (!documentId) return null
    const row = this.query('SELECT note_card FROM document WHERE id=?;', [documentId])[0]
    return row && row.note_card ? String(row.note_card) : null
  }

  saveNoteCard(documentId, annotationId) {
    if (!documentId) return
    this.run('UPDATE document SET note_card=? WHERE id=?;', [annotationId, documentId])
  }

  saveMetadataTitle(documentId, title) {
    if (!documentId) return
    this.run('UPDATE document SET title=? WHERE id=?;', [title, documentId])
  }

  setCover(documentId, dataUrl) {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '')
    if (!match) return null
    const name = `doc-${documentId}.png`
    const file = path.join(this.coversDir, name)
    fs.writeFileSync(file, Buffer.from(match[1], 'base64'))
    this.run('UPDATE document SET cover=? WHERE id=?;', [file, documentId])
    return `vimpdf://cover/${encodeURIComponent(name)}`
  }

  removeDocument(documentId) {
    const row = this.query('SELECT cover FROM document WHERE id=?;', [documentId])[0]
    this.run('DELETE FROM annotation WHERE document_id=?;', [documentId])
    this.run('DELETE FROM document WHERE id=?;', [documentId])
    if (row && row.cover) {
      try { fs.unlinkSync(String(row.cover)) } catch { /* already gone */ }
    }
  }

  annotations(documentId) {
    return this.query(`
      SELECT id, paragraph_index, page_index, anchor, type, content, created_at
      FROM annotation WHERE document_id=? ORDER BY paragraph_index, created_at;
    `, [documentId]).map(row => ({
      id: String(row.id),
      paragraphIndex: Number(row.paragraph_index) || 0,
      pageIndex: Number(row.page_index) || 0,
      anchor: String(row.anchor || ''),
      type: row.type === 'note' ? 'note' : 'highlight',
      content: String(row.content || ''),
      createdAt: Number(row.created_at) * 1000
    }))
  }

  upsertAnnotation(documentId, annotation, anchor) {
    if (!documentId) return
    this.run(`
      INSERT OR REPLACE INTO annotation
        (id, document_id, paragraph_index, page_index, anchor, type, content, created_at)
      VALUES(?,?,?,?,?,?,?,?);
    `, [
      annotation.id, documentId, annotation.paragraphIndex, annotation.pageIndex,
      anchor || '', annotation.type, annotation.content,
      (annotation.createdAt || Date.now()) / 1000
    ])
  }

  removeAnnotation(annotationId) {
    this.run('DELETE FROM annotation WHERE id=?;', [annotationId])
  }
}

module.exports = { LibraryStore }

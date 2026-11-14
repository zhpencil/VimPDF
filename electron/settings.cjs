const fs = require('node:fs')
const path = require('node:path')

class Settings {
  constructor(userData) {
    this.file = path.join(userData, 'settings.json')
    this.data = {
      language: null,
      shelfViewMode: 'grid',
      windowBounds: null
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (raw && typeof raw === 'object') Object.assign(this.data, raw)
    } catch { /* first run: defaults are fine */ }
  }

  get(key) {
    return key ? this.data[key] : { ...this.data }
  }

  patch(values) {
    Object.assign(this.data, values || {})
    this.flush()
    return { ...this.data }
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    } catch { /* a lost preference is not worth failing the app over */ }
  }
}

module.exports = { Settings }

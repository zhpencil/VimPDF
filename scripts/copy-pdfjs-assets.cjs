const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = path.join(root, 'node_modules/pdfjs-dist')
const target = path.join(root, 'public/pdfjs')

for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const from = path.join(source, directory)
  const to = path.join(target, directory)
  if (!fs.existsSync(from)) continue
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

fs.mkdirSync(target, { recursive: true })
console.log('pdf.js assets ready in public/pdfjs')

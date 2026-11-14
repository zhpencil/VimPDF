import { Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Paragraph, ParagraphKind, Rect } from '../types'

interface TextLine {
  text: string
  rect: Rect
  baseline: number
  fontSize: number
  column: number
  band: number
  spanning: boolean
  kind: ParagraphKind
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f\u3040-\u30ff\uac00-\ud7af]/
const SENTENCE_END = /[.!?。！？：:；;”"』】]$/
const CAPTION = /^(fig(?:ure)?\.?|table|图|表)\s*\d+/i
const LIST = /^([•·‣▪◦*\-–—]|\d+[.)、]|[（(]\d+[)）])\s+/
const CJK_END = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]$/

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x, y, width: right - x, height: bottom - y }
}

interface RawItem {
  text: string
  x: number
  baseline: number
  width: number
  fontSize: number
}

export async function extractLines(page: PDFPageProxy): Promise<TextLine[]> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items: RawItem[] = []

  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const text = raw.str
    if (!text) continue
    const tx = Util.transform(viewport.transform, raw.transform ?? [1, 0, 0, 1, 0, 0])
    // Rotated stamps and watermarks read as noise; the macOS build drops them too.
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue
    const fontSize = Math.hypot(tx[2], tx[3]) || Math.abs(tx[3])
    if (!Number.isFinite(fontSize) || fontSize <= 0.5) continue
    const width = Math.abs(raw.width ?? 0) * viewport.scale
    if (width <= 0.1) continue
    items.push({ text, x: tx[4], baseline: tx[5], width, fontSize })
  }
  if (!items.length) return []

  items.sort((a, b) => a.baseline - b.baseline || a.x - b.x)

  const pageWidth = viewport.width
  const pdfLines: TextLine[] = []
  let index = 0
  while (index < items.length) {
    const first = items[index]
    const tolerance = Math.max(2, first.fontSize * 0.4)
    const group: RawItem[] = [first]
    index += 1
    while (index < items.length && Math.abs(items[index].baseline - first.baseline) <= tolerance) {
      group.push(items[index])
      index += 1
    }
    group.sort((a, b) => a.x - b.x)

    let segment: RawItem[] = []
    const flush = () => {
      if (!segment.length) return
      const fontSize = median(segment.map((item) => item.fontSize)) || segment[0].fontSize
      let text = ''
      let right = segment[0].x
      let previousText = ''
      for (const item of segment) {
        const gap = item.x - right
        const lastChar = previousText.slice(-1)
        const firstChar = item.text.slice(0, 1)
        const joinsWithoutSpace = CJK.test(lastChar) && CJK.test(firstChar)
        if (
          text.length > 0 && gap > fontSize * 0.25 && !joinsWithoutSpace &&
          !/\s$/.test(text) && !/^\s/.test(item.text)
        ) {
          text += ' '
        }
        text += item.text
        previousText = item.text
        right = Math.max(right, item.x + item.width)
      }
      const trimmed = text.trim()
      if (trimmed.length) {
        const rect = {
          x: segment[0].x,
          y: first.baseline - fontSize * 0.8,
          width: right - segment[0].x,
          height: fontSize * 1.04
        }
        pdfLines.push({
          text: trimmed,
          rect,
          baseline: first.baseline,
          fontSize,
          column: 0,
          band: 0,
          spanning: false,
          kind: 'body'
        })
      }
      segment = []
    }

    for (const item of group) {
      if (segment.length) {
        const previous = segment[segment.length - 1]
        const gap = item.x - (previous.x + previous.width)
        const splitGap = Math.max(fontSizeThreshold(segment) * 2.2, pageWidth * 0.04)
        if (gap > splitGap) flush()
      }
      segment.push(item)
    }
    flush()
  }

  const medianSize = median(pdfLines.map((line) => line.fontSize))
  const lines = pdfLines.filter((line) => line.fontSize <= medianSize * 3)

  assignLayout(lines, medianSize, pageWidth)
  classify(lines, medianSize)
  return lines
}

function fontSizeThreshold(group: RawItem[]): number {
  return median(group.map((item) => item.fontSize)) || group[0].fontSize
}

function assignLayout(lines: TextLine[], bodySize: number, pageWidth: number): void {
  if (!lines.length) return
  const bin = Math.max(6, bodySize * 1.2)
  const counts = new Map<number, number>()
  for (const line of lines) {
    const key = Math.round(line.rect.x / bin)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const threshold = Math.max(3, Math.ceil(lines.length * 0.12))
  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => a[0] - b[0])

  const merged: Array<{ x: number; count: number }> = []
  for (const [key, count] of candidates) {
    const x = key * bin
    const last = merged[merged.length - 1]
    if (last && x - last.x <= bin * 1.1) {
      last.count += count
    } else {
      merged.push({ x, count })
    }
  }

  const edges: number[] = []
  for (const candidate of merged) {
    if (!edges.length) {
      edges.push(candidate.x)
      continue
    }
    const previous = edges[edges.length - 1]
    if (candidate.x - previous < pageWidth * 0.16) continue
    const crossing = lines.filter(
      (line) => Math.abs(line.rect.x - previous) < bin && line.rect.x + line.rect.width > candidate.x + 2
    ).length
    if (crossing <= lines.length * 0.06) edges.push(candidate.x)
  }
  if (!edges.length) edges.push(Math.min(...lines.map((line) => line.rect.x)))

  const columnOf = (line: TextLine): number => {
    let column = 0
    for (let i = 0; i < edges.length; i += 1) {
      if (line.rect.x >= edges[i] - bin * 0.5) column = i
    }
    return column
  }

  for (const line of lines) {
    line.column = columnOf(line)
    const next = edges[line.column + 1]
    if (next != null && line.rect.x + line.rect.width > next + bodySize * 2 && line.column === 0) {
      line.spanning = true
    }
  }

  const ordered = [...lines].sort((a, b) => a.baseline - b.baseline || a.rect.x - b.rect.x)
  const bands: TextLine[][] = []
  let band: TextLine[] = []
  for (const line of ordered) {
    if (line.spanning) {
      if (band.length) bands.push(band)
      bands.push([line])
      band = []
    } else {
      band.push(line)
    }
  }
  if (band.length) bands.push(band)

  bands.sort((a, b) => a[0].baseline - b[0].baseline)
  bands.forEach((group, bandIndex) => {
    group.sort((a, b) => a.column - b.column || a.baseline - b.baseline || a.rect.x - b.rect.x)
    group.forEach((line) => { line.band = bandIndex })
  })
  lines.sort((a, b) => a.band - b.band || a.column - b.column || a.baseline - b.baseline || a.rect.x - b.rect.x)
}

function classify(lines: TextLine[], bodySize: number): void {
  for (const line of lines) {
    const columnLines = lines.filter((other) => other.column === line.column)
    const referenceWidth = median(columnLines.map((other) => other.rect.width)) || line.rect.width
    if (CAPTION.test(line.text)) {
      line.kind = 'caption'
    } else if (LIST.test(line.text)) {
      line.kind = 'list'
    } else if (
      (line.fontSize > bodySize * 1.05 && line.rect.width < referenceWidth * 0.9) ||
      line.fontSize > bodySize * 1.3 ||
      (/^\d+(\.\d+)*\s+\S/.test(line.text) && line.fontSize >= bodySize * 1.02)
    ) {
      line.kind = 'heading'
    } else {
      line.kind = 'body'
    }
  }
}

function joinLineText(previous: string, next: string): string {
  if (previous.endsWith('-') && /^[a-z]/.test(next)) {
    return previous.slice(0, -1) + next
  }
  const lastChar = previous.slice(-1)
  const firstChar = next.slice(0, 1)
  if (CJK_END.test(lastChar) || CJK.test(firstChar)) return previous + next
  return `${previous} ${next}`
}

export function buildParagraphs(
  lines: TextLine[],
  pageIndex: number,
  firstIndex: number
): Paragraph[] {
  if (!lines.length) return []
  const bodySize = median(lines.filter((line) => line.kind === 'body').map((line) => line.fontSize)) ||
    median(lines.map((line) => line.fontSize))

  const gaps: number[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const previous = lines[i - 1]
    const current = lines[i]
    if (previous.band !== current.band || previous.column !== current.column) continue
    const gap = current.rect.y - (previous.rect.y + previous.rect.height)
    if (gap > -2) gaps.push(gap)
  }
  const g0 = median(gaps) || bodySize * 0.35
  const paragraphGap = Math.max(g0 + bodySize * 0.3, g0 * 1.5)

  const columnLefts = new Map<number, number>()
  const columnWidths = new Map<number, number>()
  for (const line of lines) {
    const key = line.column
    const current = columnLefts.get(key)
    if (current == null || line.rect.x < current) columnLefts.set(key, line.rect.x)
  }
  for (const key of columnLefts.keys()) {
    const widths = lines.filter((line) => line.column === key).map((line) => line.rect.width)
    columnWidths.set(key, median(widths))
  }

  const paragraphs: Paragraph[] = []
  let buffer: TextLine[] = []

  const flush = () => {
    if (!buffer.length) return
    let text = buffer[0].text
    for (let i = 1; i < buffer.length; i += 1) text = joinLineText(text, buffer[i].text)
    const kind = buffer[0].kind
    paragraphs.push({
      index: firstIndex + paragraphs.length,
      pageIndex,
      text,
      searchKey: text.slice(0, 40),
      kind,
      rect: unionRect(buffer.map((line) => line.rect)),
      lineRects: buffer.map((line) => line.rect),
      fontSize: buffer[0].fontSize
    })
    buffer = []
  }

  for (const line of lines) {
    if (!buffer.length) {
      buffer.push(line)
      continue
    }
    const previous = buffer[buffer.length - 1]
    const gap = line.rect.y - (previous.rect.y + previous.rect.height)
    const columnLeft = columnLefts.get(line.column) ?? line.rect.x
    const indent = line.rect.x - columnLeft
    const referenceWidth = columnWidths.get(line.column) || line.rect.width

    let breaks = false
    if (line.band !== previous.band || line.column !== previous.column) breaks = true
    else if (previous.kind === 'heading' || line.kind === 'heading') breaks = true
    else if (line.kind === 'caption' && previous.kind !== 'caption') breaks = true
    else if (line.kind === 'list' && previous.kind !== 'list') breaks = true
    else if (gap > paragraphGap) breaks = true
    else if (
      SENTENCE_END.test(previous.text) && indent > bodySize * 0.6
    ) breaks = true
    else if (
      previous.rect.width < referenceWidth * 0.72 && gap > g0 * 1.05 &&
      previous.kind === 'body'
    ) breaks = true

    if (breaks) {
      flush()
      buffer.push(line)
    } else {
      buffer.push(line)
    }
  }
  flush()
  return paragraphs
}

export function hasTextLayer(lines: TextLine[]): boolean {
  return lines.length > 0
}

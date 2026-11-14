import type { Paragraph, Rect } from '../types'

export interface ParagraphMatch {
  paragraphIndex: number
  rects: Rect[]
}

/// Where an occurrence sits on the page, without a text layer to measure glyphs: the paragraph's
/// lines are known in reading order, so the match is distributed across them by character count.
/// Latin runs are only approximate, but a hit is always underlined on the line it was found on
/// rather than over the whole paragraph, which is what the reader needs to see.
function rectsFor(paragraph: Paragraph, start: number, end: number): Rect[] {
  const lineTexts = paragraph.lineTexts ?? []
  const rects: Rect[] = []
  let cursor = 0

  for (let index = 0; index < lineTexts.length; index += 1) {
    const text = lineTexts[index]
    const lineStart = cursor
    const lineEnd = lineStart + text.length
    cursor = lineEnd + 1
    const rect = paragraph.lineRects[index]
    if (!rect || !text.length) continue
    const from = Math.max(start, lineStart) - lineStart
    const to = Math.min(end, lineEnd) - lineStart
    if (to <= from) continue
    const left = rect.x + (rect.width * from) / text.length
    const right = rect.x + (rect.width * to) / text.length
    if (right <= left) continue
    rects.push({ x: left, y: rect.y, width: right - left, height: rect.height })
  }

  return rects
}

export function findParagraphMatches(paragraph: Paragraph, needle: string): ParagraphMatch[] {
  if (!needle) return []
  const text = paragraph.text.toLowerCase()
  const matches: ParagraphMatch[] = []
  let from = 0
  for (;;) {
    const at = text.indexOf(needle, from)
    if (at < 0) break
    matches.push({
      paragraphIndex: paragraph.index,
      rects: rectsFor(paragraph, at, at + needle.length)
    })
    from = at + needle.length
  }
  return matches
}

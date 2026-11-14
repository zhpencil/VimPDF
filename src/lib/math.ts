export interface MathSpan {
  start: number
  end: number
  tex: string
  display: boolean
}

const CJK_RANGES: Array<[number, number]> = [
  [0x2e80, 0x2fff],
  [0x3000, 0x303f],
  [0x3040, 0x30ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xff00, 0xffef]
]

function isChineseCode(code: number): boolean {
  return CJK_RANGES.some(([from, to]) => code >= from && code <= to)
}

/**
 * Port of the Swift MathText parser: a single dollar must close on the same line, a lone `$5`
 * cannot swallow the paragraph, backslash escapes are skipped, a dollar followed directly by TeX
 * is read as an opener rather than a closer, and Chinese prose inside the run disqualifies it.
 */
export function mathSpans(text: string): MathSpan[] {
  const spans: MathSpan[] = []
  let i = 0
  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code === 92) {
      i += 2
      continue
    }
    if (code !== 36) {
      i += 1
      continue
    }
    const isDouble = i + 1 < text.length && text.charCodeAt(i + 1) === 36
    const openLength = isDouble ? 2 : 1
    let close = i + openLength
    let found = false
    while (close < text.length) {
      const c = text.charCodeAt(close)
      if (c === 92) {
        close += 2
        continue
      }
      if (!isDouble && c === 10) break
      if (c === 36) {
        if (isDouble) {
          if (close + 1 < text.length && text.charCodeAt(close + 1) === 36) {
            found = true
            break
          }
          close += 1
        } else {
          if (opensFormula(text, close)) break
          found = true
          break
        }
      } else {
        close += 1
      }
    }
    if (!found) {
      i += openLength
      continue
    }
    const closeLength = isDouble ? 2 : 1
    const tex = text.slice(i + openLength, close).trim()
    const end = close + closeLength
    if (tex.length > 0 && !containsProse(tex)) {
      spans.push({ start: i, end, tex, display: isDouble })
    }
    i = end
  }
  return spans
}

function opensFormula(text: string, index: number): boolean {
  if (index + 1 >= text.length) return false
  const next = text.charCodeAt(index + 1)
  const isTexStart =
    next === 92 || next === 94 || next === 95 || next === 123 ||
    (next >= 48 && next <= 57) || (next >= 65 && next <= 90) || (next >= 97 && next <= 122)
  if (!isTexStart) return false
  if (index === 0) return true
  const prev = text.charCodeAt(index - 1)
  const isWordish =
    (prev >= 48 && prev <= 57) || (prev >= 65 && prev <= 90) || (prev >= 97 && prev <= 122) ||
    prev === 125 || prev === 41 || prev === 93 || prev === 39
  return !isWordish
}

function containsProse(tex: string): boolean {
  const labels = ['text', 'mathrm', 'mbox', 'operatorname']
  let i = 0
  while (i < tex.length) {
    const c = tex.charCodeAt(i)
    if (c === 92) {
      const wordStart = i + 1
      let wordEnd = wordStart
      while (wordEnd < tex.length) {
        const w = tex.charCodeAt(wordEnd)
        if (!((w >= 65 && w <= 90) || (w >= 97 && w <= 122))) break
        wordEnd += 1
      }
      const word = tex.slice(wordStart, wordEnd)
      if (labels.includes(word)) {
        let j = wordEnd
        while (j < tex.length && tex.charCodeAt(j) === 32) j += 1
        if (j < tex.length && tex.charCodeAt(j) === 123) {
          let depth = 0
          while (j < tex.length) {
            const d = tex.charCodeAt(j)
            if (d === 92) {
              j += 2
              continue
            }
            if (d === 123) depth += 1
            if (d === 125) {
              depth -= 1
              if (depth === 0) {
                j += 1
                break
              }
            }
            j += 1
          }
          i = j
          continue
        }
      }
      i = Math.max(i + 2, wordEnd)
      continue
    }
    if (isChineseCode(c)) return true
    i += 1
  }
  return false
}

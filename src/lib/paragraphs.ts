import { Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Paragraph, ParagraphKind, Rect } from '../types'

export interface TextLine {
  text: string
  rect: Rect
  fontSize: number
  boldChars: number
  significantChars: number
}

interface Fragment {
  text: string
  rect: Rect
  fontSize: number
  boldChars: number
  significantChars: number
}

interface Typography {
  face: number
  height: number
  bin: number
  lineGap: number
  paraGap: number
  blockGap: number | null
}

interface Piece {
  columns: TextLine[][]
  edges: number[]
  alone: boolean
  absorbable: boolean
}

interface Measure {
  left: number
  right: number
}

// PDFKit reports a selection line's box as roughly the cap-to-descender band of the glyphs,
// which is what the macOS detector was tuned against; pdf.js only exposes the face size, so the
// same band is reconstructed from it.
const LINE_ASCENT = 0.68
const LINE_HEIGHT = 0.89

const medianValue = (values: number[]): number => {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// A block can hold a figure's labels beside the running text. The face the block is set in is
// the one that carries most of its characters, not the one most of its lines happen to use.
function weightedMedian(values: number[], weights: number[]): number {
  if (!values.length) return 0
  const pairs = values.map((value, index) => ({ value, weight: Math.max(weights[index] ?? 1, 1) }))
  pairs.sort((a, b) => a.value - b.value)
  const total = pairs.reduce((sum, pair) => sum + pair.weight, 0)
  let running = 0
  for (const pair of pairs) {
    running += pair.weight
    if (running >= total / 2) return pair.value
  }
  return pairs[pairs.length - 1].value
}

const quantile = (sorted: number[], fraction: number): number => {
  if (!sorted.length) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)))
  return sorted[index]
}

const nonSpaceChars = (text: string): number => {
  let count = 0
  for (const char of text) if (!/\s/.test(char)) count += 1
  return count
}

const unionRect = (rects: Rect[]): Rect => {
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x, y, width: right - x, height: bottom - y }
}

const midY = (rect: Rect): number => rect.y + rect.height / 2

// Two boxes overlap most of their height when a subscript or a display fraction drags one a
// few points off the other's baseline.
function isSameVisualLine(a: Rect, b: Rect): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  const smaller = Math.min(a.height, b.height)
  if (!(smaller > 0) || overlap <= smaller * 0.5) return false
  // A subscript's box sits lower and smaller than the line it belongs to; only a line on the
  // neighbouring row clears the overlap test above and lands further than this.
  return Math.abs(midY(a) - midY(b)) < smaller * 0.6
}

// MARK: - Visual Line Reconstruction

function groupIntoRows<T extends { rect: Rect }>(lines: T[]): T[][] {
  const rows: T[][] = []
  for (const line of lines.slice().sort((a, b) => midY(a.rect) - midY(b.rect))) {
    const anchor = rows.length ? rows[rows.length - 1][0] : null
    if (anchor && isSameVisualLine(anchor.rect, line.rect)) rows[rows.length - 1].push(line)
    else rows.push([line])
  }
  return rows
}

const topToBottom = (lines: TextLine[]): TextLine[] =>
  groupIntoRows(lines).flatMap((row) => row.slice().sort((a, b) => a.rect.x - b.rect.x))

// A margin is found to within a bin, so an edge sits up to half a bin away from the true one.
// The leftmost edge is the page margin, which every line shares, so only the ones after it can
// mark a column break.
function crossesColumnMargin(group: Rect, next: Rect, edges: number[], bin: number): boolean {
  if (edges.length <= 1) return false
  return edges.slice(1).some((edge) => group.x + group.width < edge && next.x > edge - bin)
}

// A line that mixes fonts (run-in bold heads, math, italics) reaches the text layer as several
// runs. Rejoin the runs that share one baseline, left to right, so they are not read as short
// lines that break paragraphs apart.
function mergeRowFragments(fragments: Fragment[], edges: number[], bin: number): TextLine[] {
  const ordered = fragments.slice().sort((a, b) => a.rect.x - b.rect.x)
  const result: TextLine[] = []
  let group: Fragment[] = []
  let groupRect: Rect | null = null

  const flush = () => {
    if (!group.length) return
    result.push(combineFragments(group))
    group = []
    groupRect = null
  }

  for (const fragment of ordered) {
    if (!group.length || !groupRect) {
      group = [fragment]
      groupRect = fragment.rect
      continue
    }
    const anchor = group[0]
    // Runs may pad their glyph boxes, so neighbours on one line can overlap by a point or two.
    const gap = fragment.rect.x - (groupRect.x + groupRect.width)
    if (gap >= anchor.rect.height * 1.2 || crossesColumnMargin(groupRect, fragment.rect, edges, bin)) {
      flush()
      group = [fragment]
      groupRect = fragment.rect
      continue
    }
    group.push(fragment)
    groupRect = unionRect([groupRect, fragment.rect])
  }
  flush()
  return result
}

function joinFragmentText(fragments: Fragment[]): string {
  let joined = ''
  let right = 0
  let started = false
  for (const fragment of fragments) {
    const text = fragment.text.replace(/[\r\n]/g, ' ')
    const gap = fragment.rect.x - right
    const joinsWithoutSpace = isCJK(joined.slice(-1)) && isCJK(text.trimStart().slice(0, 1))
    if (
      started &&
      gap > fragment.fontSize * 0.25 &&
      !/\s$/.test(joined) &&
      !/^\s/.test(text) &&
      !joinsWithoutSpace
    ) {
      joined += ' '
    }
    joined += text
    right = Math.max(right, fragment.rect.x + fragment.rect.width)
    started = true
  }
  return joined.trim().replace(/[ \t]+/g, ' ')
}

function combineFragments(fragments: Fragment[]): TextLine {
  const ordered = fragments.slice().sort((a, b) => a.rect.x - b.rect.x)
  const dominant = ordered.reduce(
    (best, fragment) => (fragment.significantChars > best.significantChars ? fragment : best),
    ordered[0]
  )
  return {
    text: joinFragmentText(ordered),
    rect: unionRect(ordered.map((fragment) => fragment.rect)),
    fontSize: dominant.fontSize,
    boldChars: ordered.reduce((sum, fragment) => sum + fragment.boldChars, 0),
    significantChars: ordered.reduce((sum, fragment) => sum + fragment.significantChars, 0)
  }
}

export async function extractLines(page: PDFPageProxy): Promise<TextLine[]> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const fragments: Fragment[] = []

  for (const raw of content.items) {
    if (!('str' in raw)) continue
    if (!raw.str) continue
    const tx = Util.transform(viewport.transform, raw.transform ?? [1, 0, 0, 1, 0, 0])
    // Rotated stamps and watermarks read as noise; the macOS build drops them too.
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue
    const face = Math.hypot(tx[2], tx[3])
    if (!Number.isFinite(face) || face <= 0.5) continue
    const width = Math.abs(raw.width ?? 0) * viewport.scale
    if (width <= 0.1) continue
    // The macOS detector works in whole point sizes, which is what the page sets.
    const fontSize = Math.max(1, Math.round(face))
    fragments.push({
      text: raw.str,
      rect: {
        x: tx[4],
        y: tx[5] - fontSize * LINE_ASCENT,
        width,
        height: fontSize * LINE_HEIGHT
      },
      fontSize,
      boldChars: 0,
      significantChars: nonSpaceChars(raw.str)
    })
  }
  if (!fragments.length) return []

  const pageFace = medianValue(fragments.map((fragment) => fragment.fontSize))
  const bin = Math.max(MINIMUM_MARGIN_BIN, pageFace * BIN_PER_FACE)
  const rows = groupIntoRows(fragments)

  // The margins are found before the pieces are rejoined, so the join can be told apart from a
  // column break: a run-in bold head sits inside one margin, a neighbour column starts beyond it.
  const merged: TextLine[] = rows.flatMap((row) => mergeRowFragments(row, [], bin))
  const edges = columnLeftEdges(merged, bin)

  let lines = rows.flatMap((row) => mergeRowFragments(row, edges, bin))
  const heights = lines.map((line) => line.rect.height).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] || 0
  lines = lines.filter((line) => line.rect.height <= medianHeight * TALL_LINE_FACTOR)
  return lines
}

// MARK: - Column Left Edges

function columnLeftEdges(lines: TextLine[], bin: number): number[] {
  const starts = new Map<number, number>()
  for (const line of lines) {
    const key = Math.floor(line.rect.x / bin)
    starts.set(key, (starts.get(key) ?? 0) + 1)
  }
  if (!starts.size) return []
  const keys = [...starts.keys()].sort((a, b) => a - b)
  const threshold = Math.max(MINIMUM_MARGIN_LINES, Math.floor(lines.length * MARGIN_SHARE))

  // A margin is a bin that holds a full column of line starts on its own: a neighbour that only
  // looks busy because of the lines it borrowed from the bin beside it is the same rule read
  // twice, so of two bins next to each other the one where the lines actually are wins.
  const marginBins: number[] = []
  const linesAt: number[] = []
  for (let index = keys[0]; index <= keys[keys.length - 1]; index += 1) {
    const here = starts.get(index) ?? 0
    if (here < threshold) continue
    const clash = marginBins.findIndex((value) => Math.abs(value - index) < 2)
    if (clash >= 0) {
      if (linesAt[clash] >= here) continue
      marginBins.splice(clash, 1)
      linesAt.splice(clash, 1)
    }
    marginBins.push(index)
    linesAt.push(here)
  }
  const margins = marginBins.map((key) => (key + 0.5) * bin)

  // A margin is a column only when the column beside it stops short of it. An indented line
  // starts further in yet is read straight across the gap, so a margin that most of the text to
  // its left runs over marks an indent rather than a gutter.
  const kept: number[] = []
  for (const edge of margins) {
    if (kept.length) {
      const last = kept[kept.length - 1]
      const home = margins.indexOf(last)
      const left = lines.filter((line) => nearestEdge(line.rect.x, margins) === home)
      const across = left.filter((line) => line.rect.x + line.rect.width > edge).length
      if (left.length && across * 2 > left.length) continue
    }
    kept.push(edge)
  }
  return kept
}

function nearestEdge(x: number, edges: number[]): number {
  let best = 0
  let bestDistance = Infinity
  edges.forEach((edge, index) => {
    const distance = Math.abs(x - edge)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

function columnsInRegion(lines: TextLine[], edges: number[], bin: number): TextLine[][] {
  const buckets: TextLine[][] = edges.map(() => [])
  for (const line of lines) buckets[homeOf(line, edges, bin)].push(line)
  return buckets.filter((bucket) => bucket.length)
}

// A line is read in the column whose margin its start sits nearest — unless none of its ink
// reaches that margin: a display equation centred in the left column belongs where it is printed.
function homeOf(line: TextLine, edges: number[], bin: number): number {
  let home = nearestEdge(line.rect.x, edges)
  while (home > 0 && line.rect.x + line.rect.width < edges[home] - bin / 2) home -= 1
  return home
}

// MARK: - Reading Order

function pageColumnGaps(lines: TextLine[], edges: number[], bin: number): number[] {
  if (edges.length <= 1) return columnGaps(topToBottom(lines))
  return columnsInRegion(lines, edges, bin).flatMap((column) => columnGaps(topToBottom(column)))
}

function columnGaps(lines: TextLine[]): number[] {
  if (lines.length < 2) return []
  const gaps: number[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const gap = lines[i].rect.y - (lines[i - 1].rect.y + lines[i - 1].rect.height)
    if (gap > 0) gaps.push(gap)
  }
  return gaps
}

// A gap only opens a band when the whole page leaves that strip empty. A paragraph ending early
// in one column is not such a gap: the neighbouring column still reaches across it.
function bands(rows: TextLine[][], minGap: number): TextLine[][] {
  const result: TextLine[][] = []
  let current: TextLine[] = []
  let foot = 0
  for (const row of rows) {
    const top = Math.min(...row.map((line) => line.rect.y))
    if (current.length && top - foot > minGap) {
      result.push(current)
      current = []
    }
    current.push(...row)
    foot = Math.max(...row.map((line) => line.rect.y + line.rect.height))
  }
  if (current.length) result.push(current)
  return result
}

function measures(columns: TextLine[][]): Measure[] {
  return columns.map((column) => ({
    left: quantile(column.map((line) => line.rect.x).sort((a, b) => a - b), 0.2),
    right: quantile(column.map((line) => line.rect.x + line.rect.width).sort((a, b) => a - b), 0.8)
  }))
}

function columnHomes(lines: TextLine[], region: Piece): number[] | null {
  if (region.columns.length <= 1) return null
  const columnMeasures = measures(region.columns)
  const homes: number[] = []
  for (const line of lines) {
    const home = columnMeasures.findIndex((measure) => {
      const slack = Math.max(measure.right - measure.left, 0) * MEASURE_SLACK
      return line.rect.x >= measure.left - slack &&
        line.rect.x + line.rect.width <= measure.right + slack
    })
    if (home < 0) return null
    homes.push(home)
  }
  return homes
}

function crossesGutter(rect: Rect, gutters: Array<{ left: number; right: number }>): boolean {
  return gutters.some((gutter) => rect.x < gutter.left && rect.x + rect.width > gutter.right)
}

// Page furniture hangs off the right edge of a column while covering only part of its measure —
// a running header's journal name, a date, a page number — and it sits there alone, with no line
// of that column starting near the margin in the same row.
function isFurniture(line: TextLine, row: TextLine[], columnMeasures: Measure[]): boolean {
  const column = columnMeasures.find(
    (measure) => measure.left <= line.rect.x + line.rect.width / 2 &&
      line.rect.x + line.rect.width / 2 < measure.right
  )
  if (!column) return true
  const measure = column.right - column.left
  if (
    Math.abs(line.rect.x + line.rect.width - column.right) >= measure * FURNITURE_EDGE_SHARE ||
    line.rect.width >= measure * FURNITURE_SHARE
  ) return false
  return !row.some((other) => Math.abs(other.rect.x - column.left) < measure * MARGIN_SEARCH_SHARE)
}

function columnGroup(lines: TextLine[], edges: number[], bin: number): TextLine[][] {
  const columns = columnsInRegion(lines, edges, bin)
  if (columns.length <= 1) return [topToBottom(lines)]
  return columns.map((column) => topToBottom(column))
}

function layoutPieces(band: TextLine[], typography: Typography): Piece[] {
  const edges = columnLeftEdges(band, typography.bin)
  const columns = edges.length > 1 ? columnsInRegion(band, edges, typography.bin) : []
  const flat = (): Piece[] => [{ columns: [topToBottom(band)], edges: [], alone: false, absorbable: false }]
  if (columns.length <= 1) return flat()

  // Where each column usually begins and ends, measured from its own lines rather than the
  // binned margin: material set apart from these edges is page furniture, not column text.
  const columnMeasures = measures(columns)
  const gutters: Array<{ left: number; right: number }> = []
  for (let i = 0; i + 1 < columnMeasures.length; i += 1) {
    const pair = [columnMeasures[i], columnMeasures[i + 1]]
    if (pair[1].left - pair[0].right > typography.face * GUTTER_PER_FACE) {
      gutters.push({ left: pair[0].right, right: pair[1].left })
    }
  }
  if (!gutters.length) return flat()

  const pieces: TextLine[][][] = []
  let sideBySide: TextLine[] = []
  const flush = () => {
    if (!sideBySide.length) return
    pieces.push(columnGroup(sideBySide, edges, typography.bin))
    sideBySide = []
  }
  for (const row of groupIntoRows(band)) {
    const setApart = row.some(
      (line) => crossesGutter(line.rect, gutters) || isFurniture(line, row, columnMeasures)
    )
    if (setApart) {
      flush()
      const last = pieces[pieces.length - 1]
      if (last && last.length === 1) pieces[pieces.length - 1] = [topToBottom(last[0].concat(row))]
      else pieces.push([topToBottom(row)])
      continue
    }
    sideBySide.push(...row)
  }
  flush()

  const columnar = pieces.some((group) => group.length > 1)
  // A flat run only reopens a band's columns once column text has been read above it; the first
  // thing in a band is read before any of them, so it belongs to none.
  let afterColumns = false
  return pieces.map((group) => {
    const isFlat = group.length === 1
    const piece: Piece = {
      columns: group,
      edges,
      alone: columnar && isFlat,
      absorbable: columnar && isFlat && afterColumns
    }
    if (!isFlat) afterColumns = true
    return piece
  })
}

// The columnar region a new piece can still join: the last one, as long as nothing that
// interrupts it belongs to the page rather than to its columns.
function openColumnarRegion(regions: Piece[]): number | null {
  let opened: number | null = null
  for (let i = regions.length - 1; i >= 0; i -= 1) {
    if (regions[i].columns.length > 1) {
      opened = i
      break
    }
  }
  if (opened === null) return null
  return regions.slice(opened + 1).every((region) => region.columns.length === 1 && region.absorbable)
    ? opened
    : null
}

function sameLayout(a: Piece, b: Piece, typography: Typography): boolean {
  if (a.columns.length !== b.columns.length || a.edges.length !== b.columns.length) return false
  return a.edges.every((edge, index) => Math.abs(edge - b.edges[index]) < typography.face * LAYOUT_PER_FACE)
}

// A column runs down the whole page, but a band only holds the rows between two full-width
// interruptions. A piece with the same columns as a region above it continues that region, and
// whatever lies between joins the column it starts in.
function fold(piece: Piece, regions: Piece[], typography: Typography): void {
  if (piece.columns.length === 1) {
    const opened = openColumnarRegion(regions)
    if (opened !== null && (!piece.alone || piece.absorbable)) {
      const homes = columnHomes(piece.columns[0], regions[opened])
      if (homes && homes.every((home) => home === homes[0])) {
        const columns = regions[opened].columns.slice()
        columns[homes[0]] = topToBottom(columns[homes[0]].concat(piece.columns[0]))
        regions[opened] = { columns, edges: regions[opened].edges, alone: false, absorbable: false }
        return
      }
    }
    regions.push(piece)
    return
  }
  const opened = openColumnarRegion(regions)
  if (opened === null || !sameLayout(regions[opened], piece, typography)) {
    regions.push(piece)
    return
  }
  const margins = measures(regions[opened].columns).map((measure) => measure.left)
  let columns = regions[opened].columns.slice()
  for (const between of regions.slice(opened + 1)) {
    for (const line of between.columns[0]) {
      const homes = columnHomes([line], regions[opened])
      const home = homes ? homes[0] : nearestEdge(line.rect.x, margins)
      columns[home] = topToBottom(columns[home].concat([line]))
    }
  }
  regions.splice(opened + 1)
  columns = columns.map((column, index) => topToBottom(column.concat(piece.columns[index])))
  regions[opened] = { columns, edges: piece.edges, alone: false, absorbable: false }
}

// Flat material is not a block of its own where it can lean on a column: a masthead or title is
// read before the body below it, and footnotes after the column above them.
function blocksFrom(regions: Piece[]): TextLine[][] {
  let blocks: TextLine[][] = []
  let flat: TextLine[] = []
  for (const region of regions) {
    if (region.columns.length === 1 && !region.alone) {
      flat.push(...region.columns[0])
      continue
    }
    let start = 0
    if (flat.length) {
      if (!blocks.length && region.columns.length > 1) {
        blocks.push(topToBottom(flat.concat(region.columns[0])))
        start = 1
      } else {
        blocks.push(topToBottom(flat))
      }
      flat = []
    }
    blocks.push(...region.columns.slice(start))
  }
  if (flat.length) {
    if (!blocks.length) blocks = [topToBottom(flat)]
    else blocks[blocks.length - 1] = topToBottom(blocks[blocks.length - 1].concat(flat))
  }
  return blocks
}

function readingBlocks(lines: TextLine[], typography: Typography): TextLine[][] {
  const regions: Piece[] = []
  for (const band of bands(groupIntoRows(lines), typography.height * BAND_LEAD)) {
    for (const piece of layoutPieces(band, typography)) fold(piece, regions, typography)
  }
  return blocksFrom(regions)
}

// MARK: - Paragraph Grouping

interface SpacingMetrics {
  base: number
  midGap: number
  paraGap: number
  figureGap: number
  indentStart: number
  hangSlack: number
}

interface ColumnMetrics {
  colWidth: number
  bodySize: number
  indMode: number
  spacing: SpacingMetrics
}

function spacingMetrics(
  gaps: number[],
  height: number,
  bodySize: number,
  typography: Typography
): SpacingMetrics {
  const em = (bodySize > 0 ? bodySize : typography.face) / height
  const pageBase = typography.lineGap / height
  // How much of the answer the column gets to decide for itself: two lines of a caption are not
  // a sample of the document's rhythm, a page of body text is.
  const sample = Math.min(1, gaps.length / FULL_SAMPLE_GAPS)
  const base = sample * medianValue(gaps) + (1 - sample) * pageBase
  const advance = 1 + base
  // The page's answer, moved onto the column's scale: the two may set their lines at different
  // sizes, and only the ratio between the spaces carries over.
  const scaled = base / Math.max(pageBase, 0.01)

  const cuts = gapCuts(gaps)
  const estimates: Array<{ value: number; weight: number }> = [
    { value: base + PARA_LEAD_EM * em, weight: FACE_WEIGHT }
  ]
  if (cuts) estimates.push({ value: cuts.para, weight: COLUMN_WEIGHT * sample })
  if (typography.lineGap > 0) {
    estimates.push({ value: (typography.paraGap / height) * scaled, weight: PAGE_WEIGHT * (1 - sample) })
  }
  const weightSum = estimates.reduce((sum, estimate) => sum + estimate.weight, 0)
  const weighted = estimates.reduce((sum, estimate) => sum + estimate.value * estimate.weight, 0) / weightSum

  // A blank line of advance is as much room as a typesetter ever leaves between paragraphs of
  // running text, so no blend of estimates is allowed to call a bigger space ordinary.
  const paraGap = Math.min(weighted, base + BLANK_LINE_LEAD * advance)
  // A band with no text in it is where the whitespace says a third kind of gap begins; with no
  // such evidence, one blank line past the paragraph space is the deepest a paragraph's own room
  // ever gets.
  let figure = paraGap + FIGURE_LEAD * advance
  const voids: number[] = []
  if (cuts?.block != null) voids.push(cuts.block)
  if (typography.blockGap != null) voids.push((typography.blockGap / height) * scaled)
  for (const voidGap of voids) if (voidGap > paraGap) figure = Math.min(figure, voidGap)

  return {
    base,
    midGap: base + MID_CUT * (paraGap - base),
    paraGap,
    figureGap: figure,
    indentStart: em * INDENT_START_EM,
    hangSlack: em * HANG_SLACK_EM
  }
}

// A page's whitespace cut into the kinds of room a typesetter leaves: between two lines of one
// block, above a new one, and around a band that holds no text at all. The cut that puts the most
// variance between the groups wins; only a cut's position is used, never a group's mean. A cut is
// only a boundary where the gaps themselves leave a void, and a split that leaves half of the
// page's whitespace below the cut measures nothing.
function gapCuts(gaps: number[]): { para: number; block: number | null } | null {
  const sorted = gaps.filter((gap) => gap > 0).sort((a, b) => a - b)
  const total = sorted.length
  if (total < MINIMUM_CLASS_GAPS) return null
  const room = new Array<number>(total + 1).fill(0)
  const depth = new Array<number>(total + 1).fill(0)
  for (let i = 0; i < total; i += 1) {
    room[i + 1] = room[i] + sorted[i]
    depth[i + 1] = depth[i] + Math.log(sorted[i])
  }
  const mean = (from: number, to: number): number => (room[to] - room[from]) / (to - from)
  const spread = (from: number, to: number): number => (depth[to] - depth[from]) / (to - from)
  const cut = (at: number): number => (sorted[at - 1] + sorted[at]) / 2
  const divides = (at: number): boolean => sorted[at] >= sorted[at - 1] * GAP_JUMP
  const overall = spread(0, total)
  const variance = (groups: Array<[number, number]>): number =>
    groups.reduce(
      (sum, [from, to]) => sum + ((to - from) / total) * Math.pow(spread(from, to) - overall, 2),
      0
    )
  // A group of one stray gap is no population: it is the odd tick label that would drag the cut
  // along with it.
  const thin = Math.max(2, Math.floor(total * THIN_CLASS_SHARE))
  const tight = Math.max(2, Math.floor(total * TIGHT_CLASS_SHARE))

  let three: { score: number; para: number; block: number } | null = null
  if (tight + 2 * thin <= total) {
    for (let i = tight; i <= total - 2 * thin; i += 1) {
      if (!divides(i)) continue
      const lineRoom = mean(0, i)
      for (let j = i + thin; j <= total - thin; j += 1) {
        if (!divides(j)) continue
        const para = mean(i, j)
        if (
          para <= lineRoom * CLASS_RATIO ||
          mean(j, total) <= para * CLASS_RATIO ||
          cut(j) <= cut(i) * BLOCK_LEAD
        ) continue
        const score = variance([[0, i], [i, j], [j, total]])
        if (!three || score > three.score) three = { score, para: cut(i), block: cut(j) }
      }
    }
  }
  if (three) return { para: three.para, block: three.block }

  if (tight + thin > total) return null
  let two: { score: number; para: number } | null = null
  for (let i = tight; i <= total - thin; i += 1) {
    if (!divides(i) || mean(i, total) <= mean(0, i) * CLASS_RATIO) continue
    const score = variance([[0, i], [i, total]])
    if (!two || score > two.score) two = { score, para: cut(i) }
  }
  return two ? { para: two.para, block: null } : null
}

function groupColumnIntoParagraphs(
  lines: TextLine[],
  pageIndex: number,
  typography: Typography
): Paragraph[] {
  if (!lines.length) return []

  const weights = lines.map((line) => Math.max(line.significantChars, 1))
  const medianHeight = weightedMedian(lines.map((line) => line.rect.height), weights)
  // Median width = the column's text width; immune to full-width or indented outliers.
  const colWidth = weightedMedian(lines.map((line) => line.rect.width), weights)
  const bodySize = weightedMedian(lines.map((line) => line.fontSize), weights)
  const colMinX = Math.min(...lines.map((line) => line.rect.x))

  // Whitespace above each line, and its indent, both measured in body-line heights. The column's
  // first line has nothing above it, so it is treated as an open boundary.
  const gapAbove: number[] = [999]
  const indent: number[] = [(lines[0].rect.x - colMinX) / medianHeight]
  for (let i = 1; i < lines.length; i += 1) {
    gapAbove.push((lines[i].rect.y - (lines[i - 1].rect.y + lines[i - 1].rect.height)) / medianHeight)
    indent.push((lines[i].rect.x - colMinX) / medianHeight)
  }

  const metrics: ColumnMetrics = {
    colWidth,
    bodySize,
    // A column that indents most of its lines (a hanging-indent reference list) must not be read
    // as "every continuation starts a new paragraph".
    indMode: medianValue(indent),
    spacing: spacingMetrics(gapAbove.slice(1), medianHeight, bodySize, typography)
  }

  const paragraphs: Paragraph[] = []
  let current: TextLine[] = []
  let currentGaps: number[] = []
  const block: { kind: ParagraphKind } = { kind: 'body' }

  const flush = () => {
    if (!current.length) return
    paragraphs.push(makeParagraph(current, pageIndex, block.kind))
    current = []
    currentGaps = []
  }

  const startBlock = (index: number, head: boolean, caption: boolean) => {
    current = [lines[index]]
    currentGaps = []
    block.kind = head ? 'heading' : caption ? 'caption' : 'body'
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const gap = gapAbove[i]
    // Spacing of the block being built. A column can mix two faces (body above a 10pt reference
    // list), so a title has to clear its own neighbourhood's rhythm, not just the column average.
    const tight = currentGaps.length ? medianValue(currentGaps) : metrics.spacing.base
    const headStart = isHeading(line, metrics, gap, tight)
    const captionStart = !headStart && isCaption(line.text) && gap > metrics.spacing.midGap * 0.8

    if (!current.length) {
      startBlock(i, headStart, captionStart)
      continue
    }
    const previous = current[current.length - 1]

    // A blank band far taller than any paragraph space holds no text: a figure or a display
    // equation. It ends the block, but it is not something to read, so it gets no paragraph.
    if (gap > metrics.spacing.figureGap) {
      flush()
      startBlock(i, headStart, captionStart)
      continue
    }

    let split: boolean
    if (block.kind === 'heading') {
      // Keep a wrapped title together, but stop where the body it introduces resumes.
      const wrapped = gap <= Math.max(metrics.spacing.midGap, tight * 1.5) &&
        (line.fontSize > metrics.bodySize * 1.15 || line.rect.width < metrics.colWidth * 0.6)
      split = !wrapped
    } else if (block.kind === 'caption') {
      // A tight line still belongs to the caption block it started.
      split = gap > metrics.spacing.midGap
    } else if (headStart || captionStart) {
      split = true
    } else if (
      isListStart(line.text) &&
      (gap > metrics.spacing.midGap || indent[i] < metrics.indMode - metrics.spacing.hangSlack)
    ) {
      // Items split on their marker: either the typesetter left room above them, or the line
      // hangs left of the indented run the rest of the list is set at.
      split = true
    } else if (
      gap > metrics.spacing.midGap &&
      gap > tight * RHYTHM_CONTRAST &&
      i + 1 < gapAbove.length &&
      gapAbove[i + 1] < gap / RHYTHM_CONTRAST
    ) {
      // Two zones set with different leading share one column (affiliations above an abstract):
      // the break is the drop back to the tighter rhythm, not the size of the whitespace.
      split = !isLowercaseContinuation(line.text, previous)
    } else if (gap > metrics.spacing.paraGap) {
      split = !isLowercaseContinuation(line.text, previous)
    } else {
      split = isIndentedParagraphStart(previous, line, indent[i], metrics.indMode, metrics.spacing.indentStart)
    }

    if (split) {
      flush()
      startBlock(i, headStart, captionStart)
    } else {
      current.push(line)
      currentGaps.push(gap)
    }
  }

  flush()
  return paragraphs
}

// MARK: - Line Classification

function isHeading(line: TextLine, metrics: ColumnMetrics, gapAbove: number, tight: number): boolean {
  if (gapAbove <= Math.max(metrics.spacing.midGap, tight * 1.5)) return false
  // A page title is much bigger than the body and may span the full measure.
  if (line.fontSize > metrics.bodySize * 1.3) return true
  // Section numbers are set in the body face, so they are checked before the guards that reject
  // full-measure lines and list items.
  if (isNumberedHeading(line, gapAbove, metrics)) return true
  // A heading never runs to the margin, so a bigger face in mid-paragraph — or a full-width line
  // that merely contains tall glyphs — is not one.
  if (line.rect.width >= metrics.colWidth * 0.95 || isListStart(line.text)) return false
  if (line.fontSize > metrics.bodySize * 1.05) return true
  return line.significantChars > 0 && line.boldChars / line.significantChars > 0.8 && line.text.length < 80
}

function isNumberedHeading(line: TextLine, gapAbove: number, metrics: ColumnMetrics): boolean {
  if (gapAbove <= metrics.spacing.paraGap || line.text.length > 60) return false
  const match = /^\d{1,2}(\.\d{1,2})*\p{Z}/u.exec(line.text)
  // "3.1 Subgoal Extraction…" counts; "3. Given that…" is a list item and "2025. Qwen3-vl…" a
  // reference, so neither reaches a separator here.
  if (!match || match[0].length > 5) return false
  return line.rect.width < metrics.colWidth * 0.9
}

function isCaption(text: string): boolean {
  return /^(Figure\s*\d+\s*:|Fig\.\s*\d+\s*:|Table\s*\d+\s*:|图\s*\d+|表\s*\d+)/.test(text)
}

function isListStart(text: string): boolean {
  const first = [...text][0]
  if (!first) return false
  if ('•-–*'.includes(first)) return true
  if (!/^\p{N}/u.test(first)) return false
  // The marker is the leading run of digits plus whatever punctuation closes it:
  // "3. Given that…" and "12. GBD 2019…" are items, "3.1 Subgoal…" and "0.5 fm−3" are not.
  let rest = text.slice(first.length)
  while (/^\p{N}/u.test(rest)) rest = rest.slice(1)
  const mark = rest[0]
  if (!mark) return false
  if (mark === ')' || mark === '、' || mark === '）') return true
  if (mark !== '.') return false
  return !/^\p{N}/u.test(rest.slice(1))
}

const SENTENCE_ENDS = '.!?。！？”"'
const CITATION_TAIL = '0123456789,;-–—&'

// Where a line of text stops, once the superscript reference that follows the full stop is put
// back: "…standardized services.4,5" closed its sentence before the citations did. A point with
// a digit in front of it is a decimal, not an end.
function endsSentence(text: string): boolean {
  const chars = [...text.trim()]
  while (chars.length && CITATION_TAIL.includes(chars[chars.length - 1])) chars.pop()
  const last = chars[chars.length - 1]
  if (!last || !SENTENCE_ENDS.includes(last)) return false
  if (last === '.' && chars.length > 1 && /^\p{N}$/u.test(chars[chars.length - 2])) return false
  return true
}

// Display maths and figures push ordinary lines apart, so a wide gap does not end a paragraph
// when the next line opens with a lowercase word mid-sentence. Case is the whole test, so an
// uncased script cannot claim it.
function isLowercaseContinuation(text: string, previous: TextLine): boolean {
  return /^\p{Ll}/u.test(text) && !endsSentence(previous.text)
}

// A line pushed right of the column's usual margin, following a line that ended a sentence,
// starts a new paragraph even in layouts that add no vertical space between paragraphs.
function isIndentedParagraphStart(
  previous: TextLine,
  current: TextLine,
  indent: number,
  indMode: number,
  indentStart: number
): boolean {
  if (indent <= indMode + indentStart) return false
  const first = [...current.text][0]
  if (!first) return false
  // A script with no case to carry the sentence (Chinese, Japanese) opens a paragraph the same
  // way an uppercase letter does: nothing but the indent says where the last one ended.
  return endsSentence(previous.text) && !/^\p{Ll}/u.test(first)
}

function makeParagraph(lines: TextLine[], pageIndex: number, kind: ParagraphKind): Paragraph {
  const text = lines.map((line) => line.text).join(' ')
  return {
    index: 0,
    pageIndex,
    text,
    searchKey: text.slice(0, 40),
    kind,
    rect: unionRect(lines.map((line) => line.rect)),
    lineRects: lines.map((line) => line.rect),
    lineTexts: lines.map((line) => line.text),
    fontSize: medianValue(lines.map((line) => line.fontSize))
  }
}

// MARK: - Weights

const TALL_LINE_FACTOR = 3
const BIN_PER_FACE = 1.2
const MINIMUM_MARGIN_BIN = 6
const MARGIN_SHARE = 0.125
const MINIMUM_MARGIN_LINES = 3
const BAND_LEAD = 1.5
const GUTTER_PER_FACE = 0.5
const LAYOUT_PER_FACE = 0.6
const FURNITURE_EDGE_SHARE = 0.035
const FURNITURE_SHARE = 0.7
const MARGIN_SEARCH_SHARE = 0.23
const MEASURE_SLACK = 0.06
const FULL_SAMPLE_GAPS = 10
const MINIMUM_CLASS_GAPS = 8
const TIGHT_CLASS_SHARE = 0.5
const THIN_CLASS_SHARE = 0.05
const CLASS_RATIO = 1.5
const GAP_JUMP = 1.6
const BLOCK_LEAD = 2
const PARA_LEAD_EM = 0.35
const BLANK_LINE_LEAD = 0.5
const COLUMN_WEIGHT = 0.5
const PAGE_WEIGHT = 0.3
const FACE_WEIGHT = 0.25
const MID_CUT = 0.55
const FIGURE_LEAD = 2
const RHYTHM_CONTRAST = 1.8
const INDENT_START_EM = 0.6
const HANG_SLACK_EM = 0.24

function isCJK(char: string): boolean {
  return /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f\u3040-\u30ff\uac00-\ud7af]/.test(char)
}

// MARK: - Entry

export function buildParagraphs(
  lines: TextLine[],
  pageIndex: number,
  firstIndex: number
): Paragraph[] {
  if (!lines.length) return []

  const face = medianValue(lines.map((line) => line.fontSize))
  const height = medianValue(lines.map((line) => line.rect.height))
  const bin = Math.max(MINIMUM_MARGIN_BIN, face * BIN_PER_FACE)
  const edges = columnLeftEdges(lines, bin)
  const gaps = pageColumnGaps(lines, edges, bin)
  const cuts = gapCuts(gaps)
  const lineGap = medianValue(gaps)
  const typography: Typography = {
    face,
    height,
    bin,
    lineGap,
    paraGap: cuts?.para ?? lineGap + PARA_LEAD_EM * face,
    blockGap: cuts?.block ?? null
  }

  const blocks = readingBlocks(lines, typography)
  const paragraphs: Paragraph[] = []
  for (const column of blocks) {
    paragraphs.push(...groupColumnIntoParagraphs(column, pageIndex, typography))
  }
  paragraphs.forEach((paragraph, index) => {
    paragraph.index = firstIndex + index
  })
  return paragraphs
}

export function hasTextLayer(lines: TextLine[]): boolean {
  return lines.length > 0
}

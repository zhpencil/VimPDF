import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Paragraph, TocItem } from '../types'

interface OutlineNode {
  title?: string
  dest?: string | unknown[] | null
  items?: OutlineNode[]
}

interface DestTarget {
  pageIndex: number
  top: number | null
}

async function resolveDest(pdf: PDFDocumentProxy, dest: OutlineNode['dest']): Promise<DestTarget | null> {
  if (!dest) return null
  try {
    const resolved = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!Array.isArray(resolved) || !resolved.length) return null
    const pageIndex = await pdf.getPageIndex(resolved[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0])
    let top: number | null = null
    const kind = resolved[1]
    const named = kind && typeof kind === 'object' && 'name' in kind ? String((kind as { name: unknown }).name) : ''
    if (named === 'XYZ') {
      if (typeof resolved[3] === 'number') top = resolved[3]
    } else if (named === 'FitH' || named === 'FitBH') {
      if (typeof resolved[2] === 'number') top = resolved[2]
    } else if (named === 'FitR') {
      if (typeof resolved[5] === 'number') top = resolved[5]
    }
    return { pageIndex, top }
  } catch {
    return null
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function findParagraph(
  paragraphs: Paragraph[],
  pageIndex: number,
  title: string,
  top: number | null,
  pageHeight: number
): number {
  const candidates = paragraphs.filter((paragraph) => paragraph.pageIndex === pageIndex)
  if (!candidates.length) return -1
  const wanted = normalize(title)
  if (wanted.length >= 3) {
    const byTitle = candidates.find((paragraph) => {
      const text = normalize(paragraph.text)
      return text.startsWith(wanted.slice(0, 24)) || text.includes(wanted.slice(0, 24))
    })
    if (byTitle) return byTitle.index
  }
  if (top == null) return candidates[0].index
  const targetY = pageHeight - top
  let best = candidates[0]
  let distance = Number.POSITIVE_INFINITY
  for (const paragraph of candidates) {
    const delta = Math.abs(paragraph.rect.y - targetY)
    if (delta < distance) {
      distance = delta
      best = paragraph
    }
  }
  return best.index
}

export async function buildToc(pdf: PDFDocumentProxy, paragraphs: Paragraph[]): Promise<TocItem[]> {
  const items: TocItem[] = []
  let counter = 0

  let outline: OutlineNode[] | null = null
  try {
    outline = (await pdf.getOutline()) as OutlineNode[] | null
  } catch {
    outline = null
  }

  if (outline && outline.length) {
    const walk = async (nodes: OutlineNode[], depth: number): Promise<void> => {
      for (const node of nodes) {
        const title = String(node.title ?? '').trim()
        const target = await resolveDest(pdf, node.dest ?? null)
        let pageIndex = -1
        let paragraphIndex = -1
        if (target) {
          pageIndex = target.pageIndex
          let pageHeight = 792
          try {
            const page = await pdf.getPage(pageIndex + 1)
            pageHeight = page.getViewport({ scale: 1 }).height
          } catch {
            /* keep default */
          }
          paragraphIndex = findParagraph(paragraphs, pageIndex, title, target.top, pageHeight)
        }
        if (title) {
          items.push({
            id: `toc-${counter++}`,
            title,
            depth: Math.min(depth, 3),
            pageIndex,
            paragraphIndex
          })
        }
        if (node.items?.length) await walk(node.items, depth + 1)
      }
    }
    await walk(outline, 0)
  }

  if (!items.length) {
    for (const paragraph of paragraphs) {
      if (paragraph.kind !== 'heading') continue
      items.push({
        id: `toc-${counter++}`,
        title: paragraph.text.slice(0, 90),
        depth: 0,
        pageIndex: paragraph.pageIndex,
        paragraphIndex: paragraph.index
      })
    }
  }

  return items
}

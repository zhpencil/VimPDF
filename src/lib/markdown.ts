import type { Annotation, Language, Paragraph } from '../types'
import { translate } from '../i18n'

export function buildMarkdown(
  title: string,
  paragraphs: Paragraph[],
  annotations: Annotation[],
  language: Language
): string {
  const heading = title.trim() || translate(language, 'Notes')
  const lines = [`# ${heading}`, '']
  const sorted = [...annotations].sort((a, b) =>
    a.paragraphIndex === b.paragraphIndex
      ? a.createdAt - b.createdAt
      : a.paragraphIndex - b.paragraphIndex
  )
  let lastParagraph = -1
  for (const annotation of sorted) {
    const paragraph = paragraphs[annotation.paragraphIndex]
    if (!paragraph) continue
    if (annotation.paragraphIndex !== lastParagraph) {
      lines.push(
        '> ' + paragraph.text.replace(/\n/g, ' ').trim() + ' ' +
        translate(language, '(Page %d)', paragraph.pageIndex + 1)
      )
      lines.push('')
      lastParagraph = annotation.paragraphIndex
    }
    if (annotation.type === 'note') {
      const body = annotation.content.trim()
      if (body) {
        lines.push(translate(language, '**Note:** %@', body.replace(/\n/g, '\n\n')))
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}

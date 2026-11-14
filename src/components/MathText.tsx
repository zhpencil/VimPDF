import { useMemo } from 'react'
import katex from 'katex'
import { mathSpans } from '../lib/math'

interface Segment {
  text: string
  html?: string
  display?: boolean
}

function buildSegments(text: string): Segment[] {
  const spans = mathSpans(text)
  if (!spans.length) return [{ text }]
  const segments: Segment[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start) })
    let html = ''
    try {
      html = katex.renderToString(span.tex, {
        displayMode: span.display,
        throwOnError: false,
        strict: false,
        trust: false,
        output: 'html'
      })
    } catch {
      html = ''
    }
    if (html) segments.push({ text: '', html, display: span.display })
    else segments.push({ text: text.slice(span.start, span.end) })
    cursor = span.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return segments
}

export function MathText({ text }: { text: string }) {
  const segments = useMemo(() => buildSegments(text), [text])
  return (
    <>
      {segments.map((segment, index) =>
        segment.html ? (
          <span
            key={index}
            className={segment.display ? 'math-block' : 'math-inline'}
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  )
}

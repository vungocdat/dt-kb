export interface TocHeading {
  id: string
  text: string
  level: number
}

export function parseHeadings(html: string): TocHeading[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const seen = new Map<string, number>()
  const headings: TocHeading[] = []
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
    const level = parseInt(el.tagName[1])
    const text = el.textContent?.trim() ?? ''
    if (!text) return
    const base = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    headings.push({ id, text, level })
  })
  return headings
}

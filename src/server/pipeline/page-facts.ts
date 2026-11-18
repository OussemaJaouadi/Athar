// Reads what a startup's home page says about itself: its title and one line of description.
// Pure: takes the HTML text, returns cleaned strings or nulls. Regular expressions over the head of the page; no DOM.

export type PageFacts = { title: string | null; summary: string | null }

const SCAN_CHARS = 100_000
const TITLE_MAX = 200
const SUMMARY_MAX = 400

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
])

const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi

function decode(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    const key = body.toLowerCase()
    if (key.startsWith('#')) {
      const hex = key[1] === 'x'
      const code = Number.parseInt(hex ? key.slice(2) : key.slice(1), hex ? 16 : 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES.get(key) ?? whole
  })
}

/** Decoded, whitespace collapsed and trimmed; null when nothing is left. */
function clean(raw: string): string | null {
  return decode(raw).replace(/\s+/g, ' ').trim() || null
}

/** At most `max` characters, cut at the last space before the limit, with an ellipsis when cut. */
function limit(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const space = head.lastIndexOf(' ')
  return (space > 0 ? head.slice(0, space) : head).trimEnd() + '…'
}

// A tag runs to its first `>` outside quotes, so a content="a > b" does not end it early.
const TITLE = /<title(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/title\s*>/i
const META = /<meta(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of tag.slice('<meta'.length).matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase()
    if (!out.has(name)) out.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

// In order of preference: the first kind that has a non-empty content wins.
const SUMMARY_SOURCES: ReadonlyArray<readonly [attribute: string, value: string]> = [
  ['name', 'description'],
  ['property', 'og:description'],
  ['name', 'twitter:description'],
]

function summaryOf(text: string): string | null {
  const metas = [...text.matchAll(META)].map((m) => attributes(m[0]))
  for (const [attribute, value] of SUMMARY_SOURCES) {
    for (const attrs of metas) {
      if ((attrs.get(attribute) ?? '').trim().toLowerCase() !== value) continue
      const content = clean(attrs.get('content') ?? '')
      if (content) return limit(content, SUMMARY_MAX)
    }
  }
  return null
}

export function pageFacts(html: string): PageFacts {
  try {
    const text = typeof html === 'string' ? html.slice(0, SCAN_CHARS) : ''
    const titleRaw = TITLE.exec(text)?.[1]
    const title = titleRaw === undefined ? null : clean(titleRaw)
    return {
      title: title === null ? null : limit(title, TITLE_MAX),
      summary: summaryOf(text),
    }
  } catch {
    return { title: null, summary: null }
  }
}

// Phrases of domain-for-sale, parking and suspended pages. "coming soon" is deliberately absent.
const PARKED_PHRASES: readonly string[] = [
  'domain for sale',
  'domain is for sale',
  'buy this domain',
  'this domain is available',
  'domaine à vendre',
  'domaine est à vendre',
  'parked domain',
  'domain parking',
  'hugedomains',
  'sedo',
  'account suspended',
  'site suspendu',
  'website expired',
  'site expired',
]

export function looksParked(facts: PageFacts): boolean {
  const text = `${facts.title ?? ''} ${facts.summary ?? ''}`.toLowerCase()
  // A whole phrase, not part of a longer word: "sedo" must not match "Sedona".
  return PARKED_PHRASES.some((phrase) => new RegExp(`(^|[^\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(text))
}

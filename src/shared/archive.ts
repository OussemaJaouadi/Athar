// Paging and entities: pure helpers, so the URL and the server agree on what is allowed. Safe for the browser.

/** Page sizes the Archive offers. Anything else in the URL is rounded up to the next one and capped at the last. */
export const PAGE_SIZES = [20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = PAGE_SIZES[PAGE_SIZES.length - 1]

/** A page size from anything: 20 when it is not a positive integer, the next offered size up, 100 at most. */
export function clampSize(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE
  return PAGE_SIZES.find((s) => s >= n) ?? MAX_PAGE_SIZE
}

/** The size to keep in the URL: only a different one from the default is written. */
export const parseSize = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  const n = clampSize(v)
  return n === DEFAULT_PAGE_SIZE ? undefined : n
}

/** A 1-based page from anything, kept between 1 and the last page. */
export function clampPage(v: unknown, pages: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Math.min(Math.max(1, pages), Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1))
}

export const ENTITIES = ['startups', 'people', 'sectors', 'years'] as const
export type Entity = (typeof ENTITIES)[number]
export const parseEntity = (v: unknown): Entity => ENTITIES.find((x) => x === v) ?? 'startups'

/** One line of the people list: what a founder is named on, without the startups' own rows. */
export type PersonListRow = {
  slug: string
  name: string
  startups: number
  /** Label years of those startups, once each, oldest first. */
  years: string[]
  /** Another spelling of the name is on the registry. */
  spellings: number
  /** The same name is on several startups and nobody has confirmed it is one person. */
  unconfirmed: boolean
}

export function personListRow(p: { slug: string; name: string; spellings: string[]; startups: { labelled: string | null }[] }, unconfirmed: boolean): PersonListRow {
  const years = [...new Set(p.startups.map((s) => s.labelled?.slice(0, 4)).filter((y): y is string => !!y))].sort()
  return { slug: p.slug, name: p.name, startups: p.startups.length, years, spellings: p.spellings.length, unconfirmed: unconfirmed && p.startups.length > 1 }
}

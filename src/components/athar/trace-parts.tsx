const LABELS: Record<string, string> = {
  name: 'Name',
  desc: 'Description',
  description: 'Description',
  sector: 'Sector',
  industry: 'Industry',
  website: 'Website',
  domain: 'Website domain',
  founders: 'Founders',
  label: 'Label date',
  labelled: 'Labelled',
  language: 'Language',
  website_kind: 'Website kind',
  creation_year: 'Founded',
  logo: 'Logo',
  logo_id: 'Logo id',
  email: 'Email',
  phone: 'Phone',
}
export const fieldLabel = (key: string) => LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** A stored value as words: lists joined, nothing for empty. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/** A download date as people say it: "17 Nov 2026". */
export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** A label month 'YYYY-MM' as people say it: "Oct 2020". */
export const month = (labelled: string | null | undefined) => {
  if (!labelled) return null
  const [y, m] = labelled.split('-').map(Number)
  if (!y || !m) return labelled
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const LANGUAGE: Record<string, string> = { en: 'English', fr: 'French', ar: 'Arabic' }
export const languageName = (code: string | null | undefined) => (code ? (LANGUAGE[code] ?? code) : null)

const KIND: Record<string, string> = {
  own: 'Its own domain',
  hosted: 'A page on a site builder',
  social: 'A page on a social network',
  shortlink: 'A short link',
}
export const websiteKindName = (kind: string | null | undefined) => (kind ? (KIND[kind] ?? kind) : null)

type Check = { status: string; detail: string; finalHost: string | null; checkedAt: string; since: string }

/**
 * A website observation in words. It says whether the address answered, never whether the company is alive.
 * Social pages are not checked: they answer whether or not the page exists.
 */
export function websiteCheckWords(check: Check | null, kind: string | null | undefined): string | null {
  if (!check) return kind === 'social' ? 'A social page; not checked' : null
  const when = ` · checked ${day(check.checkedAt)}`
  if (check.status === 'reachable')
    return `${check.finalHost ? `Answers, now from ${check.finalHost}` : 'Answers'} (${check.detail})${when}`
  return `Does not answer since ${day(check.since)} (${check.detail})${when}`
}

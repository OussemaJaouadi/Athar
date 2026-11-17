import type { RegistryRow } from './registry'

// Clean is a pure function of one raw registry row. Nothing it returns is stored per row:
// Build keeps the result on the startup, and Trace calls it again to show how a value was read.

/** A visible edit to what the registry published. Trimming spaces and typing a year are not listed. */
export type Change = { field: string; from: unknown; to: unknown; why: string }
/** A fact about the row. It never waits for a decision. */
export type Note = { code: string; text: string }

export type Cleaned = {
  name: string
  description: string | null
  sector: string | null
  website: string | null
  /** Identity of the website: the host, plus the page on hosts many startups share. */
  domain: string | null
  otherWebsites: string[]
  founders: string[]
  cohort: string | null
  cohortDate: string | null
  creationYear: number | null
}

// Hosts where many startups share one domain; the page path is part of the identity.
const SHARED_HOSTS = new Set([
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'linktr.ee',
  'sites.google.com',
  'play.google.com',
  'youtube.com',
  'github.com',
])
const CONNECTORS = /^(et|and|ou|or|&)$/i

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

// Typing errors with one possible reading: "htp://x", "http::/x", "http:// x", "www..x.tn".
const repair = (text: string) =>
  text
    .replace(/^h+t+p+(s?)\s*:+\s*\/+\s*/i, (_m, secure: string) => `http${secure.toLowerCase()}://`)
    .replace(/\.{2,}/g, '.')

function toUrl(token: string): URL | null {
  const hasScheme = /^https?:\/\//i.test(token)
  if (!hasScheme && !/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(token)) return null
  try {
    const url = new URL(hasScheme ? token : `https://${token}`)
    return url.hostname.includes('.') ? url : null
  } catch {
    return null
  }
}

const showUrl = (url: URL) => `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`

function domainOf(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  if (!SHARED_HOSTS.has(host)) return host
  const page = `${url.pathname.replace(/^\/+|\/+$/g, '')}${url.search}`.toLowerCase()
  return page ? `${host}/${page}` : null // a bare facebook.com identifies nobody
}

/**
 * The website field is free text: it holds addresses, two addresses, typos, and sometimes notes
 * such as login details. Only addresses are kept; the raw entry still holds what was published.
 */
export function parseWebsite(value: string | null) {
  const raw = (value ?? '').trim()
  const none = { website: null, domain: null, others: [] as string[], extraText: false, unreadable: false, repaired: false }
  if (!raw || /^(n\.?a\.?|#|-+)$/i.test(raw)) return none
  const fixed = repair(raw)
  const tokens = fixed.split(/[\s|;]+/).filter(Boolean)
  const urls = tokens.map(toUrl)
  const found = urls.filter((u): u is URL => u !== null)
  const extraText = tokens.some((t, i) => !urls[i] && !CONNECTORS.test(t))
  if (!found.length) return { ...none, unreadable: true }
  const [first, ...rest] = found
  return {
    website: showUrl(first),
    domain: domainOf(first),
    others: [...new Set(rest.map(showUrl))].filter((u) => u !== showUrl(first)),
    extraText,
    unreadable: false,
    repaired: fixed !== raw,
  }
}

export function cleanEntry(row: RegistryRow): { cleaned: Cleaned; changes: Change[]; notes: Note[] } {
  const changes: Change[] = []
  const notes: Note[] = []

  const name = collapse(row.name ?? '')
  const description = row.desc?.trim() || null
  if (!description) notes.push({ code: 'no_description', text: 'The registry publishes no description' })
  const sector = row.sector ? collapse(row.sector) : null

  const site = parseWebsite(row.website)
  if (site.unreadable) {
    notes.push({ code: 'website_unreadable', text: 'The website field holds no address' })
    changes.push({ field: 'website', from: row.website, to: null, why: 'Not an address' })
  }
  if (site.extraText) {
    notes.push({ code: 'website_text_removed', text: 'The website field held extra text; only the address is kept' })
    changes.push({ field: 'website', from: row.website, to: site.website, why: 'Only the address is kept' })
  }
  if (site.others.length) {
    notes.push({ code: 'second_website', text: `Second address: ${site.others.join(', ')}` })
    if (!site.extraText) changes.push({ field: 'website', from: row.website, to: site.website, why: 'First of several addresses' })
  }

  if (site.repaired && !site.extraText && !site.others.length)
    changes.push({ field: 'website', from: row.website, to: site.website, why: 'Typing error repaired' })

  const seen = new Set<string>()
  const founders = (row.founders ?? []).map(collapse).filter((f) => {
    const key = f.toLowerCase()
    if (!f || seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (founders.length !== (row.founders ?? []).length)
    changes.push({ field: 'founders', from: row.founders, to: founders, why: 'Blank and repeated names removed' })

  const label = /^(\d{2})\/(\d{4})$/.exec(row.label?.trim() ?? '')
  const cohort = label ? label[0] : null
  const cohortDate = label ? `${label[2]}-${label[1]}-01` : null
  if (!label) notes.push({ code: 'cohort_unreadable', text: `Label "${row.label}" is not a month and year` })

  const year = Number.parseInt(row.creation_year, 10)
  const creationYear = Number.isFinite(year) ? year : null
  if (label && creationYear && Number(label[2]) < creationYear)
    notes.push({ code: 'label_before_creation', text: `Labelled in ${label[2]}, created in ${creationYear}` })

  return {
    cleaned: { name, description, sector, website: site.website, domain: site.domain, otherWebsites: site.others, founders, cohort, cohortDate, creationYear },
    changes,
    notes,
  }
}

/**
 * The raw row as it may be shown on screen. Two rows carry login details after the address in the
 * website field; the stored entry keeps them verbatim, the screen shows the address and says text was withheld.
 */
export function displayRow(row: RegistryRow): RegistryRow {
  const site = parseWebsite(row.website)
  if (!site.extraText) return row
  return { ...row, website: `${[site.website, ...site.others].join(' ')} [extra text withheld]` }
}

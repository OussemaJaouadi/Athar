import type { RegistryRow } from './registry'

// Clean reads one raw registry row into typed fields. It is a pure function and nothing it returns
// is stored per row: Build keeps the result on the startup, and Trace calls it again to show how a
// value was read. There is one reader per field, in the order the registry publishes them.

/** A visible edit to what the registry published. Trimming spaces and typing a year are not listed. */
export type Change = { field: string; from: unknown; to: unknown; why: string }
/** A fact about the row. It never waits for a decision. */
export type Note = { code: string; text: string }

export type Language = 'en' | 'fr' | 'ar'
export type WebsiteKind = 'own' | 'hosted' | 'social' | 'shortlink'
export type Founder = { name: string; personKey: string }

export type Cleaned = {
  name: string
  description: string | null
  /** Language of the description; null when there is none or it is too short to tell. */
  language: Language | null
  sector: string | null
  website: string | null
  websiteKind: WebsiteKind | null
  /** Identity of the website: the host, plus the page on hosts many startups share. */
  domain: string | null
  otherWebsites: string[]
  founders: Founder[]
  /** Month the startup received its label, as YYYY-MM. */
  labelled: string | null
  creationYear: number | null
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
const plain = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

// ── name ────────────────────────────────────────────────────────────────────────────────────────
// Kept as published. Only the matching key drops case, accents, punctuation and a trailing legal form,
// so "BSmart SARL" and "bsmart" are one company.

const LEGAL_FORM = /[\s,]+(s\.?u\.?a\.?r\.?l|s\.?a\.?r\.?l|s\.?a\.?s|s\.?a|ltd|llc|inc)\.?$/i

export const nameKey = (name: string) =>
  plain(collapse(name).replace(LEGAL_FORM, '')).replace(/[^\p{L}\p{N}]+/gu, '')

// ── description ─────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ' }
const decodeEntities = (s: string) => s.replace(/&(amp|quot|apos|#39|lt|gt|nbsp);/g, (_m, e: string) => ENTITIES[e])

const FRENCH = new Set(
  'la le les des une un et pour est du de en qui sur avec aux dans nous notre vos votre ce cette par plus ou au sont entre chez sans sous vers ses son sa se ne pas je il elle ils mais donc dont leurs que'.split(' '),
)
const ENGLISH = new Set('the and of for to is that with our in on we an are by from your it as this its at which app who their how can be or not have has they you'.split(' '))

export function detectLanguage(text: string): Language | null {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const arabic = text.match(/[؀-ۿ]/g)?.length ?? 0
  if (letters && arabic / letters > 0.5) return 'ar'
  const words = text.toLowerCase().match(/[a-zàâçéèêëîïôûùüœ]+/g) ?? []
  const french = words.filter((w) => FRENCH.has(w)).length + (text.match(/[éèêàçùœ]/g)?.length ?? 0) / 2
  const english = words.filter((w) => ENGLISH.has(w)).length
  if (french === english) return words.length >= 3 && french === 0 ? 'en' : null // no French marker in a Latin text: English
  return french > english ? 'fr' : 'en'
}

function readDescription(value: string | null) {
  const description = value ? collapse(decodeEntities(value)) || null : null
  return { description, language: description && description.length >= 12 ? detectLanguage(description) : null }
}

// ── website ─────────────────────────────────────────────────────────────────────────────────────
// Free text in the registry: addresses, two addresses, typing errors, and sometimes notes such as
// login details. Only addresses are kept; the raw entry still holds what was published.

// One host, many startups: the page path is part of the identity.
const SOCIAL = new Set(['facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'linktr.ee', 'github.com', 'play.google.com'])
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'rb.gy'])
const SHARED_HOSTS = new Set([...SOCIAL, ...SHORTENERS, 'sites.google.com'])
// Free site builders: the startup has a page of its own, but not a domain of its own.
const BUILDERS = /(^sites\.google\.com$|\.(wixsite\.com|wordpress\.com|blogspot\.com|netlify\.app|vercel\.app|firebaseapp\.com|web\.app|azurewebsites\.net|herokuapp\.com|odoo\.com|github\.io|business\.site|webflow\.io)$)/
const CONNECTORS = /^(et|and|ou|or|&)$/i

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

const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/^(www|m)\./, '')
const showUrl = (url: URL) => `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`

function domainOf(url: URL): string | null {
  const host = hostOf(url)
  if (!SHARED_HOSTS.has(host)) return host
  const page = `${url.pathname.replace(/^\/+|\/+$/g, '')}${url.search}`.toLowerCase()
  return page ? `${host}/${page}` : null // a bare facebook.com identifies nobody
}

function kindOf(url: URL): WebsiteKind {
  const host = hostOf(url)
  if (SOCIAL.has(host)) return 'social'
  if (SHORTENERS.has(host)) return 'shortlink'
  return BUILDERS.test(host) ? 'hosted' : 'own'
}

export function parseWebsite(value: string | null) {
  const raw = (value ?? '').trim()
  const none = { website: null, kind: null, domain: null, others: [] as string[], extraText: false, unreadable: false, repaired: false }
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
    kind: kindOf(first),
    domain: domainOf(first),
    others: [...new Set(rest.map(showUrl))].filter((u) => u !== showUrl(first)),
    extraText,
    unreadable: false,
    repaired: fixed !== raw,
  }
}

// ── founders ────────────────────────────────────────────────────────────────────────────────────
// Names are kept as published. The person key ignores case, accents and word order, so
// "Mehdi BOUDHRAA" / "Mehdi Boudhraa" and "Ben Salah Slim" / "Slim Ben Salah" are one person.

export const personKey = (name: string) => plain(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ')

function readFounders(value: string[] | null) {
  const seen = new Set<string>()
  const founders: Founder[] = []
  for (const published of value ?? []) {
    const name = collapse(String(published))
    const key = personKey(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    founders.push({ name, personKey: key })
  }
  return founders
}

// ── the row ─────────────────────────────────────────────────────────────────────────────────────

export function cleanEntry(row: RegistryRow): { cleaned: Cleaned; changes: Change[]; notes: Note[] } {
  const changes: Change[] = []
  const notes: Note[] = []

  const name = collapse(row.name ?? '')

  const { description, language } = readDescription(row.desc)
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

  const founders = readFounders(row.founders)
  if (founders.length !== (row.founders ?? []).length)
    changes.push({ field: 'founders', from: row.founders, to: founders.map((f) => f.name), why: 'Blank and repeated names removed' })

  const label = /^(\d{2})\/(\d{4})$/.exec(row.label?.trim() ?? '')
  const labelled = label && Number(label[1]) >= 1 && Number(label[1]) <= 12 ? `${label[2]}-${label[1]}` : null
  if (!labelled) notes.push({ code: 'label_unreadable', text: `Label "${row.label}" is not a month and year` })

  const year = Number.parseInt(row.creation_year, 10)
  const creationYear = Number.isFinite(year) ? year : null
  if (labelled && creationYear && Number(labelled.slice(0, 4)) < creationYear)
    notes.push({ code: 'label_before_creation', text: `Labelled in ${labelled.slice(0, 4)}, created in ${creationYear}` })

  return {
    cleaned: {
      name, description, language, sector,
      website: site.website, websiteKind: site.kind, domain: site.domain, otherWebsites: site.others,
      founders, labelled, creationYear,
    },
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

import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { getDatabase } from '../db'
import { newId, now } from '../ids'

/*
 * Sample data for features whose engine is not built yet: similarity and idea checks (Embed),
 * themes (clustering), website checks (the checker) and AI usage (Prepare).
 * The startups are real; scores, statuses and usage are invented, deterministic per id,
 * and every response carries `sample: true` so the UI says so.
 */

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  // murmur3 finalizer: neighbouring keys ("in1", "in2") land far apart
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const STOP = new Set(
  'the and for with that this from into their your our are was were has have its they them which who what when where will can also more most such than then using use used based platform solution solutions company startup tunisia tunisian service services offers offer provides provide allows help helps new des les une pour avec dans sur par qui est sont aux leur plus'.split(
    ' ',
  ),
)

/** Content words of a text, for OR-matching in FTS. */
const terms = (text: string, max = 12) => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  ),
].slice(0, max)

const ftsAny = (words: string[]) => words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR ')

type Hit = { id: string; name: string; sector: string | null; cohort: string | null; description: string | null }

function matchAny(words: string[], limit: number, exclude?: string): Hit[] {
  if (words.length === 0) return []
  return getDatabase()
    .query<Hit, [string, string, number]>(
      `SELECT s.id, s.name, s.sector, s.cohort, s.description FROM startups_fts f JOIN startups s ON s.id = f.startup_id
       WHERE startups_fts MATCH ? AND s.id != ? ORDER BY rank LIMIT ?`,
    )
    .all(ftsAny(words), exclude ?? '', limit)
}

// ---------- Similar startups and website condition (profile) ----------

export type WebsiteCheck = { at: string; status: 'up' | 'down' | 'moved'; ms: number | null }

function websiteHistory(id: string, website: string | null) {
  if (!website) return null
  const gone = hash(`${id}:gone`) < 0.14
  const checks: WebsiteCheck[] = Array.from({ length: 16 }, (_, i) => {
    const at = new Date(Date.now() - (15 - i) * 7 * 864e5).toISOString()
    const r = hash(`${id}:${i}`)
    const status: WebsiteCheck['status'] = gone && i > 9 ? 'down' : r < 0.05 ? 'down' : r < 0.09 ? 'moved' : 'up'
    return { at, status, ms: status === 'down' ? null : Math.round(180 + hash(`${id}:ms${i}`) * 900) }
  })
  const current = checks[checks.length - 1].status
  let since = checks.length - 1
  while (since > 0 && checks[since - 1].status === current) since--
  return { current, since: checks[since].at, checks }
}

export const getProfileSample = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDatabase()
    const s = db.query<{ name: string; description: string | null; sector: string | null; website: string | null }, [string]>('SELECT name, description, sector, website FROM startups WHERE id = ?').get(id)
    if (!s) return null
    let hits = matchAny(terms(s.description ?? s.name), 6, id)
    if (hits.length < 6 && s.sector) {
      const more = db
        .query<Hit, [string, string]>('SELECT id, name, sector, cohort, description FROM startups WHERE sector = ? AND id != ? ORDER BY random() LIMIT 6')
        .all(s.sector, id)
      hits = [...hits, ...more.filter((m) => !hits.some((h) => h.id === m.id))].slice(0, 6)
    }
    const similar = hits.map((h, i) => ({ ...h, score: Math.max(0.41, 0.91 - i * 0.07 - hash(h.id) * 0.04) }))
    const themes = THEMES.filter((t) => t.words.some((w) => new RegExp(`\\b${w}`, 'i').test(`${s.description ?? ''} ${s.sector ?? ''}`))).slice(0, 3)
    return { sample: true as const, similar, website: websiteHistory(id, s.website), themes: themes.map(({ id, name }) => ({ id, name })) }
  })

// ---------- Themes and white space ----------

type ThemeDef = { id: string; name: string; words: string[] }

const THEMES: ThemeDef[] = [
  { id: 'farm-to-market', name: 'Farm to market', words: ['agri', 'farm', 'olive', 'crop', 'irrigation', 'livestock'] },
  { id: 'care-at-distance', name: 'Care at a distance', words: ['telemedicine', 'patient', 'medical', 'doctor', 'clinic', 'hospital'] },
  { id: 'learning-online', name: 'Learning online', words: ['learning', 'student', 'courses', 'education', 'tutor', 'school'] },
  { id: 'paying-lending', name: 'Paying and lending', words: ['payment', 'wallet', 'lending', 'banking', 'insurance', 'credit'] },
  { id: 'last-mile', name: 'Last-mile delivery', words: ['delivery', 'logistics', 'fleet', 'shipping', 'courier'] },
  { id: 'selling-online', name: 'Selling online', words: ['marketplace', 'ecommerce', 'e-commerce', 'online store', 'retail'] },
  { id: 'smart-industry', name: 'Smart industry', words: ['iot', 'industrial', 'manufacturing', 'robot', 'sensor', 'automation'] },
  { id: 'energy-waste', name: 'Clean energy and waste', words: ['solar', 'energy', 'recycling', 'waste', 'renewable'] },
  { id: 'travel-stays', name: 'Travel and stays', words: ['tourism', 'travel', 'booking', 'hotel', 'trip'] },
  { id: 'work-hiring', name: 'Work and hiring', words: ['recruitment', 'hiring', 'jobs', 'freelance', 'talent'] },
  { id: 'media-creators', name: 'Media and creators', words: ['video', 'content', 'media', 'music', 'gaming', 'game'] },
  { id: 'software-smes', name: 'Software for small firms', words: ['erp', 'saas', 'crm', 'invoicing', 'accounting'] },
]

const WHITE_SPACE: ThemeDef[] = [
  { id: 'elder-care', name: 'Elder care at home', words: ['elderly', 'seniors', 'retirement', 'nursing'] },
  { id: 'water-reuse', name: 'Water reuse', words: ['desalination', 'wastewater', 'greywater'] },
  { id: 'legal-help', name: 'Legal help', words: ['legal', 'lawyer', 'notary'] },
  { id: 'sea-fishing', name: 'Fishing and the sea', words: ['fishing', 'fishermen', 'aquaculture', 'maritime'] },
  { id: 'disability', name: 'Disability access', words: ['disability', 'disabled', 'blind', 'deaf', 'accessibility'] },
  { id: 'housing-rent', name: 'Housing and rent', words: ['tenant', 'rental', 'housing', 'landlord'] },
]

function themeMembers(t: ThemeDef) {
  return matchAny(t.words, 400)
}

export const getThemes = createServerFn().handler(async () => {
  const years = (hits: Hit[]) => {
    const m = new Map<string, number>()
    for (const h of hits) if (h.cohort) m.set(h.cohort.slice(3), (m.get(h.cohort.slice(3)) ?? 0) + 1)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, count]) => ({ year, count }))
  }
  const themes = THEMES.map((t) => {
    const hits = themeMembers(t)
    return { id: t.id, name: t.name, words: t.words, count: hits.length, years: years(hits), examples: hits.slice(0, 4).map(({ id, name }) => ({ id, name })), ids: hits.map((h) => h.id) }
  }).sort((a, b) => b.count - a.count)
  const gaps = WHITE_SPACE.map((t) => {
    const hits = themeMembers(t)
    return { id: t.id, name: t.name, words: t.words, count: hits.length, examples: hits.slice(0, 3).map(({ id, name }) => ({ id, name })) }
  }).sort((a, b) => a.count - b.count)
  return { sample: true as const, themes, gaps }
})

export const getTheme = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const t = [...THEMES, ...WHITE_SPACE].find((x) => x.id === id)
    if (!t) return null
    return { sample: true as const, id: t.id, name: t.name, words: t.words, gap: WHITE_SPACE.includes(t), members: themeMembers(t) }
  })

// ---------- Idea checks (saved, dated reports) ----------

export type IdeaMatch = Hit & { score: number; band: 'close' | 'partial'; shared: string[] }
export type IdeaCheck = { id: string; idea: string; checkedAt: string; against: number; terms: string[]; matches: IdeaMatch[] }

const checks: IdeaCheck[] = []

function runCheck(idea: string): IdeaCheck {
  const words = terms(idea)
  const against = getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
  const hits = matchAny(words, 10)
  const matches = hits
    .map((h, i): IdeaMatch => {
      const text = `${h.name} ${h.description ?? ''} ${h.sector ?? ''}`.toLowerCase()
      const shared = words.filter((w) => text.includes(w))
      const score = Math.min(0.94, 0.38 + shared.length * 0.14 + (0.08 - i * 0.008) + hash(h.id) * 0.03)
      return { ...h, shared, score, band: score >= 0.7 ? 'close' : 'partial' }
    })
    .filter((m) => m.shared.length > 0 && m.score >= 0.5)
    .sort((a, b) => b.score - a.score)
  return { id: newId(), idea, checkedAt: now(), against, terms: words, matches }
}

function seed() {
  if (checks.length) return
  for (const idea of [
    'Insurance for small fishing boats, paid by the trip',
    'An app that books home visits from nurses for elderly parents',
    'A marketplace where olive farmers sell directly to restaurants and shops',
  ])
    checks.unshift(runCheck(idea))
}

export const listIdeaChecks = createServerFn().handler(async () => {
  seed()
  return { sample: true as const, checks: checks.map(({ id, idea, checkedAt, matches }) => ({ id, idea, checkedAt, close: matches.filter((m) => m.band === 'close').length, total: matches.length })) }
})

export const getIdeaCheck = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    seed()
    return checks.find((c) => c.id === id) ?? null
  })

export const runIdeaCheck = createServerFn({ method: 'POST' })
  .validator((idea: string) => {
    const text = idea.trim()
    if (text.length < 8) throw new Error('Describe the idea in a sentence or two.')
    return text.slice(0, 600)
  })
  .handler(async ({ data }) => {
    seed()
    const check = runCheck(data)
    checks.unshift(check)
    return { id: check.id }
  })

export const removeIdeaCheck = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const i = checks.findIndex((c) => c.id === data)
    if (i >= 0) checks.splice(i, 1)
  })

// ---------- The lab: pipeline overview, AI usage per key ----------

function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

export const getLabOverview = createServerFn().handler(async () => {
  requireOperator()
  const db = getDatabase()
  const n = (sql: string) => db.query<{ n: number }, []>(sql).get()?.n ?? 0
  const snapshot = db
    .query<{ fetched_at: string; content_hash: string; row_count: number; byte_size: number }, []>('SELECT fetched_at, content_hash, row_count, byte_size FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1')
    .get()
  const startups = n('SELECT COUNT(*) AS n FROM startups')
  const records = n('SELECT COUNT(*) AS n FROM records')
  const changed = n("SELECT COUNT(*) AS n FROM records WHERE changes_json != '[]'")
  const openReviews = n("SELECT COUNT(*) AS n FROM review_items WHERE status = 'open'")
  const prepared = n('SELECT COUNT(*) AS n FROM prepared_texts')
  const embedded = n('SELECT COUNT(*) AS n FROM embedding_meta')
  const reviewCodes = db.query<{ code: string; count: number }, []>("SELECT code, COUNT(*) AS count FROM review_items WHERE status = 'open' GROUP BY code ORDER BY count DESC").all()
  const runs = db.query<{ id: string; operation: string; status: string; started_at: string; finished_at: string | null }, []>('SELECT id, operation, status, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT 6').all()
  const keys = n('SELECT COUNT(*) AS n FROM ai_keys')
  // Sample: what Prepare and Embed would report once built.
  const usage = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(5, 10)
    const busy = hash(`u${i}`) > 0.55
    return { day, input: busy ? Math.round(20000 + hash(`in${i}`) * 90000) : Math.round(hash(`in${i}`) * 4000), output: busy ? Math.round(4000 + hash(`out${i}`) * 18000) : Math.round(hash(`out${i}`) * 900) }
  })
  return {
    snapshot,
    stations: [
      { id: 'collect', label: 'Collect', value: snapshot?.row_count ?? 0, unit: 'rows', note: snapshot ? `snapshot ${snapshot.content_hash.slice(0, 8)}` : 'never run', sample: false },
      { id: 'clean', label: 'Clean', value: changed, unit: 'rows edited', note: `${openReviews} open for review`, sample: false },
      { id: 'merge', label: 'Merge', value: startups, unit: 'startups', note: `${records - startups} rows merged`, sample: false },
      { id: 'prepare', label: 'Prepare', value: prepared || Math.round(startups * 0.62), unit: 'texts', note: prepared ? 'prepared' : 'sample: 62% done', sample: !prepared },
      { id: 'embed', label: 'Embed', value: embedded || Math.round(startups * 0.41), unit: 'vectors', note: embedded ? 'Qwen3 0.6B' : 'sample: Qwen3 0.6B', sample: !embedded },
    ],
    reviewCodes,
    openReviews,
    runs,
    keys,
    usage,
  }
})

export const getKeyUsage = createServerFn().handler(async () => {
  requireOperator()
  const keys = getDatabase().query<{ id: string; name: string }, []>('SELECT id, name FROM ai_keys ORDER BY created_at').all()
  // With no real key yet, two example profiles show what the table will hold. Never stored.
  const examples = keys.length
    ? []
    : [
        { id: 'example-groq', name: 'groq-free', provider: 'groq', model: 'llama-3.3-70b-versatile', hint: '…a41f', status: 'active' },
        { id: 'example-openrouter', name: 'openrouter-free', provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', hint: '…9c02', status: 'limited' },
      ]
  return {
    sample: true as const,
    examples,
    perKey: Object.fromEntries(
      [...keys, ...examples].map((k, i) => [
        k.id,
        {
          order: i + 1,
          tokens7d: Math.round(hash(`${k.id}:t`) * 380000),
          requests7d: Math.round(hash(`${k.id}:r`) * 900),
          failures7d: Math.round(hash(`${k.id}:f`) * 12),
          lastUsed: new Date(Date.now() - hash(`${k.id}:l`) * 3 * 864e5).toISOString(),
          limitLeft: Math.round(30 + hash(`${k.id}:q`) * 70),
        },
      ]),
    ),
  }
})

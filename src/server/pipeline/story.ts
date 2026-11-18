import type { Database } from 'bun:sqlite'

import type { Effective } from './decisions'
import { effective, followOf, sharedPersonKeys } from './review'

// The story of a startup and of a person, read from the stored readings with the owner's decisions applied.
// Voice: evidence, never a verdict; what is uncertain is said as uncertain. Reads only.

export type Said = { lane: 'rule' | 'inferred' | 'review'; why: string; answered: boolean }

export type Relation = 'renamed' | 'successor' | 'sibling' | 'unrelated'

export type Venture = {
  startup: { id: string; name: string; sector: string | null; creationYear: number | null; labelled: string | null }
  relation: Relation
  /** One plain sentence for a reader. */
  sentence: string
  /** Display names of the founders both list. */
  sharedFounders: string[]
  said: Said
  /** True when the tie rests on one founder name that is not confirmed to be one person. */
  nameOnly: boolean
}

export type StartupStory = {
  id: string
  name: string
  published: string
  legalForm: string | null
  nameSaid: Said | null
  otherNames: { name: string; from: 'description' | 'email' | 'acronym'; said: Said }[]
  website: { url: string; state: string; said: Said; finalHost: string | null; title: string | null; summary: string | null; checkedAt: string; since: string } | null
  ventures: Venture[]
  notes: { id: string; kind: string; text: string; source: string | null; onDate: string | null; createdAt: string }[]
}

export type PersonStory = {
  key: string
  name: string
  spellings: string[]
  startups: { id: string; name: string; sector: string | null; creationYear: number | null; labelled: string | null; coFounders: string[] }[]
  /** Null when the name is on a single startup. */
  onePerson: { same: boolean; said: Said } | null
  lookAlikes: { key: string; name: string; same: boolean; said: Said }[]
}

export type StoryCounts = { renamed: number; successors: number; siblings: number; nameOnly: number; otherNames: number; movedOrGone: number }

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** What the reading says, or what the owner settled: a decision is always reported as a rule. */
function saidOf(e: Effective): Said {
  if (e.decided) return { lane: 'rule', why: e.decided.note ?? 'Answered by the owner.', answered: true }
  return { lane: e.lane, why: e.why, answered: false }
}

const declined = (e: Effective) => e.decided !== null && asRecord(e.decided.value).accept === false

type Index = Map<string, Effective>
const indexOf = (all: Effective[]): Index => new Map(all.map((e) => [e.id, e]))

type StartupRow = { id: string; name: string; display_name: string | null; legal_form: string | null; sector: string | null; creation_year: number | null; labelled: string | null }
type FounderRow = { startup_id: string; position: number; name: string; display_name: string | null; person_key: string }

/** The name to show: the standard form unless the owner declined it. */
function shownName(row: { id: string; name: string; display_name: string | null }, index: Index): { name: string; reading: Effective | null } {
  const reading = index.get(`name:${row.id}`) ?? null
  if (!reading || declined(reading)) return { name: row.name, reading: null }
  const display = text(asRecord(reading.value).display) ?? row.display_name
  return { name: display ?? row.name, reading }
}

function founderName(row: FounderRow, index: Index): string {
  const reading = index.get(`founder:${row.startup_id}#${row.position}`)
  if (reading && declined(reading)) return row.name
  return row.display_name ?? row.name
}

const founderRows = (db: Database, startupId: string) =>
  db.query<FounderRow, [string]>('SELECT startup_id, position, name, display_name, person_key FROM founders WHERE startup_id = ? ORDER BY position').all(startupId)

const capitals = (name: string) => name.split(/\s+/).filter((w) => w.length > 1 && w === w.toUpperCase()).length
const byYear = (a: { creationYear: number | null; name: string }, b: { creationYear: number | null; name: string }) =>
  (a.creationYear ?? 9999) - (b.creationYear ?? 9999) || a.name.localeCompare(b.name)

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const word = (n: number) => WORDS[n] ?? String(n)
const years = (n: number) => `${word(n)} ${n === 1 ? 'year' : 'years'}`

// ---- relations ----

type Tie = {
  reading: Effective
  /** The two startup ids. */
  ids: [string, string]
  relation: Relation
  nameOnly: boolean
  /** Left out entirely: the owner said they are not related, or the shared name was answered as different people. */
  hidden: boolean
  shared: string[]
}

const NAME_ONLY_RULES = ['relation.one-founder-only', 'relation.one-founder-same-field']

function tieOf(db: Database, e: Effective, all: Effective[], index: Index): Tie | null {
  const [a, b] = e.subject.split('|')
  if (a === undefined || b === undefined) return null
  const relation = text(asRecord(e.effectiveValue).relation) as Relation | null
  if (relation !== 'renamed' && relation !== 'successor' && relation !== 'sibling' && relation !== 'unrelated') return null
  const shared = sharedPersonKeys(db, a, b)
  const base = { reading: e, ids: [a, b] as [string, string], relation, shared }
  if (e.decided !== null) return { ...base, nameOnly: false, hidden: relation === 'unrelated' }
  const follow = followOf(db, e, all)
  if (follow?.state === 'different') return { ...base, nameOnly: false, hidden: true }
  if (relation === 'unrelated' && e.rule === 'relation.no-founder') return { ...base, nameOnly: false, hidden: true }
  let nameOnly = false
  if (NAME_ONLY_RULES.includes(e.rule) && shared.length === 1) {
    const person = index.get(`person:${shared[0]}`)
    const confirmed = person !== undefined && (person.decided !== null ? asRecord(person.decided.value).same === true : person.lane === 'rule' && asRecord(person.value).same === true)
    nameOnly = !confirmed
  }
  return { ...base, nameOnly, hidden: false }
}

function ties(db: Database, all: Effective[], index: Index, only?: string): Tie[] {
  const out: Tie[] = []
  for (const e of all) {
    if (e.kind !== 'relation') continue
    if (only !== undefined && !e.subject.split('|').includes(only)) continue
    const tie = tieOf(db, e, all, index)
    if (tie && !tie.hidden) out.push(tie)
  }
  return out
}

function sentenceOf(
  db: Database,
  tie: Tie,
  self: { id: string; creationYear: number | null },
  other: { id: string; creationYear: number | null },
  keyName: Map<string, string>,
): string {
  const said = saidOf(tie.reading)
  if (tie.nameOnly) {
    const name = keyName.get(tie.shared[0] ?? '') ?? tie.shared[0] ?? ''
    return `Lists a founder named ${name}, as this startup does; whether it is the same person is not confirmed.`
  }
  if (tie.relation === 'unrelated') return 'Shares a founder with this startup; how the two relate is not confirmed.'

  const n = tie.shared.length
  const teamSize = (id: string) => db.query<{ n: number }, [string]>('SELECT COUNT(DISTINCT person_key) AS n FROM founders WHERE startup_id = ?').get(id)?.n ?? 0
  const whole = n >= 2 && n === teamSize(self.id) && n === teamSize(other.id)
  let timing: string | null = null
  if (self.creationYear !== null && other.creationYear !== null) {
    const gap = other.creationYear - self.creationYear
    timing = gap === 0 ? 'Founded the same year' : `Founded ${years(Math.abs(gap))} ${gap > 0 ? 'later' : 'earlier'}`
  }
  const people = whole
    ? `${timing ? ' by' : ', by'} the same ${word(n)} people`
    : n === 1
      ? ', with one founder in common'
      : `, with ${word(n)} founders in common`
  const lead = `${timing ?? 'Founding years not both known'}${people}.`

  const settled = said.lane === 'rule'
  const maybe = said.lane === 'review'
  let tail: string
  if (tie.relation === 'renamed') {
    const sites = db
      .query<{ domain: string | null }, [string, string]>('SELECT domain FROM startups WHERE id IN (?, ?)')
      .all(self.id, other.id)
    const domain = sites.length === 2 && sites[0]?.domain !== null && sites[0]?.domain === sites[1]?.domain ? sites[0]?.domain : null
    tail = said.answered ? 'Recorded as the same venture under another name.'
      : domain && settled ? `Both list the website ${domain}.`
      : maybe ? 'May be the same venture under another name; not confirmed.'
      : 'Possibly the same venture under another name.'
  } else if (tie.relation === 'successor') {
    tail = settled ? 'The later one replaced the earlier.' : maybe ? 'The later one may have replaced the earlier; not confirmed.' : 'The later one may have replaced the earlier.'
  } else {
    tail = settled ? 'A second venture alongside.' : maybe ? 'May be a second venture alongside; not confirmed.' : 'Likely a second venture alongside.'
  }
  return `${lead} ${tail}`
}

const RANK: Record<Relation, number> = { renamed: 0, successor: 1, sibling: 2, unrelated: 3 }

// ---- startups ----

export function startupStory(db: Database, id: string): StartupStory | null {
  const row = db.query<StartupRow, [string]>('SELECT id, name, display_name, legal_form, sector, creation_year, labelled FROM startups WHERE id = ?').get(id)
  if (!row) return null
  const all = effective(db)
  const index = indexOf(all)

  const shown = shownName(row, index)

  const otherNames: StartupStory['otherNames'] = []
  for (const e of all) {
    if (e.kind !== 'alias' || e.subject !== id || declined(e)) continue
    const value = asRecord(e.value)
    const name = text(value.name)
    if (name === null) continue
    const source = text(value.source)
    otherNames.push({ name, from: source === 'description' || source === 'email' ? source : 'acronym', said: saidOf(e) })
  }

  const sourceRank = { acronym: 0, description: 1, email: 2 }
  otherNames.sort((a, b) => sourceRank[a.from] - sourceRank[b.from] || a.name.localeCompare(b.name))

  const check = db
    .query<{ url: string; status: string; state: string | null; state_lane: string | null; state_why: string | null; final_host: string | null; title: string | null; summary: string | null; checked_at: string; since: string }, [string]>(
      'SELECT url, status, state, state_lane, state_why, final_host, title, summary, checked_at, since FROM website_checks WHERE startup_id = ?',
    )
    .get(id)
  let website: StartupStory['website'] = null
  if (check) {
    const reading = index.get(`website:${id}`)
    const decidedState = reading?.decided ? text(asRecord(reading.decided.value).state) : null
    const lane = check.state_lane === 'inferred' || check.state_lane === 'review' ? check.state_lane : 'rule'
    const said: Said = decidedState !== null && reading ? saidOf(reading) : { lane, why: check.state_why ?? '', answered: false }
    website = {
      url: check.url,
      state: decidedState ?? check.state ?? (check.status === 'reachable' ? 'answers' : 'silent'),
      said,
      finalHost: check.final_host,
      title: check.title,
      summary: check.summary,
      checkedAt: check.checked_at,
      since: check.since,
    }
  }

  const names = new Map(db.query<StartupRow, []>('SELECT id, name, display_name, legal_form, sector, creation_year, labelled FROM startups').all().map((r) => [r.id, r]))
  const keyName = new Map(founderRows(db, id).map((f) => [f.person_key, founderName(f, index)]))
  const ventures: (Venture & { year: number | null })[] = []
  for (const tie of ties(db, all, index, id)) {
    const otherId = tie.ids[0] === id ? tie.ids[1] : tie.ids[0]
    const other = names.get(otherId)
    if (!other) continue
    const otherName = shownName(other, index).name
    ventures.push({
      startup: { id: otherId, name: otherName, sector: other.sector, creationYear: other.creation_year, labelled: other.labelled },
      relation: tie.relation,
      sentence: sentenceOf(db, tie, { id, creationYear: row.creation_year }, { id: otherId, creationYear: other.creation_year }, keyName),
      sharedFounders: [...keyName].filter(([k]) => tie.shared.includes(k)).map(([, name]) => name),
      said: saidOf(tie.reading),
      nameOnly: tie.nameOnly,
      year: other.creation_year,
    })
  }
  ventures.sort((a, b) =>
    Number(a.nameOnly) - Number(b.nameOnly) || RANK[a.relation] - RANK[b.relation] || byYear({ creationYear: a.year, name: a.startup.name }, { creationYear: b.year, name: b.startup.name }),
  )

  const notes = db
    .query<{ id: string; kind: string; text: string; source: string | null; on_date: string | null; created_at: string }, [string]>(
      'SELECT id, kind, text, source, on_date, created_at FROM startup_notes WHERE startup_id = ? ORDER BY created_at, id',
    )
    .all(id)
    .map((n) => ({ id: n.id, kind: n.kind, text: n.text, source: n.source, onDate: n.on_date, createdAt: n.created_at }))

  return {
    id,
    name: shown.name,
    published: row.name,
    legalForm: row.legal_form,
    nameSaid: shown.reading ? saidOf(shown.reading) : null,
    otherNames,
    website,
    ventures: ventures.map(({ year: _year, ...v }) => v),
    notes,
  }
}

// ---- people ----

/** The most used display spelling of a key, the calmer one between equals. */
function mostUsed(rows: FounderRow[], index: Index): string {
  const shown = rows.map((r) => founderName(r, index))
  const count = (s: string) => shown.filter((x) => x === s).length
  return [...new Set(shown)].sort((a, b) => count(b) - count(a) || capitals(a) - capitals(b) || a.localeCompare(b))[0] ?? ''
}

const rowsOfKey = (db: Database, key: string) =>
  db.query<FounderRow, [string]>('SELECT startup_id, position, name, display_name, person_key FROM founders WHERE person_key = ?').all(key)

export function personStory(db: Database, key: string): PersonStory | null {
  const rows = rowsOfKey(db, key)
  if (rows.length === 0) return null
  const all = effective(db)
  const index = indexOf(all)

  const count = (s: string) => rows.filter((r) => r.name === s).length
  const spellings = [...new Set(rows.map((r) => r.name))].sort((a, b) => count(b) - count(a) || a.localeCompare(b))

  const startups = [...new Set(rows.map((r) => r.startup_id))]
    .map((startupId) => {
      const s = db.query<StartupRow, [string]>('SELECT id, name, display_name, legal_form, sector, creation_year, labelled FROM startups WHERE id = ?').get(startupId)
      if (!s) return null
      return {
        id: s.id,
        name: shownName(s, index).name,
        sector: s.sector,
        creationYear: s.creation_year,
        labelled: s.labelled,
        coFounders: founderRows(db, s.id).filter((f) => f.person_key !== key).map((f) => founderName(f, index)),
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort(byYear)

  let onePerson: PersonStory['onePerson'] = null
  if (startups.length > 1) {
    const reading = index.get(`person:${key}`)
    if (!reading) {
      onePerson = { same: true, said: { lane: 'inferred', why: `The same name is on ${startups.length} startups.`, answered: false } }
    } else {
      const same = asRecord(reading.effectiveValue).same
      onePerson = { same: typeof same === 'boolean' ? same : true, said: saidOf(reading) }
    }
  }

  const lookAlikes: PersonStory['lookAlikes'] = []
  for (const e of all) {
    if (e.kind !== 'person_pair') continue
    const [a, b] = e.subject.split('|')
    if (a !== key && b !== key) continue
    const otherKey = a === key ? b : a
    if (otherKey === undefined) continue
    const same = asRecord(e.effectiveValue).same === true
    if (!same && (e.decided !== null || e.lane === 'rule')) continue
    lookAlikes.push({ key: otherKey, name: mostUsed(rowsOfKey(db, otherKey), index) || otherKey, same, said: saidOf(e) })
  }

  return { key, name: mostUsed(rows, index), spellings, startups, onePerson, lookAlikes }
}

// ---- counts ----

export function storyCounts(db: Database): StoryCounts {
  const all = effective(db)
  const index = indexOf(all)
  const counts: StoryCounts = { renamed: 0, successors: 0, siblings: 0, nameOnly: 0, otherNames: 0, movedOrGone: 0 }
  for (const tie of ties(db, all, index)) {
    if (tie.nameOnly) counts.nameOnly += 1
    else if (tie.relation === 'renamed') counts.renamed += 1
    else if (tie.relation === 'successor') counts.successors += 1
    else if (tie.relation === 'sibling') counts.siblings += 1
  }
  for (const e of all) if (e.kind === 'alias' && !declined(e)) counts.otherNames += 1
  const checks = db.query<{ startup_id: string; state: string | null }, []>('SELECT startup_id, state FROM website_checks').all()
  for (const c of checks) {
    const decided = index.get(`website:${c.startup_id}`)?.decided
    const state = (decided ? text(asRecord(decided.value).state) : null) ?? c.state
    if (state === 'moved' || state === 'parked') counts.movedOrGone += 1
  }
  return counts
}

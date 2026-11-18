// Derives the readings for a set of startups and their founders: display names, other names, founder display
// names, people on several startups, look-alike person keys and relations between startups. Pure: no I/O, no
// database. The same input always gives the same output, in the same order.

import { describedAs, nameKey, secondDomain } from './aliases'
import { reading, type Reading } from './lanes'
import { keyDistance, maybeSamePerson, samePersonAcross, words, type Appearance } from './people'
import { basisOf, pairSubject, readingId, type ReadingKind, type StoredReading } from './readings'
import { relate, type StartupFacts } from './relations'
import { standardName, standardPersonName } from './standard'

export type DeriveStartup = {
  id: string
  name: string
  description: string | null
  sector: string | null
  creationYear: number | null
  /** Website identity, e.g. "wemove.tn"; null when none. */
  domain: string | null
  /** The email the registry published for it, or null. */
  email: string | null
}

export type DeriveFounder = { startupId: string; position: number; name: string; personKey: string }

export type DeriveInput = {
  startups: DeriveStartup[]
  founders: DeriveFounder[]
  /** How alike two startups' descriptions are (by startup id), or null when one has none. */
  similarity: (a: string, b: string) => number | null
}

const store = <T>(
  kind: ReadingKind,
  subject: string,
  part: string | undefined,
  r: Reading<T>,
  value: unknown,
  basis: string,
): StoredReading => ({
  id: readingId(kind, subject, part),
  kind,
  subject,
  value,
  lane: r.lane,
  rule: r.rule,
  why: r.why,
  basis,
})

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function derive(input: DeriveInput): StoredReading[] {
  const out: StoredReading[] = []
  const startups = input.startups.map((s) => ({ s, n: standardName(s.name) }))

  // A. NAMES: a published name that is not kept as it is.
  for (const { s, n } of startups) {
    if (n.display.rule === 'name.kept') continue
    out.push(
      store(
        'name',
        s.id,
        undefined,
        n.display,
        { display: n.display.value, legalForm: n.legalForm, acronym: n.acronym },
        basisOf(s.name),
      ),
    )
  }

  // B. ALIASES: other names a startup goes by. One per distinct key, never the startup's own name.
  const aliasNames = new Map<string, string[]>()
  for (const { s, n } of startups) {
    const seen = new Set<string>([nameKey(s.name)])
    const names: string[] = []
    const add = (name: string, source: 'name' | 'description' | 'email', r: Reading<string>, basis: string) => {
      const part = nameKey(name)
      if (part === '' || seen.has(part)) return
      seen.add(part)
      names.push(name)
      out.push(store('alias', s.id, part, r, { name, source }, basis))
    }

    if (n.acronym !== null) {
      add(
        n.acronym,
        'name',
        reading(n.acronym, 'rule', 'alias.name-acronym', `Published with "(${n.acronym})" after the name`),
        basisOf(s.name),
      )
    }
    const described = describedAs(s.name, s.description)
    if (described !== null) add(described.value, 'description', described, basisOf(s.name, s.description))
    const email = secondDomain(s.email, s.domain)
    if (email !== null) add(email.value, 'email', email, basisOf(s.email, s.domain))

    aliasNames.set(s.id, names)
  }

  // C. FOUNDER DISPLAY NAMES: only where the casing of the published name changes.
  for (const f of input.founders) {
    const p = standardPersonName(f.name)
    if (p.rule !== 'person.casing') continue
    out.push(store('founder', `${f.startupId}#${f.position}`, undefined, p, { display: p.value }, basisOf(f.name)))
  }

  // The distinct, sorted person keys of each startup.
  const keysOf = new Map<string, string[]>()
  for (const s of input.startups) {
    const keys = new Set(input.founders.filter((f) => f.startupId === s.id).map((f) => f.personKey))
    keysOf.set(s.id, [...keys].sort(compareText))
  }

  // Each person key, with one appearance per startup it is on.
  const appearances = new Map<string, Appearance[]>()
  for (const s of input.startups) {
    const keys = keysOf.get(s.id) ?? []
    for (const key of keys) {
      const list = appearances.get(key) ?? []
      list.push({
        startupId: s.id,
        sector: s.sector,
        creationYear: s.creationYear,
        domain: s.domain,
        cofounders: keys.filter((k) => k !== key),
      })
      appearances.set(key, list)
    }
  }
  const allKeys = [...appearances.keys()].sort(compareText)

  // D. PEOPLE ON SEVERAL STARTUPS.
  for (const key of allKeys) {
    const apps = appearances.get(key) ?? []
    if (apps.length < 2) continue
    const r = samePersonAcross(key, apps)
    const ids = apps.map((a) => a.startupId).sort(compareText)
    out.push(store('person', key, undefined, r, { same: r.value, startups: ids }, basisOf(key, ...ids)))
  }

  // E. LOOK-ALIKE PERSON KEYS. Only keys that share a word are compared.
  const index = new Map<string, string[]>()
  for (const key of allKeys) {
    for (const word of new Set(words(key))) {
      const list = index.get(word) ?? []
      list.push(key)
      index.set(word, list)
    }
  }
  const candidates = new Map<string, [string, string]>()
  for (const bucket of index.values()) {
    for (const [i, a] of bucket.entries()) {
      for (const b of bucket.slice(i + 1)) {
        const pair: [string, string] = a < b ? [a, b] : [b, a]
        candidates.set(`${pair[0]}\u001f${pair[1]}`, pair)
      }
    }
  }
  const sortedCandidates = [...candidates.values()].sort(([a1, b1], [a2, b2]) => compareText(a1, a2) || compareText(b1, b2))
  for (const [a, b] of sortedCandidates) {
    const distance = keyDistance(a, b)
    if (distance !== 'contained' && distance !== 'one-letter') continue
    const apsA = appearances.get(a) ?? []
    const apsB = appearances.get(b) ?? []
    const m = maybeSamePerson({ key: a, appearances: apsA }, { key: b, appearances: apsB })
    if (m === null) continue
    const ids = [...new Set([...apsA, ...apsB].map((x) => x.startupId))].sort(compareText)
    out.push(
      store('person_pair', pairSubject(a, b), undefined, m, { same: m.value, keys: [a, b] }, basisOf(a, b, ...ids)),
    )
  }

  // F. RELATIONS between startups that share at least one person key.
  const linked = new Map<string, [string, string]>()
  for (const key of allKeys) {
    const ids = (appearances.get(key) ?? []).map((x) => x.startupId)
    for (const [i, a] of ids.entries()) {
      for (const b of ids.slice(i + 1)) {
        const pair: [string, string] = a < b ? [a, b] : [b, a]
        linked.set(`${pair[0]}\u001f${pair[1]}`, pair)
      }
    }
  }
  const startupById = new Map(input.startups.map((s) => [s.id, s]))
  const facts = (id: string): StartupFacts | null => {
    const s = startupById.get(id)
    if (s === undefined) return null
    return {
      id: s.id,
      name: s.name,
      sector: s.sector,
      creationYear: s.creationYear,
      domain: s.domain,
      founders: keysOf.get(s.id) ?? [],
      aliases: aliasNames.get(s.id) ?? [],
    }
  }
  const sortedLinks = [...linked.values()].sort(([a1, b1], [a2, b2]) => compareText(a1, a2) || compareText(b1, b2))
  for (const [a, b] of sortedLinks) {
    const fa = facts(a)
    const fb = facts(b)
    if (fa === null || fb === null) continue
    const shared = fa.founders.filter((k) => fb.founders.includes(k))
    const similarity = input.similarity(a, b)
    const rel = relate(fa, fb, similarity)
    out.push(
      store(
        'relation',
        pairSubject(a, b),
        undefined,
        rel,
        { relation: rel.value, shared: shared.length, similarity },
        basisOf(a, b, fa.name, fb.name, fa.domain, fb.domain, ...fa.founders, '|', ...fb.founders),
      ),
    )
  }

  return out
}

export function countByLane(readings: StoredReading[]): Record<'rule' | 'inferred' | 'review', number> {
  const counts = { rule: 0, inferred: 0, review: 0 }
  for (const r of readings) counts[r.lane] += 1
  return counts
}

export function countByKind(readings: StoredReading[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of readings) counts[r.kind] = (counts[r.kind] ?? 0) + 1
  return counts
}

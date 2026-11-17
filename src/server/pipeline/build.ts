import { now } from '../ids'
import { cleanEntry, nameKey, type Cleaned, type Founder, type Note } from './clean'
import type { RegistryRow } from './registry'
import type { RunNote, Step } from './types'

type EntryRow = { id: string; raw_json: string; copies: number; first_download: number; last_download: number; startup_id: string | null }
type Item = EntryRow & { cleaned: Cleaned; notes: Note[]; nameKey: string }

/** A readable, permanent id: "Mon Ingénieur Express" is mon-ingenieur-express. */
export const slug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .slice(0, 48)
    .replace(/-[^-]*$/, (tail, at: number, all: string) => (all.length === 48 && at > 16 ? '' : tail)) // cut at a word, not inside one
    .replace(/^-+|-+$/g, '') || 'startup'

// A gap in the fullest listing may be filled from another listing of the same startup.
// Fields that travel together are filled together.
const FILLABLE: Record<string, (keyof Cleaned)[]> = {
  description: ['description', 'language'],
  sector: ['sector'],
  website: ['website', 'websiteKind', 'domain', 'otherWebsites'],
  founders: ['founders'],
  labelled: ['labelled'],
  creationYear: ['creationYear'],
}
const isEmpty = (v: unknown) => v === null || v === '' || (Array.isArray(v) && !v.length)

/**
 * Groups entries into companies. Two entries are one company when they share a website,
 * or share a name, unless both name-sakes have websites, the websites differ and no founder is common.
 */
function group(items: Item[]): Item[][] {
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const info = items.map((it) => ({
    domains: new Set(it.cleaned.domain ? [it.cleaned.domain] : []),
    founders: new Set(it.cleaned.founders.map((f) => f.personKey)),
  }))
  const union = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)]
    if (ra === rb) return
    parent[rb] = ra
    for (const d of info[rb].domains) info[ra].domains.add(d)
    for (const f of info[rb].founders) info[ra].founders.add(f)
  }
  const bucket = (key: (it: Item) => string | null) => {
    const map = new Map<string, number[]>()
    items.forEach((it, i) => {
      const k = key(it)
      if (k) map.set(k, [...(map.get(k) ?? []), i])
    })
    return [...map.values()].filter((ids) => ids.length > 1)
  }

  for (const ids of bucket((it) => it.cleaned.domain)) for (const i of ids) union(ids[0], i)
  for (const ids of bucket((it) => it.nameKey || null))
    for (const i of ids)
      for (const j of ids) {
        if (j >= i) break
        const [a, b] = [info[find(i)], info[find(j)]]
        const otherSite = a.domains.size > 0 && b.domains.size > 0 && ![...a.domains].some((d) => b.domains.has(d))
        const sharedFounder = [...a.founders].some((f) => b.founders.has(f))
        if (!otherSite || sharedFounder) union(j, i)
      }

  const groups = new Map<number, Item[]>()
  items.forEach((it, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), it]))
  return [...groups.values()]
}

/** One startup from the entries of one company: the fullest current entry leads, the others fill its gaps. */
function assemble(entries: Item[]) {
  const newest = Math.max(...entries.map((e) => e.last_download))
  const current = entries
    .filter((e) => e.last_download === newest)
    .sort((a, b) => (b.cleaned.description?.length ?? 0) - (a.cleaned.description?.length ?? 0) || (a.id < b.id ? -1 : 1))
  const lead = current[0]
  const values: Cleaned = { ...lead.cleaned }
  // Only the gaps of the lead entry that another listing fills: field -> that entry's id.
  const filled: Record<string, string> = {}
  for (const [field, together] of Object.entries(FILLABLE)) {
    if (!isEmpty(lead.cleaned[field as keyof Cleaned])) continue
    const from = current.find((e) => !isEmpty(e.cleaned[field as keyof Cleaned]))
    if (!from) continue
    for (const f of together) (values as Record<string, unknown>)[f] = from.cleaned[f]
    filled[field] = from.id
  }
  const websiteFrom = current.find((e) => e.id === (filled.website ?? lead.id))

  const notes: Note[] = []
  if (!values.description) notes.push({ code: 'no_description', text: 'The registry publishes no description' })
  const listed = current.reduce((n, e) => n + e.copies, 0)
  if (listed > 1) notes.push({ code: 'listed_more_than_once', text: `Listed ${listed} times in the registry` })
  const sectors = [...new Set(current.map((e) => e.cleaned.sector).filter((s) => s && s !== values.sector))]
  if (sectors.length) notes.push({ code: 'other_sector', text: `Also listed under ${sectors.join(', ')}` })
  const names = [...new Set(current.map((e) => e.cleaned.name).filter((n) => n.toLowerCase() !== values.name.toLowerCase()))]
  if (names.length) notes.push({ code: 'other_name', text: `Also listed as ${names.join(', ')}` })
  for (const note of websiteFrom?.notes ?? []) if (note.code.includes('website')) notes.push(note)
  if (!values.website) for (const note of lead.notes) if (note.code === 'website_unreadable') notes.push(note)
  for (const note of lead.notes) if (note.code.startsWith('label')) notes.push(note)

  return { values, lead: lead.id, filled, notes, first: Math.min(...entries.map((e) => e.first_download)), last: newest }
}

type Stored = {
  id: string; entry_id: string; name: string; description: string | null; language: string | null; sector: string | null
  website: string | null; website_kind: string | null; domain: string | null; labelled: string | null
  creation_year: number | null; filled_json: string; notes_json: string
}
const fingerprint = (s: Omit<Stored, 'id'>, founders: Founder[]) =>
  JSON.stringify([s.entry_id, s.name, s.description, s.language, s.sector, s.website, s.website_kind, s.domain, s.labelled,
    s.creation_year, s.filled_json, s.notes_json, founders.map((f) => [f.name, f.personKey])])

// Build: every entry ever collected is read again and the startups are rebuilt from them.
// A startup keeps its id through the entries already linked to it, then through its websites, then its name.
export const build: Step = {
  name: 'build',
  label: 'Build startups from entries',
  run({ db }) {
    const latest = db.query<{ id: number }, []>('SELECT MAX(id) AS id FROM downloads').get()?.id
    if (!latest) throw new Error('Nothing collected yet: run Collect first')

    const items: Item[] = db
      .query<EntryRow, []>('SELECT id, raw_json, copies, first_download, last_download, startup_id FROM entries ORDER BY id')
      .all()
      .map((e) => {
        const { cleaned, notes } = cleanEntry(JSON.parse(e.raw_json) as RegistryRow)
        return { ...e, cleaned, notes, nameKey: nameKey(cleaned.name) }
      })
    const groups = group(items).sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1))

    const storedFounders = new Map<string, Founder[]>()
    for (const f of db.query<{ startup_id: string; name: string; person_key: string }, []>('SELECT startup_id, name, person_key FROM founders ORDER BY startup_id, position').all())
      storedFounders.set(f.startup_id, [...(storedFounders.get(f.startup_id) ?? []), { name: f.name, personKey: f.person_key }])
    const stored = new Map(
      db.query<Stored, []>(
        `SELECT id, entry_id, name, description, language, sector, website, website_kind, domain, labelled, creation_year,
                filled_json, notes_json FROM startups`,
      ).all().map((s) => [s.id, fingerprint(s, storedFounders.get(s.id) ?? [])]),
    )
    const keyOwner = new Map(db.query<{ key: string; startup_id: string }, []>('SELECT key, startup_id FROM startup_keys').all().map((k) => [k.key, k.startup_id]))
    const claimed = new Set<string>()
    const tally = { created: 0, changed: 0, unchanged: 0 }
    const counts = new Map<string, RunNote>()
    const at = now()

    db.transaction(() => {
      const upsert = db.query(
        `INSERT INTO startups (id, entry_id, name, description, language, sector, website, website_kind, domain, labelled,
           creation_year, filled_json, notes_json, first_download, last_download, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)
         ON CONFLICT(id) DO UPDATE SET entry_id = ?2, name = ?3, description = ?4, language = ?5, sector = ?6, website = ?7,
           website_kind = ?8, domain = ?9, labelled = ?10, creation_year = ?11, filled_json = ?12, notes_json = ?13,
           first_download = ?14, last_download = ?15, updated_at = ?16`,
      )
      const seenIn = db.query('UPDATE startups SET first_download = ?, last_download = ? WHERE id = ?')
      const dropFounders = db.query('DELETE FROM founders WHERE startup_id = ?')
      const addFounder = db.query('INSERT INTO founders (startup_id, position, name, person_key) VALUES (?, ?, ?, ?)')
      const link = db.query('UPDATE entries SET startup_id = ? WHERE id = ?')
      const addKey = db.query('INSERT OR IGNORE INTO startup_keys (key, startup_id) VALUES (?, ?)')
      db.run('DELETE FROM startup_keys')

      for (const entries of groups) {
        const s = assemble(entries)
        const siteKeys = [...new Set(entries.map((e) => e.cleaned.domain).filter(Boolean))].map((d) => `site:${d}`)
        const nameKeys = [...new Set(entries.map((e) => e.nameKey).filter(Boolean))].map((n) => `name:${n}`)
        const candidates = [
          ...entries.map((e) => e.startup_id),
          ...siteKeys.map((k) => keyOwner.get(k)),
          ...nameKeys.map((k) => keyOwner.get(k)),
        ].filter((id): id is string => !!id && stored.has(id) && !claimed.has(id))

        let id = candidates[0]
        if (!id) {
          const base = slug(s.values.name)
          id = base
          for (let n = 2; stored.has(id) || claimed.has(id); n++) id = `${base}-${n}`
        }
        claimed.add(id)

        const v = s.values
        const row: Omit<Stored, 'id'> = {
          entry_id: s.lead, name: v.name, description: v.description, language: v.language, sector: v.sector, website: v.website,
          website_kind: v.websiteKind, domain: v.domain, labelled: v.labelled, creation_year: v.creationYear,
          filled_json: JSON.stringify(s.filled), notes_json: JSON.stringify(s.notes),
        }
        const before = stored.get(id)
        const after = fingerprint(row, v.founders)
        if (before === undefined) tally.created++
        else if (before === after) tally.unchanged++
        else tally.changed++
        // updated_at moves only when what a reader sees changed, not on every download.
        if (before !== after) {
          upsert.run(id, row.entry_id, row.name, row.description, row.language, row.sector, row.website, row.website_kind, row.domain,
            row.labelled, row.creation_year, row.filled_json, row.notes_json, s.first, s.last, at)
          dropFounders.run(id)
          v.founders.forEach((f, i) => addFounder.run(id, i, f.name, f.personKey))
        } else seenIn.run(s.first, s.last, id)

        for (const e of entries) if (e.startup_id !== id) link.run(id, e.id)
        for (const key of [...siteKeys, ...nameKeys]) addKey.run(key, id)
        if (s.last === latest)
          for (const note of s.notes) {
            const c = counts.get(note.code) ?? { code: note.code, count: 0, text: NOTE_TEXT[note.code] ?? note.text }
            c.count++
            counts.set(note.code, c)
          }
      }

      // A startup whose entries all moved to another startup has nothing left to stand on.
      for (const id of stored.keys())
        if (!claimed.has(id)) {
          for (const table of ['prepared_texts', 'embedding_meta', 'startup_vectors']) db.query(`DELETE FROM ${table} WHERE startup_id = ?`).run(id)
          db.query('DELETE FROM startups WHERE id = ?').run(id) // founders and website_checks go with it
        }

      db.run('DELETE FROM startups_fts')
      db.run('INSERT INTO startups_fts (startup_id, name, description, sector) SELECT id, name, description, sector FROM startups')
    })()

    const total = groups.length
    const gone = db.query<{ n: number }, [number]>('SELECT COUNT(*) AS n FROM startups WHERE last_download < ?').get(latest)?.n ?? 0
    const notes = [...counts.values()]
    if (gone) notes.unshift({ code: 'not_in_registry', count: gone, text: 'startups no longer published by the registry; kept with the date they were last seen' })
    // What this run did to the startups, always present (zero included) so a page never parses the message.
    notes.unshift(
      { code: 'startups_new', count: tally.created, text: 'startups added by this run' },
      { code: 'startups_changed', count: tally.changed, text: 'startups whose published content changed' },
      { code: 'startups_unchanged', count: tally.unchanged, text: 'startups left as they were' },
    )
    return {
      itemsIn: items.length,
      itemsOut: total,
      message: `${total} startups from ${items.length} entries; ${tally.created} new, ${tally.changed} changed, ${tally.unchanged} unchanged`,
      notes,
    }
  },
}

const NOTE_TEXT: Record<string, string> = {
  no_description: 'startups with no description in the registry; they cannot be matched to an idea',
  listed_more_than_once: 'startups the registry lists more than once; one startup each',
  other_sector: 'startups listed under two sectors; the sector of the fuller listing is kept',
  other_name: 'startups listed under two names',
  website_text_removed: 'website fields that held extra text; only the address is kept',
  website_unreadable: 'website fields that hold no address',
  second_website: 'website fields with two addresses; the first is kept',
  label_unreadable: 'labels that are not a month and year',
  label_before_creation: 'startups labelled before their creation year',
}

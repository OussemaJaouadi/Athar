import type { Database } from 'bun:sqlite'

import { RULES, cleanEntry, displayRow, nameKey, type Cleaned, type Note } from './clean'
import { embeddingHash, embeddingText } from './embed'
import { preparedHash } from './prepare'
import type { RegistryRow } from './registry'

// What an operator needs to know that a log of runs does not say:
// is each step up to date, what is out of date and why, and what to run next;
// and, for one registry entry, how it was read and why it belongs to its startup.

// ── The state of each step ──────────────────────────────────────────────────────────────────────

export type StepState = {
  /** The operation that brings this step up to date: collect, rebuild, check, prepare, embed. */
  operation: string
  label: string
  /** not_configured: Prepare with no AI key saved; nothing is asked of the operator. */
  state: 'up_to_date' | 'stale' | 'never_run' | 'running' | 'failed' | 'not_configured'
  /** How many items the step covers, and how many of them are done and current. */
  total: number
  current: number
  /** Done once, but what they were made from has changed since. */
  outOfDate: number
  /** Never done. */
  missing: number
  /** One sentence: what the numbers are counting. */
  counts: string
  /** Why something is out of date or missing; empty when the step is up to date. */
  reasons: string[]
  /** What to do, or null when there is nothing to do. */
  next: string | null
  lastRun: { id: string; status: string; startedAt: string; finishedAt: string | null } | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "17 Nov 2026", the way the pages write a date. */
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

const CHECKABLE = "website IS NOT NULL AND website_kind IN ('own', 'hosted', 'shortlink')"

export function pipelineState(db: Database): { steps: StepState[]; upToDate: boolean } {
  const n = (sql: string, ...params: (string | number)[]) => db.query<{ n: number }, (string | number)[]>(sql).get(...params)?.n ?? 0
  const lastRun = (operations: string[]): StepState['lastRun'] => {
    const r = db
      .query<{ id: string; status: string; started_at: string; finished_at: string | null }, string[]>(
        `SELECT id, status, started_at, finished_at FROM runs WHERE operation IN (${operations.map(() => '?').join(', ')}) ORDER BY started_at DESC LIMIT 1`,
      )
      .get(...operations)
    return r ? { id: r.id, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at } : null
  }
  const step = (s: Omit<StepState, 'next' | 'state'> & { how: string }): Omit<StepState, 'state'> => {
    const { how, ...rest } = s
    return { ...rest, next: s.outOfDate + s.missing > 0 || s.total === 0 ? how : null }
  }

  // Collect: there is nothing to compare a download with except the registry itself, so it is never "out of date" here.
  const download = db.query<{ id: number; fetched_at: string; last_checked_at: string; row_count: number }, []>('SELECT id, fetched_at, last_checked_at, row_count FROM downloads ORDER BY id DESC LIMIT 1').get()
  const entries = download ? n('SELECT COUNT(*) AS n FROM entries WHERE last_download = ?', download.id) : 0
  const collect: Omit<StepState, 'state'> = {
    // total and current count distinct entries; rows published twice, character for character, are one entry.
    operation: 'collect', label: 'Collect', total: entries, current: entries, outOfDate: 0, missing: 0,
    counts: download ? `${download.row_count} rows in the latest download, ${entries} distinct entries. Last compared with the registry on ${day(download.last_checked_at)}.` : 'Nothing collected yet.',
    reasons: [], next: download ? null : 'Run Collect to download the registry.', lastRun: lastRun(['collect']),
  }

  // Build: every entry belongs to a startup, and the startups were built with the rules now in the code.
  const allEntries = n('SELECT COUNT(*) AS n FROM entries')
  const unlinked = n('SELECT COUNT(*) AS n FROM entries WHERE startup_id IS NULL')
  const builtWith = db.query<{ value: string }, []>("SELECT value FROM pipeline_meta WHERE key = 'rules'").get()?.value ?? null
  const rulesChanged = allEntries > 0 && builtWith !== RULES
  const buildReasons = [
    unlinked > 0 && `${unlinked} ${unlinked === 1 ? 'entry was' : 'entries were'} collected after the last build.`,
    rulesChanged && unlinked < allEntries && (builtWith ? 'The reading rules changed since the startups were built.' : 'The startups were built before rule versions were recorded.'),
  ].filter((r): r is string => !!r)
  const build = step({
    operation: 'rebuild', label: 'Build', total: allEntries, current: rulesChanged ? 0 : allEntries - unlinked, outOfDate: rulesChanged ? allEntries - unlinked : 0, missing: unlinked,
    counts: `${n('SELECT COUNT(*) AS n FROM startups')} startups from ${allEntries} entries.`, reasons: buildReasons, how: 'Run Rebuild. It takes seconds and downloads nothing.', lastRun: lastRun(['rebuild', 'collect']),
  })

  // Check: every startup with a website of its own was asked, at the address it has now.
  const checkable = n(`SELECT COUNT(*) AS n FROM startups WHERE ${CHECKABLE}`)
  const neverAsked = n(`SELECT COUNT(*) AS n FROM startups s WHERE ${CHECKABLE} AND NOT EXISTS (SELECT 1 FROM website_checks w WHERE w.startup_id = s.id)`)
  const moved = n(`SELECT COUNT(*) AS n FROM startups s JOIN website_checks w ON w.startup_id = s.id WHERE ${CHECKABLE} AND w.url <> s.website`)
  const oldest = db.query<{ at: string | null }, []>('SELECT MIN(checked_at) AS at FROM website_checks').get()?.at ?? null
  const answers = n("SELECT COUNT(*) AS n FROM website_checks WHERE status = 'reachable'")
  const check = step({
    operation: 'check', label: 'Check websites', total: checkable, current: checkable - neverAsked - moved, outOfDate: moved, missing: neverAsked,
    counts: oldest ? `${checkable - neverAsked} of ${checkable} websites asked, the oldest answer from ${day(oldest)}. ${answers} answer.` : `${checkable} websites to ask. None asked yet.`,
    reasons: [
      neverAsked > 0 && oldest && `${neverAsked} ${neverAsked === 1 ? 'startup has' : 'startups have'} a website that was never asked.`,
      moved > 0 && `${moved} ${moved === 1 ? 'startup has' : 'startups have'} a new address in the registry since it was asked.`,
    ].filter((r): r is string => !!r),
    how: 'Run Check websites. It asks every website again and takes about five minutes.', lastRun: lastRun(['check']),
  })

  // Prepare and Embed: compare what each text or vector was made from with what the startup says now.
  const described = db
    .query<{ id: string; name: string; sector: string | null; description: string; prepared: string | null; prepared_hash: string | null; vector_hash: string | null }, []>(
      `SELECT s.id, s.name, s.sector, s.description, p.text AS prepared, p.input_hash AS prepared_hash, m.text_hash AS vector_hash
       FROM startups s LEFT JOIN prepared_texts p ON p.startup_id = s.id LEFT JOIN embedding_meta m ON m.startup_id = s.id
       WHERE s.description IS NOT NULL`,
    )
    .all()
  const hasKey = !!db.query<{ id: string }, []>("SELECT id FROM ai_keys WHERE status = 'active' LIMIT 1").get()

  const preparedOld = described.filter((s) => s.prepared_hash && s.prepared_hash !== preparedHash(s)).length
  const preparedNever = described.filter((s) => !s.prepared_hash).length
  const prepare: Omit<StepState, 'state'> = {
    operation: 'prepare', label: 'Prepare', total: described.length, current: described.length - preparedOld - preparedNever, outOfDate: preparedOld, missing: preparedNever,
    counts: `${described.length - preparedNever} of ${described.length} descriptions prepared.`,
    reasons: [
      preparedOld > 0 && `${preparedOld} ${preparedOld === 1 ? 'description' : 'descriptions'} changed since ${preparedOld === 1 ? 'it was' : 'they were'} prepared.`,
      preparedNever > 0 && (hasKey ? `${preparedNever} ${preparedNever === 1 ? 'description was' : 'descriptions were'} never prepared.` : 'No AI key is saved. Prepare is optional: matching works on the descriptions as published.'),
    ].filter((r): r is string => !!r),
    // Without a key there is nothing the operator is asked to do.
    next: !hasKey ? null : preparedOld + preparedNever > 0 ? 'Run Prepare, then Embed. One AI call per description.' : null,
    lastRun: lastRun(['prepare']),
  }

  const vectorOld = described.filter((s) => s.vector_hash && s.vector_hash !== embeddingHash(embeddingText(s.sector, s.prepared ?? s.description))).length
  const vectorNever = described.filter((s) => !s.vector_hash).length
  const orphans = n('SELECT COUNT(*) AS n FROM embedding_meta m WHERE NOT EXISTS (SELECT 1 FROM startups s WHERE s.id = m.startup_id AND s.description IS NOT NULL)')
  const undescribed = n('SELECT COUNT(*) AS n FROM startups WHERE description IS NULL')
  const embed = step({
    operation: 'embed', label: 'Embed', total: described.length, current: described.length - vectorOld - vectorNever, outOfDate: vectorOld + orphans, missing: vectorNever,
    counts: `${described.length - vectorNever} of ${described.length} described startups embedded. ${undescribed} have no description and cannot be.`,
    reasons: [
      vectorOld > 0 && `${vectorOld} ${vectorOld === 1 ? 'startup' : 'startups'} changed text, or the model changed, since ${vectorOld === 1 ? 'it was' : 'they were'} embedded.`,
      vectorNever > 0 && `${vectorNever} described ${vectorNever === 1 ? 'startup was' : 'startups were'} never embedded; the idea check cannot find ${vectorNever === 1 ? 'it' : 'them'}.`,
      orphans > 0 && `${orphans} ${orphans === 1 ? 'vector belongs' : 'vectors belong'} to a startup that no longer has a description.`,
    ].filter((r): r is string => !!r),
    how: 'Run Embed. Only what changed is embedded again.', lastRun: lastRun(['embed']),
  })

  const running = db.query<{ operation: string }, []>("SELECT operation FROM runs WHERE status = 'running' LIMIT 1").get()?.operation
  const ops: Record<string, string[]> = { collect: ['collect'], rebuild: ['rebuild', 'collect'], check: ['check'], prepare: ['prepare'], embed: ['embed'] }
  const steps = [collect, build, check, prepare, embed].map((s): StepState => {
    const due = s.outOfDate + s.missing > 0
    const state: StepState['state'] =
      running && ops[s.operation].includes(running)
        ? 'running'
        : s.operation === 'prepare' && !hasKey
          ? 'not_configured'
          : due && s.lastRun?.status === 'failed'
            ? 'failed'
            : s.total === 0 || (due && s.missing === s.total)
              ? 'never_run'
              : due
                ? 'stale'
                : 'up_to_date'
    return { ...s, state }
  })
  return { steps, upToDate: steps.every((s) => s.next === null) }
}

// ── One entry ───────────────────────────────────────────────────────────────────────────────────

export type EntryHit = { id: string; name: string; startupId: string | null; startupName: string | null; lead: boolean; firstSeen: string; lastSeen: string; published: boolean }

/** The entry a startup's values were read from; null for an unknown startup. */
export const leadEntry = (db: Database, startupId: string) => db.query<{ entry_id: string }, [string]>('SELECT entry_id FROM startups WHERE id = ?').get(startupId)?.entry_id ?? null

/**
 * Find entries by the start of their id, by a startup's exact slug (its lead entry first), by words in the
 * published row (name, description, founders), or by the startup's website.
 */
export function findEntries(db: Database, q: string, limit = 30): EntryHit[] {
  const text = q.trim()
  if (!text) return []
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const byId = /^[0-9a-f]{3,12}$/i.test(text)
  return db
    .query<{ id: string; name: string; startup_id: string | null; startup_name: string | null; lead: number; first_seen: string; last_seen: string; published: number }, [string, string, number]>(
      `SELECT e.id, json_extract(e.raw_json, '$.name') AS name, e.startup_id, s.name AS startup_name, s.entry_id = e.id AS lead,
              d1.fetched_at AS first_seen, d2.last_checked_at AS last_seen, e.last_download = (SELECT MAX(id) FROM downloads) AS published
       FROM entries e LEFT JOIN startups s ON s.id = e.startup_id JOIN downloads d1 ON d1.id = e.first_download JOIN downloads d2 ON d2.id = e.last_download
       WHERE ${byId ? "e.id LIKE ?1 || '%'" : "1 = 0"} OR e.startup_id = ?1 OR json_extract(e.raw_json, '$.name') LIKE ?2 ESCAPE '\\'
          OR json_extract(e.raw_json, '$.desc') LIKE ?2 ESCAPE '\\' OR json_extract(e.raw_json, '$.founders') LIKE ?2 ESCAPE '\\'
          OR s.website LIKE ?2 ESCAPE '\\'
       ORDER BY ${byId ? "e.id LIKE ?1 || '%' DESC," : ''} e.startup_id = ?1 DESC, lead DESC, name COLLATE NOCASE, e.id LIMIT ?3`,
    )
    .all(text.toLowerCase(), like, limit)
    .map((r) => ({ id: r.id, name: r.name, startupId: r.startup_id, startupName: r.startup_name, lead: r.lead === 1, firstSeen: r.first_seen, lastSeen: r.last_seen, published: r.published === 1 }))
}

export type Difference = { field: string; here: string | null; there: string | null }
/** Why two entries are one startup. */
export type Bond = { kind: 'website' | 'name' | 'founder'; text: string }

const show = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : Array.isArray(v) ? (v.length ? v.map((x) => (typeof x === 'object' && x && 'name' in x ? (x as { name: string }).name : String(x))).join(', ') : null) : String(v)

const COMPARED: [keyof Cleaned, string][] = [['name', 'name'], ['description', 'description'], ['sector', 'sector'], ['website', 'website'], ['founders', 'founders'], ['labelled', 'label month'], ['creationYear', 'creation year']]

/** The fields two entries of one startup read differently. */
export function differences(here: Cleaned, there: Cleaned): Difference[] {
  return COMPARED.flatMap(([key, field]) => (show(here[key]) === show(there[key]) ? [] : [{ field, here: show(here[key]), there: show(there[key]) }]))
}

/** What two entries share that made them one startup, strongest first. */
export function bonds(a: Cleaned, b: Cleaned): Bond[] {
  const shared = a.founders.filter((f) => b.founders.some((g) => g.personKey === f.personKey)).map((f) => f.name)
  return [
    a.domain && a.domain === b.domain && { kind: 'website' as const, text: `Same website: ${a.domain}` },
    nameKey(a.name) && nameKey(a.name) === nameKey(b.name) && { kind: 'name' as const, text: a.name === b.name ? `Same name: ${a.name}` : `Same name once case and punctuation are set aside: ${a.name}, ${b.name}` },
    shared.length > 0 && { kind: 'founder' as const, text: `${shared.length === 1 ? 'A founder' : 'Founders'} in common: ${shared.join(', ')}` },
  ].filter((x): x is Bond => !!x)
}

export type EntryView = {
  id: string
  /** The row as it may be shown: verbatim, except text withheld from a website field. */
  row: RegistryRow
  copies: number
  firstSeen: string
  lastSeen: string
  /** Still in the newest download. */
  published: boolean
  /** What reading changed, as text: field, published value, value kept, and why. */
  changes: { field: string; from: string | null; to: string | null; why: string }[]
  notes: Note[]
  startup: { id: string; name: string } | null
  /** The startup's values come from this entry. */
  lead: boolean
  /** The other entries of the same startup: what joins each to this one, and what they read differently. */
  siblings: { id: string; lead: boolean; firstSeen: string; lastSeen: string; published: boolean; bonds: Bond[]; differences: Difference[] }[]
  /** Startups with the same name that were kept apart, and why. */
  namesakes: { id: string; name: string; why: string }[]
  /** What the later steps hold for the startup this entry belongs to; null where a step has nothing. */
  downstream: {
    check: { url: string; status: string; detail: string; finalHost: string | null; checkedAt: string; since: string } | null
    prepared: { text: string; model: string | null; at: string; current: boolean } | null
    vector: { model: string; revision: string; at: string; current: boolean; from: 'prepared text' | 'description' } | null
  } | null
}

type EntryRow = { id: string; raw_json: string; copies: number; startup_id: string | null; first_seen: string; last_seen: string; published: number }
const ENTRY = `SELECT e.id, e.raw_json, e.copies, e.startup_id, d1.fetched_at AS first_seen, d2.last_checked_at AS last_seen,
  e.last_download = (SELECT MAX(id) FROM downloads) AS published
  FROM entries e JOIN downloads d1 ON d1.id = e.first_download JOIN downloads d2 ON d2.id = e.last_download`

export function entryView(db: Database, id: string): EntryView | null {
  const e = db.query<EntryRow, [string]>(`${ENTRY} WHERE e.id = ?`).get(id)
  if (!e) return null
  const raw = JSON.parse(e.raw_json) as RegistryRow
  const safe = displayRow(raw)
  const read = cleanEntry(raw)
  const startup = e.startup_id ? db.query<{ id: string; name: string; entry_id: string }, [string]>('SELECT id, name, entry_id FROM startups WHERE id = ?').get(e.startup_id) : null

  const siblings = startup
    ? db
        .query<EntryRow, [string, string]>(`${ENTRY} WHERE e.startup_id = ? AND e.id <> ? ORDER BY e.first_download, e.id`)
        .all(startup.id, id)
        .map((s) => {
          const other = cleanEntry(JSON.parse(s.raw_json) as RegistryRow).cleaned
          return { id: s.id, lead: s.id === startup.entry_id, firstSeen: s.first_seen, lastSeen: s.last_seen, published: s.published === 1, bonds: bonds(read.cleaned, other), differences: differences(read.cleaned, other) }
        })
    : []

  // Same name, another startup: say what kept them apart.
  const key = nameKey(read.cleaned.name)
  const namesakes = !key
    ? []
    : db
        .query<{ id: string; name: string; domain: string | null }, [string]>('SELECT id, name, domain FROM startups WHERE id <> ?')
        .all(startup?.id ?? '')
        .filter((s) => nameKey(s.name) === key)
        .map((s) => ({ id: s.id, name: s.name, why: `Kept apart: its website is ${s.domain ?? 'not given'}, this one's is ${read.cleaned.domain ?? 'not given'}, and no founder is common.` }))

  let downstream: EntryView['downstream'] = null
  if (startup) {
    const d = db
      .query<
        { name: string; sector: string | null; description: string | null; url: string | null; status: string | null; detail: string | null; final_host: string | null; checked_at: string | null; since: string | null
          p_text: string | null; p_model: string | null; p_at: string | null; p_hash: string | null; v_model: string | null; v_revision: string | null; v_at: string | null; v_hash: string | null },
        [string]
      >(
        `SELECT s.name, s.sector, s.description, w.url, w.status, w.detail, w.final_host, w.checked_at, w.since,
                p.text AS p_text, p.model AS p_model, p.created_at AS p_at, p.input_hash AS p_hash,
                m.model AS v_model, m.revision AS v_revision, m.created_at AS v_at, m.text_hash AS v_hash
         FROM startups s LEFT JOIN website_checks w ON w.startup_id = s.id LEFT JOIN prepared_texts p ON p.startup_id = s.id
         LEFT JOIN embedding_meta m ON m.startup_id = s.id WHERE s.id = ?`,
      )
      .get(startup.id)
    if (d)
      downstream = {
        check: d.status ? { url: d.url!, status: d.status, detail: d.detail!, finalHost: d.final_host, checkedAt: d.checked_at!, since: d.since! } : null,
        prepared: d.p_text && d.description ? { text: d.p_text, model: d.p_model, at: d.p_at!, current: d.p_hash === preparedHash({ name: d.name, sector: d.sector, description: d.description }) } : null,
        vector: d.v_hash && d.description
          ? { model: d.v_model!, revision: d.v_revision!, at: d.v_at!, current: d.v_hash === embeddingHash(embeddingText(d.sector, d.p_text ?? d.description)), from: d.p_text ? 'prepared text' : 'description' }
          : null,
      }
  }

  return {
    id: e.id,
    row: safe,
    copies: e.copies,
    firstSeen: e.first_seen,
    lastSeen: e.last_seen,
    published: e.published === 1,
    // A change must not carry the text the display row withholds.
    changes: read.changes.map((c) => ({ field: c.field, from: show(c.field === 'website' ? safe.website : c.from), to: show(c.to), why: c.why })),
    notes: read.notes,
    startup: startup ? { id: startup.id, name: startup.name } : null,
    lead: startup?.entry_id === e.id,
    siblings,
    namesakes,
    downstream,
  }
}

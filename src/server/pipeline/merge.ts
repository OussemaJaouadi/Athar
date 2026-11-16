import { newId, now } from '../ids'
import type { Step } from './types'

type RecordRow = {
  source_row_id: string
  name: string
  description: string | null
  sector: string | null
  website: string | null
  domain: string | null
  founders_json: string
  cohort: string | null
  creation_year: number | null
}

export const nameKey = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

// One company = one website identity; without a website, the normalized name.
export const identityKey = (r: Pick<RecordRow, 'domain' | 'name'>) => (r.domain ? `site:${r.domain}` : `name:${nameKey(r.name)}`)

// Merge: registrations of the same company become one startup.
export const merge: Step = {
  name: 'merge',
  label: 'Match records to startups',
  run({ db, runId, state }) {
    const snapshotId = state.snapshotId
    if (!snapshotId) throw new Error('No cleaned snapshot: run Clean first')
    const records = db.query<RecordRow, [string]>('SELECT * FROM records WHERE snapshot_id = ?').all(snapshotId)

    const groups = new Map<string, RecordRow[]>()
    for (const r of records) groups.set(identityKey(r), [...(groups.get(identityKey(r)) ?? []), r])

    const existing = new Map(
      db.query<{ id: string; identity_key: string }, []>('SELECT id, identity_key FROM startups').all().map((s) => [s.identity_key, s.id]),
    )
    const byName = new Map<string, string[]>()

    db.transaction(() => {
      const upsert = db.query(
        `INSERT INTO startups (id, identity_key, name, description, sector, website, domain, founders_json, cohort,
           creation_year, primary_row_id, first_snapshot_id, latest_snapshot_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13, ?13)
         ON CONFLICT(identity_key) DO UPDATE SET name = ?3, description = ?4, sector = ?5, website = ?6, domain = ?7,
           founders_json = ?8, cohort = ?9, creation_year = ?10, primary_row_id = ?11, latest_snapshot_id = ?12, updated_at = ?13`,
      )
      const link = db.query('UPDATE records SET startup_id = ? WHERE source_row_id = ?')
      for (const [key, group] of groups) {
        const primary = [...group].sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0))[0]
        const id = existing.get(key) ?? newId()
        upsert.run(id, key, primary.name, primary.description, primary.sector, primary.website, primary.domain,
          primary.founders_json, primary.cohort, primary.creation_year, primary.source_row_id, snapshotId, now())
        for (const r of group) link.run(id, r.source_row_id)
        const nk = nameKey(primary.name)
        byName.set(nk, [...(byName.get(nk) ?? []), id])
      }

      const review = db.query(
        `INSERT INTO review_items (id, startup_id, step, code, message, run_id, created_at) VALUES (?, ?, 'merge', 'possible_duplicate', ?, ?, ?)`,
      )
      for (const ids of byName.values())
        if (ids.length > 1)
          for (const id of ids) review.run(newId(), id, `Same name as ${ids.length - 1} other startup(s) with a different website`, runId, now())

      db.run('DELETE FROM startups_fts')
      db.run('INSERT INTO startups_fts (startup_id, name, description, sector) SELECT id, name, description, sector FROM startups')
    })()

    const merged = records.length - groups.size
    return { itemsIn: records.length, itemsOut: groups.size, message: `${groups.size} startups; ${merged} duplicate registrations merged` }
  },
}

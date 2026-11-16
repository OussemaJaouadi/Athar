import { newId, now } from '../ids'
import type { RegistryRow } from './registry'
import type { Step } from './types'

export type Change = { field: string; from: unknown; to: unknown; why: string }
type Finding = { code: string; message: string }

// Hosts where many startups share one domain; identity needs the page path too.
const HOSTED = new Set(['facebook.com', 'sites.google.com', 'linkedin.com', 'instagram.com', 'linktr.ee', 'wixsite.com'])

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

export function normalizeWebsite(value: string | null): { website: string | null; domain: string | null; ok: boolean } {
  const raw = value?.trim()
  if (!raw || /^n\.?a\.?$/i.test(raw)) return { website: null, domain: null, ok: true }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!url.hostname.includes('.')) return { website: null, domain: null, ok: false }
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const path = url.pathname.replace(/\/+$/, '')
    const first = path.split('/').filter(Boolean)[0]
    const domain = HOSTED.has(host) && first ? `${host}/${first.toLowerCase()}` : host
    return { website: `${url.protocol}//${url.hostname.toLowerCase()}${path}`, domain, ok: true }
  } catch {
    return { website: null, domain: null, ok: false }
  }
}

export function cleanRow(row: RegistryRow) {
  const changes: Change[] = []
  const findings: Finding[] = []
  const note = (field: string, from: unknown, to: unknown, why: string) => {
    // A change only counts when a reader would see a difference, not a type conversion.
    const shown = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v))
    if (shown(from) !== shown(to)) changes.push({ field, from, to, why })
  }

  const name = collapse(row.name ?? '')
  note('name', row.name, name, 'Extra spaces removed')

  const description = row.desc ? row.desc.trim() || null : null
  note('desc', row.desc, description, 'Surrounding spaces removed')
  if (!description) findings.push({ code: 'missing_description', message: 'The registry has no description' })

  const sector = row.sector ? collapse(row.sector) : null
  if (row.industry === row.sector) note('industry', row.industry, null, 'Identical to sector, so only sector is kept')
  else findings.push({ code: 'industry_differs', message: `Industry "${row.industry}" differs from sector "${row.sector}"` })

  const site = normalizeWebsite(row.website)
  note('website', row.website, site.website, 'Normalized to a full URL')
  if (!site.ok) findings.push({ code: 'website_unrepairable', message: `Website "${row.website}" is not a usable URL` })

  const founders = [...new Set((row.founders ?? []).map(collapse).filter(Boolean))]
  note('founders', row.founders, founders, 'Blank and repeated names removed')

  const cohortMatch = /^(\d{2})\/(\d{4})$/.exec(row.label?.trim() ?? '')
  const cohort = cohortMatch ? row.label.trim() : null
  const cohortDate = cohortMatch ? `${cohortMatch[2]}-${cohortMatch[1]}-01` : null
  if (!cohortMatch) findings.push({ code: 'cohort_unreadable', message: `Label "${row.label}" is not MM/YYYY` })

  const year = Number.parseInt(row.creation_year, 10)
  const creationYear = Number.isFinite(year) ? year : null
  note('creation_year', row.creation_year, creationYear, 'Text turned into a number')
  if (cohortMatch && creationYear && Number(cohortMatch[2]) < creationYear)
    findings.push({ code: 'cohort_before_creation', message: `Labelled in ${cohortMatch[2]}, created in ${creationYear}` })

  note('logo', row.logo, null, 'The same placeholder image on every row')

  return {
    record: { name, description, sector, website: site.website, domain: site.domain, founders, cohort, cohortDate, creationYear },
    changes,
    findings,
  }
}

// Clean: one normalized record per source row, with every edit explained.
export const clean: Step = {
  name: 'clean',
  label: 'Normalize fields',
  run({ db, runId, state }) {
    const snapshotId =
      state.snapshotId ??
      db.query<{ id: string }, []>('SELECT id FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1').get()?.id
    if (!snapshotId) throw new Error('No snapshot yet: run Collect first')
    state.snapshotId = snapshotId

    const rows = db
      .query<{ id: string; raw_json: string }, [string]>('SELECT id, raw_json FROM source_rows WHERE snapshot_id = ? ORDER BY row_number')
      .all(snapshotId)
    let flagged = 0

    db.transaction(() => {
      const upsert = db.query(
        `INSERT OR REPLACE INTO records (source_row_id, snapshot_id, name, description, sector, website, domain,
           founders_json, cohort, cohort_date, creation_year, changes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const review = db.query(
        `INSERT INTO review_items (id, source_row_id, step, code, message, run_id, created_at) VALUES (?, ?, 'clean', ?, ?, ?, ?)`,
      )
      for (const row of rows) {
        const { record: r, changes, findings } = cleanRow(JSON.parse(row.raw_json) as RegistryRow)
        upsert.run(row.id, snapshotId, r.name, r.description, r.sector, r.website, r.domain, JSON.stringify(r.founders),
          r.cohort, r.cohortDate, r.creationYear, JSON.stringify(changes))
        if (findings.length) flagged++
        for (const f of findings) review.run(newId(), row.id, f.code, f.message, runId, now())
      }
    })()

    return { itemsIn: rows.length, itemsOut: rows.length, message: `${rows.length} records cleaned; ${flagged} need review` }
  },
}

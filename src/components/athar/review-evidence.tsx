import { Link } from '@tanstack/react-router'

import { parseJson, type EvidenceRow } from '@/components/athar/desk'
import type { Duplicate, ReviewItem } from '#/server/api/review'

/*
 * What each finding needs to be decided without leaving Review: the one value that matters for the list line, and
 * "What cleaning did" (Field / Registry wrote / Cleaning / Why) for the pane, with the offending field flagged.
 */

type Change = { field: string; from: unknown; to: unknown; why: string }

const FIELD_LABEL: Record<string, string> = {
  website: 'Website',
  industry: 'Industry',
  sector: 'Sector',
  logo: 'Logo',
  desc: 'Description',
  name: 'Name',
  founders: 'Founders',
  label: 'Label date',
  creation_year: 'Founded',
  email: 'Email',
  phone: 'Phone',
}
const label = (field: string) => FIELD_LABEL[field] ?? field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ')
const text = (v: unknown) =>
  v === null || v === undefined || v === '' ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : JSON.stringify(v)

// Which stored field each finding is about, so its row in the table carries the ochre bar.
const OFFENDING: Record<string, string> = {
  website_unrepairable: 'website',
  missing_description: 'desc',
  industry_differs: 'industry',
  cohort_unreadable: 'label',
  cohort_before_creation: 'label',
}

/** The list's second line: the value that matters for this finding. `mono` when it is a raw registry value. */
export function listDetail(item: ReviewItem): { text: string; mono: boolean } {
  const labelled = item.raw_label ? `labelled ${item.raw_label}` : 'no label date'
  switch (item.code) {
    case 'website_unrepairable':
      return { text: item.raw_website || 'empty', mono: !!item.raw_website }
    case 'industry_differs':
      return { text: `${item.raw_industry ?? 'empty'} ≠ ${item.raw_sector ?? 'empty'}`, mono: false }
    case 'cohort_unreadable':
      return { text: item.raw_label || 'empty', mono: !!item.raw_label }
    case 'cohort_before_creation':
      return { text: `${labelled} · founded ${item.raw_creation_year ?? item.creation_year ?? '?'}`, mono: false }
    case 'possible_duplicate':
      return { text: `${item.others.length + 1} startups share this name`, mono: false }
    default:
      return { text: [item.sector, labelled].filter(Boolean).join(' · '), mono: false }
  }
}

/** "What cleaning did" for the finding's row, offending field first. */
export function evidenceRows(item: ReviewItem): EvidenceRow[] {
  const bad = OFFENDING[item.code]
  const changes = parseJson<Change[]>(item.changes_json, [])
  const rows: EvidenceRow[] = (Array.isArray(changes) ? changes : []).map((c) => {
    const unusable = c.field === 'website' && (c.to === null || c.to === undefined)
    return {
      field: label(c.field),
      wrote: text(c.from),
      cleaning: c.to === null || c.to === undefined ? (unusable ? 'Left empty' : 'Dropped') : text(c.to),
      why: unusable && item.code === 'website_unrepairable' ? 'Not a usable address, so it stays out of the website checks' : c.why,
      bad: c.field === bad,
    }
  })
  // Findings about a value cleaning left alone still get their row, so the evidence is never missing.
  if (bad && !rows.some((r) => r.bad)) {
    const raw: Record<string, string | null> = {
      desc: item.raw_desc,
      website: item.raw_website,
      industry: item.raw_industry,
      label: item.raw_label,
    }
    rows.unshift({
      field: label(bad),
      wrote: raw[bad] ?? '',
      cleaning: item.code === 'missing_description' ? 'Kept empty' : 'Kept as written',
      why: item.code === 'missing_description' ? 'No description in the registry' : item.message,
      bad: true,
    })
  }
  return rows.sort((a, b) => Number(!!b.bad) - Number(!!a.bad))
}

/** For a possible duplicate: every startup carrying the same name, each with a way into its trace. */
export function DuplicateList({ item }: { item: ReviewItem }) {
  const all: Duplicate[] = [
    { startup_id: item.startup_id ?? '', name: item.name ?? '', website: item.website, row_id: item.source_row_id, row_number: item.row_number },
    ...item.others,
  ]
  return (
    <ul className="border-t border-hairline">
      {all.map((d) => (
        <li key={d.startup_id} className="flex flex-wrap items-baseline gap-x-3 border-b border-hairline py-[7px] text-[0.875rem] text-ink">
          <span>{d.name}</span>
          <span className="text-[0.8125rem] text-ink-2 tabular-nums">{d.row_number ? `row ${d.row_number}` : 'no source row'}</span>
          <span className="font-mono text-[0.8125rem]">{d.website ?? <span className="text-ink-3">empty</span>}</span>
          {d.row_id && (
            <Link to="/portal/trace" search={{ row: d.row_id }} className="ms-auto text-[0.8125rem] text-glaze underline">
              Trace
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

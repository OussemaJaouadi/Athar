import { Link } from '@tanstack/react-router'

import type { Field } from '@/components/athar/ops'
import type { ReviewItem } from '#/server/api/review'

const has = (v: string | number | null | undefined) => v !== null && v !== undefined && String(v).trim() !== ''
const shown = (v: string | number | null | undefined, empty = 'Empty') =>
  has(v) ? <span className="font-mono">{String(v)}</span> : <span className="text-ink-2">{empty}</span>

const context = (item: ReviewItem) =>
  [
    item.sector,
    item.creation_year && `founded ${item.creation_year}`,
    item.founders ? `${item.founders} ${item.founders === 1 ? 'founder' : 'founders'}` : null,
    item.website ? 'has a website' : 'no website',
  ]
    .filter(Boolean)
    .join(' · ')

/** One short line for the list: what the finding rests on, without opening anything. */
export function evidenceLine(item: ReviewItem): string {
  switch (item.code) {
    case 'website_unrepairable':
      return has(item.raw_website) ? `Registry wrote “${item.raw_website}”` : 'Registry website is empty'
    case 'missing_description':
      return context(item)
    case 'industry_differs':
      return `Industry “${item.raw_industry ?? ''}” · sector “${item.raw_sector ?? ''}”`
    case 'cohort_unreadable':
      return `Label date “${item.raw_label ?? ''}”`
    case 'cohort_before_creation':
      return `Labelled ${item.raw_label ?? '?'} · created ${item.raw_creation_year ?? '?'}`
    case 'possible_duplicate':
      return `Same name as ${item.others.length} other ${item.others.length === 1 ? 'startup' : 'startups'}`
    default:
      return item.message
  }
}

/** The full evidence for the drawer, as label and value pairs, values exactly as stored. */
export function evidenceFields(item: ReviewItem): Field[] {
  const out: Field[] = []
  switch (item.code) {
    case 'website_unrepairable':
      out.push({ label: 'Registry wrote', value: shown(item.raw_website), copy: item.raw_website ?? undefined })
      out.push({ label: 'Profile shows', value: 'No website' })
      break
    case 'missing_description':
      out.push({ label: 'Description', value: shown(item.raw_desc, 'None in the registry') })
      break
    case 'industry_differs':
      out.push({ label: 'Industry', value: shown(item.raw_industry), copy: item.raw_industry ?? undefined })
      out.push({ label: 'Registry sector', value: shown(item.raw_sector), copy: item.raw_sector ?? undefined })
      break
    case 'cohort_unreadable':
      out.push({ label: 'Label date', value: shown(item.raw_label), copy: item.raw_label ?? undefined })
      break
    case 'cohort_before_creation':
      out.push({ label: 'Labelled', value: shown(item.raw_label) })
      out.push({ label: 'Created', value: shown(item.raw_creation_year) })
      break
    case 'possible_duplicate':
      break
    default:
      out.push({ label: 'Finding', value: item.message })
  }
  out.push(
    { label: 'Sector', value: item.sector ?? <span className="text-ink-2">Empty</span> },
    { label: 'Founded', value: item.creation_year ?? <span className="text-ink-2">Empty</span> },
    { label: 'Founders', value: item.founders },
    { label: 'Website', value: shown(item.website, 'None'), copy: item.website ?? undefined },
  )
  return out
}

/** For a possible duplicate: this startup and the others with its name, each linking to its trace. */
export function DuplicateList({ item }: { item: ReviewItem }) {
  if (item.code !== 'possible_duplicate') return null
  const all = [
    { startup_id: item.startup_id ?? '', name: item.name ?? 'This startup', website: item.website, row_id: item.source_row_id, row_number: item.row_number },
    ...item.others,
  ]
  return (
    <ul className="grid text-[0.8125rem]">
      {all.map((d, i) => (
        <li key={d.startup_id || i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t border-hairline py-2 first:border-0">
          <span className="text-ink-2 tabular-nums">{d.row_number !== null ? `Row ${d.row_number}` : 'No row'}</span>
          <span className="min-w-0 truncate">
            {d.row_id ? (
              <Link to="/portal/trace" search={{ row: d.row_id ?? undefined }} className="text-glaze underline">
                {d.name}
              </Link>
            ) : (
              d.name
            )}
            {i === 0 && <span className="text-ink-2"> · this one</span>}
          </span>
          <span className="min-w-0 truncate font-mono text-ink">{d.website ?? 'no website'}</span>
        </li>
      ))}
    </ul>
  )
}

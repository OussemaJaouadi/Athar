import { Link } from '@tanstack/react-router'

import type { ReviewItem } from '#/server/api/review'

/** One labelled value, in mono, exactly as stored: the thing the operator is deciding about. */
function Value({ label, value, empty = 'empty' }: { label: string; value: string | null | undefined; empty?: string }) {
  const has = value !== null && value !== undefined && String(value).trim() !== ''
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-[0.8125rem] text-ink-2">{label}</span>
      <span className="min-w-0 rounded-md border border-edge bg-canvas px-2.5 py-1.5 font-mono text-[0.8125rem] break-all text-ink">
        {has ? String(value) : <span className="italic">{empty}</span>}
      </span>
    </div>
  )
}

/**
 * What the finding rests on, shown inline so it can be decided without a trip to Trace.
 * Known codes get their own evidence; anything else shows the finding's message.
 */
export function ReviewEvidence({ item }: { item: ReviewItem }) {
  switch (item.code) {
    case 'website_unrepairable':
      return (
        <div className="grid gap-2">
          <Value label="The registry wrote" value={item.raw_website} />
          <p className="text-ink">Not a usable address, so the profile shows no website.</p>
        </div>
      )
    case 'missing_description':
      return (
        <div className="grid gap-2">
          <Value label="Description in the registry" value={item.raw_desc} empty="no description" />
          <p className="text-ink">
            {[
              item.sector,
              item.creation_year && `founded ${item.creation_year}`,
              item.founders ? `${item.founders} ${item.founders === 1 ? 'founder' : 'founders'}` : null,
              item.website ? 'has a website' : 'no website',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )
    case 'industry_differs':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Value label="Industry" value={item.raw_industry} />
          <Value label="Sector" value={item.raw_sector} />
        </div>
      )
    case 'cohort_unreadable':
      return <Value label="Label date in the registry" value={item.raw_label} />
    case 'cohort_before_creation':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Value label="Labelled" value={item.raw_label} />
          <Value label="Created" value={item.raw_creation_year} />
        </div>
      )
    case 'possible_duplicate':
      return (
        <div className="grid gap-2">
          <p className="text-ink">{item.message}.</p>
          <ul className="grid gap-1.5">
            {[{ startup_id: item.startup_id ?? '', name: item.name ?? 'This startup', website: item.website, row_id: item.source_row_id, row_number: item.row_number }, ...item.others].map(
              (d, i) => (
                <li key={d.startup_id || i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-edge bg-canvas px-2.5 py-1.5">
                  <span className="font-mono text-[0.8125rem] text-ink-2">{d.row_number !== null ? `Row ${d.row_number}` : 'No row'}</span>
                  {d.row_id ? (
                    <Link to="/portal/trace/$rowId" params={{ rowId: d.row_id }} className="text-glaze underline">
                      {d.name}
                    </Link>
                  ) : (
                    <span className="text-ink">{d.name}</span>
                  )}
                  <span className="font-mono text-[0.8125rem] break-all text-ink">{d.website ?? 'no website'}</span>
                  {i === 0 && <span className="text-[0.8125rem] text-ink-2">this one</span>}
                </li>
              ),
            )}
          </ul>
        </div>
      )
    default:
      return <p className="text-ink">{item.message.replace(/[.\s]*$/, '.')}</p>
  }
}

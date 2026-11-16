import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  StageStrip,
  findingName,
  labControl,
  labDuration,
  labPrimary,
  labTime,
} from '@/components/athar/lab'
import { findRows, getTrace } from '#/server/api/portal'

export const Route = createFileRoute('/portal/trace/$rowId')({
  loader: async ({ params }) => {
    const data = await getTrace({ data: params.rowId })
    if (!data) throw notFound()
    return data
  },
  component: TracePage,
})

const fields = [
  ['name', 'Name'],
  ['description', 'Description'],
  ['sector', 'Sector'],
  ['website', 'Website'],
  ['founders_json', 'Founders'],
  ['cohort', 'Label date'],
  ['creation_year', 'Creation year'],
] as const
const fieldName = (field: string) =>
  ({
    desc: 'Description',
    industry: 'Industry',
    founders: 'Founders',
    logo: 'Logo',
    domain: 'Website domain',
    cohort_date: 'Label date',
  })[field] ??
  fields.find(([key]) => key === field)?.[1] ??
  'Field'
function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.map(valueText).join(', ')
  if (typeof value === 'boolean') return value ? 'Present' : 'Absent'
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([key, v]) => `${key}: ${valueText(v)}`)
      .join('; ')
  return String(value)
}
const display = (value: unknown) =>
  valueText(value) || <em className="text-ink-2">Empty</em>
const recordValue = (record: Record<string, unknown> | null, field: string) => {
  const value = record?.[field]
  return field === 'founders_json' && typeof value === 'string'
    ? JSON.parse(value)
    : value
}

function TracePage() {
  const {
    row,
    counts,
    changes,
    record,
    startup,
    siblings,
    reviews,
    operations,
  } = Route.useLoaderData()
  const navigate = useNavigate()
  const raw = JSON.parse(row.raw_json) as Record<string, unknown>
  const openFindings = reviews.filter((review) => review.status === 'open')
  const metadata = (name: string) => {
    const step = operations.find((operation) => operation.step === name)
    return (
      step && (
        <span className="inline-flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1 text-sm font-normal text-ink-2">
          <Link
            to="/portal/runs/$runId"
            params={{ runId: step.run_id }}
            className="min-w-0 break-all font-mono text-glaze underline"
          >
            run <span className="font-mono">{step.run_id.slice(-4)}</span>
          </Link>
          {step.started_at && (
            <time dateTime={step.started_at}>{labTime(step.started_at)}</time>
          )}
          {labDuration(step.started_at, step.finished_at)}
        </span>
      )
    )
  }
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] leading-9 font-medium">
            Trace of source row {row.row_number}
          </h1>
          <p className="mt-1 text-ink-2">
            From the download to the startup it became, one operation at a time
          </p>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const q = String(new FormData(event.currentTarget).get('row'))
            const matches = await findRows({ data: q })
            if (matches[0])
              await navigate({
                to: '/portal/trace/$rowId',
                params: { rowId: matches[0].id },
              })
            else await navigate({ to: '/portal/trace', search: { q } })
          }}
        >
          <label htmlFor="trace-row" className="text-ink-2">
            Row
          </label>
          <input
            id="trace-row"
            name="row"
            type="number"
            min="1"
            required
            defaultValue={row.row_number}
            key={row.id}
            className={`${labControl} w-24 tabular-nums`}
          />
          <button className={labPrimary}>Trace row</button>
        </form>
      </header>
      <StageStrip
        {...counts}
        notes={[
          `Row ${row.row_number} kept`,
          record ? `${changes.length} fields changed` : 'Not cleaned yet',
          siblings.length
            ? `Matched with ${siblings.length} other source ${siblings.length === 1 ? 'row' : 'rows'}`
            : startup
              ? 'One source row matched'
              : 'Not matched yet',
          'Not built yet',
          `${openFindings.length} open findings for this row`,
        ]}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <ol aria-label={`Operations on source row ${row.row_number}`}>
          <Station title="Collect" meta={metadata('collect')}>
            <p className="text-ink-2">
              Downloaded as source row {row.row_number} of the registry on{' '}
              {labTime(row.fetched_at)}. {Object.keys(raw).length} fields,
              stored exactly as received.
            </p>
          </Station>
          <Station title="Clean" meta={metadata('clean')}>
            <p className="text-ink-2">
              {!record
                ? 'Not cleaned yet.'
                : changes.length
                  ? `${changes.length} fields changed. The original values are kept below.`
                  : 'No fields changed.'}
            </p>
            {changes.length > 0 && (
              <ul className="mt-3 grid gap-3 sm:hidden">
                {changes.map((change) => (
                  <li key={change.field} className="grid gap-1 border-b border-hairline pb-3">
                    <span className="font-medium">{fieldName(change.field)}</span>
                    <span className="wrap-anywhere text-ink-2">
                      Before: {display(raw[change.field])}
                    </span>
                    <span className="wrap-anywhere">After: {display(change.to)}</span>
                    <span className="text-ink-2">{change.why}</span>
                  </li>
                ))}
              </ul>
            )}
            {changes.length > 0 && (
              <table className="mt-3 hidden w-full table-fixed sm:table">
                <thead>
                  <tr>
                    {['Field', 'Before', 'After', 'Why'].map((label) => (
                      <th
                        key={label}
                        className="border-b border-control border-input py-2 pe-3 text-start font-medium text-ink-2"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.field} className="align-top">
                      <td className="border-b border-hairline py-2 pe-3 wrap-anywhere">
                        {fieldName(change.field)}
                      </td>
                      <td className="border-b border-hairline py-2 pe-3 wrap-anywhere whitespace-pre-wrap text-ink-2">
                        {display(raw[change.field])}
                      </td>
                      <td className="border-b border-hairline py-2 pe-3 wrap-anywhere">
                        {display(change.to)}
                      </td>
                      <td className="border-b border-hairline py-2 wrap-anywhere text-ink-2">
                        {change.why}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Station>
          <Station title="Merge" meta={metadata('merge')}>
            <p className="text-ink-2">
              {!startup
                ? 'Not matched to a startup yet.'
                : siblings.length
                  ? 'These source rows point to the same startup. The kept values are shown beside the cleaned records.'
                  : 'This source row points to one startup. No other source rows were matched.'}
            </p>
            {siblings.map((sibling) => (
              <div key={sibling.source_row_id} className="mt-4">
                <Link
                  to="/portal/trace/$rowId"
                  params={{ rowId: sibling.source_row_id }}
                  className="text-glaze underline"
                >
                  Trace source row {sibling.row_number}
                </Link>
                <table className="mt-2 w-full table-fixed">
                  <thead>
                    <tr>
                      {[
                        'Field',
                        `Row ${row.row_number}`,
                        `Row ${sibling.row_number}`,
                        'Kept',
                      ].map((label) => (
                        <th
                          key={label}
                          className="border-b border-control border-input py-2 pe-3 text-start font-medium text-ink-2"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map(([field, label]) => (
                      <tr key={field} className="align-top">
                        <td className="border-b border-hairline py-2 pe-3 wrap-anywhere">
                          {label}
                        </td>
                        <td className="border-b border-hairline py-2 pe-3 wrap-anywhere">
                          {display(recordValue(record, field))}
                        </td>
                        <td className="border-b border-hairline py-2 pe-3 wrap-anywhere text-ink-2">
                          {display(recordValue(sibling, field))}
                        </td>
                        <td className="border-b border-hairline py-2 wrap-anywhere">
                          {display(recordValue(startup, field))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {openFindings.map((finding, index) => (
              <p
                key={`${finding.code}-${index}`}
                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[4px] bg-warn-bg px-3 py-2 text-warn"
              >
                <span>Open finding: {findingName(finding.code)}.</span>
                <Link
                  to="/portal/review"
                  search={{ code: finding.code }}
                  className="text-warn underline"
                >
                  Open in review
                </Link>
              </p>
            ))}
          </Station>
          <Station title="Prepare">
            <p className="text-ink-2">Not run yet</p>
          </Station>
          <Station
            title={`Startup: ${startup?.name ?? 'Not matched yet'}`}
            last
          >
            {startup ? (
              <Link
                to="/startups/$id"
                params={{ id: startup.id }}
                className="text-glaze underline"
              >
                Open profile in the main app
              </Link>
            ) : (
              <p className="text-ink-2">
                A startup profile is available after Merge.
              </p>
            )}
          </Station>
        </ol>
        <aside className="min-w-0 bg-surface p-4 lg:sticky lg:top-4">
          <h2 className="text-base font-medium">
            Source row {row.row_number} as downloaded
          </h2>
          <p className="mt-1 text-ink-2">
            Registry snapshot · {labTime(row.fetched_at)} ·{' '}
            <span className="font-mono">{row.content_hash.slice(0, 12)}</span>
          </p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4">
            {Object.entries(raw).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="border-b border-hairline py-2 pe-3 font-mono text-sm whitespace-nowrap text-ink-2">
                  {key}
                </dt>
                <dd className="border-b border-hairline py-2 wrap-anywhere whitespace-pre-wrap">
                  {display(value)}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            to="/portal/database"
            search={{ table: 'source_rows' }}
            className="mt-4 inline-block text-glaze underline"
          >
            Open in database view
          </Link>
        </aside>
      </div>
    </main>
  )
}

function Station({
  title,
  meta,
  children,
  last = false,
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  last?: boolean
}) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="relative" aria-hidden>
        <span
          className={`absolute start-[13px] top-3 w-px bg-ochre ${last ? 'h-0' : 'bottom-0'}`}
        />
        <span className="absolute start-[9px] top-3 size-[9px] rounded-full bg-ochre" />
      </span>
      <div className="min-w-0 pb-7">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-medium">{title}</h2>
          {meta}
        </div>
        {children}
      </div>
    </li>
  )
}

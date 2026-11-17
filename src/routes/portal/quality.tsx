import { shortDate } from '@/components/athar/kit'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Check, Copy, Search } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskGroup, DeskItem, DeskPane, deskBtn, deskInput, deskTd, deskTh, useDeskKeys } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { cn } from '@/lib/utils'
import { getCorpus } from '#/server/api/app'
import { getFactRows, getPipelineState, getQualitySummary } from '#/server/api/ops'
import type { FactRow, QualityFact } from '#/server/pipeline/facts'

/*
 * Quality: what in the data is doubtful or missing right now. Every fact reads today's data (getFactRows), not what a
 * past run counted. These are observations about the registry, not errors: no warning colour anywhere on the page.
 */

const s = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

// What each fact costs a reader, from its real count. The label comes from the server (getQualitySummary).
const COST: Record<string, (n: number) => string> = {
  no_description: (n) => `${s(n, 'startup has', 'startups have')} no description, so they cannot be matched to an idea by meaning.`,
  no_website: (n) => `${s(n, 'startup has', 'startups have')} no website in the registry, so nothing can be asked about it.`,
  website_unreadable: (n) => `${s(n, 'website field holds', 'website fields hold')} no usable address, so the website is treated as missing.`,
  label_unreadable: (n) => `${s(n, 'startup has', 'startups have')} a label date that cannot be read, so they are left out of every year and month.`,
  label_before_creation: (n) => `${s(n, 'startup was', 'startups were')} labelled before the year they say they were founded; one of the two dates is wrong.`,
  moved: (n) => `${s(n, 'website answers', 'websites answer')} from another domain than the registry gives, so the published address is out of date.`,
  website_text_removed: (n) => `${s(n, 'website field held', 'website fields held')} more than an address; only the address is kept and the rest is withheld from screens.`,
  second_website: (n) => `${s(n, 'website field holds', 'website fields hold')} two addresses; only the first is asked and shown.`,
  social_not_checked: (n) => `${s(n, 'startup gives', 'startups give')} a page on a social network as its website, so it is not asked whether it answers.`,
  listed_more_than_once: (n) => `${s(n, 'startup appears', 'startups appear')} in the registry more than once; each is shown as one startup.`,
  other_sector: (n) => `${s(n, 'startup is', 'startups are')} listed under two sectors; the sector of the fuller listing is kept, so sector counts carry a small doubt.`,
  other_name: (n) => `${s(n, 'startup is', 'startups are')} listed under two names; one name is shown and the other is kept as a spelling.`,
  exact_copies: (n) => `${s(n, 'row was', 'rows were')} published more than once, character for character; each is stored once.`,
  not_in_registry: (n) => `${s(n, 'startup is', 'startups are')} no longer published by the registry; Athar keeps them with the date they were last seen.`,
}
const costOf = (code: string, label: string, n: number) => {
  if (COST[code]) return COST[code](n)
  if (code === 'unreachable:no such domain') return `${s(n, 'website points', 'websites point')} to a domain that no longer exists, so the registry's link leads nowhere.`
  if (code.startsWith('unreachable:')) return `${s(n, 'website does', 'websites do')} not answer (${code.slice(12)}), so the registry's link does not open a working site.`
  return `${s(n, 'startup', 'startups')}: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`
}

const GROUP_NAME: Record<QualityFact['group'], string> = { missing: 'Missing', website: 'Websites', listing: 'Listing', reading: 'Reading', registry: 'Registry' }
const GROUPS = Object.keys(GROUP_NAME) as QualityFact['group'][]

export const Route = createFileRoute('/portal/quality')({
  validateSearch: (q: Record<string, unknown>): { fact?: string; q?: string } => ({
    fact: typeof q.fact === 'string' && q.fact ? q.fact : undefined,
    q: typeof q.q === 'string' && q.q ? q.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ fact: search.fact }),
  // The list and counts in one cheap call; only the selected fact's rows are read (getFactRows).
  loader: async ({ deps }) => {
    const [facts, corpus, state] = await Promise.all([getQualitySummary(), getCorpus(), getPipelineState()])
    const code = deps.fact && facts.some((f) => f.code === deps.fact) ? deps.fact : facts.find((f) => f.count > 0)?.code
    const result = code ? await getFactRows({ data: code }) : null
    // An unreachable website's value reads "url · detail"; the detail is the fact itself, so only the address stays.
    const rows = (result?.rows ?? []).map((r) => (code?.startsWith('unreachable:') && r.value ? { ...r, value: r.value.replace(/ · [^·]*$/, '') } : r))
    const check = state.steps.find((st) => st.operation === 'check')
    return { facts, code, rows, total: result?.total ?? 0, startups: corpus.startups, checkedAt: check?.lastRun?.finishedAt ?? null }
  },
  component: QualityPage,
})

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const share = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '')
const csvCell = (v: string | null) => (v === null ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function QualityPage() {
  const { facts, code, rows, total, startups, checkedAt } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/quality' })

  // In the server's order within each group; a fact checked and found empty stays, last, saying "none".
  const ordered = useMemo(
    () => GROUPS.map((g) => ({ group: g, facts: [...facts.filter((f) => f.group === g && f.count > 0), ...facts.filter((f) => f.group === g && f.count === 0)] })).filter((g) => g.facts.length),
    [facts],
  )
  const flat = ordered.flatMap((g) => g.facts)
  const ids = flat.map((f) => f.code)
  const fact = flat.find((f) => f.code === code)
  const select = useCallback((c: string) => navigate({ search: (p) => ({ ...p, fact: c, q: undefined }), replace: true }), [navigate])
  const searchRef = useRef<HTMLInputElement>(null)
  useDeskKeys({ ids, current: code, select, search: searchRef })

  const top = [...facts].sort((a, b) => b.count - a.count).filter((f) => f.count > 0).slice(0, 2)
  const sentence = top.length
    ? `Largest: ${top.map((f) => `${f.label.toLowerCase()} (${f.count.toLocaleString('en-GB')})`).join(' and ')}${checkedAt ? ` · websites last asked ${day(checkedAt)}` : ''}`
    : 'Nothing doubtful or missing in the data today.'

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Quality" facts={sentence} />
      <Desk
        storageKey="quality"
        listWidth={400}
        showPaneOnNarrow={!!search.fact}
        onBack={() => navigate({ search: (p) => ({ ...p, fact: undefined }), replace: true })}
        backLabel="All facts"
        list={
          <div role="list" aria-label="Facts">
            {ordered.map(({ group, facts: gf }) => (
              <div key={group} role="listitem">
                <DeskGroup label={GROUP_NAME[group]} count={gf.filter((f) => f.count > 0).length} />
                <div role="list">
                  {gf.map((f) => (
                    <div role="listitem" key={f.code}>
                      <DeskItem
                        selected={f.code === code}
                        onSelect={() => select(f.code)}
                        title={f.label}
                        detail={f.count ? `${f.count.toLocaleString('en-GB')} · ${share(f.count, startups)}` : 'none'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        }
        pane={
          fact ? (
            <FactPane
              key={fact.code}
              fact={fact}
              rows={rows}
              total={total}
              filter={search.q ?? ''}
              searchRef={searchRef}
              onFilter={(q) => navigate({ search: (p) => ({ ...p, q: q || undefined }), replace: true })}
            />
          ) : (
            <DeskEmpty>Nothing doubtful or missing today.</DeskEmpty>
          )
        }
      />
    </main>
  )
}

type SortKey = 'name' | 'value' | 'labelled' | 'observedOn'

function FactPane({
  fact,
  rows: all,
  total,
  filter,
  onFilter,
  searchRef,
}: {
  fact: QualityFact
  rows: FactRow[]
  total: number
  filter: string
  onFilter: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [copied, setCopied] = useState(false)
  const needle = filter.trim().toLowerCase()
  const rows = useMemo(() => {
    const kept = needle ? all.filter((r) => `${r.name} ${r.value ?? ''}`.toLowerCase().includes(needle)) : all
    const key = (r: (typeof all)[number]) => (sort.key === 'name' ? r.name : ((r[sort.key] as string | null | undefined) ?? ''))
    return [...kept].sort((a, b) => sort.dir * key(a).localeCompare(key(b)))
  }, [all, needle, sort])
  const valueHeading = fact.code.startsWith('unreachable:') ? 'Address asked' : fact.code === 'no_description' || fact.code === 'no_website' ? null : 'What'

  const head = (key: SortKey, label: string) => (
    <th scope="col" className={deskTh} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink" onClick={() => setSort((p) => ({ key, dir: p.key === key ? (p.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
      </button>
    </th>
  )

  return (
    <DeskPane
      title={fact.label}
      statement={fact.count ? costOf(fact.code, fact.label, fact.count) : 'None in the data today.'}
      position={total > all.length ? `showing ${all.length.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}` : undefined}
      foot={
        all.length > 0 && (
          <button
            type="button"
            className={deskBtn}
            onClick={() => {
              const csv = ['startup,startup_id,value,labelled,observed_on', ...rows.map((r) => [r.name, r.startupId, r.value, r.labelled, r.observedOn].map(csvCell).join(','))].join('\n')
              navigator.clipboard
                ?.writeText(csv)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
                .catch(() => setCopied(false))
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copied' : `Copy ${rows.length === all.length ? 'all' : rows.length.toLocaleString('en-GB')} as CSV`}
          </button>
        )
      }
    >
      {all.length === 0 ? (
        <p className="text-[0.875rem] text-ink">Nothing in the data matches this today.</p>
      ) : (
        <div className="grid gap-3">
          <label className="relative flex max-w-[420px] items-center">
            <span className="sr-only">Filter this list</span>
            <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              defaultValue={filter}
              onChange={(e) => onFilter(e.target.value)}
              placeholder="Filter by startup or value"
              className={cn(deskInput, 'w-full ps-8')}
            />
          </label>
          <p className="text-[0.8125rem] text-ink-2">Read from the data as it is today.</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {head('name', 'Startup')}
                {valueHeading && head('value', valueHeading)}
                {head('labelled', 'Labelled')}
                {head('observedOn', 'Observed on')}
                <th scope="col" className={deskTh}>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.entryId ?? r.startupId ?? r.name}-${i}`}>
                  <td className={cn(deskTd, 'w-[36%]')}>
                    {r.startupId ? (
                      <StartupLink id={r.startupId} className="text-glaze underline">
                        <span dir="auto">{r.name}</span>
                      </StartupLink>
                    ) : (
                      <span dir="auto">{r.name}</span>
                    )}
                  </td>
                  {valueHeading && <td className={cn(deskTd, '[overflow-wrap:anywhere]')}>{r.value ?? <span className="text-ink-3">—</span>}</td>}
                  <td className={cn(deskTd, 'whitespace-nowrap tabular-nums')}>{r.labelled ? monthYear(r.labelled) : <span className="text-ink-3">—</span>}</td>
                  <td className={cn(deskTd, 'whitespace-nowrap tabular-nums')}>{r.observedOn ? shortDate(r.observedOn) : <span className="text-ink-3">—</span>}</td>
                  <td className={cn(deskTd, 'w-[1%] whitespace-nowrap text-end')}>
                    {r.entryId ? (
                      <Link to="/portal/startups" search={{ entry: r.entryId }} className="font-mono text-[0.8125rem] text-glaze underline">
                        entry {r.entryId.slice(0, 8)}
                      </Link>
                    ) : r.startupId ? (
                      <Link to="/portal/startups" search={{ startup: r.startupId }} className="text-[0.8125rem] text-glaze underline">
                        Open its entry
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-[0.875rem] text-ink">No row matches “{filter}”.</p>}
        </div>
      )}
    </DeskPane>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (labelled: string) => `${MONTHS[Number(labelled.slice(5, 7)) - 1] ?? ''} ${labelled.slice(0, 4)}`.trim()

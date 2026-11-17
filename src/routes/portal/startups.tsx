import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, Copy, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, DeskSelect, Fields, JsonBlock, Kbd, PaneSection, deskBtn, deskInput, useDeskKeys } from '@/components/athar/desk'
import { GROUP_NAME, costOf, factShort, groupFacts, isSilent } from '@/components/athar/quality-facts'
import { Differences, HowRead, Namesakes, Observed } from '@/components/athar/ops-startup-sections'
import { Disclosure } from '@/components/athar/startup-title'
import { day, plural } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { getCorpus } from '#/server/api/app'
import { getEntry, getFactRows, getFoundersOf, getLeadEntry, getQualitySummary, searchStartupsOps } from '#/server/api/ops'
import type { FactRow, QualityFact } from '#/server/pipeline/facts'
import { getStartupPage } from '#/server/api/startup'
import type { EntryView } from '#/server/pipeline/state'

// fact: a quality fact chosen in the facts column; the list is then the startups behind it.
type SearchParams = { q?: string; startup?: string; entry?: string; fact?: string }

// The note codes an operator reads first, with the words the list uses for them.
const NOTE: Record<string, string> = {
  listed_more_than_once: 'listed more than once',
  other_name: 'also listed under another name',
  other_sector: 'also listed under another sector',
  website_text_removed: 'text removed from its website field',
  second_website: 'two websites, the first kept',
  no_description: 'no description',
  website_unreadable: 'website could not be read',
  label_unreadable: 'label date could not be read',
  label_before_creation: 'labelled before it was founded',
}
const DEFAULT_CODES = ['listed_more_than_once', 'other_name', 'other_sector', 'website_text_removed', 'second_website']

// `entry`: a fact row that names an entry and no startup; selecting it opens the startup that entry belongs to.
type Item = { id: string; name: string; sector: string | null; entries: number | null; notes: string[]; withdrawn: boolean; entry?: string; value?: string | null; labelled?: string | null }

export const Route = createFileRoute('/portal/startups')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    startup: typeof s.startup === 'string' && s.startup ? s.startup : undefined,
    entry: typeof s.entry === 'string' && s.entry ? s.entry : undefined,
    fact: typeof s.fact === 'string' && s.fact ? s.fact : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', startup: search.startup, entry: search.entry, fact: search.fact }),
  loader: async ({ deps }) => {
    const [facts, corpus] = await Promise.all([getQualitySummary(), getCorpus()])
    // The list: a search, else the startups behind the chosen fact, else the ones an operator should read first
    // (more than one entry, or a note that says the registry and Athar's reading differ).
    const fact = !deps.q && deps.fact ? facts.find((f) => f.code === deps.fact) : undefined
    let factRows: FactRow[] = []
    let factTotal = 0
    let items: Item[]
    if (deps.q) {
      items = (await searchStartupsOps({ data: deps.q })).map((h) => ({ id: h.id, name: h.name, sector: h.sector, entries: h.entries, notes: h.notes, withdrawn: h.withdrawn }))
    } else if (fact) {
      const result = await getFactRows({ data: fact.code })
      factTotal = result?.total ?? 0
      // An unreachable website's value reads "url · detail"; the detail is the fact itself, so only the address stays.
      factRows = (result?.rows ?? []).map((r) => (fact.code.startsWith('unreachable:') && r.value ? { ...r, value: r.value.replace(/ · [^·]*$/, '') } : r))
      const seen = new Set<string>()
      items = []
      factRows.forEach((r, i) => {
        const id = r.startupId ?? (r.entryId ? `entry:${r.entryId}` : `row:${i}`)
        if (seen.has(id)) return
        seen.add(id)
        items.push({ id, name: r.name, sector: null, entries: null, notes: [], withdrawn: false, entry: r.startupId ? undefined : r.entryId, value: r.value, labelled: r.labelled })
      })
    } else {
      items = await defaultItems()
    }
    // The selected startup: from the URL, else from an entry in the URL, else the first item.
    let startupId = deps.startup
    if (!startupId && deps.entry) startupId = (await getEntry({ data: deps.entry }))?.startup?.id
    if (!startupId && items[0]) startupId = items[0].entry ? (await getEntry({ data: items[0].entry }))?.startup?.id : items[0].id.startsWith('row:') ? undefined : items[0].id
    const detail = startupId ? await loadStartup(startupId) : null
    return { items, startupId, detail, facts, fact, factRows, factTotal, startups: corpus.startups }
  },
  component: StartupsPage,
})

async function defaultItems(): Promise<Item[]> {
  const lists = await Promise.all(DEFAULT_CODES.map((code) => getFactRows({ data: code }).then((r) => ({ code, rows: r?.rows ?? [] }))))
  const byId = new Map<string, Item>()
  for (const { code, rows } of lists)
    for (const r of rows) {
      if (!r.startupId) continue
      const it = byId.get(r.startupId) ?? { id: r.startupId, name: r.name, sector: null, entries: null, notes: [], withdrawn: false }
      if (!it.notes.includes(code)) it.notes.push(code)
      byId.set(r.startupId, it)
    }
  return [...byId.values()].sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name))
}

// Everything behind one startup: its values, its lead entry with the others, why they belong together, and what the
// later steps hold.
async function loadStartup(id: string) {
  const [page, leadId, founders] = await Promise.all([getStartupPage({ data: id }), getLeadEntry({ data: id }), getFoundersOf({ data: id })])
  if (!page || !leadId) return null
  const lead = await getEntry({ data: leadId })
  if (!lead) return null
  const others = (await Promise.all(lead.siblings.map((s) => getEntry({ data: s.id })))).filter((v): v is EntryView => !!v)
  return { page, lead, others, founders }
}

type Detail = NonNullable<Awaited<ReturnType<typeof loadStartup>>>

function StartupsPage() {
  const { items, startupId, detail, facts, fact, factRows, factTotal, startups } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/startups' })
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(search.q ?? '')

  // Search as you type; the URL keeps the query.
  useEffect(() => {
    if (query === (search.q ?? '')) return
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, q: query.trim() || undefined, fact: query.trim() ? undefined : s.fact, startup: undefined, entry: undefined }), replace: true }), 220)
    return () => clearTimeout(t)
  }, [query, search.q, navigate])

  const select = useCallback(
    (id: string) => {
      if (id.startsWith('row:')) return
      navigate({ search: (s) => (id.startsWith('entry:') ? { ...s, startup: undefined, entry: id.slice(6) } : { ...s, startup: id, entry: undefined }) })
    },
    [navigate],
  )
  const pickFact = useCallback(
    (code: string | undefined) => {
      setQuery('')
      navigate({ search: { fact: code } })
    },
    [navigate],
  )
  const grouped = useMemo(() => groupFacts(facts), [facts])
  const isSelected = (it: Item) => it.id === startupId || (!!it.entry && it.entry === search.entry)
  const ids = useMemo(() => items.map((i) => i.id), [items])
  useDeskKeys({ ids, current: startupId, select, search: searchRef })

  const list = (
    <div role="list" aria-label="Startups">
      {fact && !search.q && <FactHeader fact={fact} rows={factRows} total={factTotal} />}
      {!fact && !search.q && items.length > 0 && (
        <p className="border-b border-edge px-4 py-3 text-[0.875rem] text-ink">
          {plural(items.length, 'startup', 'startups')} to read first: the registry lists them more than once, or Athar read them differently from what was published.
        </p>
      )}
      {items.length === 0 ? (
        <p className="px-4 py-6 text-[0.875rem] text-ink">{search.q ? `No startup matches “${search.q}”.` : fact ? 'Nothing in the data matches this today.' : 'Type a startup name, its slug, its website or the start of an entry id.'}</p>
      ) : (
        items.map((it) => (
          <div role="listitem" key={it.id}>
            <DeskItem
              selected={isSelected(it)}
              onSelect={() => select(it.id)}
              title={<span dir="auto">{it.name}</span>}
              qualifier={it.sector ?? (fact ? month(it.labelled ?? null) ?? undefined : undefined)}
              detailMono={!!fact && !!it.value}
              detail={fact ? (it.value ?? undefined) : [it.entries !== null ? plural(it.entries, 'entry', 'entries') : null, ...it.notes.map((n) => NOTE[n] ?? n), it.withdrawn ? 'no longer in the registry' : null].filter(Boolean).join(' · ')}
            />
          </div>
        ))
      )}
    </div>
  )

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Startups" facts={search.q ? plural(items.length, 'match', 'matches') + (items.length === 30 ? ' (first 30)' : '') : `${startups.toLocaleString('en-GB')} startups`}>
        <label className="relative flex items-center">
          <span className="sr-only">Search startups by name, slug, website or entry id</span>
          <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && items[0]) select(items[0].id)
            }}
            placeholder="Name, slug, website or entry id"
            className={cn(deskInput, 'w-80 ps-8')}
          />
          <span className="pointer-events-none absolute end-2 hidden sm:inline">
            <Kbd>/</Kbd>
          </span>
        </label>
        {/* Narrow screens have no room for the facts column; the same choice as a dropdown. */}
        <div className="w-72 min-[1100px]:hidden">
          <DeskSelect
            label="Show startups by fact"
            value={fact?.code ?? '-'}
            onChange={(v) => pickFact(v === '-' ? undefined : v)}
            options={[{ value: '-', label: 'To read first' }, ...grouped.flatMap((g) => g.facts.map((f) => ({ value: f.code, label: f.label, hint: f.count ? `${f.count.toLocaleString('en-GB')} · ${GROUP_NAME[g.group]}` : 'none' })))]}
          />
        </div>
      </DeskBar>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Facts about the data" className="hidden w-[272px] shrink-0 overflow-y-auto overscroll-contain border-e border-edge min-[1100px]:block">
          <FactRowButton selected={!fact} label="To read first" onSelect={() => pickFact(undefined)} />
          {grouped.map((g) => {
            const silent = g.facts.filter(isSilent)
            const rest = g.facts.filter((f) => !isSilent(f))
            return (
              <div key={g.group}>
                <p className="border-b border-hairline px-4 pt-4 pb-1.5 text-[0.8125rem] font-medium text-ink-2">{GROUP_NAME[g.group]}</p>
                {silent.length > 0 && (
                  <>
                    <p className="flex items-baseline gap-3 border-b border-hairline px-4 py-2 text-[0.875rem] text-ink">
                      <span className="min-w-0 flex-1">Does not answer, by reason</span>
                      <span className="shrink-0 text-[0.8125rem] text-ink-2 tabular-nums">{silent.reduce((t, f) => t + f.count, 0).toLocaleString('en-GB')}</span>
                    </p>
                    {silent.map((f) => (
                      <FactRowButton key={f.code} indent selected={fact?.code === f.code} label={factShort(f)} count={f.count} of={startups} onSelect={() => pickFact(f.code)} />
                    ))}
                  </>
                )}
                {rest.map((f) => (
                  <FactRowButton key={f.code} selected={fact?.code === f.code} label={factShort(f)} count={f.count} of={startups} onSelect={() => pickFact(f.code)} />
                ))}
              </div>
            )
          })}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Desk
        storageKey="startups"
        showPaneOnNarrow={!!search.startup || !!search.entry}
        onBack={() => navigate({ search: (s) => ({ ...s, startup: undefined, entry: undefined }) })}
        backLabel="All startups"
        list={list}
        pane={detail ? <StartupPane key={detail.page.startup.id} d={detail} openEntry={search.entry} /> : <DeskEmpty>{startupId ? 'No startup with this id.' : 'Search for a startup to see why Athar says what it says about it.'}</DeskEmpty>}
      />
        </div>
      </div>
    </main>
  )
}

/** One fact in the facts column: its words, then its count; the chosen one carries the desk's ink bar. */
function FactRowButton({ selected, label, count, of, onSelect, indent }: { selected: boolean; label: string; count?: number; of?: number; onSelect: () => void; indent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-baseline gap-3 border-b border-hairline py-2 pe-4 text-start text-[0.875rem] text-ink',
        indent ? 'ps-8' : 'ps-4',
        selected ? 'bg-surface shadow-[inset_3px_0_0_var(--ink)]' : 'hover:bg-surface',
      )}
    >
      <span className="min-w-0 flex-1">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-[0.8125rem] text-ink-2 tabular-nums" title={of && count ? `${Math.round((count / of) * 100)}% of startups` : undefined}>
          {count ? count.toLocaleString('en-GB') : 'none'}
        </span>
      )}
    </button>
  )
}

const csvCell = (v: string | null | undefined) => (v === null || v === undefined ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Above the list when a fact is chosen: what the fact costs a reader, and the rows as CSV. */
function FactHeader({ fact, rows, total }: { fact: QualityFact; rows: FactRow[]; total: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-2 border-b border-edge px-4 py-3">
      <p className="text-[0.875rem] text-ink">{costOf(fact.code, fact.label, fact.count)}</p>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
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
            {copied ? 'Copied' : 'Copy as CSV'}
          </button>
          <span className="text-[0.8125rem] text-ink-2 tabular-nums">
            {total > rows.length ? `showing ${rows.length.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}` : 'read from the data as it is today'}
          </span>
        </div>
      )}
    </div>
  )
}

const LANGUAGE: Record<string, string> = { en: 'English', fr: 'French', ar: 'Arabic' }
const WEBSITE_KIND: Record<string, string> = { own: 'Its own site', hosted: 'A page on a shared host', social: 'A page on a social network', shortlink: 'A short link' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (labelled: string | null) => (labelled ? `${MONTHS[Number(labelled.slice(5, 7)) - 1]} ${labelled.slice(0, 4)}` : null)

function StartupPane({ d, openEntry }: { d: Detail; openEntry?: string }) {
  const { page, lead, others, founders } = d
  const s = page.startup
  const entries = [lead, ...others]
  const sibling = (id: string) => lead.siblings.find((x) => x.id === id)

  // ?entry=<id> opens that entry and brings it into view.
  useEffect(() => {
    if (!openEntry) return
    document.getElementById(`entry-${openEntry}`)?.scrollIntoView({ block: 'start' })
  }, [openEntry])

  return (
    <DeskPane
      title={s.name}
      statement={<span className="font-mono text-[0.8125rem]">{s.id}</span>}
      position={`${plural(entries.length, 'entry', 'entries')}${page.source.withdrawnSince ? ` · not in the registry since ${day(page.source.withdrawnSince)}` : ''}`}
    >
      <PaneSection title="Values" aside={`read from entry ${lead.id}`}>
        <Fields
          fields={[
            { label: 'Name', value: s.name },
            { label: 'Description', value: s.description },
            { label: 'Language', value: s.language ? (LANGUAGE[s.language] ?? s.language) : null },
            { label: 'Sector', value: s.sector },
            { label: 'Labelled', value: month(s.labelled) },
            { label: 'Founded', value: s.creationYear },
            { label: 'Website', value: s.website, mono: true },
            { label: 'Website kind', value: s.websiteKind ? (WEBSITE_KIND[s.websiteKind] ?? s.websiteKind) : null },
            {
              label: founders.length === 1 ? 'Founder' : 'Founders',
              value: founders.length ? (
                <span className="grid gap-0.5">
                  {founders.map((f) => (
                    <span key={f.position}>
                      <Link to="/people/$slug" params={{ slug: f.slug }} className="text-glaze underline">
                        {f.name}
                      </Link>
                      {f.startups > 1 && <span className="text-ink-2"> · {f.startups} startups</span>}
                    </span>
                  ))}
                </span>
              ) : null,
            },
          ]}
        />
      </PaneSection>

      <PaneSection title="Why these entries belong together">
        {lead.siblings.length === 0 ? (
          <p className="text-[0.875rem] text-ink">The registry lists {s.name} once.</p>
        ) : (
          <ul className="grid gap-1.5">
            {lead.siblings.map((x) => (
              <li key={x.id} className="text-[0.875rem] text-ink">
                <a href={`#entry-${x.id}`} className="font-mono text-[0.8125rem] text-glaze underline">
                  entry {x.id}
                </a>
                : {x.bonds.length ? x.bonds.map((b) => b.text).join('; ') : 'grouped by its slug'}
              </li>
            ))}
          </ul>
        )}
        <Namesakes items={lead.namesakes} />
      </PaneSection>

      <PaneSection title={entries.length === 1 ? 'The entry' : 'The entries'}>
        <div className="grid gap-6">
          {entries.map((e) => {
            const x = e.id === lead.id ? null : sibling(e.id)
            return (
              <section key={e.id} id={`entry-${e.id}`} aria-label={`entry ${e.id}`} className={cn('grid scroll-mt-4 gap-3 border-t border-edge pt-3', openEntry === e.id && 'shadow-[inset_3px_0_0_var(--ink)] ps-3')}>
                <h4 className="flex flex-wrap items-baseline gap-x-3 font-sans text-[0.875rem] font-medium text-ink">
                  <span className="font-mono text-[0.8125rem]">entry {e.id}</span>
                  <span className="text-[0.8125rem] font-normal text-ink-2">
                    {e.id === lead.id ? 'the values come from it · ' : ''}seen {day(e.firstSeen)} to {day(e.lastSeen)}
                    {e.published ? '' : ' · not in the newest download'}
                    {e.copies > 1 ? ` · published ${e.copies}×` : ''}
                  </span>
                </h4>
                <div>
                  <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-2">How it was read</p>
                  <HowRead v={e} />
                </div>
                {x && (
                  <div>
                    <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-2">What it says differently</p>
                    <Differences rows={x.differences} />
                  </div>
                )}
                <Disclosure key={`${e.id}-${openEntry === e.id}`} defaultOpen={openEntry === e.id} summary="As published">
                  <div className="pb-2">
                    <JsonBlock value={e.row} title={`entry ${e.id}`} />
                  </div>
                </Disclosure>
              </section>
            )
          })}
        </div>
      </PaneSection>

      {lead.downstream && <Observed d={lead.downstream} />}

      <p>
        <Link to="/startups/$id" params={{ id: s.id }} className="text-[0.875rem] text-glaze underline">
          Open the public startup page
        </Link>
      </p>
    </DeskPane>
  )
}

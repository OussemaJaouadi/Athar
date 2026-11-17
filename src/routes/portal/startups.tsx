import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskGroup, DeskItem, DeskPane, Fields, JsonBlock, Kbd, PaneSection, deskInput, useDeskKeys } from '@/components/athar/desk'
import { Differences, HowRead, Namesakes, Observed } from '@/components/athar/ops-startup-sections'
import { Disclosure } from '@/components/athar/startup-title'
import { day, plural } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { getEntry, getFactRows, getFoundersOf, getLeadEntry, searchStartupsOps } from '#/server/api/ops'
import { getStartupPage } from '#/server/api/startup'
import type { EntryView } from '#/server/pipeline/state'

type SearchParams = { q?: string; startup?: string; entry?: string }

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

type Item = { id: string; name: string; sector: string | null; entries: number | null; notes: string[]; withdrawn: boolean }

export const Route = createFileRoute('/portal/startups')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    startup: typeof s.startup === 'string' && s.startup ? s.startup : undefined,
    entry: typeof s.entry === 'string' && s.entry ? s.entry : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', startup: search.startup, entry: search.entry }),
  loader: async ({ deps }) => {
    // The list: a search, else the startups an operator should read first (more than one entry, or a note that says
    // the registry and Athar's reading differ).
    const items: Item[] = deps.q
      ? (await searchStartupsOps({ data: deps.q })).map((h) => ({ id: h.id, name: h.name, sector: h.sector, entries: h.entries, notes: h.notes, withdrawn: h.withdrawn }))
      : await defaultItems()
    // The selected startup: from the URL, else from an entry in the URL, else the first item.
    let startupId = deps.startup
    if (!startupId && deps.entry) startupId = (await getEntry({ data: deps.entry }))?.startup?.id
    startupId ??= items[0]?.id
    const detail = startupId ? await loadStartup(startupId) : null
    return { items, startupId, detail }
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
  const { items, startupId, detail } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/startups' })
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(search.q ?? '')

  // Search as you type; the URL keeps the query.
  useEffect(() => {
    if (query === (search.q ?? '')) return
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, q: query.trim() || undefined, startup: undefined, entry: undefined }), replace: true }), 220)
    return () => clearTimeout(t)
  }, [query, search.q, navigate])

  const select = useCallback((id: string) => navigate({ search: (s) => ({ ...s, startup: id, entry: undefined }) }), [navigate])
  const ids = useMemo(() => items.map((i) => i.id), [items])
  useDeskKeys({ ids, current: startupId, select, search: searchRef })

  const list = (
    <div role="list" aria-label="Startups">
      {!search.q && items.length > 0 && <DeskGroup label="Read these first: more than one entry, or read differently from the registry" count={items.length} />}
      {items.length === 0 ? (
        <p className="px-4 py-6 text-[0.875rem] text-ink">{search.q ? `No startup matches “${search.q}”.` : 'Type a startup name, its slug, its website or the start of an entry id.'}</p>
      ) : (
        items.map((it) => (
          <div role="listitem" key={it.id}>
            <DeskItem
              selected={it.id === startupId}
              onSelect={() => select(it.id)}
              title={it.name}
              qualifier={it.sector ?? undefined}
              detail={[it.entries !== null ? plural(it.entries, 'entry', 'entries') : null, ...it.notes.map((n) => NOTE[n] ?? n), it.withdrawn ? 'no longer in the registry' : null].filter(Boolean).join(' · ')}
            />
          </div>
        ))
      )}
    </div>
  )

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Startups" facts={search.q ? plural(items.length, 'match', 'matches') + (items.length === 30 ? ' (first 30)' : '') : undefined}>
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
      </DeskBar>
      <Desk
        storageKey="startups"
        showPaneOnNarrow={!!search.startup || !!search.entry}
        onBack={() => navigate({ search: (s) => ({ ...s, startup: undefined, entry: undefined }) })}
        backLabel="All startups"
        list={list}
        pane={detail ? <StartupPane key={detail.page.startup.id} d={detail} openEntry={search.entry} /> : <DeskEmpty>{startupId ? 'No startup with this id.' : 'Search for a startup to see why Athar says what it says about it.'}</DeskEmpty>}
      />
    </main>
  )
}

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
            { label: 'Language', value: s.language },
            { label: 'Sector', value: s.sector },
            { label: 'Labelled', value: month(s.labelled) },
            { label: 'Founded', value: s.creationYear },
            { label: 'Website', value: s.website, mono: true },
            { label: 'Website kind', value: s.websiteKind },
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

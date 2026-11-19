import { Check, Search } from 'lucide-react'

import { Chip, deskInput } from '@/components/athar/desk'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { plural } from '@/components/athar/trace-parts'

/** Chip names: the question each kind asks, in two or three words. */
export const KIND_SHORT: Record<string, string> = {
  person: 'Same person',
  person_pair: 'Two names',
  relation: 'Related startups',
  website: 'Websites',
  founder: 'Founder names',
  alias: 'Other names',
  name: 'Startup names',
}

const n = (v: number) => v.toLocaleString('en-GB')

// Radix marks the chosen tab with data-state; the line variant of the installed Tabs listens for data-active.
const tab =
  'h-8 flex-none rounded-none px-1.5 text-[0.875rem] font-normal text-ink-2 hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:after:opacity-100 after:bg-ink after:bottom-[-1px]'

/**
 * The filter strip under the Review bar. Three kinds of control, kept apart on purpose: the page switch in the bar
 * (a pill), the view tabs here (a quiet underline: which list), and the kind choices (outlined chips: which questions).
 */
export function ReviewFilters({
  show,
  kind,
  byKind,
  totals,
  query,
  onQuery,
  searchRef,
  onShow,
  kindName,
  waiting,
  shown,
  total,
}: {
  show: 'open' | 'decided'
  kind: string | undefined
  byKind: { kind: string; open: number; decided: number }[]
  totals: { open: number; decided: number }
  query: string
  onQuery: (v: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  onShow: (v: 'open' | 'decided') => void
  kindName: (k: string) => string
  /** Related-startup questions that wait on a person answer. */
  waiting: number
  shown: number
  total: number
}) {
  const count = (k: { open: number; decided: number }) => (show === 'open' ? k.open : k.decided)
  const kinds = byKind.filter((k) => count(k) > 0 || k.kind === kind)
  const shown2 = show === 'decided' ? ('decided' as const) : undefined
  const all = byKind.reduce((s, k) => s + count(k), 0)
  return (
    <div className="border-b border-hairline px-5 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Tabs value={show} onValueChange={(v) => onShow(v === 'decided' ? 'decided' : 'open')} className="shrink-0">
          <TabsList variant="line" aria-label="Which questions" className="gap-1 p-0">
            <TabsTrigger value="open" className={tab}>
              To answer <span className="text-ink-2 tabular-nums">{n(totals.open)}</span>
            </TabsTrigger>
            <TabsTrigger value="decided" className={tab}>
              Answered <span className="text-ink-2 tabular-nums">{n(totals.decided)}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <nav aria-label="Kind of question" className="order-last min-w-0 basis-full min-[900px]:order-none min-[900px]:basis-0 min-[900px]:flex-1">
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
            <li className="shrink-0">
              <KindChip on={!kind} to={{ kind: undefined, show: shown2 }}>
                All <Count>{n(all)}</Count>
              </KindChip>
            </li>
            {kinds.map((k) => (
              <li key={k.kind} className="shrink-0">
                <KindChip on={kind === k.kind} to={{ kind: k.kind, show: shown2 }}>
                  {KIND_SHORT[k.kind] ?? kindName(k.kind)} <Count>{n(count(k))}</Count>
                </KindChip>
              </li>
            ))}
          </ul>
        </nav>
        <label className="relative ms-auto flex min-w-24 flex-1 items-center min-[900px]:w-56 min-[900px]:flex-none">
          <span className="sr-only">Find a question by name</span>
          <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
          <input ref={searchRef} type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Find a name" className={cn(deskInput, 'w-full ps-8')} />
          <kbd className="pointer-events-none absolute end-2 hidden rounded-[4px] border border-edge px-1 font-mono text-[0.8125rem] text-ink-2 min-[1100px]:block" aria-hidden>
            /
          </kbd>
        </label>
      </div>
      <p className="sr-only" role="status">
        {query.trim() ? `${plural(shown, 'question')} of ${n(total)} match` : ''}
      </p>
      {waiting > 0 && show === 'open' && (
        <p className="pt-1 text-[0.8125rem] text-ink-2">
          {plural(waiting, 'question')} about related startups {waiting === 1 ? 'waits' : 'wait'} on your answers about people; they come up as those are answered.
        </p>
      )}
    </div>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-2 tabular-nums">{children}</span>
}

/** A kind choice: a link that sets `kind` and leaves the rest of the search alone. The chosen one also carries a check. */
function KindChip({ on, to, children }: { on: boolean; to: { kind: string | undefined; show: 'decided' | undefined }; children: React.ReactNode }) {
  return (
    <Chip on={on} to="/portal/review" search={{ kind: to.kind, show: to.show } as never}>
      {on && <Check className="size-3.5" aria-hidden />}
      {children}
    </Chip>
  )
}

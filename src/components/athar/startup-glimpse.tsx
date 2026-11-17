import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { TileMark } from '@/components/athar/tile-mark'
import { Glimpse, GlimpseContent, GlimpseTrigger } from '@/components/kibo-ui/glimpse'
import { cn } from '@/lib/utils'
import { bareAddress } from '#/shared/website'
import { getStartupGlimpse, type StartupGlimpse } from '#/server/api/startup'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (labelled: string | null) => (labelled ? `${MONTHS[Number(labelled.slice(5, 7)) - 1]} ${labelled.slice(0, 4)}` : null)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// One fetch per startup per page view, shared by every link to it.
const cache = new Map<string, Promise<StartupGlimpse | null>>()
const load = (id: string) => {
  let p = cache.get(id)
  if (!p) {
    p = getStartupGlimpse({ data: id }).catch(() => null)
    cache.set(id, p)
  }
  return p
}

// The same words the Startup page uses: an observation of the website, never a verdict on the company.
function websiteLine(g: StartupGlimpse) {
  switch (g.websiteState) {
    case 'answers':
      return { mark: 'fill', text: `${g.website ? bareAddress(g.website) : 'Website'} answers` }
    case 'does_not_answer':
      return { mark: 'open', text: `Website does not answer${g.since ? ` since ${day(g.since)}` : ''}` }
    case 'social':
      return { mark: 'dash', text: 'A page on a social network; not asked' }
    case 'not_asked':
      return { mark: 'dash', text: 'Website not asked yet' }
    default:
      return { mark: 'dash', text: 'No website' }
  }
}

/**
 * A link to a startup that previews it on hover or keyboard focus (Kibo UI Glimpse on HoverCard): its tile, sector and
 * label month, the first lines of its description and what its website does today. On touch it is a plain link.
 */
export function StartupLink({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const [g, setG] = useState<StartupGlimpse | null | undefined>(undefined)
  return (
    <Glimpse openDelay={350} closeDelay={120} onOpenChange={(open) => open && g === undefined && load(id).then(setG)}>
      <GlimpseTrigger asChild>
        <Link to="/startups/$id" params={{ id }} className={className}>
          {children}
        </Link>
      </GlimpseTrigger>
      <GlimpseContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[22rem] rounded-md border border-edge bg-surface p-4 text-ink shadow-[0_16px_40px_-20px_rgb(0_0_0/0.6)] ring-0"
      >
        {g === undefined ? (
          <p className="text-[0.875rem] text-ink-2">Reading the record…</p>
        ) : g === null ? (
          <p className="text-[0.875rem] text-ink">This startup is not in the registry.</p>
        ) : (
          <div className="grid gap-2.5">
            <div className="flex items-start gap-3">
              <TileMark id={g.id} sector={g.sector} size={32} className="shrink-0" />
              <div className="grid min-w-0 gap-0.5">
                <p className="font-display text-[1.125rem] leading-tight font-bold text-ink" dir="auto">
                  {g.name}
                </p>
                <p className="text-[0.8125rem] text-ink-2">{[g.sector, month(g.labelled) && `labelled ${month(g.labelled)}`].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            {g.description ? (
              <p className="text-[0.875rem] leading-6 text-ink" dir="auto">
                {g.description}
              </p>
            ) : (
              <p className="text-[0.875rem] text-ink-2">No description in the registry.</p>
            )}
            <div className="grid gap-1 border-t border-hairline pt-2.5 text-[0.8125rem] text-ink">
              {(() => {
                const w = websiteLine(g)
                return (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn('size-2.5 shrink-0 border border-ink', w.mark === 'fill' && 'bg-ink', w.mark === 'dash' && 'border-dashed')}
                    />
                    {w.text}
                  </span>
                )
              })()}
              <span className="text-ink-2">
                {g.founders === 0 ? 'No founders named' : `${g.founders} ${g.founders === 1 ? 'founder' : 'founders'} named`}
                {g.withdrawn && ' · no longer in the registry'}
              </span>
            </div>
          </div>
        )}
      </GlimpseContent>
    </Glimpse>
  )
}

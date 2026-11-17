import { barY, defineChart, text } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import type { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import { ChartSpace, axisText, chartTheme, type ChartTokens } from '@/components/athar/chart-kit'

// One chart used wherever startups are counted over time: how many were labelled, and what their website does today.
// Filled, open, dashed: the same three marks as the website line on a record.

export type StateBar = { key: string; label: string; labelled: number; answers: number; silent: number; noSite: number }
export const STATE_LABEL = { answers: 'Website answers', silent: 'Does not answer', noSite: 'No website' } as const
type Part = { key: string; state: keyof typeof STATE_LABEL; count: number }

export function StateBars({ bars, t, renderer, height = 300, ariaLabel, title, onPick }: {
  bars: StateBar[]
  t: ChartTokens | null
  renderer: ReturnType<typeof motion>
  height?: number
  ariaLabel: string
  /** The first line of the tooltip for one bar. */
  title: (bar: StateBar) => string
  onPick?: (bar: StateBar) => void
}) {
  const def = useMemo(() => {
    if (!t) return null
    const parts: Part[] = bars.flatMap((b) => [
      { key: b.key, state: 'answers' as const, count: b.answers },
      { key: b.key, state: 'silent' as const, count: b.silent },
      { key: b.key, state: 'noSite' as const, count: b.noSite },
    ])
    const label = new Map(bars.map((b) => [b.key, b.label]))
    return defineChart({
      marks: [
        crosshair({ x: { band: { inset: 0, fill: t.ink, fillOpacity: 0.06 }, label: false }, y: false }),
        barY(parts, {
          id: 'labelled',
          x: 'key',
          y: 'count',
          z: 'state',
          key: (p) => `${p.key}-${p.state}`,
          fill: (p) => (p.state === 'answers' ? t.ink : t.canvas),
          stroke: (p) => (p.state === 'noSite' ? t.ink2 : t.ink),
          strokeWidth: 1.5,
          strokeDasharray: (p) => (p.state === 'noSite' ? '3 3' : ''),
          inset: bars.length > 8 ? 5 : 10,
        }),
        text(bars.filter((b) => b.labelled > 0), { x: 'key', y: 'labelled', text: (b) => String(b.labelled), dy: -10, fontSize: 14, fill: t.ink }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().domain(bars.map((b) => b.key)).padding(0.1), axis: { ...axisText, ticks: { format: (k: string) => label.get(k) ?? k } } },
        // Counts of startups: a tick at 0.5 means nothing.
        y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { format: (v: number) => (Number.isInteger(v) ? String(v) : '') } } },
      },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        formatGroup: (points: readonly { datum: unknown }[]) => {
          const b = bars.find((x) => x.key === (points[0]?.datum as { key?: string } | undefined)?.key)
          if (!b) return ''
          return [title(b), `${STATE_LABEL.answers}: ${b.answers}`, `${STATE_LABEL.silent}: ${b.silent}`, b.noSite ? `${STATE_LABEL.noSite}: ${b.noSite}` : null, onPick && b.labelled ? 'Click to open them' : null].filter(Boolean).join('\n')
        },
      },
      theme: chartTheme(t, [t.ink]),
      margin: { left: 40, top: 24 },
    })
  }, [t, JSON.stringify(bars)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <ChartSpace h={height} />
  return (
    <Chart
      definition={def}
      renderer={renderer}
      height={height}
      ariaLabel={ariaLabel}
      onSelect={(pt) => {
        const bar = bars.find((b) => b.key === (pt?.datum as { key?: string } | undefined)?.key)
        if (bar && onPick) onPick(bar)
      }}
    />
  )
}

export const StateKey = () => (
  <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
    {(
      [
        [STATE_LABEL.answers, 'bg-ink'],
        [STATE_LABEL.silent, 'border-[1.5px] border-ink'],
        [STATE_LABEL.noSite, 'border-[1.5px] border-dashed border-ink-2'],
      ] as const
    ).map(([label, mark]) => (
      <li key={label} className="flex items-center gap-2">
        <span aria-hidden className={`inline-block size-3 shrink-0 ${mark}`} />
        {label}
      </li>
    ))}
  </ul>
)

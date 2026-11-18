import { type ChartCurve, defineChart, link, rect, text } from '@tanstack/charts'
import { motion } from '@tanstack/charts/motion'
import { sankeyDiagram } from '@tanstack/charts/network/sankey'
import { Chart } from '@tanstack/charts/react/core'
import { useMemo } from 'react'

import { ChartSpace, chartTheme, useChartTokens } from '@/components/athar/chart-kit'

/*
 * How the pipeline works, drawn from today's counts: a Sankey (TanStack Charts) where the width of each flow is the
 * number of rows, entries or startups that take it. The flows the selected step produces are drawn in green.
 */

export type PipelineFlowCounts = { rows: number; entries: number; startups: number; answers: number; silent: number; described: number; prepared: number; embedded: number }

type Node = { id: string; label: string; count: number; step: string }
type Flow = { source: string; target: string; value: number; step: string }

// Horizontal tangents at both ends, the usual Sankey ribbon.
const ribbon: ChartCurve = {
  line: (pts) =>
    pts.length === 0
      ? ''
      : pts.reduce((d, [x, y], i) => {
          if (i === 0) return `M${x},${y}`
          const [px, py] = pts[i - 1]
          const mx = (px + x) / 2
          return `${d}C${mx},${py} ${mx},${y} ${x},${y}`
        }, ''),
  area: () => '',
}

const n = (v: number) => v.toLocaleString('en-GB')

function graph(c: PipelineFlowCounts, step: string): { nodes: Node[]; flows: Flow[]; sentence: string } {
  // Prepare and Embed work on descriptions; the other steps on rows and websites.
  if (step === 'prepare' || step === 'embed') {
    const none = c.startups - c.described
    const waiting = Math.max(0, c.described - c.embedded)
    const nodes: Node[] = [
      { id: 'startups', label: 'Startups', count: c.startups, step: 'rebuild' },
      { id: 'described', label: 'With a description', count: c.described, step: 'rebuild' },
      { id: 'none', label: 'No description', count: none, step: 'rebuild' },
      { id: 'embedded', label: 'Embedded as a vector', count: c.embedded, step: 'embed' },
      ...(waiting ? [{ id: 'waiting', label: 'Not embedded yet', count: waiting, step: 'embed' }] : []),
    ]
    const flows: Flow[] = [
      { source: 'startups', target: 'described', value: c.described, step: 'rebuild' },
      { source: 'startups', target: 'none', value: none, step: 'rebuild' },
      { source: 'described', target: 'embedded', value: c.embedded, step: 'embed' },
      ...(waiting ? [{ source: 'described', target: 'waiting', value: waiting, step: 'embed' }] : []),
    ]
    return {
      nodes,
      flows: flows.filter((f) => f.value > 0),
      sentence: `Of ${n(c.startups)} startups, ${n(c.described)} have a description and ${n(c.embedded)} are embedded as vectors; ${n(none)} have no description and cannot be matched by meaning. ${c.prepared ? `${n(c.prepared)} descriptions have a prepared text.` : 'No description has a prepared text yet.'}`,
    }
  }
  const copies = Math.max(0, c.rows - c.entries)
  const again = Math.max(0, c.entries - c.startups)
  const asked = c.answers + c.silent
  const notAsked = Math.max(0, c.startups - asked)
  const nodes: Node[] = [
    { id: 'rows', label: 'Registry rows', count: c.rows, step: 'collect' },
    { id: 'entries', label: 'Distinct entries', count: c.entries, step: 'collect' },
    { id: 'copies', label: 'Exact copies', count: copies, step: 'collect' },
    { id: 'startups', label: 'Startups', count: c.startups, step: 'rebuild' },
    { id: 'again', label: 'Second listings of a startup', count: again, step: 'rebuild' },
    { id: 'asked', label: 'Websites asked', count: asked, step: 'check' },
    { id: 'notAsked', label: 'No website to ask', count: notAsked, step: 'check' },
    { id: 'answers', label: 'Answer', count: c.answers, step: 'check' },
    { id: 'silent', label: 'Do not answer', count: c.silent, step: 'check' },
  ]
  const flows: Flow[] = [
    { source: 'rows', target: 'entries', value: c.entries, step: 'collect' },
    { source: 'rows', target: 'copies', value: copies, step: 'collect' },
    { source: 'entries', target: 'startups', value: c.startups, step: 'rebuild' },
    { source: 'entries', target: 'again', value: again, step: 'rebuild' },
    { source: 'startups', target: 'asked', value: asked, step: 'check' },
    { source: 'startups', target: 'notAsked', value: notAsked, step: 'check' },
    { source: 'asked', target: 'answers', value: c.answers, step: 'check' },
    { source: 'asked', target: 'silent', value: c.silent, step: 'check' },
  ].filter((f) => f.value > 0)
  const used = new Set(flows.flatMap((f) => [f.source, f.target]))
  return {
    nodes: nodes.filter((node) => used.has(node.id)),
    flows,
    sentence: `${n(c.rows)} registry rows are ${n(c.entries)} distinct entries, which are ${n(c.startups)} startups. ${n(asked)} of their websites were asked: ${n(c.answers)} answer and ${n(c.silent)} do not.`,
  }
}

export function PipelineFlow({ counts, step }: { counts: PipelineFlowCounts; step: string }) {
  const t = useChartTokens()
  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
  const g = useMemo(() => graph(counts, step), [counts, step])
  const def = useMemo(() => {
    if (!t || g.flows.length === 0) return null
    const lastLayer = Math.max(...g.nodes.map((node) => (g.flows.some((f) => f.source === node.id) ? 0 : 1)))
    return defineChart({
      marks: [
        sankeyDiagram({
          nodes: g.nodes,
          links: g.flows,
          nodeKey: 'id',
          source: 'source',
          target: 'target',
          value: 'value',
          align: 'left',
          nodeWidth: 14,
          nodePadding: 26,
          inset: { left: 8, right: 8, top: 14, bottom: 14 },
          marks: ({ nodes: layoutNodes, links: layoutLinks }) =>
            [
              link(layoutLinks, {
                x1: 'x1',
                y1: 'y1',
                x2: 'x2',
                y2: 'y2',
                key: 'key',
                curve: ribbon,
                stroke: (flow) => (flow.data.step === step ? t.glaze : t.edge),
                strokeOpacity: 0.45,
                strokeWidth: (flow) => Math.max(1.5, flow.width),
                lineCap: 'butt',
              }),
              // Two rect layers because a rect's fill is one colour: this step's nodes in green, the rest in ink.
              rect(
                layoutNodes.filter((node) => node.data.step !== step),
                { x1: 'x0', x2: 'x1', y1: 'y0', y2: 'y1', key: 'key', inset: 0, fill: t.ink },
              ),
              rect(
                layoutNodes.filter((node) => node.data.step === step),
                { x1: 'x0', x2: 'x1', y1: 'y0', y2: 'y1', key: 'key', inset: 0, fill: t.glaze },
              ),
              // The name and count sit beside each node: after it, or before it in the last column.
              text(layoutNodes, {
                x: (node) => (node.outgoingLinks.length === 0 && lastLayer ? node.x0 - 8 : node.x1 + 8),
                y: (node) => node.y + 5,
                anchor: (node) => (node.outgoingLinks.length === 0 && lastLayer ? 'end' : 'start'),
                text: (node) => `${node.data.label} · ${n(node.data.count)}`,
                key: 'key',
                fill: t.ink,
                fontSize: 13,
              }),
            ] as const,
        }),
      ],
      scales: { x: null, y: null },
      guides: false,
      theme: chartTheme(t, [t.glaze, t.ink]),
    })
  }, [t, g, step])
  return (
    <figure className="grid max-w-[1100px] gap-2">
      <figcaption className="max-w-[75ch] text-[0.875rem] text-ink">{g.sentence}</figcaption>
      {def ? <Chart definition={def} renderer={renderer} height={300} ariaLabel={g.sentence} /> : <ChartSpace h={300} />}
      <p className="text-[0.8125rem] text-ink-2">The width of a flow is its count. Green marks what this step produces.</p>
    </figure>
  )
}

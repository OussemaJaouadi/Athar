import { useEffect, useState } from 'react'

// What every Athar chart shares. The Landscape page still carries its own copy of these; new charts start here.

export type ChartTokens = Record<'glaze' | 'ochre' | 'ink' | 'ink2' | 'hairline' | 'edge' | 'canvas' | 'surface', string>

/** Athar's tokens as real colours (SVG paint cannot read CSS variables); null until mount so hydration matches. */
export function useChartTokens() {
  const [t, setT] = useState<ChartTokens | null>(null)
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement)
      const v = (n: string) => s.getPropertyValue(n).trim()
      setT({ glaze: v('--glaze'), ochre: v('--ochre'), ink: v('--ink'), ink2: v('--ink-2'), hairline: v('--hairline'), edge: v('--edge'), canvas: v('--canvas'), surface: v('--surface') })
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', read)
    return () => (mo.disconnect(), mq.removeEventListener('change', read))
  }, [])
  return t
}

export const chartTheme = (t: ChartTokens, palette: string[]) => ({ foreground: t.ink, muted: t.ink2, grid: t.hairline, background: t.canvas, palette })
export const axisText = { tickLabels: { fontSize: 13 } }
export const ChartSpace = ({ h }: { h: number }) => <div style={{ height: h }} />

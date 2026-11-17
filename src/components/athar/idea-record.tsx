import { motion } from '@tanstack/charts/motion'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { useChartTokens } from '@/components/athar/chart-kit'
import { StateBars, StateKey } from '@/components/athar/state-bars'
import { explainIdea, saveIdea, type Explanation, type IdeaMatch, type IdeaPage } from '#/server/api/ideas'
import { sectorSlug } from '#/shared/sector'
import { websiteAnswers, websiteReason, type WebsiteCheck } from '#/shared/website'
import { Disclosure, StartupTitle } from '@/components/athar/startup-title'
import { StartupLink } from '@/components/athar/startup-glimpse'

// The idea page (the owner picked the version with AI sentences, 17 Nov 2026), in the form of every entity page:
// the idea is the record on the left; what the registry holds about it is on the right.
// It is complete without an AI key. With one, each close match gains two sentences: what is the same, what is different.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (labelled: string | null) => (labelled ? `${MONTHS[Number(labelled.slice(5, 7)) - 1]} ${labelled.slice(0, 4)}` : null)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const word = (n: number) => WORDS[n] ?? String(n)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const LANGUAGE: Record<string, string> = { en: 'English', fr: 'French', ar: 'Arabic' }

function SiteState({ check }: { check: WebsiteCheck | null }) {
  if (!check) return <span>No website to ask.</span>
  const up = websiteAnswers(check)
  return (
    <span className="inline-flex items-baseline gap-2">
      <span aria-hidden className={`inline-block size-2.5 shrink-0 translate-y-px border-[1.5px] border-ink ${up ? 'bg-ink' : ''}`} />
      <span>
        <span className="font-normal">{up ? 'Website answers' : 'Website does not answer'}</span>
        {up ? check.finalHost && `, from ${check.finalHost}` : `: ${websiteReason(check.detail)}`}
      </span>
    </span>
  )
}

const Heading = ({ children, count }: { children: React.ReactNode; count?: React.ReactNode }) => (
  <h2 className="font-sans text-sm font-medium tracking-[0.05em] uppercase">
    {children}
    {count !== undefined && <span className="ms-2 font-mono text-[0.8125rem] tracking-normal normal-case">{count}</span>}
  </h2>
)

function MatchRow({ m, why }: { m: IdeaMatch; why?: Explanation }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-5 gap-y-1 border-b border-hairline py-3">
      <StartupTitle id={m.id} name={m.name} sector={m.sector} />
      <span className="text-end text-sm whitespace-nowrap tabular-nums">{m.labelled ? `Labelled ${month(m.labelled)}` : ''}</span>
      {m.description && (
        <p className="col-span-full line-clamp-3 max-w-[72ch] text-sm" dir="auto">
          {m.description}
        </p>
      )}
      <p className="col-span-full text-sm">
        <SiteState check={m.check} />
      </p>
      {why && (
        <p className="col-span-full mt-1 grid max-w-[72ch] gap-0.5 border-s-2 border-ochre ps-3 text-sm" dir="auto">
          <span>
            <span className="font-medium">Same:</span> {why.same}
          </span>
          <span>
            <span className="font-medium">Different:</span> {why.different}
          </span>
        </p>
      )}
    </li>
  )
}

const toggle = (on: boolean) => `h-8 rounded-[4px] border px-3 text-sm ${on ? 'border-glaze bg-surface font-medium' : 'border-edge hover:bg-surface'}`

export function IdeaRecord({ data }: { data: IdeaPage }) {
  const t = useChartTokens()
  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
  const [order, setOrder] = useState<'close' | 'old'>('close')
  const [saved, setSaved] = useState(data.saved)
  const [why, setWhy] = useState<Explanation[] | null>(data.explanations)
  const [model, setModel] = useState(data.explainedBy)
  const [asking, setAsking] = useState(false)
  const [aiError, setAiError] = useState<string>()

  // With a key, the model is asked once per check; the answer is kept with the check.
  useEffect(() => {
    if (!data.canExplain || data.explanations) return
    let live = true
    setAsking(true)
    explainIdea({ data: data.id })
      .then((r) => {
        if (!live) return
        if ('error' in r) setAiError(r.error)
        else (setWhy(r.explanations), setModel(r.model))
      })
      .catch((e: unknown) => live && setAiError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setAsking(false))
    return () => {
      live = false
    }
  }, [data.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = data.matches.filter((m) => m.band === 'close')
  const far = data.matches.filter((m) => m.band !== 'close')
  const nearestOnly = far.length > 0 && far.every((m) => m.band === 'nearest')
  const shown = [...close].sort((a, b) => (order === 'close' ? b.closeness - a.closeness : (a.labelled ?? '').localeCompare(b.labelled ?? '')))
  const asked = close.map((m) => m.check).filter((c): c is WebsiteCheck => !!c)
  const silent = asked.filter((c) => !websiteAnswers(c)).length

  const sectors = [...close.reduce((map, m) => (m.sector ? map.set(m.sector, (map.get(m.sector) ?? 0) + 1) : map), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const labelYears = close.map((m) => m.labelled?.slice(0, 4)).filter((y): y is string => !!y).sort()
  const since = data.lastYear && labelYears.length ? Number(data.lastYear) - Number(labelYears.at(-1)) : 0
  const bars = data.years.map((y) => {
    const of = close.filter((m) => m.labelled?.slice(0, 4) === y)
    const answers = of.filter((m) => m.check && websiteAnswers(m.check)).length
    const quiet = of.filter((m) => m.check && !websiteAnswers(m.check)).length
    return { key: y, label: y, labelled: of.length, answers, silent: quiet, noSite: of.length - answers - quiet }
  })

  const verdict = close.length
    ? `${cap(word(close.length))} ${close.length === 1 ? 'startup in the registry describes' : 'startups in the registry describe'} something close to this.${
        asked.length ? (silent === 0 ? ` ${asked.length === 1 ? 'Its website answers' : `All ${word(asked.length)} of their websites answer`} today.` : ` ${cap(word(silent))} of their ${word(asked.length)} websites ${silent === 1 ? 'does' : 'do'} not answer today.`) : ''
      }`
    : 'No startup in the registry describes something close to this idea.'

  const facts: [string, React.ReactNode][] = [
    ['Read as', data.language ? LANGUAGE[data.language] : null],
    [
      'Closest',
      close.length ? (
        <StartupLink id={[...close].sort((a, b) => b.closeness - a.closeness)[0].id}>{[...close].sort((a, b) => b.closeness - a.closeness)[0].name}</StartupLink>
      ) : (
        'None close'
      ),
    ],
    [
      'Sectors',
      sectors.length
        ? sectors.map(([s, n], i) => (
            <span key={s}>
              {i > 0 && ', '}
              <Link to="/sectors/$slug" params={{ slug: sectorSlug(s) }}>
                {s}
              </Link>{' '}
              {n}
            </span>
          ))
        : null,
    ],
  ]

  return (
    <article className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid gap-6 lg:sticky lg:top-6">
        <header className="grid gap-2.5">
          <p className="text-sm">Your idea</p>
          <h1 className="font-display text-[1.75rem] leading-[1.22] font-bold text-balance sm:text-[2.125rem]" dir="auto">
            {data.idea}
          </h1>
          <p className="max-w-[46ch] text-sm">
            Compared on {day(data.checkedAt)} with the {data.compared} startups the registry describes.
            {data.undescribed > 0 && ` ${data.undescribed} startups have no description and could not be compared.`}
          </p>
        </header>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] border-t border-edge">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="col-span-full grid grid-cols-subgrid border-b border-hairline">
                <dt className="py-2.5 pe-7 text-sm text-ink-2">{label}</dt>
                <dd className="py-2.5 font-normal">{value}</dd>
              </div>
            ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link to="/idea" className="inline-flex h-10 items-center rounded-[4px] bg-glaze px-4 text-[0.9375rem] font-medium text-glaze-ink no-underline hover:bg-glaze-hover">
            Check another idea
          </Link>
          <button
            type="button"
            aria-pressed={saved}
            onClick={async () => {
              setSaved(!saved)
              await saveIdea({ data: { id: data.id, saved: !saved } })
            }}
            className="inline-flex h-10 items-center rounded-[4px] border border-edge px-4 text-[0.9375rem] hover:bg-surface"
          >
            {saved ? 'Saved' : 'Save this check'}
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-9">
        <p className="max-w-[40ch] font-display text-[1.375rem] leading-[1.4] text-pretty sm:text-[1.5625rem]">{verdict}</p>

        {close.length > 0 && (
          <section className="grid min-w-0 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <Heading count={close.length}>Close to it</Heading>
              <div role="group" aria-label="Order" className="flex gap-1.5">
                <button type="button" aria-pressed={order === 'close'} onClick={() => setOrder('close')} className={toggle(order === 'close')}>
                  Closest first
                </button>
                <button type="button" aria-pressed={order === 'old'} onClick={() => setOrder('old')} className={toggle(order === 'old')}>
                  Oldest first
                </button>
              </div>
            </div>
            {asking && <p className="text-sm">Your AI model is reading the matches…</p>}
            {why && model && <p className="max-w-[72ch] text-sm">Same and Different were written by {model}, from your idea and each startup's description only.</p>}
            {aiError && <p className="max-w-[72ch] text-sm">{aiError}</p>}
            <ul className="border-t border-edge">
              {shown.map((m) => (
                <MatchRow key={m.id} m={m} why={why?.find((w) => w.startupId === m.id)} />
              ))}
            </ul>
          </section>
        )}

        {close.length > 0 && labelYears.length > 0 && (
          <section className="grid min-w-0 gap-3">
            <Heading>When it was tried</Heading>
            <div className="grid gap-2.5 border border-edge p-4 pb-2">
              <StateBars bars={bars} t={t} renderer={renderer} height={220} ariaLabel={`Close startups by label year, from ${labelYears[0]} to ${labelYears.at(-1)}.`} title={(b) => `Labelled in ${b.key}: ${b.labelled}`} />
              <StateKey />
            </div>
            <p className="max-w-[64ch] text-base font-normal">
              {labelYears[0] === labelYears.at(-1) ? `Labelled in ${labelYears[0]}.` : `Labelled between ${labelYears[0]} and ${labelYears.at(-1)}.`}
              {since >= 2 && ` Nothing close has been labelled in the ${word(since)} years since.`}
            </p>
          </section>
        )}

        {far.length > 0 && (
          <Disclosure
            defaultOpen={close.length === 0}
            summary={close.length === 0
                ? `The nearest ones, none of them close: ${word(far.length)} ${far.length === 1 ? 'startup' : 'startups'}`
                : `Further away: ${word(far.length)} ${far.length === 1 ? 'startup that shares' : 'startups that share'} words with your idea, or a neighbouring one`}
          >
            <ul className="border-t border-hairline">
              {[...far].sort((a, b) => b.closeness - a.closeness).map((m) => (
                <MatchRow key={m.id} m={m} />
              ))}
            </ul>
            {nearestOnly && <p className="py-3 text-sm">They are shown so you can see how far the registry is from this idea, not as matches.</p>}
          </Disclosure>
        )}
      </div>
    </article>
  )
}

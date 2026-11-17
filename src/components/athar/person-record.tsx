import { Link } from '@tanstack/react-router'

import type { PersonPage } from '#/server/api/person'
import { websiteAnswers, websiteReason, type WebsiteCheck } from '#/shared/website'
import { StartupTitle } from '@/components/athar/startup-title'
import { StartupLink } from '@/components/athar/startup-glimpse'

// The person page, in the same form as the startup page: the record on the left, what the data connects to it on the right.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (labelled: string | null) => (labelled ? `${MONTHS[Number(labelled.slice(5, 7)) - 1]} ${labelled.slice(0, 4)}` : null)
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const word = (n: number) => WORDS[n] ?? String(n)
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

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

export function PersonRecord({ data }: { data: PersonPage }) {
  const { name, spellings, startups, foundedWith } = data
  const n = startups.length
  const sectors = [...new Set(startups.map((s) => s.sector).filter((s): s is string => !!s))]
  const years = [...new Set(startups.map((s) => s.labelled?.slice(0, 4)).filter((y): y is string => !!y))]
  const asked = startups.map((s) => s.check).filter((c): c is WebsiteCheck => !!c)
  const silent = asked.filter((c) => !websiteAnswers(c)).length
  const again = foundedWith.filter((c) => c.startups.length > 1)

  const facts: [string, React.ReactNode][] = [
    ['Labelled', years.length ? list(years) : null],
    ['Sectors', sectors.length ? list(sectors) : null],
    ['Also written', spellings.length ? list(spellings) : null],
  ]

  return (
    <article className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid gap-7 lg:sticky lg:top-6">
        <header className="grid gap-2.5">
          <h1 className="font-display text-[2.125rem] leading-[1.1] font-bold text-balance sm:text-[2.75rem]" dir="auto">
            {name}
          </h1>
          <p className="text-sm">
            Named as a founder on {n === 1 ? 'one startup' : `${word(n)} startups`} in the registry. The registry says nothing else about a person.
          </p>
        </header>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] border-t border-edge">
          {facts
            .filter(([, value]) => value !== null && value !== '')
            .map(([label, value]) => (
              <div key={label} className="col-span-full grid grid-cols-subgrid border-b border-hairline">
                <dt className="py-2.5 pe-7 text-sm text-ink-2">{label}</dt>
                <dd className="py-2.5 font-normal [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      <div className="grid min-w-0 gap-9">
        <section className="grid min-w-0 gap-3">
          <Heading count={n}>Startups</Heading>
          {asked.length > 0 && (
            <p className="max-w-[62ch] text-base font-normal">
              {silent === 0
                ? `${asked.length === 1 ? 'Its one website answers' : `All ${word(asked.length)} websites answer`} today.`
                : `Of the ${asked.length === 1 ? 'one website' : `${word(asked.length)} websites`}, ${word(silent)} ${silent === 1 ? 'does' : 'do'} not answer today.`}
            </p>
          )}
          <ul className="border-t border-edge">
            {startups.map((s) => (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-5 gap-y-0.5 border-b border-hairline py-3">
                <StartupTitle id={s.id} name={s.name} sector={s.sector} />
                <span className="text-end text-sm whitespace-nowrap tabular-nums">{s.labelled ? `Labelled ${month(s.labelled)}` : ''}</span>
                <p className="col-span-full text-sm">{s.sector}</p>
                {s.description && (
                  <p className="col-span-full line-clamp-2 max-w-[70ch] text-sm" dir="auto">
                    {s.description}
                  </p>
                )}
                <p className="col-span-full text-sm">
                  <SiteState check={s.check} />
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid min-w-0 gap-3">
          <Heading count={foundedWith.length || undefined}>Founded with</Heading>
          {foundedWith.length ? (
            <>
              {again.length > 0 && (
                <p className="max-w-[62ch] text-base font-normal">
                  {list(again.map((c) => c.name))} {again.length === 1 ? 'appears' : 'appear'} beside {name} on more than one startup.
                </p>
              )}
              <ul className="border-t border-edge">
                {foundedWith.map((c) => (
                  <li key={c.slug} className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-5 gap-y-0.5 border-b border-hairline py-2.5">
                    <Link to="/people/$slug" params={{ slug: c.slug }} className="font-normal" dir="auto">
                      {c.name}
                    </Link>
                    <span className="text-end text-sm">
                      {c.startups.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ', '}
                          <StartupLink id={s.id}>
                            {s.name}
                          </StartupLink>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="max-w-[62ch] text-base font-normal">Named alone on {n === 1 ? 'this startup' : 'these startups'}.</p>
          )}
        </section>
      </div>
    </article>
  )
}

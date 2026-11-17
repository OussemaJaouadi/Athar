import { Link } from '@tanstack/react-router'
import { ExternalLink, Database as DatabaseIcon } from 'lucide-react'

import { DeskPane, Evidence, Fields, JsonBlock, PaneSection, type DeskField } from '@/components/athar/desk'
import { day, fieldLabel, languageName, month, plural, valueText, websiteCheckWords, websiteKindName } from '@/components/athar/trace-parts'
import type { TraceStartup } from '#/server/api/trace'

const link = 'inline-flex items-center gap-1.5 text-[0.875rem] text-glaze underline [&_svg]:size-4'

/**
 * One startup traced back to the registry: what Athar shows, the facts found while building it, then every entry it
 * was read from as the registry published it (on-screen form), with the changes cleaning makes. No decisions.
 */
export function TracePane({ data }: { data: TraceStartup }) {
  const filled = Object.entries(data.filled)
  const values: DeskField[] = [
    { label: 'Name', value: data.name },
    { label: 'Description', value: data.description },
    ...(data.language ? [{ label: 'Language', value: languageName(data.language) }] : []),
    { label: 'Sector', value: data.sector },
    { label: 'Website', value: data.website, mono: !!data.website },
    ...(data.websiteKind ? [{ label: 'Website kind', value: websiteKindName(data.websiteKind) }] : []),
    ...(websiteCheckWords(data.websiteCheck, data.websiteKind) ? [{ label: 'Website check', value: websiteCheckWords(data.websiteCheck, data.websiteKind) }] : []),
    { label: 'Founders', value: data.founders.length ? data.founders.join(', ') : null },
    { label: 'Labelled', value: month(data.labelled) },
    { label: 'Founded', value: data.creationYear },
    {
      label: 'In the registry',
      value: data.withdrawn
        ? `First seen ${day(data.firstSeen)} · no longer listed since ${day(data.lastSeen)}`
        : `First seen ${day(data.firstSeen)} · last seen ${day(data.lastSeen)}`,
    },
  ]

  return (
    <DeskPane
      title={data.name}
      statement={<span className="font-mono text-[0.8125rem]">{data.id}</span>}
      position={`${data.position} of ${data.total}`}
    >
      <p className="flex flex-wrap gap-x-[18px] gap-y-1">
        <Link to="/startups/$id" params={{ id: data.id }} className={link}>
          <ExternalLink aria-hidden />
          Open the startup profile
        </Link>
        <Link to="/portal/database" search={{ table: 'startups', row: data.id }} className={link}>
          <DatabaseIcon aria-hidden />
          Open in database
        </Link>
      </p>

      <PaneSection title="Read from">
        <p className="text-[0.875rem] text-ink">
          entry <span className="font-mono text-[0.8125rem]">{data.entryId}</span>
          {data.entries.length > 1 && ` (of ${plural(data.entries.length, 'entry', 'entries')})`}
        </p>
        {filled.length > 0 && (
          <ul className="mt-1 grid gap-0.5 text-[0.875rem] text-ink">
            {filled.map(([field, entry]) => (
              <li key={field}>
                {fieldLabel(field)} filled from entry <span className="font-mono text-[0.8125rem]">{entry}</span>
              </li>
            ))}
          </ul>
        )}
      </PaneSection>

      <PaneSection title="Values">
        <Fields fields={values} />
      </PaneSection>

      {data.notes.length > 0 && (
        <PaneSection title="Notes">
          <ul className="grid gap-1 text-[0.875rem] text-ink">
            {data.notes.map((n, i) => (
              <li key={`${n.code}-${i}`} className="border-s-[3px] border-edge ps-2.5">
                {n.text}
              </li>
            ))}
          </ul>
        </PaneSection>
      )}

      <PaneSection title={data.entries.length === 1 ? 'Entry' : `Entries · ${data.entries.length}`}>
        <div className="grid gap-5">
          {data.entries.map((e) => (
            <section key={e.id} aria-label={`entry ${e.id}`} className="grid gap-2.5 border-t border-hairline pt-3 first:border-0 first:pt-0">
              <h4 className="text-[0.875rem] text-ink">
                entry <span className="font-mono text-[0.8125rem]">{e.id}</span>
                <span className="text-ink-2">
                  {' · '}
                  {e.copies > 1 ? `listed ${e.copies}×` : 'listed once'}
                  {' · first seen '}
                  {day(e.firstSeen)}
                  {' · last seen '}
                  {day(e.lastSeen)}
                  {e.source && ' · values read from this entry'}
                </span>
              </h4>
              {e.changes.length > 0 ? (
                <Evidence
                  rows={e.changes.map((c, i) => ({
                    field: fieldLabel(c.field),
                    wrote: valueText(c.from),
                    cleaning: valueText(c.to) || 'Left empty',
                    why: c.why,
                    bad: i === 0,
                  }))}
                />
              ) : (
                <p className="text-[0.875rem] text-ink">Read as published: cleaning changed nothing.</p>
              )}
              {e.row ? <JsonBlock value={e.row} title={`entry ${e.id} as published`} /> : <p className="text-[0.875rem] text-ink">This entry could not be read as JSON.</p>}
            </section>
          ))}
        </div>
      </PaneSection>
    </DeskPane>
  )
}

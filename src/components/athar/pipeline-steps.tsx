import { deskTd, deskTh } from '@/components/athar/desk'
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from '@/components/reui/timeline'
import { cn } from '@/lib/utils'

/*
 * What each pipeline step does, in the operator's words: what it reads, what it writes and the rules it applies.
 * The rules restate docs/DATA.md ("Steps" and "How each registry field is read"); change both together.
 */

type About = { does: string; reads: string; writes: string; rules?: { title: string; rows: [string, string][] }; also?: string[]; fails?: string }

const ABOUT: Record<string, About> = {
  collect: {
    does: 'Downloads the Startup Tunisia registry in one request and stores every distinct row once, exactly as published.',
    reads: 'the registry (about 920 rows of JSON)',
    writes: 'downloads, entries',
    also: [
      'The registry gives rows no id and a different order on every request, so a row is identified by its content. The same rows in another order store nothing; an edited row is a new entry.',
      'Collect then runs Build, so the startups always match the newest download.',
    ],
    fails: 'A run fails only when the registry itself breaks: a used field disappears, a row has no name, or the row count drops by more than half.',
  },
  rebuild: {
    does: 'Reads every entry field by field and groups the rows of one company into one startup. Nobody decides anything by hand, so it can be rebuilt at any time.',
    reads: 'entries',
    writes: 'startups, founders',
    rules: {
      title: 'How each registry field is read',
      rows: [
        ['Name', 'Kept as published, spaces tidied. Matching ignores case, accents, punctuation and a trailing legal form (SARL, S.A, Ltd).'],
        ['Description', 'HTML entities decoded, line breaks turned into spaces, language detected.'],
        ['Sector', 'Kept.'],
        ['Website', 'The first address is kept. Typing errors with one reading are repaired (http::/x, htp://x, www..x). Any other text is dropped. The host is classified as own, hosted, social or shortlink.'],
        ['Founders', 'Names kept; blanks and repeats dropped. A person key (the name without case, accents or word order) links the same person across startups.'],
        ['Label', 'MM/YYYY read as a month.'],
        ['Creation year', 'Text read as a number.'],
        ['Industry, logo', 'Not read: industry is identical to sector and the logo is one placeholder image. Collect checks on every download that this still holds.'],
        ['Email, phone', 'Not read. They stay only in the stored row.'],
      ],
    },
    also: [
      'Two entries are one company when they share a website, or share a name, unless both have websites, the websites differ and no founder is common.',
      'On hosts many startups share (Facebook, Google Sites) the page path is part of the identity.',
    ],
  },
  check: {
    does: "Asks each startup's own website whether it answers, and asks a second time before recording a failure. About five minutes.",
    reads: 'startups with their own website',
    writes: 'website checks',
    also: [
      'The answer is stored in words with its date: answered 200, no such domain, certificate problem, timed out. It is an observation, never a verdict about the company.',
      'Startups with no website, or with only a page on a social network, are not asked.',
    ],
  },
  prepare: {
    does: 'Optional. With an AI key, rewrites each description as one plain English statement.',
    reads: 'startup descriptions',
    writes: 'prepared texts, AI usage',
    also: ['The statement is used only for matching by meaning. The registry description stays what the app shows and cites.'],
  },
  embed: {
    does: 'Computes one vector per described startup on this machine, so an idea can be compared with startups by meaning.',
    reads: 'descriptions, or prepared texts when they exist',
    writes: 'vectors',
    also: ['Model: Qwen3-Embedding-0.6B, 8-bit, 1024 dimensions. A change in the text or the model embeds that startup again.', 'A startup with no description has no vector.'],
  },
}

/** One line for the step list: what the step does. */
export const stepDoes = (operation: string) => ABOUT[operation]?.does ?? ''

/** What a step takes in, does and puts out, as a flow (ReUI's Timeline): reads, the rules it applies, writes, and when it fails. */
export function StepAbout({ operation }: { operation: string }) {
  const a = ABOUT[operation]
  if (!a) return null
  const items: { id: 'reads' | 'does' | 'writes' | 'fails'; title: string; body: React.ReactNode }[] = [
    { id: 'reads', title: 'Reads', body: <p>{a.reads}</p> },
    {
      id: 'does',
      title: 'Does',
      body: (
        <div className="grid gap-2">
          <p>{a.does}</p>
          {a.rules && (
            <div>
              <p className="mb-1 text-[0.8125rem] font-medium text-ink-2">{a.rules.title}</p>
              <table className="w-full border-collapse border-t border-edge">
                <thead className="sr-only">
                  <tr>
                    <th scope="col" className={deskTh}>
                      Field
                    </th>
                    <th scope="col" className={deskTh}>
                      Rule
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.rules.rows.map(([field, rule]) => (
                    <tr key={field} className="align-top">
                      <th scope="row" className={cn(deskTd, 'h-auto w-[150px] py-[7px] text-start text-[0.8125rem] font-normal whitespace-nowrap text-ink-2')}>
                        {field}
                      </th>
                      <td className={cn(deskTd, 'h-auto py-[7px]')}>{rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {a.also && (
            <ul className="grid list-disc gap-1.5 ps-5 marker:text-ink-2">
              {a.also.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    { id: 'writes', title: 'Writes', body: <p>{a.writes}</p> },
    ...(a.fails ? [{ id: 'fails' as const, title: 'When it fails', body: <p>{a.fails}</p> }] : []),
  ]
  return (
    <Timeline value={items.length} aria-label={`How ${operation} works`} className="ps-1">
      {items.map((it, i) => {
        return (
          <TimelineItem key={it.id} step={i + 1} data-flow={it.id} className="has-[+[data-completed]]:**:data-[slot=timeline-separator]:bg-ink/40">
            <TimelineHeader>
              <TimelineSeparator className="bg-ink/20" />
              <TimelineIndicator className="border-ink/40 group-data-completed/timeline-item:border-ink" />
              <TimelineTitle className="font-sans text-[0.9375rem] font-medium text-ink">{it.title}</TimelineTitle>
            </TimelineHeader>
            <TimelineContent className="text-[0.875rem] text-ink">{it.body}</TimelineContent>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}

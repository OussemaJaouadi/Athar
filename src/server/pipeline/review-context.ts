import type { Database } from 'bun:sqlite'

import type { ReadingKind } from './readings'

// The evidence beside a review question: cards for startups and people, and the question and answers for one reading.
// Reads only; the operator's answers are stored by review.ts.

export type StartupCard = {
  id: string
  /** display_name when set, else name */
  name: string
  /** the name as published */
  published: string
  description: string | null
  sector: string | null
  /** "YYYY-MM" */
  labelled: string | null
  creationYear: number | null
  website: string | null
  /** website_checks.state, or null when not checked */
  websiteState: string | null
  /** display_name when set, else name; in position order */
  founders: { name: string; key: string }[]
}

export type PersonCard = { key: string; names: string[]; startups: StartupCard[] }

export type ReviewContext = {
  id: string
  kind: ReadingKind
  /** The question in plain words, one sentence ending with a question mark. */
  question: string
  /** The answers the operator may give, each with the value to store as the decision. First = keep Athar's reading. */
  answers: { label: string; value: unknown }[]
  startups: StartupCard[]
  people: PersonCard[]
  /** Person keys that both sides share (relation), or that appear on more than one startup shown. */
  sharedKeys: string[]
}

type CardRow = {
  id: string
  name: string
  display_name: string | null
  description: string | null
  sector: string | null
  website: string | null
  labelled: string | null
  creation_year: number | null
  website_state: string | null
}
type FounderRow = { name: string; display_name: string | null; person_key: string }
type ReadingRow = { id: string; kind: ReadingKind; subject: string }

const CARD_SQL = `SELECT s.id, s.name, s.display_name, s.description, s.sector, s.website, s.labelled, s.creation_year, w.state AS website_state
  FROM startups s LEFT JOIN website_checks w ON w.startup_id = s.id`

const notNull = <T,>(value: T | null): value is T => value !== null

function toCard(db: Database, row: CardRow): StartupCard {
  const founders = db
    .query<FounderRow, [string]>('SELECT name, display_name, person_key FROM founders WHERE startup_id = ? ORDER BY position')
    .all(row.id)
  return {
    id: row.id,
    name: row.display_name ?? row.name,
    published: row.name,
    description: row.description,
    sector: row.sector,
    labelled: row.labelled,
    creationYear: row.creation_year,
    website: row.website,
    websiteState: row.website_state,
    founders: founders.map((f) => ({ name: f.display_name ?? f.name, key: f.person_key })),
  }
}

/** Creation year ascending, unknown years last, then id. */
function sortCards(cards: StartupCard[]): StartupCard[] {
  return [...cards].sort((a, b) => {
    if (a.creationYear !== b.creationYear) {
      if (a.creationYear === null) return 1
      if (b.creationYear === null) return -1
      return a.creationYear - b.creationYear
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

function uniqueCards(cards: StartupCard[]): StartupCard[] {
  const seen = new Map<string, StartupCard>()
  for (const card of cards) seen.set(card.id, card)
  return [...seen.values()]
}

/** One startup with its founders; null when the id is unknown. */
export function startupCard(db: Database, id: string): StartupCard | null {
  const row = db.query<CardRow, [string]>(`${CARD_SQL} WHERE s.id = ?`).get(id)
  return row ? toCard(db, row) : null
}

/** The published spellings of one person key, and every startup where the key appears. */
export function personCard(db: Database, key: string): PersonCard {
  const names = db
    .query<{ name: string }, [string]>('SELECT DISTINCT name FROM founders WHERE person_key = ?')
    .all(key)
    .map((row) => row.name)
    .sort()
  const rows = db
    .query<CardRow, [string]>(`${CARD_SQL} WHERE s.id IN (SELECT startup_id FROM founders WHERE person_key = ?)`)
    .all(key)
  return { key, names, startups: sortCards(rows.map((row) => toCard(db, row))) }
}

const splitPair = (subject: string): [string, string] => {
  const [a = '', b = ''] = subject.split('|')
  return [a, b]
}

const keysOf = (card: StartupCard) => card.founders.map((f) => f.key)

/** The end of the person question, by how many startups the name appears on. */
const personPhrase = (startups: number) =>
  startups === 0 ? 'one person' : startups === 1 ? 'on this startup one person' : `the same person on these ${startups} startups`

/** The answers each kind offers, in order; the first keeps Athar's reading. */
export function answersFor(kind: ReadingKind): { label: string; value: unknown }[] {
  switch (kind) {
    case 'person':
    case 'person_pair':
      return [
        { label: 'Same person', value: { same: true } },
        { label: 'Different people', value: { same: false } },
      ]
    case 'relation':
      return [
        { label: 'Same venture, renamed', value: { relation: 'renamed' } },
        { label: 'A later venture by the same people', value: { relation: 'successor' } },
        { label: 'A second venture alongside', value: { relation: 'sibling' } },
        { label: 'Not related', value: { relation: 'unrelated' } },
      ]
    case 'website':
      return [
        { label: 'It moved here', value: { state: 'moved' } },
        { label: 'The site is gone', value: { state: 'parked' } },
        { label: 'It still answers', value: { state: 'answers' } },
      ]
    case 'name':
    case 'alias':
    case 'founder':
      return [
        { label: 'Yes', value: { accept: true } },
        { label: 'No, keep the published name', value: { accept: false } },
      ]
  }
}

/** The label of the answer whose value equals `value` (compared as JSON), or null when no answer offers it. */
export function answerLabel(kind: ReadingKind, value: unknown): string | null {
  const key = JSON.stringify(value)
  return answersFor(kind).find((a) => JSON.stringify(a.value) === key)?.label ?? null
}

/** The question, answers and evidence for one stored reading; null when the reading does not exist. */
export function reviewContext(db: Database, id: string): ReviewContext | null {
  const reading = db.query<ReadingRow, [string]>('SELECT id, kind, subject FROM readings WHERE id = ?').get(id)
  if (!reading) return null
  const { kind, subject } = reading
  const base = { id: reading.id, kind }

  switch (kind) {
    case 'person': {
      const person = personCard(db, subject)
      return {
        ...base,
        question: `Is "${person.names[0] ?? subject}" ${personPhrase(person.startups.length)}?`,
        answers: answersFor(kind),
        startups: person.startups,
        people: [person],
        sharedKeys: [subject],
      }
    }
    case 'person_pair': {
      const [a, b] = splitPair(subject)
      const first = personCard(db, a)
      const second = personCard(db, b)
      return {
        ...base,
        question: `Are "${first.names[0] ?? a}" and "${second.names[0] ?? b}" the same person?`,
        answers: answersFor('person_pair'),
        startups: sortCards(uniqueCards([...first.startups, ...second.startups])),
        people: [first, second],
        sharedKeys: [],
      }
    }
    case 'relation': {
      const [idA, idB] = splitPair(subject)
      const a = startupCard(db, idA)
      const b = startupCard(db, idB)
      const shared = a && b ? [...new Set(keysOf(a))].filter((key) => keysOf(b).includes(key)).sort() : []
      return {
        ...base,
        question: `How are ${a?.name ?? idA} and ${b?.name ?? idB} related?`,
        answers: answersFor('relation'),
        startups: [a, b].filter(notNull),
        people: [],
        sharedKeys: shared,
      }
    }
    case 'website': {
      const card = startupCard(db, subject)
      return {
        ...base,
        question: `What does ${card?.name ?? subject}'s website show today?`,
        answers: answersFor('website'),
        startups: card ? [card] : [],
        people: [],
        sharedKeys: [],
      }
    }
    case 'name':
    case 'alias': {
      const card = startupCard(db, subject)
      return {
        ...base,
        question: `Is this the right name for ${card?.published ?? subject}?`,
        answers: answersFor(kind),
        startups: card ? [card] : [],
        people: [],
        sharedKeys: [],
      }
    }
    case 'founder': {
      const cut = subject.lastIndexOf('#')
      const card = startupCard(db, cut < 0 ? subject : subject.slice(0, cut))
      return {
        ...base,
        question: "Is this founder's name read correctly?",
        answers: answersFor(kind),
        startups: card ? [card] : [],
        people: [],
        sharedKeys: [],
      }
    }
  }
}

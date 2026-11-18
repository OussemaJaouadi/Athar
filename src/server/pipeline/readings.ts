import type { Lane } from './lanes'

// The stored form of a reading (table `readings`, migration 009) and of an operator's decision on it.

export type ReadingKind = 'name' | 'alias' | 'founder' | 'person' | 'person_pair' | 'relation' | 'website'

export type StoredReading = {
  /** "<kind>:<subject>" or "<kind>:<subject>:<part>"; the same reading keeps its id across rebuilds. */
  id: string
  kind: ReadingKind
  /** Startup id, "<startup id>#<position>" for a founder, a person key, or "a|b" (sorted) for a pair. */
  subject: string
  /** JSON-serialisable. */
  value: unknown
  lane: Lane
  rule: string
  why: string
  /** Hash of the published content the reading rests on; when it changes, an old decision no longer applies. */
  basis: string
}

export type Decision = {
  readingId: string
  basis: string
  value: unknown
  note: string | null
  decidedAt: string
}

/** The id of a reading. `part` distinguishes several readings of one kind on one subject (an alias). */
export const readingId = (kind: ReadingKind, subject: string, part?: string) => (part ? `${kind}:${subject}:${part}` : `${kind}:${subject}`)

/** The subject of a pair, the same whichever way round the two are given. */
export const pairSubject = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** A short stable hash of the content a reading rests on. Null and undefined parts count as empty. */
export function basisOf(...parts: (string | number | null | undefined)[]): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('\u001f'))
  return hasher.digest('hex').slice(0, 16)
}

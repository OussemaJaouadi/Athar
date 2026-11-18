// Person keys and the evidence that decides whether two appearances, or two keys, are one person.
// Pure: no I/O. Every result is a Reading from lanes.ts.

import { reading, type Reading } from './lanes'

/** One startup a person key appears on. */
export type Appearance = {
  startupId: string
  sector: string | null
  creationYear: number | null
  /** The startup's website identity, or null. */
  domain: string | null
  /** Person keys of the OTHER founders of that startup. */
  cofounders: string[]
}

/** The key split on spaces, empty parts dropped. */
export function words(key: string): string[] {
  return key.split(' ').filter(Boolean)
}

/** The shared co-founder key of two appearances, or null. Sorted so the reason is stable. */
function sharedCofounder(a: Appearance, b: Appearance): string | null {
  const other = new Set(b.cofounders)
  return [...a.cofounders].sort().find((c) => other.has(c)) ?? null
}

/** True when both appearances name the same non-null website identity. */
function sameDomain(a: Appearance, b: Appearance): a is Appearance & { domain: string } {
  return a.domain !== null && a.domain === b.domain
}

/** Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row.push(Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
    }
    prev = row
  }
  return prev[b.length]
}

/** Is one key on several startups one person? */
export function samePersonAcross(key: string, appearances: Appearance[]): Reading<boolean> {
  const n = appearances.length
  if (n < 2) {
    return reading(true, 'rule', 'person.single', 'Appears on one startup')
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = appearances[i]
      const b = appearances[j]
      const cofounder = sharedCofounder(a, b)
      if (cofounder !== null) {
        return reading(
          true,
          'rule',
          'person.corroborated',
          `"${key}" appears with the same co-founder "${cofounder}" on two startups`,
        )
      }
      if (sameDomain(a, b)) {
        return reading(
          true,
          'rule',
          'person.corroborated',
          `"${key}" appears on two startups with the same website "${a.domain}"`,
        )
      }
    }
  }

  if (words(key).length >= 3) {
    return reading(true, 'inferred', 'person.name-only', `Same full name on ${n} startups, nothing else in common`)
  }

  return reading(
    true,
    'review',
    'person.short-name-only',
    `A two-word name on ${n} unrelated startups may be two people`,
  )
}

/** How two different keys look alike, or null when they do not. */
export function keyDistance(a: string, b: string): 'same' | 'contained' | 'one-letter' | null {
  if (a === b) return 'same'

  const wa = words(a)
  const wb = words(b)

  if (wa.length >= 2 && wb.length >= 2) {
    const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
    const longerSet = new Set(longer)
    if (shorter.every((w) => longerSet.has(w))) return 'contained'
  }

  if (wa.length === wb.length && editDistance(wa.join(''), wb.join('')) === 1) {
    return 'one-letter'
  }

  return null
}

/** For two different keys that look alike: are they one person, or do they wait for an operator? */
export function maybeSamePerson(
  a: { key: string; appearances: Appearance[] },
  b: { key: string; appearances: Appearance[] },
): Reading<boolean> | null {
  const distance = keyDistance(a.key, b.key)
  if (distance === null || distance === 'same') return null

  const idsA = new Set(a.appearances.map((x) => x.startupId))
  if (b.appearances.some((y) => idsA.has(y.startupId))) {
    return reading(false, 'rule', 'person.listed-together', 'Both names are listed on the same startup, so they are two people')
  }

  // Keys are named in sorted order so the reason reads the same whichever key is passed first.
  const [k1, k2] = [a.key, b.key].sort()

  for (const x of a.appearances) {
    for (const y of b.appearances) {
      const cofounder = sharedCofounder(x, y)
      if (cofounder !== null) {
        return reading(
          true,
          'inferred',
          'person.near-and-linked',
          `"${k1}" and "${k2}" look alike and share the co-founder "${cofounder}"`,
        )
      }
      if (sameDomain(x, y)) {
        return reading(
          true,
          'inferred',
          'person.near-and-linked',
          `"${k1}" and "${k2}" look alike and share the website "${x.domain}"`,
        )
      }
    }
  }

  const how = distance === 'contained' ? 'one name contained in the other' : 'one letter apart'
  return reading(
    false,
    'review',
    distance === 'contained' ? 'person.name-contained' : 'person.one-letter-apart',
    `"${k1}" and "${k2}" are ${how} with no shared co-founder or website, so an operator decides`,
  )
}

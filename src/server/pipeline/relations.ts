// Proposes how two startups relate, from their shared founders, website, names, years, sector and description
// similarity. Pure: no I/O. Every answer is a Reading with the evidence in its `why`.

import { reading, type Reading } from './lanes'

export type Relation = 'renamed' | 'successor' | 'sibling' | 'unrelated'

export type StartupFacts = {
  id: string
  name: string
  sector: string | null
  creationYear: number | null
  /** The website identity, e.g. "wemove.tn"; null when none. */
  domain: string | null
  /** Person keys of the founders (already normalised strings). */
  founders: string[]
  /** Other names known for it (product, brand, former name), as published. */
  aliases: string[]
}

export const ALIKE = 0.65
export const SOMEWHAT_ALIKE = 0.5
export const SUCCESSOR_GAP_YEARS = 2

/** Lower-case, accents stripped, only letters and digits kept. Used to compare names. */
export function nameKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** The pair with the earlier creation year first; unknown years last; ties by id. */
export function order(a: StartupFacts, b: StartupFacts): [StartupFacts, StartupFacts] {
  const ya = a.creationYear
  const yb = b.creationYear
  if (ya !== null && yb !== null && ya !== yb) return ya < yb ? [a, b] : [b, a]
  if (ya !== null && yb === null) return [a, b]
  if (ya === null && yb !== null) return [b, a]
  return a.id <= b.id ? [a, b] : [b, a]
}

/** The known name, from either side, that identifies the same startup; null when none does. */
function aliasEvidence(a: StartupFacts, b: StartupFacts): string | null {
  const keysA = a.aliases.map(nameKey).filter(Boolean)
  const keysB = b.aliases.map(nameKey).filter(Boolean)
  const nameA = nameKey(a.name)
  const nameB = nameKey(b.name)
  const aliasA = a.aliases.find((x) => nameKey(x) !== '' && nameKey(x) === nameB)
  if (aliasA !== undefined) return aliasA
  const aliasB = b.aliases.find((x) => nameKey(x) !== '' && nameKey(x) === nameA)
  if (aliasB !== undefined) return aliasB
  const shared = a.aliases.find((x) => keysB.includes(nameKey(x)) && nameKey(x) !== '')
  if (shared !== undefined && keysA.includes(nameKey(shared))) return shared
  return null
}

export function relate(a: StartupFacts, b: StartupFacts, similarity: number | null): Reading<Relation> {
  const foundersA = [...new Set(a.founders)]
  const founderSetB = new Set(b.founders)
  const sharedCount = foundersA.filter((k) => founderSetB.has(k)).length
  const teamSize = Math.min(foundersA.length, new Set(b.founders).size)
  // A "team" of one is only one name: it takes two shared founders to call it the same team.
  const wholeTeam = sharedCount >= 2 && sharedCount === teamSize
  const sameSector = a.sector !== null && b.sector !== null && a.sector === b.sector
  const gap = a.creationYear !== null && b.creationYear !== null ? Math.abs(a.creationYear - b.creationYear) : null
  const alike = similarity !== null && similarity >= ALIKE
  const somewhat = similarity !== null && similarity >= SOMEWHAT_ALIKE
  const simText = similarity === null ? 'no description to compare' : `descriptions ${similarity.toFixed(2)} alike`
  const yearText =
    a.creationYear !== null && b.creationYear !== null
      ? `founded ${a.creationYear} and ${b.creationYear}`
      : 'founding years unknown'
  const teamText = `${sharedCount} of ${teamSize} founders in common`
  const evidence = [teamText, yearText, sameSector ? `both in ${a.sector}` : null, simText]
    .filter((x): x is string => x !== null)
    .join(', ')

  if (a.domain !== null && b.domain !== null && a.domain === b.domain) {
    return reading('renamed', 'rule', 'relation.same-site', `Both use the website ${a.domain}.`)
  }

  const alias = aliasEvidence(a, b)
  if (alias !== null) {
    return reading(
      'renamed',
      'inferred',
      'relation.alias',
      `The known name "${alias}" matches the other startup's name or one of its aliases.`,
    )
  }

  if (sharedCount === 0) {
    return reading('unrelated', 'rule', 'relation.no-founder', `No founder in common (${teamText}); ${simText}.`)
  }

  if (wholeTeam && alike) {
    return reading('renamed', 'review', 'relation.same-team-same-thing', `${evidence}. The same team may have renamed one thing.`)
  }

  if (gap !== null && gap >= SUCCESSOR_GAP_YEARS && (sameSector || somewhat)) {
    return reading('successor', 'inferred', 'relation.later-same-field', `${evidence}. The later one may have replaced the earlier.`)
  }

  if (wholeTeam) {
    return reading('sibling', 'inferred', 'relation.same-team', `${evidence}. The same team likely runs a second venture.`)
  }

  if (sharedCount >= 2) {
    return reading('sibling', 'inferred', 'relation.several-founders', `${evidence}. Several founders overlap.`)
  }

  if (sameSector || somewhat) {
    return reading(
      'sibling',
      'review',
      'relation.one-founder-same-field',
      `${evidence}. One founder name is on both, in the same field; whether it is a second venture by the same person is not confirmed.`,
    )
  }

  return reading(
    'unrelated',
    'review',
    'relation.one-founder-only',
    `${evidence}. The single shared founder name may be a namesake, not the same person.`,
  )
}

// Reads one item of the registry's founders list into person names. Pure: no I/O.
// Each result is a Reading (see lanes.ts): a rule when the text has one reading, an inferred split or unglue
// when Athar makes a best guess, a review when an operator must decide.

import { reading, type Reading } from './lanes'

const PLACEHOLDERS = new Set(['n.a.', 'n.a', 'na', '-', '--', '.'])

// Tried in this order; the first separator whose split is accepted wins.
const SEPARATORS = [' / ', '/', ';', ',', ' & ', ' et ', ' and ', ' - ', '-']

// Surname or name prefixes that must not be unglued when the capital comes straight after them ("McDonald").
const PREFIXES = ['Mc', 'Mac', 'De', 'La', 'Le', 'El']

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim()

const wordCount = (text: string): number => text.split(' ').filter(Boolean).length

const trySplit = (text: string, separator: string): string[] | null => {
  const parts = text.split(separator).map(tidy).filter(part => part.length > 0)
  if (parts.length < 2) return null
  if (!parts.every(part => wordCount(part) >= 2)) return null
  return parts
}

// Returns the index where a lower-case letter is directly followed by an upper-case one, if there is exactly one.
const soleCaseBoundary = (token: string): number | null => {
  const boundaries: number[] = []
  for (let i = 0; i < token.length - 1; i++) {
    if (/\p{Ll}/u.test(token[i]!) && /\p{Lu}/u.test(token[i + 1]!)) boundaries.push(i + 1)
  }
  return boundaries.length === 1 ? boundaries[0]! : null
}

const isProtectedPrefixed = (token: string, boundary: number): boolean => {
  const prefix = PREFIXES.find(p => token.startsWith(p))
  if (!prefix) return false
  // "McDonald": the capital comes right after the prefix, so it is one surname.
  if (boundary === prefix.length) return true
  // Short remainder after the capital ("LeBon"): keep it whole.
  return token.slice(boundary + 1).length < 4
}

export function readFounderItem(published: string): Reading<string[]> {
  const text = tidy(published)

  if (text === '' || PLACEHOLDERS.has(text.toLowerCase())) {
    return reading([], 'rule', 'founder.blank', 'Empty or a placeholder; no founder is named')
  }

  for (const separator of SEPARATORS) {
    if (!text.includes(separator)) continue
    const parts = trySplit(text, separator)
    if (parts) {
      return reading(
        parts,
        'inferred',
        'founder.split',
        `One item held ${parts.length} names joined by "${separator.trim()}"`,
      )
    }
  }

  if (!text.includes(' ')) {
    const boundary = soleCaseBoundary(text)
    if (boundary !== null && !isProtectedPrefixed(text, boundary)) {
      const unglued = `${text.slice(0, boundary)} ${text.slice(boundary)}`
      return reading([unglued], 'inferred', 'founder.unglued', `Two names glued together; read as "${unglued}"`)
    }
    if (wordCount(text) === 1) {
      return reading([text], 'review', 'founder.one-word', 'Only one word; it may be a first name or a surname')
    }
  }

  if (/\d|@|http/i.test(text)) {
    return reading([text], 'review', 'founder.not-a-name', 'Contains a digit, an "@" or a link, so it may not be a name')
  }

  return reading([text], 'rule', 'founder.kept', 'Kept as published')
}

export function readFounders(published: string[]): { names: string[]; readings: Reading<string[]>[] } {
  const readings = published.map(readFounderItem)
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of readings) {
    for (const name of item.value) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }
  return { names, readings }
}

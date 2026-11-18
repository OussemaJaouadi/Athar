// Standard display forms for published names. The published text is kept as it is; these functions compute the
// form Athar shows beside it. Pure: no I/O, no database.

import { reading, type Reading } from './lanes'

const LEGAL_FORMS = new Set(['SA', 'SARL', 'SUARL', 'SAS', 'LTD', 'LLC', 'INC'])
const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'of', 'the', 'and', 'for', 'en', 'au'])
const ACRONYM = /^(.*\S)\s*\(([\p{Lu}\p{Nd}]{2,6})\)$/u

/** Trim, turn tabs, newlines and non-breaking spaces into spaces, and collapse runs of whitespace to one space. */
export function tidy(text: string): string {
  return text.replace(/[\s ]+/gu, ' ').trim()
}

const letters = (text: string): string[] => text.match(/\p{L}/gu) ?? []

const isAllCaps = (text: string): boolean => letters(text).length > 0 && text === text.toUpperCase()

/** Upper-cases the first code point and lower-cases the rest. */
function upperFirst(text: string): string {
  const [first = '', ...rest] = Array.from(text)
  return first.toUpperCase() + rest.join('').toLowerCase()
}

/** Capitalises each part of a word split at hyphens and apostrophes: "EL-AMRI" becomes "El-Amri". */
function capitalise(word: string): string {
  return word
    .split(/([-'’])/u)
    .map((part, i, parts) => {
      if (/^[-'’]$/u.test(part)) return part
      // A single letter after an apostrophe is a possessive or an elision ("SMEK'S", "L'ATELIER"): keep it lower.
      if (i > 0 && /^['’]$/u.test(parts[i - 1]) && Array.from(part).length === 1) return part.toLowerCase()
      return upperFirst(part)
    })
    .join('')
}

/** Title case for a name published in capitals. Short words (1 to 3 letters) stay upper case, except small words after the first. */
function titleCase(text: string): string {
  return text
    .split(' ')
    .map((word, index) => {
      const count = letters(word).length
      if (count >= 1 && count <= 3) {
        if (SMALL_WORDS.has(word.toLowerCase())) return index > 0 ? word.toLowerCase() : upperFirst(word)
        return word
      }
      return capitalise(word.toLowerCase())
    })
    .join(' ')
}

/** Removes a legal form that is the last word, when a name stands before it. */
function splitLegalForm(text: string): { base: string; legalForm: string | null } {
  const words = text.split(' ')
  if (words.length < 2) return { base: text, legalForm: null }
  const form = words[words.length - 1].replace(/\./g, '').toUpperCase()
  if (!LEGAL_FORMS.has(form)) return { base: text, legalForm: null }
  return { base: words.slice(0, -1).join(' '), legalForm: form }
}

export function standardName(published: string): {
  display: Reading<string>
  legalForm: string | null
  acronym: string | null
} {
  const tidied = tidy(published)
  const removed: string[] = []

  let base = tidied
  let legalForm: string | null = null
  const legal = splitLegalForm(base)
  if (legal.legalForm) {
    base = legal.base
    legalForm = legal.legalForm
    removed.push(`legal form "${legalForm}"`)
  }

  let acronym: string | null = null
  const match = ACRONYM.exec(base)
  if (match && /\p{Lu}/u.test(match[2])) {
    base = match[1]
    acronym = match[2]
    removed.push(`acronym "(${acronym})"`)
  }

  if (isAllCaps(base) && (base.includes(' ') || base.length > 5)) {
    return {
      display: reading(titleCase(base), 'inferred', 'name.caps', `Published in capitals as "${base}"`),
      legalForm,
      acronym,
    }
  }

  if (tidied !== published) removed.unshift('stray spaces')
  if (removed.length > 0) {
    return {
      display: reading(base, 'rule', 'name.tidied', `Removed ${removed.join(', ')}`),
      legalForm,
      acronym,
    }
  }

  return {
    display: reading(base, 'rule', 'name.kept', 'Kept as published'),
    legalForm,
    acronym,
  }
}

export function standardPersonName(published: string): Reading<string> {
  const tidied = tidy(published)
  const allLower = letters(tidied).length > 0 && tidied === tidied.toLowerCase()
  const value = tidied
    .split(' ')
    .map((word) => {
      const upperWord = letters(word).length >= 2 && word === word.toUpperCase()
      return allLower || upperWord ? capitalise(word.toLowerCase()) : word
    })
    .join(' ')

  if (value !== tidied) return reading(value, 'rule', 'person.casing', `Published as "${tidied}"`)
  return reading(value, 'rule', 'person.kept', 'Kept as published')
}

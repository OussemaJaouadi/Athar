// Other names a registry row may go by: the name the description opens with (a product, a brand, a former name, an
// acronym), and the company domain an email sits on when it differs from the website. Pure: no I/O.

import { reading, type Reading } from './lanes'

/** Lower-case, accents removed, every character that is not a letter or digit removed: "École Verte" -> "ecoleverte". */
export function nameKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const WORD = String.raw`[\p{Lu}\p{N}][\p{L}\p{N}.&'-]*`
const VERBS = [
  'is', 'est', 'are', 'sont', 'offers', 'offre', 'provides', 'propose', 'develops', 'développe', 'developpe',
  'helps', 'aide', 'permet', 'enables', 'allows', 'builds', 'makes', 'creates',
]
// Subject: 1 to 4 consecutive capitalised (or digit-led) words, followed by a verb as a whole word, or by a comma.
const SUBJECT = new RegExp(
  `^(${WORD}(?: ${WORD}){0,3})(?=(?: (?:${VERBS.join('|')})(?![\\p{L}\\p{N}]))|,)`,
  'u',
)
const GENERIC_OPENERS = new Set([
  'the', 'our', 'we', 'a', 'an', 'it', 'this', 'une', 'un', 'la', 'le', 'les', 'notre', 'nous', 'cette', 'ce',
  'plateforme', 'platform', 'application', 'app', 'solution', 'startup', 'société', 'company',
])
const ACRONYM_STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'et', 'of', 'the', 'and', 'for'])

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '' && !ACRONYM_STOP_WORDS.has(word.toLowerCase()))
    .map((word) => Array.from(word.replace(/[^\p{L}\p{N}]/gu, ''))[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * The other name a description opens with, or null when it opens with none or just repeats the row's name.
 * An all-caps subject equal to the name's initials is a rule-lane acronym; any other subject is an inferred alias.
 */
export function describedAs(name: string, description: string | null): Reading<string> | null {
  const text = description?.trim() ?? ''
  if (text === '') return null

  const match = SUBJECT.exec(text)
  const subject = match?.[1]
  if (!subject) return null

  const firstWord = subject.split(' ')[0] ?? ''
  if (GENERIC_OPENERS.has(firstWord.toLowerCase())) return null

  const subjectKey = nameKey(subject)
  const nameK = nameKey(name)
  if (subjectKey === nameK || subjectKey.includes(nameK) || nameK.includes(subjectKey)) return null

  if (subject.length >= 2 && subject.length <= 6 && /^[\p{Lu}\p{N}]+$/u.test(subject) && subject === initials(name)) {
    return reading(subject, 'rule', 'alias.acronym', `"${subject}" is the initials of "${name}"`)
  }

  return reading(
    subject,
    'inferred',
    'alias.described-as',
    `The description opens with "${subject}", not "${name}"`,
  )
}

/** The lower-cased part after "@", or null when there is no usable email. */
export function emailDomain(email: string | null): string | null {
  const text = email?.trim() ?? ''
  if (text === '' || text.toLowerCase() === 'n.a.') return null
  const at = text.lastIndexOf('@')
  if (at === -1) return null
  const domain = text.slice(at + 1).trim().toLowerCase()
  return domain === '' ? null : domain
}

export const FREE_MAILBOXES: Set<string> = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.com',
  'live.fr', 'icloud.com', 'ymail.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.fr',
])

/**
 * The email's company domain when it differs from the website host. Without a website the email domain is
 * returned as an inferred reading saying so. Free mailboxes, and domains that match or are subdomains of the
 * website, return null.
 */
export function secondDomain(email: string | null, websiteDomain: string | null): Reading<string> | null {
  const domain = emailDomain(email)
  if (domain === null || FREE_MAILBOXES.has(domain)) return null

  const website = (websiteDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.replace(/^www\./, '') ?? ''
  if (website === '') {
    return reading(domain, 'inferred', 'alias.email-only', `No website in the registry; the email is on ${domain}`)
  }

  if (domain === website || domain.endsWith(`.${website}`) || website.endsWith(`.${domain}`)) return null

  return reading(
    domain,
    'inferred',
    'alias.email-domain',
    `The email is on ${domain}, the website on ${website}`,
  )
}

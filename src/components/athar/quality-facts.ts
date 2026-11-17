import type { QualityFact } from '#/server/pipeline/facts'

/*
 * The words for a quality fact: what in the data is doubtful or missing right now, and what it costs a reader.
 * These are observations about the registry, not errors.
 */

const s = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

const COST: Record<string, (n: number) => string> = {
  no_description: (n) => `${s(n, 'startup has', 'startups have')} no description, so they cannot be matched to an idea by meaning.`,
  no_website: (n) => `${s(n, 'startup has', 'startups have')} no website in the registry, so nothing can be asked about it.`,
  website_unreadable: (n) => `${s(n, 'website field holds', 'website fields hold')} no usable address, so the website is treated as missing.`,
  label_unreadable: (n) => `${s(n, 'startup has', 'startups have')} a label date that cannot be read, so they are left out of every year and month.`,
  label_before_creation: (n) => `${s(n, 'startup was', 'startups were')} labelled before the year they say they were founded; one of the two dates is wrong.`,
  moved: (n) => `${s(n, 'website answers', 'websites answer')} from another domain than the registry gives, so the published address is out of date.`,
  website_text_removed: (n) => `${s(n, 'website field held', 'website fields held')} more than an address; only the address is kept and the rest is withheld from screens.`,
  second_website: (n) => `${s(n, 'website field holds', 'website fields hold')} two addresses; only the first is asked and shown.`,
  social_not_checked: (n) => `${s(n, 'startup gives', 'startups give')} a page on a social network as its website, so it is not asked whether it answers.`,
  listed_more_than_once: (n) => `${s(n, 'startup appears', 'startups appear')} in the registry more than once; each is shown as one startup.`,
  other_sector: (n) => `${s(n, 'startup is', 'startups are')} listed under two sectors; the sector of the fuller listing is kept, so sector counts carry a small doubt.`,
  other_name: (n) => `${s(n, 'startup is', 'startups are')} listed under two names; one name is shown and the other is kept as a spelling.`,
  exact_copies: (n) => `${s(n, 'row was', 'rows were')} published more than once, character for character; each is stored once.`,
  not_in_registry: (n) => `${s(n, 'startup is', 'startups are')} no longer published by the registry; Athar keeps them with the date they were last seen.`,
}

export const costOf = (code: string, label: string, n: number) => {
  if (n === 0) return 'None in the data today.'
  if (COST[code]) return COST[code](n)
  if (code === 'unreachable:no such domain') return `${s(n, 'website points', 'websites point')} to a domain that no longer exists, so the registry's link leads nowhere.`
  if (code.startsWith('unreachable:')) return `${s(n, 'website does', 'websites do')} not answer (${code.slice(12)}), so the registry's link does not open a working site.`
  return `${s(n, 'startup', 'startups')}: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** A fact's words for the narrow facts column: no repeated prefix, no "in the registry". */
export const factShort = (f: QualityFact) =>
  f.code.startsWith('unreachable:') ? cap(f.label.replace(/^Website does not answer:\s*/, '')) : f.label.replace(/ in the registry$/, '')
export const isSilent = (f: QualityFact) => f.code.startsWith('unreachable:')

export const GROUP_NAME: Record<QualityFact['group'], string> = { missing: 'Missing', website: 'Websites', listing: 'Listing', reading: 'Reading', registry: 'Registry' }
export const GROUPS = Object.keys(GROUP_NAME) as QualityFact['group'][]

/** Facts in the server's order inside each group; a fact checked and found empty stays, last, saying "none". */
export const groupFacts = (facts: QualityFact[]) =>
  GROUPS.map((group) => ({ group, facts: [...facts.filter((f) => f.group === group && f.count > 0), ...facts.filter((f) => f.group === group && f.count === 0)] })).filter((g) => g.facts.length)

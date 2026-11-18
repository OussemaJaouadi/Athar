// Classifies one website check: does the startup's own site answer, or does it land somewhere else?
// Pure: takes the stored check and the startup's website identity, returns a Reading with its lane.

import { reading, type Reading } from './lanes'

export type WebsiteState = 'answers' | 'moved' | 'parked' | 'elsewhere' | 'silent' | 'unrelated'

export type CheckInput = {
  /** 'reachable' or 'unreachable', as stored. */
  status: string
  /** In words: "answered 200", "no such domain", "certificate problem", "timed out". */
  detail: string
  /** The host that finally answered, when it differs from the one asked; null otherwise. */
  finalHost: string | null
}

/** Registrable domains of domain-for-sale and parking pages. A check that lands here is not a live site. */
export const PARKED_HOSTS: ReadonlySet<string> = new Set([
  'hugedomains.com',
  'sedo.com',
  'sedoparking.com',
  'dan.com',
  'afternic.com',
  'bodis.com',
  'parkingcrew.net',
  'undeveloped.com',
  'domainmarket.com',
  'buydomains.com',
  'uniregistry.com',
  'godaddy.com',
  'namecheap.com',
  'above.com',
  'parklogic.com',
  'domainnamesales.com',
  'hostinger.com',
  'parkingpage.namecheap.com',
  'cashparking.com',
  'smartname.com',
  'voodoo.com',
  'dynadot.com',
  'porkbun.com',
  '1and1.com',
  'ionos.com',
  'ovh.net',
  'lws.fr',
])

/** Site-builder and hosting suffixes. A page on one of these is a subdomain of the suffix, e.g. "shop.wixsite.com". */
export const BUILDER_SUFFIXES: string[] = [
  'webnode.fr',
  'webnode.com',
  'wixsite.com',
  'wordpress.com',
  'blogspot.com',
  'netlify.app',
  'vercel.app',
  'firebaseapp.com',
  'web.app',
  'azurewebsites.net',
  'herokuapp.com',
  'odoo.com',
  'github.io',
  'business.site',
  'webflow.io',
  'renderforestsites.com',
  'epizy.com',
  'weebly.com',
  'squarespace.com',
  'myshopify.com',
  'sites.google.com',
]

/** Labels that a dead or parked page puts at the front of its host, e.g. "expired.renderforestsites.com". */
const DEAD_PAGE_LABELS: string[] = ['expired', 'error', 'suspended', 'parked', 'parking', 'forsale']

/**
 * Stores, social pages and link hubs. Matched on the full host ("play.google.com") or on the registrable
 * domain ("facebook.com"), so a platform subdomain counts without naming every one.
 */
export const PLATFORM_HOSTS: ReadonlySet<string> = new Set([
  'play.google.com',
  'apps.apple.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'linktr.ee',
  'github.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
])

/** Public suffixes longer than one label. Anything else is treated as a one-label suffix. */
const TWO_PART_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk',
  'com.tn',
  'org.tn',
  'net.tn',
  'gov.tn',
  'com.au',
  'co.za',
  'com.br',
])

/** Lower-case host without scheme, path, or a leading "www." or "m.". */
export function hostOnly(h: string): string {
  let host = h.trim().toLowerCase().replace(/^https?:\/\//, '')
  host = host.split('/')[0] ?? ''
  if (host.startsWith('www.')) host = host.slice(4)
  else if (host.startsWith('m.')) host = host.slice(2)
  return host
}

/** The builder suffix a host sits on, or null. "shop.wixsite.com" -> "wixsite.com"; "wixsite.com" -> "wixsite.com". */
export function builderOf(host: string): string | null {
  const h = hostOnly(host)
  return BUILDER_SUFFIXES.find((s) => h === s || h.endsWith('.' + s)) ?? null
}

/** The first label of a builder suffix: "webnode.fr" -> "webnode". */
export function builderName(suffix: string): string {
  return suffix.split('.')[0] ?? ''
}

/** Number of labels that make up the public suffix of a host. */
function suffixLength(labels: string[]): number {
  const last2 = labels.slice(-2).join('.')
  return labels.length > 2 && TWO_PART_SUFFIXES.has(last2) ? 2 : 1
}

/** The registrable name without its public suffix: "tuniq.co.uk" -> "tuniq", "annonces.legaltech.tn" -> "legaltech". */
export function siteName(host: string): string {
  const labels = hostOnly(host).split('.')
  const index = labels.length - suffixLength(labels) - 1
  return labels[Math.max(index, 0)] ?? ''
}

/** The registrable domain: the public suffix plus one label, "app.legaltech.tn" -> "legaltech.tn". */
function registrable(host: string): string {
  const labels = hostOnly(host).split('.')
  return labels.slice(-(suffixLength(labels) + 1)).join('.')
}

/** Classifies one check of a startup's website. `domain` is the stored identity, e.g. "verse.tn" or "facebook.com/page". */
export function websiteState(check: CheckInput, domain: string | null): Reading<WebsiteState> {
  // 1. The site did not answer at all.
  if (check.status !== 'reachable') {
    return reading<WebsiteState>('silent', 'rule', 'website.silent', `No answer: ${check.detail}`)
  }

  const finalHost = check.finalHost ? hostOnly(check.finalHost) : ''
  const asked = domain ? hostOnly(domain.split('/')[0] ?? '') : ''

  const sameSite = !!asked && !!finalHost && registrable(finalHost) === registrable(asked)

  // 2. It lands on a page for a site that is no longer there. Checked before the same-site rule.
  if (finalHost && !sameSite && DEAD_PAGE_LABELS.some((label) => finalHost.startsWith(label + '.'))) {
    return reading<WebsiteState>(
      'parked',
      'rule',
      'website.dead-page',
      `Answers from ${finalHost}, a page for a site that is no longer there.`,
    )
  }

  // 3. A builder page (asked on a builder subdomain) now leads to the builder's own front page.
  const askedBuilder = asked ? builderOf(asked) : null
  const finalBuilder = finalHost ? builderOf(finalHost) : null
  if (
    askedBuilder &&
    asked !== askedBuilder &&
    finalBuilder &&
    finalHost === finalBuilder &&
    builderName(finalBuilder) === builderName(askedBuilder)
  ) {
    return reading<WebsiteState>(
      'parked',
      'rule',
      'website.builder-page-gone',
      `The page on ${builderName(askedBuilder)} is gone; the address now leads to ${finalHost}.`,
    )
  }

  // 4. It answered where it was asked, or on a host of the same registrable domain.
  if (!finalHost || (asked && (finalHost === asked || sameSite))) {
    return reading<WebsiteState>('answers', 'rule', 'website.answers', 'Answers at the address it was given.')
  }

  // 5. It lands on a domain-for-sale or parking page.
  if (PARKED_HOSTS.has(finalHost) || PARKED_HOSTS.has(registrable(finalHost))) {
    return reading<WebsiteState>(
      'parked',
      'rule',
      'website.parked',
      `Answers from ${finalHost}, a domain-for-sale page.`,
    )
  }

  // 6. It lands on a store, social or link page.
  if (PLATFORM_HOSTS.has(finalHost) || PLATFORM_HOSTS.has(registrable(finalHost))) {
    return reading<WebsiteState>(
      'elsewhere',
      'rule',
      'website.platform',
      `Answers from ${finalHost}, a store or social page.`,
    )
  }

  // Everything below compares names, so it needs the asked host.
  if (!asked) {
    return reading<WebsiteState>(
      'unrelated',
      'review',
      'website.unrelated',
      `Answers from ${finalHost}, and no website is recorded to compare it with.`,
    )
  }

  const askedName = siteName(asked)
  const finalName = siteName(finalHost)

  // 7. Same name on another suffix.
  if (finalName === askedName) {
    return reading<WebsiteState>(
      'moved',
      'inferred',
      'website.moved',
      `Answers from ${finalHost}, the same name on another domain.`,
    )
  }

  // 8. One name contains the other, and the shorter one is at least 4 characters.
  const shorter = Math.min(askedName.length, finalName.length)
  if (shorter >= 4 && (askedName.includes(finalName) || finalName.includes(askedName))) {
    return reading<WebsiteState>(
      'moved',
      'review',
      'website.moved-similar',
      `Answers from ${finalHost}, a name close to ${asked}; whether it is the same startup is not confirmed.`,
    )
  }

  // 9. Shares nothing with the asked site.
  return reading<WebsiteState>(
    'unrelated',
    'review',
    'website.unrelated',
    `Answers from ${finalHost}, which shares nothing with ${asked}.`,
  )
}

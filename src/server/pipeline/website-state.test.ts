import { describe, expect, test } from 'bun:test'
import { hostOnly, siteName, websiteState } from './website-state'

const reachable = (finalHost: string | null) => ({ status: 'reachable', detail: 'answered 200', finalHost })
const unreachable = (detail: string) => ({ status: 'unreachable', detail, finalHost: null })

describe('hostOnly', () => {
  test('lower-cases, strips www., m. and paths', () => {
    expect(hostOnly('WWW.Verse.TN')).toBe('verse.tn')
    expect(hostOnly('m.facebook.com')).toBe('facebook.com')
    expect(hostOnly('facebook.com/somepage')).toBe('facebook.com')
    expect(hostOnly('bit.ly/38vvraq')).toBe('bit.ly')
  })
})

describe('siteName', () => {
  test('drops the public suffix, including two-part suffixes', () => {
    expect(siteName('tuniq.co.uk')).toBe('tuniq')
    expect(siteName('verse.tn')).toBe('verse')
    expect(siteName('annonces.legaltech.tn')).toBe('legaltech')
    expect(siteName('one-drone.fr')).toBe('one-drone')
    expect(siteName('www.tuniq.com.au')).toBe('tuniq')
  })
})

describe('websiteState: silent', () => {
  test('unreachable with each detail is silent', () => {
    for (const detail of ['no such domain', 'certificate problem', 'timed out']) {
      const r = websiteState(unreachable(detail), 'verse.tn')
      expect(r.value).toBe('silent')
      expect(r.lane).toBe('rule')
      expect(r.rule).toBe('website.silent')
      expect(r.why).toBe(`No answer: ${detail}`)
    }
  })
})

describe('websiteState: answers', () => {
  test('reachable with finalHost null answers', () => {
    const r = websiteState(reachable(null), 'verse.tn')
    expect(r.value).toBe('answers')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('website.answers')
  })

  test('same host, www. prefix on either side, answers', () => {
    expect(websiteState(reachable('www.verse.tn'), 'verse.tn').value).toBe('answers')
    expect(websiteState(reachable('verse.tn'), 'www.verse.tn').value).toBe('answers')
  })

  test('subdomain of the same registrable domain answers', () => {
    expect(websiteState(reachable('annonces.legaltech.tn'), 'app.legaltech.tn').value).toBe('answers')
  })

  test('reachable with domain null and finalHost null answers', () => {
    expect(websiteState(reachable(null), null).value).toBe('answers')
  })
})

describe('websiteState: parked', () => {
  test('Slidzo-style redirect to hugedomains is parked', () => {
    const bare = websiteState(reachable('hugedomains.com'), 'slidzo.com')
    expect(bare.value).toBe('parked')
    expect(bare.lane).toBe('rule')
    expect(bare.rule).toBe('website.parked')
    expect(bare.why).toBe('Answers from hugedomains.com, a domain-for-sale page.')
    expect(websiteState(reachable('www.hugedomains.com'), 'slidzo.com').value).toBe('parked')
  })

  test('every listed parking host is parked', () => {
    for (const host of ['sedo.com', 'dan.com', 'afternic.com', 'godaddy.com', 'namecheap.com']) {
      expect(websiteState(reachable(host), 'slidzo.com').value).toBe('parked')
    }
  })

  test('parked with domain null is parked', () => {
    expect(websiteState(reachable('dan.com'), null).value).toBe('parked')
  })
})

describe('websiteState: elsewhere', () => {
  test('bit.ly link to a Play Store page is elsewhere', () => {
    const r = websiteState(reachable('play.google.com'), 'bit.ly/38vvraq')
    expect(r.value).toBe('elsewhere')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('website.platform')
    expect(r.why).toBe('Answers from play.google.com, a store or social page.')
  })

  test('platform matched on registrable domain', () => {
    expect(websiteState(reachable('m.facebook.com'), 'verse.tn').value).toBe('elsewhere')
    expect(websiteState(reachable('apps.apple.com'), 'verse.tn').value).toBe('elsewhere')
  })

  test('google.com itself is not a platform host', () => {
    expect(websiteState(reachable('www.google.com'), 'verse.tn').value).toBe('unrelated')
  })
})

describe('websiteState: moved', () => {
  test('same name on another suffix is moved, inferred', () => {
    const r = websiteState(reachable('verse.ad'), 'verse.tn')
    expect(r.value).toBe('moved')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('website.moved')
    expect(r.why).toBe('Answers from verse.ad, the same name on another domain.')
  })

  test('contained similar name is moved, review', () => {
    const r = websiteState(reachable('tuniq.co.uk'), 'tuniqoasis.com')
    expect(r.value).toBe('moved')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('website.moved-similar')
  })

  test('contained name shorter than 4 characters is not similar', () => {
    expect(websiteState(reachable('ab.com'), 'abcdef.com').value).toBe('unrelated')
  })
})

describe('websiteState: unrelated', () => {
  test('shares nothing is unrelated, review', () => {
    const r = websiteState(reachable('airmanishillside.com'), 'epilert.io')
    expect(r.value).toBe('unrelated')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('website.unrelated')
    expect(r.why).toBe('Answers from airmanishillside.com, which shares nothing with epilert.io.')
  })

  test('domain null with an unknown final host is unrelated, review', () => {
    const r = websiteState(reachable('airmanishillside.com'), null)
    expect(r.value).toBe('unrelated')
    expect(r.lane).toBe('review')
  })
})

import { describe, expect, test } from 'bun:test'
import { describedAs, emailDomain, FREE_MAILBOXES, GENERIC_TERMS, nameKey, secondDomain } from './aliases'

describe('nameKey', () => {
  test('lower-cases, strips accents and punctuation', () => {
    expect(nameKey('Med.tn')).toBe('medtn')
    expect(nameKey('École Verte')).toBe('ecoleverte')
    expect(nameKey('Smart Med SA')).toBe('smartmedsa')
  })
})

describe('describedAs', () => {
  test('captures a different name the description opens with', () => {
    const sobflous = describedAs('SF Technologies', 'Sobflous is a mobile payment app')
    expect(sobflous?.value).toBe('Sobflous')
    expect(sobflous?.lane).toBe('inferred')
    expect(sobflous?.rule).toBe('alias.described-as')
    expect(sobflous?.why).toBe('The description opens with "Sobflous", not "SF Technologies"')
  })

  test('French verb "est" with a dotted subject', () => {
    expect(describedAs('Smart Med SA', 'Med.tn est une plateforme')?.value).toBe('Med.tn')
  })

  test('"is" with an online platform', () => {
    expect(describedAs('Civitas', 'Rokhsti is an online platform')?.value).toBe('Rokhsti')
  })

  test('multi-word subject', () => {
    expect(describedAs('Kamioun', 'Kriga Technologies is a startup')?.value).toBe('Kriga Technologies')
    expect(describedAs('Pet Pals', 'PlayPals Studio develops games')?.value).toBe('PlayPals Studio')
  })

  test('subject followed by "is" then "specialized"', () => {
    expect(describedAs('KHEER', 'APTYX is a startup specialized in')?.value).toBe('APTYX')
  })

  test('acronym of the name is a rule-lane reading', () => {
    const bws = describedAs('Be Wireless Solutions', 'BWS is a wireless operator')
    expect(bws?.value).toBe('BWS')
    expect(bws?.lane).toBe('rule')
    expect(bws?.rule).toBe('alias.acronym')
  })

  test('acronym skips stop words and ignores case of the name', () => {
    const sfa = describedAs('South fruits Agri', 'SFA est une société agricole')
    expect(sfa?.value).toBe('SFA')
    expect(sfa?.lane).toBe('rule')
  })

  test('description repeating the name returns null', () => {
    expect(describedAs('Autorent', 'Autorent is a car rental company')).toBeNull()
    expect(describedAs('FININFO SOLUTIONS', 'FININFO SOLUTIONS is a fintech')).toBeNull()
  })

  test('null, empty and whitespace descriptions return null', () => {
    expect(describedAs('X', null)).toBeNull()
    expect(describedAs('X', '')).toBeNull()
    expect(describedAs('X', '   ')).toBeNull()
  })

  test('description starting with a lower-case word returns null', () => {
    expect(describedAs('Civitas', 'rokhsti is an online platform')).toBeNull()
  })

  test('generic openers return null', () => {
    expect(describedAs('KLAB', 'Our platform helps teams')).toBeNull()
    expect(describedAs('KLAB', 'The app helps teams')).toBeNull()
    expect(describedAs('KLAB', 'Plateforme est une solution')).toBeNull()
  })

  test('French description with "est une application"', () => {
    const klay = describedAs('KLAY', 'Sportology est une application de sport')
    expect(klay?.value).toBe('Sportology')
    expect(klay?.lane).toBe('inferred')
  })

  test('only the first four capitalised words count', () => {
    expect(describedAs('Zeta', 'Alpha Beta Gamma Delta is a platform')?.value).toBe('Alpha Beta Gamma Delta')
    expect(describedAs('Zeta', 'Alpha Beta Gamma Delta Epsilon is a platform')).toBeNull()
  })

  test('a comma after the subject counts as a marker', () => {
    expect(describedAs('Zeta', 'Sobflous, a mobile app')?.value).toBe('Sobflous')
  })

  test('verb must be a whole word', () => {
    expect(describedAs('Zeta', 'Sobflous isolates payments')).toBeNull()
  })

  test('generic technology terms as subject return null', () => {
    expect(describedAs('Novel-Ti', 'IoT is a growing field ...')).toBeNull()
    expect(describedAs('X Corp', 'AI helps companies ...')).toBeNull()
    expect(describedAs('Agro Plus', 'Blockchain is used ...')).toBeNull()
    expect(describedAs('Data House', 'Big Data est ...')).toBeNull()
  })

  test('a real acronym of the name still works', () => {
    const bws = describedAs('Be Wireless Solutions', 'BWS is a ...')
    expect(bws?.value).toBe('BWS')
    expect(bws?.rule).toBe('alias.acronym')
  })

  test('a real product name still works', () => {
    expect(describedAs('SF Technologies', 'Sobflous is a mobile payment app')?.value).toBe('Sobflous')
  })
})

describe('GENERIC_TERMS', () => {
  test('holds generic technology terms in nameKey form', () => {
    expect(GENERIC_TERMS.has('iot')).toBe(true)
    expect(GENERIC_TERMS.has('bigdata')).toBe(true)
    expect(GENERIC_TERMS.has('sobflous')).toBe(false)
  })
})

describe('emailDomain', () => {
  test('returns the lower-cased domain after @', () => {
    expect(emailDomain('  Info@Envast.TN ')).toBe('envast.tn')
  })

  test('null, empty, n.a., and missing @ return null', () => {
    expect(emailDomain(null)).toBeNull()
    expect(emailDomain('')).toBeNull()
    expect(emailDomain('   ')).toBeNull()
    expect(emailDomain('n.a.')).toBeNull()
    expect(emailDomain('N.A.')).toBeNull()
    expect(emailDomain('no-at-sign.tn')).toBeNull()
    expect(emailDomain('someone@')).toBeNull()
  })
})

describe('FREE_MAILBOXES', () => {
  test('contains the common free providers', () => {
    for (const domain of ['gmail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com',
      'outlook.fr', 'live.com', 'live.fr', 'icloud.com', 'ymail.com', 'protonmail.com', 'proton.me', 'gmx.com',
      'gmx.fr']) {
      expect(FREE_MAILBOXES.has(domain)).toBe(true)
    }
    expect(FREE_MAILBOXES.has('envast.tn')).toBe(false)
  })

  test('contains group, list and shared provider hosts', () => {
    expect(FREE_MAILBOXES.has('googlegroups.com')).toBe(true)
    expect(FREE_MAILBOXES.has('planet.tn')).toBe(true)
  })
})

describe('secondDomain', () => {
  test('email on a different company domain than the website', () => {
    const envast = secondDomain('contact@envast.tn', 'classquiz.tn')
    expect(envast?.value).toBe('envast.tn')
    expect(envast?.lane).toBe('inferred')
    expect(envast?.rule).toBe('alias.email-domain')
    expect(envast?.why).toBe('The email is on envast.tn, the website on classquiz.tn')
    expect(secondDomain('info@one-drone.com', 'one-drone.fr')?.value).toBe('one-drone.com')
  })

  test('free mailbox returns null', () => {
    expect(secondDomain('a@gmail.com', 'x.tn')).toBeNull()
  })

  test('same domain returns null, with or without www. and a path', () => {
    expect(secondDomain('hello@wemove.tn', 'wemove.tn')).toBeNull()
    expect(secondDomain('hello@wemove.tn', 'www.wemove.tn/about')).toBeNull()
  })

  test('subdomain of the website returns null', () => {
    expect(secondDomain('hello@mail.wemove.tn', 'wemove.tn')).toBeNull()
  })

  test('no website gives an email-only reading', () => {
    const only = secondDomain('hello@acme.tn', null)
    expect(only?.value).toBe('acme.tn')
    expect(only?.rule).toBe('alias.email-only')
    expect(only?.why).toBe('No website in the registry; the email is on acme.tn')
  })

  test('no usable email returns null', () => {
    expect(secondDomain(null, 'x.tn')).toBeNull()
    expect(secondDomain('n.a.', 'x.tn')).toBeNull()
  })

  test('group and list mail hosts return null', () => {
    expect(secondDomain('contact@googlegroups.com', 'smartforgreen.com')).toBeNull()
  })

  test('shared Tunisian internet provider mailboxes return null', () => {
    expect(secondDomain('a@planet.tn', 'zolfa.epizy.com')).toBeNull()
    expect(secondDomain('a@topnet.tn', null)).toBeNull()
  })

  test('a company domain on .tn is still returned', () => {
    expect(secondDomain('contact@envast.tn', 'classquiz.tn')?.value).toBe('envast.tn')
  })
})

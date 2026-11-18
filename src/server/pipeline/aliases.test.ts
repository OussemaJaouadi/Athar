import { describe, expect, test } from 'bun:test'
import { describedAs, emailDomain, FREE_MAILBOXES, nameKey, secondDomain } from './aliases'

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
})

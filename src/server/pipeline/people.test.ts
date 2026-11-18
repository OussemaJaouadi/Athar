import { describe, expect, test } from 'bun:test'
import { keyDistance, maybeSamePerson, samePersonAcross, words, type Appearance } from './people'

function ap(startupId: string, over: Partial<Appearance> = {}): Appearance {
  return { startupId, sector: null, creationYear: null, domain: null, cofounders: [], ...over }
}

describe('samePersonAcross', () => {
  test('one appearance is settled as one person', () => {
    const r = samePersonAcross('boudhraa mehdi', [ap('s1')])
    expect(r.value).toBe(true)
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('person.single')
    expect(r.why).toBe('Appears on one startup')
  })

  test('no appearances counts as a single reading', () => {
    expect(samePersonAcross('boudhraa mehdi', []).rule).toBe('person.single')
  })

  test('a shared co-founder corroborates and is named in why', () => {
    const r = samePersonAcross('boudhraa mehdi', [
      ap('s1', { cofounders: ['jaziri ahmed'] }),
      ap('s2', { cofounders: ['jaziri ahmed', 'trabelsi sami'] }),
    ])
    expect(r.value).toBe(true)
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('person.corroborated')
    expect(r.why).toContain('jaziri ahmed')
  })

  test('a shared non-null website corroborates and is named in why', () => {
    const r = samePersonAcross('boudhraa mehdi', [
      ap('s1', { domain: 'acme.tn' }),
      ap('s2', { domain: 'acme.tn' }),
    ])
    expect(r.rule).toBe('person.corroborated')
    expect(r.lane).toBe('rule')
    expect(r.why).toContain('acme.tn')
  })

  test('two null domains do not corroborate', () => {
    const r = samePersonAcross('mohamed ali ben salah', [ap('s1'), ap('s2')])
    expect(r.rule).toBe('person.name-only')
  })

  test('a three-word name with nothing else in common is inferred', () => {
    const r = samePersonAcross('mohamed ali ben salah', [ap('s1'), ap('s2')])
    expect(r.value).toBe(true)
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('person.name-only')
    expect(r.why).toBe('Same full name on 2 startups, nothing else in common')
  })

  test('the name-only count covers every appearance', () => {
    const r = samePersonAcross('mohamed ali ben salah', [ap('s1'), ap('s2'), ap('s3')])
    expect(r.why).toContain('on 3 startups')
  })

  test('a two-word name on unrelated startups goes to review', () => {
    const r = samePersonAcross('khelifi maher', [ap('s1'), ap('s2')])
    expect(r.value).toBe(true)
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('person.short-name-only')
    expect(r.why).toContain('may be two people')
    expect(r.why).toContain('2 unrelated startups')
  })

  test('a one-word name on unrelated startups goes to review', () => {
    const r = samePersonAcross('maher', [ap('s1'), ap('s2'), ap('s3')])
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('person.short-name-only')
    expect(r.why).toContain('3 unrelated startups')
  })
})

describe('words', () => {
  test('splits on spaces and drops empty parts', () => {
    expect(words('  amine  ghazouani ')).toEqual(['amine', 'ghazouani'])
    expect(words('')).toEqual([])
    expect(words('boudhraa')).toEqual(['boudhraa'])
  })
})

describe('keyDistance', () => {
  test('equal keys are same', () => {
    expect(keyDistance('khelifi maher', 'khelifi maher')).toBe('same')
  })

  test('one letter apart, substitution', () => {
    expect(keyDistance('khelifi maher', 'khelifi meher')).toBe('one-letter')
    expect(keyDistance('ali ben salah', 'ali ben saleh')).toBe('one-letter')
    expect(keyDistance('mohamed saadi', 'mohamed saidi')).toBe('one-letter')
  })

  test('one letter apart, insertion or deletion', () => {
    expect(keyDistance('hassen marzouk', 'hassen marzouki')).toBe('one-letter')
    expect(keyDistance('ameur ben yasmine', 'ameur ben yesmine')).toBe('one-letter')
  })

  test('different first names are not alike', () => {
    expect(keyDistance('ali ben salah', 'omar ben salah')).toBe(null)
  })

  test('edit distance of two is not alike', () => {
    expect(keyDistance('khelifi maher', 'khelifi mehr')).toBe(null)
  })

  test('different word counts never count as one letter apart', () => {
    expect(keyDistance('ab cd', 'abcd')).toBe(null)
    expect(keyDistance('abid ali', 'abid alix mohamed')).toBe(null)
  })

  test('contained: every word of the shorter key is in the longer', () => {
    expect(keyDistance('ghazouani mohamed', 'amine ghazouani mohamed')).toBe('contained')
    expect(keyDistance('abid ali', 'abid ali mohamed')).toBe('contained')
  })

  test('contained needs two or more words in the shorter key', () => {
    expect(keyDistance('mohamed', 'mohamed ali')).toBe(null)
  })

  test('is symmetric', () => {
    expect(keyDistance('amine ghazouani mohamed', 'ghazouani mohamed')).toBe('contained')
    expect(keyDistance('meher khelifi', 'maher khelifi')).toBe(keyDistance('maher khelifi', 'meher khelifi'))
    expect(keyDistance('omar ben salah', 'ali ben salah')).toBe(keyDistance('ali ben salah', 'omar ben salah'))
  })
})

describe('maybeSamePerson', () => {
  test('null when keys are not alike or are the same', () => {
    const a = { key: 'ali ben salah', appearances: [ap('s1')] }
    const b = { key: 'omar ben salah', appearances: [ap('s2')] }
    expect(maybeSamePerson(a, b)).toBeNull()
    expect(maybeSamePerson(a, { key: 'ali ben salah', appearances: [ap('s2')] })).toBeNull()
  })

  test('listed together on one startup means two people (siblings)', () => {
    const r = maybeSamePerson(
      { key: 'jihed rahmouni', appearances: [ap('s1')] },
      { key: 'jihen rahmouni', appearances: [ap('s1'), ap('s9')] },
    )
    expect(r?.value).toBe(false)
    expect(r?.lane).toBe('rule')
    expect(r?.rule).toBe('person.listed-together')
    expect(r?.why).toBe('Both names are listed on the same startup, so they are two people')
  })

  test('shared co-founder links them, inferred, co-founder named', () => {
    const r = maybeSamePerson(
      { key: 'khelifi maher', appearances: [ap('s1', { cofounders: ['jaziri ahmed'] })] },
      { key: 'khelifi meher', appearances: [ap('s2', { cofounders: ['jaziri ahmed'] })] },
    )
    expect(r?.value).toBe(true)
    expect(r?.lane).toBe('inferred')
    expect(r?.rule).toBe('person.near-and-linked')
    expect(r?.why).toContain('jaziri ahmed')
  })

  test('shared website links them, inferred, website named', () => {
    const r = maybeSamePerson(
      { key: 'khelifi maher', appearances: [ap('s1', { domain: 'x.tn' })] },
      { key: 'khelifi meher', appearances: [ap('s2', { domain: 'x.tn' })] },
    )
    expect(r?.value).toBe(true)
    expect(r?.lane).toBe('inferred')
    expect(r?.rule).toBe('person.near-and-linked')
    expect(r?.why).toContain('x.tn')
  })

  test('one letter apart with no link goes to review, stays separate', () => {
    const r = maybeSamePerson(
      { key: 'khelifi maher', appearances: [ap('s1')] },
      { key: 'khelifi meher', appearances: [ap('s2')] },
    )
    expect(r?.value).toBe(false)
    expect(r?.lane).toBe('review')
    expect(r?.rule).toBe('person.one-letter-apart')
    expect(r?.why).toContain('khelifi maher')
    expect(r?.why).toContain('khelifi meher')
  })

  test('contained name with no link goes to review, stays separate', () => {
    const r = maybeSamePerson(
      { key: 'ghazouani mohamed', appearances: [ap('s1')] },
      { key: 'amine ghazouani mohamed', appearances: [ap('s2')] },
    )
    expect(r?.value).toBe(false)
    expect(r?.lane).toBe('review')
    expect(r?.rule).toBe('person.name-contained')
    expect(r?.why).toContain('ghazouani mohamed')
    expect(r?.why).toContain('amine ghazouani mohamed')
  })

  test('is symmetric for a linked pair', () => {
    const a = { key: 'khelifi maher', appearances: [ap('s1', { cofounders: ['jaziri ahmed'] })] }
    const b = { key: 'khelifi meher', appearances: [ap('s2', { cofounders: ['jaziri ahmed'] })] }
    expect(maybeSamePerson(a, b)).toEqual(maybeSamePerson(b, a)!)
  })

  test('is symmetric for an unlinked pair', () => {
    const a = { key: 'ghazouani mohamed', appearances: [ap('s1')] }
    const b = { key: 'amine ghazouani mohamed', appearances: [ap('s2')] }
    expect(maybeSamePerson(a, b)).toEqual(maybeSamePerson(b, a)!)
  })
})

import { describe, expect, test } from 'bun:test'
import {
  ALIKE,
  SOMEWHAT_ALIKE,
  SUCCESSOR_GAP_YEARS,
  nameKey,
  order,
  relate,
  type StartupFacts,
} from './relations'

const f = (id: string, over: Partial<StartupFacts> = {}): StartupFacts => ({
  id,
  name: id,
  sector: null,
  creationYear: null,
  domain: null,
  founders: [],
  aliases: [],
  ...over,
})

describe('constants', () => {
  test('thresholds are the agreed values', () => {
    expect(ALIKE).toBe(0.65)
    expect(SOMEWHAT_ALIKE).toBe(0.5)
    expect(SUCCESSOR_GAP_YEARS).toBe(2)
  })
})

describe('nameKey', () => {
  test('lower-cases, strips accents and punctuation', () => {
    expect(nameKey('Hé-llo Wörld!')).toBe('helloworld')
    expect(nameKey('Paypós Tunisie')).toBe('payposTunisie'.toLowerCase())
    expect(nameKey('  ')).toBe('')
  })
  test('keeps digits', () => {
    expect(nameKey('Web 3.0')).toBe('web30')
  })
})

describe('rule 1: same site', () => {
  test('same website is a settled rename', () => {
    const r = relate(f('a', { domain: 'wemove.tn' }), f('b', { domain: 'wemove.tn' }), null)
    expect(r.value).toBe('renamed')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('relation.same-site')
    expect(r.why).toContain('wemove.tn')
  })
  test('different websites do not trigger it', () => {
    const r = relate(f('a', { domain: 'x.tn' }), f('b', { domain: 'y.tn' }), null)
    expect(r.rule).not.toBe('relation.same-site')
    expect(r.value).toBe('unrelated')
  })
  test('same site beats a shared founder and a high similarity', () => {
    const r = relate(
      f('a', { domain: 'x.tn', founders: ['p'] }),
      f('b', { domain: 'x.tn', founders: ['p'] }),
      0.9,
    )
    expect(r.rule).toBe('relation.same-site')
  })
})

describe('rule 2: alias match', () => {
  test('alias of a equals name of b', () => {
    const r = relate(f('a', { aliases: ['Khallasli'] }), f('b', { name: 'khallasli' }), null)
    expect(r.value).toBe('renamed')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('relation.alias')
    expect(r.why).toContain('Khallasli')
  })
  test('alias of b equals name of a (reverse direction)', () => {
    const r = relate(f('a', { name: 'Paypos Tunisie' }), f('b', { aliases: ['paypos-tunisie'] }), null)
    expect(r.rule).toBe('relation.alias')
    expect(r.value).toBe('renamed')
  })
  test('accents and case are ignored', () => {
    const r = relate(f('a', { name: 'Café Ōasis' }), f('b', { aliases: ['CAFE OASIS'] }), null)
    expect(r.rule).toBe('relation.alias')
  })
  test('two startups sharing an alias match', () => {
    const r = relate(f('a', { aliases: ['Mon Café'] }), f('b', { aliases: ['mon-cafe'] }), null)
    expect(r.rule).toBe('relation.alias')
    expect(r.value).toBe('renamed')
  })
  test('no alias overlap means no alias match', () => {
    const r = relate(f('a', { aliases: ['Other'] }), f('b', { name: 'Unrelated' }), null)
    expect(r.rule).not.toBe('relation.alias')
  })
  test('empty alias keys never match', () => {
    const r = relate(f('a', { aliases: ['---'] }), f('b', { aliases: ['!!'] }), null)
    expect(r.rule).toBe('relation.no-founder')
  })
})

describe('rule 3: no founder in common', () => {
  test('disjoint founders are unrelated, settled', () => {
    const r = relate(f('a', { founders: ['p'] }), f('b', { founders: ['q'] }), 0.9)
    expect(r.value).toBe('unrelated')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('relation.no-founder')
    expect(r.why).toContain('0 of 1')
    expect(r.why).toContain('0.90')
  })
  test('null similarity is said in the why', () => {
    const r = relate(f('a'), f('b'), null)
    expect(r.why).toContain('no description to compare')
  })
})

describe('rule 4: same team, same thing', () => {
  test('whole team shared and descriptions alike at the boundary 0.65', () => {
    const r = relate(
      f('a', { founders: ['x', 'y'], creationYear: 2017 }),
      f('b', { founders: ['x', 'y'], creationYear: 2018 }),
      ALIKE,
    )
    expect(r.value).toBe('renamed')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('relation.same-team-same-thing')
    expect(r.why).toContain('2 of 2 founders in common')
    expect(r.why).toContain('0.65')
  })
  test('same team with a gap of 5 years still wins over successor', () => {
    const r = relate(
      f('a', { founders: ['x', 'y'], creationYear: 2010, sector: 'Fintech' }),
      f('b', { founders: ['x', 'y'], creationYear: 2015, sector: 'Fintech' }),
      0.9,
    )
    expect(r.rule).toBe('relation.same-team-same-thing')
  })
  test('similarity just below 0.65 is not alike', () => {
    const r = relate(f('a', { founders: ['x', 'y'] }), f('b', { founders: ['x', 'y'] }), 0.64)
    expect(r.rule).toBe('relation.same-team')
  })
})

describe('rule 5: later venture in the same field', () => {
  test('Paypos Tunisie (2014) and khallasli (2022) are a successor', () => {
    const r = relate(
      f('paypos', { name: 'Paypos Tunisie', sector: 'Fintech', creationYear: 2014, founders: ['x', 'y'] }),
      f('khallasli', { name: 'khallasli', sector: 'Fintech', creationYear: 2022, founders: ['x', 'z'] }),
      0.56,
    )
    expect(r.value).toBe('successor')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('relation.later-same-field')
    expect(r.why).toContain('1 of 2 founders in common')
    expect(r.why).toContain('2014')
    expect(r.why).toContain('2022')
    expect(r.why).toContain('0.56')
  })
  test('gap exactly 2 with the same sector is a successor', () => {
    const r = relate(
      f('a', { sector: 'Fintech', creationYear: 2014, founders: ['x', 'y'] }),
      f('b', { sector: 'Fintech', creationYear: 2016, founders: ['x', 'z'] }),
      null,
    )
    expect(r.rule).toBe('relation.later-same-field')
  })
  test('gap of 1 is not a successor', () => {
    const r = relate(
      f('a', { sector: 'Fintech', creationYear: 2014, founders: ['x', 'y'] }),
      f('b', { sector: 'Fintech', creationYear: 2015, founders: ['x', 'z'] }),
      null,
    )
    expect(r.rule).not.toBe('relation.later-same-field')
    expect(r.rule).toBe('relation.one-founder-same-field')
  })
  test('different sector but similarity exactly 0.5 counts as somewhat alike', () => {
    const r = relate(
      f('a', { sector: 'Fintech', creationYear: 2014, founders: ['x', 'y'] }),
      f('b', { sector: 'Agritech', creationYear: 2020, founders: ['x', 'z'] }),
      SOMEWHAT_ALIKE,
    )
    expect(r.rule).toBe('relation.later-same-field')
    expect(r.value).toBe('successor')
  })
  test('different sector and similarity 0.49 is not a successor', () => {
    const r = relate(
      f('a', { sector: 'Fintech', creationYear: 2014, founders: ['x', 'y'] }),
      f('b', { sector: 'Agritech', creationYear: 2020, founders: ['x', 'z'] }),
      0.49,
    )
    expect(r.rule).not.toBe('relation.later-same-field')
  })
  test('null years cannot make a successor', () => {
    const r = relate(
      f('a', { sector: 'Fintech', creationYear: null, founders: ['x', 'y'] }),
      f('b', { sector: 'Fintech', creationYear: 2022, founders: ['x', 'z'] }),
      0.9,
    )
    expect(r.rule).not.toBe('relation.later-same-field')
  })
})

describe('rule 6: same team, sibling', () => {
  test('KHEER (2018) and SOLIXY (2017) share all three founders', () => {
    const r = relate(
      f('kheer', { name: 'KHEER', sector: 'Agritech', creationYear: 2018, founders: ['p', 'q', 'r'] }),
      f('solixy', { name: 'SOLIXY', sector: 'Business Software', creationYear: 2017, founders: ['p', 'q', 'r'] }),
      0.48,
    )
    expect(r.value).toBe('sibling')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('relation.same-team')
    expect(r.why).toContain('3 of 3 founders in common')
    expect(r.why).toContain('0.48')
  })
})

describe('rule 7: several founders overlap', () => {
  test('two of three founders shared, not the whole team', () => {
    const r = relate(
      f('a', { sector: 'A', founders: ['x', 'y', 'z'] }),
      f('b', { sector: 'B', founders: ['x', 'y', 'w'] }),
      0.2,
    )
    expect(r.value).toBe('sibling')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('relation.several-founders')
    expect(r.why).toContain('2 of 3 founders in common')
  })
})

describe('rule 8: one founder, same field', () => {
  test('one shared founder and the same sector is a review sibling', () => {
    const r = relate(
      f('a', { sector: 'Fintech', creationYear: 2016, founders: ['x', 'y'] }),
      f('b', { sector: 'Fintech', creationYear: 2016, founders: ['x', 'z'] }),
      null,
    )
    expect(r.value).toBe('sibling')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('relation.one-founder-same-field')
  })
  test('one shared founder and similarity exactly 0.5 with other sectors', () => {
    const r = relate(
      f('a', { sector: 'A', creationYear: 2016, founders: ['x', 'y'] }),
      f('b', { sector: 'B', creationYear: 2016, founders: ['x', 'z'] }),
      0.5,
    )
    expect(r.rule).toBe('relation.one-founder-same-field')
    expect(r.why).toContain('0.50')
  })
})

describe('rule 9: one founder only', () => {
  test('fixiha.tn and LIFEYE: one shared founder name, unrelated fields, review', () => {
    const r = relate(
      f('fixiha', { name: 'fixiha.tn', sector: 'Commerce', creationYear: 2016, founders: ['ahmed ben said', 'f2'] }),
      f('lifeye', { name: 'LIFEYE', sector: 'Agritech', creationYear: 2018, founders: ['ahmed ben said', 'k'] }),
      0.31,
    )
    expect(r.value).toBe('unrelated')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('relation.one-founder-only')
    expect(r.why).toContain('namesake')
    expect(r.why).toContain('0.31')
    expect(r.why).toContain('1 of 2 founders in common')
  })
  test('null similarity with different sectors falls here when one founder is shared', () => {
    const r = relate(
      f('a', { sector: 'A', founders: ['x', 'q'] }),
      f('b', { sector: 'B', founders: ['x', 'y'] }),
      null,
    )
    expect(r.rule).toBe('relation.one-founder-only')
    expect(r.why).toContain('no description to compare')
  })
})

describe('null years and null similarity', () => {
  test('null similarity with the same team gives a sibling by team', () => {
    const r = relate(f('a', { founders: ['x', 'y'] }), f('b', { founders: ['x', 'y'] }), null)
    expect(r.rule).toBe('relation.same-team')
    expect(r.why).toContain('founding years unknown')
  })
})

describe('order', () => {
  test('earlier creation year comes first', () => {
    const a = f('a', { creationYear: 2022 })
    const b = f('b', { creationYear: 2014 })
    const [first, second] = order(a, b)
    expect(first.id).toBe('b')
    expect(second.id).toBe('a')
  })
  test('a known year comes before an unknown one', () => {
    const [first] = order(f('a', { creationYear: null }), f('b', { creationYear: 2099 }))
    expect(first.id).toBe('b')
    const [first2] = order(f('c', { creationYear: 2099 }), f('d', { creationYear: null }))
    expect(first2.id).toBe('c')
  })
  test('ties are broken by id', () => {
    expect(order(f('z', { creationYear: 2000 }), f('m', { creationYear: 2000 }))[0].id).toBe('m')
    expect(order(f('m', { creationYear: null }), f('z', { creationYear: null }))[0].id).toBe('m')
  })
})

describe('a team of one is only one name', () => {
  test('one shared founder on two one-founder startups is not the same team', () => {
    const r = relate(f('a', { founders: ['x'], sector: 'Fintech' }), f('b', { founders: ['x'], sector: 'Agritech' }), 0.3)
    expect(r.rule).toBe('relation.one-founder-only')
    expect(r.lane).toBe('review')
  })
})

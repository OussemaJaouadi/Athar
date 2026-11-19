import { describe, expect, test } from 'bun:test'

import { clampPage, clampSize, parseEntity, parseSize, personListRow } from './archive'

describe('page size', () => {
  test('only 20, 50 and 100 are served, and never more', () => {
    expect(clampSize(20)).toBe(20)
    expect(clampSize('50')).toBe(50)
    expect(clampSize(100)).toBe(100)
    expect(clampSize(5000)).toBe(100)
    expect(clampSize('99999')).toBe(100)
    expect(clampSize(21)).toBe(50)
    expect(clampSize(1)).toBe(20)
  })
  test('nonsense is the default', () => {
    for (const v of [undefined, null, '', 'abc', -5, 0, NaN, {}]) expect(clampSize(v)).toBe(20)
  })
  test('the URL keeps only a size that differs from the default', () => {
    expect(parseSize(undefined)).toBeUndefined()
    expect(parseSize('20')).toBeUndefined()
    expect(parseSize('50')).toBe(50)
    expect(parseSize('5000')).toBe(100)
  })
})

describe('page number', () => {
  test('stays between 1 and the last page', () => {
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(-3, 5)).toBe(1)
    expect(clampPage(9, 5)).toBe(5)
    expect(clampPage('3', 5)).toBe(3)
    expect(clampPage('x', 5)).toBe(1)
    expect(clampPage(2.9, 5)).toBe(2)
    expect(clampPage(4, 0)).toBe(1)
  })
})

describe('entity', () => {
  test('defaults to startups', () => {
    expect(parseEntity('people')).toBe('people')
    expect(parseEntity('years')).toBe('years')
    expect(parseEntity('nope')).toBe('startups')
    expect(parseEntity(undefined)).toBe('startups')
  })
})

describe('people list row', () => {
  const p = { slug: 'a-b', name: 'A B', spellings: ['A  B'], startups: [{ labelled: '2022-05' }, { labelled: '2019-01' }, { labelled: '2022-11' }, { labelled: null }] }
  test('years are distinct and oldest first', () => {
    const r = personListRow(p, true)
    expect(r.years).toEqual(['2019', '2022'])
    expect(r.startups).toBe(4)
    expect(r.spellings).toBe(1)
    expect(r.unconfirmed).toBe(true)
  })
  test('a name on one startup is never unconfirmed', () => {
    expect(personListRow({ ...p, startups: [{ labelled: '2020-01' }] }, true).unconfirmed).toBe(false)
  })
})

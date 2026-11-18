import { describe, expect, test } from 'bun:test'

import { readFounderItem, readFounders } from './founder-field'

describe('readFounderItem: blanks and placeholders', () => {
  test.each(['', '   ', 'n.a.', 'n.a', 'na', '-', '--', '.'])('"%s" gives no names', published => {
    const result = readFounderItem(published)
    expect(result.value).toEqual([])
    expect(result.lane).toBe('rule')
    expect(result.rule).toBe('founder.blank')
  })
})

describe('readFounderItem: splitting several people in one item', () => {
  test('dash-joined names split into four', () => {
    const result = readFounderItem('Omar Kennou-Ali Frad-Mohamed Guirat-Nada Hadrich')
    expect(result.value).toEqual(['Omar Kennou', 'Ali Frad', 'Mohamed Guirat', 'Nada Hadrich'])
    expect(result.lane).toBe('inferred')
    expect(result.rule).toBe('founder.split')
    expect(result.why).toBe('One item held 4 names joined by "-"')
  })

  test('et joins two names', () => {
    const result = readFounderItem('Sami Trabelsi et Leila Gharbi')
    expect(result.value).toEqual(['Sami Trabelsi', 'Leila Gharbi'])
    expect(result.lane).toBe('inferred')
    expect(result.rule).toBe('founder.split')
  })

  test('comma joins two names', () => {
    expect(readFounderItem('Ali Ben Salah, Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('slash with spaces joins names', () => {
    expect(readFounderItem('Ali Ben Salah / Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('slash without spaces joins names', () => {
    expect(readFounderItem('Ali Ben Salah/Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('semicolon joins names', () => {
    expect(readFounderItem('Ali Ben Salah; Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('ampersand joins names', () => {
    expect(readFounderItem('Ali Ben Salah & Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('and joins names', () => {
    expect(readFounderItem('Ali Ben Salah and Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('spaced dash joins names', () => {
    expect(readFounderItem('Ali Ben Salah - Sara Mansour').value).toEqual(['Ali Ben Salah', 'Sara Mansour'])
  })

  test('a split with a one-word part is refused', () => {
    const result = readFounderItem('Jean-Pierre Dupont')
    expect(result.value).toEqual(['Jean-Pierre Dupont'])
    expect(result.rule).toBe('founder.kept')
  })

  test('Amira Ben-Salah is kept whole', () => {
    expect(readFounderItem('Amira Ben-Salah').value).toEqual(['Amira Ben-Salah'])
    expect(readFounderItem('Amira Ben-Salah').rule).toBe('founder.kept')
  })

  test('Mohamed El-Amri is kept whole', () => {
    expect(readFounderItem('Mohamed El-Amri').value).toEqual(['Mohamed El-Amri'])
    expect(readFounderItem('Mohamed El-Amri').rule).toBe('founder.kept')
  })
})

describe('readFounderItem: glued words', () => {
  test('HoucineJhimi is split at the capital', () => {
    const result = readFounderItem('HoucineJhimi')
    expect(result.value).toEqual(['Houcine Jhimi'])
    expect(result.lane).toBe('inferred')
    expect(result.rule).toBe('founder.unglued')
  })

  test('McDonald is not split and goes to one-word review', () => {
    const result = readFounderItem('McDonald')
    expect(result.value).toEqual(['McDonald'])
    expect(result.lane).toBe('review')
    expect(result.rule).toBe('founder.one-word')
  })

  test('LeBon keeps its short remainder whole', () => {
    expect(readFounderItem('LeBon').rule).toBe('founder.one-word')
  })
})

describe('readFounderItem: one word and not-a-name', () => {
  test('a single word goes to review', () => {
    const result = readFounderItem('Jacques')
    expect(result.value).toEqual(['Jacques'])
    expect(result.lane).toBe('review')
    expect(result.rule).toBe('founder.one-word')
    expect(result.why).toBe('Only one word; it may be a first name or a surname')
  })

  test('text with a digit goes to not-a-name review', () => {
    const result = readFounderItem('Ahmed 2')
    expect(result.value).toEqual(['Ahmed 2'])
    expect(result.lane).toBe('review')
    expect(result.rule).toBe('founder.not-a-name')
  })

  test('text with an @ goes to not-a-name review', () => {
    const result = readFounderItem('Sami @startup')
    expect(result.lane).toBe('review')
    expect(result.rule).toBe('founder.not-a-name')
  })

  test('text with http goes to not-a-name review', () => {
    expect(readFounderItem('Ali http://x.tn').rule).toBe('founder.not-a-name')
  })
})

describe('readFounderItem: normal names and tidying', () => {
  test('a normal name is kept as published', () => {
    const result = readFounderItem('Hadhami Rjiba')
    expect(result.value).toEqual(['Hadhami Rjiba'])
    expect(result.lane).toBe('rule')
    expect(result.rule).toBe('founder.kept')
    expect(result.why).toBe('Kept as published')
  })

  test('extra spaces are collapsed and casing is left alone', () => {
    const result = readFounderItem('  Luay   BEN ALI ')
    expect(result.value).toEqual(['Luay BEN ALI'])
    expect(result.lane).toBe('rule')
  })
})

describe('readFounders', () => {
  test('a normal list of three names keeps all three in order', () => {
    const result = readFounders(['Hadhami Rjiba', 'Rayen Cherni', 'Sami Trabelsi'])
    expect(result.names).toEqual(['Hadhami Rjiba', 'Rayen Cherni', 'Sami Trabelsi'])
    expect(result.readings).toHaveLength(3)
    expect(result.readings.map(r => r.lane)).toEqual(['rule', 'rule', 'rule'])
  })

  test('repeated names are removed case-insensitively, keeping the first spelling', () => {
    const result = readFounders(['Mehdi Boudhraa', 'mehdi boudhraa'])
    expect(result.names).toEqual(['Mehdi Boudhraa'])
    expect(result.readings).toHaveLength(2)
  })

  test('names from split items are concatenated in order and deduplicated', () => {
    const result = readFounders(['Sami Trabelsi et Leila Gharbi', 'Leila  gharbi', 'Ali Ben Salah'])
    expect(result.names).toEqual(['Sami Trabelsi', 'Leila Gharbi', 'Ali Ben Salah'])
  })

  test('placeholders contribute no names but keep a reading', () => {
    const result = readFounders(['n.a.', 'Rayen Cherni'])
    expect(result.names).toEqual(['Rayen Cherni'])
    expect(result.readings[0]!.rule).toBe('founder.blank')
    expect(result.readings).toHaveLength(2)
  })

  test('an empty list gives no names and no readings', () => {
    expect(readFounders([])).toEqual({ names: [], readings: [] })
  })
})

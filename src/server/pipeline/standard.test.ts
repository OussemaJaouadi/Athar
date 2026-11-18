import { describe, expect, test } from 'bun:test'

import { standardName, standardPersonName, tidy } from './standard'

describe('tidy', () => {
  test('trims, turns tabs and non-breaking spaces into spaces, and collapses runs', () => {
    expect(tidy('  Tiktak\tPRO\t')).toBe('Tiktak PRO')
    expect(tidy('VENARI SECURITY\n\nTUNISIA')).toBe('VENARI SECURITY TUNISIA')
    expect(tidy('VENARI SECURITY  TUNISIA')).toBe('VENARI SECURITY TUNISIA')
  })
})

describe('standardName: legal forms', () => {
  test('removes a trailing legal form and returns it in upper case', () => {
    const result = standardName('Smart Med SA')
    expect(result.display.value).toBe('Smart Med')
    expect(result.legalForm).toBe('SA')
    expect(result.acronym).toBeNull()
  })

  test('accepts dotted legal forms', () => {
    const result = standardName('Actifs Précieux Apex S.A')
    expect(result.display.value).toBe('Actifs Précieux Apex')
    expect(result.legalForm).toBe('SA')
    expect(result.display.rule).toBe('name.tidied')
  })

  test('removes SARL from an all-caps base and casing applies to what remains', () => {
    const result = standardName('SAFOZI SARL')
    expect(result.legalForm).toBe('SARL')
    expect(result.display.value).toBe('Safozi')
    expect(result.display.lane).toBe('inferred')
  })

  test('a name that is only a legal form is kept', () => {
    const result = standardName('SARL')
    expect(result.display.value).toBe('SARL')
    expect(result.legalForm).toBeNull()
    expect(result.display.lane).toBe('rule')
    expect(result.display.rule).toBe('name.kept')
  })
})

describe('standardName: acronyms', () => {
  test('moves a trailing acronym in brackets out of the display', () => {
    const result = standardName('Services voitures épaves (SVE)')
    expect(result.display.value).toBe('Services voitures épaves')
    expect(result.acronym).toBe('SVE')
    expect(result.display.rule).toBe('name.tidied')
  })

  test('leaves brackets with lower case text untouched', () => {
    const result = standardName('Elevage des insectes (nutri-protéine)')
    expect(result.display.value).toBe('Elevage des insectes (nutri-protéine)')
    expect(result.acronym).toBeNull()
    expect(result.display.rule).toBe('name.kept')
  })

  test('does not read a year in brackets as an acronym', () => {
    expect(standardName('Forum (2024)').acronym).toBeNull()
  })
})

describe('standardName: casing', () => {
  test('converts an all-caps multi-word name to title case', () => {
    const result = standardName('VENARI SECURITY TUNISIA')
    expect(result.display.value).toBe('Venari Security Tunisia')
    expect(result.display.lane).toBe('inferred')
    expect(result.display.rule).toBe('name.caps')
    expect(result.display.why).toBe('Published in capitals as "VENARI SECURITY TUNISIA"')
  })

  test('collapses double spaces before casing', () => {
    expect(standardName('VENARI SECURITY  TUNISIA').display.value).toBe('Venari Security Tunisia')
  })

  test('title-cases a long single all-caps word', () => {
    expect(standardName('LIFEYE').display.value).toBe('Lifeye')
    expect(standardName('ACRIDIDEA').display.value).toBe('Acrididea')
  })

  test('keeps short all-caps single words as published', () => {
    for (const name of ['GST', 'KHEER', 'MAZED', 'DCX']) {
      const result = standardName(name)
      expect(result.display.value).toBe(name)
      expect(result.display.lane).toBe('rule')
      expect(result.display.rule).toBe('name.kept')
    }
  })

  test('leaves names that are not all caps alone', () => {
    expect(standardName('STE Kaoun').display.value).toBe('STE Kaoun')
    expect(standardName('groupado').display.value).toBe('groupado')
    expect(standardName('auto-plus').display.value).toBe('auto-plus')
    expect(standardName('moudda.com').display.value).toBe('moudda.com')
    expect(standardName('Tiktak PRO').display.value).toBe('Tiktak PRO')
  })

  test('title-cases accented capitals with locale-safe handling', () => {
    expect(standardName('ÉCOLE VERTE').display.value).toBe('École Verte')
  })

  test('keeps small words lower case after the first word', () => {
    expect(standardName('MAISON DE LA DATA').display.value).toBe('Maison de la Data')
    expect(standardName('CREATIVE CULINARY').display.value).toBe('Creative Culinary')
  })
})

describe('standardName: tidying only', () => {
  test('stray tabs at the end mark the name as tidied, not as caps', () => {
    const result = standardName('Tiktak PRO\t')
    expect(result.display.value).toBe('Tiktak PRO')
    expect(result.display.rule).toBe('name.tidied')
    expect(result.display.why).toBe('Removed stray spaces')
  })

  test('a name with nothing to change is kept', () => {
    const result = standardName('Zeidoun Meksi')
    expect(result.display.value).toBe('Zeidoun Meksi')
    expect(result.display.rule).toBe('name.kept')
    expect(result.display.why).toBe('Kept as published')
  })
})

describe('standardPersonName', () => {
  test('capitalises upper-case words', () => {
    expect(standardPersonName('Luay BEN ALI')).toMatchObject({ value: 'Luay Ben Ali', lane: 'rule', rule: 'person.casing' })
    expect(standardPersonName('Mehdi BOUDHRAA').value).toBe('Mehdi Boudhraa')
  })

  test('capitalises an all-lower-case name', () => {
    expect(standardPersonName('jlassi wael').value).toBe('Jlassi Wael')
    expect(standardPersonName('jannet kamoun').value).toBe('Jannet Kamoun')
  })

  test('handles hyphens and apostrophes inside a word', () => {
    expect(standardPersonName('EL-AMRI').value).toBe('El-Amri')
    expect(standardPersonName("o'brien").value).toBe("O'Brien")
  })

  test('leaves mixed-case words and unchanged names alone', () => {
    expect(standardPersonName('Zeidoun Meksi')).toMatchObject({ value: 'Zeidoun Meksi', rule: 'person.kept' })
    expect(standardPersonName('Jean McDonald').value).toBe('Jean McDonald')
  })

  test('tidies before casing and never reorders words', () => {
    expect(standardPersonName('  Ali\tBEN  ').value).toBe('Ali Ben')
  })
})

describe('corrections from the real registry names', () => {
  test('a possessive after an apostrophe stays lower case', () => {
    expect(standardName("SMEK'S FOOD").display.value).toBe("Smek's Food")
  })
  test('a small word that opens the name is capitalised, not left in capitals', () => {
    expect(standardName('LA MAISON VERTE').display.value).toBe('La Maison Verte')
  })
})

import { describe, expect, test } from 'bun:test'
import { countByKind, countByLane, derive, type DeriveInput, type DeriveStartup } from './derive'
import { pairSubject, type StoredReading } from './readings'

const startups: DeriveStartup[] = [
  {
    id: 'st-01',
    name: 'VENARI SECURITY TUNISIA',
    description: 'Venari est une société de cybersécurité',
    sector: 'Cybersécurité',
    creationYear: 2017,
    domain: 'venari.tn',
    email: null,
  },
  {
    id: 'st-02',
    name: 'Smart Med SA',
    description: 'Med.tn est une plateforme de santé',
    sector: 'Santé',
    creationYear: 2018,
    domain: 'med.tn',
    email: null,
  },
  {
    id: 'st-03',
    name: 'Services voitures épaves (SVE)',
    description: 'Démolition et recyclage de véhicules',
    sector: 'Environnement',
    creationYear: 2015,
    domain: null,
    email: null,
  },
  {
    id: 'st-04',
    name: 'ClassQuiz',
    description: "Plateforme d'apprentissage en ligne",
    sector: 'Éducation',
    creationYear: 2020,
    domain: 'classquiz.tn',
    email: 'contact@envast.tn',
  },
  {
    id: 'st-05',
    name: 'Ecoline',
    description: null,
    sector: 'Agriculture',
    creationYear: 2021,
    domain: 'ecoline.tn',
    email: null,
  },
  {
    id: 'st-06',
    name: 'Agrinov',
    description: 'Agrinov développe des capteurs agricoles',
    sector: 'Agritech',
    creationYear: 2022,
    domain: 'agrinov.tn',
    email: null,
  },
  {
    id: 'st-07',
    name: 'Nomadia',
    description: 'Nomadia est une application de voyage',
    sector: 'Tourisme',
    creationYear: 2023,
    domain: 'nomadia.tn',
    email: null,
  },
  {
    id: 'st-08',
    name: 'Zitouna Labs',
    description: null,
    sector: 'Logiciel',
    creationYear: 2024,
    domain: 'zitouna-labs.tn',
    email: null,
  },
]

const founder = (startupId: string, position: number, name: string, personKey: string) => ({
  startupId,
  position,
  name,
  personKey,
})

const founders = [
  founder('st-01', 0, 'Ahmed Mansour', 'ahmed mansour'),
  founder('st-01', 1, 'Rim Hamdi', 'hamdi rim'),
  founder('st-02', 0, 'Ahmed Mansour', 'ahmed mansour'),
  founder('st-02', 1, 'Rim Hamdi', 'hamdi rim'),
  founder('st-03', 0, 'Luay BEN ALI', 'ali ben luay'),
  founder('st-04', 0, 'Asma Jebali', 'asma jebali'),
  founder('st-05', 0, 'Maher Khelifi', 'khelifi maher'),
  founder('st-05', 1, 'Jihed Rahmouni', 'jihed rahmouni'),
  founder('st-05', 2, 'Jihen Rahmouni', 'jihen rahmouni'),
  founder('st-06', 0, 'Meher Khelifi', 'khelifi meher'),
  founder('st-07', 0, 'Nour Trabelsi', 'nour trabelsi'),
  founder('st-08', 0, 'Nour TRABELSI', 'nour trabelsi'),
  founder('st-08', 1, 'Lina Gharbi', 'gharbi lina'),
]

const SIMILARITIES: Record<string, number> = {
  'st-01|st-02': 0.48,
  'st-07|st-08': 0.1,
}

const similarity = (a: string, b: string): number | null => SIMILARITIES[[a, b].sort().join('|')] ?? null

const fixture: DeriveInput = { startups, founders, similarity }

const readings = derive(fixture)
const byId = new Map<string, StoredReading>(readings.map((r) => [r.id, r]))
const get = (id: string): StoredReading => {
  const r = byId.get(id)
  if (r === undefined) throw new Error(`no reading ${id}`)
  return r
}
const idsOf = (kind: string) => readings.filter((r) => r.kind === kind).map((r) => r.id)

describe('derive: fixture coverage', () => {
  test('produces 15 readings in six sections, in order', () => {
    expect(readings.length).toBe(15)
    const firstSeen: string[] = []
    for (const r of readings) if (!firstSeen.includes(r.kind)) firstSeen.push(r.kind)
    expect(firstSeen).toEqual(['name', 'alias', 'founder', 'person', 'person_pair', 'relation'])
  })

  test('counts by kind', () => {
    expect(countByKind(readings)).toEqual({ name: 3, alias: 3, founder: 2, person: 3, person_pair: 2, relation: 2 })
  })

  test('counts by lane', () => {
    expect(countByLane(readings)).toEqual({ rule: 8, inferred: 4, review: 3 })
  })

  test('counts sum to the total', () => {
    const byKind = Object.values(countByKind(readings)).reduce((a, b) => a + b, 0)
    const byLane = Object.values(countByLane(readings)).reduce((a, b) => a + b, 0)
    expect(byKind).toBe(readings.length)
    expect(byLane).toBe(readings.length)
  })

  test('ids are unique', () => {
    expect(new Set(readings.map((r) => r.id)).size).toBe(readings.length)
  })

  test('is deterministic', () => {
    expect(derive(fixture)).toEqual(readings)
  })

  test('every basis is a 16-character hex hash', () => {
    for (const r of readings) expect(r.basis).toMatch(/^[0-9a-f]{16}$/)
  })

  test('every id starts with its kind and subject', () => {
    for (const r of readings) expect(r.id.startsWith(`${r.kind}:${r.subject}`)).toBe(true)
  })

  test('empty input gives no readings', () => {
    expect(derive({ startups: [], founders: [], similarity: () => null })).toEqual([])
  })
})

describe('derive: names', () => {
  test('a kept name produces no name reading', () => {
    expect(idsOf('name').map((id) => get(id).subject)).toEqual(['st-01', 'st-02', 'st-03'])
    for (const id of ['st-04', 'st-05', 'st-06', 'st-07', 'st-08']) {
      expect(byId.has(`name:${id}`)).toBe(false)
    }
  })

  test('VENARI SECURITY TUNISIA is a name.caps reading, inferred', () => {
    const r = get('name:st-01')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('name.caps')
    expect(r.value).toEqual({ display: 'Venari Security Tunisia', legalForm: null, acronym: null })
  })

  test('Smart Med SA is tidied with legal form SA, rule lane', () => {
    const r = get('name:st-02')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('name.tidied')
    expect(r.value).toEqual({ display: 'Smart Med', legalForm: 'SA', acronym: null })
  })

  test('the acronym in the name is removed and kept', () => {
    const r = get('name:st-03')
    expect(r.lane).toBe('rule')
    expect(r.value).toEqual({ display: 'Services voitures épaves', legalForm: null, acronym: 'SVE' })
  })
})

describe('derive: aliases', () => {
  test('alias of Smart Med from the description', () => {
    const r = get('alias:st-02:medtn')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('alias.described-as')
    expect(r.value).toEqual({ name: 'Med.tn', source: 'description' })
  })

  test('alias SVE from the name acronym', () => {
    const r = get('alias:st-03:sve')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('alias.name-acronym')
    expect(r.value).toEqual({ name: 'SVE', source: 'name' })
  })

  test('alias from an email on another domain', () => {
    const r = get('alias:st-04:envasttn')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('alias.email-domain')
    expect(r.value).toEqual({ name: 'envast.tn', source: 'email' })
  })

  test('no alias for a description that repeats the name', () => {
    expect(idsOf('alias').every((id) => !id.startsWith('alias:st-01') && !id.startsWith('alias:st-07'))).toBe(true)
  })

  test('the alias list is exactly three', () => {
    expect(idsOf('alias').sort()).toEqual(['alias:st-02:medtn', 'alias:st-03:sve', 'alias:st-04:envasttn'])
  })

  test('an alias equal to the startup name is skipped', () => {
    const out = derive({
      startups: [{ ...startups[0], id: 'x', name: 'Acme', description: 'Acme est une société' }],
      founders: [],
      similarity: () => null,
    })
    expect(out).toEqual([])
  })

  test('a description naming the same thing as the acronym adds no second alias', () => {
    const out = derive({
      startups: [
        {
          id: 'y',
          name: 'Foo Labs (FL)',
          description: 'Fl est une application',
          sector: null,
          creationYear: null,
          domain: null,
          email: null,
        },
      ],
      founders: [],
      similarity: () => null,
    })
    const aliases = out.filter((r) => r.kind === 'alias')
    expect(aliases.map((r) => r.id)).toEqual(['alias:y:fl'])
  })
})

describe('derive: founder display names', () => {
  test('a casing change gives a founder reading', () => {
    const r = get('founder:st-03#0')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('person.casing')
    expect(r.value).toEqual({ display: 'Luay Ben Ali' })
  })

  test('an all-caps surname on a second startup gives its own reading', () => {
    expect(get('founder:st-08#0').value).toEqual({ display: 'Nour Trabelsi' })
  })

  test('names already in standard form give no reading', () => {
    expect(idsOf('founder')).toEqual(['founder:st-03#0', 'founder:st-08#0'])
  })
})

describe('derive: people on several startups', () => {
  test('two shared co-founders corroborate a person', () => {
    const r = get('person:ahmed mansour')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('person.corroborated')
    expect(r.value).toEqual({ same: true, startups: ['st-01', 'st-02'] })
  })

  test('the second shared key is also corroborated', () => {
    const r = get('person:hamdi rim')
    expect(r.lane).toBe('rule')
    expect(r.value).toEqual({ same: true, startups: ['st-01', 'st-02'] })
  })

  test('a two-word key on unrelated startups is a review', () => {
    const r = get('person:nour trabelsi')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('person.short-name-only')
    expect(r.value).toEqual({ same: true, startups: ['st-07', 'st-08'] })
  })

  test('a person listed twice on one startup counts once', () => {
    const out = derive({
      startups: [startups[0]],
      founders: [founder('st-01', 0, 'Ali Ben Salah', 'ali salah'), founder('st-01', 1, 'Ali Ben Salah', 'ali salah')],
      similarity: () => null,
    })
    expect(out.filter((r) => r.kind === 'person')).toEqual([])
  })
})

describe('derive: look-alike person keys', () => {
  test('one letter apart on different startups is a review', () => {
    const r = get('person_pair:khelifi maher|khelifi meher')
    expect(r.kind).toBe('person_pair')
    expect(r.subject).toBe('khelifi maher|khelifi meher')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('person.one-letter-apart')
    expect(r.value).toEqual({ same: false, keys: ['khelifi maher', 'khelifi meher'] })
  })

  test('one letter apart on the same startup is two people', () => {
    const r = get('person_pair:jihed rahmouni|jihen rahmouni')
    expect(r.lane).toBe('rule')
    expect(r.rule).toBe('person.listed-together')
    expect(r.value).toEqual({ same: false, keys: ['jihed rahmouni', 'jihen rahmouni'] })
  })

  test('pairs are only listed once and by sorted subject', () => {
    expect(idsOf('person_pair').sort()).toEqual([
      'person_pair:jihed rahmouni|jihen rahmouni',
      'person_pair:khelifi maher|khelifi meher',
    ])
  })

  test('pairSubject is order-independent', () => {
    expect(pairSubject('b', 'a')).toBe('a|b')
  })
})

describe('derive: relations', () => {
  test('two shared founders make a sibling, inferred', () => {
    const r = get('relation:st-01|st-02')
    expect(r.lane).toBe('inferred')
    expect(r.rule).toBe('relation.same-team')
    expect(r.value).toEqual({ relation: 'sibling', shared: 2, similarity: 0.48 })
  })

  test('one shared founder with nothing else is unrelated, review', () => {
    const r = get('relation:st-07|st-08')
    expect(r.lane).toBe('review')
    expect(r.rule).toBe('relation.one-founder-only')
    expect(r.value).toEqual({ relation: 'unrelated', shared: 1, similarity: 0.1 })
  })

  test('startups sharing no key get no relation', () => {
    expect(idsOf('relation').sort()).toEqual(['relation:st-01|st-02', 'relation:st-07|st-08'])
  })

  test('an unknown similarity is recorded as null', () => {
    const out = derive({ ...fixture, similarity: () => null })
    const sibling = out.find((r) => r.id === 'relation:st-01|st-02')
    expect(sibling?.value).toEqual({ relation: 'sibling', shared: 2, similarity: null })
  })

  test('the relation subject is sorted', () => {
    expect(get('relation:st-01|st-02').subject).toBe('st-01|st-02')
  })
})

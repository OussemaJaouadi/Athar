import { describe, expect, test } from 'bun:test'

import { OPERATIONS, getOperation } from './operations'

describe('operations', () => {
  test('ids are unique', () => {
    const ids = OPERATIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  test('every operation has a step', () => {
    for (const o of OPERATIONS) expect(o.steps.length).toBeGreaterThan(0)
  })
  test('Run everything goes through Collect, Build, Check and Embed in that order, without Prepare', () => {
    const all = getOperation('all')
    expect(all?.label).toBe('Run everything')
    expect(all?.steps.map((s) => s.name)).toEqual(['collect', 'build', 'check', 'embed'])
    expect(all?.description).toContain('Prepare')
  })
})

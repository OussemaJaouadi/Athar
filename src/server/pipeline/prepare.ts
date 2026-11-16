import type { Step } from './types'

// Prepare: one AI call per startup to detect language, translate and remove marketing claims.
// Wired into the runner; the AI call itself is the next slice.
export const prepare: Step = {
  name: 'prepare',
  label: 'Clean descriptions with AI',
  run({ db }) {
    const key = db.query<{ id: string }, []>("SELECT id FROM ai_keys WHERE status = 'active' LIMIT 1").get()
    if (!key) throw new Error('Prepare needs an AI key: add one under Keys')
    return { itemsIn: 0, itemsOut: 0, message: 'Not built yet', skipped: true }
  },
}

import { build } from './build'
import { collect } from './collect'
import { embed } from './embed'
import { prepare } from './prepare'
import type { Operation } from './types'

export const OPERATIONS: Operation[] = [
  {
    id: 'collect',
    label: 'Collect',
    description: 'Download the registry, keep every distinct row, and rebuild the startups from them.',
    steps: [collect, build],
  },
  { id: 'prepare', label: 'Prepare', description: 'Clean descriptions with your AI key before embedding.', steps: [prepare] },
  { id: 'embed', label: 'Embed', description: 'Embed every startup locally for search and idea checks.', steps: [embed] },
]

export const getOperation = (id: string) => OPERATIONS.find((o) => o.id === id)

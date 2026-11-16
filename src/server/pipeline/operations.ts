import { clean } from './clean'
import { collect } from './collect'
import { embed } from './embed'
import { merge } from './merge'
import { prepare } from './prepare'
import type { Operation } from './types'

export const OPERATIONS: Operation[] = [
  {
    id: 'collect',
    label: 'Collect',
    description: 'Download the registry, normalize every row and match rows to startups.',
    steps: [collect, clean, merge],
  },
  { id: 'prepare', label: 'Prepare', description: 'Clean descriptions with your AI key before embedding.', steps: [prepare] },
  { id: 'embed', label: 'Embed', description: 'Embed every startup locally for search and idea checks.', steps: [embed] },
]

export const getOperation = (id: string) => OPERATIONS.find((o) => o.id === id)

import { build } from './build'
import { check } from './check'
import { collect } from './collect'
import { embed } from './embed'
import { prepare } from './prepare'
import type { Operation } from './types'

// Each operation can be run on its own. Only Prepare needs an AI key; nothing else leaves this machine
// except the registry download and the website requests.
export const OPERATIONS: Operation[] = [
  {
    id: 'collect',
    label: 'Collect',
    description: 'Download the registry, keep every distinct row, and rebuild the startups from them.',
    steps: [collect, build],
  },
  { id: 'rebuild', label: 'Rebuild', description: 'Rebuild the startups from the rows already collected, without downloading.', steps: [build] },
  { id: 'check', label: 'Check websites', description: 'Ask each startup website whether it answers. Takes about five minutes.', steps: [check] },
  { id: 'prepare', label: 'Prepare', description: 'Rewrite each description as one plain English statement with your AI key. Optional.', steps: [prepare] },
  { id: 'embed', label: 'Embed', description: 'Embed every described startup on this machine for the idea check.', steps: [embed] },
]

export const getOperation = (id: string) => OPERATIONS.find((o) => o.id === id)

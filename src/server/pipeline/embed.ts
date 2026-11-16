import type { Step } from './types'

// Embed: Qwen3-Embedding-0.6B run locally, vectors stored in startup_vectors (sqlite-vec).
// Wired into the runner; the model is added in its own slice.
export const embed: Step = {
  name: 'embed',
  label: 'Embed startups locally',
  run() {
    return { itemsIn: 0, itemsOut: 0, message: 'Not built yet', skipped: true }
  },
}

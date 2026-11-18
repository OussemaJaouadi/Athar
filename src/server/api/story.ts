import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { personStory, startupStory, storyCounts } from '../pipeline/story'

// What visitors' pages read to tell the story of a startup or a person. The logic lives in pipeline/story.ts.
// Every field is plain JSON (strings, numbers, booleans, null), so the results need no wrapping.

/** One startup's story: its name, other names, website, ventures with the same founders, and notes; null when the id is unknown. */
export const getStartupStory = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => startupStory(getDatabase(), data))

/** One person's story by person key; null when no founder has that key. */
export const getPersonStory = createServerFn()
  .validator((key: string) => key)
  .handler(async ({ data }) => personStory(getDatabase(), data))

/** Counts of renames, successors, siblings, name-only ties, other names and moved or gone websites. */
export const getStoryCounts = createServerFn().handler(async () => storyCounts(getDatabase()))

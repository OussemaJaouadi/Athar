import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { now } from '../ids'
import { addNote, citation, exportRows, follow, followed, notesOf, removeNote, toCsv, unfollow } from '../pipeline/keep'

// The person's own notes, follows and export. The logic lives in pipeline/keep.ts so it can be tested without a server.

/** Notes on one startup, newest first. */
export const getNotes = createServerFn()
  .validator((startupId: string) => startupId)
  .handler(async ({ data }) => notesOf(getDatabase(), data))

/** Adds a note; throws the message the form should show when the input is not acceptable. */
export const addStartupNote = createServerFn({ method: 'POST' })
  .validator((input: { startupId: string; kind: string; text: string; source?: string | null; onDate?: string | null }) => input)
  .handler(async ({ data }) => addNote(getDatabase(), data))

/** Removes one note; false when it did not exist. */
export const removeStartupNote = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<boolean> => removeNote(getDatabase(), data))

/** Follows a startup; false when it was already followed. */
export const followStartup = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<boolean> => follow(getDatabase(), data))

/** Stops following a startup; false when it was not followed. */
export const unfollowStartup = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<boolean> => unfollow(getDatabase(), data))

/** The startups the person follows, newest follow first. */
export const getFollowed = createServerFn().handler(async () => followed(getDatabase()))

/** The export as a file: CSV with a BOM and CRLF, or JSON. Filtered by ids or to the followed startups. */
export const getExport = createServerFn()
  .validator((input: { format: 'csv' | 'json'; followedOnly?: boolean; ids?: string[] }) => {
    if (input.format !== 'csv' && input.format !== 'json') throw new Error('The export is CSV or JSON')
    return input
  })
  .handler(async ({ data }): Promise<{ filename: string; mime: string; body: string }> => {
    const rows = exportRows(getDatabase(), { ids: data.ids, followedOnly: data.followedOnly })
    const date = now().slice(0, 10)
    if (data.format === 'csv') {
      return { filename: `athar-startups-${date}.csv`, mime: 'text/csv; charset=utf-8', body: toCsv(rows) }
    }
    return { filename: `athar-startups-${date}.json`, mime: 'application/json; charset=utf-8', body: JSON.stringify(rows, null, 2) }
  })

/** How to cite the registry as Athar read it, as plain text and as BibTeX. */
export const getCitation = createServerFn().handler(async () => citation(getDatabase(), new Date()))

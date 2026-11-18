import { createServerFn } from '@tanstack/react-start'

import { requireOperator } from '../auth'
import { getDatabase } from '../db'
import type { ReadingKind } from '../pipeline/readings'
import { decideReading, forgetStale, REVIEW_ORDER, reviewQueue, reviewSummary, undoDecision } from '../pipeline/review'
import { reviewContext, startupCard } from '../pipeline/review-context'

// The operator's review of derived readings. The logic lives in pipeline/review.ts so it can be tested without a server.

// `value` is any JSON the pipeline stored. TanStack's serializer needs a concrete type, so `unknown` fields are
// typed as Json on the way out; the data itself is plain JSON from the database.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type Wire<T> = T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: unknown extends T[K] ? Json : Wire<T[K]> } : T
const wire = <T,>(result: T) => result as Wire<T>

const KNOWN_KINDS = new Set<string>(REVIEW_ORDER)

/** Only the seven known kinds filter the queue; anything else is treated as no filter. */
const asKind = (kind: string | undefined): ReadingKind | undefined => (kind && KNOWN_KINDS.has(kind) ? (kind as ReadingKind) : undefined)

/** The open, decided or both readings, in review order, optionally one kind. */
export const getReviewQueue = createServerFn()
  .validator((options: { kind?: string; include?: 'open' | 'decided' | 'all' }) => options)
  .handler(async ({ data }) => { requireOperator(); return wire(reviewQueue(getDatabase(), { kind: asKind(data.kind), include: data.include })) })

/** Lane totals, percentages, counts by kind and the number of stale decisions. */
export const getReviewSummary = createServerFn().handler(async () => { requireOperator(); return wire(reviewSummary(getDatabase())) })

/** The operator's answer to one reading. */
export const decideReview = createServerFn({ method: 'POST' })
  .validator((input: { id: string; value: unknown; note?: string | null }) => {
    if (!input.id) throw new Error('A reading id is required')
    return input
  })
  .handler(async ({ data }) => { requireOperator(); return wire(decideReading(getDatabase(), data)) })

/** Removes the operator's answer to one reading, so it waits again. */
export const undoReview = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<boolean> => { requireOperator(); return undoDecision(getDatabase(), data) })

/** Deletes the decisions that no longer apply; returns how many were removed. */
export const forgetStaleDecisions = createServerFn({ method: 'POST' }).handler(async (): Promise<number> => { requireOperator(); return forgetStale(getDatabase()) })

/** The question, answers and evidence for one reading; null when the reading does not exist. */
export const getReviewContext = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => { requireOperator(); return wire(reviewContext(getDatabase(), data)) })

/** One startup with its founders, for the evidence beside a question; null when the id is unknown. */
export const getStartupCard = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => { requireOperator(); return wire(startupCard(getDatabase(), data)) })

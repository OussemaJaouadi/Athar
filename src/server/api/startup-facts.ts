import type { Database } from 'bun:sqlite'

// Small reads about one startup, shared by server functions (Database). Moved from the retired Trace API.

/** The latest observation of a startup's website (website_checks); never a verdict about the company. */
export type WebsiteCheck = { url: string; status: string; detail: string; finalHost: string | null; checkedAt: string; since: string }

/** A startup's founders in published order, from the founders table. */
export const foundersOf = (db: Database, startupId: string) =>
  db.query<{ name: string }, [string]>('SELECT name FROM founders WHERE startup_id = ? ORDER BY position').all(startupId).map((f) => f.name)

/** A startup's website observation, if it was checked. */
export const websiteCheckOf = (db: Database, startupId: string): WebsiteCheck | null => {
  const c = db
    .query<{ url: string; status: string; detail: string; final_host: string | null; checked_at: string; since: string }, [string]>(
      'SELECT url, status, detail, final_host, checked_at, since FROM website_checks WHERE startup_id = ?',
    )
    .get(startupId)
  return c ? { url: c.url, status: c.status, detail: c.detail, finalHost: c.final_host, checkedAt: c.checked_at, since: c.since } : null
}

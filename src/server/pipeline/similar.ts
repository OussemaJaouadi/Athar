import type { Database } from 'bun:sqlite'

import { embedQuery } from './embedder'

export type Similar = { startupId: string; /** 1 is identical in meaning, 0 is unrelated. */ similarity: number }

/** The startups whose description is closest in meaning to a text, in any of the three languages. */
export async function similarTo(db: Database, text: string, limit = 20): Promise<Similar[]> {
  const vector = await embedQuery(text)
  return db
    .query<{ startup_id: string; distance: number }, [Float32Array, number]>(
      'SELECT startup_id, distance FROM startup_vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance',
    )
    .all(vector, limit)
    .map((r) => ({ startupId: r.startup_id, similarity: 1 - r.distance }))
}

/** The startups closest in meaning to one startup; empty when it has no description. */
export function similarToStartup(db: Database, startupId: string, limit = 10): Similar[] {
  const own = db.query<{ embedding: Float32Array }, [string]>('SELECT embedding FROM startup_vectors WHERE startup_id = ?').get(startupId)
  if (!own) return []
  return db
    .query<{ startup_id: string; distance: number }, [Float32Array, number]>(
      'SELECT startup_id, distance FROM startup_vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance',
    )
    .all(own.embedding, limit + 1)
    .filter((r) => r.startup_id !== startupId)
    .slice(0, limit)
    .map((r) => ({ startupId: r.startup_id, similarity: 1 - r.distance }))
}

import { now, sha256 } from '../ids'
import { EMBEDDING, embedDocuments } from './embedder'
import type { Step } from './types'

/** What is embedded for one startup: its sector, then the prepared text when Prepare has run, else the description. */
export const embeddingText = (sector: string | null, text: string) => (sector ? `${sector}. ${text}` : text)

/** What a vector was made from: the model, its revision and the text. A different hash means the vector is out of date. */
export const embeddingHash = (text: string) => sha256(`${EMBEDDING.model}\n${EMBEDDING.revision}\n${text}`)

// Embed: one vector per startup that has a description, computed on this machine.
// A startup is embedded again only when its text or the model changed.
export const embed: Step = {
  name: 'embed',
  label: 'Embed startups locally',
  async run({ db }) {
    const startups = db
      .query<{ id: string; sector: string | null; text: string; prepared: number }, []>(
        `SELECT s.id, s.sector, COALESCE(p.text, s.description) AS text, p.text IS NOT NULL AS prepared
         FROM startups s LEFT JOIN prepared_texts p ON p.startup_id = s.id
         WHERE s.description IS NOT NULL ORDER BY s.id`,
      )
      .all()
      .map((s) => {
        const text = embeddingText(s.sector, s.text)
        return { ...s, text, hash: embeddingHash(text) }
      })
    const have = new Map(db.query<{ startup_id: string; text_hash: string }, []>('SELECT startup_id, text_hash FROM embedding_meta').all().map((m) => [m.startup_id, m.text_hash]))
    const todo = startups.filter((s) => have.get(s.id) !== s.hash)

    const dropVector = db.query('DELETE FROM startup_vectors WHERE startup_id = ?')
    const dropMeta = db.query('DELETE FROM embedding_meta WHERE startup_id = ?')
    const addVector = db.query('INSERT INTO startup_vectors (startup_id, embedding) VALUES (?, ?)')
    const addMeta = db.query('INSERT INTO embedding_meta (startup_id, model, revision, dims, text_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')

    // Saved in small groups: an interrupted run keeps what it finished and continues from there.
    for (let i = 0; i < todo.length; i += 16) {
      const group = todo.slice(i, i + 16)
      const vectors = await embedDocuments(group.map((s) => s.text))
      db.transaction(() => {
        group.forEach((s, n) => {
          if (vectors[n].length !== EMBEDDING.dims) throw new Error(`The model returned ${vectors[n].length} dimensions, expected ${EMBEDDING.dims}`)
          dropVector.run(s.id)
          dropMeta.run(s.id)
          addVector.run(s.id, vectors[n])
          addMeta.run(s.id, EMBEDDING.model, EMBEDDING.revision, EMBEDDING.dims, s.hash, now())
        })
      })()
    }

    // A startup that lost its description, or is gone, keeps no vector.
    const keep = new Set(startups.map((s) => s.id))
    const stale = [...have.keys()].filter((id) => !keep.has(id))
    db.transaction(() => stale.forEach((id) => (dropVector.run(id), dropMeta.run(id))))()

    const without = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups WHERE description IS NULL').get()?.n ?? 0
    return {
      itemsIn: startups.length,
      itemsOut: todo.length,
      message: `${todo.length} startups embedded; ${startups.length - todo.length} already up to date`,
      notes: [
        { code: 'embedded', count: todo.length, text: 'startups embedded by this run' },
        { code: 'up_to_date', count: startups.length - todo.length, text: 'startups whose text and model had not changed' },
        { code: 'from_prepared', count: startups.filter((s) => s.prepared).length, text: 'startups embedded from their prepared text' },
        { code: 'removed', count: stale.length, text: 'vectors removed because the startup has no description any more' },
        { code: 'no_description', count: without, text: 'startups with no description; nothing to embed, they cannot be matched to an idea' },
      ].filter((n) => n.count > 0),
    }
  },
}

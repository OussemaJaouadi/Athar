import { newId, now, sha256 } from '../ids'
import { REGISTRY } from './registry'
import type { Step } from './types'

const MAX_BYTES = 64 * 1024 * 1024

// Collect: download the registry and keep the bytes and every row verbatim.
export const collect: Step = {
  name: 'collect',
  label: 'Download the registry',
  async run({ db, runId, state }) {
    const res = await fetch(REGISTRY.url, { headers: { accept: 'application/json', 'user-agent': REGISTRY.userAgent } })
    if (!res.ok) throw new Error(`Registry answered ${res.status} ${res.statusText}`)
    const body = new Uint8Array(await res.arrayBuffer())
    if (body.byteLength > MAX_BYTES) throw new Error(`Registry response is ${body.byteLength} bytes, over the limit`)

    const rows: unknown = JSON.parse(new TextDecoder().decode(body))
    if (!Array.isArray(rows)) throw new Error('Registry response is not a JSON array')

    const hash = sha256(body)
    const previous = db
      .query<{ content_hash: string }, []>('SELECT content_hash FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1')
      .get()
    const snapshotId = newId()

    db.transaction(() => {
      db.query(
        `INSERT INTO source_snapshots (id, source_id, url, fetched_at, content_hash, byte_size, row_count, body, run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(snapshotId, REGISTRY.sourceId, REGISTRY.url, now(), hash, body.byteLength, rows.length, body, runId)
      const insert = db.query('INSERT INTO source_rows (id, snapshot_id, row_number, raw_json) VALUES (?, ?, ?, ?)')
      rows.forEach((row, i) => insert.run(newId(), snapshotId, i + 1, JSON.stringify(row)))
    })()

    state.snapshotId = snapshotId
    const unchanged = previous?.content_hash === hash
    return {
      itemsIn: rows.length,
      itemsOut: rows.length,
      message: `${rows.length} rows saved${unchanged ? '; identical to the previous snapshot' : ''}`,
    }
  },
}

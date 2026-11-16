import type { Database } from 'bun:sqlite'

// Numbered SQL files, bundled at build time so the production server carries them.
const files = import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => {
    const name = path.split('/').pop()!.replace(/\.sql$/, '')
    return { version: Number(name.split('_')[0]), name, sql }
  })
  .sort((a, b) => a.version - b.version)

function checksum(sql: string) {
  return new Bun.CryptoHasher('sha256').update(sql).digest('hex')
}

export function migrate(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`)
  const applied = new Map(
    db
      .query<{ version: number; checksum: string }, []>('SELECT version, checksum FROM schema_migrations')
      .all()
      .map((r) => [r.version, r.checksum]),
  )
  for (const m of MIGRATIONS) {
    const sum = checksum(m.sql)
    const known = applied.get(m.version)
    if (known) {
      if (known !== sum) throw new Error(`Migration ${m.name} changed after it was applied`)
      continue
    }
    db.transaction(() => {
      db.run(m.sql)
      db.query('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)').run(m.version, m.name, sum, new Date().toISOString())
    })()
  }
}

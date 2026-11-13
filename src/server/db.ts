import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

// One local SQLite file holds everything: raw rows, startups, runs and vectors.
const DB_PATH = resolve(process.env.ATHAR_DB_PATH ?? 'data/athar.db')

// Apple's system SQLite blocks extensions; sqlite-vec needs a full build.
const MAC_SQLITE = [
  process.env.ATHAR_SQLITE_LIB,
  '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib',
  '/usr/local/opt/sqlite/lib/libsqlite3.dylib',
]

let db: Database | undefined
let customSqliteSet = false

export function openDatabase(path = DB_PATH): Database {
  // setCustomSQLite only works before the first Database is created, so run it once.
  if (process.platform === 'darwin' && !customSqliteSet) {
    const lib = MAC_SQLITE.find((p) => p && existsSync(p))
    if (!lib) throw new Error('macOS needs a full SQLite build for sqlite-vec: brew install sqlite')
    Database.setCustomSQLite(lib)
    customSqliteSet = true
  }
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const conn = new Database(path, { create: true, strict: true })
  conn.run('PRAGMA journal_mode = WAL')
  conn.run('PRAGMA foreign_keys = ON')
  conn.run('PRAGMA busy_timeout = 5000')
  sqliteVec.load(conn)
  return conn
}

export function getDatabase(): Database {
  db ??= openDatabase()
  return db
}

export function databaseInfo(conn: Database = getDatabase()) {
  const row = conn
    .query<{ sqlite: string; vec: string }, []>('SELECT sqlite_version() AS sqlite, vec_version() AS vec')
    .get()
  if (!row) throw new Error('SQLite returned no version row')
  return row
}

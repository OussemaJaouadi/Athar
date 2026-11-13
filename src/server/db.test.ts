import { expect, test } from 'bun:test'
import { databaseInfo, openDatabase } from './db'

test('opens SQLite with sqlite-vec loaded', () => {
  const conn = openDatabase(':memory:')
  const info = databaseInfo(conn)
  expect(info.sqlite).toMatch(/^3\./)
  expect(info.vec).toMatch(/^v0\./)
  conn.close()
})

test('sqlite-vec answers a distance query', () => {
  const conn = openDatabase(':memory:')
  const row = conn
    .query<{ d: number }, []>("SELECT vec_distance_cosine('[1, 0]', '[1, 0]') AS d")
    .get()
  expect(row?.d).toBe(0)
  conn.close()
})

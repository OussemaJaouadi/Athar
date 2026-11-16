// Time-ordered ids, so runs and snapshots sort by creation.
export const newId = () => Bun.randomUUIDv7()
export const now = () => new Date().toISOString()
export const sha256 = (data: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(data).digest('hex')

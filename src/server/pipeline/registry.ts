// The Startup Tunisia registry: one public GET, no auth, ~920 rows of JSON.
export const REGISTRY = {
  sourceId: 'source_startuptn_registry',
  url: 'https://startups.smartcapital.tn/?lang=en',
  userAgent: 'AtharBot/0.1 (+https://github.com/OussemaJaouadi/Athar)',
} as const

/** One row exactly as the registry publishes it. */
export type RegistryRow = {
  name: string
  desc: string | null
  sector: string
  industry: string
  website: string | null
  founders: string[]
  label: string
  creation_year: string
  email: string
  phone: string
  logo: string
  logo_id?: string | null
}

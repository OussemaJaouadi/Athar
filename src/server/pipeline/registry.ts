// The Startup Tunisia registry: one public GET, no auth, ~920 rows of JSON. It publishes no id per row.
export const REGISTRY = {
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

/** Fields Athar reads. A download without one of them is refused. */
export const USED_FIELDS = ['name', 'desc', 'sector', 'website', 'founders', 'label', 'creation_year'] as const

/**
 * Fields Athar never reads, each with the reason, said once here instead of on every row.
 * Collect checks on every download that the first three reasons still hold.
 */
export const UNUSED_FIELDS: Record<string, string> = {
  industry: 'Always identical to sector',
  logo: 'The same placeholder image on every row',
  logo_id: 'Always empty',
  email: 'A contact detail, not a fact about the startup; "n.a." on most rows',
  phone: 'A contact detail, not a fact about the startup; "n.a." on most rows',
}

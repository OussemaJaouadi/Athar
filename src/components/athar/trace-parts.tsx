const LABELS: Record<string, string> = {
  name: 'Name',
  desc: 'Description',
  description: 'Description',
  sector: 'Sector',
  industry: 'Industry',
  website: 'Website',
  domain: 'Website domain',
  founders: 'Founders',
  label: 'Label date',
  cohort: 'Label date',
  cohort_date: 'Label date',
  creation_year: 'Founded',
  logo: 'Logo',
  logo_id: 'Logo id',
  email: 'Email',
  phone: 'Phone',
}
export const fieldLabel = (key: string) => LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** A stored value as words: lists joined, nothing for empty. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/** A download date as people say it: "17 Nov 2026". */
export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

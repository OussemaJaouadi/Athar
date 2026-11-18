import { now } from '../ids'
import { looksParked, pageFacts } from './page-facts'
import { REGISTRY } from './registry'
import type { RunNote, Step } from './types'
import { websiteState, type WebsiteState } from './website-state'

// Check: ask each startup's website once whether it answers. The result is an observation with a
// date ("unreachable since 17 Nov"), never a verdict about the company.

const TIMEOUT_MS = 15_000
const CONCURRENCY = 12
// The server is there and refuses a robot: for a person in a browser the site is up.
const REFUSES_ROBOTS = new Set([401, 403, 405, 406, 429, 999])
// Only the head of a page is read: the title and the description live there.
const HEAD_BYTES = 100_000

export type Outcome = {
  status: 'reachable' | 'unreachable'
  detail: string
  finalHost: string | null
  title: string | null
  summary: string | null
}

const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, '')

function failure(error: unknown): string {
  const e = error as { name?: string; code?: string; message?: string }
  const text = `${e.name ?? ''} ${e.code ?? ''} ${e.message ?? ''}`
  if (/timeout|timed out|abort/i.test(text)) return 'timed out'
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns|resolve/i.test(text)) return 'no such domain'
  if (/refused/i.test(text)) return 'connection refused'
  if (/cert|tls|ssl|self.signed|handshake/i.test(text)) return 'certificate problem'
  if (/reset|closed|socket|EPIPE/i.test(text)) return 'connection dropped'
  if (/redirect/i.test(text)) return 'redirects without end'
  return `failed (${e.code ?? e.name ?? 'unknown error'})`
}

/** The first HEAD_BYTES of the body as text. The body is always cancelled afterwards. */
async function headText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let got = 0
  try {
    while (got < HEAD_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      const part = value.subarray(0, HEAD_BYTES - got)
      parts.push(part)
      got += part.byteLength
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(got)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

async function request(url: string): Promise<Outcome> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': REGISTRY.userAgent, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    })
    const finalHost = hostOf(res.url) !== hostOf(url) ? hostOf(res.url) : null
    const up = res.status < 400 || REFUSES_ROBOTS.has(res.status)
    const type = res.headers.get('content-type')
    const html = type === null || /html/i.test(type)
    let title: string | null = null
    let summary: string | null = null
    if (up && res.status < 400 && html && res.body) {
      // A page that cannot be read still answers: only its title and description are lost.
      try {
        const facts = pageFacts(await headText(res.body))
        title = facts.title
        summary = facts.summary
      } catch {
        title = null
        summary = null
      }
    } else {
      await res.body?.cancel().catch(() => {})
    }
    return { status: up ? 'reachable' : 'unreachable', detail: `answered ${res.status}`, finalHost, title, summary }
  } catch (error) {
    return { status: 'unreachable', detail: failure(error), finalHost: null, title: null, summary: null }
  }
}

/** One website, asked the way a person would: the address as published, then plain http if https fails. */
export async function probe(url: string): Promise<Outcome> {
  const first = await request(url)
  if (first.status === 'reachable' || !url.startsWith('https://') || first.detail === 'no such domain') return first
  const plain = await request(url.replace(/^https:/, 'http:'))
  return plain.status === 'reachable' ? { ...plain, detail: `${plain.detail} over http only` } : first
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await work(items[i])
      }
    }),
  )
  return results
}

export const check: Step = {
  name: 'check',
  label: 'Ask each website whether it answers',
  async run({ db }) {
    const sites = db
      .query<{ id: string; website: string; domain: string | null }, []>(
        "SELECT id, website, domain FROM startups WHERE website IS NOT NULL AND website_kind IN ('own', 'hosted', 'shortlink') ORDER BY id",
      )
      .all()
    const social = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM startups WHERE website_kind = 'social'").get()?.n ?? 0
    const none = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups WHERE website IS NULL').get()?.n ?? 0

    const outcomes = await pool(sites, CONCURRENCY, (s) => probe(s.website))
    // A site that failed once is asked a second time, slowly, before it is written down as unreachable.
    const failed = outcomes.map((o, i) => (o.status === 'unreachable' ? i : -1)).filter((i) => i >= 0)
    const second = await pool(failed, 4, (i) => probe(sites[i].website))
    failed.forEach((i, n) => (outcomes[i] = second[n]))

    // What each check means: a page that answers but says it is for sale or gone is parked, whatever the rule said.
    const stored = sites.map((s, i) => {
      const o = outcomes[i]
      const st = websiteState({ status: o.status, detail: o.detail, finalHost: o.finalHost }, s.domain)
      if (st.value === 'answers' && looksParked({ title: o.title, summary: o.summary })) {
        return {
          state: 'parked' as WebsiteState,
          lane: 'inferred' as const,
          why: `The page says the domain is for sale or the site is gone: "${o.title ?? o.summary}"`,
        }
      }
      return { state: st.value, lane: st.lane, why: st.why }
    })
    const parked = stored.filter((x) => x.state === 'parked').length
    const described = outcomes.filter((o) => o.summary !== null).length

    const at = now()
    const previous = new Map(
      db.query<{ startup_id: string; url: string; status: string; since: string }, []>('SELECT startup_id, url, status, since FROM website_checks').all().map((c) => [c.startup_id, c]),
    )
    let turned = 0
    db.transaction(() => {
      const save = db.query(
        `INSERT INTO website_checks (startup_id, url, status, detail, final_host, checked_at, since, state, state_lane, state_why, title, summary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(startup_id) DO UPDATE SET url = ?2, status = ?3, detail = ?4, final_host = ?5, checked_at = ?6, since = ?7,
           state = ?8, state_lane = ?9, state_why = ?10, title = ?11, summary = ?12`,
      )
      sites.forEach((s, i) => {
        const o = outcomes[i]
        const before = previous.get(s.id)
        const same = before && before.url === s.website && before.status === o.status
        if (before && before.url === s.website && before.status !== o.status) turned++
        const v = stored[i]
        save.run(s.id, s.website, o.status, o.detail, o.finalHost, at, same ? before.since : at, v.state, v.lane, v.why, o.title, o.summary)
      })
      // A startup whose website is gone from the registry, or is now a social page, has nothing to observe.
      db.run("DELETE FROM website_checks WHERE startup_id NOT IN (SELECT id FROM startups WHERE website IS NOT NULL AND website_kind IN ('own', 'hosted', 'shortlink'))")
    })()

    const reachable = outcomes.filter((o) => o.status === 'reachable').length
    const why = new Map<string, number>()
    for (const o of outcomes) if (o.status === 'unreachable') why.set(o.detail, (why.get(o.detail) ?? 0) + 1)
    const notes: RunNote[] = [
      { code: 'reachable', count: reachable, text: 'websites that answered' },
      { code: 'unreachable', count: outcomes.length - reachable, text: 'websites that did not answer, asked twice' },
      ...[...why].sort((a, b) => b[1] - a[1]).map(([detail, count]) => ({ code: `unreachable:${detail}`, count, text: `of those: ${detail}` })),
      { code: 'moved', count: outcomes.filter((o) => o.status === 'reachable' && o.finalHost).length, text: 'websites that answered from a different domain' },
      { code: 'turned', count: turned, text: 'websites whose status changed since the last check' },
      { code: 'parked', count: parked, text: 'websites that answer with a for-sale or expired page' },
      { code: 'described', count: described, text: 'websites that describe themselves in a line' },
      { code: 'social_not_checked', count: social, text: 'pages on social networks; not checked, they answer whether or not the page exists' },
      { code: 'no_website', count: none, text: 'startups with no website in the registry' },
    ].filter((n) => n.count > 0)

    return {
      itemsIn: sites.length,
      itemsOut: reachable,
      message: `${sites.length} websites asked; ${reachable} answered, ${outcomes.length - reachable} did not`,
      notes,
    }
  },
}

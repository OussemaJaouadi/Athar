// What a website check found, in words a visitor reads. An observation with a date, never a verdict about the company.

export type WebsiteCheck = { status: 'reachable' | 'unreachable'; detail: string; finalHost: string | null; checkedAt: string; since: string }

/** "page not found (404)", "the domain no longer exists": why a website did not answer. */
export function websiteReason(detail: string): string {
  const code = /answered (\d{3})/.exec(detail)?.[1]
  if (detail === 'no such domain') return 'the domain no longer exists'
  if (detail === 'certificate problem') return 'its security certificate is not valid'
  if (detail === 'timed out') return 'no answer within 15 seconds'
  if (detail === 'connection refused') return 'the server refused the connection'
  if (detail === 'connection dropped') return 'the server dropped the connection'
  if (detail === 'redirects without end') return 'it redirects without end'
  if (code === '404' || code === '410') return `the page was not found (${code})`
  if (code && Number(code) >= 500) return `the server answered with an error (${code})`
  if (code) return `the server answered ${code}`
  return detail
}

export const websiteAnswers = (check: Pick<WebsiteCheck, 'status'>) => check.status === 'reachable'

/** The address as a person would type it: no scheme, no www, no trailing slash. */
export const bareAddress = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')

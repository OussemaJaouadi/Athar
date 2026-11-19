import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAGE_SIZES } from '#/shared/archive'

type Props = {
  page: number
  pages: number
  size: number
  /** Rows on this page, so the range can be said exactly. */
  shown: number
  total: number
  /** What the rows are, plural: "startups", "people". */
  noun: string
  /** Where page n lives. The links carry rel="prev" / rel="next" and are preloaded on hover or focus. */
  linkTo: (page: number) => LinkProps
  onPage: (page: number) => void
  onSize: (size: number) => void
}

/**
 * The Archive's pager: the range and total, a page-size choice, previous and next as real links, and a page field.
 * Two short rows, so it holds at the width of the list without squeezing the numbers.
 */
export function ArchivePager({ page, pages, size, shown, total, noun, linkTo, onPage, onSize }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(String(page))
  useEffect(() => setDraft(String(page)), [page])
  const first = shown === 0 ? 0 : (page - 1) * size + 1
  const last = (page - 1) * size + shown
  const jump = () => {
    const n = Number(draft)
    if (Number.isInteger(n) && n >= 1 && n <= pages) onPage(n)
    else setDraft(String(page))
  }
  const arrow = 'h-9 gap-1 px-2.5 text-[0.8125rem] sm:h-8'
  return (
    <nav aria-label={`${noun} pages`} className="grid gap-2 border-t border-hairline py-2.5 text-[0.8125rem] xl:-ms-3 xl:ps-3 xl:pe-3">
      <div className="flex items-center justify-between gap-3">
        <p className="whitespace-nowrap text-ink tabular-nums" aria-live="polite">
          {first.toLocaleString('en-GB')}–{last.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-size`} className="text-ink-2">
            Per page
          </label>
          <Select value={String(size)} onValueChange={(v) => onSize(Number(v))}>
            <SelectTrigger id={`${id}-size`} size="sm" className="h-8 min-w-16 text-[0.8125rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)} className="text-[0.8125rem]">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" className={arrow}>
              <Link {...linkTo(page - 1)} rel="prev" preload="intent" aria-keyshortcuts="[" title="Previous page ([)">
                <ChevronLeft aria-hidden /> Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className={arrow} disabled>
              <ChevronLeft aria-hidden /> Previous
            </Button>
          )}
          <form
            className="flex items-center gap-2 text-ink-2"
            onSubmit={(e) => {
              e.preventDefault()
              jump()
            }}
          >
            <label htmlFor={`${id}-page`}>Page</label>
            <Input
              id={`${id}-page`}
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
              onBlur={jump}
              aria-label={`Page, of ${pages}`}
              className="h-8 w-14 px-2 text-center text-[0.8125rem] tabular-nums md:text-[0.8125rem]"
            />
            <span aria-hidden className="whitespace-nowrap tabular-nums">of {pages.toLocaleString('en-GB')}</span>
          </form>
          {page < pages ? (
            <Button asChild variant="outline" className={arrow}>
              <Link {...linkTo(page + 1)} rel="next" preload="intent" aria-keyshortcuts="]" title="Next page (])">
                Next <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className={arrow} disabled>
              Next <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
      )}
    </nav>
  )
}

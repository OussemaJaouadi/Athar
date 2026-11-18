import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'

import { deskBtn } from '@/components/athar/desk'
import { CopyButton } from '@/components/interior/copy-button'
import { LoadingButton } from '@/components/interior/loading-button'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getCitation, getExport } from '#/server/api/keep'

/** Hands a string to the browser as a file: a Blob and an object URL, revoked straight after the click. */
function save({ filename, mime, body }: { filename: string; mime: string; body: string }) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Export in the Startups bar: what (all, or the ones you follow), which format, Download; then how to cite the registry,
 * as text and as BibTeX, each with Interior's Copy Button. The popover is shadcn's.
 */
export function ExportMenu({ total, following }: { total: number; following: number }) {
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState<'all' | 'followed'>('all')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [cite, setCite] = useState<{ text: string; bibtex: string } | null>(null)

  useEffect(() => {
    if (open && !cite) getCitation().then(setCite).catch(() => setCite(null))
  }, [open, cite])
  // The choice cannot stay on "followed" when nothing is followed any more.
  const scope = what === 'followed' && following === 0 ? 'all' : what

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={deskBtn}>
          <Download aria-hidden strokeWidth={1.5} />
          Export
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80vh] w-[min(380px,calc(100vw-24px))] gap-4 overflow-y-auto rounded-[8px] border border-edge bg-canvas p-4 text-[0.875rem] text-ink ring-0">
        <div className="grid gap-1.5">
          <p className="text-[0.8125rem] font-medium text-ink-2">What</p>
          <SegmentedControl
            label="What to export"
            value={scope}
            onValueChange={(v) => setWhat(v as 'all' | 'followed')}
            options={[
              { value: 'all', label: `All ${total.toLocaleString('en-GB')}` },
              { value: 'followed', label: `Following ${following}`, disabled: following === 0 },
            ]}
          />
        </div>
        <div className="grid gap-1.5">
          <p className="text-[0.8125rem] font-medium text-ink-2">Format</p>
          <SegmentedControl
            label="Format"
            value={format}
            onValueChange={(v) => setFormat(v as 'csv' | 'json')}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]}
          />
        </div>
        <div className="grid justify-items-start gap-1.5">
          <LoadingButton
            onAction={async () => save(await getExport({ data: { format, followedOnly: scope === 'followed' } }))}
            pendingLabel="Preparing"
            successLabel="Downloaded"
            errorLabel="Try again"
          >
            Download
          </LoadingButton>
          <p className="text-[0.8125rem] text-ink-2">The CSV opens in a spreadsheet with accents and Arabic intact.</p>
        </div>
        <div className="grid gap-2 border-t border-hairline pt-3">
          <p className="text-[0.8125rem] font-medium text-ink-2">Cite the registry</p>
          {cite ? (
            <>
              <p className="text-[0.8125rem] leading-relaxed text-ink select-text">{cite.text}</p>
              <div>
                <CopyButton value={cite.text} label="Copy citation" />
              </div>
              <pre className="overflow-x-auto rounded-[5px] border border-edge bg-surface p-2 font-mono text-[0.8125rem] leading-snug text-ink select-text">{cite.bibtex}</pre>
              <div>
                <CopyButton value={cite.bibtex} label="Copy BibTeX" />
              </div>
            </>
          ) : (
            <p className="text-[0.8125rem] text-ink-2">Reading the citation.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { useRouter } from '@tanstack/react-router'
import { CircleAlert, NotebookPen, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'

import { PaneSection, deskBtn } from '@/components/athar/desk'
import { LoadingButton } from '@/components/interior/loading-button'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { addStartupNote, removeStartupNote } from '#/server/api/keep'
import type { Note, NoteKind } from '#/server/pipeline/keep'

const KIND_WORDS: Record<NoteKind, string> = { closed: 'Closed', acquired: 'Acquired', renamed: 'Renamed', note: 'Note' }
const KINDS = (Object.keys(KIND_WORDS) as NoteKind[]).map((value) => ({ value, label: KIND_WORDS[value] }))

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The person's own notes on one startup, after the registry's sections. They sit beside the registry's values and
 * never change them. Add: Interior's Loading Button on Field inputs, the server's sentence in ReUI's Alert, and what
 * was typed stays. Remove asks once, inline: a press-and-hold would be slow for a line of text.
 */
export function StartupNotes({ startupId, notes }: { startupId: string; notes: Note[] }) {
  return (
    <PaneSection title="Your notes" icon={NotebookPen}>
      <div className="grid max-w-[75ch] gap-4">
        <p className="text-[0.875rem] text-ink-2">These notes are yours. They are kept on this install and shown on the startup&rsquo;s public page beside the registry&rsquo;s data.</p>
        {notes.length > 0 && (
          <ul className="grid">
            {notes.map((n) => (
              <NoteRow key={n.id} note={n} />
            ))}
          </ul>
        )}
        <NoteForm key={startupId} startupId={startupId} />
      </div>
    </PaneSection>
  )
}

function NoteRow({ note }: { note: Note }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      await removeStartupNote({ data: note.id })
      await router.invalidate()
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }
  return (
    <li className="grid gap-1 border-t border-hairline py-2.5 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-3 text-[0.8125rem] text-ink-2">
        <span className="font-medium text-ink">{KIND_WORDS[note.kind]}</span>
        {note.onDate && <span className="tabular-nums">{note.onDate}</span>}
        <span className="tabular-nums">written {when(note.createdAt)}</span>
      </p>
      <p dir="auto" className="text-[0.875rem] whitespace-pre-line text-ink">
        {note.text}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
        {note.source && (
          <a href={note.source} target="_blank" rel="noreferrer noopener" className="min-w-0 break-all text-glaze underline">
            {note.source}
          </a>
        )}
        <span className="ms-auto flex items-center gap-2">
          {asking ? (
            <>
              <span className="text-ink">Remove?</span>
              <button type="button" className={deskBtn} disabled={busy} onClick={remove}>
                Yes
              </button>
              <button type="button" className={deskBtn} disabled={busy} onClick={() => setAsking(false)} autoFocus>
                No
              </button>
            </>
          ) : (
            <button type="button" className={deskBtn} onClick={() => setAsking(true)} aria-label={`Remove this ${KIND_WORDS[note.kind].toLowerCase()} note`}>
              <Trash2 aria-hidden strokeWidth={1.5} />
              Remove
            </button>
          )}
        </span>
      </div>
    </li>
  )
}

function NoteForm({ startupId }: { startupId: string }) {
  const router = useRouter()
  const id = useId()
  const [kind, setKind] = useState<NoteKind>('note')
  const [text, setText] = useState('')
  const [onDate, setOnDate] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Throws with the server's sentence so the button says "Try again" and the alert says why; the fields keep their text.
  const save = async () => {
    setError(null)
    try {
      await addStartupNote({ data: { startupId, kind, text, source: source || null, onDate: onDate || null } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The note could not be saved')
      throw e
    }
    setText('')
    setOnDate('')
    setSource('')
    await router.invalidate()
  }

  return (
    <form
      className="grid gap-3 border-t border-edge pt-4"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Add a note"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Kind</FieldLabel>
          {/* Arrow keys move inside the control; the desk's own arrows must not also move the list. */}
          <div onKeyDown={(e) => e.key.startsWith('Arrow') && e.stopPropagation()}>
            <SegmentedControl label="Kind of note" options={KINDS} value={kind} onValueChange={(v) => setKind(v as NoteKind)} className="w-full max-w-[22rem]" />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-text`}>Note</FieldLabel>
          <Textarea id={`${id}-text`} dir="auto" rows={2} className="min-h-16" value={text} onChange={(e) => setText(e.target.value)} placeholder="What you know, in a sentence or two" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-when`}>
              When <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id={`${id}-when`} autoComplete="off" inputMode="numeric" value={onDate} onChange={(e) => setOnDate(e.target.value)} placeholder="2023-06" />
            <FieldDescription>YYYY, YYYY-MM or YYYY-MM-DD.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-source`}>
              Source <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id={`${id}-source`} type="text" autoComplete="off" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://" />
            <FieldDescription>A web address.</FieldDescription>
          </Field>
        </div>
        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>The note was not saved</AlertTitle>
            <AlertDescription>
              <p>{error}.</p>
            </AlertDescription>
          </Alert>
        )}
      </FieldGroup>
      <div>
        <LoadingButton onAction={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Try again">
          Add note
        </LoadingButton>
      </div>
    </form>
  )
}

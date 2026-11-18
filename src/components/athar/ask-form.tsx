import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import AILoader from '@/components/smoothui/ai-loader'
import AIPromptInput from '@/components/smoothui/ai-prompt-input'
import AISuggestions from '@/components/smoothui/ai-suggestions'
import { checkIdea, warmIdeaModel } from '#/server/api/ideas'

const shell = getRouteApi('/_app')

const EXAMPLES = ['Olive farmers selling straight to restaurants abroad', 'تطبيق لحجز موعد مع الطبيب في الأرياف', 'Location de matériel agricole entre voisins']

/** The one way to ask Athar about an idea, on the home page and on the idea page: the check opens on /ideas/<id>. */
export function AskForm({ initial, compact, examples = EXAMPLES }: { initial?: string; compact?: boolean; examples?: string[] }) {
  const { corpus } = shell.useLoaderData()
  const navigate = useNavigate()
  // The embedding model takes up to a minute to load the first time; start while the idea is being typed.
  useEffect(() => void warmIdeaModel(), [])
  const [text, setText] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const ask = async (idea: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const { id } = await checkIdea({ data: idea })
      await navigate({ to: '/ideas/$id', params: { id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const short = text.trim().length < 12
  const send = () => {
    if (!short && !busy) ask(text.trim())
  }
  return (
    <form role="search" onSubmit={(e) => (e.preventDefault(), send())} className="grid gap-4">
      {/* SmoothUI's composer as it ships: it grows with the text, Enter sends, and its state drives the motion. */}
      <AIPromptInput
        aria-label="Describe your idea"
        className={compact ? undefined : 'text-lg'}
        value={text}
        onValueChange={setText}
        onSubmit={send}
        state={busy ? 'thinking' : error ? 'error' : 'idle'}
        disabled={busy}
        placeholder="Describe your idea in a sentence"
      >
        {busy ? (
          <AILoader variant="bar" showElapsed label={`Reading all ${corpus.startups.toLocaleString('en-GB')} startups`} />
        ) : (
          <span className="text-[0.9375rem] text-ink-2" aria-live="polite">
            {text && short ? 'A little more: a short sentence is enough.' : 'Enter to ask · Shift+Enter for a new line'}
          </span>
        )}
      </AIPromptInput>
      {error && <p className="ps-5 text-[0.9375rem] text-destructive">{error}</p>}
      {!compact && <AISuggestions className="ps-1" label="Or try one" suggestions={examples.map((label, i) => ({ id: String(i), label }))} onSelect={(sug) => setText(sug.label)} />}
    </form>
  )
}

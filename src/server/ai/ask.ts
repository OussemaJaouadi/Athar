import { newId } from '../ids'
import { createAdapter, type AiKey } from './providers'

const TIMEOUT_MS = 60_000

/** One question to the operator's model, one answer. No tools, no history. */
export async function askModel(key: AiKey, instructions: string, input: string) {
  const { chat, fromSpecTokenUsage } = await import('@tanstack/ai')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`no answer within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS)
  try {
    const result = await chat({
      adapter: createAdapter(key),
      systemPrompts: [instructions],
      messages: [{ role: 'user', content: input }],
      threadId: newId(),
      stream: false,
      abortController: controller,
    } as Parameters<typeof chat>[0] & { stream: false })
    const { text, chunks } = result as { text: string; chunks: { usage?: unknown }[] }
    const last = chunks.map((c) => c.usage).filter(Boolean).at(-1)
    const usage = Array.isArray(last) ? fromSpecTokenUsage(last) : (last as { promptTokens?: number; completionTokens?: number } | undefined)
    return { text, inputTokens: usage?.promptTokens ?? null, outputTokens: usage?.completionTokens ?? null }
  } finally {
    clearTimeout(timer)
  }
}

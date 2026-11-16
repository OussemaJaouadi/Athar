import type { AnyTextAdapter } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createGroqText } from '@tanstack/ai-groq'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

import type { Provider } from '#/shared/providers'

export type AiKey = { provider: Provider; model: string; apiKey: string }

// Adapters type their model lists; operators type any model their provider offers.
type Model<F extends (...args: never[]) => unknown> = Parameters<F>[0]

/** Turns a key from the portal into the matching TanStack AI adapter. */
export function createAdapter({ provider, model, apiKey }: AiKey): AnyTextAdapter {
  switch (provider) {
    case 'openrouter':
      return createOpenRouterText(model as Model<typeof createOpenRouterText>, apiKey)
    case 'groq':
      return createGroqText(model as Model<typeof createGroqText>, apiKey)
    case 'openai':
      return createOpenaiChatCompletions(model as Model<typeof createOpenaiChatCompletions>, apiKey)
    case 'anthropic':
      return createAnthropicChat(model as Model<typeof createAnthropicChat>, apiKey)
    case 'google':
      return createGeminiChat(model as Model<typeof createGeminiChat>, apiKey)
  }
}

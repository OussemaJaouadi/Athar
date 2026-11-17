import type { Provider } from './providers'

/** Display names and a few current model ids per provider; "Other" in the form takes any id. */
export const PROVIDER_NAME: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
}

export const SUGGESTED_MODELS: Record<Provider, string[]> = {
  openrouter: ['openai/gpt-5-mini', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
  groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
  openai: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
}

// Providers a key can use; shared by the portal form and the server factory.
export const PROVIDERS = ['openrouter', 'groq', 'openai', 'anthropic', 'google'] as const
export type Provider = (typeof PROVIDERS)[number]
export const isProvider = (value: string): value is Provider => (PROVIDERS as readonly string[]).includes(value)

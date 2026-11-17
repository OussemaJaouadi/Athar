import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { isProvider, type Provider } from '#/shared/providers'
import { getDatabase } from '../db'
import { newId, now } from '../ids'

// Every key call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

export type KeyRow = {
  id: string
  name: string
  provider: string
  model: string
  hint: string
  created_at: string
  last_tested_at: string | null
  last_test_ok: number | null
  last_test_message: string | null
  calls: number
  tokens: number
}

export type KeyTest = { ok: boolean; message: string; suggestions?: string[] }

// The full key never leaves the server: the client sees its last four characters.
export const listKeyRows = createServerFn().handler(async () => {
  requireOperator()
  return getDatabase()
    .query<KeyRow, []>(
      `SELECT k.id, k.name, k.provider, k.model, '…' || substr(k.api_key, -4) AS hint, k.created_at,
              k.last_tested_at, k.last_test_ok, k.last_test_message,
              COUNT(u.id) AS calls, COALESCE(SUM(COALESCE(u.input_tokens, 0) + COALESCE(u.output_tokens, 0)), 0) AS tokens
       FROM ai_keys k LEFT JOIN ai_usage u ON u.key_id = k.id
       GROUP BY k.id ORDER BY k.created_at`,
    )
    .all()
})

const TIMEOUT = 10_000

// The cheapest real call per provider: list the models the key can use (no tokens spent), then check the model is there.
// The key goes only to that provider's own API.
async function listModels(provider: Provider, apiKey: string): Promise<string[]> {
  const get = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      let detail = ''
      try {
        const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
        detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message ?? '')
      } catch {}
      throw new Error(
        res.status === 401 || res.status === 403
          ? `${providerLabel(provider)} refused the key (${res.status})${detail ? `: ${detail}` : ''}`
          : `${providerLabel(provider)} answered ${res.status}${detail ? `: ${detail}` : ''}`,
      )
    }
    return (await res.json()) as unknown
  }
  const ids = (j: unknown, key = 'id') => ((j as { data?: Record<string, string>[] }).data ?? []).map((m) => m[key])
  switch (provider) {
    case 'openai':
      return ids(await get('https://api.openai.com/v1/models', { Authorization: `Bearer ${apiKey}` }))
    case 'groq':
      return ids(await get('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${apiKey}` }))
    case 'anthropic':
      return ids(await get('https://api.anthropic.com/v1/models?limit=1000', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }))
    case 'google': {
      const j = (await get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': apiKey })) as {
        models?: { name: string }[]
      }
      return (j.models ?? []).map((m) => m.name.replace(/^models\//, ''))
    }
    case 'openrouter': {
      // The key endpoint checks the key; the model list is public, so it is fetched without one.
      await get('https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${apiKey}` })
      return ids(await get('https://openrouter.ai/api/v1/models', {}))
    }
  }
}

const providerLabel = (p: Provider) =>
  ({ openrouter: 'OpenRouter', groq: 'Groq', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' })[p]

async function runTest(provider: Provider, model: string, apiKey: string): Promise<KeyTest> {
  try {
    const models = await listModels(provider, apiKey)
    if (models.includes(model)) return { ok: true, message: `${providerLabel(provider)} accepted the key and offers ${model}.` }
    const words = model.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    const suggestions = models
      .map((m) => ({ m, score: words.filter((w) => m.toLowerCase().includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.m.localeCompare(b.m))
      .slice(0, 5)
      .map((x) => x.m)
    return {
      ok: false,
      message: `The key works, but ${providerLabel(provider)} does not list ${model} for it.`,
      suggestions,
    }
  } catch (e) {
    const message =
      e instanceof Error
        ? e.name === 'TimeoutError'
          ? `${providerLabel(provider)} did not answer within ${TIMEOUT / 1000} seconds.`
          : e.message
        : String(e)
    return { ok: false, message: message.replace(/[.\s]*$/, '.') }
  }
}

type KeyInput = { name: string; provider: string; model: string; apiKey: string }

const validate = (input: KeyInput) => {
  if (!isProvider(input.provider)) throw new Error(`Unknown provider: ${input.provider}`)
  const v = { name: input.name.trim(), provider: input.provider, model: input.model.trim(), apiKey: input.apiKey.trim() }
  if (!v.model || !v.apiKey) throw new Error('Model and key are required')
  return v
}

/** Test a key before it is saved. */
export const testNewKey = createServerFn({ method: 'POST' })
  .validator(validate)
  .handler(async ({ data }) => {
    requireOperator()
    return runTest(data.provider, data.model, data.apiKey)
  })

/** Save a key only if it passes a test made here, on the server, at save time. */
export const saveKey = createServerFn({ method: 'POST' })
  .validator(validate)
  .handler(async ({ data }): Promise<KeyTest & { saved: boolean; field?: 'name' }> => {
    requireOperator()
    if (!data.name) return { ok: false, saved: false, field: 'name', message: 'Give the key a name.' }
    const db = getDatabase()
    if (db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM ai_keys WHERE name = ?').get(data.name)?.n)
      return { ok: false, saved: false, field: 'name', message: `A key named ${data.name} already exists.` }
    const test = await runTest(data.provider, data.model, data.apiKey)
    if (!test.ok) return { ...test, saved: false }
    db.query(
      `INSERT INTO ai_keys (id, name, provider, model, api_key, created_at, updated_at, last_tested_at, last_test_ok, last_test_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(newId(), data.name, data.provider, data.model, data.apiKey, now(), now(), now(), test.message)
    return { ...test, saved: true }
  })

/** Test a saved key again; the key is read on the server and never sent to the client. */
export const retestKey = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    requireOperator()
    const db = getDatabase()
    const key = db
      .query<{ provider: string; model: string; api_key: string }, [string]>('SELECT provider, model, api_key FROM ai_keys WHERE id = ?')
      .get(id)
    if (!key || !isProvider(key.provider)) return { ok: false, message: 'This key no longer exists.' }
    const test = await runTest(key.provider, key.model, key.api_key)
    db.query('UPDATE ai_keys SET last_tested_at = ?, last_test_ok = ?, last_test_message = ?, updated_at = ? WHERE id = ?').run(
      now(),
      test.ok ? 1 : 0,
      test.message,
      now(),
      id,
    )
    return test
  })

export const deleteKey = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    requireOperator()
    const db = getDatabase()
    // Usage rows keep their history; they just stop pointing at a key.
    db.transaction(() => {
      db.query('UPDATE ai_usage SET key_id = NULL WHERE key_id = ?').run(id)
      db.query('DELETE FROM ai_keys WHERE id = ?').run(id)
    })()
  })

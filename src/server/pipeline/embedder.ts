import { resolve } from 'node:path'

// The embedding model runs on this machine: no key, no network after the first download (about 600 MB).
// Changing any value here changes every vector, so Embed stores them beside each vector and re-embeds on a mismatch.
export const EMBEDDING = {
  model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  /** 8-bit weights: a quarter of the size of the full model, small enough for a laptop. */
  revision: 'q8',
  dims: 1024,
  /** Qwen3 wants the task stated on queries only; documents are embedded as they are. */
  queryTask: 'Given a startup idea, retrieve startups that built something similar',
} as const

type Extractor = (texts: string[], options: { pooling: 'last_token'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
let extractor: Promise<Extractor> | undefined

function load(): Promise<Extractor> {
  extractor ??= (async () => {
    const { env, pipeline } = await import('@huggingface/transformers')
    env.cacheDir = resolve(process.env.ATHAR_MODELS_DIR ?? 'data/models')
    return (await pipeline('feature-extraction', EMBEDDING.model, { dtype: EMBEDDING.revision })) as unknown as Extractor
  })()
  extractor.catch(() => (extractor = undefined)) // a failed download may be retried
  return extractor
}

async function run(texts: string[]): Promise<Float32Array[]> {
  const out = await (await load())(texts, { pooling: 'last_token', normalize: true })
  return out.tolist().map((v) => new Float32Array(v))
}

/** Unit-length vectors for documents, one text at a time so padding can never change a vector. */
export async function embedDocuments(texts: string[]): Promise<Float32Array[]> {
  const vectors: Float32Array[] = []
  for (const text of texts) vectors.push((await run([text]))[0])
  return vectors
}

export const embedQuery = async (text: string) => (await run([`Instruct: ${EMBEDDING.queryTask}\nQuery:${text}`]))[0]

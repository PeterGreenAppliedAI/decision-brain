/**
 * Embeddings over an OpenAI-compatible /embeddings endpoint (Ollama serves one at /v1). Used for search
 * by meaning; everything that uses it falls back to words alone when it is not configured or not up.
 */
import { config } from '../config.js';

export interface Embedder { model: string; embed(texts: string[]): Promise<number[][]> }

export function createEmbedder(opts: { url?: string; model?: string; timeoutMs?: number } = {}): Embedder | null {
  const url = (opts.url ?? config.embedUrl).replace(/\/$/, '');
  if (!url) return null;
  const model = opts.model ?? config.embedModel;
  return {
    model,
    async embed(texts) {
      if (!texts.length) return [];
      const res = await fetch(`${url}/embeddings`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: texts }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000),   // long entries on a CPU-bound host take a while
      });
      if (!res.ok) throw new Error(`embeddings: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const body = await res.json() as { data: Array<{ index: number; embedding: number[] }> };
      return [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}

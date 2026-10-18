/**
 * Decisions embedded for search by meaning: (:Decision {embedding: vecf32, embedHash}). An entry is
 * (re)embedded only when its text changed since (embedHash ≠ contentHash), like extraction. The vector
 * index is created on first use, sized to the model's vectors.
 */
import { config } from '../config.js';
import type { Embedder } from '../llm/embed.js';
import type { Graph } from './db.js';

const rows = async <T>(g: Graph, cypher: string, params: Record<string, unknown> = {}) =>
  (await g.query<T>(cypher, { params: params as never })).data ?? [];

export async function hasVectorIndex(g: Graph): Promise<boolean> {
  const idx = await rows<{ types: Record<string, string[]> }>(g, "CALL db.indexes() YIELD label, types WHERE label = 'Decision' RETURN types");
  return idx.some((r) => (r.types?.embedding ?? []).includes('VECTOR'));
}

export async function embedDecisions(g: Graph, embedder: Embedder, log: (l: string) => void = () => {}): Promise<{ embedded: number; current: number }> {
  const todo = await rows<{ id: string; title: string; body: string | null; hash: string | null }>(g,
    `MATCH (d:Decision) WHERE d.embedding IS NULL OR d.embedHash IS NULL OR d.embedHash <> d.contentHash
     RETURN d.id AS id, d.title AS title, d.body AS body, d.contentHash AS hash ORDER BY d.id`);
  const current = (await rows<{ n: number }>(g, 'MATCH (d:Decision) RETURN count(d) AS n'))[0]?.n ?? 0;
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4);
    const vectors = await embedder.embed(batch.map((d) => `${d.title}\n\n${(d.body ?? '').slice(0, config.embedChars)}`));
    if (i === 0 && !(await hasVectorIndex(g))) {
      await g.query(`CREATE VECTOR INDEX FOR (d:Decision) ON (d.embedding) OPTIONS {dimension: ${vectors[0].length}, similarityFunction: 'cosine'}`);
    }
    await g.query('UNWIND $rows AS r MATCH (d:Decision {id: r.id}) SET d.embedding = vecf32(r.v), d.embedHash = r.h',
      { params: { rows: batch.map((d, k) => ({ id: d.id, v: vectors[k], h: d.hash })) as never } });
    log(`embedded ${Math.min(i + 4, todo.length)}/${todo.length}`);
  }
  return { embedded: todo.length, current: current - todo.length };
}

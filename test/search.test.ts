import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect as connectDb, type Graph } from '../src/graph/db.js';
import { ensureSchema } from '../src/graph/schema.js';
import { search, setEmbedder } from '../src/tools/graph-tools.js';

const reachable = await connectDb().then(async (db) => { await db.close(); return true; }, () => false);

describe.skipIf(!reachable)('search by words and by meaning', () => {
  let db: Awaited<ReturnType<typeof connectDb>>, g: Graph;
  beforeAll(async () => {
    db = await connectDb();
    g = db.selectGraph(`test-search-${process.pid}-${Date.now()}`);
    await ensureSchema(g);
    // "mis-copied quote" shares no word with the question below; only its vector is close to it.
    await g.query(`CREATE (:Decision {id: 'quote', title: 'A Mis-copied Quote Is Not a Rejection', date: '2026-10-15', status: 'active', source: 'D.md:1', body: 'A mis-copied quote goes back to the pool.', embedding: vecf32([1, 0, 0])}),
      (:Decision {id: 'cache', title: 'Cache size', date: '2026-10-01', status: 'active', source: 'D.md:9', body: 'Handoff of the cache keeps 50 entries.', embedding: vecf32([0, 1, 0])}),
      (:Decision {id: 'far', title: 'Unrelated', date: '2026-09-01', status: 'active', source: 'D.md:20', body: 'Voice replies.', embedding: vecf32([0, 0, 1])})`);
    await g.query("CREATE VECTOR INDEX FOR (d:Decision) ON (d.embedding) OPTIONS {dimension: 3, similarityFunction: 'cosine'}");
  });
  afterAll(async () => { setEmbedder(null); await g?.delete().catch(() => {}); await db?.close(); });

  const question = 'why are invalid handoff confirmations retried';
  const fake = (v: number[]) => ({ model: 'fake', embed: async (t: string[]) => t.map(() => v) });

  it('finds an entry by meaning when its words do not match, after the word matches', async () => {
    setEmbedder(fake([0.95, 0.05, 0]));
    const r = await search(g, question);
    expect(r.map((d) => [d.id, d.matched])).toEqual([['quote', 'meaning'], ['cache', 'any']]);
  });

  it('keeps meaning matches within the distance cutoff only', async () => {
    setEmbedder(fake([0, 0.1, 1]));                      // close to "far", which matches no word
    const r = await search(g, question);
    expect(r.find((d) => d.id === 'far')?.matched).toBe('meaning');
    setEmbedder(fake([-1, -1, -1]));                     // pointing away from everything: past the cutoff
    expect((await search(g, question)).some((d) => d.matched === 'meaning')).toBe(false);
  });

  it('falls back to words alone with no embedder, or one that fails', async () => {
    setEmbedder(null);
    expect((await search(g, question)).map((d) => d.id)).toEqual(['cache']);
    setEmbedder({ model: 'down', embed: async () => { throw new Error('connection refused'); } });
    expect((await search(g, question)).map((d) => d.id)).toEqual(['cache']);
  });
});

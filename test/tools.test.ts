/**
 * The graph tools on a small hand-built graph: what they find, how they order it, and what the
 * rationale graph leaves out. `review` is built from these, so their output must be deterministic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect as connectDb, type Graph } from '../src/graph/db.js';
import { buildRationale } from '../src/graph/rationale.js';
import { ensureSchema } from '../src/graph/schema.js';
import { connect, disproven, loadBearing, resolveTarget, search, whatBreaks, whoKnows, why } from '../src/tools/graph-tools.js';
import { renderPacket, review } from '../src/tools/review.js';
import { fileNames } from '../src/graph/rationale.js';

const reachable = await connectDb().then(async (db) => { await db.close(); return true; }, () => false);

describe.skipIf(!reachable)('graph tools', () => {
  let db: Awaited<ReturnType<typeof connectDb>>;
  let g: Graph;

  beforeAll(async () => {
    db = await connectDb();
    g = db.selectGraph(`test-tools-${process.pid}-${Date.now()}`);
    await ensureSchema(g);
    await g.query(`
      CREATE (old:Decision {id: 'old', title: 'Correct the router rule', date: '2026-07-01', status: 'superseded', source: 'DECISIONS.md:9-12', sourceFile: 'DECISIONS.md', body: 'router prompt rule corrected'}),
             (new:Decision {id: 'new', title: 'The wrong router rule was load-bearing', date: '2026-09-30', status: 'active', source: 'DECISIONS.md:1-8', sourceFile: 'DECISIONS.md', body: 'router prompt rule reverted after an A/B'}),
             (mem:Decision {id: 'mem', title: 'Memory store dedup', date: '2026-10-05', status: 'active', source: 'DECISIONS.md:13-20', sourceFile: 'DECISIONS.md', body: 'memory facts deduplicated in the fact-store'}),
             (prompt:File {path: 'src/router/prompt.ts'}), (store:File {path: 'src/memory/fact-store.ts'}),
             (log:File {path: 'DECISIONS.md'}), (lock:File {path: 'package-lock.json'}), (doc:File {path: 'README.md'}),
             (ada:Person {name: 'Ada', kind: 'human'}), (bo:Person {name: 'Bo', kind: 'human'}), (bot:Person {name: 'Claude X', kind: 'agent'}),
             (c1:Commit {sha: 'c1c1c1c1aa', date: '2026-07-01T10:00:00Z'}), (c2:Commit {sha: 'c2c2c2c2bb', date: '2026-09-30T10:00:00Z'}), (c3:Commit {sha: 'c3c3c3c3cc', date: '2026-10-05T10:00:00Z'}),
             (old)-[:RECORDED_IN]->(c1), (new)-[:RECORDED_IN]->(c2), (mem)-[:RECORDED_IN]->(c3),
             (c1)-[:TOUCHED]->(prompt), (c1)-[:TOUCHED]->(log),
             (c2)-[:TOUCHED]->(prompt), (c2)-[:TOUCHED]->(log), (c2)-[:TOUCHED]->(lock), (c2)-[:TOUCHED]->(doc),
             (c3)-[:TOUCHED]->(store), (c3)-[:TOUCHED]->(log),
             (ada)-[:AUTHORED]->(c1), (ada)-[:AUTHORED]->(c2), (bo)-[:AUTHORED]->(c2), (bot)-[:AUTHORED]->(c2), (bo)-[:AUTHORED]->(c3),
             (new)-[:SUPERSEDES]->(old),
             (cy:Person {name: 'Cy', kind: 'human'}), (c4:Commit {sha: 'c4c4c4c4dd', date: '2026-08-15T10:00:00Z', message: 'tweak the prompt'}),
             (cy)-[:AUTHORED]->(c4), (c4)-[:TOUCHED]->(prompt),
             (new)-[:BECAUSE]->(:Measurement {id: 'm1', metric: 'routing', value: '0/20 vs 16/20', quote: 'scored 0/20 vs 16/20'}),
             (old)-[:TESTED]->(:Experiment {id: 'e1', hypothesis: 'the corrected rule routes better', verdict: 'disproven', quote: 'it did not'}),
             (router:Concept {name: 'router prompt'}), (new)-[:ABOUT]->(router), (old)-[:ABOUT]->(router),
             (memc:Concept {name: 'memory'}), (mem)-[:ABOUT]->(memc), (new)-[:ABOUT]->(memc)`);
    await buildRationale(g);
  });
  afterAll(async () => { await g?.delete().catch(() => {}); await db?.close(); });

  it('resolves exact ids, files by unique suffix, concepts — and suggests when nothing matches', async () => {
    expect(await resolveTarget(g, 'new')).toEqual({ kind: 'decision', id: 'new' });
    expect(await resolveTarget(g, 'prompt.ts')).toEqual({ kind: 'file', path: 'src/router/prompt.ts' });
    expect(await resolveTarget(g, 'Router Prompt')).toEqual({ kind: 'concept', name: 'router prompt' });
    expect(await resolveTarget(g, 'router')).toEqual({ kind: 'concept', name: 'router' });   // a word of "router prompt"
    expect(await resolveTarget(g, 'rout')).toMatchObject({ kind: 'none', suggestions: ['router prompt', 'src/router/prompt.ts'] });
  });

  it('leaves the decision log, lockfiles and docs out of the rationale graph', async () => {
    const files = (await g.roQuery<{ p: string }>('MATCH (:Decision)-[:RATIONALE]->(f:File) RETURN DISTINCT f.path AS p ORDER BY p')).data!.map((r) => r.p);
    expect(files).toEqual(['src/memory/fact-store.ts', 'src/router/prompt.ts']);
  });

  it('why: newest first, with how each decision connects and its evidence', async () => {
    const w = await why(g, 'src/router/prompt.ts');
    expect(w.decisions.map((d) => [d.id, d.via, d.measurements.map((m) => m.value)])).toEqual([
      ['new', ['recorded'], ['0/20 vs 16/20']], ['old', ['recorded'], []],
    ]);
  });

  it('what_breaks: standing decisions to re-check, settled ones kept apart as history', async () => {
    const b = await whatBreaks(g, 'prompt.ts');
    expect(b.recheck.map((d) => d.id)).toEqual(['new']);
    expect(b.history.map((d) => d.id)).toEqual(['old']);
  });

  it('disproven: experiments that failed and decisions that were dropped, around a concept', async () => {
    const d = await disproven(g, 'router prompt');
    expect(d.experiments.map((e) => [e.id, e.decision.id])).toEqual([['e1', 'old']]);
    expect(d.decisions.map((x) => x.id)).toEqual(['old']);
  });

  it('a topic finds every concept it is a whole word of, and nothing it is only a fragment of', async () => {
    expect((await why(g, 'router')).decisions.map((d) => d.id)).toEqual(['new', 'old']);
    expect((await why(g, 'prompt')).decisions.map((d) => d.id)).toEqual(['new', 'old']);
    expect((await why(g, 'rout')).decisions).toEqual([]);
  });

  it('who_knows: humans ranked by commits on the file, agents listed apart', async () => {
    const k = await whoKnows(g, 'src/router/prompt.ts');
    expect(k.people.map((p) => [p.name, p.commits])).toEqual([['Ada', 2], ['Bo', 1], ['Cy', 1]]);
    expect(k.agents.map((p) => p.name)).toEqual(['Claude X']);
  });

  it('connect: a chain through decisions and concepts, never through a person or the log file', async () => {
    const c = await connect(g, 'src/router/prompt.ts', 'src/memory/fact-store.ts');
    const keys = c.path!.nodes.map((n) => n.key);
    expect(keys[0]).toBe('src/router/prompt.ts');
    expect(keys.at(-1)).toBe('src/memory/fact-store.ts');
    expect(keys).not.toContain('DECISIONS.md');
    expect(c.path!.nodes.some((n) => n.label === 'Person')).toBe(false);
  });

  it('load_bearing ranks only files, and is the same on every run', async () => {
    const a = await loadBearing(g);
    expect(a.map((f) => f.path).sort()).toEqual(['src/memory/fact-store.ts', 'src/router/prompt.ts']);
    expect(await loadBearing(g)).toEqual(a);
  });

  it('review: the change records its own decision; earlier ones on its files are re-checks; later ones are not shown', async () => {
    const p = await review(g, 'c2c2c2c');
    expect(p.asOf).toBe('2026-09-30');
    expect(p.items.map((i) => [i.id, i.kind, i.decision?.id ?? i.reviewer?.name])).toEqual([
      ['C1', 'records', 'new'],
      ['S1', 'superseded', 'old'],
      ['P1', 'reviewer', 'Cy'],                             // Ada and Bo wrote this change — not suggested
    ]);
    // the superseded decision's disproven experiment is history under it, not a live "do not retry"
    expect(p.items.find((i) => i.kind === 'superseded')!.triedThen!.map((e) => e.id)).toEqual(['e1']);
    expect(p.items.find((i) => i.kind === 'superseded')!.supersededBy).toEqual([{ id: 'new', title: 'The wrong router rule was load-bearing' }]);
    // Reviewing the July commit: only what was known in July. The decision it records is not yet
    // superseded (that happened in September), and Bo's only commit on the file is from September.
    const july = await review(g, 'c1c1c1c');
    expect(july.items.map((i) => [i.kind, i.decision?.id ?? i.reviewer?.name])).toEqual([['records', 'old']]);
  });

  it('review between a decision and its replacement: the old decision is still standing — re-check it', async () => {
    const aug = await review(g, 'c4c4c4c');
    expect(aug.items.map((i) => [i.id, i.kind, i.decision?.id ?? i.reviewer?.name])).toEqual([
      ['R1', 'recheck', 'old'],
      ['D1', 'disproven', 'old'],
      ['P1', 'reviewer', 'Ada'],
    ]);
  });

  it('review is identical on every run — the packet a write-up is checked against', async () => {
    const a = await review(g, 'c2c2c2c');
    expect(await review(g, 'c2c2c2c')).toEqual(a);
    expect(renderPacket(a)).toContain('**C1** **The wrong router rule was load-bearing**');
  });

  it('a recording commit file counts only when the entry names it, by stem or a distinctive directory', () => {
    const share = new Map([['src', 0.9], ['test', 0.4], ['pipeline', 0.05], ['chrome-extension', 0.02], ['entrypoints', 0.02]]);
    expect(fileNames('test/pipeline/verification.test.ts', share, 0.1)).toEqual(['verification', 'pipeline']);
    expect(fileNames('chrome-extension/entrypoints/background.ts', share, 0.1)).toEqual(['background', 'chrome extension', 'entrypoints']);
    expect(fileNames('src/a.ts', share, 0.1)).toEqual([]);
  });

  it('search fails loudly on a graph without its full-text index, instead of finding nothing', async () => {
    const bare = db.selectGraph(`test-bare-${process.pid}-${Date.now()}`);
    await bare.query("CREATE (:Decision {id: 'x', title: 'deletion', body: 'deletion'})");
    await expect(search(bare, 'deletion')).rejects.toThrow(/no full-text index/);
    await bare.delete();
  });

  it('search puts entries with every word first', async () => {
    const r = await search(g, 'router rule reverted');
    expect(r[0]).toMatchObject({ id: 'new', matched: 'all' });
  });
});

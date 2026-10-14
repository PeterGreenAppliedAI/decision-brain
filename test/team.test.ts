/**
 * The extraction team against a real FalkorDB, with a scripted model in place of GLM: claims,
 * expiry and takeover, a cross-reference handed from one agent to another, and the integrator.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claimHandoff, claimSection, completeSection, registerAgent, resolveHandoff, seedBoard } from '../src/board/board.js';
import { integrate } from '../src/board/integrate.js';
import { connect, type Graph } from '../src/graph/db.js';
import type { JsonClient } from '../src/llm/openai.js';
import { contentHash } from '../src/ingest/decisions.js';
import { handoffUser, verifyExtraction, verifyHandoff, type Extraction } from '../src/team/extract.js';
import { runWorker } from '../src/team/worker.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

const NEW_BODY = 'We reverted the corrected rule: it scored 0/20 vs 16/20 for the current text. This supersedes the July rule change.';
const OLD_BODY = 'The router prompt rule was corrected to say memory lives in the graph. Measured on the small tier.';
const OTHER_BODY = 'Voice moved to the Mini; qwen3.5:9b stays the foreground model.';
const index = [
  { id: 'd-new', date: '2026-09-30', title: 'The wrong rule was load-bearing' },
  { id: 'd-old', date: '2026-07-01', title: 'Correct the router rule' },
  { id: 'd-other', date: '2026-08-01', title: 'Voice comes home' },
];

/** A model that answers from a script keyed by entry id, after a small delay. */
function scriptedLlm(delayMs = 20): JsonClient & { calls: string[] } {
  const calls: string[] = [];
  const extraction = (id: string): Extraction => ({
    measurements: id === 'd-new' ? [{ metric: 'rule A/B', value: '0/20 vs 16/20', quote: 'it scored 0/20 vs 16/20 for the current text' },
      { metric: 'made up', value: '99%', quote: 'this sentence is not in the entry at all' }] : [],
    experiments: [],
    concepts: id === 'd-other' ? ['voice', 'teleportation'] : ['router prompt'],
    models: id === 'd-other' ? ['qwen3.5:9b'] : [],
    references: id === 'd-new' ? [{ target_id: 'd-old', relation: 'supersedes', quote: 'This supersedes the July rule change.' }] : [],
  });
  return {
    model: 'scripted',
    calls,
    async json<T>(req: { schemaName: string; user: string }) {
      await new Promise((r) => setTimeout(r, delayMs));
      const id = /Entry id: (\S+)/.exec(req.user)?.[1] ?? 'handoff';
      calls.push(`${req.schemaName}:${id}`);
      const value = req.schemaName === 'handoff_verdict'
        ? { confirmed: true, quote: 'The router prompt rule was corrected to say memory lives in the graph.', reason: 'the newer entry reverts this correction' }
        : extraction(id);
      return { value: value as T, reasoning: '', promptTokens: 0, completionTokens: 0, ms: delayMs };
    },
  } as unknown as JsonClient & { calls: string[] };
}

describe('verifyExtraction (no database)', () => {
  it('verifies quoted items and keeps the rest on the board with the reason', () => {
    const x: Extraction = {
      measurements: [{ metric: 'a', value: '0/20 vs 16/20', quote: 'it scored 0/20 vs 16/20 for the current text' },
        { metric: 'b', value: '42', quote: 'it scored 0/20 vs 16/20 for the current text' }],
      experiments: [{ hypothesis: 'h', verdict: 'disproven', quote: 'short' }],
      concepts: ['Router Prompt', 'router prompt', 'graph', 'quantum'],
      models: [],
      references: [{ target_id: 'nope', relation: 'revises', quote: 'This supersedes the July rule change.' },
        { target_id: 'd-new', relation: 'revises', quote: 'This supersedes the July rule change.' }],
    };
    const out = verifyExtraction(x, { id: 'd-new', body: NEW_BODY.replace('rule:', 'rule:\n') + ' Router prompt and graph.' }, index);
    expect(out.map((f) => [f.kind, f.verified, f.reason])).toEqual([
      ['measurement', true, null],
      ['measurement', false, 'value not inside its quote'],
      ['experiment', false, 'quote too short'],
      ['concept', true, null],
      ['concept', true, null],
      ['concept', false, 'not in the entry text'],
      ['cross_ref', false, 'target id not in the log'],
      ['cross_ref', false, 'an entry cannot reference itself'],
    ]);
  });

  it("confirms a handoff only when the second agent's quote is really in the target", () => {
    expect(verifyHandoff({ confirmed: true, quote: 'The router prompt rule was corrected', reason: 'r' }, OLD_BODY).confirmed).toBe(true);
    expect(verifyHandoff({ confirmed: true, quote: 'something it never said at all', reason: 'r' }, OLD_BODY))
      .toEqual({ confirmed: false, quote: null, reason: 'claimed confirmed, but quote not found verbatim in the entry' });
  });
});

describe('handoffUser (no database)', () => {
  it('tells the checker which side it is reading, whichever side raised the claim', () => {
    const newer = { id: 'd-new', title: 'New' }, older = { id: 'd-old', title: 'Old' };
    const forward = handoffUser({ relation: 'supersedes', raiser: newer, quote: 'q', other: { ...older, body: 'b' } });
    expect(forward).toContain('"New" (d-new) supersedes "Old" (d-old)');
    expect(forward).toContain('the OLDER one (d-old)');
    const back = handoffUser({ relation: 'superseded_by', raiser: older, quote: 'q', other: { ...newer, body: 'b' } });
    expect(back).toContain('"New" (d-new) supersedes "Old" (d-old)');
    expect(back).toContain('the NEWER one (d-new)');
  });
});

describe.skipIf(!reachable)('the team on a real board', () => {
  let db: Awaited<ReturnType<typeof connect>>;
  let brain: Graph;
  let board: Graph;
  const tag = `${process.pid}-${Date.now()}`;
  let n = 0;
  /** Stamp hand-made decisions with their content hash, as ingest does. */
  const stamp = async () => {
    const ds = (await brain.roQuery<{ id: string; title: string; body: string }>('MATCH (d:Decision) RETURN d.id AS id, d.title AS title, d.body AS body')).data!;
    await brain.query('UNWIND $rows AS r MATCH (d:Decision {id: r.id}) SET d.contentHash = r.h',
      { params: { rows: ds.map((d) => ({ id: d.id, h: contentHash(d.title, d.body) })) as never } });
  };
  const hashOf = async (id: string) => (await brain.roQuery<{ h: string }>('MATCH (d:Decision {id: $id}) RETURN d.contentHash AS h', { params: { id } })).data![0].h;

  beforeEach(async () => {
    db ??= await connect();
    n++;
    brain = db.selectGraph(`test-brain-${tag}-${n}`);
    board = db.selectGraph(`test-brain-${tag}-${n}__board`);
    await brain.query(
      `UNWIND $rows AS r CREATE (:Decision {id: r.id, title: r.title, date: r.date, body: r.body})`,
      { params: { rows: [
        { ...index[0], body: NEW_BODY }, { ...index[1], body: OLD_BODY }, { ...index[2], body: OTHER_BODY },
      ] as never } });
    await stamp();
    await seedBoard(board, brain);
  });
  afterEach(async () => {
    await brain.delete().catch(() => {});
    await board.delete().catch(() => {});
  });
  afterAll(async () => { await db?.close(); });

  const worker = (name: string, llm: JsonClient, extra: Partial<Parameters<typeof runWorker>[0]> = {}) =>
    registerAgent(board, name, llm.model).then(() => runWorker({
      name, board, brain, llm, index, ttlMs: 2000, maxAttempts: 3, idlePollMs: 50, ...extra,
    }));

  it('gives concurrent claimers different sections', async () => {
    await Promise.all(['a', 'b', 'c', 'd'].map((a) => registerAgent(board, a, 'm')));
    const claims = await Promise.all(['a', 'b', 'c', 'd'].map((a) => claimSection(board, a, 5000, 3)));
    const ids = claims.map((c) => c?.id ?? null);
    expect(ids.filter(Boolean).sort()).toEqual(['d-new', 'd-old', 'd-other']);
    expect(ids.filter((x) => x === null)).toHaveLength(1);
  });

  it('drops late work from a worker whose claim expired and was taken over', async () => {
    await registerAgent(board, 'slow', 'm');
    await registerAgent(board, 'fast', 'm');
    const t0 = Date.now();
    const first = await claimSection(board, 'slow', 100, 3, t0);
    const taken = await claimSection(board, 'fast', 100, 3, t0 + 1000);   // slow's claim has expired
    expect(taken).toEqual({ id: first!.id, takeover: true, fromAgent: 'slow' });
    expect(await completeSection(board, 'slow', first!.id, [], 'late')).toBe(false);
    expect(await completeSection(board, 'fast', first!.id, [], 'on time')).toBe(true);
  });

  it('runs three workers to completion; a cross-ref raised by one is confirmed by another and integrated', async () => {
    const llm = scriptedLlm();
    const stats = await Promise.all(['w1', 'w2', 'w3'].map((w) => worker(w, llm)));
    expect(stats.reduce((s, x) => s + x.sections, 0)).toBe(3);
    expect(stats.reduce((s, x) => s + x.handoffs, 0)).toBe(1);

    const h = (await board.roQuery<{ status: string; raisedBy: string; resolvedBy: string }>(
      `MATCH (f:Finding)-[:RAISED]->(h:Handoff)-[:FOR]->(:Section {id: 'd-old'}), (f)-[:FROM]->(a:Agent)
       RETURN h.status AS status, a.name AS raisedBy, h.resolvedBy AS resolvedBy`)).data!;
    expect(h).toHaveLength(1);
    expect(h[0].status).toBe('confirmed');
    expect(h[0].resolvedBy).not.toBe(h[0].raisedBy);                     // two agents agreed

    const report = await integrate(board, brain);
    expect(report).toEqual({ measurements: 1, experiments: 0, concepts: 2, models: 1, edges: 1, generic: [], stale: { findings: 0, handoffs: 0 } });  // 3 entries: below the minimum count
    const edge = (await brain.roQuery<{ s: string; t: string; by: string; ok: string }>(
      'MATCH (s:Decision)-[e:SUPERSEDES]->(t:Decision) RETURN s.id AS s, t.id AS t, e.raisedBy AS by, e.confirmedBy AS ok')).data!;
    expect(edge).toEqual([{ s: 'd-new', t: 'd-old', by: h[0].raisedBy, ok: h[0].resolvedBy }]);
    const concepts = (await brain.roQuery<{ c: string }>('MATCH (c:Concept) RETURN c.name AS c ORDER BY c')).data!.map((r) => r.c);
    expect(concepts).toEqual(['router prompt', 'voice']);                // "teleportation" was never in the text

    // Integrating again converges rather than duplicating.
    expect(await integrate(board, brain)).toEqual(report);
    expect((await brain.roQuery<{ n: number }>('MATCH (m:Measurement) RETURN count(m) AS n')).data![0].n).toBe(1);
  });

  it('recovers from a worker that crashes holding a claim: its section is taken over after expiry', async () => {
    const llm = scriptedLlm();
    const crashed = worker('crashy', llm, { crashAfterClaims: 0, ttlMs: 300 });
    await crashed;
    const survivor = await worker('steady', llm, { ttlMs: 300 });
    expect(survivor.sections).toBe(3);
    const events = (await board.roQuery<{ kind: string; text: string }>(
      "MATCH (e:Event {kind: 'takeover'}) RETURN e.kind AS kind, e.text AS text")).data!;
    expect(events).toEqual([{ kind: 'takeover', text: 'took over from crashy (claim expired)' }]);
  });

  it("links a concept nearly every entry contains only broadly — kept for topics, never a path", async () => {
    await brain.query(`UNWIND range(1, 6) AS i CREATE (:Decision {id: 'x' + toString(i), title: 't', body: 'LocalClaw did thing ' + toString(i)})`);
    await brain.query("MATCH (d:Decision) WHERE d.id STARTS WITH 'd-' SET d.body = d.body + ' LocalClaw.'");
    await stamp();
    await seedBoard(board, brain);
    await registerAgent(board, 'w', 'm');
    const c = await claimSection(board, 'w', 5000, 3);
    await completeSection(board, 'w', c!.id, [
      { kind: 'concept', data: { name: 'LocalClaw' }, quote: null, verified: true, reason: null },
      { kind: 'concept', data: { name: 'thing 3' }, quote: null, verified: true, reason: null },
    ], 'test', Date.now(), await hashOf(c!.id));
    const report = await integrate(board, brain);
    expect(report.generic).toEqual([{ name: 'localclaw', share: 1 }]);
    expect((await brain.roQuery<{ c: string; r: string }>('MATCH (:Decision)-[r]->(c:Concept) RETURN c.name AS c, type(r) AS r ORDER BY c')).data)
      .toEqual([{ c: 'localclaw', r: 'ABOUT_BROADLY' }, { c: 'thing 3', r: 'ABOUT' }]);
  });

  it('an older entry pointing forward (superseded_by) becomes the same newer → older SUPERSEDES edge', async () => {
    await registerAgent(board, 'reader', 'm');
    await registerAgent(board, 'checker', 'm');
    let c = await claimSection(board, 'reader', 5000, 3);
    while (c && c.id !== 'd-old') { await completeSection(board, 'reader', c.id, [], 'skip'); c = await claimSection(board, 'reader', 5000, 3); }
    await completeSection(board, 'reader', 'd-old', [{ kind: 'cross_ref', data: { target: 'd-new', relation: 'superseded_by' },
      quote: 'The router prompt rule was corrected', verified: true, reason: null, target: 'd-new', relation: 'superseded_by' }], 'test', Date.now(), await hashOf('d-old'));
    const h = await claimHandoff(board, 'checker', 5000, 3);
    expect(h).toMatchObject({ relation: 'superseded_by', source: 'd-old', target: 'd-new', raisedBy: 'reader' });
    await resolveHandoff(board, 'checker', h!.key, { confirmed: true, quote: 'We reverted the corrected rule', reason: 'r' }, Date.now(), await hashOf('d-new'));
    await integrate(board, brain);
    const edges = (await brain.roQuery<{ s: string; t: string; q: string; tq: string }>(
      'MATCH (s:Decision)-[e:SUPERSEDES]->(t:Decision) RETURN s.id AS s, t.id AS t, e.quote AS q, e.targetQuote AS tq')).data!;
    expect(edges).toEqual([{ s: 'd-new', t: 'd-old', q: 'We reverted the corrected rule', tq: 'The router prompt rule was corrected' }]);
  });

  it('editing an entry (same title) invalidates what was extracted from its old text, until the team re-extracts it', async () => {
    const llm = scriptedLlm();
    await Promise.all(['w1', 'w2'].map((w) => worker(w, llm)));
    const before = await integrate(board, brain);
    expect([before.measurements, before.edges]).toEqual([1, 1]);

    // Re-ingest after someone edits the OLD entry's text: its title, and so its id, is unchanged.
    await brain.query("MATCH (d:Decision {id: 'd-old'}) SET d.body = 'The router prompt rule was corrected after review. Nothing measured.'");
    await stamp();
    const stale = await integrate(board, brain);
    expect(stale.edges).toBe(0);                                   // the confirmation quoted text that no longer exists
    expect(stale.stale.handoffs).toBe(1);
    expect(stale.measurements).toBe(1);                            // d-new's own evidence is untouched
    expect((await brain.roQuery<{ n: number }>('MATCH ()-[r:SUPERSEDES]->() RETURN count(r) AS n')).data![0].n).toBe(0);

    // Seeding notices, and queues exactly that entry for re-extraction.
    const seed = await seedBoard(board, brain);
    expect(seed.changed).toEqual(['d-old']);
    const status = (await board.roQuery<{ s: string; h: string }>(
      "MATCH (s:Section {id: 'd-old'}) MATCH (h:Handoff)-[:FOR]->(s) RETURN s.status AS s, h.status AS h")).data![0];
    expect(status).toEqual({ s: 'pending', h: 'open' });
    expect((await board.roQuery<{ n: number }>("MATCH (f:Finding {stale: true})-[:ABOUT]->(:Section {id: 'd-old'}) RETURN count(f) AS n")).data![0].n).toBeGreaterThan(0);

    // The team runs again: only the changed entry and the reopened handoff are worked; evidence is current again.
    const calls = llm.calls.length;
    await Promise.all(['w1', 'w2'].map((w) => worker(w, llm)));
    expect(llm.calls.slice(calls).sort()).toEqual(['extraction:d-old', 'handoff_verdict:handoff']);
    const after = await integrate(board, brain);
    expect(after.stale).toEqual({ findings: 0, handoffs: 0 });
  });

  it('a full seed removes entries that no longer exist; a limited seed never does', async () => {
    await brain.query("MATCH (d:Decision {id: 'd-other'}) DETACH DELETE d");
    expect((await seedBoard(board, brain, 1)).removed).toBe(0);
    expect((await board.roQuery<{ n: number }>("MATCH (s:Section {id: 'd-other'}) RETURN count(s) AS n")).data![0].n).toBe(1);
    expect((await seedBoard(board, brain)).removed).toBeGreaterThan(0);
    expect((await board.roQuery<{ n: number }>("MATCH (s:Section {id: 'd-other'}) RETURN count(s) AS n")).data![0].n).toBe(0);
  });

  it('a lone worker never confirms its own cross-ref, and stops instead of waiting forever', async () => {
    const llm = scriptedLlm(5);
    const stats = await worker('alone', llm, { ttlMs: 300 });
    expect(stats.sections).toBe(3);
    expect(stats.handoffs).toBe(0);
    const open = (await board.roQuery<{ s: string }>('MATCH (h:Handoff) RETURN h.status AS s')).data!;
    expect(open).toEqual([{ s: 'open' }]);
    expect(llm.calls.filter((c) => c.startsWith('handoff'))).toEqual([]);
  });
});

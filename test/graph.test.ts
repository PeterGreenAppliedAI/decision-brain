/**
 * Against a real FalkorDB (npm run graph:up, or the CI service). Builds a throwaway git repo,
 * ingests it into its own graph, traces a decision, and deletes the graph.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type Graph } from '../src/graph/db.js';
import { ingestRepo } from '../src/ingest/repo.js';
import { trace } from '../src/tools/trace.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

describe.skipIf(!reachable)('ingest + trace on a real FalkorDB', () => {
  let db: Awaited<ReturnType<typeof connect>>;
  let graph: Graph;
  let repo: string;
  let revertSha: string;
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-fixture-'));
    git('init', '-q');
    git('config', 'user.name', 'Ada Dev');
    git('config', 'user.email', 'ada@example.com');
    mkdirSync(join(repo, 'src/router'), { recursive: true });
    writeFileSync(join(repo, 'src/router/prompt.ts'), 'export const rule = "wrong but load-bearing";\n');
    git('add', '.');
    git('commit', '-q', '-m', 'Router prompt: first version');
    // Cite the shortest prefix (≥ 7) that has a letter and a digit, as a hash must to be recognised.
    // A plain --short hash is all digits ~4% of the time ((10/16)^7) — this test used to flake on it.
    const full = git('rev-parse', 'HEAD');
    const firstSha = full.slice(0, Math.max(7, full.search(/[a-f]/) + 1, full.search(/\d/) + 1));

    writeFileSync(join(repo, 'src/router/prompt.ts'), 'export const rule = "restored";\n');
    writeFileSync(join(repo, 'DECISIONS.md'),
      `# Decisions\n\n## The Wrong Rule Was Load-Bearing (September 30 2026)\n\n` +
      `Measured and reverted; the rule came from ${firstSha}. See \`router/prompt.ts\`.\n`);
    git('add', '.');
    git('commit', '-q', '-m', 'Router prompt: revert the corrected rule', '-m', 'Co-Authored-By: Claude Test <noreply@anthropic.com>');
    revertSha = git('rev-parse', 'HEAD');

    db = await connect();
    graph = db.selectGraph(`test-${process.pid}-${Date.now()}`);
    await ingestRepo(graph, repo);
  });

  afterAll(async () => {
    await graph?.delete().catch(() => {});
    await db?.close();
    rmSync(repo, { recursive: true, force: true });
  });

  it('traces a decision to the commit that recorded it, its citation, its file and its people', async () => {
    const t = await trace(graph, '2026-09-30-the-wrong-rule-was-load-bearing');
    expect(t).not.toBeNull();
    expect(t!.decision.source).toBe('DECISIONS.md:3-5');
    expect(t!.recordedIn.map((c) => c.sha)).toEqual([revertSha]);
    expect(t!.recordedIn[0].files.sort()).toEqual(['DECISIONS.md', 'src/router/prompt.ts']);
    expect(t!.recordedIn[0].authors.sort()).toEqual(['Ada Dev', 'Claude Test']);
    expect(t!.cites.map((c) => c.message)).toEqual(['Router prompt: first version']);
    expect(t!.mentions).toEqual(['src/router/prompt.ts']);
  });

  it('marks agents apart from humans and is idempotent on re-ingest', async () => {
    await ingestRepo(graph, repo);
    const people = await graph.roQuery<{ name: string; kind: string }>('MATCH (p:Person) RETURN p.name AS name, p.kind AS kind ORDER BY name');
    expect(people.data).toEqual([{ name: 'Ada Dev', kind: 'human' }, { name: 'Claude Test', kind: 'agent' }]);
    const edges = await graph.roQuery<{ t: string; n: number }>('MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS n ORDER BY t');
    expect(Object.fromEntries(edges.data!.map((e) => [e.t, e.n]))).toEqual({
      AUTHORED: 3, TOUCHED: 3, RECORDED_IN: 1, CITES: 1, MENTIONS: 1,
      RATIONALE: 2,   // prompt.ts is named by the entry AND changed by its recording commit: one edge per via
    });
  });

  it('returns null for an unknown decision', async () => {
    expect(await trace(graph, 'no-such-decision')).toBeNull();
  });
});

describe.skipIf(!reachable)('re-ingest converges on the repo as it is now', () => {
  let db: Awaited<ReturnType<typeof connect>>;
  let graph: Graph;
  let repo: string;
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const count = async (q: string) => (await graph.roQuery<{ n: number }>(q)).data![0].n;
  const write = (path: string, text: string) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), text); };

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-converge-'));
    git('init', '-q');
    git('config', 'user.name', 'Ada Dev');
    git('config', 'user.email', 'ada@example.com');
    write('docs/ünïcode café.md', 'x\n');
    write('DECISIONS.md', '# D\n\n## Old Title (May 1 2026)\n\nSee `docs/ünïcode café.md`.\n');
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    write('b.ts', 'b\n');
    git('add', '.');
    git('commit', '-q', '-m', 'second, to be rewritten away');
    db = await connect();
    graph = db.selectGraph(`test-converge-${process.pid}-${Date.now()}`);
    await ingestRepo(graph, repo);
  });

  afterAll(async () => {
    await graph?.delete().catch(() => {});
    await db?.close();
    rmSync(repo, { recursive: true, force: true });
  });

  it('keeps non-ASCII paths as written, so mentions resolve', async () => {
    const t = await trace(graph, '2026-05-01-old-title');
    expect(t!.mentions).toEqual(['docs/ünïcode café.md']);
  });

  it('drops a retitled entry and commits a history rewrite removed, with their orphans', async () => {
    expect(await count('MATCH (c:Commit) RETURN count(c) AS n')).toBe(2);
    git('reset', '-q', '--hard', 'HEAD~1');                       // the rewrite: "second" is gone
    write('DECISIONS.md', '# D\n\n## New Title (May 1 2026)\n\nNo mentions now.\n');
    git('commit', '-q', '-am', 'retitle');
    await ingestRepo(graph, repo);

    const ids = (await graph.roQuery<{ id: string }>('MATCH (d:Decision) RETURN d.id AS id')).data!.map((r) => r.id);
    expect(ids).toEqual(['2026-05-01-new-title']);
    const messages = (await graph.roQuery<{ m: string }>('MATCH (c:Commit) RETURN c.message AS m ORDER BY m')).data!.map((r) => r.m);
    expect(messages).toEqual(['first', 'retitle']);
    expect(await count("MATCH (f:File {path: 'b.ts'}) RETURN count(f) AS n")).toBe(0);
    expect(await count('MATCH (:Decision)-[r:MENTIONS]->() RETURN count(r) AS n')).toBe(0);
  });

  it('refuses a path that is not a repo before creating anything', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'db-empty-'));
    const g = db.selectGraph(`test-never-${process.pid}`);
    await expect(ingestRepo(g, empty)).rejects.toThrow(/not a git repository/);
    expect(await db.list()).not.toContain(`test-never-${process.pid}`);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe.skipIf(!reachable)('no stale window: editing an entry removes its published evidence at ingest', () => {
  let db: Awaited<ReturnType<typeof connect>>, g: Graph, repo: string;
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  const count = async (q: string) => (await g.roQuery<{ n: number }>(q)).data![0].n;
  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-window-'));
    git('init', '-q'); git('config', 'user.name', 'A'); git('config', 'user.email', 'a@x');
    writeFileSync(join(repo, 'DECISIONS.md'), '# D\n\n## Cache Size (May 1 2026)\n\nWe keep 50 entries; hit rate 9/10.\n\n## Other (May 2 2026)\n\nUnrelated.\n');
    git('add', '.'); git('commit', '-q', '-m', 'one');
    db = await connect(); g = db.selectGraph(`test-window-${process.pid}-${Date.now()}`);
    await ingestRepo(g, repo);
    // what integration would have published, for both entries
    await g.query(`MATCH (a:Decision {id: '2026-05-01-cache-size'}), (b:Decision {id: '2026-05-02-other'})
      CREATE (a)-[:BECAUSE]->(:Measurement {id: 'm1', value: '9/10'}), (b)-[:BECAUSE]->(:Measurement {id: 'm2', value: '1/1'}),
             (a)-[:ABOUT]->(:Concept {name: 'cache'}), (a)-[:REVISES {via: 'board'}]->(b), (b)-[:SUPERSEDES {via: 'status'}]->(a)`);
  });
  afterAll(async () => { await g?.delete().catch(() => {}); await db?.close(); rmSync(repo, { recursive: true, force: true }); });

  it('removes the edited entry\'s evidence and board relations — and nothing of the unchanged entry', async () => {
    writeFileSync(join(repo, 'DECISIONS.md'), '# D\n\n## Cache Size (May 1 2026)\n\nWe keep 80 entries now; hit rate 7/10.\n\n## Other (May 2 2026)\n\nUnrelated.\n');
    git('commit', '-q', '-am', 'edit');
    await ingestRepo(g, repo);
    expect(await count("MATCH (:Decision {id: '2026-05-01-cache-size'})-[:BECAUSE]->(m) RETURN count(m) AS n")).toBe(0);
    expect(await count("MATCH (:Decision {id: '2026-05-01-cache-size'})-[:ABOUT]->(c) RETURN count(c) AS n")).toBe(0);
    expect(await count("MATCH ()-[r:REVISES {via: 'board'}]->() RETURN count(r) AS n")).toBe(0);
    expect(await count("MATCH (:Decision {id: '2026-05-02-other'})-[:BECAUSE]->(m) RETURN count(m) AS n")).toBe(1);
  });
});

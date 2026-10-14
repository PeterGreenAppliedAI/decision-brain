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
    const firstSha = git('rev-parse', '--short', 'HEAD');

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
    const edges = await graph.roQuery<{ n: number }>('MATCH ()-[r]->() RETURN count(r) AS n');
    expect(edges.data![0].n).toBe(1 + 2 + 1 + 2 + 1 + 1 + 1); // AUTHORED×3, TOUCHED×3, RECORDED_IN, CITES, MENTIONS
  });

  it('returns null for an unknown decision', async () => {
    expect(await trace(graph, 'no-such-decision')).toBeNull();
  });
});

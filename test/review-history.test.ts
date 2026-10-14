/**
 * review as of a past commit, rebuilt from the decision log as it stood then — versus the by-date
 * approximation. The fixture holds the cases an outside review raised: an entry written later but
 * dated earlier, an entry edited after the commit, an entry marked superseded later.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type Graph } from '../src/graph/db.js';
import { ingestRepo } from '../src/ingest/repo.js';
import { review } from '../src/tools/review.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

describe.skipIf(!reachable)('review as of a past commit', () => {
  let db: Awaited<ReturnType<typeof connect>>, g: Graph, repo: string, reviewed: string;
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  const commit = (msg: string, date: string) => {
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    return git('rev-parse', 'HEAD');
  };
  const log = (...entries: string[]) => writeFileSync(join(repo, 'DECISIONS.md'), `# Decisions\n\n${entries.join('\n\n')}\n`);
  const CACHE = '## Cache Lives in the Store (May 1 2026)\n\nThe `src/store.ts` cache keeps 50 entries; measured 9/10.';

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-hist-'));
    git('init', '-q'); git('config', 'user.name', 'Ada'); git('config', 'user.email', 'a@x');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src/store.ts'), 'export const cache = 50;\n');
    log(CACHE);
    commit('Add the store and its cache decision', '2026-05-01T10:00:00Z');
    writeFileSync(join(repo, 'src/store.ts'), 'export const cache = 60;\n');
    reviewed = commit('Bump the cache', '2026-05-10T10:00:00Z');
    // After the reviewed commit: the cache entry is edited AND marked superseded, and a new entry is
    // added with a date BEFORE the reviewed commit (written later, backdated).
    log('## Cache Lives in the Store (May 1 2026) — SUPERSEDED by the queue\n\nThe `src/store.ts` cache keeps 60 entries now; measured 9/10.',
      '## Queue Replaces the Cache (May 5 2026)\n\nWrites to `src/store.ts` go through a queue.');
    commit('Record the queue decision', '2026-06-01T10:00:00Z');
    db = await connect();
    g = db.selectGraph(`test-hist-${process.pid}-${Date.now()}`);
    await ingestRepo(g, repo);
    // Evidence extracted from TODAY's text of the cache entry (as the team would).
    await g.query(`MATCH (d:Decision {id: '2026-05-01-cache-lives-in-the-store'})
                   CREATE (d)-[:BECAUSE]->(:Measurement {id: 'm1', metric: 'hit rate', value: '9/10', quote: 'measured 9/10', pos: 0})`);
  });
  afterAll(async () => { await g?.delete().catch(() => {}); await db?.close(); rmSync(repo, { recursive: true, force: true }); });

  it('rebuilt from the log at the commit: only entries that existed then, with their status then, evidence only from unchanged text', async () => {
    const p = await review(g, reviewed.slice(0, 8), { repo });
    expect(p.basis).toMatchObject({ method: 'log-at-commit', entriesThen: 1, editedSince: 1 });
    const decisions = p.items.filter((i) => i.decision).map((i) => [i.kind, i.decision!.id, i.decision!.statusThen, i.decision!.evidence, i.measurements?.length]);
    expect(decisions).toEqual([
      // standing then (superseded only later); evidence omitted — the entry's text changed after this commit
      ['recheck', '2026-05-01-cache-lives-in-the-store', 'active', 'omitted: entry edited since this commit', 0],
    ]);
    // the backdated queue entry did not exist at the reviewed commit — it is not there
  });

  it('the by-date approximation lets the backdated entry in — and says it is approximate', async () => {
    const p = await review(g, reviewed.slice(0, 8));
    expect(p.basis.method).toBe('by-date');
    expect(p.items.some((i) => i.decision?.id === '2026-05-05-queue-replaces-the-cache')).toBe(true);
  });

  it('same commit, same graph: identical packet and fingerprint', async () => {
    expect(await review(g, reviewed.slice(0, 8), { repo })).toEqual(await review(g, reviewed.slice(0, 8), { repo }));
  });
});

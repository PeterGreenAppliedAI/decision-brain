/**
 * The sync acceptance test, as an outside review specified it: change one source file and one
 * decision; sync; only the affected summaries and evidence are regenerated; everything unaffected is
 * untouched; a second sync does nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardName, seedBoard } from '../src/board/board.js';
import { planTasks, sourceFiles } from '../src/files/scan.js';
import { seedFileBoard } from '../src/files/worker.js';
import { connect, type Graph } from '../src/graph/db.js';
import { ingestRepo } from '../src/ingest/repo.js';
import type { JsonClient } from '../src/llm/openai.js';
import { blobsAt, requeueRejected, sync } from '../src/sync/sync.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

const calls: string[] = [];
const llm = {
  model: 'scripted',
  async json<T>(req: { schemaName: string; user: string }) {
    const subject = /^(?:Entry id|File|Directory): (.+)$/m.exec(req.user)?.[1]?.split(' (')[0] ?? '?';
    calls.push(`${req.schemaName}:${subject}`);
    const value = req.schemaName === 'extraction' ? { measurements: [], experiments: [], concepts: ['cache'], models: [], references: [] }
      : req.schemaName === 'file_summary' ? { purpose: `About ${subject}.`, responsibilities: [{ text: 't', symbols: ['value'] }], exports: ['value'], depends_on: [] }
      : { purpose: `Dir ${subject}.`, parts: [] };
    return { value: value as T, reasoning: '', promptTokens: 0, completionTokens: 0, ms: 1 };
  },
} as unknown as JsonClient;

describe.skipIf(!reachable)('sync — only what changed, and then nothing', () => {
  let db: Awaited<ReturnType<typeof connect>>, brain: Graph, repo: string, name: string;
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  const log = (a: string, b: string) => writeFileSync(join(repo, 'DECISIONS.md'),
    `# D\n\n## Cache A (May 1 2026)\n\n${a}\n\n## Cache B (May 2 2026)\n\n${b}\n`);
  const findingIds = async (g: Graph, section: string) =>
    (await g.roQuery<{ id: string }>('MATCH (f:Finding)-[:ABOUT]->(:Section {id: $s}) RETURN f.id AS id ORDER BY id', { params: { s: section } })).data!.map((r) => r.id);

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-sync-'));
    git('init', '-q'); git('config', 'user.name', 'A'); git('config', 'user.email', 'a@x');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src/a.ts'), 'export const value = 1;\n');
    writeFileSync(join(repo, 'src/b.ts'), 'export const value = 2;\n');
    log('The cache in `src/a.ts` keeps 50.', 'The cache in `src/b.ts` keeps 10.');
    git('add', '.'); git('commit', '-q', '-m', 'start');
    db = await connect();
    name = `test-sync-${process.pid}-${Date.now()}`;
    brain = db.selectGraph(name);
    await ingestRepo(brain, repo);
    // Both boards exist (as after `npm run team` and `npm run summarize`); the first sync fills them.
    await seedBoard(db.selectGraph(boardName(name)), brain);
    const { sha, files } = sourceFiles(repo);
    await seedFileBoard(db.selectGraph(`${name}__files`), planTasks(files), sha, blobsAt(repo, sha));
    await sync(db, name, repo, { llm, workers: 2 });
  });
  afterAll(async () => {
    for (const g of [name, boardName(name), `${name}__files`]) await db.selectGraph(g).delete().catch(() => {});
    await db?.close(); rmSync(repo, { recursive: true, force: true });
  });

  it('regenerates only the changed file, its directories, and the changed decision — and leaves the rest untouched', async () => {
    const files = db.selectGraph(`${name}__files`), board = db.selectGraph(boardName(name));
    const bSummary = await findingIds(files, 'file:src/b.ts');
    const bEvidence = await findingIds(board, '2026-05-02-cache-b');
    expect(bSummary).toHaveLength(1);

    writeFileSync(join(repo, 'src/a.ts'), 'export const value = 3;\n');
    log('The cache in `src/a.ts` keeps 80 now.', 'The cache in `src/b.ts` keeps 10.');
    git('commit', '-q', '-am', 'change a and decision A');
    calls.length = 0;
    const r = await sync(db, name, repo, { llm, workers: 2 });

    expect(r.decisions).toMatchObject({ changed: ['2026-05-01-cache-a'], extracted: 1, integrated: true });
    expect(r.files).toMatchObject({ changed: ['src/a.ts'], added: [], removed: [], dirsRedone: ['dir:.', 'dir:src'], summarized: 3 });
    expect(calls.sort()).toEqual(['dir_summary:(repository root)', 'dir_summary:src', 'extraction:2026-05-01-cache-a', 'file_summary:src/a.ts']);
    expect(await findingIds(files, 'file:src/b.ts')).toEqual(bSummary);                 // untouched
    expect(await findingIds(board, '2026-05-02-cache-b')).toEqual(bEvidence);             // untouched
  });

  it('a second sync does no model work and changes nothing', async () => {
    calls.length = 0;
    const r = await sync(db, name, repo, { llm, workers: 2 });
    expect(r.modelCalls).toBe(0);
    expect(calls).toEqual([]);
    expect(r.decisions).toMatchObject({ changed: [], removed: 0, extracted: 0, integrated: false });
    expect(r.files).toMatchObject({ changed: [], added: [], removed: [], summarized: 0, integrated: false });
  });

  it('a removed file and a new one: the old summary goes, the new one is made', async () => {
    git('rm', '-q', 'src/b.ts');
    writeFileSync(join(repo, 'src/c.ts'), 'export const value = 4;\n');
    git('add', '.'); git('commit', '-q', '-m', 'b out, c in');
    calls.length = 0;
    const r = await sync(db, name, repo, { llm, workers: 2 });
    expect(r.files).toMatchObject({ changed: [], added: ['src/c.ts'], removed: ['src/b.ts'] });
    expect(calls.filter((c) => c.startsWith('file_summary')).sort()).toEqual(['file_summary:src/c.ts']);
    const paths = (await brain.roQuery<{ p: string }>('MATCH (f:File) WHERE f.purpose IS NOT NULL RETURN f.path AS p ORDER BY p')).data!.map((x) => x.p);
    expect(paths).toEqual(['src/a.ts', 'src/c.ts']);
  });

  it('a summary the code check rejected is re-queued with its directories, nothing else', async () => {
    const files = db.selectGraph(`${name}__files`);
    await files.query("MATCH (f:Finding)-[:ABOUT]->(:Section {id: 'file:src/a.ts'}) SET f.verified = false");
    const cSummary = await findingIds(files, 'file:src/c.ts');
    expect(await requeueRejected(files)).toEqual(['src/a.ts']);
    const status = (await files.roQuery<{ id: string; s: string }>('MATCH (s:Section) RETURN s.id AS id, s.status AS s ORDER BY id')).data!;
    expect(status).toEqual([{ id: 'dir:.', s: 'pending' }, { id: 'dir:src', s: 'pending' }, { id: 'file:src/a.ts', s: 'pending' }, { id: 'file:src/c.ts', s: 'done' }]);
    calls.length = 0;
    await sync(db, name, repo, { llm, workers: 2 });
    expect(calls.sort()).toEqual(['dir_summary:(repository root)', 'dir_summary:src', 'file_summary:src/a.ts']);
    expect(await findingIds(files, 'file:src/c.ts')).toEqual(cSummary);
    expect(await requeueRejected(files)).toEqual([]);
  });
});

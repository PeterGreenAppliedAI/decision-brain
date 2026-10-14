/**
 * File and directory summaries: the task plan, the checks, and a real team run on a fixture repo —
 * directories only after their parts, the root last, a failed part never blocking its parent.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerAgent } from '../src/board/board.js';
import { integrateSummaries } from '../src/files/integrate.js';
import { planTasks, sourceFiles } from '../src/files/scan.js';
import { checkDir, checkFile } from '../src/files/summarize.js';
import { runSummaryWorker, seedFileBoard } from '../src/files/worker.js';
import { connect, type Graph } from '../src/graph/db.js';
import { ingestRepo } from '../src/ingest/repo.js';
import type { JsonClient } from '../src/llm/openai.js';
import { origin, whatIs } from '../src/tools/graph-tools.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

describe('planTasks', () => {
  it('makes a task per file and per directory; a directory waits for its direct parts; the root is last', () => {
    const t = planTasks(['a.ts', 'src/b.ts', 'src/c.ts', 'src/x/d.ts']);
    const by = Object.fromEntries(t.map((x) => [x.id, x]));
    expect(by['dir:src'].waiting).toBe(3);                 // b, c, src/x
    expect(by['dir:src/x'].waiting).toBe(1);
    expect(by['dir:.'].waiting).toBe(2);                   // a.ts, src
    expect([by['file:src/x/d.ts'].parent, by['dir:src/x'].parent, by['dir:src'].parent, by['dir:.'].parent])
      .toEqual(['dir:src/x', 'dir:src', 'dir:.', null]);
    const order = [...t].sort((a, b) => a.order - b.order).map((x) => x.id);
    expect(order.slice(-3)).toEqual(['dir:src/x', 'dir:src', 'dir:.']);    // deepest directories first
  });
});

describe('readAt', () => {
  it('cuts long files for the model but keeps the full text for checking', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'db-cut-'));
    const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
    git('init', '-q'); git('config', 'user.name', 'A'); git('config', 'user.email', 'a@x');
    writeFileSync(join(repo, 'big.ts'), `export function head() {}\n${'// filler\n'.repeat(2000)}export function middleOnly() {}\n${'// filler\n'.repeat(2000)}export function tail() {}\n`);
    git('add', '.'); git('commit', '-q', '-m', 'big');
    const { readAt } = await import('../src/files/scan.js');
    const r = readAt(repo, 'HEAD', 'big.ts', 1000);
    expect(r.cut).toBe(true);
    expect(r.text).not.toContain('middleOnly');
    expect(checkFile({ purpose: 'p', responsibilities: [{ text: 't', symbols: ['middleOnly', 'head'] }], exports: [], depends_on: [] }, r.full).dropped).toEqual([]);
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('summary checks', () => {
  const text = 'import { z } from "zod";\nexport function claimSection() {}\nconst $helper = 1;\nexport class Board {}';
  it('keeps only names that exist in the file, whole-word', () => {
    const c = checkFile({ purpose: 'Claims work.', responsibilities: [
      { text: 'claims', symbols: ['claimSection', 'claim'] }, { text: 'invented', symbols: ['releaseAll'] }, { text: 'helper', symbols: ['$helper'] },
    ], exports: ['Board', 'Section'], depends_on: ['zod', 'lodash'] }, text);
    expect(c.value.responsibilities.map((r) => r.symbols)).toEqual([['claimSection'], ['$helper']]);
    expect(c.value.exports).toEqual(['Board']);
    expect(c.value.depends_on).toEqual(['zod']);
    expect(c.dropped.sort()).toEqual(['Section', 'claim', 'lodash', 'releaseAll']);
  });
  it('accepts a subdirectory named with the trailing slash it was listed with', () => {
    expect(checkDir({ purpose: 'p', parts: [{ name: 'lib/', role: 'r' }] }, ['lib', 'a.ts']).value.parts).toEqual([{ name: 'lib', role: 'r' }]);
  });

  it('a directory summary may name only its own parts', () => {
    expect(checkDir({ purpose: 'p', parts: [{ name: 'a.ts', role: 'r' }, { name: 'ghost.ts', role: 'r' }] }, ['a.ts', 'b.ts']).value.parts)
      .toEqual([{ name: 'a.ts', role: 'r' }]);
  });
});

describe.skipIf(!reachable)('summaries on a real board', () => {
  let db: Awaited<ReturnType<typeof connect>>;
  let brain: Graph, board: Graph;
  let repo: string;
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  const tag = `${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-files-'));
    git('init', '-q'); git('config', 'user.name', 'Ada'); git('config', 'user.email', 'a@x');
    mkdirSync(join(repo, 'src/store'), { recursive: true });
    writeFileSync(join(repo, 'src/store/facts.ts'), 'export function saveFact() {}\n');
    writeFileSync(join(repo, 'DECISIONS.md'), '# D\n\n## Facts Get a Store (May 1 2026)\n\nThe fact store in `src/store/facts.ts` keeps memory.\n');
    git('add', '.'); git('commit', '-q', '-m', 'Add the fact store so memory survives restarts');
    writeFileSync(join(repo, 'src/main.ts'), 'import { saveFact } from "./store/facts";\nexport function main() { saveFact(); }\n');
    writeFileSync(join(repo, 'src/broken.ts'), 'export const x = 1;\n');
    git('add', '.'); git('commit', '-q', '-m', 'Add main');
    db = await connect();
    brain = db.selectGraph(`test-fb-${tag}`);
    board = db.selectGraph(`test-fb-${tag}__files`);
    await ingestRepo(brain, repo);
  });
  afterAll(async () => {
    await brain?.delete().catch(() => {}); await board?.delete().catch(() => {});
    await db?.close(); rmSync(repo, { recursive: true, force: true });
  });

  it('writes directories after their parts and the repo last; a part that fails still releases its parent', async () => {
    const { sha, files } = sourceFiles(repo);
    expect(files).toEqual(['src/broken.ts', 'src/main.ts', 'src/store/facts.ts']);
    await seedFileBoard(board, planTasks(files), sha);
    const seen: string[] = [];
    const llm = {
      model: 'scripted',
      async json<T>(req: { schemaName: string; user: string }) {
        const what = /^(File|Directory): (.+?)(\s|$)/m.exec(req.user)?.[2] ?? '?';
        seen.push(what);
        if (what === 'src/broken.ts') throw new Error('model fell over');
        const facts = what.endsWith('facts.ts');
        const value = req.schemaName === 'file_summary'
          ? (facts
            ? { purpose: `Does ${what}.`, responsibilities: [{ text: 'saves', symbols: ['saveFact', 'invented'] }], exports: ['saveFact'], depends_on: [] }
            : { purpose: `Does ${what}.`, responsibilities: [{ text: 'main work', symbols: ['saveFact', 'main', 'invented'] }], exports: ['saveFact', 'main'], depends_on: ['./store/facts'] })
          : { purpose: `Directory ${what}.`, parts: [{ name: 'store', role: 'keeps facts' }, { name: 'main.ts', role: 'entry' }, { name: 'src', role: 'all code' }] };
        return { value: value as T, reasoning: '', promptTokens: 0, completionTokens: 0, ms: 1 };
      },
    } as unknown as JsonClient;
    const run = (name: string) => registerAgent(board, name, 'scripted').then(() =>
      runSummaryWorker({ name, board, llm, repo, sha, ttlMs: 2000, maxAttempts: 1, idlePollMs: 20 }));
    await Promise.all([run('w1'), run('w2')]);

    const at = (x: string) => seen.indexOf(x);
    expect(at('src/store')).toBeGreaterThan(at('src/store/facts.ts'));
    expect(at('src')).toBeGreaterThan(Math.max(at('src/store'), at('src/main.ts'), at('src/broken.ts')));
    expect(seen.at(-1)).toBe('(repository');                                  // "Directory: (repository root)"
    const status = (await board.roQuery<{ s: string; n: number }>('MATCH (s:Section) RETURN s.status AS s, count(*) AS n ORDER BY s')).data;
    expect(status).toEqual([{ s: 'done', n: 5 }, { s: 'failed', n: 1 }]);

    expect(await integrateSummaries(board, brain)).toEqual({ files: 2, modules: 3 });   // broken.ts failed: no summary
    const f = await whatIs(brain, 'src/main.ts');
    expect(f).toMatchObject({ kind: 'file', purpose: 'Does src/main.ts.', exports: ['saveFact', 'main'], stale: false, note: 'describes code, not intent' });
    const d = await whatIs(brain, 'src');
    expect(d).toMatchObject({ kind: 'directory', parts: [{ name: 'store', role: 'keeps facts' }, { name: 'main.ts', role: 'entry' }] });   // "src" is not a part of src: dropped
  });

  it('origin: the birth commit is the stated intent, then the decisions that rest on the file, then what it does now', async () => {
    const o = await origin(brain, 'facts.ts');
    expect(o.birth?.message).toBe('Add the fact store so memory survives restarts');
    expect(o.recordedIntent?.decisions.map((d) => d.title)).toEqual(['Facts Get a Store']);
    expect(o.history.map((h) => h.id)).toEqual(['2026-05-01-facts-get-a-store']);
    expect(o.now?.purpose).toBe('Does src/store/facts.ts.');
  });
});

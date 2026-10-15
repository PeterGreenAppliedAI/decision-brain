import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type Graph } from '../src/graph/db.js';
import { lifespans, splitSections } from '../src/ingest/instructions.js';
import { ingestRepo } from '../src/ingest/repo.js';
import { told } from '../src/tools/graph-tools.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

describe('instruction files', () => {
  it('splits Markdown into sections keyed by heading path, ignoring headings in code fences', () => {
    const s = splitSections('Intro.\n# Guide\n## Rules\nNo globals.\n```\n# not a heading\n```\n### Memory\nUse `src/store.ts`.\n');
    expect(s.map((x) => x.heading)).toEqual(['(preamble)', 'Guide > Rules', 'Guide > Rules > Memory']);
    expect(s[1].text).toContain('# not a heading');
  });

  it('gives each section text a lifespan, and links a changed section to the text it replaced', () => {
    const v = (sha: string, date: string, md: string) => ({ sha, date, sections: splitSections(md) });
    const spans = lifespans('CLAUDE.md', [
      v('aaaaaaaa1', '2026-01-01', '## Rules\nA\n## Style\nS'),
      v('bbbbbbbb2', '2026-02-01', '## Rules\nB\n## Style\nS'),
      v('cccccccc3', '2026-03-01', '## Style\nS'),
    ]);
    const by = (h: string, from: string) => spans.find((x) => x.heading === h && x.from === from)!;
    expect([by('Rules', '2026-01-01').until, by('Rules', '2026-02-01').until, by('Style', '2026-01-01').until]).toEqual(['2026-02-01', '2026-03-01', null]);
    expect(by('Rules', '2026-02-01').replaces).toBe(by('Rules', '2026-01-01').id);
  });
});

describe.skipIf(!reachable)('told(commit) on a real graph', () => {
  let db: Awaited<ReturnType<typeof connect>>, g: Graph, repo: string;
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  const commit = (msg: string, date: string, ...trailer: string[]) => {
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg, ...trailer.flatMap((t) => ['-m', t])], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    return git('rev-parse', 'HEAD');
  };
  let agentCommit: string;

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-told-'));
    git('init', '-q'); git('config', 'user.name', 'Ada'); git('config', 'user.email', 'a@x');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src/store.ts'), 'export const s = 1;\n');
    writeFileSync(join(repo, 'CLAUDE.md'), '## Memory\nNever write `src/store.ts` directly; use the queue.\n## Style\nTabs.\n');
    commit('start', '2026-01-01T10:00:00Z');
    writeFileSync(join(repo, 'src/store.ts'), 'export const s = 2;\n');
    agentCommit = commit('agent edits the store', '2026-01-05T10:00:00Z', 'Co-Authored-By: Claude Test <noreply@anthropic.com>');
    writeFileSync(join(repo, 'CLAUDE.md'), '## Memory\nWrite `src/store.ts` only through `src/queue.ts`.\n## Style\nTabs.\n');
    commit('tighten the memory rule', '2026-02-01T10:00:00Z');
    db = await connect();
    g = db.selectGraph(`test-told-${process.pid}-${Date.now()}`);
    await ingestRepo(g, repo);
  });
  afterAll(async () => { await g?.delete().catch(() => {}); await db?.close(); rmSync(repo, { recursive: true, force: true }); });

  it('returns the guidance in force at the commit, about its files, and says it has changed since', async () => {
    const t = await told(g, agentCommit.slice(0, 8));
    expect(t).toMatchObject({ aiCoAuthored: true, agents: ['Claude Test'], humans: ['Ada'] });
    const gd = (t as { guidance: Array<{ heading: string; text: string; namesTouched: string[]; changedSince: { on: string } | null }> }).guidance;
    expect(gd.map((x) => x.heading)).toEqual(['Memory']);
    expect(gd[0].text).toContain('Never write `src/store.ts` directly');        // the rule as it was then, not now
    expect(gd[0].namesTouched).toEqual(['src/store.ts']);
    expect(gd[0].changedSince?.on).toBe('2026-02-01T10:00:00.000Z');
  });
});

describe.skipIf(!reachable)('told: in force means in the commit\'s history', () => {
  let db: Awaited<ReturnType<typeof connect>>, g: Graph, repo: string, agentCommit: string;
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  const at = (date: string) => ({ env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  const commit = (msg: string, date: string, ...trailer: string[]) => {
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg, ...trailer.flatMap((t) => ['-m', t])], at(date));
    return git('rev-parse', 'HEAD');
  };
  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'db-told-anc-'));
    git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Ada'); git('config', 'user.email', 'a@x');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src/store.ts'), 'export const s = 1;\n');
    writeFileSync(join(repo, 'CLAUDE.md'), '## Memory\nNever write `src/store.ts` directly.\n');
    commit('start', '2026-01-01T10:00:00Z');
    // The rule is rewritten on a side branch on Jan 3; the agent's Jan 5 commit on main never had it.
    git('checkout', '-q', '-b', 'side');
    writeFileSync(join(repo, 'CLAUDE.md'), '## Memory\nWrite `src/store.ts` freely.\n');
    commit('loosen the rule', '2026-01-03T10:00:00Z');
    git('checkout', '-q', 'main');
    writeFileSync(join(repo, 'src/store.ts'), 'export const s = 2;\n');
    agentCommit = commit('agent edits the store', '2026-01-05T10:00:00Z', 'Co-Authored-By: Claude Test <noreply@anthropic.com>');
    execFileSync('git', ['-C', repo, 'merge', '-q', '--no-edit', 'side'], at('2026-01-10T10:00:00Z'));
    db = await connect(); g = db.selectGraph(`test-told-anc-${process.pid}-${Date.now()}`);
    await ingestRepo(g, repo);
  });
  afterAll(async () => { await g?.delete().catch(() => {}); await db?.close(); rmSync(repo, { recursive: true, force: true }); });

  it('with the repo: the rule the agent\'s tree had, not a newer one from a branch it never saw', async () => {
    const text = (t: Awaited<ReturnType<typeof told>>) => (t as { guidance: Array<{ text: string }> }).guidance.map((x) => x.text);
    expect(text(await told(g, agentCommit.slice(0, 8), 6, repo))).toEqual([expect.stringContaining('Never write `src/store.ts` directly')]);
    expect(text(await told(g, agentCommit.slice(0, 8)))).toEqual([expect.stringContaining('Write `src/store.ts` freely')]);   // by timestamp
  });
});

describe('dates', () => {
  it('are stored in UTC, so string comparison orders them correctly across time zones', async () => {
    const { parseGitLog } = await import('../src/ingest/git.js');
    const RS = '\x1e', FS = '\x1f';
    const [a, b] = parseGitLog(`${RS}a${FS}a${FS}X${FS}2026-09-29T21:36:00-04:00${FS}one${FS}\n${RS}b${FS}b${FS}Y${FS}2026-09-30T02:00:00+01:00${FS}two${FS}\n`);
    expect([a.date, b.date]).toEqual(['2026-09-30T01:36:00.000Z', '2026-09-30T01:00:00.000Z']);
    expect(b.date < a.date).toBe(true);    // as local strings this compared the other way round
  });
});

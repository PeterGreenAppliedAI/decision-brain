/**
 * What the Review page does beyond reading: list a repository's commits and show a diff (read-only), and —
 * only with local actions on (WEB_LOCAL_ACTIONS=1) — run `sync`, and the demo's scripted steps on a demo
 * copy. One job at a time (src/web/lock.ts), shared with adding a repository.
 */
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { connect } from '../graph/db.js';
import { createJsonClient } from '../llm/openai.js';
import { sync, type SyncReport } from '../sync/sync.js';
import { repoFor } from '../tools/review.js';
import { addEnabled } from './add.js';
import { acquire, busyWith, release } from './lock.js';

type Db = Awaited<ReturnType<typeof connect>>;
const ROOT = resolve(import.meta.dirname, '../..');
const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const SHA = /^[0-9a-f]{4,40}$/;

export interface ActionJob {
  what: string; graph: string; state: 'running' | 'done' | 'failed'; log: string[]; error: string | null;
  result: { sha?: string; sync?: SyncReport } | null; startedAt: number; endedAt: number | null;
}
let job: ActionJob | null = null;
export const currentAction = () => job;

/** The latest commits of a graph's repository, newest first. */
export function commits(graph: string, limit = 15) {
  const repo = repoFor(graph);
  if (!repo) return null;
  return git(repo, ['log', `-n${limit}`, '--format=%H%x1f%h%x1f%cI%x1f%an%x1f%s']).split('\n').filter(Boolean).map((l) => {
    const [sha, short, date, author, subject] = l.split('\x1f');
    return { sha, short, date, author, subject };
  });
}

/** One commit's message, files and patch — capped, for display. */
export function diff(graph: string, sha: string) {
  const repo = repoFor(graph);
  if (!repo || !SHA.test(sha)) return null;
  const text = git(repo, ['show', '--format=%H%n%an%n%cI%n%B%x1e', '--stat', '--patch', '--no-color', sha]);
  const [head, body] = text.split('\x1e');
  const [full, author, date, ...msg] = head.split('\n');
  return { sha: full, author, date, message: msg.join('\n').trim(), patch: body.trim().slice(0, 8000), cut: body.trim().length > 8000 };
}

/** A demo copy: the marker setup.ts left, its source graph, and where its clone and source repo are. */
export async function demoInfo(db: Db, graph: string) {
  if (!(await db.list()).includes(graph)) return null;               // reading a missing graph is an error in FalkorDB
  const of = (await db.selectGraph(graph).roQuery<{ of: string }>('MATCH (m:DemoCopy) RETURN m.of AS of LIMIT 1')).data?.[0]?.of;
  const dir = repoFor(graph);
  if (!of || !dir) return null;
  let source: string | null = null;
  try { source = git(dir, ['config', '--get', 'remote.origin.url']).trim(); } catch { /* not a clone */ }
  return { of, dir, source };
}

function begin(what: string, graph: string): ActionJob | { error: string } {
  if (!addEnabled) return { error: 'local actions are off (WEB_LOCAL_ACTIONS=1 enables them, for local use)' };
  if (!acquire(what)) return { error: `busy: ${busyWith()} — one job at a time` };
  job = { what, graph, state: 'running', log: [], error: null, result: null, startedAt: Date.now(), endedAt: null };
  return job;
}
const finish = (j: ActionJob, err?: unknown) => {
  if (err) { j.state = 'failed'; j.error = (err as Error).message; } else j.state = 'done';
  j.endedAt = Date.now();
  release();
};
const keep = (j: ActionJob, line: string) => { j.log.push(line); if (j.log.length > 200) j.log.shift(); };

/** Bring a graph up to date with its repository (ingest, re-extract, re-summarize what changed). */
export function startSync(db: Db, graph: string): ActionJob | { error: string } {
  const repo = repoFor(graph);
  if (!repo) return { error: `no repository known for ${graph}` };
  const j = begin(`syncing ${graph}`, graph);
  if (!('what' in j)) return j;
  (async () => {
    try {
      const report = await sync(db, graph, repo, { llm: createJsonClient(), workers: 4, log: (l) => keep(j, l) });
      j.result = { sync: report };
      keep(j, `model calls: ${report.modelCalls} · ${((Date.now() - j.startedAt) / 1000).toFixed(1)} s`);
      finish(j);
    } catch (err) { finish(j, err); }
  })();
  return j;
}

const STEPS = ['propose', 'record', 'resubmit', 'reset'] as const;
export type DemoStep = (typeof STEPS)[number];

/** The demo's scripted steps (scripts/demo/step.ts) and its reset (scripts/demo/setup.ts), on a demo copy only. */
export async function startDemoStep(db: Db, graph: string, step: string): Promise<ActionJob | { error: string }> {
  if (!STEPS.includes(step as DemoStep)) return { error: 'unknown step' };
  const demo = await demoInfo(db, graph);
  if (!demo) return { error: `${graph} is not a demo copy` };
  if (step === 'reset' && !demo.source) return { error: 'cannot find the source repository of this demo copy' };
  const j = begin(`demo ${step} on ${graph}`, graph);
  if (!('what' in j)) return j;
  const args = step === 'reset'
    ? ['tsx', '--env-file-if-exists=.env', 'scripts/demo/setup.ts', demo.source!, demo.of, demo.dir, graph]
    : ['tsx', 'scripts/demo/step.ts', demo.dir, step];
  const p = spawn('npx', args, { cwd: ROOT, env: process.env });
  let out = '';
  const take = (b: Buffer) => { out += b.toString(); for (const l of b.toString().split('\n')) if (l.trim()) keep(j, l); };
  p.stdout.on('data', take); p.stderr.on('data', take);
  p.on('error', (err) => finish(j, err));
  p.on('close', (code) => {
    if (code !== 0) return finish(j, new Error(`${step} exited with ${code}`));
    const sha = /\b([0-9a-f]{8})\s*$/.exec(out.trim())?.[1];
    if (step !== 'reset' && sha) j.result = { sha };
    finish(j);
  });
  return j;
}

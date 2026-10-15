/**
 * Adding a repository from the web page — local use only. Off unless WEB_ALLOW_INGEST=1: it makes this
 * machine clone a repository and spend model time on it, which a public deployment must not offer.
 *
 * One job at a time: clone a public GitHub repository into data/corpora/<name>, ingest it, run the
 * extraction team, and (if asked) the file summaries — the same commands the README gives, run as
 * child processes. The Board follows the agents through the board graphs as usual.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const addEnabled = process.env.WEB_ALLOW_INGEST === '1';
const MAX_KB = Number(process.env.ADD_MAX_KB ?? 200_000);        // GitHub's size figure for the repository
const ROOT = resolve(import.meta.dirname, '../..');
export const corpusDir = (name: string) => resolve(ROOT, 'data/corpora', name);

export interface AddJob {
  url: string; name: string; summaries: boolean;
  state: 'running' | 'done' | 'failed'; step: string; startedAt: number; endedAt: number | null;
  log: string[]; error: string | null;
}
let job: AddJob | null = null;
export const currentJob = () => job;

/** https://github.com/<owner>/<repo>[.git][/] → owner, repo; anything else is refused. */
export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  return m && m[2] !== '.' && m[2] !== '..' ? { owner: m[1], repo: m[2] } : null;
}
/** The graph name for a repository: lower case, safe for graph names and directories. */
export const graphNameFor = (repo: string) => repo.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function run(cmd: string, args: string[], into: AddJob): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: process.env });
    const take = (b: Buffer) => { for (const l of b.toString().split('\n')) if (l.trim()) { into.log.push(l); if (into.log.length > 200) into.log.shift(); } };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${into.step} exited with ${code}`))));
  });
}

/** Validates, then starts the job in the background; returns it, or a reason it was refused. */
export async function startAdd(url: string, summaries: boolean, existing: string[]): Promise<{ job: AddJob } | { error: string }> {
  if (!addEnabled) return { error: 'adding repositories is off (WEB_ALLOW_INGEST=1 enables it, for local use)' };
  if (job?.state === 'running') return { error: `already adding ${job.name} — one at a time` };
  const gh = parseGithubUrl(url);
  if (!gh) return { error: 'expected a public GitHub URL: https://github.com/<owner>/<repo>' };
  const name = graphNameFor(gh.repo);
  if (!name) return { error: 'cannot name a graph after this repository' };
  if (existing.includes(name) || existsSync(corpusDir(name))) return { error: `${name} already exists — run npm run sync to update it` };
  // Size and visibility from GitHub's public API: private or missing repositories answer 404.
  const meta = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}`, { headers: { accept: 'application/vnd.github+json' } }).catch(() => null);
  if (!meta?.ok) return { error: meta?.status === 404 ? 'not found, or not public' : `GitHub did not answer (${meta?.status ?? 'network error'})` };
  const info = await meta.json() as { size: number; private: boolean };
  if (info.private) return { error: 'private repositories are not added from the page' };
  if (info.size > MAX_KB) return { error: `${Math.round(info.size / 1000)} MB is over the ${Math.round(MAX_KB / 1000)} MB limit (ADD_MAX_KB)` };

  const j: AddJob = { url: `https://github.com/${gh.owner}/${gh.repo}`, name, summaries, state: 'running', step: 'clone', startedAt: Date.now(), endedAt: null, log: [], error: null };
  job = j;
  (async () => {
    const dir = corpusDir(name);
    const step = async (label: string, cmd: string, args: string[]) => { j.step = label; j.log.push(`— ${label}`); await run(cmd, args, j); };
    try {
      await step('clone', 'git', ['clone', '-q', j.url, dir]);
      await step('ingest', 'npm', ['run', '-s', 'ingest', '--', dir, '--graph', name]);
      await step('extract decisions', 'npm', ['run', '-s', 'team', '--', '--graph', name, '--workers', '4']);
      if (summaries) await step('summarize files', 'npm', ['run', '-s', 'summarize', '--', '--graph', name, '--repo', dir, '--workers', '4']);
      j.step = 'done'; j.state = 'done';
    } catch (err) {
      j.state = 'failed'; j.error = (err as Error).message;
    } finally {
      j.endedAt = Date.now();
    }
  })();
  return { job: j };
}

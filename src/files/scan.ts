/**
 * A repo's source tree at one commit → summary tasks: one per file, one per directory, the root last.
 * Each directory is PART_OF its parent and waits for all its parts, so the board hands out work
 * bottom-up and the root's summary — the repo's — is written from everything beneath it.
 */
import { execFileSync } from 'node:child_process';
import { config } from '../config.js';
import { globToRegExp } from '../graph/rationale.js';

export interface FileTask { id: string; kind: 'file' | 'dir'; path: string; parent: string | null; waiting: number; order: number; depth: number }

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

export const fileId = (path: string) => `file:${path}`;
export const dirId = (path: string) => `dir:${path || '.'}`;
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export function sourceFiles(repo: string, sha = 'HEAD'): { sha: string; files: string[] } {
  const full = git(repo, ['rev-parse', sha]).trim();
  const exclude = config.fileExclude.map(globToRegExp);
  const ext = new Set(config.fileExtensions);
  const files = git(repo, ['ls-tree', '-r', full, '--name-only']).split('\n').filter(Boolean)
    .filter((p) => ext.has(p.split('.').pop() ?? '') && !exclude.some((re) => re.test(p))).sort();
  return { sha: full, files };
}

export function planTasks(files: string[]): FileTask[] {
  const dirs = new Map<string, Set<string>>();             // dir → its direct parts (task ids)
  const ensure = (d: string) => { if (!dirs.has(d)) dirs.set(d, new Set()); return dirs.get(d)!; };
  for (const f of files) {
    ensure(parentOf(f)).add(fileId(f));
    for (let d = parentOf(f); d; d = parentOf(d)) ensure(parentOf(d)).add(dirId(d));
  }
  const depth = (p: string) => (p ? p.split('/').length : 0);
  const maxDepth = Math.max(0, ...[...dirs.keys()].map(depth));
  const tasks: FileTask[] = files.map((f, i) => ({ id: fileId(f), kind: 'file', path: f, parent: dirId(parentOf(f)), waiting: 0, order: i, depth: depth(f) }));
  [...dirs.keys()].sort().forEach((d, i) => tasks.push({
    id: dirId(d), kind: 'dir', path: d, parent: d ? dirId(parentOf(d)) : null, waiting: dirs.get(d)!.size,
    order: files.length + (maxDepth - depth(d)) * 10_000 + i, depth: depth(d),
  }));
  return tasks;
}

/** The file as the model sees it (whole, or head and tail with the cut marked) — and the full text, which is what claims are checked against. */
export function readAt(repo: string, sha: string, path: string, max = config.fileMaxChars): { text: string; full: string; cut: boolean } {
  const full = git(repo, ['show', `${sha}:${path}`]);
  if (full.length <= max) return { text: full, full, cut: false };
  const head = Math.floor(max * 0.6);
  return { text: `${full.slice(0, head)}\n\n/* … ${full.length - max} characters omitted … */\n\n${full.slice(-(max - head))}`, full, cut: true };
}

/**
 * The decision log as it stood at a commit, read from git — not today's graph filtered by date.
 * Each entry comes with the content hash of its text then, so evidence extracted from today's text
 * can be kept only where the text has not changed since.
 */
import { execFileSync } from 'node:child_process';
import { parseAdrFiles } from './adr.js';
import { contentHash, parseDecisions } from './decisions.js';

export interface EntryThen { id: string; title: string; date: string | null; status: string; hash: string }

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/** `sources` are the logs' sourceFile values in the graph: a file (DECISIONS.md) or an ADR directory. */
export function entriesAt(repo: string, sha: string, sources: string[]): Map<string, EntryThen> {
  const out = new Map<string, EntryThen>();
  for (const src of sources) {
    let tree: string[] = [];
    try { tree = git(repo, ['ls-tree', '--name-only', sha, `${src}/`]).split('\n').filter(Boolean); } catch { /* not a directory then */ }
    const entries = tree.length
      ? parseAdrFiles(src, tree.map((p) => ({ name: p.slice(src.length + 1), text: git(repo, ['show', `${sha}:${p}`]) })))
      : (() => { try { return parseDecisions(git(repo, ['show', `${sha}:${src}`])); } catch { return []; } })();   // absent at that commit: no entries
    for (const e of entries) out.set(e.id, { id: e.id, title: e.title, date: e.date, status: e.status, hash: contentHash(e.title, e.body) });
  }
  return out;
}

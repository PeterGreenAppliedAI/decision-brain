/**
 * One repo → its graph: git history, then the decision log if the repo has one. Every write is a
 * MERGE, so re-running refreshes the graph in place.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../graph/db.js';
import { ensureSchema } from '../graph/schema.js';
import { ingestDecisions, parseDecisions, resolveRefs, type RefResolution } from './decisions.js';
import { blameLines, ingestGit, parseGitLog, readGitLog } from './git.js';

export interface IngestReport {
  commits: number;
  files: number;
  decisions: number | null;           // null: the repo has no decision log
  refs: RefResolution | null;
}

export async function ingestRepo(graph: Graph, repo: string, decisionsFile = 'DECISIONS.md'): Promise<IngestReport> {
  await ensureSchema(graph);
  const commits = parseGitLog(readGitLog(repo));
  await ingestGit(graph, commits);
  const files = new Set(commits.flatMap((c) => c.files));

  if (!existsSync(join(repo, decisionsFile))) return { commits: commits.length, files: files.size, decisions: null, refs: null };
  const entries = parseDecisions(readFileSync(join(repo, decisionsFile), 'utf8'));
  const refs = resolveRefs(entries, commits.map((c) => c.sha), files, blameLines(repo, decisionsFile));
  await ingestDecisions(graph, entries, refs, decisionsFile);
  return { commits: commits.length, files: files.size, decisions: entries.length, refs };
}

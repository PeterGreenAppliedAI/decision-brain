/**
 * One repo → its graph: git history, then the decision log if the repo has one. Every write is a
 * MERGE, so re-running refreshes the graph in place.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../graph/db.js';
import { buildRationale } from '../graph/rationale.js';
import { ensureSchema } from '../graph/schema.js';
import { findAdrDir, parseAdrDir } from './adr.js';
import { ingestDecisions, parseDecisions, resolveRefs, type RefResolution } from './decisions.js';
import { blameLines, firstCommitOf, ingestGit, parseGitLog, readGitLog, removeOrphans } from './git.js';

export interface IngestReport {
  commits: number;
  files: number;
  decisions: number | null;           // null: the repo has no decision log
  refs: RefResolution | null;
  adrs: { dir: string; count: number; links: number; refs: RefResolution } | null;
}

export async function ingestRepo(graph: Graph, repo: string, decisionsFile = 'DECISIONS.md'): Promise<IngestReport> {
  // Read git first: a path that is not a repo, or a repo with no commits, fails before any graph exists.
  const commits = parseGitLog(readGitLog(repo));
  await ensureSchema(graph);
  await ingestGit(graph, commits);
  const files = new Set(commits.flatMap((c) => c.files));

  let decisions: number | null = null;
  let refs: RefResolution | null = null;
  if (existsSync(join(repo, decisionsFile))) {
    const entries = parseDecisions(readFileSync(join(repo, decisionsFile), 'utf8'));
    refs = resolveRefs(entries, commits.map((c) => c.sha), files, blameLines(repo, decisionsFile));
    await ingestDecisions(graph, entries, refs, decisionsFile);
    decisions = entries.length;
  }

  // Architecture decision records: one file per decision. "Recorded in" is the commit that added
  // the file; an ADR with no Date line takes that commit's date.
  let adrs: IngestReport['adrs'] = null;
  const dir = findAdrDir(repo);
  if (dir) {
    const entries = parseAdrDir(repo, dir);
    const dateOf = new Map(commits.map((c) => [c.sha, c.date.slice(0, 10)]));
    const added = new Map(entries.map((e) => [e.id, firstCommitOf(repo, e.file!)]));
    for (const e of entries) if (!e.date && added.get(e.id)) { e.date = dateOf.get(added.get(e.id)!) ?? null; e.datePrecision = e.date ? 'day' : null; }
    const adrRefs = resolveRefs(entries, commits.map((c) => c.sha), files, (e) => added.get(e.id) ?? undefined);
    await ingestDecisions(graph, entries, adrRefs, dir);
    adrs = { dir, count: entries.length, links: entries.reduce((n, e) => n + (e.links?.length ?? 0), 0), refs: adrRefs };
  }

  await removeOrphans(graph);
  await buildRationale(graph);
  return { commits: commits.length, files: files.size, decisions, refs, adrs };
}

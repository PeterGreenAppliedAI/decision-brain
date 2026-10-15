/**
 * Git history → (:Commit), (:File), (:Person). Deterministic: no model. Re-running converges on the
 * repo as it is now: new commits are merged in, and commits no longer in the history (a rewrite)
 * are removed along with anything left orphaned.
 */
import { execFileSync } from 'node:child_process';
import { config } from '../config.js';
import { writeRows, type Graph } from '../graph/db.js';

export interface GitCommit {
  sha: string;
  short: string;
  author: string;
  /** When it was written (author date) — what people see. */
  date: string;
  /** When it entered the history (committer date) — what "as of this commit" means. They differ after
   *  a rebase or squash: log4brains' "initial features" was written 2020-09-25, committed 2020-12-10. */
  committedAt: string;
  subject: string;
  coauthors: string[];
  files: string[];
}

const RS = '\x1e', FS = '\x1f', TS = '\x1d';
const FORMAT = `${RS}%H${FS}%h${FS}%an${FS}%aI${FS}%s${FS}%(trailers:key=Co-authored-by,valueonly,separator=${TS})${FS}%cI`;

export class GitError extends Error {}

function git(repo: string, args: string[]): string {
  try {
    // core.quotePath=false: non-ASCII paths come back as-is, not as quoted octal escapes
    return execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? err).trim().split('\n')[0];
    throw new GitError(`git ${args[0]} failed in ${repo}: ${stderr}`);
  }
}

export function readGitLog(repo: string): string {
  return git(repo, ['log', '--name-only', `--format=${FORMAT}`]);
}

/** The commit that last wrote each line of a file (index = line - 1), from one porcelain blame. */
export function blameLines(repo: string, file: string): string[] {
  const raw = git(repo, ['blame', '--porcelain', '--', file]);
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (m) out[Number(m[2]) - 1] = m[1];
  }
  return out;
}

/** The commit that added a file (following renames), or null. */
export function firstCommitOf(repo: string, path: string): string | null {
  const shas = git(repo, ['log', '--follow', '--diff-filter=A', '--format=%H', '--', path]).trim().split('\n').filter(Boolean);
  return shas.at(-1) ?? null;
}

export function parseGitLog(raw: string): GitCommit[] {
  return raw.split(RS).filter((r) => r.trim()).map((record) => {
    const [header, ...rest] = record.split('\n');
    const [sha, short, author, date, subject, trailers = '', committed = date] = header.split(FS);
    return {
      // UTC: git gives each author's local offset, and dates are compared as strings throughout
      sha, short, author, date: new Date(date).toISOString(), committedAt: new Date(committed || date).toISOString(), subject,
      // "Name <email>" → "Name": emails stay out of the graph
      coauthors: trailers.split(TS).map((t) => t.replace(/<[^>]*>/, '').trim()).filter(Boolean),
      files: rest.map((l) => l.trim()).filter(Boolean),
    };
  });
}

export async function ingestGit(graph: Graph, commits: GitCommit[]): Promise<void> {
  const kind = (name: string) => (config.agentAuthorPattern.test(name) ? 'agent' : 'human');
  const person = (name: string) => config.personAliases[name] ?? name;

  await writeRows(graph,
    `UNWIND $rows AS c
     MERGE (x:Commit {sha: c.sha})
     SET x.short = c.short, x.date = c.date, x.committedAt = c.committedAt, x.message = c.subject`,
    commits.map(({ sha, short, date, committedAt, subject }) => ({ sha, short, date, committedAt, subject })));

  // A rewritten history leaves commits that no longer exist: remove them.
  await graph.query('MATCH (c:Commit) WHERE NOT c.sha IN $shas DETACH DELETE c',
    { params: { shas: commits.map((c) => c.sha) } });
  // Authorship is rewritten whole, so a changed alias or agent pattern takes effect on re-ingest.
  await graph.query('MATCH (:Person)-[r:AUTHORED]->(:Commit) DELETE r');

  await writeRows(graph,
    `UNWIND $rows AS r
     MERGE (p:Person {name: r.name}) SET p.kind = r.kind
     WITH p, r MATCH (c:Commit {sha: r.sha})
     MERGE (p)-[:AUTHORED {role: r.role}]->(c)`,
    commits.flatMap((c) => [
      { sha: c.sha, name: person(c.author), kind: kind(c.author), role: 'author' },
      ...c.coauthors.map((name) => ({ sha: c.sha, name: person(name), kind: kind(name), role: 'coauthor' })),
    ]));

  await writeRows(graph,
    `UNWIND $rows AS r
     MATCH (c:Commit {sha: r.sha})
     MERGE (f:File {path: r.path})
     MERGE (c)-[:TOUCHED]->(f)`,
    commits.flatMap((c) => c.files.map((path) => ({ sha: c.sha, path }))));
}

/** After a full ingest: drop files nothing touches or mentions, and people with no commits. */
export async function removeOrphans(graph: Graph): Promise<void> {
  await graph.query('MATCH (f:File) WHERE NOT (f)<-[:TOUCHED]-() AND NOT (f)<-[:MENTIONS]-() DELETE f');
  await graph.query('MATCH (p:Person) WHERE NOT (p)-[:AUTHORED]->() DELETE p');
}

/**
 * Git history → (:Commit), (:File), (:Person). Deterministic: no model. Re-running is idempotent
 * (MERGE on keys), so a repeat run picks up new commits without a rebuild.
 */
import { execFileSync } from 'node:child_process';
import { config } from '../config.js';
import { writeRows, type Graph } from '../graph/db.js';

export interface GitCommit {
  sha: string;
  short: string;
  author: string;
  date: string;
  subject: string;
  coauthors: string[];
  files: string[];
}

const RS = '\x1e', FS = '\x1f', TS = '\x1d';
const FORMAT = `${RS}%H${FS}%h${FS}%an${FS}%aI${FS}%s${FS}%(trailers:key=Co-authored-by,valueonly,separator=${TS})`;

export function readGitLog(repo: string): string {
  return execFileSync('git', ['-C', repo, 'log', '--name-only', `--format=${FORMAT}`], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** The commit that last wrote each line of a file (index = line - 1), from one porcelain blame. */
export function blameLines(repo: string, file: string): string[] {
  const raw = execFileSync('git', ['-C', repo, 'blame', '--porcelain', '--', file], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (m) out[Number(m[2]) - 1] = m[1];
  }
  return out;
}

export function parseGitLog(raw: string): GitCommit[] {
  return raw.split(RS).filter((r) => r.trim()).map((record) => {
    const [header, ...rest] = record.split('\n');
    const [sha, short, author, date, subject, trailers = ''] = header.split(FS);
    return {
      sha, short, author, date, subject,
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
     SET x.short = c.short, x.date = c.date, x.message = c.subject`,
    commits.map(({ sha, short, date, subject }) => ({ sha, short, date, subject })));

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

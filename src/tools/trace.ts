/**
 * trace(decision_id): the full path behind one decision — its source lines, the commit that recorded
 * it and the commits it cites (each with authors and the files touched), the files it names, and what
 * it supersedes.
 * Read-only; the result is data the agent cites and the path view renders.
 */
import type { Graph } from '../graph/db.js';

export interface TraceCommit { sha: string; short: string; date: string; message: string; authors: string[]; files: string[] }

export interface TraceResult {
  decision: { id: string; title: string; date: string | null; status: string; category: string | null; source: string };
  recordedIn: TraceCommit[];
  cites: TraceCommit[];
  mentions: string[];
  supersedes: Array<{ id: string; title: string }>;
  supersededBy: Array<{ id: string; title: string }>;
}

// Plain MATCH + collect, one small query per part. Pattern comprehensions are avoided on purpose:
//  - FalkorDB 4.x: a second comprehension reusing a variable name from the first returns [];
//  - FalkorDB 6.x: any comprehension after one that NESTS a comprehension returns [] — whatever the
//    names. Both found 2026-10-14, the second by CI running a newer image than the local one.
const DECISION = `MATCH (d:Decision {id: $id}) RETURN d {.id, .title, .date, .status, .category, .source} AS decision`;
const COMMITS = (rel: string) => `
MATCH (:Decision {id: $id})-[:${rel}]->(c:Commit)
OPTIONAL MATCH (p:Person)-[:AUTHORED]->(c)
WITH c, collect(DISTINCT p.name) AS authors
OPTIONAL MATCH (c)-[:TOUCHED]->(f:File)
RETURN c.sha AS sha, c.short AS short, c.date AS date, c.message AS message, authors, collect(DISTINCT f.path) AS files
ORDER BY date, sha`;
const MENTIONS = 'MATCH (:Decision {id: $id})-[:MENTIONS]->(f:File) RETURN f.path AS path ORDER BY path';
const SUPERSEDES = 'MATCH (:Decision {id: $id})-[:SUPERSEDES]->(o:Decision) RETURN DISTINCT o.id AS id, o.title AS title ORDER BY id';
const SUPERSEDED_BY = 'MATCH (n:Decision)-[:SUPERSEDES]->(:Decision {id: $id}) RETURN DISTINCT n.id AS id, n.title AS title ORDER BY id';

export async function trace(graph: Graph, id: string): Promise<TraceResult | null> {
  const q = async <T>(cypher: string) => (await graph.roQuery<T>(cypher, { params: { id } })).data ?? [];
  const head = await q<{ decision: TraceResult['decision'] }>(DECISION);
  if (!head.length) return null;
  const [recordedIn, cites, mentions, supersedes, supersededBy] = await Promise.all([
    q<TraceCommit>(COMMITS('RECORDED_IN')), q<TraceCommit>(COMMITS('CITES')),
    q<{ path: string }>(MENTIONS), q<{ id: string; title: string }>(SUPERSEDES), q<{ id: string; title: string }>(SUPERSEDED_BY),
  ]);
  const tidy = (c: TraceCommit) => ({ ...c, authors: [...c.authors].sort(), files: [...c.files].sort() });
  return {
    decision: head[0].decision,
    recordedIn: recordedIn.map(tidy), cites: cites.map(tidy),
    mentions: mentions.map((m) => m.path), supersedes, supersededBy,
  };
}

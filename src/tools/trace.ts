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

// Every comprehension gets its own variable names: FalkorDB returns an empty list for a second
// comprehension that reuses a name from an earlier one in the same RETURN (found 2026-10-14).
const TRACE = `
MATCH (d:Decision {id: $id})
RETURN d {.id, .title, .date, .status, .category, .source} AS decision,
  [(d)-[:RECORDED_IN]->(rc:Commit) | rc {.sha, .short, .date, .message,
     authors: [(rp:Person)-[:AUTHORED]->(rc) | rp.name],
     files: [(rc)-[:TOUCHED]->(rf:File) | rf.path]}] AS recordedIn,
  [(d)-[:CITES]->(cc:Commit) | cc {.sha, .short, .date, .message,
     authors: [(cp:Person)-[:AUTHORED]->(cc) | cp.name],
     files: [(cc)-[:TOUCHED]->(cf:File) | cf.path]}] AS cites,
  [(d)-[:MENTIONS]->(mf:File) | mf.path] AS mentions,
  [(d)-[:SUPERSEDES]->(old:Decision) | old {.id, .title}] AS supersedes,
  [(newer:Decision)-[:SUPERSEDES]->(d) | newer {.id, .title}] AS supersededBy`;

export async function trace(graph: Graph, id: string): Promise<TraceResult | null> {
  const res = await graph.roQuery<TraceResult>(TRACE, { params: { id } });
  const row = res.data?.[0];
  if (!row) return null;
  row.cites.sort((a, b) => a.date.localeCompare(b.date));
  return row;
}

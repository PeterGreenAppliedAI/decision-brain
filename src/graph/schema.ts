/**
 * The decision graph's schema. Nodes and edges (PLAN.md has the full draft; Day 1 builds the
 * deterministic part):
 *
 *   (:Decision {id, title, heading, date, datePrecision, category, status, source, body})
 *   (:Commit   {sha, short, date, message})
 *   (:File     {path})
 *   (:Person   {name, kind: human|agent})          // by name only — git emails stay out of the graph
 *
 *   (:Person)-[:AUTHORED {role: author|coauthor}]->(:Commit)
 *   (:Commit)-[:TOUCHED]->(:File)
 *   (:Decision)-[:RECORDED_IN]->(:Commit)   // git blame on the entry's heading: the commit that last wrote
 *                                           // it — usually the one that recorded the entry; for an amended
 *                                           // heading ("— SUPERSEDED by …"), the amendment
 *   (:Decision)-[:CITES]->(:Commit)         // the entry names the hash — evidence, not implementation
 *   (:Decision)-[:MENTIONS]->(:File)        // the entry names the path
 *
 * IMPLEMENTED_BY is reserved for links a later pass verifies; a citation or a blame is not proof
 * that a commit carried the decision out, so neither is called that.
 *
 * Every Decision keeps `source` (file:line range) so a path is answered by data, not the model.
 */
import type { Graph } from './db.js';

const RANGE_INDEXES: Array<[label: string, property: string]> = [
  ['Decision', 'id'],
  ['Decision', 'date'],
  ['Commit', 'sha'],
  ['Commit', 'short'],
  ['File', 'path'],
  ['Person', 'name'],
];

export async function ensureSchema(graph: Graph): Promise<void> {
  for (const [label, property] of RANGE_INDEXES) {
    try {
      await graph.createNodeRangeIndex(label, property);
    } catch (err) {
      if (!/already indexed/i.test(String(err))) throw err;
    }
  }
}

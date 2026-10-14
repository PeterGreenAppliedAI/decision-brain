/**
 * Summaries from the board into the brain. Code only; rebuilt whole each run.
 *
 *   (:File {purpose, summary, summarySha, summarizedBy})          // summary = responsibilities, exports, depends_on (JSON)
 *   (:Module {path, purpose, parts, summarySha, summarizedBy})    // a directory; path '.' is the repo itself
 *   (:Module)-[:CONTAINS]->(:File | :Module)
 *
 * A summary describes what code does at `summarySha` — it is never recorded as intent.
 */
import type { Graph } from '../graph/db.js';
import { writeRows } from '../graph/db.js';

export async function integrateSummaries(board: Graph, brain: Graph): Promise<{ files: number; modules: number }> {
  const rows = (await board.roQuery<{ id: string; kind: string; path: string; data: string; agent: string; at: number }>(
    `MATCH (f:Finding {kind: 'summary', verified: true})-[:ABOUT]->(s:Section), (f)-[:FROM]->(a:Agent)
     RETURN s.id AS id, s.kind AS kind, s.path AS path, f.data AS data, a.name AS agent, f.at AS at ORDER BY at`)).data ?? [];
  const latest = new Map(rows.map((r) => [r.id, r]));          // a re-run's summary replaces the older one
  const files = [...latest.values()].filter((r) => r.kind === 'file').map((r) => {
    const d = JSON.parse(r.data);
    return { path: r.path, purpose: d.purpose, summary: JSON.stringify({ responsibilities: d.responsibilities, exports: d.exports, depends_on: d.depends_on }), sha: d.sha, by: r.agent };
  });
  const modules = [...latest.values()].filter((r) => r.kind === 'dir').map((r) => {
    const d = JSON.parse(r.data);
    return { path: r.path || '.', purpose: d.purpose, parts: JSON.stringify(d.parts), sha: d.sha, by: r.agent };
  });

  try { await brain.createNodeRangeIndex('Module', 'path'); } catch (err) { if (!/already indexed/i.test(String(err))) throw err; }
  await brain.query('MATCH (m:Module) DETACH DELETE m');
  await brain.query('MATCH (f:File) WHERE f.purpose IS NOT NULL SET f.purpose = NULL, f.summary = NULL, f.summarySha = NULL, f.summarizedBy = NULL');
  await writeRows(brain,
    `UNWIND $rows AS r MATCH (f:File {path: r.path})
     SET f.purpose = r.purpose, f.summary = r.summary, f.summarySha = r.sha, f.summarizedBy = r.by`, files);
  await writeRows(brain,
    'UNWIND $rows AS r CREATE (:Module {path: r.path, purpose: r.purpose, parts: r.parts, summarySha: r.sha, summarizedBy: r.by})', modules);
  const parent = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
  await writeRows(brain,
    'UNWIND $rows AS r MATCH (m:Module {path: r.parent}), (f:File {path: r.path}) MERGE (m)-[:CONTAINS]->(f)',
    files.map((f) => ({ path: f.path, parent: parent(f.path) })));
  await writeRows(brain,
    'UNWIND $rows AS r MATCH (m:Module {path: r.parent}), (c:Module {path: r.path}) MERGE (m)-[:CONTAINS]->(c)',
    modules.filter((m) => m.path !== '.').map((m) => ({ path: m.path, parent: parent(m.path) })));
  return { files: files.length, modules: modules.length };
}

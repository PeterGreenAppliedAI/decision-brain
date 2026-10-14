/**
 * One-off migration (2026-10-14): findings extracted before content hashes existed get the hash of
 * the text they were extracted from — which is provably the current text only if the decision log
 * has not changed since the first finding was made. This script checks exactly that and refuses
 * otherwise (then the only honest path is re-extraction).
 *
 *   npx tsx --env-file=.env scripts/backfill-hashes.ts <repo-graph> <repo-path>
 */
import { execFileSync } from 'node:child_process';
import { boardName } from '../src/board/board.js';
import { connect } from '../src/graph/db.js';

const [graphName, repo] = process.argv.slice(2);
if (!graphName || !repo) { console.error('usage: backfill-hashes.ts <repo-graph> <repo-path>'); process.exit(2); }
const db = await connect();
const brain = db.selectGraph(graphName), board = db.selectGraph(boardName(graphName));
const q = async <T>(g: typeof brain, c: string, p: Record<string, unknown> = {}) => (await g.query<T>(c, { params: p as never })).data ?? [];

const logs = (await q<{ f: string }>(brain, 'MATCH (d:Decision) RETURN DISTINCT d.sourceFile AS f')).map((r) => r.f);
const lastChange = Math.max(...logs.map((f) => {
  const out = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%aI', '--', f], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--', f], { encoding: 'utf8' }).trim();
  if (dirty) throw new Error(`${f} has uncommitted changes — cannot prove findings match its text`);
  return out ? Date.parse(out) : 0;
}));
const firstFinding = (await q<{ at: number }>(board, 'MATCH (f:Finding) RETURN min(f.at) AS at'))[0]?.at;
if (!firstFinding) { console.log('no findings — nothing to do'); process.exit(0); }
if (!(lastChange < firstFinding)) {
  console.error(`REFUSED: ${logs.join(', ')} last changed ${new Date(lastChange).toISOString()}, after the first finding (${new Date(firstFinding).toISOString()}). Re-extract instead.`);
  process.exit(1);
}
const hashes = await q<{ id: string; h: string }>(brain, 'MATCH (d:Decision) RETURN d.id AS id, d.contentHash AS h');
if (hashes.some((r) => !r.h)) throw new Error('decisions lack contentHash — re-ingest first');
const rows = hashes.map((r) => ({ id: r.id, h: r.h }));
const [f] = await q<{ n: number }>(board, 'UNWIND $rows AS r MATCH (f:Finding)-[:ABOUT]->(:Section {id: r.id}) WHERE f.hash IS NULL SET f.hash = r.h, f.stale = false RETURN count(f) AS n', { rows });
const [s] = await q<{ n: number }>(board, 'UNWIND $rows AS r MATCH (s:Section {id: r.id}) WHERE s.hash IS NULL SET s.hash = r.h RETURN count(s) AS n', { rows });
const [h] = await q<{ n: number }>(board, "UNWIND $rows AS r MATCH (h:Handoff {status: 'confirmed'})-[:FOR]->(:Section {id: r.id}) WHERE h.targetHash IS NULL SET h.targetHash = r.h RETURN count(h) AS n", { rows });
console.log(`${graphName}: log last changed ${new Date(lastChange).toISOString()} < first finding ${new Date(firstFinding).toISOString()} — stamped ${f.n} findings, ${s.n} sections, ${h.n} confirmed handoffs`);
await db.close();

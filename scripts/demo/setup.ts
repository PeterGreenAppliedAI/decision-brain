/**
 * Demo setup: a disposable copy of a repo and its graphs, so the demo can commit freely.
 *   npx tsx --env-file=.env scripts/demo/setup.ts <source-repo> <source-graph> <demo-dir> <demo-graph>
 * Clones the repo (local clone, same history) and copies the brain graph and both boards server-side
 * (FalkorDB GRAPH.COPY) — extraction and summaries are reused, not redone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { connect } from '../../src/graph/db.js';

const [src, srcGraph, dir, demoGraph] = process.argv.slice(2);
if (!src || !srcGraph || !dir || !demoGraph) { console.error('usage: setup.ts <source-repo> <source-graph> <demo-dir> <demo-graph>'); process.exit(2); }
if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
execFileSync('git', ['clone', '-q', src, dir]);
execFileSync('git', ['-C', dir, 'config', 'user.name', 'Sam Contributor']);
execFileSync('git', ['-C', dir, 'config', 'user.email', 'sam@example.com']);
const db = await connect();
const all = await db.list();
for (const [from, to] of [[srcGraph, demoGraph], [`${srcGraph}__board`, `${demoGraph}__board`], [`${srcGraph}__files`, `${demoGraph}__files`]]) {
  if (!all.includes(from)) continue;
  if (all.includes(to)) await db.selectGraph(to).delete();
  await db.selectGraph(from).copy(to);
  console.log(`copied ${from} → ${to}`);
}
await db.close();
console.log(`demo repo: ${dir}`);

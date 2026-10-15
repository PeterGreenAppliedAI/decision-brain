/**
 * Demo setup: a disposable copy of a repo and its graphs, so the demo can commit freely.
 *   npx tsx --env-file=.env scripts/demo/setup.ts <source-repo> <source-graph> <demo-dir> <demo-graph>
 * Clones the repo (local clone, same history) and copies the brain graph and both boards server-side
 * (FalkorDB GRAPH.COPY) — extraction and summaries are reused, not redone.
 *
 * Safe to re-run: it only replaces what it made itself. An existing <demo-dir> is removed only if it is
 * a clone of <source-repo> (its origin); an existing demo graph only if it carries the marker this script
 * writes. Anything else — or a target that is, contains or sits inside the source — is refused.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { connect } from '../../src/graph/db.js';

const fail = (msg: string): never => { console.error(`refused: ${msg}`); process.exit(2); };
const [srcArg, srcGraph, dirArg, demoGraph] = process.argv.slice(2);
if (!srcArg || !srcGraph || !dirArg || !demoGraph) { console.error('usage: setup.ts <source-repo> <source-graph> <demo-dir> <demo-graph>'); process.exit(2); }

// The directory.
const real = (p: string) => (existsSync(p) ? realpathSync(p) : resolve(p));
const src = real(srcArg);
const dir = real(dirArg);
const inside = (a: string, b: string) => a === b || a.startsWith(b + sep);
if (!existsSync(resolve(src, '.git'))) fail(`${src} is not a git repository`);
for (const p of [src, process.cwd(), homedir(), '/']) if (inside(p, dir)) fail(`${dir} is or contains ${p}`);
if (inside(dir, src)) fail(`${dir} is inside the source repository`);
if (existsSync(dir)) {
  let origin = '';
  try { origin = execFileSync('git', ['-C', dir, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim(); } catch { /* not a clone */ }
  if (!origin || real(origin) !== src) fail(`${dir} exists and is not a clone of ${src} — remove it yourself if it is meant to go`);
}

// The graphs: a demo graph is never a source graph, and is replaced only if this script made it.
const pairs = [[srcGraph, demoGraph], [`${srcGraph}__board`, `${demoGraph}__board`], [`${srcGraph}__files`, `${demoGraph}__files`]];
const sources = new Set(pairs.map(([f]) => f));
if (pairs.some(([, t]) => sources.has(t))) fail('the demo graph name collides with a source graph');
const db = await connect();
const all = await db.list();
if (!all.includes(srcGraph)) fail(`no graph ${srcGraph}`);
for (const [, to] of pairs) {
  if (!all.includes(to)) continue;
  const marked = (await db.selectGraph(to).roQuery<{ n: number }>('MATCH (m:DemoCopy) RETURN count(m) AS n')).data?.[0]?.n ?? 0;
  if (!marked) fail(`graph ${to} exists and was not made by this script — delete it yourself if it is meant to go`);
}

if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
execFileSync('git', ['clone', '-q', src, dir]);
execFileSync('git', ['-C', dir, 'config', 'user.name', 'Sam Contributor']);
execFileSync('git', ['-C', dir, 'config', 'user.email', 'sam@example.com']);
for (const [from, to] of pairs) {
  if (!all.includes(from)) continue;
  if (all.includes(to)) await db.selectGraph(to).delete();
  await db.selectGraph(from).copy(to);
  await db.selectGraph(to).query('CREATE (:DemoCopy {of: $from})', { params: { from } });
  console.log(`copied ${from} → ${to}`);
}
await db.close();
console.log(`demo repo: ${dir}`);

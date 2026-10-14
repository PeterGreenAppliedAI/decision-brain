/**
 * The rationale graph: one derived edge type, (:Decision)-[:RATIONALE {via}]->(:File|:Decision),
 * meaning "this decision's reasoning rests on that". Built by code from the rest of the graph, and
 * rebuilt whole after every ingest or integration, so it never drifts from what it summarizes.
 *
 *   via 'mentions'  — the entry names the file
 *   via 'recorded'  — the commit that recorded the entry changed the file AND the entry names it: its
 *                     stem ("fact-store", "verification" for verification.test.ts) or a distinctive
 *                     directory on its path ("chrome-extension"). Recording commits carry housekeeping;
 *                     a file the entry never names is not its rationale. Lockfiles, docs and the
 *                     decision logs themselves are never included.
 *   via 'supersedes' | 'revises' | 'disproves' — newer decision → older one
 *
 * PageRank over it ranks files by how much reasoning rests on them (load_bearing); shortest paths
 * over it and the concept edges connect two things through decisions rather than through a hub.
 */
import { config } from '../config.js';
import type { Graph } from './db.js';

/** A glob ("**" any directories, "*" within one name) → a RegExp over the whole path. */
export function globToRegExp(glob: string): RegExp {
  // Placeholders first, so the regex text inserted for one wildcard is never rewritten by the next.
  const re = glob
    .replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '\u0003').replace(/\?/g, '\u0004')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*').replace(/\u0003/g, '[^/]*').replace(/\u0004/g, '[^/]');
  return new RegExp(`^${re}$`);
}

const norm = (s: string) => s.toLowerCase().replace(/[_\s-]+/g, ' ');

/**
 * The names an entry could use for a file: its stem without test/spec suffixes, and every directory
 * segment that is distinctive — on fewer than `maxShare` of all paths (so never "src" or "test").
 */
export function fileNames(path: string, segmentShare: Map<string, number>, maxShare: number): string[] {
  const parts = path.split('/');
  const stem = parts.at(-1)!.replace(/\.[^.]+$/, '').replace(/\.(test|spec)$/, '');
  const dirs = parts.slice(0, -1).filter((d) => (segmentShare.get(d) ?? 1) < maxShare);
  return [...new Set([stem, ...dirs].filter((n) => n.length >= 3).map(norm))];
}

export async function buildRationale(brain: Graph, exclude = config.rationaleExclude): Promise<number> {
  await brain.query('MATCH ()-[r:RATIONALE]->() DELETE r');
  const patterns = exclude.map(globToRegExp);
  const logs = new Set(((await brain.roQuery<{ f: string }>(
    'MATCH (d:Decision) RETURN DISTINCT d.sourceFile AS f')).data ?? []).map((r) => r.f));
  const isLog = (path: string) => logs.has(path) || [...logs].some((dir) => path.startsWith(dir + '/'));

  const allPaths = ((await brain.roQuery<{ p: string }>('MATCH (f:File) RETURN f.path AS p')).data ?? []).map((r) => r.p);
  const segmentShare = new Map<string, number>();
  for (const p of allPaths) for (const seg of new Set(p.split('/').slice(0, -1))) segmentShare.set(seg, (segmentShare.get(seg) ?? 0) + 1);
  for (const [k, v] of segmentShare) segmentShare.set(k, v / Math.max(1, allPaths.length));
  const texts = new Map(((await brain.roQuery<{ id: string; text: string }>(
    "MATCH (d:Decision) RETURN d.id AS id, d.title + ' ' + coalesce(d.body, '') AS text")).data ?? []).map((r) => [r.id, norm(r.text)]));

  const recorded = ((await brain.roQuery<{ id: string; path: string }>(
    'MATCH (d:Decision)-[:RECORDED_IN]->(:Commit)-[:TOUCHED]->(f:File) RETURN DISTINCT d.id AS id, f.path AS path')).data ?? [])
    .filter((r) => !isLog(r.path) && !patterns.some((p) => p.test(r.path)))
    .filter((r) => fileNames(r.path, segmentShare, config.distinctiveSegmentShare).some((n) => texts.get(r.id)?.includes(n)));
  await brain.query(
    `UNWIND $rows AS r MATCH (d:Decision {id: r.id}), (f:File {path: r.path})
     MERGE (d)-[:RATIONALE {via: 'recorded'}]->(f)`, { params: { rows: recorded as never } });
  await brain.query(
    `MATCH (d:Decision)-[:MENTIONS]->(f:File) MERGE (d)-[:RATIONALE {via: 'mentions'}]->(f)`);
  for (const rel of ['SUPERSEDES', 'REVISES', 'DISPROVES']) {
    await brain.query(`MATCH (n:Decision)-[:${rel}]->(o:Decision) MERGE (n)-[:RATIONALE {via: '${rel.toLowerCase()}'}]->(o)`);
  }
  const n = await brain.roQuery<{ n: number }>('MATCH ()-[r:RATIONALE]->() RETURN count(r) AS n');
  return n.data?.[0]?.n ?? 0;
}

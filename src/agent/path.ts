/**
 * The path behind an answer: the subgraph that supports it, drawn from what the answer cited and what
 * the tools were pointed at — never from what the model merely mentioned. Decisions bring the commit
 * that recorded them; a measurement or experiment joins only if the answer quotes it. Edges are the
 * real relationships among those nodes, read from the graph.
 */
import type { Step } from '../../lib/loop.js';
import type { Graph } from '../graph/db.js';
import { normalize } from '../team/extract.js';
import type { Grounding } from './ground.js';

export interface PathNode { id: string; kind: 'decision' | 'commit' | 'file' | 'person' | 'measurement' | 'experiment' | 'concept'; label: string; detail?: string; cited: boolean }
export interface PathEdge { source: string; target: string; type: string }
export interface AnswerPath { nodes: PathNode[]; edges: PathEdge[] }

const rows = async <T>(g: Graph, cypher: string, params: Record<string, unknown>) =>
  (await g.roQuery<T>(cypher, { params: params as never })).data ?? [];

/** What the tools were pointed at: files, decisions, commits named in their arguments. */
function targets(steps: Step[]): string[] {
  const out: string[] = [];
  for (const s of steps) for (const v of Object.values(s.args)) if (typeof v === 'string') out.push(v);
  return out;
}

export async function buildPath(g: Graph, answer: string, steps: Step[], grounding: Grounding): Promise<AnswerPath> {
  const wanted = [...new Set([...grounding.valid, ...targets(steps)])];
  const decisions = (await rows<{ id: string }>(g, 'MATCH (d:Decision) WHERE d.id IN $w RETURN d.id AS id', { w: wanted })).map((r) => r.id);
  const files = (await rows<{ p: string }>(g, 'MATCH (f:File) WHERE f.path IN $w RETURN f.path AS p', { w: wanted })).map((r) => r.p);
  const shaRefs = wanted.filter((w) => /^[0-9a-f]{7,40}$/.test(w));
  const commits = (await rows<{ sha: string }>(g,
    'MATCH (c:Commit) WHERE any(r IN $refs WHERE c.sha STARTS WITH r) RETURN c.sha AS sha', { refs: shaRefs })).map((r) => r.sha);
  const recorded = (await rows<{ sha: string }>(g,
    'MATCH (d:Decision)-[:RECORDED_IN]->(c:Commit) WHERE d.id IN $ids RETURN DISTINCT c.sha AS sha', { ids: decisions })).map((r) => r.sha);

  // Evidence joins only when the answer quotes it.
  const said = normalize(answer);
  const evidence = await rows<{ id: string; kind: string; label: string; quote: string }>(g,
    `MATCH (d:Decision)-[:BECAUSE|TESTED]->(x) WHERE d.id IN $ids
     RETURN x.id AS id, CASE WHEN x:Measurement THEN 'measurement' ELSE 'experiment' END AS kind,
            CASE WHEN x:Measurement THEN x.metric + ' ' + x.value ELSE x.hypothesis END AS label, x.quote AS quote`, { ids: decisions });
  // A measurement joins when its value appears in the answer; an experiment when most of its
  // hypothesis's significant words do (the agent paraphrases).
  const words = (t: string) => (normalize(t).match(/[a-z0-9:./]{4,}/g) ?? []);
  const quoted = evidence.filter((e) => {
    if (e.kind === 'measurement') { const v = normalize(e.label.split(' ').at(-1) ?? ''); return /\d/.test(v) && said.includes(v); }
    const w = words(e.label);
    return w.length > 0 && w.filter((x) => said.includes(x)).length / w.length >= 0.6;
  });

  const allShas = [...new Set([...commits, ...recorded])];
  const meta = await rows<{ key: string; kind: string; label: string; detail: string | null }>(g,
    `MATCH (n) WHERE (n:Decision AND n.id IN $d) OR (n:Commit AND n.sha IN $c) OR (n:File AND n.path IN $f)
     RETURN coalesce(n.id, n.sha, n.path) AS key,
            CASE WHEN n:Decision THEN 'decision' WHEN n:Commit THEN 'commit' ELSE 'file' END AS kind,
            CASE WHEN n:Decision THEN n.title WHEN n:Commit THEN n.short ELSE n.path END AS label,
            CASE WHEN n:Decision THEN n.date + ' · ' + n.status + ' · ' + n.source WHEN n:Commit THEN substring(n.date, 0, 10) + ' · ' + substring(n.message, 0, 140) ELSE null END AS detail`,
    { d: decisions, c: allShas, f: files });
  const cited = new Set([...grounding.valid]);
  const isCited = (key: string) => cited.has(key) || [...cited].some((c) => /^[0-9a-f]{7,40}$/.test(c) && key.startsWith(c));
  const nodes: PathNode[] = [
    ...meta.map((m) => ({ id: m.key, kind: m.kind as PathNode['kind'], label: m.label, detail: m.detail ?? undefined, cited: isCited(m.key) })),
    ...quoted.map((e) => ({ id: e.id, kind: e.kind as PathNode['kind'], label: e.label, detail: e.quote, cited: true })),
  ];

  const keys = nodes.map((n) => n.id);
  const edges = await rows<PathEdge>(g,
    `MATCH (a)-[r]->(b)
     WHERE coalesce(a.id, a.sha, a.path) IN $k AND coalesce(b.id, b.sha, b.path) IN $k AND type(r) <> 'RATIONALE'
     RETURN DISTINCT coalesce(a.id, a.sha, a.path) AS source, coalesce(b.id, b.sha, b.path) AS target, type(r) AS type`,
    { k: keys });
  return { nodes, edges };
}

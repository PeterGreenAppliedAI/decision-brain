/**
 * The graph tools — the agent's only way to see the graph, and the parts `review` is built from.
 * Read-only Cypher, deterministic ordering, and every item carries the id and source an answer must
 * cite. No model anywhere in here.
 */
import type { Graph } from '../graph/db.js';
import { trace } from './trace.js';

export interface DecisionRef { id: string; title: string; date: string | null; status: string; source: string }
export interface Measured { id: string; metric: string; value: string; quote: string }
export interface Tried { id: string; hypothesis: string; verdict: string; quote: string }

export type Target =
  | { kind: 'decision'; id: string }
  | { kind: 'file'; path: string }
  | { kind: 'concept'; name: string }
  | { kind: 'none'; query: string; suggestions: string[] };

const rows = async <T>(g: Graph, cypher: string, params: Record<string, unknown> = {}) =>
  (await g.roQuery<T>(cypher, { params: params as never })).data ?? [];

const DECISION = 'd {.id, .title, .date, .status, .source}';
/** A concept matches a topic when the topic is a whole word (or phrase) of its name: "router" finds
 *  "router", "router prompt" and "smart router", not "rerouter". Parenthesized — FalkorDB binds
 *  CONTAINS tighter than +. */
const CONCEPT_MATCH = "(' ' + c.name + ' ') CONTAINS (' ' + $k + ' ')";
/** Newest first; undated last; id breaks ties so the order never varies between runs. */
const NEWEST = 'ORDER BY CASE WHEN d.date IS NULL THEN 1 ELSE 0 END, d.date DESC, d.id';

/** What a free-text argument names: a decision id, a file (exact, or a unique path suffix), or a concept. */
export async function resolveTarget(g: Graph, text: string): Promise<Target> {
  const q = text.trim();
  if ((await rows(g, 'MATCH (d:Decision {id: $q}) RETURN d.id AS id', { q })).length) return { kind: 'decision', id: q };
  const files = await rows<{ path: string }>(g,
    "MATCH (f:File) WHERE f.path = $q OR f.path ENDS WITH ('/' + $q) RETURN f.path AS path ORDER BY size(f.path) LIMIT 5", { q });
  if (files.length === 1 || files[0]?.path === q) return { kind: 'file', path: files[0].path };
  const concept = await rows<{ name: string }>(g, 'MATCH (c:Concept {name: toLower($q)}) RETURN c.name AS name', { q });
  if (concept.length) return { kind: 'concept', name: concept[0].name };
  // A topic that is a whole word of some concept names ("router" → "router prompt", "smart router").
  const topic = await rows<{ n: number }>(g, `MATCH (c:Concept) WHERE ${CONCEPT_MATCH} RETURN count(c) AS n`, { k: q.toLowerCase() });
  if (topic[0]?.n) return { kind: 'concept', name: q.toLowerCase() };
  const near = [
    ...await rows<{ s: string }>(g, 'MATCH (c:Concept) WHERE c.name CONTAINS toLower($q) RETURN c.name AS s ORDER BY size(c.name), s LIMIT 5', { q }),
    ...await rows<{ s: string }>(g, 'MATCH (f:File) WHERE f.path CONTAINS $q RETURN f.path AS s ORDER BY size(f.path), s LIMIT 5', { q }),
  ];
  return { kind: 'none', query: q, suggestions: [...files.map((f) => f.path), ...near.map((r) => r.s)].slice(0, 8) };
}

/**
 * Free text → decisions, by the full-text index over titles and bodies. Entries containing every
 * word rank first; entries containing any of them fill the rest — so a long entry full of common
 * words cannot outrank the one that is actually about the question.
 */
export async function search(g: Graph, text: string, limit = 8): Promise<Array<DecisionRef & { score: number; matched: 'all' | 'any' }>> {
  const words = [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (!words.length) return [];
  const run = (q: string) => rows<{ decision: DecisionRef; score: number }>(g,
    `CALL db.idx.fulltext.queryNodes('Decision', $q) YIELD node AS d, score
     RETURN ${DECISION} AS decision, score ORDER BY score DESC, d.id LIMIT $limit`, { q, limit });
  const all = (await run(words.join(' '))).map((x) => ({ ...x.decision, score: Math.round(x.score * 100) / 100, matched: 'all' as const }));
  const seen = new Set(all.map((d) => d.id));
  const any = words.length > 1
    ? (await run(words.join('|'))).filter((x) => !seen.has(x.decision.id))
      .map((x) => ({ ...x.decision, score: Math.round(x.score * 100) / 100, matched: 'any' as const }))
    : [];
  return [...all, ...any].slice(0, limit);
}

async function evidence(g: Graph, ids: string[]) {
  // Projected under a different name than the node: ORDER BY after RETURN sees a same-named
  // projection, not the node, and the projection has no pos — every row would sort equal.
  const m = await rows<{ d: string; m: Measured }>(g,
    'MATCH (d:Decision)-[:BECAUSE]->(x:Measurement) WHERE d.id IN $ids RETURN d.id AS d, x {.id, .metric, .value, .quote} AS m ORDER BY coalesce(x.pos, 1e9), x.id', { ids });
  const e = await rows<{ d: string; e: Tried }>(g,
    'MATCH (d:Decision)-[:TESTED]->(x:Experiment) WHERE d.id IN $ids RETURN d.id AS d, x {.id, .hypothesis, .verdict, .quote} AS e ORDER BY coalesce(x.pos, 1e9), x.id', { ids });
  const by = <T>(list: Array<{ d: string } & Record<string, T>>, key: string) => {
    const out = new Map<string, T[]>();
    for (const r of list) out.set(r.d, [...(out.get(r.d) ?? []), r[key]]);
    return out;
  };
  return { measurements: by<Measured>(m as never, 'm'), experiments: by<Tried>(e as never, 'e') };
}

export interface WhyItem extends DecisionRef { via: string[]; measurements: Measured[]; experiments: Tried[] }

/** The decisions that shaped a file or a concept, newest first, each with how it connects and its evidence. */
export async function why(g: Graph, text: string): Promise<{ target: Target; decisions: WhyItem[] }> {
  const target = await resolveTarget(g, text);
  let found: Array<{ d: DecisionRef; via: string[] }> = [];
  if (target.kind === 'file') {
    found = await rows(g, `MATCH (d:Decision)-[r:RATIONALE]->(:File {path: $p}) WITH d, collect(DISTINCT r.via) AS via
      RETURN ${DECISION} AS d, via ${NEWEST}`, { p: target.path });
  } else if (target.kind === 'concept') {
    found = await rows(g, `MATCH (d:Decision)-[:ABOUT|ABOUT_BROADLY]->(c:Concept) WHERE ${CONCEPT_MATCH}
      WITH DISTINCT d RETURN ${DECISION} AS d, ['about'] AS via ${NEWEST}`, { k: target.name });
  } else if (target.kind === 'decision') {
    found = await rows(g, `MATCH (d:Decision {id: $id}) RETURN ${DECISION} AS d, ['self'] AS via`, { id: target.id });
  }
  const ev = await evidence(g, found.map((f) => f.d.id));
  return { target, decisions: found.map((f) => ({ ...f.d, via: f.via.sort(),
    measurements: ev.measurements.get(f.d.id) ?? [], experiments: ev.experiments.get(f.d.id) ?? [] })) };
}

const SETTLED = ['superseded', 'failed'];

/** If this file changes, which standing decisions should be re-checked — and on what evidence. */
export async function whatBreaks(g: Graph, file: string): Promise<{ target: Target; recheck: WhyItem[]; history: WhyItem[] }> {
  const w = await why(g, file);
  return {
    target: w.target,
    recheck: w.decisions.filter((d) => !SETTLED.includes(d.status)),
    history: w.decisions.filter((d) => SETTLED.includes(d.status)),
  };
}

/** What was tried and rejected around a file or concept — so nobody tries it again. */
export async function disproven(g: Graph, text: string): Promise<{ target: Target; experiments: Array<Tried & { decision: DecisionRef }>; decisions: DecisionRef[] }> {
  const target = await resolveTarget(g, text);
  // Nothing named exactly: fall back to the entries a text search finds, so a topic still works.
  const scope = target.kind === 'file' ? 'MATCH (d:Decision)-[:RATIONALE]->(:File {path: $k})'
    : target.kind === 'concept' ? `MATCH (d:Decision)-[:ABOUT|ABOUT_BROADLY]->(c:Concept) WHERE ${CONCEPT_MATCH} WITH DISTINCT d`
    : target.kind === 'decision' ? 'MATCH (d:Decision {id: $k})'
    : 'MATCH (d:Decision) WHERE d.id IN $k';
  const k = target.kind === 'file' ? target.path : target.kind === 'concept' ? target.name : target.kind === 'decision' ? target.id
    : (await search(g, text, 25)).map((d) => d.id);
  const experiments = await rows<{ e: Tried; d: DecisionRef }>(g,
    `${scope} MATCH (d)-[:TESTED]->(e:Experiment {verdict: 'disproven'})
     RETURN e {.id, .hypothesis, .verdict, .quote} AS e, ${DECISION} AS d ${NEWEST}, e.id`, { k });
  const decisions = await rows<{ d: DecisionRef }>(g,
    `${scope} WITH DISTINCT d WHERE d.status IN $settled RETURN ${DECISION} AS d ${NEWEST}`, { k, settled: SETTLED });
  return { target, experiments: experiments.map((r) => ({ ...r.e, decision: r.d })), decisions: decisions.map((r) => r.d) };
}

export interface Knower { name: string; kind: string; commits: number; last: string }

/** Who knows a file (commits that touched it) or a concept (commits that recorded decisions about it). */
export async function whoKnows(g: Graph, text: string, limit = 5): Promise<{ target: Target; people: Knower[]; agents: Knower[] }> {
  const target = await resolveTarget(g, text);
  const match = target.kind === 'file' ? 'MATCH (p:Person)-[:AUTHORED]->(c:Commit)-[:TOUCHED]->(:File {path: $k})'
    : target.kind === 'concept' ? `MATCH (p:Person)-[:AUTHORED]->(c:Commit)<-[:RECORDED_IN]-(:Decision)-[:ABOUT|ABOUT_BROADLY]->(cc:Concept) WHERE ${CONCEPT_MATCH.replace(/c\.name/g, 'cc.name')}`
    : null;
  if (!match) return { target, people: [], agents: [] };
  const k = target.kind === 'file' ? target.path : (target as { name: string }).name;
  const all = await rows<Knower>(g,
    `${match} WITH p, count(DISTINCT c) AS commits, max(c.date) AS last
     RETURN p.name AS name, p.kind AS kind, commits, substring(last, 0, 10) AS last ORDER BY commits DESC, name`, { k });
  return { target, people: all.filter((p) => p.kind === 'human').slice(0, limit), agents: all.filter((p) => p.kind === 'agent').slice(0, limit) };
}

// Models are hubs like common concepts — "both mention gemma4" is not a reason — so INVOLVES is not walked.
const PATH_RELS = ['RATIONALE', 'ABOUT', 'BECAUSE', 'TESTED'];

/**
 * The shortest chain of reasoning between two things — through decisions and specific concepts;
 * never through a person, the log file, or a concept so common it would join anything (ABOUT_BROADLY).
 */
export async function connect(g: Graph, a: string, b: string, maxLen = 6) {
  const [ta, tb] = await Promise.all([resolveTarget(g, a), resolveTarget(g, b)]);
  const match = (t: Target, v: string) => t.kind === 'file' ? `(${v}:File {path: $${v}})` : t.kind === 'concept' ? `(${v}:Concept {name: $${v}})`
    : t.kind === 'decision' ? `(${v}:Decision {id: $${v}})` : null;
  const key = (t: Target) => t.kind === 'file' ? t.path : t.kind === 'concept' ? t.name : t.kind === 'decision' ? t.id : '';
  const ma = match(ta, 'a'), mb = match(tb, 'b');
  if (!ma || !mb) return { from: ta, to: tb, path: null };
  const res = await rows<{ nodes: Array<{ label: string; key: string; title: string | null; source: string | null }>; rels: string[] }>(g,
    `MATCH ${ma}, ${mb}
     CALL algo.SPpaths({sourceNode: a, targetNode: b, relTypes: $rels, relDirection: 'both', maxLen: $maxLen, pathCount: 1}) YIELD path
     RETURN [n IN nodes(path) | {label: labels(n)[0], key: coalesce(n.id, n.path, n.name), title: n.title, source: n.source}] AS nodes,
            [r IN relationships(path) | coalesce(r.via, type(r))] AS rels`,
    { a: key(ta), b: key(tb), rels: PATH_RELS, maxLen });
  return { from: ta, to: tb, path: res[0] ?? null };
}

/** PageRank over the rationale graph: the files the most reasoning rests on. */
export async function loadBearing(g: Graph, limit = 10) {
  const ranked = await rows<{ path: string; score: number; decisions: number }>(g,
    `CALL algo.pageRank(NULL, 'RATIONALE') YIELD node, score
     WITH node, score WHERE node:File
     MATCH (dd:Decision)-[:RATIONALE]->(node)
     RETURN node.path AS path, score, count(DISTINCT dd) AS decisions
     ORDER BY score DESC, path LIMIT $limit`, { limit });
  return ranked.map((r) => ({ ...r, score: Math.round(r.score * 10000) / 10000 }));
}

export { trace };

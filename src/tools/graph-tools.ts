/**
 * The graph tools — the agent's only way to see the graph, and the parts `review` is built from.
 * Read-only Cypher, deterministic ordering, and every item carries the id and source an answer must
 * cite. No model anywhere in here.
 */
import { config } from '../config.js';
import type { Graph } from '../graph/db.js';
import { hasVectorIndex } from '../graph/embeddings.js';
import { createEmbedder, type Embedder } from '../llm/embed.js';
import { ancestors } from '../ingest/git.js';
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
const indexed = new WeakMap<Graph, boolean>();

/** FalkorDB answers a full-text query on a missing index with an empty result, not an error — so
 *  "no matches" could silently mean "no index". Check once per graph, and fail loudly instead. */
async function assertSearchIndex(g: Graph): Promise<void> {
  if (indexed.get(g)) return;
  const idx = await rows<{ types: Record<string, string[]> }>(g,
    "CALL db.indexes() YIELD label, types WHERE label = 'Decision' RETURN types");
  const ok = idx.some((r) => (r.types?.title ?? []).includes('FULLTEXT'));
  if (!ok) throw new Error('this graph has no full-text index on decisions — re-run npm run ingest for it');
  indexed.set(g, true);
}

// Search by meaning, when embeddings are configured: the query is embedded and matched against the
// decisions' vectors. A failure (no embedder, server down, graph never embedded) means words alone.
let embedder: Embedder | null | undefined;
export function setEmbedder(e: Embedder | null): void { embedder = e; }
const vectorReady = new WeakMap<Graph, boolean>();
let warned = false;

async function byMeaning(g: Graph, text: string, limit: number): Promise<Array<{ decision: DecisionRef; distance: number }>> {
  if (embedder === undefined) embedder = createEmbedder();
  if (!embedder) return [];
  try {
    if (!vectorReady.has(g)) vectorReady.set(g, await hasVectorIndex(g));
    if (!vectorReady.get(g)) return [];
    const [v] = await embedder.embed([text]);
    return (await rows<{ decision: DecisionRef; distance: number }>(g,
      `CALL db.idx.vector.queryNodes('Decision', 'embedding', $k, vecf32($v)) YIELD node AS d, score
       RETURN ${DECISION} AS decision, score AS distance ORDER BY distance, d.id`, { k: limit, v }))
      .filter((r) => r.distance <= config.embedMaxDistance);
  } catch (err) {
    if (!warned) { warned = true; process.stderr.write(`[search] meaning search unavailable, words only: ${(err as Error).message}\n`); }
    return [];
  }
}

/**
 * Decisions matching a question: every word first (the strongest signal), then matches by meaning and
 * matches on any word, interleaved. "matched" says which: all | meaning | any.
 */
export async function search(g: Graph, text: string, limit = 8): Promise<Array<DecisionRef & { score: number; matched: 'all' | 'any' | 'meaning' }>> {
  const words = [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (!words.length) return [];
  await assertSearchIndex(g);
  const run = (q: string) => rows<{ decision: DecisionRef; score: number }>(g,
    `CALL db.idx.fulltext.queryNodes('Decision', $q) YIELD node AS d, score
     RETURN ${DECISION} AS decision, score ORDER BY score DESC, d.id LIMIT $limit`, { q, limit });
  const all = (await run(words.join(' '))).map((x) => ({ ...x.decision, score: Math.round(x.score * 100) / 100, matched: 'all' as const }));
  const seen = new Set(all.map((d) => d.id));
  const meaning = (await byMeaning(g, text, limit)).filter((x) => !seen.has(x.decision.id))
    .map((x) => ({ ...x.decision, score: Math.round((1 - x.distance) * 100) / 100, matched: 'meaning' as const }));
  meaning.forEach((d) => seen.add(d.id));
  const any = words.length > 1
    ? (await run(words.join('|'))).filter((x) => !seen.has(x.decision.id))
      .map((x) => ({ ...x.decision, score: Math.round(x.score * 100) / 100, matched: 'any' as const }))
    : [];
  const mixed: typeof all = [];
  for (let i = 0; i < Math.max(meaning.length, any.length); i++) {
    if (meaning[i]) mixed.push(meaning[i] as never);
    if (any[i]) mixed.push(any[i] as never);
  }
  return [...all, ...mixed].slice(0, limit);
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
export async function whatBreaks(g: Graph, file: string): Promise<{ target: Target; recheck: WhyItem[]; history: Array<WhyItem & { replacedBy: Array<{ id: string; title: string; relation: string }> }> }> {
  const w = await why(g, file);
  // Settled by its own status, or by a later entry that replaced it — an entry's text rarely says it
  // was superseded; the superseding entry does. The same rule review uses. Each history item says
  // what replaced it, so its own status ("active", as written) is not read as standing.
  const by = await rows<{ id: string; n: { id: string; title: string; relation: string } }>(g,
    `MATCH (n:Decision)-[r:SUPERSEDES|REVISES|DISPROVES]->(d:Decision) WHERE d.id IN $ids
     RETURN DISTINCT d.id AS id, {id: n.id, title: n.title, relation: toLower(type(r))} AS n ORDER BY id, n.id`, { ids: w.decisions.map((d) => d.id) });
  const replacedBy = (id: string) => by.filter((r) => r.id === id).map((r) => r.n);
  const settled = (d: WhyItem) => SETTLED.includes(d.status) || replacedBy(d.id).length > 0;
  return { target: w.target, recheck: w.decisions.filter((d) => !settled(d)),
    history: w.decisions.filter(settled).map((d) => ({ ...d, replacedBy: replacedBy(d.id) })) };
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

/**
 * What a file or directory does now — from its summary, which describes code at a commit and is
 * never intent. `stale` when the file has changed since the commit the summary describes.
 */
export async function whatIs(g: Graph, text: string) {
  const dir = text.replace(/\/$/, '') || '.';
  const mod = await rows<{ path: string; purpose: string; parts: string; sha: string; contains: string[] }>(g,
    `MATCH (m:Module {path: $p}) OPTIONAL MATCH (m)-[:CONTAINS]->(x)
     RETURN m.path AS path, m.purpose AS purpose, m.parts AS parts, m.summarySha AS sha, collect(x.path) AS contains`,
    { p: ['repo', 'root', '/'].includes(dir) ? '.' : dir });
  if (mod.length) return { kind: 'directory' as const, path: mod[0].path, purpose: mod[0].purpose, parts: JSON.parse(mod[0].parts ?? '[]'), contains: mod[0].contains.sort(), describesCommit: mod[0].sha, note: 'describes code, not intent' };
  const target = await resolveTarget(g, text);
  if (target.kind !== 'file') return { kind: 'none' as const, target };
  const f = (await rows<{ purpose: string | null; summary: string | null; sha: string | null; summaryDate: string | null; changedSince: number }>(g,
    `MATCH (f:File {path: $p})
     OPTIONAL MATCH (s:Commit {sha: f.summarySha})
     OPTIONAL MATCH (c:Commit)-[:TOUCHED]->(f) WHERE s IS NOT NULL AND c.date > s.date
     RETURN f.purpose AS purpose, f.summary AS summary, f.summarySha AS sha, s.date AS summaryDate, count(c) AS changedSince`, { p: target.path }))[0];
  if (!f?.purpose) return { kind: 'file' as const, path: target.path, purpose: null, note: 'not summarized yet' };
  return { kind: 'file' as const, path: target.path, purpose: f.purpose, ...JSON.parse(f.summary ?? '{}'), describesCommit: f.sha,
    stale: f.changedSince > 0, changedSince: f.changedSince, note: 'describes code, not intent' };
}

/**
 * Intent at birth, then how it changed: the commit that first touched the file (its message is the
 * closest thing to a statement of original intent), any decision that commit recorded, every later
 * decision that rests on the file in date order, and what the file does now. Where nothing was
 * written down, recordedIntent is null — never inferred.
 */
export async function origin(g: Graph, text: string) {
  const target = await resolveTarget(g, text);
  if (target.kind !== 'file') return { target, birth: null, recordedIntent: null, history: [], now: null };
  const birth = (await rows<{ sha: string; short: string; date: string; message: string; authors: string[] }>(g,
    `MATCH (c:Commit)-[:TOUCHED]->(:File {path: $p}) WITH c ORDER BY c.date, c.sha LIMIT 1
     OPTIONAL MATCH (a:Person)-[:AUTHORED]->(c)
     RETURN c.sha AS sha, c.short AS short, c.date AS date, c.message AS message, collect(a.name) AS authors`, { p: target.path }))[0] ?? null;
  const bornWith = birth ? await rows<{ d: DecisionRef }>(g,
    `MATCH (d:Decision)-[:RECORDED_IN]->(:Commit {sha: $sha}) RETURN ${DECISION} AS d ORDER BY d.id`, { sha: birth.sha }) : [];
  const history = await rows<{ d: DecisionRef; via: string[] }>(g,
    `MATCH (d:Decision)-[r:RATIONALE]->(:File {path: $p}) WITH d, collect(DISTINCT r.via) AS via
     RETURN ${DECISION} AS d, via ORDER BY CASE WHEN d.date IS NULL THEN 1 ELSE 0 END, d.date, d.id`, { p: target.path });
  const now = await whatIs(g, target.path);
  return {
    target,
    birth: birth ? { ...birth, authors: birth.authors.sort() } : null,
    recordedIntent: birth ? { commitMessage: birth.message, decisions: bornWith.map((r) => r.d) } : null,
    history: history.map((h) => ({ ...h.d, via: h.via.sort() })),
    now: 'purpose' in now ? { purpose: now.purpose, describesCommit: (now as { describesCommit?: string }).describesCommit ?? null } : null,
  };
}

/**
 * What an AI agent was told when it wrote a commit: the instruction-file guidance in force at the
 * commit's date (sections whose lifespan covers it), most relevant first — sections naming the files
 * the commit touched, then sections naming files in the same directories. Says which agents co-wrote
 * the commit, and whether each piece of guidance has changed since.
 */
export async function told(g: Graph, ref: string, limit = 6, repo?: string) {
  const c = (await rows<{ sha: string; short: string; date: string; message: string; files: string[]; agents: string[]; humans: string[] }>(g,
    `MATCH (c:Commit) WHERE c.sha STARTS WITH $ref
     OPTIONAL MATCH (c)-[:TOUCHED]->(f:File)
     WITH c, collect(DISTINCT f.path) AS files
     OPTIONAL MATCH (p:Person)-[:AUTHORED]->(c)
     RETURN c.sha AS sha, c.short AS short, coalesce(c.committedAt, c.date) AS date, c.message AS message, files,
            [x IN collect(DISTINCT p) WHERE x.kind = 'agent' | x.name] AS agents,
            [x IN collect(DISTINCT p) WHERE x.kind = 'human' | x.name] AS humans LIMIT 2`, { ref }));
  if (c.length !== 1) return { commit: null, error: c.length ? 'ambiguous commit prefix' : 'no such commit in the graph' };
  const commit = c[0];
  // In force at the commit: with the repo, sections whose introducing commit is in its history and whose
  // replacing commit is not (ancestry); without it, by committer timestamp — an approximation.
  const anc = repo ? [...ancestors(repo, commit.sha)] : null;
  const dirs = [...new Set(commit.files.map((f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '')))].filter(Boolean);
  const inForce = await rows<{ id: string; path: string; heading: string; text: string; from: string; until: string | null; names: string[]; replacedBy: string | null; replacedOn: string | null }>(g,
    `MATCH (gd:Guidance)
     WHERE CASE WHEN $anc IS NULL THEN gd.from <= $date AND (gd.until IS NULL OR gd.until > $date)
                ELSE gd.fromSha IN $anc AND (gd.untilSha IS NULL OR NOT gd.untilSha IN $anc) END
     OPTIONAL MATCH (gd)-[:NAMES]->(f:File)
     WITH gd, collect(f.path) AS names
     OPTIONAL MATCH (newer:Guidance)-[:REPLACES]->(gd)
     RETURN gd.id AS id, gd.path AS path, gd.heading AS heading, gd.text AS text, gd.from AS from, gd.until AS until, names,
            newer.id AS replacedBy, newer.from AS replacedOn`, { date: commit.date, anc });
  const score = (gd: { names: string[] }) =>
    gd.names.filter((n) => commit.files.includes(n)).length * 10 + gd.names.filter((n) => dirs.some((d) => n.startsWith(d + '/'))).length;
  const ranked = inForce.map((gd) => ({ ...gd, relevance: score(gd) })).filter((gd) => gd.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id)).slice(0, limit);
  const versions = await rows<{ path: string; from: string }>(g,
    `MATCH (gd:Guidance) WHERE CASE WHEN $anc IS NULL THEN gd.from <= $date ELSE gd.fromSha IN $anc END
     RETURN gd.path AS path, max(gd.from) AS from`, { date: commit.date, anc });
  return {
    commit: { sha: commit.sha, short: commit.short, date: commit.date, message: commit.message, files: commit.files.sort() },
    aiCoAuthored: commit.agents.length > 0, agents: commit.agents.sort(), humans: commit.humans.sort(),
    instructionVersions: versions.map((v) => ({ file: v.path, versionDate: v.from })),
    guidance: ranked.map((gd) => ({
      id: gd.id, file: gd.path, heading: gd.heading, since: gd.from,
      text: gd.text.length > 900 ? gd.text.slice(0, 900) + ' …' : gd.text,
      namesTouched: gd.names.filter((n) => commit.files.includes(n)).sort(),
      changedSince: gd.until ? { on: gd.until, replacedBy: gd.replacedBy } : null,
    })),
    note: ranked.length ? undefined : 'no instruction section in force names these files or their directories',
  };
}

export { trace };

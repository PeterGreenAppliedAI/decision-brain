/**
 * The integrator — code, not a model. Promotes what the team VERIFIED from the board into the brain:
 *
 *   (:Decision)-[:BECAUSE]->(:Measurement {id, metric, value, quote, extractedBy})
 *   (:Decision)-[:TESTED]->(:Experiment {id, hypothesis, verdict, quote, extractedBy})
 *   (:Decision)-[:ABOUT]->(:Concept {name})
 *   (:Decision)-[:INVOLVES]->(:Model {name})
 *   (:Decision)-[:SUPERSEDES|REVISES|DISPROVES {via: 'board', quote, targetQuote, raisedBy, confirmedBy}]->(:Decision)
 *
 * Unverified findings and unconfirmed handoffs are never promoted. Each run rebuilds everything the
 * integrator owns from the board as it stands, so re-running converges instead of piling up.
 * Repeated extractions of the same section collapse: items are keyed by section + content.
 */
import { config } from '../config.js';
import type { Graph } from '../graph/db.js';
import { writeRows } from '../graph/db.js';
import { buildRationale } from '../graph/rationale.js';
import { normalize } from '../team/extract.js';

export interface IntegrationReport {
  measurements: number; experiments: number; concepts: number; models: number; edges: number;
  /** Concepts dropped as too generic, with the share of entries that contain them. */
  generic: Array<{ name: string; share: number }>;
}

interface FindingRow { section: string; kind: string; data: string; quote: string | null; agent: string }

export async function integrate(board: Graph, brain: Graph): Promise<IntegrationReport> {
  const findings = (await board.roQuery<FindingRow>(
    `MATCH (f:Finding {verified: true})-[:ABOUT]->(s:Section), (f)-[:FROM]->(a:Agent)
     WHERE f.kind <> 'cross_ref'
     RETURN s.id AS section, f.kind AS kind, f.data AS data, f.quote AS quote, a.name AS agent`)).data ?? [];
  const handoffs = (await board.roQuery<{ source: string; target: string; relation: string; quote: string; targetQuote: string; raisedBy: string; confirmedBy: string }>(
    `MATCH (h:Handoff {status: 'confirmed'})-[:FOR]->(t:Section), (f:Finding)-[:RAISED]->(h), (f)-[:ABOUT]->(s:Section), (f)-[:FROM]->(a:Agent)
     RETURN s.id AS source, t.id AS target, h.relation AS relation, f.quote AS quote, h.quote AS targetQuote,
            a.name AS raisedBy, h.resolvedBy AS confirmedBy`)).data ?? [];

  // Collapse repeats: one item per section + content, remembering every agent that found it.
  const items = new Map<string, { kind: string; section: string; data: Record<string, string>; quote: string | null; agents: Set<string> }>();
  for (const f of findings) {
    const data = JSON.parse(f.data) as Record<string, string>;
    const content = f.kind === 'measurement' ? `${normalize(data.metric)}=${normalize(data.value)}`
      : f.kind === 'experiment' ? normalize(data.hypothesis)
      : normalize(data.name);
    const key = `${f.section}|${f.kind}|${content}`;
    const item = items.get(key) ?? { kind: f.kind, section: f.section, data, quote: f.quote, agents: new Set<string>() };
    item.agents.add(f.agent);
    items.set(key, item);
  }
  type Item = { id: string; section: string; quote: string | null; extractedBy: string[]; [field: string]: unknown };
  const of = (kind: string): Array<Item & { name: string }> =>
    [...items.entries()].filter(([, v]) => v.kind === kind)
      .map(([id, v]) => ({ ...v.data, id, section: v.section, quote: v.quote, extractedBy: [...v.agents].sort() }) as Item & { name: string });

  for (const [label, prop] of [['Measurement', 'id'], ['Experiment', 'id'], ['Concept', 'name'], ['Model', 'name']] as const) {
    try { await brain.createNodeRangeIndex(label, prop); } catch (err) { if (!/already indexed/i.test(String(err))) throw err; }
  }

  // Rebuild what the integrator owns.
  await brain.query('MATCH (n) WHERE n:Measurement OR n:Experiment DETACH DELETE n');
  await brain.query('MATCH (:Decision)-[r:ABOUT|INVOLVES]->() DELETE r');
  // Relation edges the board made; ones ingest read from an entry's own status line stay.
  await brain.query("MATCH (:Decision)-[r:SUPERSEDES|REVISES|DISPROVES {via: 'board'}]->() DELETE r");

  const measurements = of('measurement');
  await writeRows(brain,
    `UNWIND $rows AS r MATCH (d:Decision {id: r.section})
     CREATE (m:Measurement {id: r.id, metric: r.metric, value: r.value, quote: r.quote, extractedBy: r.extractedBy})
     CREATE (d)-[:BECAUSE]->(m)`, measurements);
  const experiments = of('experiment');
  await writeRows(brain,
    `UNWIND $rows AS r MATCH (d:Decision {id: r.section})
     CREATE (e:Experiment {id: r.id, hypothesis: r.hypothesis, verdict: r.verdict, quote: r.quote, extractedBy: r.extractedBy})
     CREATE (d)-[:TESTED]->(e)`, experiments);
  // Concept names are lower-cased so "Write gate" and "write gate" are one concept across entries.
  // A concept nearly every entry contains (the project's own name) would join everything to
  // everything, so it is measured against the whole log and dropped past the configured share.
  const bodies = ((await brain.roQuery<{ body: string }>('MATCH (d:Decision) RETURN d.body AS body')).data ?? []).map((r) => normalize(r.body ?? ''));
  const generic = new Map<string, number>();
  for (const name of new Set(of('concept').map((c) => c.name.toLowerCase()))) {
    const hits = bodies.filter((b) => b.includes(normalize(name))).length;
    if (hits >= config.conceptMinCount && hits / bodies.length > config.conceptMaxShare) generic.set(name, hits / bodies.length);
  }
  const concepts = of('concept').map((c) => ({ ...c, name: c.name.toLowerCase() })).filter((c) => !generic.has(c.name));
  await writeRows(brain,
    `UNWIND $rows AS r MATCH (d:Decision {id: r.section})
     MERGE (c:Concept {name: r.name}) MERGE (d)-[:ABOUT]->(c)`, concepts);
  const models = of('model');
  await writeRows(brain,
    `UNWIND $rows AS r MATCH (d:Decision {id: r.section})
     MERGE (m:Model {name: r.name}) MERGE (d)-[:INVOLVES]->(m)`, models);
  // Every edge points newer → older; a superseded_by claim was raised from the older side.
  const edges = handoffs.map((h) => h.relation === 'superseded_by'
    ? { ...h, relation: 'supersedes', source: h.target, target: h.source, quote: h.targetQuote, targetQuote: h.quote }
    : h);
  for (const rel of ['supersedes', 'revises', 'disproves']) {
    await writeRows(brain,
      `UNWIND $rows AS r MATCH (s:Decision {id: r.source}), (t:Decision {id: r.target})
       MERGE (s)-[e:${rel.toUpperCase()} {via: 'board'}]->(t)
       SET e.quote = r.quote, e.targetQuote = r.targetQuote, e.raisedBy = r.raisedBy, e.confirmedBy = r.confirmedBy`,
      edges.filter((h) => h.relation === rel));
  }
  await brain.query('MATCH (n) WHERE (n:Concept OR n:Model) AND NOT (n)<--() DELETE n');
  await buildRationale(brain);

  return {
    measurements: measurements.length, experiments: experiments.length,
    concepts: new Set(concepts.map((c) => c.name)).size, models: new Set(models.map((m) => m.name)).size,
    edges: handoffs.length,
    generic: [...generic].map(([name, share]) => ({ name, share: Math.round(share * 100) / 100 })).sort((a, b) => b.share - a.share),
  };
}

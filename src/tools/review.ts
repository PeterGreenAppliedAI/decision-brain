/**
 * review: the deterministic review packet for a change. Code only — fixed queries, a fixed sort, and
 * item ids assigned after sorting, so the same change gives the same packet every time and a
 * write-up can cite its items (R1, D1, S1, P1…) and be checked against them.
 *
 * For each changed file the graph answers: which standing decisions rest on it (re-check them, on this
 * evidence), what was tried around it and failed (don't retry), which reasoning about it is
 * superseded (don't cite it), and who knows it (reviewers — never the change's own authors).
 * Reviewing a past commit uses only decisions dated up to that commit.
 */
import { execFileSync } from 'node:child_process';
import type { Graph } from '../graph/db.js';
import { disproven, whatBreaks, type DecisionRef, type Measured, type Tried } from './graph-tools.js';

export interface ReviewItem {
  id: string;
  kind: 'records' | 'recheck' | 'disproven' | 'superseded' | 'reviewer';
  file?: string;
  decision?: DecisionRef & { via?: string[] };
  measurements?: Measured[];
  experiment?: Tried;
  supersededBy?: Array<{ id: string; title: string }>;
  reviewer?: { name: string; commits: number; files: string[] };
}

export interface ReviewPacket {
  change: { ref: string; sha: string | null; date: string | null; authors: string[]; message: string | null; files: string[]; unknownFiles: string[] };
  asOf: string | null;
  items: ReviewItem[];
}

const rows = async <T>(g: Graph, cypher: string, params: Record<string, unknown> = {}) =>
  (await g.roQuery<T>(cypher, { params: params as never })).data ?? [];

/** A commit already in the graph (sha or unique prefix), or — with a repo path — any git range or ref. */
export async function changeOf(g: Graph, ref: string, repo?: string): Promise<ReviewPacket['change']> {
  const hits = await rows<{ sha: string; date: string; message: string; files: string[]; authors: string[] }>(g,
    `MATCH (c:Commit) WHERE c.sha STARTS WITH $ref
     RETURN c.sha AS sha, c.date AS date, c.message AS message,
            [(c)-[:TOUCHED]->(f:File) | f.path] AS files, [(p:Person)-[:AUTHORED]->(c) | p.name] AS authors LIMIT 2`, { ref });
  if (/^[0-9a-f]{4,40}$/.test(ref) && hits.length === 1) {
    const c = hits[0];
    return { ref, sha: c.sha, date: c.date, authors: c.authors.sort(), message: c.message, files: c.files.sort(), unknownFiles: [] };
  }
  if (!repo) throw new Error(`"${ref}" is not a single commit in the graph — pass --repo to review a range or ref with git`);
  const files = execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', 'diff', '--name-only', ref.includes('..') ? ref : `${ref}^!`],
    { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
  return { ref, sha: null, date: null, authors: [], message: null, files, unknownFiles: [] };
}

export async function review(g: Graph, ref: string, opts: { repo?: string; reviewers?: number } = {}): Promise<ReviewPacket> {
  const change = await changeOf(g, ref, opts.repo);
  const asOf = change.date?.slice(0, 10) ?? null;
  const known = new Set((await rows<{ p: string }>(g, 'MATCH (f:File) WHERE f.path IN $files RETURN f.path AS p', { files: change.files })).map((r) => r.p));
  change.unknownFiles = change.files.filter((f) => !known.has(f));
  const inTime = (d: { date: string | null }) => !asOf || !d.date || d.date.slice(0, 10) <= asOf;
  const recordedHere = new Set(change.sha
    ? (await rows<{ id: string }>(g, 'MATCH (d:Decision)-[:RECORDED_IN]->(:Commit {sha: $sha}) RETURN d.id AS id', { sha: change.sha })).map((r) => r.id)
    : []);

  const items: Omit<ReviewItem, 'id'>[] = [];
  const seen = new Set<string>();
  // What this change itself records — always shown, whatever its date (an entry is often dated the
  // morning after the commit that wrote it).
  for (const d of await rows<{ d: DecisionRef }>(g,
    "MATCH (d:Decision)-[:RECORDED_IN]->(:Commit {sha: $sha}) RETURN d {.id, .title, .date, .status, .source} AS d ORDER BY d.id",
    { sha: change.sha ?? '' })) {
    seen.add(`records|${d.d.id}`);
    items.push({ kind: 'records', decision: d.d });
  }
  // Status as of the change: a decision was superseded at review time only if what superseded it is
  // dated on or before the change. With no known superseder there is no date to check — keep it.
  const replacedBy = async (id: string) => (await rows<{ id: string; title: string; date: string | null }>(g,
    'MATCH (n:Decision)-[:SUPERSEDES|REVISES|DISPROVES]->(:Decision {id: $id}) RETURN n.id AS id, n.title AS title, n.date AS date ORDER BY n.id', { id }));

  for (const file of change.files.filter((f) => known.has(f))) {
    const b = await whatBreaks(g, file);
    const standing = [...b.recheck];
    const settled: Array<{ d: (typeof b.history)[number]; by: Array<{ id: string; title: string }> }> = [];
    for (const d of b.history) {
      const all = await replacedBy(d.id);
      const by = all.filter(inTime);
      if (all.length && !by.length && d.status === 'superseded') standing.push(d);   // replaced only later
      else settled.push({ d, by: by.map(({ id, title }) => ({ id, title })) });
    }
    for (const d of standing.filter(inTime)) {
      if (recordedHere.has(d.id) || seen.has(`recheck|${d.id}`)) continue;   // one item per decision, under the first file that reached it
      seen.add(`recheck|${d.id}`);
      const { measurements, experiments: _e, ...decision } = d;
      items.push({ kind: 'recheck', file, decision, measurements });
    }
    const dis = await disproven(g, file);
    for (const e of dis.experiments.filter((x) => inTime(x.decision) && !recordedHere.has(x.decision.id))) {
      if (seen.has(`disproven|${e.id}`)) continue;
      seen.add(`disproven|${e.id}`);
      const { decision, ...experiment } = e;
      items.push({ kind: 'disproven', file, decision, experiment });
    }
    for (const { d, by } of settled.filter((x) => inTime(x.d) && !recordedHere.has(x.d.id))) {
      if (seen.has(`superseded|${d.id}`)) continue;
      seen.add(`superseded|${d.id}`);
      const { measurements: _m, experiments: _x, ...decision } = d;
      items.push({ kind: 'superseded', file, decision, supersededBy: by });
    }
  }

  // Reviewers: humans with the most commits on the changed files, as of the change, excluding its authors.
  const people = await rows<{ name: string; commits: number; files: string[] }>(g,
    `MATCH (p:Person {kind: 'human'})-[:AUTHORED]->(c:Commit)-[:TOUCHED]->(f:File)
     WHERE f.path IN $files AND NOT p.name IN $authors AND ($asOf IS NULL OR substring(c.date, 0, 10) <= $asOf)
     WITH p, count(DISTINCT c) AS commits, collect(DISTINCT f.path) AS files
     RETURN p.name AS name, commits, files ORDER BY commits DESC, name LIMIT $n`,
    { files: change.files, authors: change.authors, asOf, n: opts.reviewers ?? 3 });
  for (const p of people) items.push({ kind: 'reviewer', reviewer: { ...p, files: p.files.sort() } });

  // Fixed order, then ids: the same change always yields the same ids.
  const order = ['records', 'recheck', 'disproven', 'superseded', 'reviewer'];
  const prefix: Record<string, string> = { records: 'C', recheck: 'R', disproven: 'D', superseded: 'S', reviewer: 'P' };
  const counters: Record<string, number> = {};
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) =>
    order.indexOf(a.it.kind) - order.indexOf(b.it.kind) || a.i - b.i).map(({ it }) => it);
  return {
    change, asOf,
    items: sorted.map((it) => ({ id: `${prefix[it.kind]}${(counters[it.kind] = (counters[it.kind] ?? 0) + 1)}`, ...it })),
  };
}

/** The packet as Markdown — what the CLI prints and what a write-up is grounded in. */
export function renderPacket(p: ReviewPacket): string {
  const c = p.change;
  const out = [`# Review packet — ${c.sha ? c.sha.slice(0, 7) : c.ref}`,
    c.message ? `> ${c.message.slice(0, 200)}` : '',
    `${c.files.length} files changed${c.authors.length ? ` · by ${c.authors.join(', ')}` : ''}${p.asOf ? ` · decisions as of ${p.asOf}` : ''}` +
      (c.unknownFiles.length ? ` · ${c.unknownFiles.length} not in the graph yet` : ''), ''];
  const dec = (d: DecisionRef) => `**${d.title}** (${d.date ?? 'undated'}, ${d.status}) — \`${d.source}\``;
  const section = (kind: ReviewItem['kind'], title: string, line: (i: ReviewItem) => string) => {
    const list = p.items.filter((i) => i.kind === kind);
    if (list.length) out.push(`## ${title}`, ...list.map((i) => `- **${i.id}** ${line(i)}`), '');
  };
  section('records', 'Decisions this change records', (i) => dec(i.decision!));
  section('recheck', 'Standing decisions that rest on these files — re-check', (i) =>
    `\`${i.file}\` → ${dec(i.decision!)}${i.measurements?.length ? `; measured: ${i.measurements.map((m) => `${m.metric} ${m.value}`).join('; ')}` : ''}`);
  section('disproven', 'Tried before and disproven — do not retry', (i) =>
    `\`${i.file}\` → "${i.experiment!.hypothesis}" — ${dec(i.decision!)}`);
  section('superseded', 'Superseded reasoning — do not cite', (i) =>
    `\`${i.file}\` → ${dec(i.decision!)}${i.supersededBy?.length ? `; replaced by ${i.supersededBy.map((s) => s.title).join(', ')}` : ''}`);
  section('reviewer', 'Who knows these files', (i) =>
    `${i.reviewer!.name} — ${i.reviewer!.commits} commits on ${i.reviewer!.files.join(', ')}`);
  if (p.items.length === 0) out.push('_The graph holds no decisions about these files._');
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

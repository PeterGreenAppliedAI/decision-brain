/**
 * review: the deterministic review packet for a change. Code only — fixed queries, a fixed sort, and
 * item ids assigned after sorting, so the same change gives the same packet every time and a
 * write-up can cite its items (R1, D1, S1, P1…) and be checked against them.
 *
 * For each changed file the graph answers: which standing decisions rest on it (re-check them, on this
 * evidence), what was tried around it and failed (don't retry), which reasoning about it is
 * superseded (don't cite it), and who knows it (reviewers — never the change's own authors).
 *
 * As of the change. With the repo at hand, the decision log is rebuilt as it stood at the commit
 * (from git): only entries that existed then count, each with the status its own text gave it then,
 * and extracted evidence is kept only where the entry's text is unchanged since (content hashes).
 * Without the repo, decisions are filtered by date — an approximation the packet names as such.
 * Every packet records its basis and a fingerprint of the graph state it was built from.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../config.js';
import type { Graph } from '../graph/db.js';
import { entriesAt, type EntryThen } from '../ingest/at-commit.js';
import { ancestors } from '../ingest/git.js';
import { disproven, whatBreaks, why, type DecisionRef, type Measured, type Tried } from './graph-tools.js';

export interface ReviewItem {
  id: string;
  kind: 'records' | 'recheck' | 'disproven' | 'tested' | 'superseded' | 'reviewer';
  file?: string;
  decision?: DecisionRef & { via?: string[]; statusThen?: string; evidence?: 'current' | 'omitted: entry edited since this commit' };
  measurements?: Measured[];
  experiments?: Tried[];
  experiment?: Tried;
  supersededBy?: Array<{ id: string; title: string }>;
  /** On a superseded decision: what it had tried and found disproven — history, not a live warning. */
  triedThen?: Tried[];
  reviewer?: { name: string; commits: number; files: string[] };
}

export interface ReviewPacket {
  change: { ref: string; sha: string | null; date: string | null; committedAt: string | null; authors: string[]; message: string | null; files: string[]; unknownFiles: string[] };
  /** The commit's committer-timestamp day — an approximation used by the date fallback and the reviewer
   *  cut-off. The rebuilt path follows the commit's own tree, not a date. */
  asOf: string | null;
  /** How "as of the change" was established, and which graph state the packet was built from. */
  basis: { method: 'log-at-commit' | 'by-date'; entriesThen: number | null; editedSince: number | null; fingerprint: string };
  items: ReviewItem[];
}

/** Same graph state, same fingerprint: decisions' content hashes plus the counts of extracted evidence. */
async function fingerprint(g: Graph): Promise<string> {
  const ds = (await g.roQuery<{ id: string; h: string | null }>('MATCH (d:Decision) RETURN d.id AS id, d.contentHash AS h ORDER BY id')).data ?? [];
  const n = (await g.roQuery<{ m: number; e: number; r: number }>(
    `OPTIONAL MATCH (m:Measurement) WITH count(m) AS m OPTIONAL MATCH (e:Experiment) WITH m, count(e) AS e
     OPTIONAL MATCH ()-[r:SUPERSEDES|REVISES|DISPROVES]->() RETURN m, e, count(r) AS r`)).data?.[0];
  return createHash('sha1').update(JSON.stringify([ds, n])).digest('hex').slice(0, 12);
}

/** Where a graph's repo lives: --repo, else REPO_PATHS ("graph=/path;…" in .env), else data/corpora/<graph>. */
export function repoFor(graph: string, explicit?: string): string | undefined {
  if (explicit ?? config.repoPaths[graph]) return explicit ?? config.repoPaths[graph];
  // A repository cloned here (the demo copy, or one added from the page) lives in data/corpora/<graph>.
  const local = resolve(import.meta.dirname, '../../data/corpora', graph);
  return /^[A-Za-z0-9_.-]+$/.test(graph) && existsSync(join(local, '.git')) ? local : undefined;
}

const rows = async <T>(g: Graph, cypher: string, params: Record<string, unknown> = {}) =>
  (await g.roQuery<T>(cypher, { params: params as never })).data ?? [];

/** A commit already in the graph (sha or unique prefix), or — with a repo path — any git range or ref. */
export async function changeOf(g: Graph, ref: string, repo?: string): Promise<ReviewPacket['change']> {
  const hits = await rows<{ sha: string; date: string; committedAt: string | null; message: string; files: string[]; authors: string[] }>(g,
    `MATCH (c:Commit) WHERE c.sha STARTS WITH $ref
     RETURN c.sha AS sha, c.date AS date, c.committedAt AS committedAt, c.message AS message,
            [(c)-[:TOUCHED]->(f:File) | f.path] AS files, [(p:Person)-[:AUTHORED]->(c) | p.name] AS authors LIMIT 2`, { ref });
  if (/^[0-9a-f]{4,40}$/.test(ref) && hits.length === 1) {
    const c = hits[0];
    return { ref, sha: c.sha, date: c.date, committedAt: c.committedAt ?? c.date, authors: c.authors.sort(), message: c.message, files: c.files.sort(), unknownFiles: [] };
  }
  if (!repo) throw new Error(`"${ref}" is not a single commit in the graph — pass --repo to review a range or ref with git`);
  const files = execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', 'diff', '--name-only', ref.includes('..') ? ref : `${ref}^!`],
    { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
  return { ref, sha: null, date: null, committedAt: null, authors: [], message: null, files, unknownFiles: [] };
}

export async function review(g: Graph, ref: string, opts: { repo?: string; reviewers?: number } = {}): Promise<ReviewPacket> {
  const change = await changeOf(g, ref, opts.repo);
  const asOf = change.committedAt?.slice(0, 10) ?? null;
  const known = new Set((await rows<{ p: string }>(g, 'MATCH (f:File) WHERE f.path IN $files RETURN f.path AS p', { files: change.files })).map((r) => r.p));
  change.unknownFiles = change.files.filter((f) => !known.has(f));

  // The decision log as it stood at the commit, when the repo is at hand.
  const sources = (await rows<{ f: string }>(g, 'MATCH (d:Decision) RETURN DISTINCT d.sourceFile AS f')).map((r) => r.f).filter(Boolean);
  const then: Map<string, EntryThen> | null = opts.repo && change.sha ? entriesAt(opts.repo, change.sha, sources) : null;
  const hashNow = new Map((await rows<{ id: string; h: string | null }>(g, 'MATCH (d:Decision) RETURN d.id AS id, d.contentHash AS h')).map((r) => [r.id, r.h]));
  const existed = (d: { id: string; date: string | null }) => then ? then.has(d.id) : (!asOf || !d.date || d.date.slice(0, 10) <= asOf);
  const evidenceOk = (id: string) => !then || then.get(id)?.hash === hashNow.get(id);
  const withThen = <D extends DecisionRef>(d: D) => then?.has(d.id)
    ? { ...d, statusThen: then.get(d.id)!.status, evidence: evidenceOk(d.id) ? 'current' as const : 'omitted: entry edited since this commit' as const }
    : d;
  const recordedHere = new Set(change.sha
    ? (await rows<{ id: string }>(g, 'MATCH (d:Decision)-[:RECORDED_IN]->(:Commit {sha: $sha}) RETURN d.id AS id', { sha: change.sha })).map((r) => r.id)
    : []);

  const items: Omit<ReviewItem, 'id'>[] = [];
  const seen = new Set<string>();
  // What this change itself records — always shown (an entry is often dated the morning after the
  // commit that wrote it).
  for (const d of await rows<{ d: DecisionRef }>(g,
    "MATCH (d:Decision)-[:RECORDED_IN]->(:Commit {sha: $sha}) RETURN d {.id, .title, .date, .status, .source} AS d ORDER BY d.id",
    { sha: change.sha ?? '' })) {
    seen.add(`records|${d.d.id}`);
    const own = evidenceOk(d.d.id) ? (await why(g, d.d.id)).decisions[0] : undefined;
    items.push({ kind: 'records', decision: withThen(d.d), measurements: own?.measurements ?? [], experiments: own?.experiments ?? [] });
  }
  // Settled as of the change: with the log at the commit, by the entry's own status then, or by a
  // superseder that existed then; by date otherwise.
  const replacedBy = async (id: string) => (await rows<{ id: string; title: string; date: string | null }>(g,
    'MATCH (n:Decision)-[:SUPERSEDES|REVISES|DISPROVES]->(:Decision {id: $id}) RETURN n.id AS id, n.title AS title, n.date AS date ORDER BY n.id', { id }));
  const SETTLED = ['superseded', 'failed'];

  for (const file of change.files.filter((f) => known.has(f))) {
    const b = await whatBreaks(g, file);
    const all = [...b.recheck, ...b.history].filter(existed);
    const standing: typeof all = [];
    const settled: Array<{ d: (typeof all)[number]; by: Array<{ id: string; title: string }> }> = [];
    for (const d of all) {
      const by = (await replacedBy(d.id)).filter(existed).map(({ id, title }) => ({ id, title }));
      const statusThen = then?.get(d.id)?.status ?? d.status;
      const settledThen = then ? (SETTLED.includes(statusThen) || by.length > 0) : (SETTLED.includes(d.status) && (by.length > 0 || d.status !== 'superseded' || (await replacedBy(d.id)).length === 0));
      if (settledThen) settled.push({ d, by }); else standing.push(d);
    }
    for (const d of standing) {
      if (recordedHere.has(d.id) || seen.has(`recheck|${d.id}`)) continue;   // one item per decision, under the first file that reached it
      seen.add(`recheck|${d.id}`);
      const { measurements, experiments: _e, ...decision } = d;
      items.push({ kind: 'recheck', file, decision: withThen(decision), measurements: evidenceOk(d.id) ? measurements : [] });
    }
    // A disproven experiment is a live "do not retry" only while its decision stands. Once that
    // decision is superseded, the experiment is history: it goes under the superseded item, not as a
    // warning that may contradict what replaced it.
    const settledIds = new Set(settled.map((x) => x.d.id));
    const dis = await disproven(g, file);
    const triedBy = new Map<string, Tried[]>();
    for (const e of dis.experiments.filter((x) => existed(x.decision) && evidenceOk(x.decision.id) && !recordedHere.has(x.decision.id))) {
      const { decision, ...experiment } = e;
      if (settledIds.has(decision.id)) { triedBy.set(decision.id, [...(triedBy.get(decision.id) ?? []), experiment]); continue; }
      if (seen.has(`disproven|${e.id}`)) continue;
      seen.add(`disproven|${e.id}`);
      items.push({ kind: 'disproven', file, decision: withThen(decision), experiment });
    }
    // Confirmed experiments of standing decisions, beside the disproven ones: the extractor may phrase one
    // fact either way round ("X leaks" confirmed, "X does not leak" disproven), so a lesson must not depend
    // on which list it landed in.
    for (const d of standing.filter((x) => !recordedHere.has(x.id) && evidenceOk(x.id))) {
      for (const e of d.experiments.filter((x) => x.verdict === 'confirmed')) {
        if (seen.has(`tested|${e.id}`)) continue;
        seen.add(`tested|${e.id}`);
        const { measurements: _m, experiments: _x, ...decision } = d;
        items.push({ kind: 'tested', file, decision: withThen(decision), experiment: e });
      }
    }
    for (const { d, by } of settled.filter((x) => !recordedHere.has(x.d.id))) {
      if (seen.has(`superseded|${d.id}`)) continue;
      seen.add(`superseded|${d.id}`);
      const { measurements: _m, experiments: _x, ...decision } = d;
      items.push({ kind: 'superseded', file, decision: withThen(decision), supersededBy: by, triedThen: triedBy.get(d.id) ?? [] });
    }
  }

  // Reviewers: humans with the most commits on the changed files before the change, excluding its authors.
  // "Before" is the change's own history (its ancestors) when the repo is at hand; by committer
  // timestamp otherwise — an approximation, since a branch's commits can be older than what it merges.
  const history = opts.repo && change.sha ? [...ancestors(opts.repo, change.sha)].filter((s) => s !== change.sha) : null;
  const people = await rows<{ name: string; commits: number; files: string[] }>(g,
    `MATCH (p:Person {kind: 'human'})-[:AUTHORED]->(c:Commit)-[:TOUCHED]->(f:File)
     WHERE f.path IN $files AND NOT p.name IN $authors
       AND (CASE WHEN $history IS NULL THEN ($at IS NULL OR coalesce(c.committedAt, c.date) <= $at) ELSE c.sha IN $history END)
     WITH p, count(DISTINCT c) AS commits, collect(DISTINCT f.path) AS files
     RETURN p.name AS name, commits, files ORDER BY commits DESC, name LIMIT $n`,
    { files: change.files, authors: change.authors, at: change.committedAt, history, n: opts.reviewers ?? 3 });
  for (const p of people) items.push({ kind: 'reviewer', reviewer: { ...p, files: p.files.sort() } });

  // Fixed order, then ids: the same change on the same graph always yields the same ids.
  const order = ['records', 'recheck', 'disproven', 'tested', 'superseded', 'reviewer'];
  const prefix: Record<string, string> = { records: 'C', recheck: 'R', disproven: 'D', tested: 'T', superseded: 'S', reviewer: 'P' };
  const counters: Record<string, number> = {};
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) =>
    order.indexOf(a.it.kind) - order.indexOf(b.it.kind) || a.i - b.i).map(({ it }) => it);
  const editedSince = then ? [...then.keys()].filter((id) => hashNow.has(id) && then.get(id)!.hash !== hashNow.get(id)).length : null;
  return {
    change, asOf,
    basis: { method: then ? 'log-at-commit' : 'by-date', entriesThen: then?.size ?? null, editedSince, fingerprint: await fingerprint(g) },
    items: sorted.map((it) => ({ id: `${prefix[it.kind]}${(counters[it.kind] = (counters[it.kind] ?? 0) + 1)}`, ...it })),
  };
}

/** The packet as Markdown — what the CLI prints and what a write-up is grounded in. The JSON packet
 *  keeps every measurement; the note shows the first few of each decision's, and says how many more. */
export function renderPacket(p: ReviewPacket, perDecision = 3): string {
  const few = <T>(list: T[] | undefined, show: (x: T) => string) => !list?.length ? ''
    : list.slice(0, perDecision).map(show).join('; ') + (list.length > perDecision ? `; +${list.length - perDecision} more` : '');
  const c = p.change;
  const out = [`# Review packet — ${c.sha ? c.sha.slice(0, 7) : c.ref}`,
    c.message ? `> ${c.message.slice(0, 200)}` : '',
    `${c.files.length} files changed${c.authors.length ? ` · by ${c.authors.join(', ')}` : ''}${p.asOf ? ` · as of ${p.asOf}` : ''}` +
      (c.unknownFiles.length ? ` · ${c.unknownFiles.length} not in the graph yet` : ''),
    p.basis.method === 'log-at-commit'
      ? `_Decision log rebuilt as it stood at this commit (${p.basis.entriesThen} entries${p.basis.editedSince ? `; ${p.basis.editedSince} edited since — their extracted evidence omitted` : ''}) · graph ${p.basis.fingerprint}_`
      : `_Approximate: decisions filtered by date, not rebuilt from the log at this commit (pass --repo to rebuild) · graph ${p.basis.fingerprint}_`, ''];
  // Under "superseded", an entry whose own text still says active was superseded by a later entry:
  // say so rather than print "active" under a superseded heading.
  const dec = (d: DecisionRef & { statusThen?: string; evidence?: string }, replaced = false) =>
    `**${d.title}** (${d.date ?? 'undated'}, ${replaced && d.status !== 'superseded' ? `superseded by a later entry; its own text says ${d.status}` : d.statusThen && d.statusThen !== d.status ? `${d.statusThen} then, ${d.status} now` : d.status}) — \`${d.source}\`` +
    (d.evidence && d.evidence !== 'current' ? ` — _${d.evidence}_` : '');
  const section = (kind: ReviewItem['kind'], title: string, line: (i: ReviewItem) => string) => {
    const list = p.items.filter((i) => i.kind === kind);
    if (list.length) out.push(`## ${title}`, ...list.map((i) => `- **${i.id}** ${line(i)}`), '');
  };
  section('records', 'Decisions this change records', (i) => dec(i.decision!) +
    (i.measurements?.length ? `\n  measured: ${few(i.measurements, (m) => `${m.metric} ${m.value}`)}` : '') +
    (i.experiments?.length ? `\n  tried: ${few(i.experiments, (e) => `"${e.hypothesis}" (${e.verdict})`)}` : ''));
  section('recheck', 'Standing decisions that rest on these files — re-check', (i) =>
    `\`${i.file}\` → ${dec(i.decision!)}${i.measurements?.length ? `; measured: ${few(i.measurements, (m) => `${m.metric} ${m.value}`)}` : ''}`);
  section('disproven', 'Tried before and disproven — do not retry', (i) =>
    `\`${i.file}\` → "${i.experiment!.hypothesis}" — ${dec(i.decision!)}`);
  section('tested', 'Tested here and confirmed — read with its decision', (i) =>
    `\`${i.file}\` → "${i.experiment!.hypothesis}" — ${dec(i.decision!)}`);
  section('superseded', 'Superseded reasoning — do not cite', (i) =>
    `\`${i.file}\` → ${dec(i.decision!, (i.supersededBy?.length ?? 0) > 0)}${i.supersededBy?.length ? `; replaced by ${i.supersededBy.map((s) => s.title).join(', ')}` : ''}` +
    (i.triedThen?.length ? `\n  it had found disproven (history, not a current warning): ${few(i.triedThen, (e) => `"${e.hypothesis}"`)}` : ''));
  section('reviewer', 'Who knows these files', (i) =>
    `${i.reviewer!.name} — ${i.reviewer!.commits} commits on ${i.reviewer!.files.join(', ')}`);
  if (p.items.length === 0) out.push('_The graph holds no decisions about these files._');
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

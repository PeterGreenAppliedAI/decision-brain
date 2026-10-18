/**
 * sync: bring a repo's brain up to date with the repo, doing only the work that changed.
 *
 *  1. ingest (convergent): new commits, new/edited/removed decisions; an edited entry loses its
 *     published evidence in the same pass.
 *  2. decisions board: seeding re-queues exactly the entries whose text changed (content hash) and
 *     adds new ones; workers run only if something is queued; integration only if something changed.
 *  3. file summaries (if the repo has a summary board): a file is re-summarized only if its git blob
 *     changed or it is new; its directories up to the root follow; removed files and empty
 *     directories go; everything else — and its summary — is untouched. A re-queued section loses
 *     its old summary at once, so a failed re-summary leaves none rather than a stale one.
 *
 * A second sync with nothing changed in the repo does no model work and changes nothing.
 */
import { execFileSync } from 'node:child_process';
import { boardName, counts, ensureBoardSchema, event, registerAgent, seedBoard, workerNames } from '../board/board.js';
import { integrate } from '../board/integrate.js';
import { config } from '../config.js';
import { connect, type Graph } from '../graph/db.js';
import { integrateSummaries } from '../files/integrate.js';
import { dirId, fileId, planTasks, sourceFiles } from '../files/scan.js';
import { runSummaryWorker } from '../files/worker.js';
import { ingestRepo, type IngestReport } from '../ingest/repo.js';
import { embedDecisions } from '../graph/embeddings.js';
import { createEmbedder } from '../llm/embed.js';
import type { JsonClient } from '../llm/openai.js';
import type { IndexEntry } from '../team/extract.js';
import { runWorker } from '../team/worker.js';

export interface SyncReport {
  ingest: { commits: number; decisions: number | null };
  decisions: { changed: string[]; removed: number; extracted: number; integrated: boolean } | null;
  files: { changed: string[]; added: string[]; removed: string[]; dirsRedone: string[]; summarized: number; integrated: boolean } | null;
  modelCalls: number;
}

type Db = Awaited<ReturnType<typeof connect>>;
const rows = async <T>(g: Graph, cypher: string, params: Record<string, unknown> = {}) =>
  (await g.query<T>(cypher, { params: params as never })).data ?? [];

/** path → blob sha for every file in a commit's tree. */
export function blobsAt(repo: string, rev: string): Map<string, string> {
  const out = execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', 'ls-tree', '-r', rev], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const m = new Map<string, string>();
  for (const line of out.split('\n')) { const r = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line); if (r) m.set(r[2], r[1]); }
  return m;
}

const ancestorsOf = (path: string) => {
  const out: string[] = [];
  for (let p = path; p.includes('/'); ) { p = p.slice(0, p.lastIndexOf('/')); out.push(dirId(p)); }
  out.push(dirId(''));
  return out;
};

/** Bring the summary board in line with the repo at HEAD; returns what must be redone. */
export async function refreshFileBoard(board: Graph, repo: string) {
  const { sha, files } = sourceFiles(repo);
  const head = blobsAt(repo, sha);
  const sections = await rows<{ id: string; kind: string; path: string; blob: string | null; sha: string | null; status: string }>(board,
    'MATCH (s:Section) RETURN s.id AS id, s.kind AS kind, s.path AS path, s.blob AS blob, s.sha AS sha, s.status AS status');
  // Boards made before blobs were recorded: take each file's blob at the commit it was summarized at.
  const atCommit = new Map<string, Map<string, string>>();
  const blobOf = (s: { path: string; blob: string | null; sha: string | null }) => {
    if (s.blob) return s.blob;
    if (!s.sha) return null;
    if (!atCommit.has(s.sha)) atCommit.set(s.sha, blobsAt(repo, s.sha));
    return atCommit.get(s.sha)!.get(s.path) ?? null;
  };
  const fileSections = new Map(sections.filter((s) => s.kind === 'file').map((s) => [s.path, s]));
  const current = new Set(files);
  const changed = files.filter((f) => fileSections.has(f) && blobOf(fileSections.get(f)!) !== head.get(f));
  const added = files.filter((f) => !fileSections.has(f));
  const removed = [...fileSections.keys()].filter((f) => !current.has(f));
  const plan = planTasks(files);
  const planDirs = new Set(plan.filter((t) => t.kind === 'dir').map((t) => t.id));
  const affected = new Set([...changed, ...added, ...removed].flatMap(ancestorsOf).filter((d) => planDirs.has(d)));
  const goneDirs = sections.filter((s) => s.kind === 'dir' && !planDirs.has(s.id)).map((s) => s.id);

  await ensureBoardSchema(board);
  // Removed files and emptied directories go, with their findings.
  const goneIds = [...removed.map(fileId), ...goneDirs];
  if (goneIds.length) await board.query('MATCH (s:Section) WHERE s.id IN $ids OPTIONAL MATCH (f:Finding)-[:ABOUT]->(s) DETACH DELETE s, f', { params: { ids: goneIds } });
  // Changed files and affected directories: old summaries go now; back to pending.
  const redo = [...changed.map(fileId), ...affected];
  if (redo.length) {
    await board.query('MATCH (f:Finding)-[:ABOUT]->(s:Section) WHERE s.id IN $ids DETACH DELETE f', { params: { ids: redo } });
    await board.query(`MATCH (s:Section) WHERE s.id IN $ids SET s.status = 'pending', s.attempts = 0, s.claimedBy = null, s.expiresAt = null
                       WITH s OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(s) DELETE c`, { params: { ids: redo } });
  }
  // Every task in the plan exists, carries the blob it describes, and has its PART_OF edge.
  await board.query(
    `UNWIND $rows AS r
     MERGE (s:Section {id: r.id})
     ON CREATE SET s.status = 'pending', s.attempts = 0
     SET s.kind = r.kind, s.path = r.path, s.title = r.path, s.order = r.order, s.depth = r.depth, s.blob = r.blob,
         s.sha = CASE WHEN s.status = 'done' THEN s.sha ELSE $sha END`,
    { params: { rows: plan.map((t) => ({ ...t, blob: t.kind === 'file' ? head.get(t.path) ?? null : null })) as never, sha } });
  await board.query('UNWIND $rows AS r MATCH (c:Section {id: r.id}), (p:Section {id: r.parent}) MERGE (c)-[:PART_OF]->(p)',
    { params: { rows: plan.filter((t) => t.parent) as never } });
  // A directory waits for its parts that are not done.
  await board.query(`MATCH (d:Section {kind: 'dir'}) OPTIONAL MATCH (c:Section)-[:PART_OF]->(d) WHERE c.status <> 'done'
                     WITH d, count(c) AS w SET d.waiting = w`);
  const work = changed.length + added.length + removed.length;
  if (work) await event(board, 'sync', null, null, `${changed.length} changed, ${added.length} new, ${removed.length} removed files; ${affected.size} directories to redo`);
  return { sha, changed, added, removed, dirsRedone: [...affected].sort() };
}

/**
 * Files whose summary the code check rejected (finished, nothing verified) go back to pending with
 * their directories up to the root, so the next run re-summarizes them and rebuilds what contains
 * them. Returns the files re-queued.
 */
export async function requeueRejected(board: Graph): Promise<string[]> {
  const files = (await rows<{ id: string; path: string }>(board,
    `MATCH (s:Section {kind: 'file', status: 'done'}) OPTIONAL MATCH (f:Finding)-[:ABOUT]->(s)
     WITH s, sum(CASE WHEN f.verified THEN 1 ELSE 0 END) AS ok, count(f) AS n WHERE n > 0 AND ok = 0
     RETURN s.id AS id, s.path AS path ORDER BY id`));
  if (!files.length) return [];
  const redo = [...new Set([...files.map((f) => f.id), ...files.flatMap((f) => ancestorsOf(f.path))])];
  await board.query('MATCH (f:Finding)-[:ABOUT]->(s:Section) WHERE s.id IN $ids DETACH DELETE f', { params: { ids: redo } });
  await board.query(`MATCH (s:Section) WHERE s.id IN $ids SET s.status = 'pending', s.attempts = 0, s.claimedBy = null, s.expiresAt = null
                     WITH s OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(s) DELETE c`, { params: { ids: redo } });
  await board.query(`MATCH (d:Section {kind: 'dir'}) OPTIONAL MATCH (c:Section)-[:PART_OF]->(d) WHERE c.status <> 'done'
                     WITH d, count(c) AS w SET d.waiting = w`);
  await event(board, 'retry', null, null, `${files.length} rejected file summaries re-queued with their directories`);
  return files.map((f) => f.path);
}

export async function sync(db: Db, graphName: string, repo: string, opts: { llm: JsonClient; workers?: number; log?: (l: string) => void }): Promise<SyncReport> {
  const log = opts.log ?? (() => {});
  const workers = opts.workers ?? 4;
  let modelCalls = 0;
  const llm: JsonClient = { ...opts.llm, json: (req) => { modelCalls++; return opts.llm.json(req); } };
  const graphs = await db.list();
  const brain = db.selectGraph(graphName);

  const ing: IngestReport = await ingestRepo(brain, repo);
  // Search by meaning: embed what changed (no-op when embeddings are not configured or not up).
  const embedder = createEmbedder();
  if (embedder) {
    try { const e = await embedDecisions(brain, embedder, log); if (e.embedded) log(`embedded ${e.embedded} decision(s)`); }
    catch (err) { log(`embeddings skipped: ${(err as Error).message}`); }
  }
  const report: SyncReport = { ingest: { commits: ing.commits, decisions: (ing.decisions ?? 0) + (ing.adrs?.count ?? 0) || null }, decisions: null, files: null, modelCalls: 0 };

  // Decisions: only queued work runs.
  if (graphs.includes(boardName(graphName))) {
    const board = db.selectGraph(boardName(graphName));
    const seed = await seedBoard(board, brain);
    const c = await counts(board);
    let extracted = 0;
    if (c.pending + c.handoffsOpen > 0) {
      const index = (await brain.roQuery<IndexEntry>('MATCH (d:Decision) RETURN d.id AS id, d.date AS date, d.title AS title ORDER BY d.id')).data ?? [];
      const names = workerNames(llm.model, workers);
      const stats = await Promise.all(names.map(async (name) => {
        await registerAgent(board, name, llm.model);
        return runWorker({ name, board, brain, llm, index, ttlMs: config.claimTtlMs, maxAttempts: config.maxAttempts, idlePollMs: config.idlePollMs, log });
      }));
      extracted = stats.reduce((n, s) => n + s.sections, 0);
    }
    const integrated = extracted > 0 || seed.changed.length > 0 || seed.removed > 0;
    if (integrated) await integrate(board, brain);
    report.decisions = { changed: seed.changed, removed: seed.removed, extracted, integrated };
  }

  // File summaries: only changed files and their directories.
  if (graphs.includes(`${graphName}__files`)) {
    const board = db.selectGraph(`${graphName}__files`);
    const r = await refreshFileBoard(board, repo);
    let summarized = 0;
    if ((await counts(board)).pending > 0) {
      const names = workerNames(llm.model, workers);
      const stats = await Promise.all(names.map(async (name) => {
        await registerAgent(board, name, llm.model);
        return runSummaryWorker({ name, board, llm, repo, sha: r.sha, ttlMs: config.claimTtlMs, maxAttempts: config.maxAttempts, idlePollMs: config.idlePollMs, log });
      }));
      summarized = stats.reduce((n, s) => n + s.done, 0);
    }
    const integrated = summarized > 0 || r.removed.length > 0;
    if (integrated) await integrateSummaries(board, brain);
    report.files = { changed: r.changed, added: r.added, removed: r.removed, dirsRedone: r.dirsRedone, summarized, integrated };
  }
  report.modelCalls = modelCalls;
  return report;
}

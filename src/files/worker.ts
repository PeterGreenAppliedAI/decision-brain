/**
 * Summary workers: the same board protocol as the extraction team — claim, heartbeat, finish only
 * if the claim still holds — over file and directory tasks. A directory task is only offered once
 * every part of it is done (board dependencies), and is written from its parts' summaries.
 */
import { claimSection, completeSection, counts, ensureBoardSchema, event, heartbeat, leave, othersAlive, release, sweepExhausted, touchAgent } from '../board/board.js';
import type { Graph } from '../graph/db.js';
import type { JsonClient } from '../llm/openai.js';
import { readAt, type FileTask } from './scan.js';
import { checkDir, checkFile, DIR_SCHEMA, DIR_SYSTEM, FILE_SCHEMA, FILE_SYSTEM, type DirSummary, type FileSummary } from './summarize.js';

export async function seedFileBoard(board: Graph, tasks: FileTask[], sha: string): Promise<void> {
  await ensureBoardSchema(board);
  await board.query(
    `UNWIND $rows AS r
     MERGE (s:Section {id: r.id})
     ON CREATE SET s.status = 'pending', s.attempts = 0
     SET s.kind = r.kind, s.path = r.path, s.title = r.path, s.order = r.order, s.depth = r.depth, s.waiting = r.waiting, s.sha = $sha`,
    { params: { rows: tasks as never, sha } });
  await board.query(
    `UNWIND $rows AS r MATCH (c:Section {id: r.id}), (p:Section {id: r.parent}) MERGE (c)-[:PART_OF]->(p)`,
    { params: { rows: tasks.filter((t) => t.parent) as never } });
  await event(board, 'seed', null, null, `${tasks.filter((t) => t.kind === 'file').length} files, ${tasks.filter((t) => t.kind === 'dir').length} directories at ${sha.slice(0, 7)}`);
}

export interface SummaryWorkerOptions {
  name: string; board: Graph; llm: JsonClient; repo: string; sha: string;
  ttlMs: number; maxAttempts: number; idlePollMs: number; log?: (line: string) => void; signal?: AbortSignal;
}

async function partsOf(board: Graph, id: string) {
  const res = await board.roQuery<{ path: string; kind: string; data: string | null }>(
    `MATCH (c:Section)-[:PART_OF]->(:Section {id: $id})
     OPTIONAL MATCH (f:Finding {kind: 'summary'})-[:ABOUT]->(c)
     RETURN c.path AS path, c.kind AS kind, f.data AS data ORDER BY c.kind DESC, c.path`, { params: { id } });
  return (res.data ?? []).map((r) => ({ name: r.path.split('/').pop() || r.path, kind: r.kind,
    purpose: r.data ? (JSON.parse(r.data) as { purpose?: string }).purpose ?? '' : '(not summarized)' }));
}

export async function runSummaryWorker(o: SummaryWorkerOptions): Promise<{ done: number; errors: number; lost: number }> {
  const stats = { done: 0, errors: 0, lost: 0 };
  const log = o.log ?? (() => {});
  while (!o.signal?.aborted) {
    await sweepExhausted(o.board, o.maxAttempts);
    const claim = await claimSection(o.board, o.name, o.ttlMs, o.maxAttempts);
    if (!claim) {
      const c = await counts(o.board);
      if (c.pending === 0 && c.claimed === 0) break;
      if (c.claimed === 0 && await othersAlive(o.board, o.name, o.ttlMs) === 0 && c.pending > 0) {
        // pending but blocked, with nobody working: only possible if a dependency count is wrong
        log(`${o.name}: ${c.pending} task(s) blocked with nothing in flight — stopping`);
        break;
      }
      await touchAgent(o.board, o.name);
      await new Promise((r) => setTimeout(r, o.idlePollMs));
      continue;
    }
    const kind = claim.id.startsWith('file:') ? 'file' : 'dir';
    const path = claim.id.slice(kind === 'file' ? 5 : 4);
    const beat = setInterval(() => { void heartbeat(o.board, o.name, 'Section', claim.id, o.ttlMs).catch(() => {}); }, Math.max(1000, o.ttlMs / 3));
    try {
      let finding;
      if (kind === 'file') {
        const { text, cut } = readAt(o.repo, o.sha, path);
        const r = await o.llm.json<FileSummary>({ system: FILE_SYSTEM, user: `File: ${path}${cut ? ' (long — middle omitted)' : ''}\n\n${text}`, schema: FILE_SCHEMA, schemaName: 'file_summary', maxTokens: 2048 });
        const c = checkFile(r.value, text);
        const ok = c.value.purpose.length > 0 && (c.checked === 0 || c.verified / c.checked >= 0.5);
        finding = { kind: 'summary' as const, data: { ...c.value, sha: o.sha, cut, verified: c.verified, checked: c.checked, dropped: c.dropped }, quote: null, verified: ok,
          reason: ok ? null : `only ${c.verified}/${c.checked} names found in the file` };
        log(`${o.name}: ${path} → ${c.verified}/${c.checked} names verified (${r.ms} ms)`);
      } else {
        const parts = await partsOf(o.board, claim.id);
        const listing = parts.map((p) => `- ${p.name}${p.kind === 'dir' ? '/' : ''}: ${p.purpose}`).join('\n');
        const r = await o.llm.json<DirSummary>({ system: DIR_SYSTEM, user: `Directory: ${path === '.' ? '(repository root)' : path}\n\nIts parts:\n${listing}`, schema: DIR_SCHEMA, schemaName: 'dir_summary', maxTokens: 2048 });
        const c = checkDir(r.value, parts.map((p) => p.name));
        finding = { kind: 'summary' as const, data: { ...c.value, sha: o.sha, dropped: c.dropped }, quote: null, verified: c.value.purpose.length > 0, reason: null };
        log(`${o.name}: ${path}/ → ${parts.length} parts (${r.ms} ms)`);
      }
      if (await completeSection(o.board, o.name, claim.id, [finding], kind)) stats.done++; else stats.lost++;
    } catch (err) {
      stats.errors++;
      await release(o.board, o.name, 'Section', claim.id, String(err), o.maxAttempts);
      log(`${o.name}: ${path} failed: ${String(err).slice(0, 160)}`);
    } finally {
      clearInterval(beat);
    }
  }
  await leave(o.board, o.name, `${stats.done} summaries, ${stats.errors} errors, ${stats.lost} lost`);
  return stats;
}

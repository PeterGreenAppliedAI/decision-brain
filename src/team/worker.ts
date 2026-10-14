/**
 * One extraction worker. Its only channel to the rest of the team is the board: it claims a
 * handoff (a colleague's claim to check) before new sections, keeps its claim alive while the model
 * thinks, and posts findings only if it still holds the claim when it finishes.
 */
import {
  claimHandoff, claimSection, completeSection, counts, heartbeat, leave, othersAlive, release, resolveHandoff,
  sweepExhausted, touchAgent,
} from '../board/board.js';
import type { Graph } from '../graph/db.js';
import type { JsonClient } from '../llm/openai.js';
import {
  EXTRACTION_SCHEMA, HANDOFF_SCHEMA, extractionSystem, extractionUser, handoffSystem, handoffUser,
  verifyExtraction, verifyHandoff, type Extraction, type HandoffVerdict, type IndexEntry,
} from './extract.js';

export interface WorkerOptions {
  name: string;
  board: Graph;
  brain: Graph;
  llm: JsonClient;
  index: IndexEntry[];
  ttlMs: number;
  maxAttempts: number;
  idlePollMs: number;
  /** Demo/testing: stop after this many claims WITHOUT finishing or releasing — a simulated crash. */
  crashAfterClaims?: number;
  signal?: AbortSignal;
  log?: (line: string) => void;
}

export interface WorkerStats { sections: number; handoffs: number; lost: number; errors: number }

async function readDecision(brain: Graph, id: string) {
  // The hash comes from the same read as the text, so a finding is stamped with exactly what it was extracted from.
  const res = await brain.roQuery<{ id: string; title: string; body: string; hash: string | null }>(
    'MATCH (d:Decision {id: $id}) RETURN d.id AS id, d.title AS title, d.body AS body, d.contentHash AS hash', { params: { id } });
  return res.data?.[0] ?? null;
}

/** Keep a claim alive while `work` runs; report whether it was still ours at the end. */
async function withHeartbeat<T>(o: WorkerOptions, label: 'Section' | 'Handoff', key: string, work: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => { void heartbeat(o.board, o.name, label, key, o.ttlMs).catch(() => {}); }, Math.max(1000, o.ttlMs / 3));
  try { return await work(); } finally { clearInterval(timer); }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((r) => {
  const t = setTimeout(r, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
});

export async function runWorker(o: WorkerOptions): Promise<WorkerStats> {
  const stats: WorkerStats = { sections: 0, handoffs: 0, lost: 0, errors: 0 };
  const log = o.log ?? (() => {});
  const system = extractionSystem(o.index);
  const titles = new Map(o.index.map((e) => [e.id, e.title]));
  let claims = 0;

  while (!o.signal?.aborted) {
    await sweepExhausted(o.board, o.maxAttempts);

    // 1. A colleague's handoff first: confirming cross-references is what turns findings into edges.
    const h = await claimHandoff(o.board, o.name, o.ttlMs, o.maxAttempts);
    if (h) {
      if (o.crashAfterClaims !== undefined && ++claims > o.crashAfterClaims) { log(`${o.name}: simulated crash holding handoff ${h.key}`); return stats; }
      try {
        const target = await readDecision(o.brain, h.target);
        if (!target) throw new Error(`target ${h.target} not in the brain graph`);
        const res = await withHeartbeat(o, 'Handoff', h.key, () => o.llm.json<HandoffVerdict>({
          system: handoffSystem(), schema: HANDOFF_SCHEMA, schemaName: 'handoff_verdict',
          user: handoffUser({ relation: h.relation, quote: h.quote, raiser: { id: h.source, title: titles.get(h.source) ?? h.source }, other: target }),
        }));
        const verdict = verifyHandoff(res.value, target.body);
        if (await resolveHandoff(o.board, o.name, h.key, verdict, Date.now(), target.hash)) stats.handoffs++; else stats.lost++;
        log(`${o.name}: handoff ${h.key} → ${verdict.confirmed ? 'confirmed' : 'rejected'} (${res.ms} ms)`);
      } catch (err) {
        stats.errors++;
        await release(o.board, o.name, 'Handoff', h.key, String(err), o.maxAttempts);
        log(`${o.name}: handoff ${h.key} failed: ${String(err).slice(0, 160)}`);
      }
      continue;
    }

    // 2. Otherwise the next section.
    const claim = await claimSection(o.board, o.name, o.ttlMs, o.maxAttempts);
    if (claim) {
      if (o.crashAfterClaims !== undefined && ++claims > o.crashAfterClaims) { log(`${o.name}: simulated crash holding ${claim.id}`); return stats; }
      try {
        const section = await readDecision(o.brain, claim.id);
        if (!section) throw new Error(`section ${claim.id} not in the brain graph`);
        const res = await withHeartbeat(o, 'Section', claim.id, () => o.llm.json<Extraction>({
          system, user: extractionUser(section), schema: EXTRACTION_SCHEMA, schemaName: 'extraction',
        }));
        const findings = verifyExtraction(res.value, section, o.index);
        const note = `${res.ms} ms, ${res.completionTokens} tokens`;
        if (await completeSection(o.board, o.name, claim.id, findings, note, Date.now(), section.hash)) stats.sections++; else stats.lost++;
        log(`${o.name}: ${claim.id} → ${findings.filter((f) => f.verified).length}/${findings.length} verified (${res.ms} ms)`);
      } catch (err) {
        stats.errors++;
        await release(o.board, o.name, 'Section', claim.id, String(err), o.maxAttempts);
        log(`${o.name}: ${claim.id} failed: ${String(err).slice(0, 160)}`);
      }
      continue;
    }

    // 3. Nothing claimable. Finish when nothing is in flight anywhere; otherwise a colleague may
    //    still raise a handoff, or a claim may expire — wait and look again.
    const c = await counts(o.board);
    if (c.pending === 0 && c.claimed === 0 && c.handoffsOpen === 0 && c.handoffsClaimed === 0) break;
    // What is left may be only this worker's own handoffs, which it cannot confirm itself. Wait while
    // a colleague is still around to do it; once none has been seen for a claim's lifetime, stop.
    if (c.pending === 0 && c.claimed === 0 && c.handoffsClaimed === 0 && await othersAlive(o.board, o.name, o.ttlMs) === 0) {
      log(`${o.name}: only my own handoffs remain and no colleague is left to check them — stopping`);
      break;
    }
    await touchAgent(o.board, o.name);
    await sleep(o.idlePollMs, o.signal);
  }
  await leave(o.board, o.name, `${stats.sections} sections, ${stats.handoffs} handoffs, ${stats.lost} lost, ${stats.errors} errors`);
  return stats;
}

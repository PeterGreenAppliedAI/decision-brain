/**
 * npm run team -- --graph <repo-graph> [--workers 4] [--limit N] [--reset] [--crash <worker>] [--no-integrate]
 *
 * Seeds the board from the brain graph's decisions and runs N local workers against it. Each worker
 * is an independent loop with its own identity; they share nothing but the board graph. --crash
 * makes one worker abandon its first claim mid-work (no release), to show expiry and takeover.
 * Runs where the model host is reachable (the lab tmux session on this Mac).
 */
import { parseArgs } from 'node:util';
import { boardName, counts, registerAgent, seedBoard, workerNames } from '../board/board.js';
import { integrate } from '../board/integrate.js';
import { config } from '../config.js';
import { connect, GraphConnectError } from '../graph/db.js';
import { createJsonClient } from '../llm/openai.js';
import type { IndexEntry } from './extract.js';
import { runWorker } from './worker.js';

const { values } = parseArgs({
  options: {
    graph: { type: 'string' }, workers: { type: 'string', default: '4' }, limit: { type: 'string' },
    reset: { type: 'boolean' }, crash: { type: 'string' }, 'no-integrate': { type: 'boolean' },
  },
});
if (!values.graph) {
  console.error('usage: npm run team -- --graph <repo-graph> [--workers 4] [--limit N] [--reset] [--crash <worker>] [--no-integrate]');
  process.exit(2);
}

const db = await connect().catch((err) => {
  if (!(err instanceof GraphConnectError)) throw err;
  console.error(err.message);
  process.exit(1);
});
try {
  const brain = db.selectGraph(values.graph);
  const board = db.selectGraph(boardName(values.graph));
  if (values.reset && (await db.list()).includes(boardName(values.graph))) await board.delete();

  const index = (await brain.roQuery<IndexEntry>('MATCH (d:Decision) RETURN d.id AS id, d.date AS date, d.title AS title ORDER BY CASE WHEN d.date IS NULL THEN 1 ELSE 0 END, d.date DESC')).data ?? [];
  if (!index.length) throw new Error(`no decisions in graph "${values.graph}" — run npm run ingest first`);
  const seed = await seedBoard(board, brain, values.limit ? Number(values.limit) : undefined);
  const seeded = seed.sections;
  if (seed.changed.length) console.log(`[team] ${seed.changed.length} entr${seed.changed.length === 1 ? 'y' : 'ies'} changed since extraction — re-extracting: ${seed.changed.join(', ')}`);
  if (seed.removed) console.log(`[team] removed ${seed.removed} board node(s) for entries that no longer exist`);

  const llm = createJsonClient();
  const names = workerNames(llm.model, Number(values.workers));
  console.log(`[team] ${names.length} workers on ${llm.model}, ${seeded} sections, board ${boardName(values.graph)}`);
  const started = Date.now();
  const stats = await Promise.all(names.map(async (name) => {
    await registerAgent(board, name, llm.model);
    return runWorker({
      name, board, brain, llm, index,
      ttlMs: config.claimTtlMs, maxAttempts: config.maxAttempts, idlePollMs: config.idlePollMs,
      crashAfterClaims: values.crash === name ? 0 : undefined,
      log: (line) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`),
    });
  }));
  console.log(`[team] finished in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  names.forEach((n, i) => console.log(`  ${n}: ${JSON.stringify(stats[i])}`));
  console.log(`  board: ${JSON.stringify(await counts(board))}`);

  if (!values['no-integrate']) console.log(`[integrate] ${JSON.stringify(await integrate(board, brain))}`);
} finally {
  await db.close();
}

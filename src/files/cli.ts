/**
 * npm run summarize -- --graph <repo-graph> --repo <path> [--workers 4] [--limit N] [--reset] [--no-integrate]
 *
 * File and directory summaries by a team of local workers on the board `<repo-graph>__files`:
 * every source file at HEAD, then each directory once all its parts are done, then the repo.
 * --limit keeps only the first N files (and their directories) — for trying it out.
 * Runs where the model host is reachable (the lab tmux session on this Mac).
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { counts, registerAgent } from '../board/board.js';
import { config } from '../config.js';
import { connect, GraphConnectError } from '../graph/db.js';
import { createJsonClient } from '../llm/openai.js';
import { integrateSummaries } from './integrate.js';
import { planTasks, sourceFiles } from './scan.js';
import { blobsAt } from '../sync/sync.js';
import { runSummaryWorker, seedFileBoard } from './worker.js';

const { values } = parseArgs({ options: {
  graph: { type: 'string' }, repo: { type: 'string' }, workers: { type: 'string', default: '4' }, limit: { type: 'string' },
  reset: { type: 'boolean' }, 'no-integrate': { type: 'boolean' },
} });
if (!values.graph || !values.repo) {
  console.error('usage: npm run summarize -- --graph <repo-graph> --repo <path> [--workers 4] [--limit N] [--reset] [--no-integrate]');
  process.exit(2);
}
const db = await connect().catch((err) => {
  if (!(err instanceof GraphConnectError)) throw err;
  console.error(err.message);
  process.exit(1);
});
try {
  const repo = resolve(values.repo);
  const boardName = `${values.graph}__files`;
  const board = db.selectGraph(boardName);
  if (values.reset && (await db.list()).includes(boardName)) await board.delete();
  const { sha, files } = sourceFiles(repo);
  const chosen = values.limit ? files.slice(0, Number(values.limit)) : files;
  const tasks = planTasks(chosen);
  await seedFileBoard(board, tasks, sha, blobsAt(repo, sha));
  const llm = createJsonClient();
  const names = Array.from({ length: Number(values.workers) }, (_, i) => `glm-${i + 1}`);
  console.log(`[summarize] ${chosen.length} files, ${tasks.length - chosen.length} directories at ${sha.slice(0, 7)} · ${names.length} workers · board ${boardName}`);
  const t0 = Date.now();
  const stats = await Promise.all(names.map(async (name) => {
    await registerAgent(board, name, llm.model);
    return runSummaryWorker({ name, board, llm, repo, sha, ttlMs: config.claimTtlMs, maxAttempts: config.maxAttempts, idlePollMs: config.idlePollMs,
      log: (line) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`) });
  }));
  console.log(`[summarize] finished in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  names.forEach((n, i) => console.log(`  ${n}: ${JSON.stringify(stats[i])}`));
  console.log(`  board: ${JSON.stringify(await counts(board))}`);
  if (!values['no-integrate']) console.log(`[integrate] ${JSON.stringify(await integrateSummaries(board, db.selectGraph(values.graph)))}`);
} finally {
  await db.close();
}

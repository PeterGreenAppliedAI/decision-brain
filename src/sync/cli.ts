/**
 * npm run sync -- --graph <repo-graph> --repo <path> [--workers 4]
 *
 * Brings the brain up to date with the repo, doing only the work that changed (see sync.ts). Run it
 * after pulling; run it again and it does nothing. Needs the model host only when there is work.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { connect, GraphConnectError } from '../graph/db.js';
import { createJsonClient } from '../llm/openai.js';
import { sync } from './sync.js';

const { values } = parseArgs({ options: { graph: { type: 'string' }, repo: { type: 'string' }, workers: { type: 'string', default: '4' } } });
if (!values.graph || !values.repo) { console.error('usage: npm run sync -- --graph <repo-graph> --repo <path> [--workers 4]'); process.exit(2); }
const db = await connect().catch((err) => { if (!(err instanceof GraphConnectError)) throw err; console.error(err.message); process.exit(1); });
try {
  const t0 = Date.now();
  const r = await sync(db, values.graph, resolve(values.repo), { llm: createJsonClient(), workers: Number(values.workers),
    log: (l) => console.log(`  ${l}`) });
  const d = r.decisions, f = r.files;
  console.log(`[sync ${values.graph}] ${r.ingest.commits} commits, ${r.ingest.decisions ?? 0} decisions ingested`);
  console.log(d ? `  decisions: ${d.changed.length} changed, ${d.removed} removed, ${d.extracted} re-extracted${d.integrated ? ', integrated' : ''}` : '  decisions: no extraction board (run npm run team once)');
  console.log(f ? `  files: ${f.changed.length} changed, ${f.added.length} new, ${f.removed.length} removed → ${f.summarized} re-summarized (${f.dirsRedone.length} directories)${f.integrated ? ', integrated' : ''}` : '  files: no summary board (run npm run summarize once)');
  console.log(`  model calls: ${r.modelCalls} · ${((Date.now() - t0) / 1000).toFixed(1)} s${r.modelCalls === 0 ? ' — already up to date' : ''}`);
} finally {
  await db.close();
}

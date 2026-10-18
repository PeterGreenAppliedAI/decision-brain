/**
 * npm run what-breaks -- --graph <name> <file> [--repo <path>] [--json] [--quiet]
 *
 * Before changing a file: the standing decisions that rest on it, what they measured, and what was
 * tried there with its verdict (confirmed or disproven) — plus settled history, marked as such. No model; one graph query.
 * <file> may be absolute (made relative to --repo) or repo-relative. --quiet prints nothing when there
 * is nothing to say (for hooks); --json prints the raw result.
 */
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { connect, GraphConnectError } from '../graph/db.js';
import { whatBreaks } from './graph-tools.js';
import { repoFor } from './review.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  graph: { type: 'string' }, repo: { type: 'string' }, json: { type: 'boolean' }, quiet: { type: 'boolean' },
} });
if (!values.graph || !positionals[0]) {
  console.error('usage: npm run what-breaks -- --graph <name> <file> [--repo <path>] [--json] [--quiet]');
  process.exit(2);
}
const repo = repoFor(values.graph, values.repo);
const file = positionals[0].startsWith('/') && repo ? relative(resolve(repo), positionals[0]) : positionals[0];
if (file.startsWith('..')) process.exit(0);            // outside the repository: nothing to say

const db = await connect().catch((err) => {
  if (!(err instanceof GraphConnectError)) throw err;
  if (!values.quiet) console.error(err.message);
  process.exit(values.quiet ? 0 : 1);
});
try {
  const r = await whatBreaks(db.selectGraph(values.graph), file);
  if (values.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  // Every tried experiment, with its verdict: the extractor may phrase one fact either way round ("X leaks"
  // confirmed, or "X does not leak" disproven), so listing only the disproven ones would drop half the lessons.
  const ORDER = { disproven: 0, confirmed: 1, inconclusive: 2 } as Record<string, number>;
  const tried = r.recheck.flatMap((d) => d.experiments.map((e) => ({ e, d }))).sort((a, b) => (ORDER[a.e.verdict] ?? 3) - (ORDER[b.e.verdict] ?? 3));
  if (!r.recheck.length && !r.history.length) { if (!values.quiet) console.log(`No recorded decisions rest on ${file}.`); process.exit(0); }
  if (values.quiet && !r.recheck.length) process.exit(0);   // only settled history: not worth interrupting for
  const out: string[] = [`Decision Brain: ${file} rests on ${r.recheck.length} standing decision${r.recheck.length === 1 ? '' : 's'}.`];
  for (const d of r.recheck) {
    out.push(`- ${d.title} (${d.date ?? 'undated'}) — ${d.source}`);
    if (d.measurements.length) out.push(`  measured: ${d.measurements.slice(0, 4).map((m) => `${m.metric} ${m.value}`).join('; ')}${d.measurements.length > 4 ? '; …' : ''}`);
  }
  if (tried.length) {
    out.push('Tried or tested here — read each verdict; a disproven idea should not be retried without new evidence:');
    for (const { e, d } of tried) out.push(`- ${e.verdict.toUpperCase()}: "${e.hypothesis}" (${d.source})`);
  }
  if (r.history.length) out.push(`Settled history (superseded — do not cite): ${r.history.map((d) => d.title).join('; ')}`);
  console.log(out.join('\n'));
} finally {
  await db.close();
}

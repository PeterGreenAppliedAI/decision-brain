/**
 * npm run trace -- --graph <name> <decision-id>        the path behind one decision
 * npm run trace -- --graph <name> --find <text>        decision ids whose title contains text
 */
import { parseArgs } from 'node:util';
import { connect } from '../graph/db.js';
import { trace } from './trace.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { graph: { type: 'string' }, find: { type: 'string' }, json: { type: 'boolean' } },
});
if (!values.graph || (!values.find && !positionals[0])) {
  console.error('usage: npm run trace -- --graph <name> (<decision-id> | --find <text>) [--json]');
  process.exit(2);
}

const db = await connect();
try {
  const graph = db.selectGraph(values.graph);
  if (values.find) {
    const res = await graph.roQuery<{ id: string; status: string }>(
      'MATCH (d:Decision) WHERE toLower(d.title) CONTAINS toLower($q) RETURN d.id AS id, d.status AS status ORDER BY d.date DESC',
      { params: { q: values.find } });
    for (const r of res.data ?? []) console.log(`${r.id}  [${r.status}]`);
  } else {
    const t = await trace(graph, positionals[0]);
    if (!t) { console.log('no such decision'); process.exitCode = 1; }
    else if (values.json) console.log(JSON.stringify(t, null, 2));
    else {
      const d = t.decision;
      console.log(`${d.title}\n  ${d.date ?? 'undated'} · ${d.status}${d.category ? ` · ${d.category}` : ''} · ${d.source}`);
      const show = (label: string, cs: typeof t.cites) => cs.forEach((c) => {
        console.log(`  ${label} ${c.short} ${c.date.slice(0, 10)} ${c.message.slice(0, 90)}`);
        console.log(`      by ${c.authors.join(', ')} · ${c.files.length} files: ${c.files.slice(0, 4).join(', ')}${c.files.length > 4 ? ', …' : ''}`);
      });
      show('recorded in', t.recordedIn);
      show('cites      ', t.cites);
      if (t.mentions.length) console.log(`  mentions   ${t.mentions.join(', ')}`);
    }
  }
} finally {
  await db.close();
}

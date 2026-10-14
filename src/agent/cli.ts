/**
 * npm run ask -- --graph <repo-graph> "<question>" [--json]
 * Runs where the model host is reachable (the lab tmux session on this Mac).
 */
import { parseArgs } from 'node:util';
import { ask } from './agent.js';

const { positionals, values } = parseArgs({ allowPositionals: true, options: { graph: { type: 'string' }, json: { type: 'boolean' } } });
if (!values.graph || !positionals.length) { console.error('usage: npm run ask -- --graph <name> "<question>" [--json]'); process.exit(2); }
const r = await ask(positionals.join(' '), { graph: values.graph });
if (values.json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`\nQ: ${r.question}\n\n${r.answer || '(no answer — step budget ran out)'}\n`);
  console.log('Path:');
  for (const s of r.steps) console.log(`  ${s.error ? '✗' : '→'} ${s.tool}(${JSON.stringify(s.args)})  ${s.result.length} chars`);
  const g = r.grounding;
  console.log(`\nGrounding: ${g.grounded ? 'OK' : 'NOT GROUNDED'} — ${g.valid.length} valid citation(s)${g.invalid.length ? `, INVALID: ${g.invalid.join(', ')}` : ''}${g.declined ? ' (declined)' : ''} · ${(r.ms / 1000).toFixed(1)} s`);
}
process.exit(0);

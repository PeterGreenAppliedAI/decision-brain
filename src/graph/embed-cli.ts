/**
 * npm run embed -- --graph <name>
 * Embeds the graph's decisions for search by meaning (EMBED_URL, EMBED_MODEL) — only entries whose text
 * changed since they were last embedded. `sync` does the same after ingest.
 */
import { parseArgs } from 'node:util';
import { connect, GraphConnectError } from './db.js';
import { embedDecisions } from './embeddings.js';
import { createEmbedder } from '../llm/embed.js';

const { values } = parseArgs({ options: { graph: { type: 'string' } } });
if (!values.graph) { console.error('usage: npm run embed -- --graph <name>'); process.exit(2); }
const embedder = createEmbedder();
if (!embedder) { console.error('EMBED_URL is not set — see .env.example'); process.exit(2); }
const db = await connect().catch((err) => { if (!(err instanceof GraphConnectError)) throw err; console.error(err.message); process.exit(1); });
try {
  const t0 = Date.now();
  const r = await embedDecisions(db.selectGraph(values.graph), embedder, (l) => console.log(`  ${l}`));
  console.log(`[embed ${values.graph}] ${r.embedded} embedded, ${r.current} already current · ${embedder.model} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await db.close();
}

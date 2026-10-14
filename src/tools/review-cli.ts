/**
 * npm run review -- --graph <name> <commit> [--json]
 * npm run review -- --graph <name> <range|ref> --repo <path> [--json]
 *
 * Prints the deterministic review packet for a change.
 */
import { parseArgs } from 'node:util';
import { connect, GraphConnectError } from '../graph/db.js';
import { renderPacket, repoFor, review } from './review.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { graph: { type: 'string' }, repo: { type: 'string' }, json: { type: 'boolean' }, reviewers: { type: 'string', default: '3' } },
});
if (!values.graph || !positionals[0]) {
  console.error('usage: npm run review -- --graph <name> <commit|range> [--repo <path>] [--json]');
  process.exit(2);
}
const db = await connect().catch((err) => {
  if (!(err instanceof GraphConnectError)) throw err;
  console.error(err.message);
  process.exit(1);
});
try {
  const packet = await review(db.selectGraph(values.graph), positionals[0], { repo: repoFor(values.graph, values.repo), reviewers: Number(values.reviewers) });
  console.log(values.json ? JSON.stringify(packet, null, 2) : renderPacket(packet));
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}

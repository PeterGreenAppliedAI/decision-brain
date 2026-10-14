/**
 * npm run integrate -- --graph <repo-graph>
 *
 * Promotes the board's verified findings and confirmed handoffs into the brain graph again — e.g.
 * after changing the integrator — without re-running extraction.
 */
import { parseArgs } from 'node:util';
import { connect, GraphConnectError } from '../graph/db.js';
import { boardName } from './board.js';
import { integrate } from './integrate.js';

const { values } = parseArgs({ options: { graph: { type: 'string' } } });
if (!values.graph) { console.error('usage: npm run integrate -- --graph <repo-graph>'); process.exit(2); }
const db = await connect().catch((err) => {
  if (!(err instanceof GraphConnectError)) throw err;
  console.error(err.message);
  process.exit(1);
});
try {
  if (!(await db.list()).includes(boardName(values.graph))) throw new Error(`no board for "${values.graph}" — run npm run team first`);
  console.log(JSON.stringify(await integrate(db.selectGraph(boardName(values.graph)), db.selectGraph(values.graph))));
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}

/**
 * FalkorDB access. One graph per ingested repo (tenant isolation through FalkorDB's multigraph);
 * the extraction board gets its own graph too.
 */
import { FalkorDB, type Graph } from 'falkordb';
import { config } from '../config.js';

export type { Graph };

export class GraphConnectError extends Error {}

export async function connect(url = config.falkordbUrl): Promise<FalkorDB> {
  try {
    const db = await FalkorDB.connect({ url });
    // The client re-emits connection errors as 'error' events, and an unheard 'error' event crashes
    // Node. Log it instead: the underlying client reconnects by itself when FalkorDB comes back.
    db.on('error', (err: Error) => console.error(`[falkordb] ${err.message} — reconnecting`));
    return db;
  } catch (err) {
    throw new GraphConnectError(`FalkorDB not reachable at ${url} (${(err as Error).message}) — is it running? npm run graph:up`);
  }
}

/** Write rows in batches through one UNWIND query; `$rows` is the batch. */
export async function writeRows(graph: Graph, cypher: string, rows: object[], batch = config.writeBatch): Promise<void> {
  for (let i = 0; i < rows.length; i += batch) {
    await graph.query(cypher, { params: { rows: rows.slice(i, i + batch) as never } });
  }
}

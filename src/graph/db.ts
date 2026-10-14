/**
 * FalkorDB access. One graph per ingested repo (tenant isolation through FalkorDB's multigraph);
 * the extraction board gets its own graph too.
 */
import { FalkorDB, type Graph } from 'falkordb';
import { config } from '../config.js';

export type { Graph };

export async function connect(url = config.falkordbUrl): Promise<FalkorDB> {
  return FalkorDB.connect({ url });
}

/** Write rows in batches through one UNWIND query; `$rows` is the batch. */
export async function writeRows(graph: Graph, cypher: string, rows: object[], batch = config.writeBatch): Promise<void> {
  for (let i = 0; i < rows.length; i += batch) {
    await graph.query(cypher, { params: { rows: rows.slice(i, i + batch) as never } });
  }
}

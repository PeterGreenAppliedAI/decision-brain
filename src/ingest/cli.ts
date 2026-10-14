/**
 * npm run ingest -- <repo-path> [--graph <name>] [--decisions <file>]
 *
 * Builds (or refreshes) one repo's graph. The graph is named after the repo directory unless
 * --graph says otherwise.
 */
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { connect, GraphConnectError } from '../graph/db.js';
import { GitError } from './git.js';
import { ingestRepo } from './repo.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { graph: { type: 'string' }, decisions: { type: 'string', default: 'DECISIONS.md' } },
});
if (!positionals[0]) {
  console.error('usage: npm run ingest -- <repo-path> [--graph <name>] [--decisions <file>]');
  process.exit(2);
}
const repo = resolve(positionals[0]);
const graphName = values.graph ?? basename(repo).toLowerCase();

const db = await connect().catch((err) => {
  if (!(err instanceof GraphConnectError)) throw err;
  console.error(err.message);
  process.exit(1);
});
try {
  const r = await ingestRepo(db.selectGraph(graphName), repo, values.decisions);
  console.log(`[${graphName}] git: ${r.commits} commits, ${r.files} files`);
  if (r.refs) {
    console.log(`[${graphName}] decisions: ${r.decisions} entries, ${r.refs.recordedIn.length} recorded-in, ` +
      `${r.refs.commits.length} cited commits (${r.refs.unresolvedCommits.length} unresolved), ` +
      `${r.refs.files.length} file links (${r.refs.unresolvedFiles.length} backticked paths not in git)`);
    if (r.refs.unresolvedCommits.length) console.log(`  unresolved commits: ${r.refs.unresolvedCommits.join(' ')}`);
  }
  if (r.adrs) {
    console.log(`[${graphName}] ADRs (${r.adrs.dir}): ${r.adrs.count} records, ${r.adrs.links} stated supersessions, ` +
      `${r.adrs.refs.recordedIn.length} recorded-in, ${r.adrs.refs.commits.length} cited commits, ${r.adrs.refs.files.length} file links`);
  }
  if (!r.refs && !r.adrs) console.log(`[${graphName}] no ${values.decisions} and no ADR directory — git history only`);
} catch (err) {
  if (!(err instanceof GitError)) throw err;
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}

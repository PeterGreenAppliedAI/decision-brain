/**
 * npm run ingest -- <repo-path> [--graph <name>] [--decisions <file>]
 *
 * Builds (or refreshes) one repo's graph. The graph is named after the repo directory unless
 * --graph says otherwise.
 */
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { connect } from '../graph/db.js';
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

const db = await connect();
try {
  const r = await ingestRepo(db.selectGraph(graphName), repo, values.decisions);
  console.log(`[${graphName}] git: ${r.commits} commits, ${r.files} files`);
  if (r.refs) {
    console.log(`[${graphName}] decisions: ${r.decisions} entries, ${r.refs.recordedIn.length} recorded-in, ` +
      `${r.refs.commits.length} cited commits (${r.refs.unresolvedCommits.length} unresolved), ` +
      `${r.refs.files.length} file links (${r.refs.unresolvedFiles.length} unresolved)`);
    if (r.refs.unresolvedCommits.length) console.log(`  unresolved commits: ${r.refs.unresolvedCommits.join(' ')}`);
  } else {
    console.log(`[${graphName}] no ${values.decisions} — git history only`);
  }
} finally {
  await db.close();
}

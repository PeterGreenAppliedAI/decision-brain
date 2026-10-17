import { describe, expect, it } from 'vitest';
import { connect } from '../src/graph/db.js';
import { commits, diff, startDemoStep, startSync } from '../src/web/actions.js';

const reachable = await connect().then(async (db) => { await db.close(); return true; }, () => false);

describe('the Review page actions', () => {
  it('read nothing for a graph without a repository, or for a sha that is not one', () => {
    expect(commits('no-such-graph-xyz')).toBeNull();
    expect(diff('no-such-graph-xyz', 'abc1234')).toBeNull();
    expect(diff('no-such-graph-xyz', '--output=/tmp/x')).toBeNull();
  });

  it.skipIf(!reachable)('refuse an unknown step, a graph that is not a demo copy, and anything while local actions are off', async () => {
    const db = await connect();
    try {
      expect(await startDemoStep(db, 'whatever', 'rm')).toEqual({ error: 'unknown step' });
      expect(await startDemoStep(db, `test-not-demo-${process.pid}`, 'propose')).toEqual({ error: expect.stringMatching(/not a demo copy/) });
      if (!process.env.WEB_LOCAL_ACTIONS && !process.env.WEB_ALLOW_INGEST) {
        // a graph with no repository is refused before the switch is consulted; a known one hits the switch
        expect(startSync(db, 'no-such-graph-xyz')).toEqual({ error: expect.stringMatching(/no repository/) });
      }
    } finally { await db.close(); }
  });
});

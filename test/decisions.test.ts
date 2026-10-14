import { describe, it, expect } from 'vitest';
import { deriveStatus, extractRefs, parseDate, parseDecisions, resolveRefs } from '../src/ingest/decisions.js';

const MD = `# Decisions

## Newest Entry, Filed First (September 30 2026)

Reverted in 54359df; see \`src/router/prompt.ts\` and \`definitions/cron.ts\`.

### What it settles

Nothing dated here.

## Older Entry (September 29 2026)

Body. Not a hash: 2026092 or decade.

## Failed Approaches

### Phone call integration (April 2026)

Did not work.

### OpenCode integration (May 2026) — SUPERSEDED by the Pi swap (June 26 2026)

Replaced.
`;

describe('parseDate', () => {
  it('reads day, range, month-only and month-range headings', () => {
    expect(parseDate('X (September 30 2026)')).toEqual({ date: '2026-09-30', precision: 'day' });
    expect(parseDate('X (August 11-12 2026)')).toEqual({ date: '2026-08-11', precision: 'day' });
    expect(parseDate('X (June 2026, AI Dev Summit)')).toEqual({ date: '2026-06', precision: 'month' });
    expect(parseDate('X (April-May 2026)')).toEqual({ date: '2026-04', precision: 'month' });
    expect(parseDate('Known Issues')).toBeNull();
  });
});

describe('parseDecisions', () => {
  const es = parseDecisions(MD);

  it('keeps dated ## entries whole and splits undated categories into their ### entries', () => {
    expect(es.map((e) => e.title)).toEqual([
      'Newest Entry, Filed First', 'Older Entry', 'Phone call integration', 'OpenCode integration',
    ]);
    expect(es[0].body).toContain('What it settles');
    expect(es[2].category).toBe('Failed Approaches');
  });

  it('takes dates from headings, not file order, and records 1-based source lines', () => {
    expect(es[0].date).toBe('2026-09-30');
    expect(es[1].date).toBe('2026-09-29');
    expect(es[0].lineStart).toBe(3);
    expect(es[0].lineEnd).toBe(9);    // trailing blank line trimmed
    expect(es[0].id).toBe('2026-09-30-newest-entry-filed-first');
  });

  it('derives status from the heading, then the category', () => {
    expect(es.map((e) => e.status)).toEqual(['active', 'active', 'failed', 'superseded']);
    expect(deriveStatus('Completion Contracts — Built, Measured, KILLED Same Day', null)).toBe('failed');
    expect(deriveStatus('Polar (August 23 2026, NO BUILD)', null)).toBe('parked');
  });
});

describe('references', () => {
  it('finds hash-shaped runs and backticked paths, and nothing that only looks close', () => {
    const r = extractRefs('in 54359df and abcdef0123; 2026092, decade. `src/a.ts` `evals/x/` `notapath`');
    expect(r.commitRefs).toEqual(['54359df', 'abcdef0123']);
    expect(r.fileRefs).toEqual(['src/a.ts', 'evals/x']);
  });

  it('links only what git has: unique prefixes, exact or unique-suffix paths, blame by heading line', () => {
    const es = parseDecisions(MD);
    const sha = '54359df' + '0'.repeat(33);
    const files = new Set(['src/router/prompt.ts', 'src/pipeline/definitions/cron.ts']);
    const blame: string[] = [];
    blame[2] = sha;                                   // heading of the first entry, line 3
    const r = resolveRefs(es, [sha], files, blame);
    expect(r.recordedIn).toEqual([{ id: es[0].id, sha }]);
    expect(r.commits).toEqual([{ id: es[0].id, sha }]);
    expect(r.files.map((f) => f.path)).toEqual(['src/router/prompt.ts', 'src/pipeline/definitions/cron.ts']);
    expect(r.unresolvedCommits).toEqual([]);
  });
});

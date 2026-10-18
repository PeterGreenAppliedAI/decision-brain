import { describe, it, expect } from 'vitest';
import { deriveStatus, extractRefs, parseDate, parseDecisions, resolveRefs, statusFromLine } from '../src/ingest/decisions.js';

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

describe('ISO-dated headings', () => {
  it('take their date from the heading and drop it from the title', () => {
    const log = '# D\n\n## 2026-10-16 — Retries on POST\n\nA timed-out POST may have reached the server.\n\n## 2026-09-02: Sandbox wording\n\nOnly disposable was true.\n';
    const e = parseDecisions(log);
    expect(e.map((x) => [x.id, x.title, x.date])).toEqual([
      ['2026-10-16-retries-on-post', 'Retries on POST', '2026-10-16'],
      ['2026-09-02-sandbox-wording', 'Sandbox wording', '2026-09-02'],
    ]);
  });
});

describe('parseDate', () => {
  it('reads day, range, month-only and month-range headings', () => {
    expect(parseDate('X (September 30 2026)')).toEqual({ date: '2026-09-30', precision: 'day' });
    expect(parseDate('X (August 11-12 2026)')).toEqual({ date: '2026-08-11', precision: 'day' });
    expect(parseDate('X (June 2026, AI Dev Summit)')).toEqual({ date: '2026-06', precision: 'month' });
    // ISO dates, as ADR-style logs write them
    expect(parseDate('2026-10-16 — Retries on POST')).toEqual({ date: '2026-10-16', precision: 'day' });
    expect(parseDate('2026-10-16: Retries on POST')).toEqual({ date: '2026-10-16', precision: 'day' });
    expect(parseDate('(2026-10-16) Retries on POST')).toEqual({ date: '2026-10-16', precision: 'day' });
    expect(parseDate('Retries on POST (2026-10-16)')).toEqual({ date: '2026-10-16', precision: 'day' });
    expect(parseDate('Version 2026-10-16 notes')).toBeNull();          // a date mid-title is not the entry's date
    expect(parseDate('2026-13-01 — nonsense')).toBeNull();
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
    expect(deriveStatus('Completion Contracts — Built, Measured, KILLED Same Day', '', null, null)).toBe('failed');
    expect(deriveStatus('Polar (August 23 2026, NO BUILD)', '', null, null)).toBe('parked');
  });

  it("lets an entry's own Status line beat the category it is filed under", () => {
    // Found in the corpus: "Failed Approaches" entries that end "**Status:** Active."
    const md = `## Failed Approaches\n\n### Analytics pipeline (May 2026)\n**Problem:** x\n**Status:** Active. Routed.\n\n` +
      `### Phone calls (April 2026)\n**Conclusion:** Shelved.\n`;
    const [a, b] = parseDecisions(md);
    expect([a.status, a.statusText]).toEqual(['active', 'Active. Routed.']);
    expect([b.status, b.statusText]).toEqual(['failed', null]);
  });

  it("passes a section heading's own status down to its entries", () => {
    // Found in the corpus: "## Multi-Backend … (June 2026) — superseded by DeepSeek-V4-Flash swap above"
    // …and each entry in it still says "**Status:** Active." from when it was written: the heading is newer.
    const md = `## Multi-Backend (June 2026) — superseded by the swap above\n\n### vLLM backend (June 2026)\n**Status:** Active.\n\n` +
      `### Context window (June 2026)\ny\n`;
    expect(parseDecisions(md).map((e) => [e.category, e.status])).toEqual([
      ['Multi-Backend', 'superseded'], ['Multi-Backend', 'superseded'],
    ]);
  });

  it('maps free-text status lines', () => {
    expect(statusFromLine('Active, default native')).toBe('active');
    expect(deriveStatus('Why the cache failed us (May 2026)', '', 'Failed Approaches', 'Failed Approaches')).toBe('failed');
    expect(deriveStatus('Why the cache failed us (May 2026)', '**Status:** Active.', 'Failed Approaches', 'Failed Approaches')).toBe('active');
    expect(statusFromLine('Removed entirely')).toBe('failed');
    expect(statusFromLine('Stashed')).toBe('parked');
    expect(statusFromLine('Documented, watch')).toBe('open_issue');
  });

  it('ignores headings inside code fences and reads CRLF files', () => {
    const md = '## Real (May 1 2026)\r\n\r\n```md\r\n## Not a heading (May 2 2026)\r\n```\r\n';
    const es = parseDecisions(md);
    expect(es.map((e) => e.title)).toEqual(['Real']);
    expect(es[0].heading).toBe('Real (May 1 2026)');
  });

  it('keeps only the month for an impossible day', () => {
    expect(parseDate('X (September 31 2026)')).toEqual({ date: '2026-09', precision: 'month' });
    expect(parseDate('X (February 29 2028)')).toEqual({ date: '2028-02-29', precision: 'day' });
  });
});

describe('references', () => {
  it('finds hash-shaped runs and backticked paths, and nothing that only looks close', () => {
    const r = extractRefs('in 54359df and abcdef0123; 2026092, decade. `src/a.ts` `evals/x/` `notapath` `./docs/café b.md`');
    expect(r.commitRefs).toEqual(['54359df', 'abcdef0123']);
    expect(r.fileRefs).toEqual(['src/a.ts', 'evals/x', 'docs/café b.md']);
  });

  it('does not read an all-digit run as a commit — a known limit: such a short hash is indistinguishable from a number', () => {
    expect(extractRefs('released 2026092, see 1234567').commitRefs).toEqual([]);
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

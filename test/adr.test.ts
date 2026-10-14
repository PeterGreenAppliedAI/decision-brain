import { describe, expect, it } from 'vitest';
import { adrStatus, parseAdr } from '../src/ingest/adr.js';

const ids = (n: number) => ({ 2: 'adr-0002', 6: 'adr-0006', 14: 'adr-0014' } as Record<number, string>)[n];

describe('parseAdr', () => {
  it('reads a Nygard / adr-tools record: numbered title, Date line, Status section with a link', () => {
    const e = parseAdr('0003-x.md', '# 3. Use Postgres\n\nDate: 2019-02-01\n\n## Status\n\nAccepted\n\nSupersedes [2. Use MySQL](0002-use-mysql.md)\n\n## Context\n\nBody.\n\n', ids);
    expect([e.title, e.date, e.status, e.statusText]).toEqual(['Use Postgres', '2019-02-01', 'active', 'Accepted']);
    expect(e.links).toEqual([{ target: 'adr-0002', relation: 'supersedes' }]);
    expect([e.lineStart, e.lineEnd]).toEqual([1, 13]);
  });

  it('reads a superseded status line in the header (content-publisher ADR 6)', () => {
    const e = parseAdr('0006-x.md', '# 6. Tagging Content to Governments\n\nDate: 2018-12-12\nSuperseded: 2019-12-19 by [ADR 14](0014-political-and-government-tagging.md)\n\n## Context\n\nx\n', ids);
    expect([e.title, e.status]).toEqual(['Tagging Content to Governments', 'superseded']);
    expect(e.links).toEqual([{ target: 'adr-0014', relation: 'superseded_by' }]);
  });

  it('reads MADR front matter, and ignores links to files that are not ADRs here', () => {
    const e = parseAdr('0014-x.md', '---\nstatus: "superseded by [ADR-0099](0099-gone.md)"\ndate: 2023-05-04\n---\n# Use YAML front matter\n\nBody text.\n', ids);
    expect([e.title, e.date, e.status]).toEqual(['Use YAML front matter', '2023-05-04', 'superseded']);
    expect(e.links).toEqual([]);
  });

  it('does not take links in the body for stated relations', () => {
    const e = parseAdr('0014-x.md', '# 14. Political tagging\n\nDate: 2019-12-19\n\n## Status\n\nAccepted\n\n## Context\n\nIn [ADR 6](0006-tagging-governments.md) we deferred this; this supersedes it.\n', ids);
    expect(e.links).toEqual([]);
  });
});

describe('adrStatus', () => {
  it('maps status words, and "Supersedes" is not "Superseded"', () => {
    expect(adrStatus('Accepted. Supersedes [ADR 2](0002-x.md)')).toBe('active');
    expect(adrStatus('Superseded by ADR 14')).toBe('superseded');
    expect(adrStatus('Deprecated')).toBe('deprecated');
    expect(adrStatus('Proposed')).toBe('proposed');
    expect(adrStatus('Rejected')).toBe('failed');
    expect(adrStatus(null)).toBe('active');
  });
});

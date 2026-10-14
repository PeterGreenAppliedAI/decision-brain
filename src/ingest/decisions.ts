/**
 * DECISIONS.md → (:Decision) nodes with source line ranges, plus the commits and files each entry
 * cites. Deterministic: headings, dates and references are parsed by code; the model-assisted pass
 * (measurements, experiments, supersedes/disproved) comes later and only adds to this.
 *
 * Two layouts live in one file:
 *  - dated `##` entries ("## Title (September 30 2026)") whose `###` children are parts of the entry;
 *  - undated category sections ("## Failed Approaches") whose dated `###` children are the entries.
 * Entries are NOT in date order in the file — the date always comes from the heading.
 */
import { writeRows, type Graph } from '../graph/db.js';

export interface DecisionEntry {
  id: string;
  title: string;
  heading: string;
  date: string | null;              // YYYY-MM-DD, or YYYY-MM when the heading gives only a month
  datePrecision: 'day' | 'month' | null;
  category: string | null;          // the `##` section a `###` entry sits under
  status: string;
  lineStart: number;                // 1-based, inclusive
  lineEnd: number;
  body: string;
  commitRefs: string[];
  fileRefs: string[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const M = MONTHS.join('|');
// "(August 11-12 2026)", "(April-May 2026)", "(June 2026, AI Dev Summit)", "(May 4, 2026)"
const DATE_RE = new RegExp(`\\((${M})(?:-(?:${M}))?(?: (\\d{1,2})(?:-\\d{1,2})?,?)? (\\d{4})[^)]*\\)`);

/** Category sections whose entries carry a status by where they are filed. */
const CATEGORY_STATUS: Record<string, string> = {
  'Failed Approaches': 'failed',
  'Known Issues': 'open_issue',
  'Future Ideas (Stashed)': 'idea',
};

export function parseDate(heading: string): { date: string; precision: 'day' | 'month' } | null {
  const m = DATE_RE.exec(heading);
  if (!m) return null;
  const month = String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0');
  return m[2]
    ? { date: `${m[3]}-${month}-${m[2].padStart(2, '0')}`, precision: 'day' }
    : { date: `${m[3]}-${month}`, precision: 'month' };
}

/** Status from the heading's own words, else from its category, else active. */
export function deriveStatus(heading: string, category: string | null): string {
  if (/superseded/i.test(heading)) return 'superseded';
  if (/\b(KILLED|FAILED)\b|tried and reverted|\breverted\b|— removed/i.test(heading)) return 'failed';
  if (/NO BUILD|parked/i.test(heading)) return 'parked';
  return (category && CATEGORY_STATUS[category]) ?? 'active';
}

function titleOf(heading: string): string {
  const m = DATE_RE.exec(heading);
  const t = m ? heading.slice(0, m.index) : heading;
  return t.replace(/[\s—–-]+$/, '').trim();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
}

// Hex runs of 7–40 with at least one a–f letter and one digit: commit-hash shaped.
const COMMIT_RE = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g;
const PATH_RE = /`([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\/?)`/g;

export function extractRefs(body: string): { commitRefs: string[]; fileRefs: string[] } {
  const commitRefs = [...new Set(body.match(COMMIT_RE) ?? [])];
  const fileRefs = [...new Set([...body.matchAll(PATH_RE)].map((m) => m[1].replace(/\/$/, '')))];
  return { commitRefs, fileRefs };
}

export function parseDecisions(md: string): DecisionEntry[] {
  const lines = md.split('\n');
  const h2: number[] = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) h2.push(i); });

  const entries: DecisionEntry[] = [];
  const make = (start: number, end: number, category: string | null) => {
    while (end > start && /^\s*(---)?\s*$/.test(lines[end])) end--;   // trailing blanks and separators
    const heading = lines[start].replace(/^#+\s*/, '').trim();
    const parsed = parseDate(heading);
    const body = lines.slice(start + 1, end + 1).join('\n').trim();
    entries.push({
      id: '', title: titleOf(heading), heading,
      date: parsed?.date ?? null, datePrecision: parsed?.precision ?? null,
      category, status: deriveStatus(heading, category),
      lineStart: start + 1, lineEnd: end + 1, body, ...extractRefs(body),
    });
  };

  h2.forEach((start, k) => {
    const end = (k + 1 < h2.length ? h2[k + 1] : lines.length) - 1;
    const heading = lines[start].replace(/^##\s*/, '').trim();
    const h3: number[] = [];
    for (let i = start + 1; i <= end; i++) if (/^### /.test(lines[i])) h3.push(i);
    // A category section: undated itself, or every child is a dated entry of its own.
    const isCategory = !parseDate(heading)
      || (h3.length >= 2 && h3.every((i) => parseDate(lines[i])));
    if (!isCategory || h3.length === 0) return make(start, end, null);
    h3.forEach((s, j) => make(s, (j + 1 < h3.length ? h3[j + 1] : end + 1) - 1, titleOf(heading)));
  });

  // ids: date + title slug, unique
  const seen = new Map<string, number>();
  for (const e of entries) {
    const base = `${e.date ?? 'undated'}-${slug(e.title)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    e.id = n === 1 ? base : `${base}-${n}`;
  }
  return entries;
}

export interface RefResolution {
  recordedIn: Array<{ id: string; sha: string }>;
  commits: Array<{ id: string; sha: string }>;
  files: Array<{ id: string; path: string }>;
  unresolvedCommits: string[];
  unresolvedFiles: string[];
}

/**
 * Link cited hashes and paths to what git actually has; anything unmatched is reported, not invented.
 * A partial path ("definitions/cron.ts") links when exactly one known file ends with it.
 */
export function resolveRefs(entries: DecisionEntry[], shas: string[], files: Set<string>,
  blame: string[] = []): RefResolution {
  const out: RefResolution = { recordedIn: [], commits: [], files: [], unresolvedCommits: [], unresolvedFiles: [] };
  const filePaths = [...files];
  const resolvePath = (ref: string): string | null => {
    if (files.has(ref)) return ref;
    const hits = filePaths.filter((f) => f.endsWith('/' + ref));
    return hits.length === 1 ? hits[0] : null;
  };
  const known = new Set(shas);
  for (const e of entries) {
    const writer = blame[e.lineStart - 1];
    if (writer && known.has(writer)) out.recordedIn.push({ id: e.id, sha: writer });
    for (const ref of e.commitRefs) {
      const hits = shas.filter((s) => s.startsWith(ref));
      if (hits.length === 1) out.commits.push({ id: e.id, sha: hits[0] });
      else out.unresolvedCommits.push(ref);
    }
    for (const path of e.fileRefs) {
      const hit = resolvePath(path);
      if (hit) out.files.push({ id: e.id, path: hit });
      else out.unresolvedFiles.push(path);
    }
  }
  return out;
}

export async function ingestDecisions(graph: Graph, entries: DecisionEntry[], refs: RefResolution,
  sourceFile = 'DECISIONS.md'): Promise<void> {
  await writeRows(graph,
    `UNWIND $rows AS r
     MERGE (d:Decision {id: r.id})
     SET d.title = r.title, d.heading = r.heading, d.date = r.date, d.datePrecision = r.datePrecision,
         d.category = r.category, d.status = r.status, d.source = r.source, d.body = r.body`,
    entries.map((e) => ({
      id: e.id, title: e.title, heading: e.heading, date: e.date, datePrecision: e.datePrecision,
      category: e.category, status: e.status, body: e.body,
      source: `${sourceFile}:${e.lineStart}-${e.lineEnd}`,
    })));

  await writeRows(graph,
    `UNWIND $rows AS r
     MATCH (d:Decision {id: r.id}), (c:Commit {sha: r.sha})
     MERGE (d)-[:RECORDED_IN]->(c)`,
    refs.recordedIn);

  await writeRows(graph,
    `UNWIND $rows AS r
     MATCH (d:Decision {id: r.id}), (c:Commit {sha: r.sha})
     MERGE (d)-[:CITES]->(c)`,
    refs.commits);

  await writeRows(graph,
    `UNWIND $rows AS r
     MATCH (d:Decision {id: r.id}), (f:File {path: r.path})
     MERGE (d)-[:MENTIONS]->(f)`,
    refs.files);
}

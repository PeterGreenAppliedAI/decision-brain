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
  statusText: string | null;        // the entry's own "**Status:** …" line, verbatim
  lineStart: number;                // 1-based, inclusive
  lineEnd: number;
  body: string;
  commitRefs: string[];
  fileRefs: string[];
  /** The file this entry lives in, when it is not the log's own file (one ADR per file). */
  file?: string;
  /** Relations the entry states in structured form (an ADR's "Superseded by [ADR 14](…)") — code
   *  reads these, so they become edges directly, without the board. */
  links?: Array<{ target: string; relation: 'supersedes' | 'superseded_by' }>;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const M = MONTHS.join('|');
// "(August 11-12 2026)", "(April-May 2026)", "(June 2026, AI Dev Summit)", "(May 4, 2026)"
const DATE_RE = new RegExp(`\\((${M})(?:-(?:${M}))?(?: (\\d{1,2})(?:-\\d{1,2})?,?)? (\\d{4})[^)]*\\)`);

/** Category sections whose entries carry a status by where they are filed — the weakest signal. */
const CATEGORY_STATUS: Record<string, string> = {
  'Failed Approaches': 'failed',
  'Known Issues': 'open_issue',
  'Future Ideas (Stashed)': 'idea',
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseDate(heading: string): { date: string; precision: 'day' | 'month' } | null {
  const m = DATE_RE.exec(heading);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]);
  const month = String(mi + 1).padStart(2, '0');
  const day = m[2] ? Number(m[2]) : 0;
  // an impossible day ("September 31") keeps only the month rather than inventing a date
  return day >= 1 && day <= DAYS_IN_MONTH[mi]
    ? { date: `${m[3]}-${month}-${String(day).padStart(2, '0')}`, precision: 'day' }
    : { date: `${m[3]}-${month}`, precision: 'month' };
}

/** Status words in a heading ("— SUPERSEDED by …", "KILLED Same Day", "NO BUILD"), or null. */
export function statusFromHeading(heading: string): string | null {
  if (/superseded/i.test(heading)) return 'superseded';
  // KILLED / FAILED are markers only in capitals: "Failed Approaches" is a section name, and a title
  // that describes a failure is not itself a failed decision.
  if (/\b(KILLED|FAILED)\b/.test(heading) || /tried and reverted|\breverted\b|— removed/i.test(heading)) return 'failed';
  if (/NO BUILD|parked/i.test(heading)) return 'parked';
  return null;
}

/** The entry's own "**Status:** …" line, verbatim (null when it has none). */
export function statusLine(body: string): string | null {
  const m = /^\*\*Status:?\*\*:?\s*(.+)$/m.exec(body);
  return m ? m[1].trim() : null;
}

/** A free-text status line → a status. Most say "Active"; the rest are mapped by their words. */
export function statusFromLine(text: string): string {
  if (/\b(removed|reverted|gone|killed|abandoned|shelved)\b/i.test(text)) return 'failed';
  if (/\b(stashed|deferred|parked)\b/i.test(text)) return 'parked';
  if (/^(documented|logged for investigation|under re-evaluation)/i.test(text)) return 'open_issue';
  return 'active';
}

/**
 * Strongest signal first: the heading's own words, then the parent heading's words, then the
 * entry's Status line, then the category it is filed under, else active.
 *
 * Headings outrank Status lines because status words in a heading are amendments: in the corpus a
 * whole section was later marked "— superseded by DeepSeek-V4-Flash swap above" while each entry in
 * it still says "**Status:** Active." from when it was written. The verbatim line is kept on the node
 * (statusText), so both are visible. Being filed under "Failed Approaches" is weakest: many such
 * entries end "**Status:** Active" — they record what failed on the way to a decision that stands.
 */
export function deriveStatus(heading: string, body: string, parentHeading: string | null, category: string | null): string {
  const line = statusLine(body);
  return statusFromHeading(heading)
    ?? (parentHeading ? statusFromHeading(parentHeading) : null)
    ?? (line ? statusFromLine(line) : null)
    ?? (category ? CATEGORY_STATUS[category] : null)
    ?? 'active';
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
// Any backticked text with a slash is a candidate path; resolveRefs keeps only what git has, so
// the net can be wide (non-ASCII names, spaces) without inventing links.
const PATH_RE = /`([^`\n]*\/[^`\n]*)`/g;

export function extractRefs(body: string): { commitRefs: string[]; fileRefs: string[] } {
  const commitRefs = [...new Set(body.match(COMMIT_RE) ?? [])];
  const fileRefs = [...new Set([...body.matchAll(PATH_RE)].map((m) => m[1].trim().replace(/^\.\//, '').replace(/\/$/, '')))];
  return { commitRefs, fileRefs };
}

export function parseDecisions(md: string): DecisionEntry[] {
  const lines = md.split(/\r?\n/);
  // headings inside fenced code blocks are not headings
  const fenced = new Set<number>();
  let inFence = false;
  lines.forEach((l, i) => { if (/^\s*(```|~~~)/.test(l)) inFence = !inFence; else if (inFence) fenced.add(i); });
  const isHeading = (i: number, level: 2 | 3) => !fenced.has(i) && new RegExp(`^#{${level}} `).test(lines[i]);
  const h2: number[] = [];
  lines.forEach((_, i) => { if (isHeading(i, 2)) h2.push(i); });

  const entries: DecisionEntry[] = [];
  const make = (start: number, end: number, parentHeading: string | null) => {
    const category = parentHeading ? titleOf(parentHeading) : null;
    while (end > start && /^\s*(---)?\s*$/.test(lines[end])) end--;   // trailing blanks and separators
    const heading = lines[start].replace(/^#+\s*/, '').trim();
    const parsed = parseDate(heading);
    const body = lines.slice(start + 1, end + 1).join('\n').trim();
    entries.push({
      id: '', title: titleOf(heading), heading,
      date: parsed?.date ?? null, datePrecision: parsed?.precision ?? null,
      category, status: deriveStatus(heading, body, parentHeading, category), statusText: statusLine(body),
      lineStart: start + 1, lineEnd: end + 1, body, ...extractRefs(body),
    });
  };

  h2.forEach((start, k) => {
    const end = (k + 1 < h2.length ? h2[k + 1] : lines.length) - 1;
    const heading = lines[start].replace(/^##\s*/, '').trim();
    const h3: number[] = [];
    for (let i = start + 1; i <= end; i++) if (isHeading(i, 3)) h3.push(i);
    // A category section: undated itself, or every child is a dated entry of its own.
    const isCategory = !parseDate(heading)
      || (h3.length >= 2 && h3.every((i) => parseDate(lines[i])));
    if (!isCategory || h3.length === 0) return make(start, end, null);
    h3.forEach((s, j) => make(s, (j + 1 < h3.length ? h3[j + 1] : end + 1) - 1, heading));
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
  writerOf: string[] | ((e: DecisionEntry) => string | undefined) = []): RefResolution {
  const writer = Array.isArray(writerOf) ? (e: DecisionEntry) => writerOf[e.lineStart - 1] : writerOf;
  const out: RefResolution = { recordedIn: [], commits: [], files: [], unresolvedCommits: [], unresolvedFiles: [] };
  const filePaths = [...files];
  const resolvePath = (ref: string): string | null => {
    if (files.has(ref)) return ref;
    const hits = filePaths.filter((f) => f.endsWith('/' + ref));
    return hits.length === 1 ? hits[0] : null;
  };
  const known = new Set(shas);
  for (const e of entries) {
    const sha = writer(e);
    if (sha && known.has(sha)) out.recordedIn.push({ id: e.id, sha });
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

/**
 * `sourceFile` names the log as a whole (DECISIONS.md, or an ADR directory): re-ingest converges per
 * log, and an entry's own `source` points at its file and lines.
 */
export async function ingestDecisions(graph: Graph, entries: DecisionEntry[], refs: RefResolution,
  sourceFile = 'DECISIONS.md'): Promise<void> {
  // Converge on the file as it is now: entries that no longer exist (removed, or retitled — the id
  // follows the title) go, and this ingest's own link types are rebuilt. Edges other passes add
  // (SUPERSEDES, BECAUSE, …) on surviving entries are left alone.
  await graph.query('MATCH (d:Decision {sourceFile: $file}) WHERE NOT d.id IN $ids DETACH DELETE d',
    { params: { file: sourceFile, ids: entries.map((e) => e.id) } });
  await graph.query('MATCH (d:Decision {sourceFile: $file})-[r:RECORDED_IN|CITES|MENTIONS]->() DELETE r',
    { params: { file: sourceFile } });
  await graph.query("MATCH (d:Decision {sourceFile: $file})-[r:SUPERSEDES {via: 'status'}]-() DELETE r",
    { params: { file: sourceFile } });

  await writeRows(graph,
    `UNWIND $rows AS r
     MERGE (d:Decision {id: r.id})
     SET d.title = r.title, d.heading = r.heading, d.date = r.date, d.datePrecision = r.datePrecision,
         d.category = r.category, d.status = r.status, d.statusText = r.statusText,
         d.source = r.source, d.sourceFile = r.sourceFile, d.body = r.body`,
    entries.map((e) => ({
      id: e.id, title: e.title, heading: e.heading, date: e.date, datePrecision: e.datePrecision,
      category: e.category, status: e.status, statusText: e.statusText, body: e.body,
      source: `${e.file ?? sourceFile}:${e.lineStart}-${e.lineEnd}`, sourceFile,
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

  // Stated relations, newer → older: the entry's own words, read by code.
  const ids = new Set(entries.map((e) => e.id));
  const links = entries.flatMap((e) => (e.links ?? []).filter((l) => ids.has(l.target) && l.target !== e.id).map((l) =>
    l.relation === 'supersedes' ? { newer: e.id, older: l.target } : { newer: l.target, older: e.id }));
  await writeRows(graph,
    `UNWIND $rows AS r
     MATCH (n:Decision {id: r.newer}), (o:Decision {id: r.older})
     MERGE (n)-[e:SUPERSEDES {via: 'status'}]->(o)`,
    links);
}

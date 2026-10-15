/**
 * Architecture decision records (one Markdown file per decision) → the same (:Decision) entries as a
 * decision log. Deterministic. Handles the common layouts: Nygard / adr-tools ("# 13. Title",
 * "Date: …", a "## Status" section), status lines in the header ("Superseded: 2019-12-19 by
 * [ADR 14](0014-….md)"), and MADR front matter (status:, date:).
 *
 * A status line that links another ADR ("Superseded by [ADR 14](…)", "Supersedes [2. …](…)") is a
 * relation the record states itself, so it becomes a link code can draw directly.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { extractRefs, type DecisionEntry } from './decisions.js';

// "0013-title.md" (adr-tools, Nygard) or "20200926-title.md" (log4brains: the date is the prefix).
const ADR_FILE = /^(\d{3,8})-.+\.(md|markdown)$/;

export function findAdrDir(repo: string, candidates = config.adrDirs): string | null {
  return candidates.find((d) => existsSync(join(repo, d)) && readdirSync(join(repo, d)).some((f) => ADR_FILE.test(f))) ?? null;
}

/** An ADR status line → a status. */
export function adrStatus(text: string | null): string {
  if (!text) return 'active';
  if (/\bsuperseded\b/i.test(text)) return 'superseded';   // "Supersedes [ADR 2]" is an active record
  if (/deprecat/i.test(text)) return 'deprecated';
  if (/reject/i.test(text)) return 'failed';
  if (/propos|draft/i.test(text)) return 'proposed';
  return 'active';
}

export function parseAdr(file: string, text: string, idOf: (n: number) => string | undefined): DecisionEntry {
  const lines = text.split(/\r?\n/);
  let start = 0;
  const fm: Record<string, string> = {};
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      for (const l of lines.slice(1, end)) { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) fm[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, ''); }
      start = end + 1;
    }
  }
  const titleAt = lines.findIndex((l, i) => i >= start && /^# /.test(l));
  const heading = titleAt >= 0 ? lines[titleAt].replace(/^#\s*/, '').trim() : file;
  const title = heading.replace(/^(ADR[-\s]?)?\d+[.:]?\s*/i, '').trim() || heading;

  const date = fm.date?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    ?? /^\W*Date:\s*(\d{4}-\d{2}-\d{2})/im.exec(lines.slice(start).join('\n'))?.[1] ?? null;

  // Status lines: the "## Status" section's text, plus status-shaped lines in the header.
  const statusLines: string[] = [];
  const sec = lines.findIndex((l) => /^##\s+Status\b/i.test(l));
  if (sec >= 0) for (let i = sec + 1; i < lines.length && !/^#/.test(lines[i]); i++) if (lines[i].trim()) statusLines.push(lines[i].trim());
  const firstSection = lines.findIndex((l, i) => i > titleAt && /^## /.test(l));
  for (const l of lines.slice(titleAt + 1, firstSection < 0 ? undefined : firstSection)) {
    if (/^\W*(Status|Superseded|Supersedes|Deprecated|Accepted|Proposed|Rejected|Amended)\b/i.test(l)) statusLines.push(l.trim().replace(/^\W+/, ''));
  }
  if (fm.status) statusLines.unshift(fm.status);
  const statusText = statusLines[0] ?? null;

  const links: NonNullable<DecisionEntry['links']> = [];
  for (const l of statusLines) {
    const relation = /superseded\b|superseded:/i.test(l) ? 'superseded_by' : /\bsupersedes\b/i.test(l) ? 'supersedes' : null;
    if (!relation) continue;
    for (const m of l.matchAll(/\]\(([^)]*?)(\d{3,8})-[^)]*\)/g)) {
      const target = idOf(Number(m[2]));
      if (target) links.push({ target, relation });
    }
  }

  let end = lines.length - 1;
  while (end > 0 && !lines[end].trim()) end--;
  const body = lines.slice(titleAt + 1, end + 1).join('\n').trim();
  return {
    id: '', title, heading, date, datePrecision: date ? 'day' : null, category: 'ADR',
    status: adrStatus(statusLines.join(' ')), statusText,
    lineStart: titleAt + 1, lineEnd: end + 1, body, ...extractRefs(body), links,
  };
}

/** A date-shaped prefix (log4brains: "20200926") — used when the record has no Date line. */
function dateFromPrefix(prefix: string): string | null {
  const m = /^(20\d{2}|19\d{2})(\d{2})(\d{2})$/.exec(prefix);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** ADR files (name + text) → entries; ids are "adr-" + the file's prefix as written ("adr-0013", "adr-20200926"). */
export function parseAdrFiles(dir: string, files: Array<{ name: string; text: string }>): DecisionEntry[] {
  const adrs = files.filter((f) => ADR_FILE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const byNumber = new Map(adrs.map((f) => [Number(ADR_FILE.exec(f.name)![1]), `adr-${ADR_FILE.exec(f.name)![1]}`]));
  return adrs.map((f) => {
    const prefix = ADR_FILE.exec(f.name)![1];
    const e = parseAdr(f.name, f.text, (n) => byNumber.get(n));
    const date = e.date ?? dateFromPrefix(prefix);
    return { ...e, date, datePrecision: date ? 'day' as const : null, id: `adr-${prefix}`, file: `${dir}/${f.name}` };
  });
}

/** Every ADR in a directory of the working tree. */
export function parseAdrDir(repo: string, dir: string): DecisionEntry[] {
  return parseAdrFiles(dir, readdirSync(join(repo, dir)).map((name) => ({ name, text: ADR_FILE.test(name) ? readFileSync(join(repo, dir, name), 'utf8') : '' })));
}

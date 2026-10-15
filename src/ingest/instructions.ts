/**
 * Instruction files for AI coding agents (AGENTS.md, CLAUDE.md, .cursorrules, …) → (:Guidance).
 * Deterministic: every version in git, split into sections; each distinct section text is one node
 * with a lifespan — from the version that introduced it until the version that changed or removed
 * it. So "what was the agent told when it wrote this commit?" is a query, not a guess.
 *
 *   (:Guidance {id, path, heading, text, from, fromSha, until, untilSha})
 *   (:Guidance)-[:IN]->(:File)                  // the instruction file
 *   (:Guidance)-[:NAMES]->(:File)               // files the section names (resolved against git)
 *   (:Guidance)-[:REPLACES]->(:Guidance)        // same heading, newer text
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config } from '../config.js';
import type { Graph } from '../graph/db.js';
import { writeRows } from '../graph/db.js';
import { globToRegExp } from '../graph/rationale.js';
import { extractRefs } from './decisions.js';

export interface GuidanceSection { heading: string; text: string; hash: string }
export interface Guidance { id: string; path: string; heading: string; text: string; from: string; fromSha: string; until: string | null; untilSha: string | null; names: string[]; replaces: string | null }

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** A Markdown file → sections keyed by their heading path ("Code Standards > Security"). Text before the first heading is "(preamble)". */
export function splitSections(md: string): GuidanceSection[] {
  const out: GuidanceSection[] = [];
  const trail: string[] = [];
  let heading = '(preamble)', buf: string[] = [];
  let fence = false;
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) out.push({ heading, text, hash: createHash('sha1').update(text.replace(/\s+/g, ' ')).digest('hex').slice(0, 10) });
    buf = [];
  };
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      trail.length = level - 1;
      trail[level - 1] = m[2].trim();
      heading = trail.filter(Boolean).join(' > ');
    } else buf.push(line);
  }
  flush();
  return out;
}

/** Version history → section lifespans. `versions` oldest first. */
export function lifespans(path: string, versions: Array<{ sha: string; date: string; sections: GuidanceSection[] }>): Omit<Guidance, 'names'>[] {
  const open = new Map<string, Omit<Guidance, 'names'>>();      // heading|hash → live section
  const done: Omit<Guidance, 'names'>[] = [];
  const latestByHeading = new Map<string, string>();             // heading → id of its most recent text
  for (const v of versions) {
    const present = new Set(v.sections.map((s) => `${s.heading}|${s.hash}`));
    for (const [key, g] of open) if (!present.has(key)) { g.until = v.date; g.untilSha = v.sha; done.push(g); open.delete(key); }
    for (const s of v.sections) {
      const key = `${s.heading}|${s.hash}`;
      if (open.has(key)) continue;
      const id = `${path}#${s.heading}#${s.hash}@${v.sha.slice(0, 8)}`;   // a text that returns later is a new span
      const prev = latestByHeading.get(s.heading);
      open.set(key, { id, path, heading: s.heading, text: s.text, from: v.date, fromSha: v.sha, until: null, untilSha: null, replaces: prev && prev !== id ? prev : null });
      latestByHeading.set(s.heading, id);
    }
  }
  return [...done, ...open.values()];
}

export function findInstructionFiles(repo: string): string[] {
  const patterns = config.instructionFiles.map(globToRegExp);
  return git(repo, ['ls-tree', '-r', 'HEAD', '--name-only']).split('\n').filter((p) => p && patterns.some((re) => re.test(p))).sort();
}

export async function ingestInstructions(graph: Graph, repo: string, knownFiles: Set<string>): Promise<{ files: string[]; sections: number; versions: number }> {
  const files = findInstructionFiles(repo);
  const all: Guidance[] = [];
  let versionCount = 0;
  const paths = [...knownFiles];
  const resolve = (ref: string) => knownFiles.has(ref) ? ref : (paths.filter((f) => f.endsWith('/' + ref)).length === 1 ? paths.find((f) => f.endsWith('/' + ref))! : null);
  for (const path of files) {
    // committer dates: a version is in force from when it entered the history, like commits are compared
    const log = git(repo, ['log', '--format=%H|%cI', '--', path]).split('\n').filter(Boolean).reverse();
    const versions = log.map((l) => {
      const [sha, local] = l.split('|');
      const date = new Date(local).toISOString();   // UTC, comparable with commit dates
      let text = '';
      try { text = git(repo, ['show', `${sha}:${path}`]); } catch { /* deleted in this commit */ }
      return { sha, date, sections: splitSections(text) };
    });
    versionCount += versions.length;
    for (const g of lifespans(path, versions)) {
      all.push({ ...g, names: [...new Set(extractRefs(g.text).fileRefs.map(resolve).filter((x): x is string => Boolean(x)))] });
    }
  }
  try { await graph.createNodeRangeIndex('Guidance', 'id'); } catch (err) { if (!/already indexed/i.test(String(err))) throw err; }
  await graph.query('MATCH (g:Guidance) DETACH DELETE g');
  await writeRows(graph,
    `UNWIND $rows AS r
     CREATE (g:Guidance {id: r.id, path: r.path, heading: r.heading, text: r.text, from: r.from, fromSha: r.fromSha, until: r.until, untilSha: r.untilSha})
     WITH g, r MATCH (f:File {path: r.path}) MERGE (g)-[:IN]->(f)`,
    all.map(({ names: _n, replaces: _r, ...g }) => g), 200);
  await writeRows(graph,
    'UNWIND $rows AS r MATCH (g:Guidance {id: r.id}), (f:File {path: r.file}) MERGE (g)-[:NAMES]->(f)',
    all.flatMap((g) => g.names.map((file) => ({ id: g.id, file }))));
  await writeRows(graph,
    'UNWIND $rows AS r MATCH (n:Guidance {id: r.id}), (o:Guidance {id: r.old}) MERGE (n)-[:REPLACES]->(o)',
    all.filter((g) => g.replaces).map((g) => ({ id: g.id, old: g.replaces })));
  return { files, sections: all.length, versions: versionCount };
}

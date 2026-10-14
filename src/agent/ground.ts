/**
 * What code can establish about an agent's answer — and nothing more. Three separate checks, each
 * named for what it actually verifies:
 *
 *  - citations: every [id] names something a tool returned during this run (a decision id, a commit,
 *    a file). It does NOT show the cited item supports the sentence.
 *  - numbers: every figure ("0/20", "92%", "33.9s") appears in a tool result that contained a citation
 *    from the same block (paragraph, or list with its sub-items); a figure in a block with no citation
 *    is unsupported. This catches invented or altered measurements — the most damaging wrong answer.
 *  - abstention: the answer opens by declining and makes no cited or numeric claim.
 *
 * Everything else an answer says is model-written prose that code has not verified, and the result
 * says so (`prose: 'model-written'`). A model-based entailment check, if added, is a separate label.
 */
import type { Step } from '../../lib/loop.js';

export type GroundingStatus = 'supported' | 'abstained' | 'invalid-citation' | 'unsupported-number' | 'uncited';

export interface Grounding {
  status: GroundingStatus;
  /** Convenience: status is 'supported' or 'abstained'. */
  grounded: boolean;
  valid: string[];
  invalid: string[];
  /** Figures not found in the evidence of the sentence that states them (or stated with no citation). */
  unsupportedNumbers: Array<{ number: string; sentence: string }>;
  numbersChecked: number;
  declined: boolean;
  prose: 'model-written';
}

const KEYS = new Set(['id', 'sha', 'short', 'path', 'key', 'name', 'file']);
const isSha = (s: string) => /^[0-9a-f]{7,40}$/.test(s);

/** Every id, sha, path and name in one tool result. */
function idsIn(result: string): Set<string> {
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (KEYS.has(k) && typeof x === 'string') seen.add(x);
        if (k === 'files' && Array.isArray(x)) x.forEach((f) => typeof f === 'string' && seen.add(f));
        walk(x);
      }
    }
  };
  try { walk(JSON.parse(result)); } catch { /* not JSON: an error message */ }
  return seen;
}

export function seenInSteps(steps: Step[]): Set<string> {
  const all = new Set<string>();
  for (const s of steps) for (const id of idsIn(s.result)) all.add(id);
  return all;
}

/**
 * Bracketed citations. A model sometimes writes the tool call instead of the id — "[who_knows:
 * app/x.rb]" — so "<tool name>: <target>" is read as citing the target; the target must still be
 * something the tool returned. Any other "word: …" form is left as written, and fails if unknown.
 */
export function citationsOf(text: string, toolNames: string[] = []): string[] {
  const tools = new Set(toolNames);
  return [...new Set([...text.matchAll(/\[([^\]\s][^\]]{1,200})\]/g)].map((m) => {
    const c = m[1].trim();
    const call = /^([a-z_]+)\s*[:(]\s*(.+?)\)?$/.exec(c);
    return call && tools.has(call[1]) ? call[2].trim() : c;
  }))];
}

/** Figures worth checking: ratios, percentages, decimals, numbers with units, and multi-digit numbers. */
export function numbersIn(sentence: string): string[] {
  const text = sentence
    .replace(/\[[^\]]*\]/g, ' ')                       // ids in citations carry dates and hashes
    .replace(/`[^`]*`/g, ' ')                          // code spans: file names, model names (qwen3.5:9b)
    .replace(/^\s*(\d+[.)]|[-*])\s+/gm, ' ')           // list markers
    .replace(/\b[\w.-]*:\d+[\w.]*\b/g, ' ')            // model tags like gemma4:12b
    .replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, ' ')        // dates
    .replace(/(\b(ADR|PR|RFC|issue|ticket|version|v)\s?[-#]?|#|\b[A-Z]{1,3}-?)\d+\b/gi, ' ');   // references: ADR 13, PR #42, F18, v2
  const found = text.match(/(?<![\w.])\d+(?:[.,]\d+)?(?:\s?\/\s?\d+(?:[.,]\d+)?)?\s?(?:%|×|x\b|ms\b|s\b|min\b|GB\b|MB\b|KB\b|K\b|B\b)?(?![\w.]*\w)/g) ?? [];
  return [...new Set(found.map((n) => n.replace(/\s+/g, '')).filter((n) => /[/%.×]|\d{2,}|ms|s$|min|GB|MB|KB|K$|B$/.test(n)))];
}

/** A figure is in the evidence if its digits appear there in the same form ("16/20" or "16 / 20"). */
function figureIn(n: string, evidence: string): boolean {
  const core = n.replace(/(%|×|x|ms|s|min|GB|MB|KB|K|B)$/, '');
  const re = new RegExp(`(?<![\\d.])${core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('/', '\\s?/\\s?')}(?![\\d])`);
  return re.test(evidence);
}

const DECLINE_OPENING = /^\s*(i don'?t know|i do not know|the graph (has|holds|contains) no)\b/i;

/** Blocks: paragraphs, or a list with its sub-items — the scope a citation covers. */
function blocks(answer: string): string[] {
  return answer.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

export function ground(answer: string, steps: Step[]): Grounding {
  const toolNames = [...new Set(steps.map((s) => s.tool))];
  const results = steps.map((s) => ({ text: s.result, ids: idsIn(s.result) }));
  const seen = new Set(results.flatMap((r) => [...r.ids]));
  const shas = [...seen].filter(isSha);
  const resolve = (c: string) => seen.has(c) ? c : isSha(c) ? shas.find((s) => s.startsWith(c)) ?? null : null;

  const cites = citationsOf(answer, toolNames);
  const valid = cites.filter((c) => resolve(c));
  const invalid = cites.filter((c) => !resolve(c));

  const unsupportedNumbers: Grounding['unsupportedNumbers'] = [];
  let numbersChecked = 0;
  for (const block of blocks(answer)) {
    const cited = citationsOf(block, toolNames).map(resolve).filter((x): x is string => Boolean(x));
    // The block's evidence: every tool result that returned one of its citations.
    const evidence = results.filter((r) => cited.some((c) => r.ids.has(c))).map((r) => r.text).join('\n');
    for (const line of block.split('\n')) {
      for (const n of numbersIn(line)) {
        numbersChecked++;
        if (!cited.length || !figureIn(n, evidence)) unsupportedNumbers.push({ number: n, sentence: line.trim().slice(0, 160) });
      }
    }
  }

  const declined = DECLINE_OPENING.test(answer) && valid.length === 0 && numbersChecked === 0;
  const status: GroundingStatus = invalid.length ? 'invalid-citation'
    : unsupportedNumbers.length ? 'unsupported-number'
    : declined ? 'abstained'
    : valid.length ? 'supported' : 'uncited';
  return { status, grounded: status === 'supported' || status === 'abstained', valid, invalid, unsupportedNumbers, numbersChecked, declined, prose: 'model-written' };
}

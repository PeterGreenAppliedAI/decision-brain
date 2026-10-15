/**
 * What code can establish about an agent's answer — and nothing more. Three separate checks, each
 * named for what it actually verifies:
 *
 *  - citations: every [id] names something a tool returned during this run (a decision id, a commit,
 *    a file). It does NOT show the cited item supports the sentence.
 *  - numbers: every figure ("0/20", "92%", "33.9s") appears in a tool result that contained a citation
 *    from the same block (paragraph, or list with its sub-items); a figure in a block with no citation
 *    is unsupported. This catches invented or altered measurements — the most damaging wrong answer.
 *  - abstention: the answer opens by declining; anything it then cites or states is still checked.
 *
 * Everything else an answer says is model-written prose that code has not verified, and the result
 * says so (`prose: 'model-written'`). A model-based entailment check, if added, is a separate label.
 */
import type { Step } from '../../lib/loop.js';

export type GroundingStatus = 'supported' | 'abstained' | 'invalid-citation' | 'unsupported-number' | 'unverified-premise-figure' | 'uncited';

export interface Grounding {
  status: GroundingStatus;
  /** Convenience: status is 'supported' or 'abstained'. */
  grounded: boolean;
  valid: string[];
  invalid: string[];
  /** Figures not found in the evidence of the sentence that states them (or stated with no citation). */
  unsupportedNumbers: Array<{ number: string; sentence: string }>;
  /**
   * Figures the answer repeats from the question that the evidence does not hold. Code cannot tell
   * whether the answer rejects them ("there is no record of 20/20") or endorses them ("it scored
   * 20/20") — so they are reported as unverified, never as supported.
   */
  premiseFigures: Array<{ number: string; sentence: string }>;
  numbersChecked: number;
  declined: boolean;
  prose: 'model-written';
}

const isSha = (s: string) => /^[0-9a-f]{7,40}$/.test(s);

/** Every short string one tool result returned — ids, shas, paths, names, suggestions, contents of lists. */
function idsIn(result: string): Set<string> {
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { if (v.length <= 300) seen.add(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  try { walk(JSON.parse(result)); } catch { /* not JSON: an error message */ }
  return seen;
}

/**
 * The part of a tool response a citation actually brought: the item its id identifies — the array
 * element containing it (a search hit, a why() decision with its measurements, an experiment), or the
 * whole response when the id is not inside a list (trace, who_knows' target). Never the neighbours.
 */
export function evidenceFor(result: string, id: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(result); } catch { return ''; }
  const items: unknown[] = [];
  const holds = (v: unknown): boolean => typeof v === 'string' ? v === id || (/^[0-9a-f]{7,40}$/.test(id) && v.startsWith(id))
    : Array.isArray(v) ? v.some(holds) : v && typeof v === 'object' ? Object.values(v).some(holds) : false;
  const walk = (v: unknown, inArray: boolean): boolean => {
    if (Array.isArray(v)) { let any = false; for (const x of v) if (walk(x, true)) any = true; return any; }
    if (v && typeof v === 'object') {
      const deeper = Object.values(v).some((x) => walk(x, false));
      if (inArray && (deeper || holds(v))) { if (!deeper || !items.length) items.push(v); return true; }
      return deeper || holds(v);
    }
    if (inArray && holds(v)) { items.push(v); return true; }
    return holds(v);
  };
  const found = walk(parsed, false);
  if (!found) return '';
  return items.length ? JSON.stringify(items) : result;
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
  const out: string[] = [];
  for (const m of text.matchAll(/\[([^\]\s][^\]]{1,200})\]/g)) {
    const c = m[1].trim();
    const call = /^([a-z_]+)\s*[:(]\s*(.+?)\)?$/.exec(c);
    if (call) out.push(tools.has(call[1]) ? call[2].trim() : c);   // a tool-call form is always judged as a citation
    else if (idLike(c)) out.push(c);
  }
  return [...new Set(out)];
}

/** Only id-shaped brackets are citations — "[observed, unconfirmed]" quoted from an entry is not. */
function idLike(c: string): boolean {
  if (/\s/.test(c)) return false;
  return /^[0-9a-f]{7,40}$/.test(c) || /[-/.:_]/.test(c) && /[a-z0-9]/i.test(c);
}

/** Figures worth checking: ratios, percentages, decimals, numbers with units, and multi-digit numbers. */
export function numbersIn(sentence: string): string[] {
  const text = sentence
    .replace(/\[[^\]]*\]/g, ' ')                       // ids in citations carry dates and hashes
    .replace(/`/g, ' ')                                 // code spans are checked too — only the backticks go
    .replace(/^\s*(\d+[.)]|[-*])\s+/gm, ' ')           // list markers
    .replace(/\b[\w.-]*:\d+[\w.]*\b/g, ' ')            // model tags like gemma4:12b
    .replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, ' ')        // dates
    .replace(/\b\d+(\.\d+)?\s?[BbMm]\b(?!\s?(tokens|params))/g, ' ')   // model sizes: 7B, 12B, 421M
    .replace(/(\b(ADR|PR|RFC|issue|ticket|version|v)\s?[-#]?|#|\b[A-Z]{1,3}-?)\d+\b/gi, ' ');   // references: ADR 13, PR #42, F18, v2
  const found = text.match(/(?<![\w.])\d+(?:[.,]\d+)?(?:\s?\/\s?\d+(?:[.,]\d+)?)?\s?(?:%|×|x\b|ms\b|s\b|min\b|GB\b|MB\b|KB\b)?(?![\w.]*\w)/g) ?? [];
  return [...new Set(found.map((n) => n.replace(/\s+/g, '')).filter((n) => /[/%.×]|\d{2,}|ms|s$|min|GB|MB|KB/.test(n)))];
}

/**
 * A figure is in the evidence if the same number appears there — with the same unit when the answer
 * gives one ("20s" is not supported by "20ms"; "16/20" matches "16 / 20").
 */
function figureIn(n: string, evidence: string): boolean {
  const unit = /(%|×|x|ms|s|min|GB|MB|KB)$/.exec(n)?.[1] ?? '';
  const core = unit ? n.slice(0, -unit.length) : n;
  const num = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('/', '\\s?/\\s?');
  const unitRe = !unit ? '' : unit === 'x' || unit === '×' ? '\\s?[x×]' : `\\s?${unit}(?![a-z])`;
  return new RegExp(`(?<![\\d.])${num}(?![\\d.]*\\d)${unitRe}`).test(evidence);
}

const DECLINE_OPENING = /^\s*(i don'?t know|i do not know|the graph (has|holds|contains) no)\b/i;
/** A clause saying something is absent ("no decision records…", "never recorded") claims nothing. */
/**
 * A clause saying the RECORD is silent ("no decision records…", "never recorded", "neither mentions
 * GraphQL") claims nothing. A negative claim about the world ("the system never loses data") is a
 * claim, so negation alone does not qualify — it must be about the record.
 */
const NEGATION = /\b(no|not|never|none|nothing|neither|nor|without|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|cannot|can'?t)\b/i;
const RECORD = /\b(graph|log|record(s|ed)?|decisions?|entry|entries|ADRs?|mentions?|mentioned|documented|captured|evidence|sources?|path|rationale|searches|history)\b/i;
const absence = (clause: string) => NEGATION.test(clause) && RECORD.test(clause);


/**
 * Clauses of a declining answer that assert something without a citation: every sentence, split at
 * "but"/"however", must carry an id-shaped citation or say that something is absent.
 */
export function uncitedClaims(answer: string, toolNames: string[] = []): string[] {
  const out: string[] = [];
  for (const block of blocks(answer)) {
    const blockCited = citationsOf(block, toolNames).length > 0;
    // Sentence ends — but not after abbreviations like "e.g." / "i.e." / "etc.", which do not end one.
    for (const sentence of block.split(/(?<!\b(?:e\.g|i\.e|etc|vs|cf)\.)(?<=[.!?])\s+|\n+/)) {
      for (const clause of sentence.split(/,?\s+(?:but|however|yet|although)\s+|;\s*/i)) {
        const c = clause.trim();
        if (!c || c.length < 12) continue;
        if (/:\s*$/.test(c)) continue;                  // a lead-in ("Here is what it does record:") asserts nothing itself
        if (DECLINE_OPENING.test(c) && !/\b(but|however)\b/i.test(c)) continue;
        if (citationsOf(c, toolNames).length || (blockCited && /^\s*[-*\d]/.test(c))) continue;
        if (absence(c)) continue;
        out.push(c.slice(0, 160));
      }
    }
  }
  return out;
}

/** Blocks: paragraphs, or a list with its sub-items — the scope a citation covers. */
function blocks(answer: string): string[] {
  return answer.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

/**
 * `question`: a figure the answer repeats from the question, if the evidence does not hold it, is
 * "unverified" — code does not try to tell rejection from endorsement (word lists were tried and
 * fooled twice), so such an answer is never reported as supported.
 */
export function ground(answer: string, steps: Step[], question = ''): Grounding {
  const asked = new Set(numbersIn(question));
  const toolNames = [...new Set(steps.map((s) => s.tool))];
  const results = steps.map((s) => ({ text: s.result, ids: idsIn(s.result) }));
  const seen = new Set(results.flatMap((r) => [...r.ids]));
  const shas = [...seen].filter(isSha);
  const resolve = (c: string) => seen.has(c) ? c : isSha(c) ? shas.find((s) => s.startsWith(c)) ?? null : null;

  const cites = citationsOf(answer, toolNames);
  const valid = cites.filter((c) => resolve(c));
  const invalid = cites.filter((c) => !resolve(c));

  const unsupportedNumbers: Grounding['unsupportedNumbers'] = [];
  const premiseFigures: Grounding['premiseFigures'] = [];
  let numbersChecked = 0;
  for (const block of blocks(answer)) {
    const cited = citationsOf(block, toolNames).map(resolve).filter((x): x is string => Boolean(x));
    // The block's evidence: for each citation, the item it identifies in each response that returned it.
    const evidence = cited.flatMap((c) => results.filter((r) => r.ids.has(c)).map((r) => evidenceFor(r.text, c))).join('\n');
    for (const line of block.split('\n')) {
      for (const n of numbersIn(line)) {
        numbersChecked++;
        if (cited.length && figureIn(n, evidence)) continue;
        (asked.has(n) ? premiseFigures : unsupportedNumbers).push({ number: n, sentence: line.trim().slice(0, 160) });
      }
    }
  }

  // Declining is how the answer opens; and an abstention makes no uncited claim after that — "I don't
  // know why, but the prompt routed every request successfully" asserts something, so it is not one.
  const declinedOpening = DECLINE_OPENING.test(answer);
  const claimsAfter = declinedOpening ? uncitedClaims(answer, toolNames) : [];
  const declined = declinedOpening && claimsAfter.length === 0;
  const status: GroundingStatus = invalid.length ? 'invalid-citation'
    : unsupportedNumbers.length ? 'unsupported-number'
    : premiseFigures.length ? 'unverified-premise-figure'
    : declined ? 'abstained'
    : declinedOpening ? 'uncited'                      // declined, then asserted something without a citation
    : valid.length ? 'supported' : 'uncited';
  return { status, grounded: status === 'supported' || status === 'abstained', valid, invalid, unsupportedNumbers, premiseFigures, numbersChecked, declined, prose: 'model-written' };
}

/**
 * Grounding check for an agent's answer — code, not the model. The answer cites what it relies on
 * in brackets: [2026-09-30-the-router-…] (a decision id), [54359df] (a commit), [src/router/prompt.ts]
 * (a file). Every citation must name something a tool actually returned during this run; an answer
 * that makes claims with no valid citation is ungrounded. The graph decides what the agent may say.
 */
import type { Step } from '../../lib/loop.js';

export interface Grounding {
  valid: string[];
  invalid: string[];
  /** True when the answer cites at least one real node and nothing invented — or says it does not know. */
  grounded: boolean;
  declined: boolean;
}

const KEYS = new Set(['id', 'sha', 'short', 'path', 'key', 'name', 'file']);

/** Every id, sha, path and name that appears anywhere in the tools' JSON results. */
export function seenInSteps(steps: Step[]): Set<string> {
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
  for (const s of steps) { try { walk(JSON.parse(s.result)); } catch { /* not JSON: an error message */ } }
  return seen;
}

export function citationsOf(answer: string): string[] {
  return [...new Set([...answer.matchAll(/\[([^\]\s][^\]]{1,200})\]/g)].map((m) => m[1].trim()))];
}

const DECLINE = /\b(i don'?t know|no (path|record|decision)s? (in|for)|the graph (has|holds|contains) no)\b/i;

export function ground(answer: string, steps: Step[]): Grounding {
  const seen = seenInSteps(steps);
  const shas = [...seen].filter((x) => /^[0-9a-f]{7,40}$/.test(x));
  const known = (c: string) => seen.has(c) || (/^[0-9a-f]{7,40}$/.test(c) && shas.some((s) => s.startsWith(c)));
  const cites = citationsOf(answer);
  const valid = cites.filter(known);
  const invalid = cites.filter((c) => !known(c));
  const declined = DECLINE.test(answer);
  return { valid, invalid, declined, grounded: invalid.length === 0 && (valid.length > 0 || declined) };
}

/**
 * What a worker asks the model, and how code checks the answer. The model fills one fixed JSON shape
 * per section; every item must carry a verbatim quote, and code — never the model — decides what
 * counts as verified. Unverified items stay on the board with the reason, and are never promoted.
 */
import type { FindingRow } from '../board/board.js';

export interface IndexEntry { id: string; date: string | null; title: string }

export interface Extraction {
  measurements: Array<{ metric: string; value: string; quote: string }>;
  experiments: Array<{ hypothesis: string; verdict: 'confirmed' | 'disproven' | 'inconclusive'; quote: string }>;
  concepts: string[];
  models: string[];
  references: Array<{ target_id: string; relation: 'supersedes' | 'revises' | 'disproves'; quote: string }>;
}

export interface HandoffVerdict { confirmed: boolean; quote: string; reason: string }

const str = { type: 'string' };
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const EXTRACTION_SCHEMA = obj({
  measurements: { type: 'array', items: obj({ metric: str, value: str, quote: str }) },
  experiments: { type: 'array', items: obj({ hypothesis: str, verdict: { enum: ['confirmed', 'disproven', 'inconclusive'] }, quote: str }) },
  concepts: { type: 'array', items: str },
  models: { type: 'array', items: str },
  references: { type: 'array', items: obj({ target_id: str, relation: { enum: ['supersedes', 'revises', 'disproves'] }, quote: str }) },
});

export const HANDOFF_SCHEMA = obj({ confirmed: { type: 'boolean' }, quote: str, reason: str });

/** Caps on what one section may contribute — a flood of items is a sign of a bad extraction. */
export const LIMITS = { measurements: 8, experiments: 5, concepts: 6, models: 6, references: 4 };

/**
 * The system prompt carries the index of every entry, so it is identical across calls (the server's
 * prefix cache reuses it) and a cross-reference names an id code can check, not free text.
 */
export function extractionSystem(index: IndexEntry[]): string {
  return [
    'You read one entry from an engineering decision log and extract facts into a fixed JSON shape.',
    'Rules:',
    '- Every item needs "quote": an exact, verbatim span copied from the entry (one sentence or less). If you cannot quote it, leave the item out.',
    '- measurements: a measured result with a number (a score, a ratio like 16/20, a latency, a count). "value" must appear inside "quote".',
    '- experiments: something that was tried or hypothesized and then judged — confirmed, disproven, or inconclusive.',
    '- concepts: up to 6 short technical topics the entry is about, using words that appear in the entry.',
    '- models: model names mentioned (e.g. qwen3.5:9b), exactly as written.',
    '- references: ONLY when the entry says it supersedes, revises (changes or reverses), or disproves another entry listed below. Use that entry\'s id as target_id. Do not reference an entry for merely being related.',
    '- Empty arrays are correct when the entry has nothing of that kind. Do not invent.',
    '',
    'Entries in the log (id — date — title):',
    ...index.map((e) => `${e.id} — ${e.date ?? 'undated'} — ${e.title}`),
  ].join('\n');
}

export function extractionUser(section: { id: string; title: string; body: string }): string {
  return `Entry id: ${section.id}\nTitle: ${section.title}\n\n${section.body}`;
}

export function handoffSystem(): string {
  return [
    'Another reader claims that one entry of an engineering decision log supersedes, revises, or disproves an older entry.',
    'You are given the claim, with its quote from the newer entry, and the full text of the OLDER entry.',
    'Decide whether the claim holds: does the older entry contain the decision, belief or result that the newer one replaces, changes or refutes?',
    'Answer "confirmed": true only if you can quote, verbatim from the OLDER entry, the specific statement being superseded/revised/disproved.',
    'Otherwise answer false and leave "quote" empty. "reason": one sentence.',
  ].join('\n');
}

export function handoffUser(h: { relation: string; source: { id: string; title: string }; quote: string; target: { id: string; title: string; body: string } }): string {
  return [
    `Claim: "${h.source.title}" (${h.source.id}) ${h.relation} "${h.target.title}" (${h.target.id}).`,
    `Quote from the newer entry: "${h.quote}"`,
    '',
    `OLDER entry (${h.target.id}): ${h.target.title}`,
    h.target.body,
  ].join('\n');
}

/** Compare text the way a reader would: case, whitespace, markdown emphasis and curly quotes don't matter. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[*_`]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

const MIN_QUOTE = 12;

function quoteCheck(quote: string, body: string): string | null {
  if (!quote || normalize(quote).length < MIN_QUOTE) return 'quote too short';
  if (!normalize(body).includes(normalize(quote))) return 'quote not found verbatim in the entry';
  return null;
}

/** Turn a model's extraction into board findings, each checked by code. */
export function verifyExtraction(x: Extraction, section: { id: string; body: string }, index: IndexEntry[]): FindingRow[] {
  const out: FindingRow[] = [];
  const body = normalize(section.body);
  const ids = new Set(index.map((e) => e.id));

  for (const m of (x.measurements ?? []).slice(0, LIMITS.measurements)) {
    const reason = quoteCheck(m.quote, section.body)
      ?? (!m.value || !normalize(m.quote).includes(normalize(m.value)) ? 'value not inside its quote' : null)
      ?? (!/\d/.test(m.value) ? 'value has no number' : null);
    out.push({ kind: 'measurement', data: { metric: m.metric, value: m.value }, quote: m.quote, verified: !reason, reason });
  }
  for (const e of (x.experiments ?? []).slice(0, LIMITS.experiments)) {
    const reason = quoteCheck(e.quote, section.body);
    out.push({ kind: 'experiment', data: { hypothesis: e.hypothesis, verdict: e.verdict }, quote: e.quote, verified: !reason, reason });
  }
  const seen = new Set<string>();
  for (const [kind, list, cap] of [['concept', x.concepts, LIMITS.concepts], ['model', x.models, LIMITS.models]] as const) {
    for (const raw of (list ?? []).slice(0, cap)) {
      const name = raw.trim();
      const key = `${kind}:${normalize(name)}`;
      if (!name || seen.has(key)) continue;           // the same item twice from one reader is one item
      seen.add(key);
      const reason = name.length < 2 || name.length > 60 ? 'bad length'
        : !body.includes(normalize(name)) ? 'not in the entry text' : null;
      out.push({ kind, data: { name }, quote: null, verified: !reason, reason });
    }
  }
  for (const r of (x.references ?? []).slice(0, LIMITS.references)) {
    const reason = !ids.has(r.target_id) ? 'target id not in the log'
      : r.target_id === section.id ? 'an entry cannot reference itself'
      : quoteCheck(r.quote, section.body);
    out.push({ kind: 'cross_ref', data: { target: r.target_id, relation: r.relation }, quote: r.quote,
      verified: !reason, reason, target: r.target_id, relation: r.relation });
  }
  return out;
}

/** A second agent's verdict counts as confirmation only if its quote is really in the target. */
export function verifyHandoff(v: HandoffVerdict, targetBody: string): { confirmed: boolean; quote: string | null; reason: string } {
  if (!v.confirmed) return { confirmed: false, quote: null, reason: v.reason || 'not confirmed' };
  const bad = quoteCheck(v.quote, targetBody);
  return bad
    ? { confirmed: false, quote: null, reason: `claimed confirmed, but ${bad}` }
    : { confirmed: true, quote: v.quote, reason: v.reason };
}

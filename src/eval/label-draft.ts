/**
 * npm run eval:draft — model-DRAFTED labels, not ground truth. For each question, the local model
 * reads each candidate decision's full text on its own and says whether a good answer must rest on
 * it, quoting the sentence that makes it relevant; code checks the quote is really in the entry.
 * Trap questions also get a premise judgement with a quote. Ownership questions are labelled from
 * git alone (the people with the most commits on the file). The result is written into
 * eval/LABELS.md as "labelled: draft" — a person (or a reviewer who has not seen the agent's results)
 * must still confirm each question before it counts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { connect } from '../graph/db.js';
import { createJsonClient } from '../llm/openai.js';
import { normalize } from '../team/extract.js';
import { whoKnows } from '../tools/graph-tools.js';
import { loadQuestions, parseLabels } from './labels.js';

const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const RELEVANCE = obj({ relevant: { type: 'boolean' }, quote: { type: 'string' }, reason: { type: 'string' } });
const PREMISE = obj({ premise_false: { type: 'boolean' }, quote: { type: 'string' }, reason: { type: 'string' } });

const RELEVANCE_SYSTEM = [
  'You judge whether one entry of an engineering decision log is evidence a good answer to a question MUST rest on.',
  'Relevant = the entry directly records the decision, measurement, experiment or reasoning the question asks about.',
  'Merely mentioning the same words or a related topic is NOT relevant.',
  'If relevant, "quote": copy verbatim the one sentence (or shorter span) from the entry that makes it relevant. If not, "quote": "".',
  '"reason": one short sentence.',
].join('\n');
const PREMISE_SYSTEM = [
  'A question may assume something false. Given the question and the log entries that bear on it, decide whether its premise is false.',
  'If false, "quote": copy verbatim the span from the entries that contradicts it. If not false, "quote": "". "reason": one sentence.',
].join('\n');

const cap = (s: string, n = 6000) => (s.length > n ? `${s.slice(0, n)} …` : s);

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const md = readFileSync('eval/LABELS.md', 'utf8');
const llm = createJsonClient();
const db = await connect();
const blocks = md.split(/^(?=## )/m);
const out: string[] = [];
for (const block of blocks) {
  const head = /^## (\S+) · (\w+) · (\S+)/.exec(block);
  if (!head) { out.push(block); continue; }
  const [, id, kind, graphName] = head;
  if (parseLabels(block).get(id)?.labelled) { out.push(block); continue; }       // a confirmed label is never overwritten
  const q = loadQuestions().find((x) => x.id === id)!;
  const g = db.selectGraph(graphName);
  const candidates = [...block.matchAll(/^- \[[ xX]\] `([^`]+)`/gm)].map((m) => m[1]);
  const bodies = new Map(((await g.roQuery<{ id: string; title: string; body: string }>(
    'MATCH (d:Decision) WHERE d.id IN $ids RETURN d.id AS id, d.title AS title, d.body AS body', { params: { ids: candidates } })).data ?? [])
    .map((d) => [d.id, d]));
  const verdicts = new Map<string, { relevant: boolean; quote: string; reason: string; quoteOk: boolean }>();
  await pool(candidates, 4, async (cid) => {
    const d = bodies.get(cid);
    if (!d) return;
    const r = await llm.json<{ relevant: boolean; quote: string; reason: string }>({ system: RELEVANCE_SYSTEM, schema: RELEVANCE, schemaName: 'relevance', maxTokens: 1024,
      user: `Question: ${q.question}\n\nEntry (${d.id}): ${d.title}\n\n${cap(d.body ?? '')}` });
    const quoteOk = !r.value.relevant || (normalize(r.value.quote).length >= 12 && normalize(`${d.title} ${d.body}`).includes(normalize(r.value.quote)));
    verdicts.set(cid, { ...r.value, quoteOk });
  });
  let premise: { premise_false: boolean; quote: string; reason: string } | null = null;
  if (kind === 'trap') {
    const rel = candidates.filter((c) => verdicts.get(c)?.relevant && verdicts.get(c)?.quoteOk).map((c) => bodies.get(c)!);
    premise = (await llm.json<{ premise_false: boolean; quote: string; reason: string }>({ system: PREMISE_SYSTEM, schema: PREMISE, schemaName: 'premise', maxTokens: 1024,
      user: `Question: ${q.question}\n\n${rel.map((d) => `Entry (${d.id}): ${d.title}\n${cap(d.body ?? '', 3000)}`).join('\n\n') || '(no relevant entries)'}` })).value;
  }
  let reviewers: string[] = [];
  if (kind === 'people') {
    const file = /\b([\w./-]+\.\w+)\b/.exec(q.question)?.[1] ?? '';
    reviewers = (await whoKnows(g, file, 3)).people.map((p) => p.name);
  }
  // Rewrite the block: ticks from the draft, each annotated with the model's quote and whether code found it.
  const lines = block.split('\n').map((line) => {
    const m = /^- \[[ xX]\] `([^`]+)`(.*)$/.exec(line);
    if (m) {
      const v = verdicts.get(m[1]);
      const tick = v?.relevant && v.quoteOk ? 'x' : ' ';
      const note = !v ? '' : v.relevant ? (v.quoteOk ? `\n  - draft: "${v.quote.slice(0, 200)}"` : `\n  - draft said relevant, but its quote is not in the entry — not ticked`) : '';
      return `- [${tick}] \`${m[1]}\`${m[2]}${note}`;
    }
    if (/should abstain/.test(line)) {
      const any = [...verdicts.values()].some((v) => v.relevant && v.quoteOk);
      return `- [${any ? ' ' : 'x'}] should abstain — nothing in the graph answers this${any ? ' (draft: a candidate was judged relevant)' : ''}`;
    }
    if (/correct the premise/.test(line) && premise) {
      return `- [${premise.premise_false ? 'x' : ' '}] should correct the premise\n  - draft: ${premise.reason}${premise.quote ? ` — "${premise.quote.slice(0, 200)}"` : ''}`;
    }
    if (/^reviewers:/.test(line) && kind === 'people') return `reviewers: ${reviewers.join(', ')}\n  - from git: most commits on the file`;
    if (/^labelled:/.test(line)) return 'labelled: draft';
    return line;
  });
  out.push(lines.join('\n'));
  console.log(`${id}: ${[...verdicts.values()].filter((v) => v.relevant && v.quoteOk).length} relevant of ${candidates.length}${premise ? ` · premise false: ${premise.premise_false}` : ''}`);
}
writeFileSync('eval/LABELS.md', out.join(''));
console.log('wrote eval/LABELS.md (labelled: draft — confirm each question before it counts)');
await db.close();

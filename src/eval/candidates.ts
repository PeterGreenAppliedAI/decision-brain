/**
 * npm run eval:candidates — writes eval/LABELS.md for a human to label. Candidates are pooled from the
 * baseline and the brain's search, so the labeller chooses rather than hunts; anything missing can be
 * added by id. Existing ticks in LABELS.md are kept when it is regenerated.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from '../graph/db.js';
import { search } from '../tools/graph-tools.js';
import { baselineSearch } from './baseline.js';
import { loadQuestions, parseLabels } from './labels.js';

const OUT = 'eval/LABELS.md';
const previous = existsSync(OUT) ? parseLabels(readFileSync(OUT, 'utf8')) : new Map();
const db = await connect();
const lines = [
  '# Evaluation labels',
  '',
  'For each question, tick (`[x]`) every decision a good answer must rest on. Add missing ones on an',
  '`add:` line by id (`npm run trace -- --graph <g> --find "<words>"` finds ids). For **abstain**',
  'questions, tick "should abstain" if nothing in the graph answers it; for **trap** questions, tick',
  '"should correct the premise" if the question assumes something false. For **people**, list who',
  'should review on a `reviewers:` line. Mark each question `labelled: yes` when done.',
  '',
  'These labels are the ground truth — the system never grades itself.',
  '',
];
for (const q of loadQuestions()) {
  const g = db.selectGraph(q.graph);
  const prev = previous.get(q.id);
  const base = await baselineSearch(g, q.question, 8);
  const brain = await search(g, q.question, 8);
  const pool = new Map<string, { title: string; date: string | null; from: string[] }>();
  const titles = new Map(((await g.roQuery<{ id: string; title: string; date: string | null }>('MATCH (d:Decision) RETURN d.id AS id, d.title AS title, d.date AS date')).data ?? [])
    .map((d) => [d.id, d]));
  for (const b of base) pool.set(b.id, { title: b.title, date: titles.get(b.id)?.date ?? null, from: ['keyword'] });
  for (const b of brain) { const p = pool.get(b.id); if (p) p.from.push('search'); else pool.set(b.id, { title: b.title, date: b.date, from: ['search'] }); }
  for (const id of prev?.relevant ?? []) if (!pool.has(id)) pool.set(id, { title: titles.get(id)?.title ?? '(not in graph)', date: titles.get(id)?.date ?? null, from: ['added'] });

  lines.push(`## ${q.id} · ${q.kind} · ${q.graph}`, '', `> ${q.question}`, '');
  if (q.kind === 'abstain') lines.push(`- [${prev?.abstain ? 'x' : ' '}] should abstain — nothing in the graph answers this`);
  if (q.kind === 'trap') lines.push(`- [${prev?.correctPremise ? 'x' : ' '}] should correct the premise`);
  for (const [id, c] of pool) lines.push(`- [${prev?.relevant.includes(id) ? 'x' : ' '}] \`${id}\` — ${c.title} (${c.date ?? 'undated'}) _${c.from.join('+')}_`);
  if (q.kind === 'people') lines.push(`reviewers: ${prev?.reviewers.join(', ') ?? ''}`);
  lines.push('add: ', `note: ${prev?.note ?? ''}`, `labelled: ${prev?.labelled ? 'yes' : 'no'}`, '');
}
writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${OUT}`);
await db.close();

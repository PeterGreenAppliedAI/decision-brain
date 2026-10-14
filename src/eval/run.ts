/**
 * npm run eval:run [-- --only inv-01,cp-02] — runs every question through the agent and the
 * baseline, saves the raw results (eval/results/<stamp>.json), and scores them against
 * eval/LABELS.md wherever a question is labelled. npm run eval:score re-scores saved results.
 *
 * Scored per question, against human labels only:
 *  - find/trap: recall and precision of the decisions cited (agent) / returned in the top 5 (baseline)
 *  - abstain: did it abstain (agent: code-checked status; baseline: returned nothing scoring)
 *  - every agent answer: invalid citations, unsupported figures
 *  - trap: whether the answer corrected the premise needs a human — RESULTS.md has a box to tick
 * Runs where the model host is reachable (the lab tmux session on this Mac).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ask } from '../agent/agent.js';
import { connect } from '../graph/db.js';
import { baselineSearch } from './baseline.js';
import { loadQuestions, parseLabels, type Label, type Question } from './labels.js';

export interface QuestionResult {
  id: string; graph: string; kind: Question['kind']; question: string;
  agent: { answer: string; status: string; cited: string[]; citedDecisions: string[]; invalid: string[]; unsupportedNumbers: string[]; tools: string[]; ms: number };
  baseline: { top: string[] };
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

export function score(results: QuestionResult[], labels: Map<string, Label>) {
  const rows: string[] = [];
  const agg = { agentRecall: [0, 0], agentPrecision: [0, 0], baseRecall: [0, 0], basePrecision: [0, 0], abstainOk: [0, 0], baseAbstainOk: [0, 0],
    invalid: 0, unsupported: 0, answers: 0, labelled: 0 };
  for (const r of results) {
    const l = labels.get(r.id);
    agg.answers++; agg.invalid += r.agent.invalid.length ? 1 : 0; agg.unsupported += r.agent.unsupportedNumbers.length ? 1 : 0;
    if (!l?.labelled) { rows.push(`| ${r.id} | ${r.kind} | _unlabelled_ | | | | ${r.agent.status} |`); continue; }
    agg.labelled++;
    if (r.kind === 'abstain') {
      const ok = l.abstain ? r.agent.status === 'abstained' : r.agent.status !== 'abstained';
      const bok = l.abstain ? r.baseline.top.length === 0 : r.baseline.top.length > 0;
      agg.abstainOk[0] += ok ? 1 : 0; agg.abstainOk[1]++; agg.baseAbstainOk[0] += bok ? 1 : 0; agg.baseAbstainOk[1]++;
      rows.push(`| ${r.id} | abstain | ${ok ? 'abstained ✓' : 'answered ✗'} | | ${bok ? '✓' : `returned ${r.baseline.top.length} ✗`} | | ${r.agent.status} |`);
      continue;
    }
    const rel = new Set(l.relevant);
    const hit = (ids: string[]) => ids.filter((i) => rel.has(i)).length;
    const a = r.agent.citedDecisions, b = r.baseline.top;
    agg.agentRecall[0] += hit(a); agg.agentRecall[1] += rel.size; agg.agentPrecision[0] += hit(a); agg.agentPrecision[1] += a.length;
    agg.baseRecall[0] += hit(b); agg.baseRecall[1] += rel.size; agg.basePrecision[0] += hit(b); agg.basePrecision[1] += b.length;
    rows.push(`| ${r.id} | ${r.kind} | ${hit(a)}/${rel.size} | ${pct(hit(a), a.length)} | ${hit(b)}/${rel.size} | ${pct(hit(b), b.length)} | ${r.agent.status} |`);
  }
  return { agg, rows };
}

export function report(results: QuestionResult[], labels: Map<string, Label>, stamp: string): string {
  const { agg, rows } = score(results, labels);
  return [
    `# Evaluation — ${stamp}`, '',
    `${agg.labelled}/${agg.answers} questions labelled. Labels are human; nothing here is self-graded.`, '',
    '| | Decision Brain (agent) | Baseline (keyword search, top 5) |', '|---|---|---|',
    `| Recall of relevant decisions | ${pct(agg.agentRecall[0], agg.agentRecall[1])} (${agg.agentRecall[0]}/${agg.agentRecall[1]}) | ${pct(agg.baseRecall[0], agg.baseRecall[1])} (${agg.baseRecall[0]}/${agg.baseRecall[1]}) |`,
    `| Precision of what it cites / returns | ${pct(agg.agentPrecision[0], agg.agentPrecision[1])} | ${pct(agg.basePrecision[0], agg.basePrecision[1])} |`,
    `| Correct on abstain questions | ${pct(agg.abstainOk[0], agg.abstainOk[1])} | ${pct(agg.baseAbstainOk[0], agg.baseAbstainOk[1])} |`,
    `| Answers with an invalid citation | ${agg.invalid}/${agg.answers} | n/a |`,
    `| Answers with an unsupported figure | ${agg.unsupported}/${agg.answers} | n/a |`, '',
    '| Question | Kind | Agent recall | Agent precision | Baseline recall | Baseline precision | Code check |', '|---|---|---|---|---|---|---|',
    ...rows, '',
    '## Trap questions — did the answer correct the false premise? (tick after reading)', '',
    ...results.filter((r) => r.kind === 'trap').flatMap((r) => [`### ${r.id}`, `> ${r.question}`, '', r.agent.answer.split('\n').map((l) => `> ${l}`).join('\n'), '', '- [ ] corrected the premise', '']),
    '## All answers', '',
    ...results.flatMap((r) => [`### ${r.id} — ${r.question}`, '', `_tools: ${r.agent.tools.join(' → ') || 'none'} · ${(r.agent.ms / 1000).toFixed(1)} s · ${r.agent.status}_`, '', r.agent.answer, '']),
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { only: { type: 'string' }, score: { type: 'boolean' } } });
  const labels = existsSync('eval/LABELS.md') ? parseLabels(readFileSync('eval/LABELS.md', 'utf8')) : new Map();
  mkdirSync('eval/results', { recursive: true });
  if (values.score) {
    const latest = readdirSync('eval/results').filter((f) => f.endsWith('.json')).sort().at(-1);
    if (!latest) { console.error('no saved results — run npm run eval:run first'); process.exit(1); }
    const results = JSON.parse(readFileSync(`eval/results/${latest}`, 'utf8')) as QuestionResult[];
    writeFileSync('eval/RESULTS.md', report(results, labels, latest.replace('.json', '')));
    console.log(`scored ${latest} → eval/RESULTS.md`);
    process.exit(0);
  }
  const only = values.only?.split(',');
  const db = await connect();
  const results: QuestionResult[] = [];
  for (const q of loadQuestions().filter((x) => !only || only.includes(x.id))) {
    const r = await ask(q.question, { graph: q.graph });
    const isDecision = new Set(((await db.selectGraph(q.graph).roQuery<{ id: string }>('MATCH (d:Decision) RETURN d.id AS id')).data ?? []).map((x) => x.id));
    results.push({
      id: q.id, graph: q.graph, kind: q.kind, question: q.question,
      agent: { answer: r.answer, status: r.grounding.status, cited: r.grounding.valid, citedDecisions: r.grounding.valid.filter((c) => isDecision.has(c)),
        invalid: r.grounding.invalid, unsupportedNumbers: r.grounding.unsupportedNumbers.map((u) => u.number), tools: r.steps.map((s) => s.tool), ms: r.ms },
      baseline: { top: (await baselineSearch(db.selectGraph(q.graph), q.question, 5)).map((b) => b.id) },
    });
    console.log(`${q.id}: ${r.grounding.status} · cited ${r.grounding.valid.length} · ${(r.ms / 1000).toFixed(1)} s`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(`eval/results/${stamp}.json`, JSON.stringify(results, null, 2));
  writeFileSync('eval/RESULTS.md', report(results, labels, stamp));
  console.log(`saved eval/results/${stamp}.json and eval/RESULTS.md`);
  await db.close();
}

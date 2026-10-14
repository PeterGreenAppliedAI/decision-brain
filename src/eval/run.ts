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
import type { Step } from '../../lib/loop.js';
import { ground } from '../agent/ground.js';
import { labelSource, loadQuestions, parseLabels, type Label, type Question } from './labels.js';

export interface QuestionResult {
  id: string; graph: string; kind: Question['kind']; question: string;
  agent: { answer: string; status: string; cited: string[]; citedDecisions: string[]; invalid: string[]; unsupportedNumbers: string[]; tools: string[]; ms: number;
    /** Saved so the code checks can be re-applied to the same answers without re-running the model. */
    steps?: Step[] };
  baseline: { top: string[] };
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

export function score(results: QuestionResult[], labels: Map<string, Label>) {
  const rows: string[] = [];
  const agg = { agentRecall: [0, 0], agentPrecision: [0, 0], baseRecall: [0, 0], basePrecision: [0, 0], abstainOk: [0, 0], baseAbstainOk: [0, 0],
    reviewers: [0, 0], invalid: 0, unsupported: 0, answers: 0, labelled: 0 };
  for (const r of results) {
    const l = labels.get(r.id);
    agg.answers++; agg.invalid += r.agent.invalid.length ? 1 : 0; agg.unsupported += r.agent.unsupportedNumbers.length ? 1 : 0;
    if (!l?.labelled) { rows.push(`| ${r.id} | ${r.kind} | _unlabelled_ | | | | ${r.agent.status} |`); continue; }
    agg.labelled++;
    if (r.kind === 'people') {
      const named = l.reviewers.filter((n) => r.agent.answer.includes(n)).length;
      agg.reviewers[0] += named; agg.reviewers[1] += l.reviewers.length;
      rows.push(`| ${r.id} | people | ${named}/${l.reviewers.length} named | | n/a | | ${r.agent.status} |`);
      continue;
    }
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

export function report(results: QuestionResult[], labels: Map<string, Label>, stamp: string, source = 'unstated'): string {
  const { agg, rows } = score(results, labels);
  return [
    `# Evaluation — ${stamp}`, '',
    `${agg.labelled}/${agg.answers} questions labelled. **Label source:** ${source}`, '',
    '| | Decision Brain (agent) | Baseline (keyword search, top 5) |', '|---|---|---|',
    `| Recall of relevant decisions | ${pct(agg.agentRecall[0], agg.agentRecall[1])} (${agg.agentRecall[0]}/${agg.agentRecall[1]}) | ${pct(agg.baseRecall[0], agg.baseRecall[1])} (${agg.baseRecall[0]}/${agg.baseRecall[1]}) |`,
    `| Precision of what it cites / returns | ${pct(agg.agentPrecision[0], agg.agentPrecision[1])} | ${pct(agg.basePrecision[0], agg.basePrecision[1])} |`,
    `| Correct on abstain questions | ${pct(agg.abstainOk[0], agg.abstainOk[1])} | ${pct(agg.baseAbstainOk[0], agg.baseAbstainOk[1])} |`,
    `| Ownership: labelled reviewers named | ${pct(agg.reviewers[0], agg.reviewers[1])} (${agg.reviewers[0]}/${agg.reviewers[1]}) | n/a |`,
    `| Answers with an invalid citation | ${agg.invalid}/${agg.answers} | n/a |`,
    `| Answers with an unsupported figure | ${agg.unsupported}/${agg.answers} | n/a |`, '',
    '_Baseline precision is over a fixed top 5, so it is low by construction; recall is the fairer comparison. The baseline cannot abstain — some word always matches._', '',
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
    // Re-apply today's code checks to the saved answers where their tool steps were saved.
    for (const r of results) if (r.agent.steps) {
      const g = ground(r.agent.answer, r.agent.steps, r.question);
      Object.assign(r.agent, { status: g.status, cited: g.valid, invalid: g.invalid, unsupportedNumbers: g.unsupportedNumbers.map((u) => u.number),
        citedDecisions: g.valid.filter((c) => r.agent.citedDecisions.includes(c) || /^\d{4}-|^adr-|^undated-/.test(c)) });
    }
    writeFileSync('eval/RESULTS.md', report(results, labels, latest.replace('.json', ''), labelSource(readFileSync('eval/LABELS.md', 'utf8'))));
    console.log(`scored ${latest} → eval/RESULTS.md`);
    process.exit(0);
  }
  const only = values.only?.split(',');
  const db = await connect();
  const results: QuestionResult[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  for (const q of loadQuestions().filter((x) => !only || only.includes(x.id))) {
    let r;
    try { r = await ask(q.question, { graph: q.graph }); } catch (err) {
      // One question failing (a model timeout) is recorded, not fatal to the run.
      console.log(`${q.id}: ERROR ${(err as Error).message.slice(0, 120)}`);
      results.push({ id: q.id, graph: q.graph, kind: q.kind, question: q.question,
        agent: { answer: `(error: ${(err as Error).message})`, status: 'error', cited: [], citedDecisions: [], invalid: [], unsupportedNumbers: [], tools: [], ms: 0 },
        baseline: { top: (await baselineSearch(db.selectGraph(q.graph), q.question, 5)).map((b) => b.id) } });
      writeFileSync(`eval/results/${stamp}.json`, JSON.stringify(results, null, 2));
      continue;
    }
    const isDecision = new Set(((await db.selectGraph(q.graph).roQuery<{ id: string }>('MATCH (d:Decision) RETURN d.id AS id')).data ?? []).map((x) => x.id));
    results.push({
      id: q.id, graph: q.graph, kind: q.kind, question: q.question,
      agent: { answer: r.answer, status: r.grounding.status, cited: r.grounding.valid, citedDecisions: r.grounding.valid.filter((c) => isDecision.has(c)),
        invalid: r.grounding.invalid, unsupportedNumbers: r.grounding.unsupportedNumbers.map((u) => u.number), tools: r.steps.map((s) => s.tool), ms: r.ms, steps: r.steps },
      baseline: { top: (await baselineSearch(db.selectGraph(q.graph), q.question, 5)).map((b) => b.id) },
    });
    console.log(`${q.id}: ${r.grounding.status} · cited ${r.grounding.valid.length} · ${(r.ms / 1000).toFixed(1)} s`);
    writeFileSync(`eval/results/${stamp}.json`, JSON.stringify(results, null, 2));   // saved after every question
  }
  writeFileSync(`eval/results/${stamp}.json`, JSON.stringify(results, null, 2));
  writeFileSync('eval/RESULTS.md', report(results, labels, stamp, existsSync('eval/LABELS.md') ? labelSource(readFileSync('eval/LABELS.md', 'utf8')) : 'unstated'));
  console.log(`saved eval/results/${stamp}.json and eval/RESULTS.md`);
  await db.close();
}

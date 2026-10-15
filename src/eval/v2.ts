/**
 * npm run eval:v2 -- run      runs eval/v2/set.json: the agent, the same model on keyword-retrieved
 *                             entries, and raw keyword retrieval; writes eval/v2/results/<stamp>.json
 *                             and a BLIND judging sheet (answers as A/B, seeded shuffle; key kept apart)
 * npm run eval:v2 -- score    reads the ticked sheet, unblinds, writes eval/v2/RESULTS.md
 *
 * Frozen before any run (eval/v2/SPEC.md): questions, labels, key facts, repository revisions, model
 * settings, scoring rules. Runs where the model host is reachable (the lab tmux session).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ask } from '../agent/agent.js';
import { connect } from '../graph/db.js';
import { baselineSearch } from './baseline.js';
import { ragAnswer } from './rag.js';

interface Q { id: string; graph: string; kind: 'find' | 'trap' | 'abstain'; question: string; required: string[]; supporting: string[]; keyFacts: string[]; mustNot: string[] }
interface Sys { answer: string; status: string; cited: string[]; figuresFlagged: string[]; premiseFigures: string[]; ms: number; toolCalls?: number }
interface Row { id: string; graph: string; kind: Q['kind']; question: string; agent: Sys; rag: Sys & { retrieved: string[] }; keyword: { top: string[]; ms: number } }

const SET = 'eval/v2/set.json', DIR = 'eval/v2/results';
const set = JSON.parse(readFileSync(SET, 'utf8')) as { questions: Q[] };
const { positionals } = parseArgs({ allowPositionals: true });
const mode = positionals[0] ?? 'run';

/** Deterministic A/B order per question, from the run stamp — so the judge cannot learn which side is which. */
const agentIsA = (stamp: string, id: string) => createHash('sha1').update(`${stamp}|${id}`).digest()[0] % 2 === 0;

function sheet(stamp: string, rows: Row[]): string {
  const out = [`# Blind judging — ${stamp}`, '',
    'For each question, read both answers against the key facts. Tick a fact only if the answer states it',
    'correctly — numbers must describe the right outcome. Tick a must-not if the answer says it. For trap',
    'questions, tick "corrected the premise" only if the answer says the premise is false. Do not open the',
    'key file before every question is judged.', ''];
  for (const r of rows) {
    const q = set.questions.find((x) => x.id === r.id)!;
    const [A, B] = agentIsA(stamp, r.id) ? [r.agent, r.rag] : [r.rag, r.agent];
    out.push(`## ${r.id} · ${r.kind}`, '', `> ${r.question}`, '');
    for (const [name, s] of [['A', A], ['B', B]] as const) {
      out.push(`### Answer ${name}`, '', s.answer.split('\n').map((l) => `> ${l}`).join('\n'), '');
      q.keyFacts.forEach((f, i) => out.push(`- [ ] ${name}.fact${i + 1}: ${f}`));
      q.mustNot.forEach((f, i) => out.push(`- [ ] ${name}.wrong${i + 1}: says "${f}"`));
      if (r.kind === 'trap') out.push(`- [ ] ${name}.premise: corrected the premise`);
      if (r.kind === 'abstain') out.push(`- [ ] ${name}.abstained: declined without inventing a reason`);
      out.push('');
    }
  }
  return out.join('\n');
}

if (mode === 'run') {
  mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const db = await connect();
  const rows: Row[] = [];
  for (const q of set.questions) {
    const g = db.selectGraph(q.graph);
    let agent: Sys;
    try {
      const r = await ask(q.question, { graph: q.graph });
      agent = { answer: r.answer, status: r.grounding.status, cited: r.grounding.valid, figuresFlagged: r.grounding.unsupportedNumbers.map((u) => u.number),
        premiseFigures: r.grounding.premiseFigures.map((u) => u.number), ms: r.ms, toolCalls: r.steps.length };
    } catch (err) { agent = { answer: `(error: ${(err as Error).message})`, status: 'error', cited: [], figuresFlagged: [], premiseFigures: [], ms: 0, toolCalls: 0 }; }
    let rag: Row['rag'];
    try {
      const r = await ragAnswer(g, q.question);
      rag = { answer: r.answer, status: r.grounding.status, cited: r.grounding.valid, figuresFlagged: r.grounding.unsupportedNumbers.map((u) => u.number),
        premiseFigures: r.grounding.premiseFigures.map((u) => u.number), ms: r.ms, retrieved: r.retrieved };
    } catch (err) { rag = { answer: `(error: ${(err as Error).message})`, status: 'error', cited: [], figuresFlagged: [], premiseFigures: [], ms: 0, retrieved: [] }; }
    const t0 = Date.now();
    const top = (await baselineSearch(g, q.question, 5)).map((b) => b.id);
    rows.push({ id: q.id, graph: q.graph, kind: q.kind, question: q.question, agent, rag, keyword: { top, ms: Date.now() - t0 } });
    console.log(`${q.id}: agent ${agent.status} ${(agent.ms / 1000).toFixed(1)}s · rag ${rag.status} ${(rag.ms / 1000).toFixed(1)}s`);
    writeFileSync(`${DIR}/${stamp}.json`, JSON.stringify(rows, null, 2));
  }
  writeFileSync(`${DIR}/${stamp}.key.json`, JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, agentIsA(stamp, r.id) ? 'A=agent' : 'A=rag']))));
  writeFileSync('eval/v2/JUDGING.md', sheet(stamp, rows));
  console.log(`saved ${DIR}/${stamp}.json; blind sheet eval/v2/JUDGING.md (key: ${DIR}/${stamp}.key.json — do not open before judging)`);
  await db.close();
} else if (mode === 'score') {
  const stamp = readdirSync(DIR).filter((f) => /^\d.*\.json$/.test(f) && !f.endsWith('.key.json')).sort().at(-1)!.replace('.json', '');
  const rows = JSON.parse(readFileSync(`${DIR}/${stamp}.json`, 'utf8')) as Row[];
  const md = readFileSync('eval/v2/JUDGING.md', 'utf8');
  const ticked = (qid: string, label: string) => new RegExp(`^## ${qid} [\\s\\S]*?^- \\[[xX]\\] ${label.replace('.', '\\.')}[:\\s]`, 'm').test(md.split(/^(?=## )/m).find((b) => b.startsWith(`## ${qid} `)) ?? '');
  const sys = { agent: { req: [0, 0], sup: [0, 0], correct: [0, 0], premise: [0, 0], abstain: [0, 0], flagged: 0, ms: [] as number[], tools: [] as number[] },
    rag: { req: [0, 0], sup: [0, 0], correct: [0, 0], premise: [0, 0], abstain: [0, 0], flagged: 0, ms: [] as number[], tools: [] as number[] },
    keyword: { req: [0, 0], sup: [0, 0] } };
  const lines: string[] = [];
  for (const r of rows) {
    const q = set.questions.find((x) => x.id === r.id)!;
    const side = (s: 'agent' | 'rag') => (agentIsA(stamp, r.id) === (s === 'agent') ? 'A' : 'B');
    const cell: string[] = [];
    for (const s of ['agent', 'rag'] as const) {
      const a = r[s]; const S = sys[s]; const L = side(s);
      S.ms.push(a.ms); if (s === 'agent') S.tools.push(a.toolCalls ?? 0);
      S.flagged += a.figuresFlagged.length ? 1 : 0;
      S.req[0] += q.required.filter((x) => a.cited.includes(x)).length; S.req[1] += q.required.length;
      S.sup[0] += q.supporting.filter((x) => a.cited.includes(x)).length; S.sup[1] += q.supporting.length;
      if (q.kind === 'abstain') { const ok = ticked(r.id, `${L}.abstained`); S.abstain[0] += ok ? 1 : 0; S.abstain[1]++; cell.push(ok ? 'abstained ✓' : '✗'); continue; }
      const facts = q.keyFacts.every((_, i) => ticked(r.id, `${L}.fact${i + 1}`));
      const wrong = q.mustNot.some((_, i) => ticked(r.id, `${L}.wrong${i + 1}`));
      const correct = facts && !wrong; S.correct[0] += correct ? 1 : 0; S.correct[1]++;
      if (q.kind === 'trap') { const p = ticked(r.id, `${L}.premise`); S.premise[0] += p ? 1 : 0; S.premise[1]++; }
      cell.push(`${correct ? 'correct' : 'not correct'}${q.kind === 'trap' ? (ticked(r.id, `${L}.premise`) ? ', premise ✓' : ', premise ✗') : ''} · req ${q.required.filter((x) => a.cited.includes(x)).length}/${q.required.length}`);
    }
    sys.keyword.req[0] += q.required.filter((x) => r.keyword.top.includes(x)).length; sys.keyword.req[1] += q.required.length;
    sys.keyword.sup[0] += q.supporting.filter((x) => r.keyword.top.includes(x)).length; sys.keyword.sup[1] += q.supporting.length;
    lines.push(`| ${r.id} | ${r.kind} | ${cell[0]} | ${cell[1]} | ${q.required.filter((x) => r.keyword.top.includes(x)).length}/${q.required.length} in top 5 |`);
  }
  const pct = ([n, d]: number[]) => (d ? `${Math.round((100 * n) / d)}% (${n}/${d})` : '—');
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? `${(s[Math.floor(s.length / 2)] / 1000).toFixed(1)} s` : '—'; };
  writeFileSync('eval/v2/RESULTS.md', [
    `# Evaluation v2 — ${stamp}`, '', 'Frozen set: eval/v2/set.json · spec: eval/v2/SPEC.md · judged blind (eval/v2/JUDGING.md), then unblinded.', '',
    '| | Decision Brain (agent) | Same model, keyword-retrieved entries | Keyword retrieval only |', '|---|---|---|---|',
    `| Required evidence cited / retrieved | ${pct(sys.agent.req)} | ${pct(sys.rag.req)} | ${pct(sys.keyword.req)} (in top 5) |`,
    `| Supporting evidence cited / retrieved | ${pct(sys.agent.sup)} | ${pct(sys.rag.sup)} | ${pct(sys.keyword.sup)} |`,
    `| Correct answers (all key facts, nothing wrong) | ${pct(sys.agent.correct)} | ${pct(sys.rag.correct)} | n/a |`,
    `| False premises corrected | ${pct(sys.agent.premise)} | ${pct(sys.rag.premise)} | n/a |`,
    `| Correct abstentions | ${pct(sys.agent.abstain)} | ${pct(sys.rag.abstain)} | n/a |`,
    `| Answers with a figure flagged by the checker | ${sys.agent.flagged}/${rows.length} | ${sys.rag.flagged}/${rows.length} | n/a |`,
    `| Median latency | ${med(sys.agent.ms)} | ${med(sys.rag.ms)} | — |`,
    `| Median tool calls | ${sys.agent.tools.length ? [...sys.agent.tools].sort((a, b) => a - b)[Math.floor(sys.agent.tools.length / 2)] : '—'} | 0 (one model call) | — |`, '',
    '| Question | Kind | Agent | Same model + keyword | Keyword only |', '|---|---|---|---|---|', ...lines, '',
  ].join('\n'));
  console.log('wrote eval/v2/RESULTS.md');
}

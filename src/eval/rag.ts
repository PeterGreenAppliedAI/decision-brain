/**
 * The second baseline: the same model answering from keyword-retrieved entries — no graph, no tools.
 * It isolates what the graph contributes: same model, same settings, same citation rules, same code
 * checks; only the way evidence is found differs.
 */
import type { Step } from '../../lib/loop.js';
import { ground, type Grounding } from '../agent/ground.js';
import { config } from '../config.js';
import type { Graph } from '../graph/db.js';
import { createOpenAiChat } from '../llm/openai-chat.js';
import { baselineSearch } from './baseline.js';

export const RAG_SYSTEM = `You answer questions about why a codebase is the way it is, using ONLY the decision-log entries given below.
- Answer only from those entries. Never add facts from your own knowledge.
- Cite every claim with the entry's id in square brackets, e.g. [2026-09-30-some-title] or [adr-0013].
- Copy numbers exactly as the entries give them.
- If the entries do not answer the question, say "I don't know — the entries have nothing on this." Do not guess.
- Be brief: a few sentences or a short list.`;

export interface RagResult { answer: string; retrieved: string[]; grounding: Grounding; ms: number }

export async function ragAnswer(g: Graph, question: string, k = 5, cap = 2500): Promise<RagResult> {
  const started = Date.now();
  const top = await baselineSearch(g, question, k);
  const entries = (await g.roQuery<{ id: string; title: string; date: string | null; status: string; body: string }>(
    'MATCH (d:Decision) WHERE d.id IN $ids RETURN d.id AS id, d.title AS title, d.date AS date, d.status AS status, d.body AS body',
    { params: { ids: top.map((t) => t.id) } })).data ?? [];
  const ordered = top.map((t) => entries.find((e) => e.id === t.id)!).filter(Boolean);
  const text = ordered.map((e) => ({ id: e.id, title: e.title, date: e.date, status: e.status, text: (e.body ?? '').slice(0, cap) }));
  const user = `Question: ${question}\n\n${text.map((e) => `[${e.id}] ${e.title} (${e.date ?? 'undated'}, ${e.status})\n${e.text}`).join('\n\n---\n\n') || '(no entries matched)'}`;
  const res = await createOpenAiChat().chat({ model: config.llmModel, messages: [{ role: 'system', content: RAG_SYSTEM }, { role: 'user', content: user }] });
  // The retrieved entries are this answer's only "tool result": the same checks apply.
  const steps: Step[] = [{ tool: 'keyword_retrieve', args: { question }, result: JSON.stringify(text) }];
  const answer = res.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { answer, retrieved: ordered.map((e) => e.id), grounding: ground(answer, steps, question), ms: Date.now() - started };
}

/**
 * The baseline Decision Brain must beat: simply searching the decision log. Each entry is scored by
 * how often the question's words occur in it (title words count triple) — keyword search, no graph,
 * no model. If the brain cannot beat this, it should not claim to.
 */
import type { Graph } from '../graph/db.js';

const STOP = new Set(('the a an and or of to in on for with is are was were be been it its this that these those why how what which who when ' +
  'does did do done can could should would will we our you your they their there here from into than then as at by about after before ' +
  'now still used use using make made change changed changes get got has have had not no only also just over under more most less').split(' '));

export const terms = (q: string) => [...new Set((q.toLowerCase().match(/[a-z0-9][a-z0-9_.:/-]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];

export async function baselineSearch(g: Graph, question: string, k = 5): Promise<Array<{ id: string; title: string; score: number }>> {
  const words = terms(question);
  const entries = (await g.roQuery<{ id: string; title: string; body: string }>('MATCH (d:Decision) RETURN d.id AS id, d.title AS title, d.body AS body')).data ?? [];
  const count = (text: string, w: string) => text.split(w).length - 1;
  return entries
    .map((e) => ({ id: e.id, title: e.title, score: words.reduce((s, w) => s + 3 * count(e.title.toLowerCase(), w) + count((e.body ?? '').toLowerCase(), w), 0) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k);
}

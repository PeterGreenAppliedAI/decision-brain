/**
 * The labelling file: npm run eval:candidates writes eval/LABELS.md — each question with candidate
 * decisions pooled from the baseline and the brain's own search, as checkboxes — for a human to tick.
 * npm run eval:run reads it back. Labels come from a person; the system never grades itself.
 */
import { readFileSync } from 'node:fs';

export interface Question { id: string; graph: string; kind: 'find' | 'trap' | 'abstain' | 'people'; question: string }
export interface Label { id: string; relevant: string[]; abstain: boolean; correctPremise: boolean; reviewers: string[]; labelled: boolean; note: string }

export function loadQuestions(path = 'eval/questions.json'): Question[] {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Parse LABELS.md: "- [x] `decision-id`" lines, "- [x] should abstain", "- [x] should correct the premise", "reviewers: a, b", "add: id, id", "labelled: yes". */
export function parseLabels(md: string): Map<string, Label> {
  const out = new Map<string, Label>();
  let cur: Label | null = null;
  for (const line of md.split('\n')) {
    const h = /^## (\S+)/.exec(line);
    if (h) { cur = { id: h[1], relevant: [], abstain: false, correctPremise: false, reviewers: [], labelled: false, note: '' }; out.set(h[1], cur); continue; }
    if (!cur) continue;
    const box = /^- \[([ xX])\]\s+(.*)$/.exec(line.trim());
    if (box) {
      const on = box[1].toLowerCase() === 'x';
      const id = /`([^`]+)`/.exec(box[2])?.[1];
      if (on && id) cur.relevant.push(id);
      if (/should abstain/i.test(box[2])) cur.abstain = on;
      if (/correct the premise/i.test(box[2])) cur.correctPremise = on;
      continue;
    }
    const add = /^add:\s*(.+)$/i.exec(line.trim());
    if (add) cur.relevant.push(...add[1].split(/[,\s]+/).filter(Boolean));
    const rev = /^reviewers:\s*(.+)$/i.exec(line.trim());
    if (rev) cur.reviewers = rev[1].split(',').map((x) => x.trim()).filter(Boolean);
    const done = /^labelled:\s*(yes|y|done)/i.exec(line.trim());
    if (done) cur.labelled = true;
    const note = /^note:\s*(.+)$/i.exec(line.trim());
    if (note) cur.note = note[1];
  }
  return out;
}

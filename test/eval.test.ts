import { describe, expect, it } from 'vitest';
import { parseLabels } from '../src/eval/labels.js';
import { score, type QuestionResult } from '../src/eval/run.js';

const md = `# Evaluation labels

## q1 · find · g

- [x] \`dec-a\` — A
- [ ] \`dec-b\` — B
add: dec-c
labelled: yes

## q2 · abstain · g

- [x] should abstain — nothing in the graph answers this
labelled: yes

## q3 · find · g

- [x] \`dec-z\` — Z
labelled: no
`;

const res = (id: string, kind: QuestionResult['kind'], cited: string[], status: string, top: string[]): QuestionResult => ({
  id, graph: 'g', kind, question: id,
  agent: { answer: '', status, cited, citedDecisions: cited, invalid: [], unsupportedNumbers: [], tools: [], ms: 0 }, baseline: { top },
});

describe('evaluation', () => {
  it('reads ticks, added ids, abstain and labelled flags', () => {
    const l = parseLabels(md);
    expect(l.get('q1')).toMatchObject({ relevant: ['dec-a', 'dec-c'], labelled: true });
    expect(l.get('q2')).toMatchObject({ abstain: true, labelled: true });
    expect(l.get('q3')!.labelled).toBe(false);
  });

  it('scores only labelled questions — recall over the labelled set, precision over what was cited', () => {
    const { agg } = score([
      res('q1', 'find', ['dec-a', 'dec-x'], 'supported', ['dec-c', 'dec-y', 'dec-z']),
      res('q2', 'abstain', [], 'abstained', ['dec-y']),
      res('q3', 'find', ['dec-z'], 'supported', []),
    ], parseLabels(md));
    expect(agg.labelled).toBe(2);
    expect(agg.agentRecall).toEqual([1, 2]);        // cited dec-a of {a, c}
    expect(agg.agentPrecision).toEqual([1, 2]);     // dec-x is not relevant
    expect(agg.baseRecall).toEqual([1, 2]);         // dec-c of {a, c}
    expect(agg.abstainOk).toEqual([1, 1]);
    expect(agg.baseAbstainOk).toEqual([0, 1]);      // keyword search returned something
  });
});

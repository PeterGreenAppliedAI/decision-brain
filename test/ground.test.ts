/**
 * Adversarial cases for the grounding check — including the ones an outside review used to show
 * the first version said "grounded" for answers the evidence contradicts.
 */
import { describe, expect, it } from 'vitest';
import { ground, numbersIn } from '../src/agent/ground.js';

const ID = '2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing';
const evidence = JSON.stringify({ decision: { id: ID, title: 'The wrong rule was load-bearing' },
  text: 'New text: 0/20 to memory. Old text: 16/20. phi4 54/54 either way.', recordedIn: [{ sha: '54359df788edfd5f4cc0', files: ['src/router/prompt.ts'] }] });
const steps = [{ tool: 'trace', args: { decision_id: ID }, result: evidence }];
const other = JSON.stringify({ decisions: [{ id: 'other-decision', title: 'Unrelated', text: 'scored 92%' }] });

describe('ground', () => {
  it('supports an answer whose figures are in the cited evidence', () => {
    const g = ground(`The corrected text routed 0/20 to memory, the old text 16/20 [${ID}].`, steps);
    expect(g).toMatchObject({ status: 'supported', grounded: true, numbersChecked: 2, unsupportedNumbers: [] });
  });

  it('rejects a valid citation attached to a figure the evidence contradicts (outside review, case 1)', () => {
    const g = ground(`Every request succeeded, 20/20 [${ID}].`, steps);
    expect(g.status).toBe('unsupported-number');
    expect(g.grounded).toBe(false);
    expect(g.unsupportedNumbers.map((u) => u.number)).toEqual(['20/20']);
  });

  it('does not count "I don\'t know" as an abstention when the answer goes on to claim figures (case 2)', () => {
    const g = ground("I don't know exactly, but it scored 100/100.", steps);
    expect(g.declined).toBe(false);
    expect(g.status).toBe('unsupported-number');
  });

  it('counts a clean refusal as an abstention', () => {
    expect(ground("I don't know — the graph has no path for this.", steps)).toMatchObject({ status: 'abstained', grounded: true });
  });

  it('a citation only covers figures from the evidence it brought — not another tool result', () => {
    const g = ground(`It scored 92% [${ID}].`, [...steps, { tool: 'search', args: {}, result: other }]);
    expect(g.status).toBe('unsupported-number');
  });

  it('a figure in a block with no citation is unsupported', () => {
    const g = ground(`The rule is load-bearing [${ID}].\n\nIt went from 16/20 to 0/20.`, steps);
    expect(g.unsupportedNumbers.map((u) => u.number)).toEqual(['16/20', '0/20']);
  });

  it('a list item carries its citation to its sub-items', () => {
    const g = ground(`1. **[${ID}]** — the A/B:\n   - new text 0/20\n   - old text 16/20`, steps);
    expect(g.status).toBe('supported');
  });

  it('flags an invented citation and a commit prefix that matches nothing', () => {
    expect(ground('See [made-up-decision].', steps).status).toBe('invalid-citation');
    expect(ground('See [54359df].', steps).status).toBe('supported');
    expect(ground('See [deadbee].', steps).status).toBe('invalid-citation');
  });

  it('reads [tool: target] as citing the target — only for tools that ran, and the target must be real', () => {
    const who = [{ tool: 'who_knows', args: { target: 'app/x.rb' }, result: JSON.stringify({ target: { kind: 'file', path: 'app/x.rb' }, people: [{ name: 'Kevin', commits: 37 }] }) }];
    expect(ground('Kevin has 37 commits [who_knows: app/x.rb].', who)).toMatchObject({ status: 'supported', valid: ['app/x.rb'] });
    expect(ground('Kevin has 37 commits [who_knows: app/y.rb].', who).status).toBe('invalid-citation');
    expect(ground('Kevin has 37 commits [trace: app/x.rb].', who).status).toBe('invalid-citation');   // trace never ran
  });

  it('uncited prose with no figures is "uncited", not grounded', () => {
    expect(ground('The router is important.', steps)).toMatchObject({ status: 'uncited', grounded: false });
  });

  it('says what it cannot check: the prose is model-written', () => {
    expect(ground(`Fine [${ID}].`, steps).prose).toBe('model-written');
  });
});

describe('numbersIn', () => {
  it('treats ADR 13, PR #42, F18 and v2 as references, not figures', () => {
    expect(numbersIn('ADR 13 revises ADR-8; see PR #42, finding F18 and v2 — it scored 92%')).toEqual(['92%']);
  });

  it('finds ratios, percentages, decimals and units — not ids, dates, model tags, list markers or code', () => {
    expect(numbersIn('1. It went 0/20 vs 16 / 20, 92%, 33.9s, 3.4× on qwen3.5:9b in `fib_v2.ts` on 2026-09-30 [2026-09-30-x] with 12 files and 2 tools'))
      .toEqual(['0/20', '16/20', '92%', '33.9s', '3.4×', '12']);
  });
});

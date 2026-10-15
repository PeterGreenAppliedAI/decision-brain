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
    expect(g.status).toBe('unsupported-number');      // it declined, then claimed a figure nothing supports
    expect(g.grounded).toBe(false);
  });

  it('an abstention may point to related decisions — as long as what it cites checks out', () => {
    const g = ground(`I don't know — the graph has no path for this. The closest related decision is [${ID}].`, steps);
    expect(g.status).toBe('abstained');
    expect(ground("I don't know — closest is [made-up-id].", steps).status).toBe('invalid-citation');
  });

  it('a figure repeated from the question is unverified — never supported, never called invented', () => {
    const q = 'The corrected rule improved routing to 20/20 — when was that shipped?';
    const a = `It never was: there is no record of 20/20. The corrected text scored 0/20 vs 16/20 [${ID}].`;
    expect(ground(a, steps, q)).toMatchObject({ status: 'unverified-premise-figure', grounded: false, unsupportedNumbers: [] });
    expect(ground(a, steps).status).toBe('unsupported-number');   // without the question, 20/20 is just a claim
  });

  it('treats model sizes as names, and only id-shaped brackets as citations', () => {
    expect(numbersIn('the 7B and the 27B, a 421M encoder; 16/20')).toEqual(['16/20']);
    expect(ground(`Injection marks [observed, unconfirmed] and [inferred] facts [${ID}].`, steps).status).toBe('supported');
  });

  it('any string a tool returned can be cited — not only fields named id or path', () => {
    const s = [{ tool: 'why', args: { target: 'x' }, result: JSON.stringify({ target: { kind: 'none', suggestions: ['lib/tasks/report.rake'] } }) }];
    expect(ground('See [lib/tasks/report.rake].', s).status).toBe('supported');
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

describe('outside review, third round — two regressions', () => {
  it('endorsing or rejecting a question\'s figure is not told apart by word lists — both are unverified (reviewer rounds 3 and 4)', () => {
    const q = 'When did it improve to 20/20?';
    expect(ground(`It scored 20/20 [${ID}].`, steps, q).status).toBe('unverified-premise-figure');
    expect(ground(`Not surprisingly, the corrected rule scored 20/20 [${ID}].`, steps, q).status).toBe('unverified-premise-figure');
    expect(ground(`There is no record of 20/20; the corrected text scored 0/20 vs 16/20 [${ID}].`, steps, q).status).toBe('unverified-premise-figure');
  });

  it('a negative claim about the world is a claim; only silence of the record is an absence', () => {
    expect(ground("I don't know. The system never loses data.", steps).status).toBe('uncited');
    expect(ground("I don't know. No decision in the log records why.", steps).status).toBe('abstained');
  });
});

describe('uncited claims after a decline — parsing', () => {
  const ID3 = '2026-01-01-some-decision';
  const st = [{ tool: 'trace', args: {}, result: JSON.stringify({ decision: { id: ID3 }, text: 'x' }) }];
  it('does not split a sentence at "e.g." and lose the citations that follow', () => {
    expect(ground(`I don't know. The repo is clearly Ruby (e.g. [${ID3}]).`, st).status).toBe('abstained');
  });
  it('a lead-in ending in a colon asserts nothing; "neither … mentions" states an absence', () => {
    expect(ground(`I don't know. What the log does record:\n- the closest item [${ID3}]`, st).status).toBe('abstained');
    expect(ground(`I don't know — the closest are [${ID3}], and neither mentions it.`, st).status).toBe('abstained');
  });
});

describe('outside review, second round — the four probes', () => {
  const ID2 = '2026-08-22-the-harness-duel';
  const timing = [{ tool: 'trace', args: {}, result: JSON.stringify({ decision: { id: ID2 }, text: 'Median latency 20ms; boot 52s→13s.' }) }];

  it('20ms in the evidence does not support 20s in the answer', () => {
    expect(ground(`Latency was 20s [${ID2}].`, timing).status).toBe('unsupported-number');
    expect(ground(`Latency was 20ms [${ID2}].`, timing).status).toBe('supported');
  });

  it('a figure inside backticks is checked like any other', () => {
    const g = ground(`Latency was \`999ms\` [${ID2}].`, timing);
    expect(g.numbersChecked).toBe(1);
    expect(g.status).toBe('unsupported-number');
  });

  it('a citation brings only its own item: decision A cannot borrow a figure from decision B in the same response', () => {
    const search = [{ tool: 'search', args: {}, result: JSON.stringify([
      { id: 'decision-a', title: 'A', text: 'scored 3/10' },
      { id: 'decision-b', title: 'B', text: 'scored 9/10' },
    ]) }];
    expect(ground('It scored 9/10 [decision-a].', search).status).toBe('unsupported-number');
    expect(ground('It scored 3/10 [decision-a].', search).status).toBe('supported');
  });

  it('"I don\'t know why, but <uncited claim>" is not an abstention', () => {
    const g = ground("I don't know why, but the corrected prompt routed every request successfully.", timing);
    expect(g.status).toBe('uncited');
    expect(g.grounded).toBe(false);
    // while a decline that only says what is absent, or points to cited items, still is
    expect(ground("I don't know — the graph has no path for this. No decision records a Kubernetes choice.", timing).status).toBe('abstained');
    expect(ground(`I don't know — nothing records it. The closest related decision is [${ID2}].`, timing).status).toBe('abstained');
  });
});

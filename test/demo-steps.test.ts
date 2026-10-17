import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StepRefused, demoState, runStep } from '../scripts/demo/steps.js';

describe('the demo steps run once each, in order', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-demo-steps-'));
    const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a]);
    git('init', '-q'); git('config', 'user.name', 'Sam'); git('config', 'user.email', 's@x');
    mkdirSync(join(dir, 'src/router'), { recursive: true });
    writeFileSync(join(dir, 'src/router/prompt.ts'), 'Rules:\n- personal, memory, and web_search can only READ — they cannot create files, PDFs, or run anything. Never send…\n');
    writeFileSync(join(dir, 'DECISIONS.md'), '# Decisions\n');
    git('add', '.'); git('commit', '-qm', 'start');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('goes propose → record → resubmit, reporting where it stands', () => {
    expect(demoState(dir)).toEqual({ propose: false, record: false, resubmit: false });
    expect(runStep(dir, 'propose')).toMatch(/^[0-9a-f]{8}$/);
    expect(runStep(dir, 'record')).toMatch(/^[0-9a-f]{8}$/);
    expect(runStep(dir, 'resubmit')).toMatch(/^[0-9a-f]{8}$/);
    expect(demoState(dir)).toEqual({ propose: true, record: true, resubmit: true });
  });

  it('refuses a step twice or out of order, and changes nothing when it refuses', () => {
    expect(() => runStep(dir, 'record')).toThrow(/"propose" comes first/);
    runStep(dir, 'propose');
    expect(() => runStep(dir, 'propose')).toThrow(StepRefused);
    runStep(dir, 'record');
    const log = readFileSync(join(dir, 'DECISIONS.md'), 'utf8');
    expect(() => runStep(dir, 'record')).toThrow(/already done/);
    expect(readFileSync(join(dir, 'DECISIONS.md'), 'utf8')).toBe(log);       // no second entry
    runStep(dir, 'resubmit');
    const prompt = readFileSync(join(dir, 'src/router/prompt.ts'), 'utf8');
    expect(() => runStep(dir, 'resubmit')).toThrow(/already done/);
    expect(readFileSync(join(dir, 'src/router/prompt.ts'), 'utf8')).toBe(prompt);
  });
});

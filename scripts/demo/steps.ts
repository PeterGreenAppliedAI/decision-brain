/**
 * The demo's scripted changes, made in the disposable copy from setup.ts — one commit each, in order:
 * propose — a contributor "fixes" the router prompt's factually wrong memory rule
 * record  — SIMULATED decision update (not an actual benchmark): the deployment retires qwen2.5:7b and
 *           supports only a tested qwen3.5:9b configuration; for that configuration the corrected rule
 *           replaces the old requirement. The 7B result stays valid historical evidence.
 * resubmit — the contributor resubmits the fix, citing the new decision
 * Where the demo stands is read from the repository itself, so each step runs once, in order.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMPT = 'src/router/prompt.ts';
const OLD = '- personal, memory, and web_search can only READ — they cannot create files, PDFs, or run anything.';
const FIXED = '- memory and web_search cannot create files, PDFs, or run anything; memory saves and recalls facts ("remember that…" is memory).';
const CITED = `${FIXED} Correct for the supported qwen3.5:9b router — see DECISIONS, October 15 2026.`;
const HEADING = '## Router Model Retired: qwen2.5:7b Unsupported, the Corrected Rule for qwen3.5:9b (October 15 2026)';
const ENTRY = `
${HEADING}

*Simulated decision update for a demo — not an actual benchmark.*

**Supersedes "The Router Prompt's 'Wrong' Rule Was Load-Bearing" (September 30 2026) for the supported configuration.** In this simulated scenario the deployment retires qwen2.5:7b and supports only the tested configuration, qwen3.5:9b as the router. Measured on qwen3.5:9b with the same alternating A/B, the corrected text in \`${PROMPT}\` routes "Remember this…" to memory **20/20**, the old text **19/20**. For that configuration the corrected rule replaces the old prompt requirement. The earlier 7B result — 0/20 with the corrected text vs 16/20 with the old one — remains valid historical evidence: a deployment that still runs qwen2.5:7b as the router must keep the old rule.
`;

export const STEPS = ['propose', 'record', 'resubmit'] as const;
export type Step = (typeof STEPS)[number];
export class StepRefused extends Error {}

/** Which steps the copy has been through, read from its files. */
export function demoState(dir: string): Record<Step, boolean> {
  const prompt = readFileSync(join(dir, PROMPT), 'utf8');
  const decisions = readFileSync(join(dir, 'DECISIONS.md'), 'utf8');
  return { propose: !prompt.includes(OLD), record: decisions.includes(HEADING), resubmit: prompt.includes(CITED) };
}

/** Runs one step if it is the next one; returns the new commit's short sha. */
export function runStep(dir: string, step: Step): string {
  const state = demoState(dir);
  const at = STEPS.indexOf(step);
  if (state[step]) throw new StepRefused(`already done: "${step}" — Reset the demo copy to start over`);
  const missing = STEPS.slice(0, at).find((s) => !state[s]);
  if (missing) throw new StepRefused(`"${missing}" comes first`);
  const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
  const edit = (from: string, to: string) => {
    const p = join(dir, PROMPT);
    const text = readFileSync(p, 'utf8');
    if (!text.includes(from)) throw new StepRefused(`${PROMPT} is not as the demo expects — Reset the demo copy`);
    writeFileSync(p, text.replace(from, to));
  };
  if (step === 'propose') { edit(OLD, FIXED); git('commit', '-qam', 'Router prompt: fix the factually wrong memory rule (memory can save facts)'); }
  if (step === 'record') { appendFileSync(join(dir, 'DECISIONS.md'), ENTRY); git('commit', '-qam', 'DECISIONS: retire qwen2.5:7b as router; the corrected rule for qwen3.5:9b (simulated update)'); }
  if (step === 'resubmit') { edit(FIXED, CITED); git('commit', '-qam', 'Router prompt: fix the factually wrong memory rule (resubmitted for the qwen3.5:9b router)'); }
  return git('rev-parse', '--short=8', 'HEAD');
}

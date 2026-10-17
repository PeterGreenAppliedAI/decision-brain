/**
 * The demo's scripted changes from the command line (the Review page runs the same steps).
 *   npx tsx scripts/demo/step.ts <demo-dir> propose | record | resubmit | status
 * Each step runs once, in order; see scripts/demo/steps.ts. Prints the new commit's sha.
 */
import { STEPS, StepRefused, demoState, runStep, type Step } from './steps.js';

const [dir, step] = process.argv.slice(2);
if (!dir || !(step === 'status' || STEPS.includes(step as Step))) { console.error('usage: step.ts <demo-dir> propose | record | resubmit | status'); process.exit(2); }
try {
  console.log(step === 'status' ? JSON.stringify(demoState(dir)) : runStep(dir, step as Step));
} catch (err) {
  if (!(err instanceof StepRefused)) throw err;
  console.error(`refused: ${err.message}`);
  process.exit(3);
}

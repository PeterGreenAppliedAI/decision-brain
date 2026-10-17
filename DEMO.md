# Demo — "before you merge this, here's why it is the way it is"

A code-review story on real data (Invarail's decision log and history), run on a disposable copy so the
demo can commit freely — **entirely in the browser**: the Board, Ask and Review pages. Run end to end
through the Review page on 2026-10-17 (glm-5.3-flash on vLLM); terminal equivalents are at the end.

**Honesty note for the recording:** the proposed change (step 2) is a realistic cleanup, written for the
demo. The decision update (step 5) is **simulated — not an actual benchmark**; the page shows a "Demo
copy" banner, and the step's button says "(simulated)" — keep a caption on screen for all of step 5 too.
Everything shown about the September 30 decision, its A/B on qwen2.5:7b and its revert is Invarail's
real record.

## Setup

**Prerequisite, once (~85 min of model time):** Invarail's graphs built — clone
[Invarail](https://github.com/PeterGreenAppliedAI/Invarail), then `npm run ingest -- <path> --graph invarail`,
`npm run team -- --graph invarail --workers 4`, `npm run summarize -- --graph invarail --repo <path>`, and
the demo copy made once: `npx tsx --env-file=.env scripts/demo/setup.ts <path-to-invarail> invarail data/corpora/invarail-demo invarail-demo`.

**Before each take:**
```sh
WEB_LOCAL_ACTIONS=1 npm run web    # local only: enables Sync and the demo steps; run where the model host is reachable
```
Open three tabs: **Board** `http://127.0.0.1:4100/?graph=invarail`, **Ask**
`/ask.html?graph=invarail-demo`, **Review** `/review.html?graph=invarail-demo`. On the Review page, click
**Reset the demo copy** (≈5 s) — it re-clones the repository and re-copies the graphs, and only ever
replaces what it made itself.

## 1 · The brain, built by a team (Track 02) — ~35 s
Board → `invarail · decisions`: 151 entries extracted by four local agents; click a confirmed handoff
card (one agent raised a supersession, a different agent confirmed it with a quote). Switch to
`invarail · file summaries` and click `src/router/prompt.ts`: its summary, and the decision resting on it
with **0/20 vs 16/20**.

## 2 · A proposed change — ~15 s
Review → **1 · A contributor proposes a fix**. The new commit appears and opens: "The change" shows line 27
going from "personal, memory, and web_search can only READ" (factually wrong — memory can save) to the
corrected text.

## 3 · Sync, and the review (Track 01, the action)
**Sync with the repository** — optionally switch to the Board tab (`invarail-demo · file summaries`) to
watch agents claim and re-summarize the one changed file and its directories. Cut the wait; show the
final line, e.g. `model calls: 4 · 45 s`. The proposal's review now reads:
- **R1** *The Router Prompt's "Wrong" Rule Was Load-Bearing* — qwen2.5:7b, measured **0/20 vs 16/20**
- **D1** *"Corrected router prompt text would fix the 7B's memory routing"* — **tried and disproven**
- **P1** Peter Green — 8 commits on the file

**Say:** a reasonable-looking cleanup would repeat a measured regression; the graph surfaces the evidence
before it merges. Click R1's title for its measurements, experiments and source text.

## 4 · Ask about it (Track 03) — ~30 s
Ask tab: *"If I change src/router/prompt.ts, what should I re-check?"* (an example button). Tool calls
stream in; the answer cites the decision and quotes 0/20 vs 16/20; the checks show citations and figures
matched; the path draws the file, the revert commit, the decision, the disproven experiment. Click the
citation chip, then the decision node. If the checks flag a figure, open the claim it belongs to: the
checker flags a figure it cannot match to the cited evidence — sometimes one placed away from its
citation (asking again may resolve that), sometimes a reformatted or altered figure.

## 5 · The deployment changes; the review follows — *Simulated decision update — not an actual benchmark*
In the simulated scenario the deployment retires qwen2.5:7b and supports only a tested qwen3.5:9b
router. Review → **2 · Record the decision update (simulated)** — the DECISIONS.md commit opens; its diff
shows the entry, starting "Simulated decision update for a demo — not an actual benchmark", scoped to the
supported configuration and keeping the 7B result as valid history. Then **3 · The contributor
resubmits**, then **Sync**. Sync extracts only the new entry; one agent raises "supersedes", a different
agent confirms it (if the first confirmation's quote fails the check, it is retried — `model calls: 7`).
The resubmission's review:
- **R1** the new decision — qwen3.5:9b **20/20 vs 19/20**, with the 7B's **0/20** carried with it
- **D1** "the corrected rule applies to qwen2.5:7b" (wording varies by run) — **tried and disproven**: the 7B constraint is still a
  live warning, now under the decision that scoped it
- **S1** the September decision — **superseded by a later entry**, with what it had disproven filed under
  it as history

**Say:** the system did not take the newer measurement as automatically better — the old rule went because
the model it was measured on is no longer supported; D1 is that distinction on screen.

## 6 · Close on the proof — ~20 s
In the Commits list, click the **original proposal** again: its review still shows the September
decision and the 7B evidence — a change is judged by the record as it stood at that commit.

Then one line: tested on three repositories using the documented GLM/vLLM setup (`eval/JUDGE-PATH.md`);
on 24 frozen questions, more answer rubrics passed than the same model given keyword-search results
(16/20 vs 10/20 in the blind-judged second run), at about 2.6–2.9x the latency (`eval/v2/RESULTS.md`).

## Terminal equivalents
```sh
D=data/corpora/invarail-demo; R="--graph invarail-demo --repo $D"
npx tsx --env-file=.env scripts/demo/setup.ts <path-to-invarail> invarail $D invarail-demo   # reset
npx tsx scripts/demo/step.ts $D propose | record | resubmit                                  # prints the commit
npm run sync -- $R
npm run review -- $R <commit>
```

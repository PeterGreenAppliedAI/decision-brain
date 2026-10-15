# Demo — "before you merge this, here's why it is the way it is"

A code-review story on real data (Invarail's decision log and history), run on a disposable copy so
the demo can commit freely. Every step was run end to end on 2026-10-15 with these scripts;
afterwards one review label was reworded (output only, re-checked). Timings are from that run (glm-5.3-flash on vLLM, M4 Mac mini).

**Honesty note for the recording:** the proposed change in step 2 is a realistic cleanup, written for
the demo. The decision update in step 5 is **simulated — not an actual benchmark**; keep that caption on
screen for all of step 5. Everything shown about the September 30 decision, its A/B on qwen2.5:7b and
its revert is Invarail's real record.

## Setup (before recording — ~5 s, safe to repeat)

```sh
D=data/corpora/invarail-demo
npx tsx --env-file=.env scripts/demo/setup.ts <path-to-invarail> invarail $D invarail-demo
npm run web          # http://127.0.0.1:4100 — Board and Ask views (run where the model host is reachable)
```
Setup clones the repo and copies the three Invarail graphs server-side, so extraction (31 min) and file
summaries (52 min) are reused, not redone. Re-running it resets the demo; it replaces only a directory
that is a clone of the source and graphs it marked itself, and refuses anything else.

## 1 · The brain, built by a team (Track 02) — ~30 s
Board view → `invarail · decisions`: 151 entries extracted by four local agents; open a handoff (one
agent raised a supersession, a different agent confirmed it with a quote). Switch to
`invarail · file summaries`: 318 files and 63 directories, summarized bottom-up.

## 2 · A proposed change — ~10 s
`src/router/prompt.ts` line 27 says "personal, memory, and web_search can only READ" — factually wrong
(memory can save). A contributor fixes it:
```sh
npx tsx scripts/demo/step.ts $D propose        # prints the commit
```

## 3 · Sync and review it (Track 01, the action)
```sh
npm run sync   -- --graph invarail-demo --repo $D
npm run review -- --graph invarail-demo --repo $D <commit>
```
`sync` re-summarizes exactly 1 file and its 3 directories — `model calls: 4 · 59.5 s`. Cut the wait but
show that line. The review takes ~2 s. The review packet:
- **R1** *The Router Prompt's "Wrong" Rule Was Load-Bearing* — qwen2.5:7b, measured **0/20 vs 16/20**
- **D1** *"Corrected router prompt text would fix the 7B's memory routing"* — **tried and disproven**
- **P1** Peter Green — 8 commits on the file

**Say:** a reasonable-looking cleanup would repeat a measured regression; the graph surfaces the
evidence before it merges.

## 4 · Open the evidence (Track 03) — ~20 s
Ask view on the demo copy — open `http://127.0.0.1:4100/ask.html?graph=invarail-demo` (demo copies are
listed only when the link names one, under a "Demo copy" banner): *"If I change src/router/prompt.ts, what should I re-check?"* — the
tool calls stream in, the answer cites the decision and quotes 0/20 vs 16/20, the code checks show
citations and figures matched, and the path draws prompt.ts → the revert commit → the decision → the
disproven experiment and its measurements. Click the decision to read its source lines. If the checks show a flagged figure, open the
claim it belongs to: the checker flags a figure it cannot match to the cited evidence — sometimes a
figure placed away from its citation (asking again may resolve that), sometimes a reformatted or altered
figure. Don't wave it off.

## 5 · The deployment changes; the review follows — *Simulated decision update — not an actual benchmark*
In the simulated scenario, the deployment retires qwen2.5:7b and supports only a tested qwen3.5:9b
router. The team records that — the new decision replaces the old requirement **for that configuration**,
and says the 7B result remains valid history. Then the contributor resubmits:
```sh
npx tsx scripts/demo/step.ts $D record          # the DECISIONS entry (text in scripts/demo/step.ts)
npx tsx scripts/demo/step.ts $D resubmit        # prints the new commit
npm run sync   -- --graph invarail-demo --repo $D
npm run review -- --graph invarail-demo --repo $D <new commit>
```
`sync` extracts only the new entry; one agent raises "supersedes", another confirms it —
`model calls: 6 · 88.4 s`; show that line. The packet now shows:
- **R1** the new decision — qwen3.5:9b **20/20 vs 19/20**, and the 7B's **0/20** carried with it
- **D1** "the corrected rule works for qwen2.5:7b as well" — **tried and disproven, do not retry**: the 7B
  constraint is still a live warning, now under the decision that scoped it
- **S1** the September decision — **superseded by a later entry** (its own text still says active), with
  what it had disproven filed under it as history

**Say:** the system did not take the newer measurement as automatically better — the old rule went
because the model it was measured on is no longer supported. D1 is that distinction on screen: put the 7B
back and the warning applies.

## 6 · Close on the proof — ~20 s
1. The resubmitted change gets the updated guidance (end of step 5, on screen).
2. Review the **original** proposal again:
   `npm run review -- --graph invarail-demo --repo $D <first commit>` — it still retrieves the
   September decision and the 7B evidence: a change is judged by the record as it stood at that commit.

Then one line: tested on three repositories using the documented GLM/vLLM setup (`eval/JUDGE-PATH.md`);
on 24 frozen questions, more answers correct than the same model given keyword-search results
(17/20 vs 11/20), at about 2.6x the latency (`eval/v2/RESULTS.md`).

# Demo — "before you merge this, here's why it is the way it is"

A code-review story on real data (Invarail's decision log and history), run on a disposable copy so
the demo can commit freely. Every step below was run and verified on 2026-10-15; timings are from
that run (glm-5.3-flash on vLLM, M4 Mac mini).

**Honesty note for the recording:** the proposed change is a realistic cleanup, written for the demo.
The "re-measurement" decision in step 4 is **scripted for the demo** — say so on screen. Everything
the system shows about the September 30 decision, its A/B and its revert is Invarail's real record.

## Setup (once, before recording — ~5 s)

```sh
npx tsx --env-file=.env scripts/demo/setup.ts <path-to-invarail> invarail data/corpora/invarail-demo invarail-demo
npm run web          # http://127.0.0.1:4100 — Board and Ask views (run where the model host is reachable)
```
The setup clones the repo and copies the three Invarail graphs server-side, so extraction (31 min) and
file summaries (52 min) are reused, not redone.

## 1 · The brain, built by a team (Track 02) — ~30 s
Board view → `invarail · decisions`: 151 entries extracted by four local agents; open a handoff (one
agent raised a supersession, a different agent confirmed it with a quote). Switch to
`invarail · file summaries`: 318 files and 63 directories, summarized bottom-up.

## 2 · A proposed change — ~10 s
In `data/corpora/invarail-demo/src/router/prompt.ts`, line 27 says "personal, memory, and web_search
can only READ" — factually wrong (memory can save). A contributor fixes it:
```sh
# edit line 27 to: "memory and web_search cannot create files…; memory saves and recalls facts"
git -C data/corpora/invarail-demo commit -am "Router prompt: fix the factually wrong memory rule"
```

## 3 · Sync and review it (Track 01, the action) — ~65 s + 2 s
```sh
npm run sync   -- --graph invarail-demo --repo data/corpora/invarail-demo
npm run review -- --graph invarail-demo --repo data/corpora/invarail-demo <commit>
```
`sync` re-summarizes exactly 1 file and its 3 directories (4 model calls). The review packet:
- **R1** *The Router Prompt's "Wrong" Rule Was Load-Bearing* — measured **0/20 vs 16/20**
- **D1** *"Corrected router prompt text would fix the 7B's memory routing"* — **tried and disproven**
- **P1** Peter Green — 8 commits on the file

**Say:** a reasonable-looking cleanup would repeat a measured regression; the graph surfaces the
evidence before it merges.

## 4 · Open the evidence (Track 03) — ~20 s
Ask view, graph `invarail-demo`: *"If I change src/router/prompt.ts, what should I re-check?"* — the
tool calls stream in, the answer cites the decision and quotes 0/20 vs 16/20, the code checks show
citations and figures matched, and the path draws prompt.ts → the revert commit → the decision → the
disproven experiment and its measurements. Click the decision to read its source lines.

## 5 · The record changes; the review refreshes — ~70 s + 2 s
The team re-measures on a newer model and records it (**scripted for the demo**):
```sh
# add a DECISIONS.md entry, "The Corrected Router Rule, Re-measured on qwen3.5:9b (October 15 2026)":
# supersedes the Sep 30 decision; corrected text 20/20 vs old 19/20 on qwen3.5:9b; names src/router/prompt.ts
git -C data/corpora/invarail-demo commit -am "DECISIONS: the corrected router rule re-measured on qwen3.5:9b"
# the contributor resubmits (any further edit to prompt.ts), then:
npm run sync   -- --graph invarail-demo --repo data/corpora/invarail-demo
npm run review -- --graph invarail-demo --repo data/corpora/invarail-demo <new commit>
```
`sync` extracts only the new entry; one agent raises "supersedes", another confirms it (6 model calls).
The packet now shows:
- **R1** *The Corrected Router Rule, Re-measured* — **20/20 vs 19/20**
- **S1** the September decision — **superseded, do not cite**, with what it had disproven filed under
  it as history, not as a live warning

Re-run the review of the *first* proposal: it still shows the September evidence — history is judged
as it stood.

## 6 · It runs anywhere a judge points it (close) — ~15 s
`eval/JUDGE-PATH.md`: a fresh clone on a repository we had never seen, four defects found and fixed, then
an uninterrupted clean run. `eval/v2/RESULTS.md`: on 24 frozen questions, more answers correct than the
same model given keyword-search results (17/20 vs 11/20), at about 2.6x the latency.

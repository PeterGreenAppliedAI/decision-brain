# Judge path — a fresh setup on a repository we had never seen

**Date:** 2026-10-15 (UTC) · **Starting commit:** `53e56e6` · **Finished at:** `38d9388`
**Host:** Apple M4 Mac mini, 16 GB, macOS · Node 26 · Docker 29.4 · FalkorDB 6.0.2 (pinned image)
**Model:** `glm-5.3-flash` on vLLM (OpenAI-compatible), on a separate GPU box on the LAN.
**Repository under test:** [thomvaill/log4brains](https://github.com/thomvaill/log4brains) — 11
architecture decision records, 149 commits, chosen for having decision records and for being new to us.

Finish line (from an outside review): fresh environment and README-only setup; ingest, extract, ask
and review end to end on a third repository; edit a decision and verify stale evidence disappears,
then re-extract; restart everything and verify persistence; publish commands, timings, failures and
corrected instructions.

## Result

**A successful warm setup on the existing GLM infrastructure** — after four defects found by this run
were fixed (three in the product, one introduced by me while fixing the second), each a commit with a
test; the clone pulled each fix mid-run. That makes this a debugging session that ended in success,
not yet a repeatable installation: **before recording the demo, the final commit must be run once from
another empty directory and volume, start to finish, with no fixes pulled midway.** Ollama and a cold
machine remain unverified.

## Clean re-run — uninterrupted (2026-10-15)

The final commit at the time, `7f5270c`, run once from a new empty directory and a new Docker volume,
README steps only, **no fixes pulled midway**: clone · `npm install` · `cp .env.example .env` (set
`LLM_URL`) · `npm run graph:up` · clone log4brains · ingest (11 ADRs, 1 s) · team (11/11, 37 s) · ask
(slug question: supported, 23 s; Kubernetes: abstained, 14 s) · review (2 s) · trace · `npm test`
(111 passed) · `docker compose down` + `graph:up` + trace (persisted). **Every step exited 0.** Still a
warm machine (npm cache and FalkorDB image present); Ollama still unverified.

## Commands and timings (the first, debugging run)

Run from an empty directory; the clone was named `decision-brain-judge` so Docker Compose would create
a new, empty data volume (a clone named `decision-brain` on a machine that already ran the project
would reuse that volume — not a concern on a judge's machine).

| Step | Command | Time | Result |
|---|---|---|---|
| Clone | `git clone https://github.com/PeterGreenAppliedAI/decision-brain` | 1 s | ok |
| Install | `npm install` | 2 s | ok — **warm npm cache; expect longer on a fresh machine** |
| Configure | `cp .env.example .env`, set `LLM_URL` | — | the only setting changed |
| Database | `npm run graph:up` | 1 s | ok — image already present; **a first pull downloads the FalkorDB image** |
| Corpus | `git clone https://github.com/thomvaill/log4brains` | 1 s | ok |
| Ingest | `npm run ingest -- ../log4brains --graph log4brains` | 1 s | **failed 3×, then ok** (failures 1–3) |
| Extract | `npm run team -- --graph log4brains --workers 4` | 32 s | 11/11 entries, 0 errors; both supersessions found by code *and* by two agents |
| Ask | `npm run ask -- --graph log4brains "Why does log4brains identify an ADR by its slug instead of a number?"` | 24 s | correct; citations and figures checked: supported |
| Ask | `… "What branching strategy does the project use, and why did it change?"` | 20 s | correct (GitHub Flow → Simplified Git Flow → back, because Lerna); supported |
| Ask | `… "Why did the team choose Kubernetes?"` | 17 s | "I don't know — the graph has no path for this": abstained |
| Review | `npm run review -- --graph log4brains --repo ../log4brains 03550dc` | 2 s | **wrong as-of date (failure 4), then ok** |
| Edit + re-ingest | edit `20201103-use-lunr-for-search.md` (same title), commit, `npm run ingest …` | 1 s | the entry's 5 concept links removed at ingest; other entries' 43 untouched |
| Re-extract | `npm run team -- --graph log4brains --workers 4` | 10 s | "1 entry changed since extraction — re-extracting"; only that entry redone; new evidence (`120ms`) from the new text; 0 stale |
| Restart | `docker compose down && npm run graph:up` | 5 s | node and edge counts identical (719 / 1,749 brain; 135 / 130 board); trace works |

## The four failures

1. **ADRs named by date were not recognised.** log4brains names records `20200924-title.md`; the
   parser accepted only 3–5-digit numbers (`0013-title.md`), so ingest found no decisions at all.
   Fixed in `baf790a`: up to 8-digit prefixes, links to date-named files, a missing Date line taken
   from the file name.
2. **Two records written the same day collided.** `20200925-multi-packages…` and
   `20200925-use-prettier…` both became `adr-20200925`, and one silently replaced the other (11
   records parsed, 10 stored). Fixed in `9a6f6d5`: a shared prefix gives each file an id from its whole
   name; links resolve by file name.
3. **My fix for failure 2 deleted a function ingest imports.** Every unit test still passed — the
   test runner does not enforce named exports and no fixture had an ADR directory — and I had not run
   the typecheck before committing. The fresh clone's ingest crashed on it at once. Fixed in `7014d29`,
   with an end-to-end ADR-ingest test (mutation-checked).
4. **"As of the change" used the date a commit was written (author date).**
   log4brains' `feat: initial features` was written 2020-09-25 and squashed in on 2020-12-10 (22 of its
   149 commits differ), so its review looked like a September commit recording November decisions.
   Fixed in `38d9388`: commits carry their committer timestamp, which the date-based fallbacks, the
   reviewer cut-off, `told` and instruction-file versions use; the author date is still shown. The
   committer timestamp is an approximation, not merge time — a commit can exist on a branch long before
   it is merged. What a commit truly includes is its tree and ancestry: review's rebuilt path reads the
   commit's own tree; moving the reviewer cut-off and `told` to ancestry is open.

## What this run did not verify

- **Ollama or any other model server.** Only `glm-5.3-flash` on vLLM was used; whether another
  OpenAI-compatible server handles the structured-output and tool-calling requests is unverified.
- **A cold machine.** npm's cache and the FalkorDB image were already present.
- **Repositories without decision records**, or decision records in other layouts than Nygard,
  MADR, log4brains and a single DECISIONS.md.
- **File summaries** (`npm run summarize`) on this repository.

## Setup corrections made to the README

- The model server must be OpenAI-compatible **with tool calling and JSON-schema structured output**
  (vLLM; others unverified), and `LLM_REASONING_EFFORT` matters for GLM.
- `review` rebuilds the decision log at a commit only with `--repo` or `REPO_PATHS`.
- First runs download the FalkorDB image and npm packages; timings above are warm.

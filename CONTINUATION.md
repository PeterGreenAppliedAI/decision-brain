# CONTINUATION — handoff for the next session

Start here, then README.md (what exists, how to run it, the data model), PLAN.md (progress table,
what's next) and DECISIONS.md (why everything is the way it is — newest first). Rewritten 2026-10-14,
evening of Day 1 of the event (Oct 14 2:31 PM → Oct 18 2:29 PM EDT). The Oct 6 pre-event version is
in git history.

## Where things stand

Updated 2026-10-15 (Day 2). Built, tested and evaluated: ingest, the extraction and file-summary teams,
the graph tools, MCP server, the grounded agent, `review`, `sync`, and the Board/Ask/Path views (114
tests, CI green). Evaluation v2 is frozen and reported (eval/v2/RESULTS.md); the judge path on
log4brains passed a clean, uninterrupted re-run (eval/JUDGE-PATH.md). **Now:** record the demo from
DEMO.md (the code-review story; `scripts/demo/setup.ts` resets it safely, `scripts/demo/step.ts` makes
its scripted commits — step 5's decision update is simulated and says so). **Then:** blog post and
deployment build around the recording; long-entry reading and question memory only if time remains.
The repo is private at github.com/PeterGreenAppliedAI/decision-brain; making it public is Peter's call.
Graphs `invarail-demo*` and `data/corpora/invarail-demo` are the disposable demo copy.

## Running things

- `npm run graph:up` — FalkorDB **6.0.2, pinned** (compose and CI), host port 6380 (6379 is Invarail's
  live FalkorDB — never touch it). Data persists in the `falkordb-data` volume at
  `/var/lib/falkordb/data` (it was mis-mounted at `/data` until Oct 14 — see DECISIONS). A pre-upgrade
  dump is in `data/backups/` (gitignored).
- Corpora live in `data/corpora/` (gitignored); Invarail is ingested from its own local clone.
  Graphs: `invarail`, `content-publisher`, and their `__board` graphs.
- The model is `glm-5.3-flash` on the GB10's vLLM; `LLM_URL` is in `.env` (gitignored). **Anything
  that calls the model — `npm run team`, `npm run ask` — must run inside the `lab` tmux session**
  (`tmux send-keys -t lab:probe '…' Enter`); a plain shell on the Mac mini is denied LAN access.
  Ingest, review, trace, mcp and web don't need the model and run anywhere.
- `LLM_REASONING_EFFORT=low` matters: GLM-5.3's template defaults to Max (minutes per call, truncated
  JSON). Low measured 2–3× faster at equal quality.
- `npm run web` serves the board view on 127.0.0.1:4100; it survives FalkorDB restarts.

## Traps already found (details in DECISIONS.md)

- FalkorDB 4.x: a pattern comprehension reusing a variable name from an earlier one returns `[]`.
- FalkorDB 6.x: any comprehension after one that nests a comprehension returns `[]` — avoid nesting.
- `a ENDS WITH '/' + $q` parses as `(a ENDS WITH '/') + $q` — parenthesize.
- `RETURN x {…} AS x ORDER BY x.prop` sorts by the projection, not the node — alias differently.
- An unnamed multi-type relationship (`-[:A|B]->`) yields one row per node pair on 6.x; name it for
  one row per edge.
- A full-text query on a missing index returns `[]`, not an error — `search()` checks the index.
- Re-ingesting while the team runs is harmless, but don't make a habit of it.

## How Peter works (carry these over)

- **Config over hardcoding.** "We don't need to hard code these things, you keep doing that. I want it
  in config." Personal things never get committed.
- **Never revert or make a major change without explicit approval.** On a measured regression, revert
  to known-good rather than piling on tuning — and say so.
- **Verify before claiming.** Check exit codes, rerun after "fixes", and correct your own wrong
  conclusions openly with a dated note — this event has needed it several times already (the
  "stale hashes", the queueing GPU, the CI flake's cause).
- **Small local models are first-class.** Code decides; the model fills small, bounded slots
  (grammar-constrained JSON), and code builds the edges. **No paid API, anywhere** (Peter, Oct 14).
- **Keep the decision log** (DECISIONS.md, including what failed) — it is also the blog post.
- **Ask before outward or destructive actions** (making the repo public, force-push, deleting data).
- **Edge cases before "done".** Peter, on Day 1: *"No way we tested enough to review edge cases."* An
  audit of real output found eight defects. Test against the real corpus, not just fixtures.

## The rule that shapes everything

> "The main coding and design work must begin after the hackathon starts. You may discuss ideas,
> create notes, sketch the graph model, or prepare diagrams beforehand." AI assistants allowed, but
> disclosed. Data must be public, synthetic or owned.

Never copy or adapt Invarail's own FalkorDB code (`src/memory/`, orchestrator, dispatch) — ideas only.

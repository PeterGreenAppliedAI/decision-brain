# CONTINUATION — handoff for the next session

Start here. Read this, then PLAN.md. Written 2026-10-06 at the end of a long Invarail session.

## What this is

**Decision Brain** (working name): Peter Green's entry for **Graph Hacks: Context for AI Agents**
(FalkorDB × WeMakeDevs, online, Oct 14 2:31 PM → Oct 18 2:29 PM EDT, $20K prizes; Peter is
registered). An agent that answers "why is this codebase the way it is?" by walking a FalkorDB graph of
decisions → evidence → commits → files, and **shows the path** behind every answer.
Target: **Track 03 Company Brain** (secondary fit Track 01). Plan, schema draft, MCP tool list, demo
questions and the four-day schedule: **PLAN.md**.

## The rule that shapes everything

> "You may reuse general libraries, templates, and infrastructure. The submission and its main
> FalkorDB implementation must be new work completed during the event."

So: **no FalkorDB client code, no Cypher, no ingestion, no agent before Oct 14 2:31 PM EDT.** Before
then only general, graph-agnostic work is allowed. The pre-event commit (0251824) holds exactly that.
Keep the line visible in git history and say so in the submission.

## State at handoff

- `lib/llm.ts` — Ollama chat client: always streams (undici kills header-less connections at 5 min),
  collects tool calls across every chunk (reading only the last chunk dropped them all in Invarail),
  retries 429/5xx and connection failures, not 4xx. `stripThinking` for `<think>` blocks.
- `lib/loop.ts` — generic tool-calling loop returning `{answer, steps[], exhausted}`. The steps trace is
  what the "show the path" view will render.
- 11 tests pass (`npm test`), typecheck clean (`npm run typecheck`), CI workflow written.
- `docker-compose.yml` — stock FalkorDB on host port **6380** (6379 is Invarail's live FalkorDB — do
  not touch it) and the Browser on 3030. `npm run graph:up`.
- Local git only. Not on GitHub yet — creating the public repo is Peter's call.

## The corpus

The Invarail repo at `/Users/petergreen/LocalClaw` (public: github.com/PeterGreenAppliedAI/Invarail):
`DECISIONS.md` (~1,900 lines, dated entries incl. disproven theories), git history (~800 commits;
note: public history was rewritten 2026-09-30, so hashes cited in old notes may be stale — DECISIONS
itself was remapped), `evals/*`, `docs/*`, `CLAUDE.md`. Read it; never modify it from this project.

## How Peter works (carry these over)

- **Config over hardcoding.** "We don't need to hard code these things, you keep doing that. I want it
  in config." Personal things never get committed.
- **Never revert or make a major change without explicit approval.** On a measured regression, revert
  to known-good rather than piling on tuning — and say so.
- **Verify before claiming.** Check exit codes, rerun after "fixes", and correct your own wrong numbers
  openly with a dated note (this session had to, twice).
- **Small local models are first-class.** Design for 7–30B; never let a big model become load-bearing.
  qwen3.5:9b is the measured small-tier pick. Code decides; the model fills small, bounded slots
  (grammar-constrained JSON), and code builds the edges.
- **Keep a decision log** (DECISIONS-style, including what failed) — it is also the blog post.
- **Ask before destructive or outward actions** (force-push, public repo, deleting data).
- **LAN access:** node processes started from a plain shell on the Mac mini are denied LAN access by
  macOS (EHOSTUNREACH). Run anything that talks to the GPU boxes inside the `lab` tmux session
  (`tmux send-keys -t lab '…' Enter`). Model hosts come from `OLLAMA_URL` — never hardcode addresses,
  never commit them.

## Day 1 (from Oct 14 2:31 PM EDT)

1. Finalize the schema in PLAN.md; write it as code (`src/graph/schema.ts`) with indexes.
2. Ingest git history (commits, files, `TOUCHED`) — deterministic, no model.
3. Parse DECISIONS.md headings/dates/sections into `:Decision` nodes with source line ranges; link
   cited commit hashes and file paths by regex — deterministic first.
4. `trace(decision_id)` working end to end on 10 hand-picked decisions, with tests against a real
   FalkorDB (compose, port 6380).
Day 2 adds the model-assisted extraction (measurements, experiments, SUPERSEDES/DISPROVED) with a
fixed JSON schema and human spot-checks; Day 3 the MCP server + agent + path view; Day 4 a second repo,
README, demo video, blog post (side prize: AirPods).

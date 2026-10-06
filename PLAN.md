# Decision Brain — plan for Graph Hacks (FalkorDB × WeMakeDevs, Oct 14–18 2026)

*Working name.* An agent that answers **"why is this codebase the way it is?"** by walking a graph of
decisions, the evidence behind them, the commits that carried them out, and the files they touched —
and **shows the path** behind every answer.

## The rules boundary (read first)

> "You may reuse general libraries, templates, and infrastructure. The submission and its main
> FalkorDB implementation must be new work completed during the event."

| Built BEFORE Oct 14 (allowed: general, graph-agnostic) | Built DURING the event (the entry) |
|---|---|
| This plan; the repo scaffold; `docker-compose.yml` running the stock FalkorDB image | The graph schema in code, every Cypher query, ingestion into FalkorDB |
| `lib/llm.ts` — a small Ollama chat client (tools, streaming-free) | The corpus extractors (DECISIONS.md, git history, eval folders → graph) |
| `lib/loop.ts` — a generic tool-calling loop, no graph knowledge | The MCP server exposing the graph tools |
| Tests for those two libraries | The agent, its prompts, the "show the path" view, the demo, the write-up |

**No FalkorDB client code, no Cypher, no ingestion before the event opens.** Git history timestamps
the line; say so in the submission.

## Tracks — one build, all three

The event page: "Build for one, or for all three at once. Each track has its own prize." One project,
judged on three fronts — each earned by something the build needs anyway:

| Track | What earns it |
|---|---|
| **03 Company Brain** (primary) | The decision graph: decisions traced to evidence, commits and files; answers with sources |
| **02 Memory & Coordination** | The **extraction team** — several local agents ingest the corpus in parallel, coordinating through a shared **board graph** (claims, findings, handoffs) — plus memory across sessions: questions asked, answers the owner confirmed or corrected |
| **01 Agents on Connected Data** | Graph queries as MCP tools the agent chooses between, multi-hop answers with their path, and one action: the **drift agent** runs `still_true` over the docs and opens a fix list |

The story: *a team of local agents builds a company brain together, then answers from it with receipts.*

**Open question to confirm on the event page:** whether "all three at once" means one submission
judged in several tracks, or separate submissions. The FAQ "Can I enter more than one track?" answer
was not captured.

**Fallback:** if Day 2 slips, the single-agent build is a complete Track 03 entry on its own. The extra
tracks are upside, never a dependency.

## The corpus (data, not implementation)

The Invarail repo (public, github.com/PeterGreenAppliedAI/Invarail):
- `DECISIONS.md` — ~1,900 lines of dated entries: decisions, failed experiments, disproven theories,
  measured results, each often citing commits, files, evals, models.
- git history — ~800 commits: message, date, files touched; commit hashes cited by DECISIONS.
- `evals/*/README.md` + `results*.json` — measured outcomes the decisions point to.
- `docs/*.md`, `CLAUDE.md` — current-state descriptions (what is true now).

A second, smaller public repo should also ingest cleanly (judges may ask "does it work on anything
else?") — pick one with an ADR folder or a CHANGELOG.

## Graph schema (draft — finalize Day 1)

```
(:Decision  {id, title, date, summary, status: active|superseded|reverted})
(:Experiment{id, title, date, hypothesis, verdict: confirmed|disproven|inconclusive})
(:Measurement {id, metric, value, unit, n, source})      // "0/20 vs 16/20", "18/30 → 30/30"
(:Commit    {sha, date, message})
(:File      {path})
(:Model     {name})                                        // qwen3.5:9b, phi4 — decisions are often model-specific
(:Doc       {path, section})                               // where the claim is written down now
(:Concept   {name})                                        // "reroute", "write gate", "prefix cache"

(:Decision)-[:BECAUSE]->(:Measurement|:Experiment)
(:Decision)-[:SUPERSEDES]->(:Decision)
(:Experiment)-[:DISPROVED|:SUPPORTED]->(:Decision)         // a disproven theory is first-class
(:Decision)-[:IMPLEMENTED_BY]->(:Commit)-[:TOUCHED]->(:File)
(:Decision)-[:ABOUT]->(:Concept)
(:Measurement)-[:ON_MODEL]->(:Model)
(:Doc)-[:DESCRIBES]->(:Concept)
(:Decision)-[:CITED_IN]->(:Doc)
```

Every node keeps `source` (file + line range or commit) — the "show the path" requirement is answered
by data, not by the model.

## MCP tools (the agent's only way to see the graph)

| Tool | Returns |
|---|---|
| `why(file_or_concept)` | Decisions that shaped it, newest first, each with its evidence path |
| `trace(decision_id)` | The full path: evidence → decision → commits → files, plus what it superseded |
| `what_breaks(file)` | Decisions whose rationale depends on this file — "what do I need to re-check if I change it?" |
| `disproven(concept)` | Theories tried and rejected around a concept — so nobody retries them |
| `still_true(decision_id)` | Does the current doc still say what the decision says? Flags drift |
| `search(text)` | Entry point when the question names nothing exact |

Graph algorithms worth one tool each if time allows: shortest path between two concepts
("how is the router connected to memory?"), and centrality ("which files carry the most decisions?").

## The extraction team (Track 02)

Turning ~1,900 lines of DECISIONS.md into nodes and edges is the slow, model-heavy part — the natural
place for parallel agents, and the reason the team exists (not decoration).

- **Workers:** 3–4 extraction agents on the local coding model served with real concurrency (vLLM/SGLang
  on the GB10 box — glm-5.3-flash; keep `think` on: with thinking off it narrates deliberation into the
  answer). Each fills ONE fixed JSON shape per section (grammar-constrained); code builds the edges.
- **The board** — a separate FalkorDB graph from the brain itself:
  ```
  (:Section {id, lines})                          // a unit of work: one DECISIONS entry
  (:Agent {name, model})
  (:Agent)-[:CLAIMED {at, expiresAt}]->(:Section) // claims expire: a crashed worker can't hold a section
  (:Finding {kind, text, confidence})-[:FROM]->(:Agent)
  (:Finding)-[:ABOUT]->(:Section)
  (:Finding {kind:'cross_ref'})-[:POINTS_TO]->(:Section)   // "this entry supersedes one in August" — a handoff
  ```
- **Rules carried from Invarail's memory work:** every board write records which agent and whether code
  verified it; a finding informs, it never authorizes (an agent can't skip validation because a finding
  says so); the same-fact check keeps parallel writers from flooding the board with rewordings.
- **The integrator** (code, not a model) promotes verified findings from the board into the brain graph
  and resolves cross-references into SUPERSEDES / DISPROVED edges.

## Memory across sessions (Track 02)

The brain remembers its conversations: `(:Question)-[:ANSWERED_WITH]->(:Path)`, plus the owner's
verdict on each answer (confirmed / corrected). A corrected answer becomes evidence the next time the
same path is walked. Small, and it shows persistence that updates over time.

## The agent Rules: every answer cites node ids; the UI renders the cited subgraph;
"I don't know" when no path exists. Runs on a local model (the point of the parent project) — qwen3.5:9b
measured best on this hardware class.

## Demo questions (must each produce a visible path)

1. "Why does the router prompt keep a rule that's factually wrong about memory?" → the 2026-09-30 A/B
   (0/20 vs 16/20), the revert commit, `src/router/prompt.ts`.
2. "Why was the `handoff` tool removed the same night it was built?" → the task-board 2/5 vs 5/5
   measurement, the parser error, the commit.
3. "If I change `src/memory/fact-store.ts`, what decisions should I re-check?" → `what_breaks`.
4. "What has been tried and disproven about memory?" → `disproven("memory")`.
5. "Is CLAUDE.md still right about code_gen?" → `still_true` — it caught exactly this drift by hand.

## Four days

| Day | Goal | Done when |
|---|---|---|
| 1 (Oct 14–15) | Schema in code; ingest git history + DECISIONS headings/dates/commit refs (deterministic) | `trace` works on 10 hand-picked decisions |
| 2 | The extraction team: board graph, claims with expiry, 3–4 parallel workers filling the fixed JSON shape, the integrator promoting verified findings into SUPERSEDES/DISPROVED/BECAUSE edges; human spot-check | Demo questions 1–2 answer with paths; board shows who extracted what |
| 3 | MCP server + agent + "show the path" view; question memory; the drift agent's fix list | All five demo questions on a local model; one drift finding surfaced |
| 4 | Second repo ingested; README, demo video, blog post (side prize) | Submitted with a day to spare |

If Day 2's team is not working by the end of Day 2, fall back to a single sequential extractor and keep
the Track 03 entry whole.

## Judging angles to make explicit

- The graph **decides** what the agent says (no path → no claim).
- Traceability is the product, not a feature.
- Disproven theories as first-class nodes — memory of what *didn't* work.
- Runs fully local.

## Risks

- Extraction quality from prose → keep the LLM's job to filling a fixed JSON shape; code builds edges.
- Scope → the five demo questions are the spec; anything else is Day 4 or never.
- The team adds moving parts → claims expire, the integrator is code, and the sequential fallback is
  one flag away.
- Model concurrency → the A5000 serves one 27B at a time (parallel jobs queue and time out); parallel
  workers belong on the box with batched serving.

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

The official rules page (wemakedevs.org/hackathons/falkordb/rules) adds: "The main coding and design
work must begin after the hackathon starts. You may discuss ideas, create notes, sketch the graph
model, or prepare diagrams beforehand." Also: **AI coding assistants must be disclosed**; data must be
public, synthetic or owned (Invarail is public and Peter's; the second repo must be public); FalkorDB
must be central, not decorative. Never copy or adapt Invarail's own FalkorDB code (`src/memory/`,
orchestrator, dispatch) — ideas only, rewritten.

**Submission checklist (from the rules):** public repo · README with setup instructions **and the graph
data model** · the Cypher queries · demo video · working deployment or local setup guide · track
designation (all three) · AI-assistant disclosure.

## Tracks — one build, all three

The event page: "Build for one, or for all three at once. Each track has its own prize." One project,
judged on three fronts — each earned by something the build needs anyway:

| Track | What earns it |
|---|---|
| **03 Company Brain** (primary) | The decision graph: decisions traced to evidence, commits, files and the **people** who authored them ("who owns what, who knows what"); answers with sources; knowledge kept current (incremental ingest + drift) |
| **02 Memory & Coordination** | The **extraction team** — several local agents ingest the corpus in parallel, coordinating through a shared **board graph** (claims, findings, handoffs) — plus memory across sessions: questions asked, answers the owner confirmed or corrected; **one graph per repo** (tenant isolation via FalkorDB multigraph) |
| **01 Agents on Connected Data** | Graph queries **and graph algorithms** (shortest path, PageRank) as MCP tools the agent chooses between, multi-hop answers with their path, and one action: the **drift agent** runs `still_true` over the docs and opens a fix list |

The story: *a team of local agents builds a company brain together, then answers from it with receipts.*

**Confirmed (event FAQ, 2026-10-14):** one project may enter one, two or all three tracks; each track
has its own prize. Track 03 focus names people/teams/ownership explicitly; Track 01 names shortest path,
PageRank and centrality as agent tools; Track 02 names per-tenant memory and high-concurrency writes —
the plan below covers each.

**Fallback:** if Day 2 slips, the single-agent build is a complete Track 03 entry on its own. The extra
tracks are upside, never a dependency.

## The corpus (data, not implementation)

The Invarail repo (public, github.com/PeterGreenAppliedAI/Invarail):
- `DECISIONS.md` — ~1,900 lines of dated entries: decisions, failed experiments, disproven theories,
  measured results, each often citing commits, files, evals, models.
- git history — ~800 commits: message, date, files touched; commit hashes cited by DECISIONS.
- `evals/*/README.md` + `results*.json` — measured outcomes the decisions point to.
- `docs/*.md`, `CLAUDE.md` — current-state descriptions (what is true now).

**Parsing notes:** DECISIONS entries are **not in date order** (the first headings run Sep 27, Sep 28,
Oct 5, Oct 1, Sep 30) — take the date from the heading, never from file position, and never infer
"supersedes" from position. 348 `##`/`###` headings; 780 commits. Invarail is mostly one author, so
"who knows what" is thin on this corpus alone.

**Second repo — no longer optional.** A smaller public repo with **several contributors** and an ADR
folder or CHANGELOG. It carries three things: "does it work on anything else?", real ownership questions
(`who_knows`) for Track 03, and visible tenant isolation (its own graph) for Track 02. Pick it before the
event opens.

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
(:Person    {name, email})                                 // from git authors (deterministic); co-author trailers too

(:Person)-[:AUTHORED]->(:Commit)

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
| `who_knows(file_or_concept)` | People ranked by commits touching it and decisions they carried out |
| `connect(a, b)` | Shortest path between two concepts/files — "how is the router connected to memory?" |
| `load_bearing()` | PageRank over files and decisions — which files carry the most rationale |

The two algorithm tools are core, not stretch: FalkorDB has them built in, each is one query, and
Track 01 names them. Every tool takes the graph (repo) name — one graph per repo.

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
- **The demo moment for Track 02 is the handoff, not the claims machinery:** worker A, reading an
  entry, finds it supersedes another; it posts a `cross_ref`; worker B (holding that other section)
  picks it up and the integrator draws the edge. Without that the team is just a parallel map — show it
  in the board view and the video.

## Memory across sessions (Track 02)

The brain remembers its conversations: `(:Question)-[:ANSWERED_WITH]->(:Path)`, plus the owner's
verdict on each answer (confirmed / corrected). A corrected answer becomes evidence the next time the
same path is walked. Small, and it shows persistence that updates over time.

**Keeping knowledge current:** ingest is incremental — new commits since the last ingest are added
without a rebuild (git history is append-only; DECISIONS entries keyed by heading + date). Together
with `still_true` this answers Track 03's "keeping knowledge current as things change".

## The agent

Rules: every answer cites node ids; the UI renders the cited subgraph;
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

## Deployment

The FAQ prefers a live deployment; projects that can't deploy need full local setup instructions and a
working demo video. We do both, split by what can honestly run in public:

- **Live:** FalkorDB on this Mac mini (the compose container, port 6380) holding the prebuilt graphs,
  the MCP graph tools, and the "show the path" view. The tools are plain Cypher — no model needed — so a
  judge can run `why`, `trace`, `connect` themselves and check that the graph decides the answer.
  Exposed through a tunnel to the path view only, never FalkorDB's port or the Browser; read-only.
- **Also live:** recorded agent sessions (real local-model runs with their step traces) replayable in
  the path view, labelled as recordings.
- **Local only:** the live agent and the extraction team (models on the LAN GPU boxes, which stay
  private). Covered by the demo video and setup instructions.
- **Config, off by default:** the agent's model endpoint, so a deployed instance could point at a hosted
  model later without code changes.

Needs: a public repo (Peter's call) and a tunnel choice — decide by Day 3.

## Four days (really three and a half)

| Day | Goal | Done when |
|---|---|---|
| 1 (Oct 14 2:31 PM → Oct 15) — half day | Schema in code; ingest git history (commits, files, **people**) + DECISIONS headings/dates/commit refs (deterministic) | `trace` works on 10 hand-picked decisions |
| 2 | The extraction team: board graph, claims with expiry, 3–4 parallel workers filling the fixed JSON shape, the integrator promoting verified findings into SUPERSEDES/DISPROVED/BECAUSE edges; human spot-check | Demo questions 1–2 answer with paths; board shows one real cross_ref handoff |
| 3 | MCP server (incl. `who_knows`, `connect`, `load_bearing`) + agent + "show the path" view; **second repo ingested into its own graph**; question memory; drift agent's fix list | All five demo questions on a local model; one ownership question on the second repo; one drift finding |
| 4 | Deployment (path view + tools + recordings); README with setup; demo video; blog post (side prize) | Submitted with a day to spare |

If Day 2's team is not working by the end of Day 2, fall back to a single sequential extractor and keep
the Track 03 entry whole. If the GB10 box isn't serving concurrently by mid-Day 2, fall back then — don't
debug serving.

**Cut order if time runs short:** question memory → drift agent → extraction team (sequential
fallback). The second repo and the two algorithm tools are not on the cut list — they carry the
ownership, tenancy and graph-algorithm criteria.

## Judging angles to make explicit

- The graph **decides** what the agent says (no path → no claim).
- Traceability is the product, not a feature.
- Disproven theories as first-class nodes — memory of what *didn't* work.
- Runs fully local (the agent and team) — and the graph tools are live for judges to check.

## Risks

- Extraction quality from prose → keep the LLM's job to filling a fixed JSON shape; code builds edges.
- Scope → the five demo questions are the spec; anything else is Day 4 or never.
- The team adds moving parts → claims expire, the integrator is code, and the sequential fallback is
  one flag away.
- Model concurrency → the A5000 serves one 27B at a time (parallel jobs queue and time out); parallel
  workers belong on the box with batched serving.

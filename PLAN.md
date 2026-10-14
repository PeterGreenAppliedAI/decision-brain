# Decision Brain — plan for Graph Hacks (FalkorDB × WeMakeDevs, Oct 14–18 2026)

*Working name.* An agent that answers **"why is this codebase the way it is?"** by walking a graph of
decisions, the evidence behind them, the commits that carried them out, and the files they touched —
and **shows the path** behind every answer.

## Progress (updated 2026-10-14, evening of Day 1)

| Piece | State |
|---|---|
| Ingest: git, DECISIONS.md, ADRs; convergent re-ingest | done |
| Extraction team: board, claims/expiry, handoffs, code verification, integrator | done — Invarail 151/151 (31 min), content-publisher 16/16 (81 s) |
| Rationale graph, nine tools, MCP server | done |
| Agent (local GLM over MCP) + grounding check | done — demo questions 1–4 answered, Kubernetes declined |
| `review <commit>` (Track 01 action) | done — deterministic, as-of-change |
| Board view (live) | done |
| Ask + Path views | next |
| Question memory | next |
| Drift (`still_true`) — secondary action | later |
| Deployment, demo video, blog post | Day 4 |

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
| **01 Agents on Connected Data** | Graph queries **and graph algorithms** (shortest path, PageRank) as MCP tools the agent chooses between, multi-hop answers with their path, and the action: **`review` a commit or diff** — the graph says which decisions, measurements and disproven theories the change touches and who knows the code (the drift fix list is a secondary action) |

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

## Graph schema — as built

The draft that stood here (written before the event, as the rules allow) is superseded by the schema
in code; the README's **graph data model** section is the reference. Changes from the draft, each
with its reason in DECISIONS.md: `IMPLEMENTED_BY` became `RECORDED_IN` (git blame) and `CITES` (a
cited hash is evidence, not implementation); `Person`/`AUTHORED` added; `Doc`/`DESCRIBES` not built
yet (drift); `RATIONALE` added as a derived edge for PageRank and paths; `ABOUT_BROADLY` for common
concepts; ADRs ingest into the same `Decision` shape.

## MCP tools (the agent's only way to see the graph)

| Tool | Returns |
|---|---|
| `why(file_or_concept)` | Decisions that shaped it, newest first, each with its evidence path |
| `trace(decision_id)` | The full path: evidence → decision → commits → files, plus what it superseded |
| `what_breaks(file)` | Decisions whose rationale depends on this file — "what do I need to re-check if I change it?" |
| `disproven(concept)` | Theories tried and rejected around a concept — so nobody retries them |
| `still_true(decision_id)` | Does the current doc still say what the decision says? Flags drift |
| `review(commit_or_diff)` | The deterministic review packet for a change (see Review below) |
| `search(text)` | Entry point when the question names nothing exact |
| `who_knows(file_or_concept)` | People ranked by commits touching it and decisions they carried out |
| `connect(a, b)` | Shortest path between two concepts/files — "how is the router connected to memory?" |
| `load_bearing()` | PageRank over files and decisions — which files carry the most rationale |

The two algorithm tools are core, not stretch: FalkorDB has them built in, each is one query, and
Track 01 names them. Every tool takes the graph (repo) name — one graph per repo.

## Review — the Track 01 action (2026-10-14)

Peter: *"we are also inadvertently building a very good code review tool"* — and *"we might end up using
this as our code review tool if we can make it consistent."* Consistency is the requirement, so:

1. **The review packet is deterministic** — code only. Changed files (from a commit, a range, or a
   diff) → decisions whose rationale depends on them (MENTIONS, or recorded/cited commits that touched
   them), each with its measurements and status → disproven experiments and failed decisions on the
   same files and concepts → superseded reasoning to ignore → who knows the files (human authors by
   commits). Fixed queries, stable ordering: the same diff gives the same packet, every time.
2. **The write-up is optional and bounded** — the local model turns the packet into a short review
   note, citing packet item ids for every claim; code rejects a claim citing anything not in the
   packet. The wording may vary; the facts cannot.

`npm run review -- --graph <g> <commit|range>` prints the packet (and the note with `--write`); the Ask
view renders the same packet as a path. Demo: a real Invarail commit touching `src/router/prompt.ts`.

## The extraction team (Track 02)

Turning ~1,900 lines of DECISIONS.md into nodes and edges is the slow, model-heavy part — the natural
place for parallel agents, and the reason the team exists (not decoration).

- **Workers:** 3–4 extraction agents, **all local** — glm-5.3-flash on the GB10's vLLM (URL in `.env`).
  No paid API anywhere (Peter, 2026-10-14). Concurrency verified: 4 parallel requests → vLLM reports 4
  running, 0 waiting; ~1.6× throughput over sequential. Thinking stays on; the answer is
  grammar-constrained JSON (`response_format: json_schema`) and the reasoning arrives separately.
- **The board** — its own FalkorDB graph per repo (`<repo>__board`), separate from the brain:
  ```
  (:Section {id, title, status: pending|claimed|done|failed, attempts, claimedBy, expiresAt})
  (:Agent {name, model, lastSeen})
  (:Agent)-[:CLAIMED {at, expiresAt}]->(:Section)    // claims expire: a crashed worker can't hold work
  (:Finding {kind, data, quote, verified, reason})-[:FROM]->(:Agent), -[:ABOUT]->(:Section)
  (:Handoff {relation, status: open|claimed|confirmed|rejected})-[:FOR]->(:Section)
  (:Finding {kind:'cross_ref'})-[:RAISED]->(:Handoff)
  (:Event {at, kind, agent, section, text})          // the feed the board view streams
  ```
  Writes to one graph are serialized by FalkorDB, so a claim is one atomic query — no locks in code.
- **The handoff is the coordination:** worker A reads an entry and says it supersedes/revises/disproves
  entry X (chosen from an id list, so code can check it exists). That opens a Handoff on X. Another
  worker claims the handoff, reads X, and confirms or rejects with a quote from X. Only a confirmed
  handoff becomes an edge — two agents agreed, each with evidence from their own side.
- **Code verifies every finding** (the model never authorizes): quotes must appear verbatim in the
  section; a measurement's value must appear in its quote; concepts and models must appear in the
  text; a cross-ref target must exist and differ from the section. Failed checks stay on the board,
  marked unverified with the reason — visible, never promoted.
- **The integrator** (code, not a model) promotes verified findings into the brain graph —
  `(:Measurement)`, `(:Experiment)`, `(:Concept)`, `(:Model)` — and confirmed handoffs into
  SUPERSEDES / REVISES / DISPROVES edges, each carrying who extracted it.
- **Considered and dropped (2026-10-14):** a mixed team with frontier agents on public repos and local
  agents on private ones, the rule enforced in the claim query. Strong story, but it needs a paid API
  to be real in the product. Local only.

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

## The frontend (one small app, three views)

The video and the live deployment both need something to look at; it is also how we debug the team.
One Node HTTP server in this repo, static HTML, Cytoscape.js from a CDN, server-sent events for live
updates. No framework, no build step, read-only, no auth — the same build judges get.

| View | Shows | Track | When |
|---|---|---|---|
| **Board** (live) | The extraction team working: sections claimed, findings arriving, a cross_ref handoff drawn between two workers, an expired claim taken over | 02 | Day 2 |
| **Ask** | A question, the agent's tool calls streaming in, the answer with every cited node clickable | 01 | Day 3 |
| **Path** | The cited subgraph: decision → evidence → commit → files → people, each linked to its source lines | 03 | Day 3 (never cut) |

Plain and functional: dark, monospace, one accent colour per node type. The FalkorDB Browser (:3030)
covers raw exploration — no custom explorer.

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

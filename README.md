# Decision Brain

*Entry for [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb) (FalkorDB × WeMakeDevs, Oct 14–18 2026) — all three tracks.*

**Why is this codebase the way it is?** Decision Brain turns a repository's decision log and git
history into a FalkorDB graph — decisions, the measurements and experiments behind them, what
superseded what, the commits that recorded them, the files they rest on, the people who know them —
and answers questions from it **with the path behind every answer**. Everything runs locally: the
graph in FalkorDB, the agents on a local model.

```
git history ─┐                                                       ┌─► Ask: answer + checked citations + path
decision log ├─► ingest ─► 4 local agents ⇄ board graph ─► brain graph ┤
ADRs ────────┘   (code)    (claim, extract, verify, handoff)  (FalkorDB) └─► review <commit>: what this change threatens
```

> *"Why does the router prompt keep a rule that's factually wrong about memory?"*
>
> Because the "wrong" rule is load-bearing for the weakest model. The decision
> [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing] records that when the rule was
> corrected, qwen2.5:7b stopped routing memory requests: **"New text: 0/20 to memory. Old text:
> 16/20."** — the hypothesis that fixing the text would help was disproven. *(local GLM, 11.6 s,
> 1 tool call; code checked the citation and both figures against the cited evidence — the wording
> itself is the model's)*

**Live:** [decision-brain.devmesh.tech](https://decision-brain.devmesh.tech) — Board, Ask and Review on the real graphs, read-only (runs on the author's machine through the judging window; Ask uses a local model, two questions at a time) · **Demo video:** [youtube.com/watch?v=4OxUIsg-GYE](https://www.youtube.com/watch?v=4OxUIsg-GYE) · **Blog:** [on DEV](https://dev.to/peter_green_fb83c862e8fc7/decision-brain-giving-ai-the-why-behind-the-work-with-falkordb-od5) · **Walkthrough:** [DEMO.md](DEMO.md) — the code-review story, every step verified on
real data.

## Tracks

| Track | What to look at |
|---|---|
| **03 Company Brain** (primary) | One FalkorDB graph per repository: decisions → measurements and experiments → commits → files → people (humans and AI co-authors). Answers cite and are code-checked; `who_knows`, `origin`, `told` (what an AI agent's instruction files said at a commit); file and directory summaries; `sync` keeps it current. |
| **01 Agents on Connected Data** | Twelve MCP tools over Cypher, full-text search and FalkorDB algorithms (`algo.pageRank`, `algo.SPpaths`), chosen by a local tool-calling agent; the action is `review <commit>` — the decisions a change threatens, as of that commit — in the CLI, over MCP, and on the Review page. |
| **02 Memory & Coordination** | The agents coordinate only through a FalkorDB board graph: atomic claims, expiry and takeover, dependency-ordered tasks, and handoffs a *second* agent must confirm with a verbatim quote. The shared memory stays honest: content hashes invalidate evidence when an entry changes; `sync` redoes only what changed. *Not built: memory of past questions.* |

## Judge quick path

| Needs a model server? | What |
|---|---|
| **No** — Docker + Node only | `ingest` a repo, then `trace`, `review`, all twelve MCP tools, the Board view of a finished board |
| **Yes** — OpenAI-compatible, tool calling + JSON-schema output | the extraction team, summaries, `ask` and the Ask view, `sync` when something changed |

Fastest look without a model: ingest any repo with a `DECISIONS.md` or ADR folder and run `trace` and
`review` on it (seconds). A fresh-clone run on a repository we had never seen — every command, timing and
the four defects it found — is in [eval/JUDGE-PATH.md](eval/JUDGE-PATH.md).

## Run it

Requires Node ≥ 22.9 (scripts use `--env-file-if-exists`), Docker, and — for the model-backed parts — an
OpenAI-compatible model server **with tool calling and JSON-schema structured output**. Verified with
`glm-5.3-flash` on vLLM (set `LLM_REASONING_EFFORT=low` for GLM), which the published results use. Also
run on `qwen3.8:27B` via Ollama's OpenAI-compatible endpoint: extraction, sync, review and Ask all work, but
its answers left figures uncited more often (fully supported in 2 of 6 runs of one question vs 6 of 7 for
GLM). Nothing calls a paid API. First runs download the FalkorDB image and npm packages.

```sh
npm install
cp .env.example .env                   # then set LLM_URL to your model server
npm run graph:up                       # FalkorDB 6.0.2 on 127.0.0.1:6380, Browser on :3030

npm run ingest -- <path-to-repo> --graph <name>        # git + DECISIONS.md and/or ADRs → the brain graph (no model)
npm run team -- --graph <name> --workers 4 --reset     # the extraction team → board → integrate
npm run summarize -- --graph <name> --repo <path>      # file → directory → repo summaries (board <name>__files)
npm run web                                            # Board http://127.0.0.1:4100, Ask /ask.html, Review /review.html
WEB_LOCAL_ACTIONS=1 npm run web                        # local only: adds Sync, the demo steps and "Add repository"

npm run ask -- --graph <name> "Why is X the way it is?"   # the agent, with its path and grounding check
npm run review -- --graph <name> <commit> --repo <path>   # the review packet; --repo rebuilds the log as of the commit (no model)
npm run trace -- --graph <name> --find "router"           # find a decision; then trace <decision-id> (no model)
npm run mcp -- --graph <name>                             # the tools for any MCP client (stdio)
npm run sync -- --graph <name> --repo <path>              # after a pull: redo only what changed; again → nothing
npm run integrate -- --graph <name>                       # re-promote the board without re-extracting
npm run what-breaks -- --graph <name> <file> [--repo <path>]  # before changing a file: standing decisions, disproven attempts (no model)
npm run embed -- --graph <name>                           # search by meaning: embed decisions (EMBED_URL); sync does it too

npm run eval:v2 -- run | score | sensitivity              # evaluation v2 (frozen set; needs the three graphs below)
npm run eval:run                                          # v1 regression set (graphs invarail, content-publisher)
```

**Before every edit, automatically (Claude Code hook).** `scripts/hooks/pre-edit.mjs` runs `what-breaks` before the agent
edits a file and hands it the decisions that rest on that file and what was already disproven there. It only informs:
it never blocks an edit or changes permissions, stays silent when there is nothing recorded, and speaks once per file per
session. In the edited repository's `.claude/settings.json`:
```json
{ "hooks": { "PreToolUse": [ { "matcher": "Edit|Write|MultiEdit", "hooks": [ { "type": "command",
  "command": "DB_HOME=/path/to/decision-brain DB_GRAPH=<name> node /path/to/decision-brain/scripts/hooks/pre-edit.mjs" } ] } ] } }
```

**MCP client** (e.g. Claude Desktop or Cursor) — run from the repository directory:
```json
{ "mcpServers": { "decision-brain": { "command": "npm", "args": ["run", "-s", "mcp", "--", "--graph", "<name>"], "cwd": "/path/to/decision-brain" } } }
```

Corpora used, all public: [Invarail](https://github.com/PeterGreenAppliedAI/Invarail) (DECISIONS.md, 151
entries, 780 commits), [alphagov/content-publisher](https://github.com/alphagov/content-publisher) (16 Nygard
ADRs, 8,342 commits) and [thomvaill/log4brains](https://github.com/thomvaill/log4brains) (11 date-named
ADRs); [npryce/adr-tools](https://github.com/npryce/adr-tools) was added from the page. Timings on four local
workers: Invarail extraction 31 min, summaries 52 min; log4brains extraction 37 s, summaries 17 min.

**Settings** come from the environment (see [.env.example](.env.example)) — nothing is hardcoded.
`npm test` runs 124 tests, most against a real FalkorDB (fixture repos and graphs built per test); CI runs
them on every push against the same pinned FalkorDB version.

## Tools (MCP and CLI) — twelve

| Tool | Answers | Graph work |
|---|---|---|
| `search(query)` | Which decisions are about this? | full-text index, all-words matches first; then matches by meaning from a vector index (optional, `EMBED_URL`) |
| `why(target)` | Which decisions shaped this file / topic? | rationale + concept edges, newest first, with evidence |
| `trace(decision_id)` | What does this decision say, and what is it connected to? | text, commits, files, people, relations with quotes |
| `what_breaks(file)` | If I change this, what should I re-check? | standing vs settled decisions resting on the file |
| `disproven(target)` | What was already tried and rejected here? | disproven experiments, failed/superseded decisions |
| `who_knows(target)` | Who knows this code or topic? | authorship, humans and agents apart |
| `connect(a, b)` | How are these two things related? | `algo.SPpaths`, undirected, never through a person or hub |
| `load_bearing()` | Which files carry the most reasoning? | `algo.pageRank` over the rationale graph |
| `review(commit)` | What does this change touch, as of when it was made? | the deterministic review packet |
| `what_is(target)` | What does this file or directory do now? | its summary — describes code at a commit, never intent; flags staleness |
| `origin(file)` | What was it meant to do, and how did that change? | birth commit + decision recorded there, then every later decision on it |
| `told(commit)` | What was the AI agent told when it wrote this? | instruction-file guidance in force at the commit, about its files; changed since? |

## How it works

1. **Ingest — code, no model.** Git history becomes commits, files and people (humans and AI
   co-authors, by name only). The decision log — a `DECISIONS.md`, or an ADR directory — becomes one
   `Decision` per entry with its date, status and exact source lines. `git blame` links each entry to
   the commit that recorded it; hashes and paths the text names are linked if git has them. Every
   version of the repo's AI-agent instruction files (AGENTS.md, CLAUDE.md, .cursorrules, …) is kept
   as dated section spans, so the guidance an agent had at any commit is a query (`told`).
2. **Extract — a team of local agents.** Four workers claim entries from a shared **board graph**
   (claims expire; a crashed worker's work is taken over), fill one fixed JSON shape per entry —
   measurements, experiments and their verdicts, concepts, models, relations to other entries — and
   **code checks every item's quote is verbatim in the entry** (and a measurement's value inside its
   quote). The *interpretation* — a verdict of "disproven", a metric's name — is still the model's;
   quote-matching proves provenance, not meaning. A relation one agent finds ("this entry revises
   ADR 8") becomes a **handoff**: a *different* agent reads the other entry and must confirm it with a
   quote from that side. Only quote-matched findings and confirmed handoffs reach the brain.
3. **Answer — graph tools over MCP.** Twelve read-only tools (above), deterministic in their ordering.
   The agent — a local model — chooses among them over MCP and must cite the ids they returned. Code
   then reports three separate checks: **citations** (each names something a tool returned),
   **figures** (each number appears in the evidence its citation brought — invented or altered
   measurements fail), and **abstention** (an answer that opens with "I don't know" and makes no
   claims). The wording itself is model-written and not verified by code; the answer says so.
4. **Review — the action.** `review <commit>` builds a deterministic packet for a change: the decision
   it records, standing decisions resting on its files (with their measurements) to re-check,
   experiments already disproven there, superseded reasoning not to cite, and who knows the files —
   **as of the change**: with the repo at hand, the decision log is rebuilt as it stood at that commit
   from git — only entries that existed then, each with the status its own text gave it then, and
   extracted evidence kept only where the entry's text is unchanged since (content hashes). Without
   the repo, decisions are filtered by date, and the packet says it is approximate. Each packet
   records its basis and a fingerprint of the graph state: same commit, same graph → same packet.

## What code checks — and what it doesn't

| Claim | Checked by code? |
|---|---|
| A finding's quote appears verbatim in its source entry | **yes** |
| A measurement's value appears inside its quote | **yes** |
| An experiment's verdict (confirmed / disproven) matches what the quote says | no — model interpretation |
| A relation between two entries | a second agent must confirm it with a quote from the other entry; still model judgment |
| An answer's citations name things the tools returned | **yes** |
| An answer's figures appear in the evidence its citations brought | **yes** |
| An answer's prose is supported by its citations | no — model-written |
| A summary's function / export / import names exist in the file | **yes** |
| A summary's description of what the code does | no — model-written, labelled as description, never as intent |

## Evidence follows the text

Every decision carries a content hash of its title and text. Every finding records the hash of the
text it was extracted from (read in the same query as the text), and every confirmed relation the
hash of the other entry its confirmer read. The integrator promotes only evidence whose hash matches
the entry's current text, and reports what it left out. Re-running the team after an entry is edited
re-extracts exactly the changed entries and re-checks the relations that touch them. `npm run sync`
does all of it after a pull — ingest, re-extraction of changed entries, re-summaries of changed files
and their directories — and a second sync does nothing.

## Evaluation

**v2** ([eval/v2/RESULTS.md](eval/v2/RESULTS.md)): 24 questions across the three repositories, frozen
before any system saw them ([eval/v2/SPEC.md](eval/v2/SPEC.md)), answered by Decision Brain and by the same
model given keyword-search results, judged blind against key facts. Three runs: 1 and 2 with word search,
3 with search by meaning added; runs 2 and 3 judged by fresh agents that saw only the anonymized sheet.

| | Decision Brain (runs 1 · 2 · 3) | Same model + keyword search |
|---|---|---|
| Required evidence cited | 20/20 · 20/20 · 20/20 | 15/20 · 15/20 · 15/20 |
| Answers passing the rubric | 17/20 · 16/20 · 19/20 | 11/20 · 10/20 · 12/20 |
| False premises corrected | 4/4 · 4/4 · 4/4 | 2/4 · 2/4 · 2/4 |
| Correct abstentions | 4/4 · 4/4 · 4/4 | 4/4 · 4/4 · 4/4 |
| Median latency | 20.6 · 22.9 · 23.0 s | 7.9 · 7.8 · 7.5 s |

**The claim:** on this frozen set, Decision Brain passed more answer rubrics than the same model with
keyword search in every run, at roughly 2.6–3x the latency — because its tools find entries keyword search
misses. With every borderline judging call decided against it, it still leads (14/20 vs 12/20 in run 2,
15/20 vs 13/20 in run 3; `npm run eval:v2 -- sensitivity`); the premise result does not survive that and
is not claimed as robust. Run 3's three extra passes were trap questions, two of them borderline calls, so
the gain is not attributed to search by meaning; what that search measurably adds is retrieval by meaning
(the answering entry is the nearest match for 18 of 20 questions). **Limits:** 24 questions, one model;
questions and key facts written by Claude, which built the system; run 1 judged by that same session
(partly blind); one run-3 abstention was a borderline call; owner spot-check pending. Details, every miss
and the hand check of flagged figures are in RESULTS.md and the per-run files beside it.
The **v1** set ([eval/RESULTS.md](eval/RESULTS.md)) was
used while developing and is kept as a regression set only.

## Limitations (known, not yet fixed)

- **Keeping current is a command, not a daemon.** `npm run sync` after a pull redoes only what changed
  (changed files and their directories, changed or new decisions) and nothing else; it does not run by
  itself — schedule it, or call it from a hook.
- **A retitled entry looks new to a historical review.** A decision's id follows its title, so an
  entry whose *heading* was edited after the reviewed commit is not matched to its earlier self, and
  is treated as not existing then. (Text edits are handled; heading edits are not yet.)
- **The by-date fallback is approximate** (no repo path given): an entry written later but dated
  earlier shows through. Set `REPO_PATHS` (or pass `--repo`) for the rebuilt review.
- **Without a repo path, the reviewer cut-off and `told` use timestamps.** With `REPO_PATHS` or
  `--repo` they use the commit's ancestry; without, the committer timestamp, which a branch merged long
  after its commits can mislead.
- **A figure the answer repeats from the question is "unverified"**, whether the answer rejects or
  endorses it — code does not try to tell them apart.
- **Search by meaning depends on an embedding server** (`EMBED_URL`). Without it, search uses words only,
  and nothing else changes. Distance cannot tell "no record" from "a related record", so declining to
  answer still rests on the agent.
- **No "why" without a written source.** A repo with no decision log, ADRs or agent-instruction files
  gets ownership, history and file summaries — not reasons. Commit messages and PR descriptions are
  not mined yet.
- **The checker verifies figures, not meaning.** A correctly copied number used for the wrong thing
  passes (see inv-02 in the evaluation). Prose claims are model-written.
- **Labels distinguish relevant from irrelevant, not required from supporting.** A good answer may
  rest on fewer entries than were labelled (e.g. inv-06), which lowers measured recall.
- **Tested on three repositories and one model server** (glm-5.3-flash on vLLM): Invarail
  (DECISIONS.md), content-publisher (Nygard ADRs), log4brains (date-named MADR ADRs, run from a fresh
  clone — see eval/JUDGE-PATH.md). Also run on qwen3.8:27B via Ollama (see Run it).

## The graph data model

One FalkorDB graph per repository (multigraph tenancy), plus one board graph per repository for the
extraction team.

**Brain graph (`<repo>`)**

| Node | Properties | From |
|---|---|---|
| `Decision` | `id, title, heading, date, datePrecision, category, status, statusText, source, sourceFile, body` | decision log / ADRs (code) |
| `Commit` | `sha, short, date, message` | git (code) |
| `File` | `path` | git (code) |
| `Person` | `name, kind: human\|agent` | git authors and Co-Authored-By trailers (code) |
| `Measurement` | `id, metric, value, quote, extractedBy, pos` | the team, verified |
| `Experiment` | `id, hypothesis, verdict: confirmed\|disproven\|inconclusive, quote, extractedBy, pos` | the team, verified |
| `Concept` | `name, generic, share` | the team, verified |
| `Model` | `name` | the team, verified |
| `Module` | `path, purpose, parts, summarySha, summarizedBy` — a directory; `.` is the repo | summary team, checked |
| `Guidance` | `id, path, heading, text, from, fromSha, until, untilSha` — one span of an instruction-file section | every version of AGENTS.md / CLAUDE.md / … (code) |

`File` also carries `purpose, summary, summarySha, summarizedBy` once summarized: what the file does
at that commit — every symbol the summary names is checked against the file.

| Relationship | Meaning |
|---|---|
| `(Person)-[:AUTHORED {role}]->(Commit)` | author or co-author |
| `(Commit)-[:TOUCHED]->(File)` | the commit changed the file |
| `(Decision)-[:RECORDED_IN]->(Commit)` | git blame on the entry's heading (ADRs: the commit that added the file) |
| `(Decision)-[:CITES]->(Commit)` | the entry names the hash — evidence, not implementation |
| `(Decision)-[:MENTIONS]->(File)` | the entry names the path |
| `(Decision)-[:BECAUSE]->(Measurement)` | measured evidence |
| `(Decision)-[:TESTED]->(Experiment)` | tried, and judged |
| `(Decision)-[:ABOUT\|ABOUT_BROADLY]->(Concept)` | topic; `ABOUT_BROADLY` for concepts too common to link entries by |
| `(Decision)-[:INVOLVES]->(Model)` | models the entry is about |
| `(Decision)-[:SUPERSEDES\|REVISES\|DISPROVES {via, quote, targetQuote, raisedBy, confirmedBy}]->(Decision)` | newer → older; `via: 'status'` when an ADR's status line states it, `via: 'board'` when two agents agreed |
| `(Decision)-[:RATIONALE {via}]->(File\|Decision)` | derived by code: "this decision's reasoning rests on that" — what PageRank and paths run over |
| `(Module)-[:CONTAINS]->(File\|Module)` | the directory tree, for summaries |
| `(Guidance)-[:IN]->(File)`, `-[:NAMES]->(File)`, `-[:REPLACES]->(Guidance)` | which instruction file, which files it names, the text it replaced |

**Board graphs (`<repo>__board` for decisions, `<repo>__files` for summaries)** — sections may depend
on others: `(Section)-[:PART_OF]->(Section)` with a `waiting` count, so a directory is claimable only
once every part of it is done. — `Section {id, status, attempts, claimedBy, expiresAt}`,
`Agent {name, model, lastSeen, leftAt}`, `Finding {kind, data, quote, verified, reason}`,
`Handoff {relation, status, quote, reason, resolvedBy}`, `Event {at, kind, agent, section, text}`;
`(Agent)-[:CLAIMED]->(Section|Handoff)`, `(Finding)-[:FROM]->(Agent)`, `(Finding)-[:ABOUT]->(Section)`,
`(Finding)-[:RAISED]->(Handoff)-[:FOR]->(Section)`.

The Cypher lives with the code that runs it: ingest in `src/ingest/`, the board in `src/board/board.ts`,
promotion in `src/board/integrate.ts`, the derived rationale graph in `src/graph/rationale.ts`, the
tools in `src/tools/graph-tools.ts`, `trace.ts` and `review.ts`.

## Status

Built: everything above — ingest (decision logs, ADRs, agent-instruction files with their history), the
extraction and summary teams on board graphs, the integrator, the rationale graph, twelve tools, the MCP
server, the agent with its code checks, `review`, `sync`, the evaluations, and two web views: **Board**
(the agents working live; every tile opens what it produced — a decision's evidence, a file's summary
and the decisions resting on it, a directory's parts) **Ask** (tool calls as they happen, the answer
with its checks, and the path behind it) and **Review** (a repository's commits, each one's diff and review
packet; locally, Sync and the demo's steps). Next: question memory. The full record of what was decided,
what failed and what was corrected is [DECISIONS.md](DECISIONS.md).

## The event's rules, and how this repo meets them

- **New work during the event.** Everything graph-related — schema, Cypher, ingestion, the team, the
  tools, the agent — dates from after the start (Oct 14 2:31 PM EDT); git history shows the line.
  Before it the repo held only the plan ([PLAN.md](PLAN.md) — notes and a graph-model sketch, which the
  rules allow), the stock FalkorDB container, and two graph-agnostic libraries (`lib/llm.ts`,
  `lib/loop.ts`) adapted from Invarail.
- **AI assistance (disclosed):** built with Claude Code (Claude Opus 5.5) as a coding assistant; every
  assisted commit carries a Co-Authored-By trailer. The product's own agents run on a local model.
  The architecture, its decisions and their reasons — including the wrong turns — are in
  [DECISIONS.md](DECISIONS.md).
- **Commit titles "Day 1", "Day 2"** name the plan's milestones ([PLAN.md](PLAN.md)), not calendar days;
  the first graph commit is Oct 14 3:56 PM EDT, after the start.
- **Data:** every corpus is a public repository.

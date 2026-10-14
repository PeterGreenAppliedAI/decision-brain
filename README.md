# Decision Brain

*Entry for [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb) (FalkorDB × WeMakeDevs, Oct 14–18 2026) — all three tracks.*

**Why is this codebase the way it is?** Decision Brain turns a repository's decision log and git
history into a FalkorDB graph — decisions, the measurements and experiments behind them, what
superseded what, the commits that recorded them, the files they rest on, the people who know them —
and answers questions from it **with the path behind every answer**. Everything runs locally: the
graph in FalkorDB, the agents on a local model.

```
            ┌──────────── extraction team (Track 02) ────────────┐
git log ──┐ │  4 local agents ⇄ board graph (claims, findings,   │
DECISIONS ├─┤  handoffs) → code verifies every quote → integrator │──► brain graph ──► MCP tools ──► agent ──► answer
ADRs ─────┘ └────────────────────────────────────────────────────┘    (one per repo)  (Track 01)   + cited path
                                                                        (Track 03)                     + review packet
```

> *"Why does the router prompt keep a rule that's factually wrong about memory?"*
>
> Because the "wrong" rule is load-bearing for the weakest model. The decision
> [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing] records that when the rule was
> corrected, qwen2.5:7b stopped routing memory requests: **"New text: 0/20 to memory. Old text:
> 16/20."** — the hypothesis that fixing the text would help was disproven. *(local GLM, 11.6 s,
> 1 tool call; code checked the citation and both figures against the cited evidence — the wording
> itself is the model's)*

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
3. **Answer — graph tools over MCP.** Nine read-only tools (below), deterministic in their ordering.
   The agent — a local model — chooses among them over MCP and must cite the ids they returned. Code
   then reports three separate checks: **citations** (each names something a tool returned),
   **figures** (each number appears in the evidence its citation brought — invented or altered
   measurements fail), and **abstention** (an answer that opens with "I don't know" and makes no
   claims). The wording itself is model-written and not verified by code; the answer says so.
4. **Review — the action.** `review <commit>` builds a deterministic packet for a change: the decision
   it records, standing decisions resting on its files (with their measurements) to re-check,
   experiments already disproven there, superseded reasoning not to cite, and who knows the files —
   filtered **by date as of the change**. For a given state of the graph the packet is deterministic:
   the same commit gives the same packet. It is not yet a reconstruction of the decision log *as it
   stood* at that commit — later edits to an entry can show through (see Limitations).

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

## Limitations (known, not yet fixed)

- **Evidence is not yet invalidated when an entry is edited.** Re-ingest updates a decision's text,
  but findings extracted from its old wording stay attached until the team re-runs. (Being fixed:
  content hashes on entries, findings and board sections.)
- **Historical review is approximate.** `review` filters the current graph by date; it does not yet
  rebuild the decision log as it stood at the reviewed commit. Dates are UTC, and decision-log dates
  are the author's calendar dates, so "as of" can shift by a day around midnight.
- **No "why" without a written source.** A repo with no decision log, ADRs or agent-instruction files
  gets ownership, history and file summaries — not reasons. Commit messages and PR descriptions are
  not mined yet.
- **Tested on two repositories and one model server** (glm-5.3-flash on vLLM). Other OpenAI-compatible
  servers (e.g. Ollama) are expected to work but are not yet verified.

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

## Tools (MCP and CLI) — twelve

| Tool | Answers | Graph work |
|---|---|---|
| `search(query)` | Which decisions are about this? | full-text index; all-words matches first |
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

## Run it

Requires Node ≥ 22, Docker, and an OpenAI-compatible model server for the agents (we use
`glm-5.3-flash` on vLLM; nothing calls a paid API).

```sh
npm install
cp .env.example .env                   # then set LLM_URL to your model server
npm run graph:up                       # FalkorDB 6.0.2 on 127.0.0.1:6380, Browser on :3030

npm run ingest -- <path-to-repo> --graph <name>        # git + DECISIONS.md and/or ADRs → the brain graph
npm run team -- --graph <name> --workers 4 --reset     # the extraction team → board → integrate
npm run web                                            # board view http://127.0.0.1:4100, Ask view /ask.html

npm run ask -- --graph <name> "Why is X the way it is?"   # the agent, with its path and grounding check
npm run review -- --graph <name> <commit>                 # the review packet for a commit
npm run trace -- --graph <name> --find "router"           # find a decision; then trace <decision-id>
npm run mcp -- --graph <name>                             # the tools for any MCP client (stdio)
npm run integrate -- --graph <name>                       # re-promote the board without re-extracting
npm run summarize -- --graph <name> --repo <path>         # file → directory → repo summaries (board <name>__files)
```

Corpora used: [Invarail](https://github.com/PeterGreenAppliedAI/Invarail) (151 decision-log entries,
780 commits) and [alphagov/content-publisher](https://github.com/alphagov/content-publisher) (16 ADRs,
8,342 commits, 68 contributors). Extraction: 151 entries in 31 min and 16 ADRs in 81 s on four local
workers.

**Settings** come from the environment (see [.env.example](.env.example)): `FALKORDB_URL`, `LLM_URL`,
`LLM_MODEL`, `LLM_REASONING_EFFORT`, `PERSON_ALIASES`, `AGENT_AUTHOR_PATTERN`, `ADR_DIRS`,
`RATIONALE_EXCLUDE`, `CONCEPT_MAX_SHARE`, `CLAIM_TTL_MS`, `INSTRUCTION_FILES`, `FILE_EXTENSIONS`,
`FILE_EXCLUDE` and a few more — nothing is hardcoded.

`npm test` runs 62 tests, most against a real FalkorDB (fixture repos and graphs built per test);
CI runs them on every push against the same pinned FalkorDB version.

## Status

Built: ingest (decision logs, ADRs, agent-instruction files with their history), the extraction team
and board (with task dependencies), the integrator, the rationale graph, file → directory → repo
summaries, twelve tools, the MCP server, the agent with its code checks, `review`, and the Board and
Ask views. In progress: invalidating evidence when an entry is edited, a labelled evaluation set
against a plain-search baseline, rebuilding the decision log as of a reviewed commit, question memory,
deployment. The full record of what was decided, what failed and what was corrected is
[DECISIONS.md](DECISIONS.md).

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
- **Data:** both corpora are public repositories.

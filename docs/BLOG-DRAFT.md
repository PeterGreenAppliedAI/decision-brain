<!-- DRAFT for Peter to edit into his own voice before posting. Every figure below is from eval/,
     DECISIONS.md or DEMO.md in this repo; links marked TODO need the final URLs. -->

# The rule that was wrong on purpose: building a "why" graph for codebases with FalkorDB

My router prompt has a line in it that is factually wrong. It says the memory specialist "can only
READ". Memory can save facts. Any reasonable reviewer — or any coding agent — would fix it.

We did fix it, once. On September 30 we measured the corrected text against the old one on the
smallest model in the rotation, qwen2.5:7b: **corrected text, 0 of 20 "remember this…" requests routed
to memory; old text, 16 of 20.** The wrong rule was load-bearing. We reverted it and wrote the result
down in `DECISIONS.md`.

That entry is the whole reason this project exists. The knowledge that keeps that line in place lives in
one paragraph of a 1,900-line decision log, a revert commit, and my memory. The next person to open
`src/router/prompt.ts` sees none of it. Neither does the next agent.

**Decision Brain** turns a repository's decision log and git history into a FalkorDB graph and answers
"why is this code the way it is?" — with the path behind every answer. I built it for Graph Hacks
(FalkorDB × WeMakeDevs) and entered it in all three tracks. Everything runs locally: FalkorDB in Docker,
the agents on a local GLM model served by vLLM.

> 🎥 Demo video: TODO · Code: TODO (github.com/PeterGreenAppliedAI/decision-brain)

## What goes into the graph

Two kinds of work fill it, and the split matters.

**Code does what code can do, with no model.** Git history becomes `Commit`, `File` and `Person` nodes
(AI co-authors are marked as agents). Each decision-log entry — a `DECISIONS.md` section or an ADR file
— becomes a `Decision` with its date, status and exact source lines. `git blame` links it to the commit
that recorded it. Every version of the repo's AI-agent instruction files (CLAUDE.md, AGENTS.md,
.cursorrules) is kept as dated section spans, so "what was the agent told when it wrote this commit?"
is a query.

**A team of local agents does the reading.** Four workers claim entries from a shared *board graph* and
pull out measurements, experiments (with verdicts), the files and concepts an entry is about, and
relations between entries. The board is itself a FalkorDB graph — claims, findings, handoffs — and the
coordination is just Cypher. A claim is atomic because FalkorDB serializes writes per graph:

```cypher
// abridged from src/board/board.ts
MATCH (s:Section)
WHERE (s.status = 'pending' OR (s.status = 'claimed' AND s.expiresAt < $now))  // expired = up for takeover
  AND s.attempts < $max AND coalesce(s.waiting, 0) = 0                         // retries capped; parts first
WITH s ORDER BY s.order LIMIT 1
MATCH (a:Agent {name: $agent})
SET s.status = 'claimed', s.claimedBy = $agent, s.expiresAt = $now + $ttl, s.attempts = s.attempts + 1
CREATE (a)-[:CLAIMED {at: $now}]->(s)
```

Claims expire, so a crashed worker's entry is taken over; `waiting` makes a directory summary wait for
its files. When an agent thinks entry A supersedes entry
B, it raises a *handoff* — and **a different agent** must confirm it, with a quote from each side, before
it counts. On Invarail's 151 entries the team raised 15 such handoffs; 9 were confirmed and the rest
rejected by the second agent, each with a reason you can read on the board.

Nothing a model writes enters the brain unchecked. Every quote must appear verbatim in the entry;
every figure must appear inside its quote; every file name must exist in git; a file summary that names
a name the file doesn't contain is rejected — a presence check, not proof the description is right.
(It had its own bug: it rejected `TaskStore.add` because no file contains that exact string. Thirteen
good summaries were thrown out before I noticed. Now each part of a qualified name must appear as an
identifier — which still doesn't prove `add` belongs to `TaskStore`.)

Then a derived `RATIONALE` edge joins each decision to the files it rests on, and FalkorDB's built-in
algorithms answer structural questions directly — which files carry the most reasoning
(`algo.pageRank`), how two things connect (`algo.SPpaths`).

## Asking it

The agent is a plain tool-calling loop over twelve MCP tools — `why`, `what_breaks`, `disproven`,
`who_knows`, `trace`, `origin`, `told`, `review` and more — each a small Cypher query. The same tools
serve any MCP client.

The part I care most about is what happens *after* the model answers. Code checks it:

- every `[id]` it cites must be something a tool returned in this run;
- every figure must appear in the evidence of the item it cites — `0/20` next to the wrong citation
  fails;
- "I don't know" only counts as an abstention if nothing in the answer asserts otherwise.

The page shows exactly what was checked — "2 citations checked · 8 figures matched to evidence" — and
labels the prose itself "model-written", because code didn't verify the wording.

## The code-review story

The demo is the use I didn't plan: code review. A contributor "fixes" that wrong router rule. Before it
merges, `review` rebuilds the decision log **as it stood at that commit** (from git, not today's
file) and returns:

- **R1** The Router Prompt's "Wrong" Rule Was Load-Bearing — measured 0/20 vs 16/20
- **D1** "Corrected router prompt text would fix the 7B's memory routing" — *tried and disproven*

Then, in a disposable copy and clearly labelled as simulated, the team records a new decision: the 7B
is retired, and on the supported model the corrected rule measures 20/20 vs 19/20. `sync` re-extracts
only that entry — one agent proposes "supersedes", another confirms it — and re-summarizes only the
changed file: 10 model calls instead of hours. The resubmitted fix now gets the new decision as
guidance, the old one listed as superseded… and one more line I didn't script: the extractor recorded
"the corrected rule works for qwen2.5:7b as well" as *disproven* under the new decision. The 7B
constraint survives as a live warning, scoped to where it applies. Newer evidence didn't simply win.

Review the *original* proposal again and it still shows the September evidence: a change is judged by
the record as it stood.

## Does the graph actually help?

I froze 24 questions across three repositories — Invarail (mine), GOV.UK's content-publisher, and
log4brains, which I had never seen — before running anything. The comparison that matters is the same
local model given keyword-search results instead of graph tools. I ran it twice; the second time the
answers were judged by a fresh agent that saw only an anonymized A/B sheet.

| | Decision Brain | Same model + keyword search |
|---|---|---|
| Required evidence found | 20/20 · 20/20 | 15/20 · 15/20 |
| Answers passing the rubric | 17/20 · 16/20 | 11/20 · 10/20 |
| False premises corrected | 4/4 · 4/4 | 2/4 · 2/4 |
| Correct "I don't know" | 4/4 · 4/4 | 4/4 · 4/4 |
| Median latency | 20.6 s · 22.9 s | 7.9 s · 7.8 s |

The difference comes almost entirely from retrieval: when keyword search misses the entry an answer
must rest on, the model has nothing to answer from. The graph's tools find it. It costs about 2.6–2.9x
the latency. And to be honest about the margin: if every borderline judging call goes against Decision
Brain, it's 14 vs 12 — still ahead, but the premise-correction edge disappears. (Everything is in
`eval/v2/`.)

## What went wrong, on the record

Every correction is dated in `DECISIONS.md`. A few that taught me something:

- **My grounding checker overclaimed, three times.** It counted "Not surprisingly…" as a figure-free
  premise, treated any negation as an abstention, and accepted figures cited against the wrong
  decision. Outside reviewers caught each one. Each is now a test.
- **A FalkorDB upgrade broke a query silently.** On 6.x, a list comprehension placed after a nested
  comprehension returned `[]`. CI ran a newer image than my machine and flaked; I guessed load, then a
  hash collision, before finding it. The fix: plain `MATCH … collect`, and the image pinned.
- **The first fresh-clone run on a stranger's repo failed four ways** — ADRs named by date, two records
  written the same day colliding, a function I had deleted while fixing that, and commits that were
  written months before they were merged. All four fixed with tests, then one clean, uninterrupted run.
- **The demo itself found two bugs.** A superseded decision's old experiments still showed as "do not
  retry" warnings, and the agent told users to re-check a decision the graph knew was replaced. Demos
  are tests.

## What's next

Question memory (answered questions as graph nodes the next agent can reuse), reading very long entries
section by section, and a GitHub Action that posts the review packet on every pull request.

*Built with FalkorDB 6.0.2, the `falkordb` Node client, MCP, and glm-5.3-flash on vLLM — no paid API.
Written with an AI coding assistant, as the event's rules allow; every claim above is checked against
the repository.*

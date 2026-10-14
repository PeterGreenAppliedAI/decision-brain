# Decisions — Decision Brain

What we decided while building, what failed, and why. Newest first. (The blog post comes from here.)

---

## The Full Runs: Invarail and content-publisher (October 14 2026)

**Invarail: 151/151 sections in 31 minutes**, four GLM workers at Low effort (36–40 sections each),
0 errors, 0 lost claims. Promoted: 443 measurements, 324 experiments, 580 concepts, 56 models, 9
relation edges — each raised by one agent and confirmed by another (glm-3 → glm-4: "Coding Agent Swap:
OpenCode → Pi" SUPERSEDES the OpenCode entry, the superseded_by fix working). The demo answers are in
the graph with quotes: the router-prompt entry carries "Corrected router prompt text would fix the
7B's memory routing" (disproven, "New text: 0/20 to memory. Old text: 16/20."); the misroutes entry
carries "A handoff tool offered to arena specialists would improve rerouting" (disproven).

**content-publisher: 16 ADRs in 81 seconds.** ADR 13 REVISES ADR 8 — the relation the ADRs only state
through an in-text link — raised by one agent, confirmed by another quoting ADR 8's "always restrict"
rule. ADR 14 REVISES ADR 6 (board) beside SUPERSEDES (ADR 6's own status line). The checker rejected
"ADR 9 revises ADR 3" (9 follows 3 — right) and "ADR 6 superseded_by ADR 14" (ADR 14 never says it
replaces ADR 6 — strict, defensible; the relation is in the graph twice anyway). It errs strict.

**Generic concepts are kept, not dropped.** The share filter first dropped config, token, router,
ollama, heartbeat and cron — real subjects, and why("router") needs them. They now link by
ABOUT_BROADLY, which the topic tools read and connect() does not walk. A topic matches every concept
it is a whole word of ("router" → "router prompt", "smart router"); models (INVOLVES) are not walked
either — "both mention gemma4" is not a reason. connect(prompt.ts, fact-store.ts) now goes through
the router-prompt decision, its REVISES edge to the misroutes decision, and config/schema.ts.

**Evidence order: the author's emphasis, then the entry's order.** The review first listed
"gemma4:12b memory routing 10/10" above the A/B that mattered; the entry bolds the headline
("**New text: 0/20 to memory. Old text: 16/20.**"), and bold is now ranked first. Getting there hit a
third Cypher trap: `RETURN m {…} AS m ORDER BY m.pos` sorts by the projected map (no pos), not the node.

**One unexplained test failure.** Two ingest tests failed once in the full suite while the
content-publisher team and an integration were loading FalkorDB; 11 reruns passed. Best guess, not a
finding: fixture setup timing out under load. Watching for it. *(Corrected the same evening: the guess
was wrong. The first CI run on GitHub failed the same test, and its assertion showed `cites` empty.
The fixture cited a random 7-char short hash; the commit pattern requires a letter and a digit — so a
date like 2026092 is never read as a hash — and a random 7-char hash is all digits ~4% of the time.
Both failing tests depend on that citation. The fixture now cites the shortest prefix with a letter
and a digit; the all-digit limit has its own test.)*

## Day 2, Evening: Review Becomes the Track 01 Action (October 14 2026)

Peter, watching the tools take shape: *"we are also inadvertently building a very good code review
tool"*, then *"we might end up using this as our code review tool if we can make it consistent."*
`review <commit>` is now the Track 01 action, and consistency is its requirement: the **packet is
deterministic** (fixed queries, fixed sort, item ids assigned after sorting — the same change yields
the same packet, asserted by a test), and a model write-up, if any, may only cite packet items.

**The rationale graph.** PageRank over commit→file edges gave every file the same score: "touched by
a commit" says nothing about reasoning. A derived edge, `(:Decision)-[:RATIONALE {via}]->(:File |
:Decision)`, built by code and rebuilt whole after each ingest or integration, now carries "this
decision rests on that". `load_bearing` is PageRank over it; `connect` is shortest paths over it plus
concept edges, undirected (`relDirection: 'both'`), never through a person.

**Recording commits carry housekeeping.** The first `review 54359df` listed "Double message delivery
on Discord" as resting on `scripts/backfill-entities.ts` — only because the commit that recorded that
entry also touched the script. A recorded file now counts only if the entry names it: its stem, or a
directory segment on fewer than 10% of paths ("chrome-extension", never "src"). 686 → 297 edges.

**Review must be judged as of the change.** Reviewing a July commit first called its own decision
"superseded" and its experiment "disproven" — true only since September. A decision is superseded at
review time only if its superseder is dated on or before the change; decisions dated after are
ignored, except the one the change itself records (an entry is often dated the morning after the
commit that wrote it — `54359df` is Sep 29 21:36, its entry Sep 30). Reviewers exclude the change's
authors and count only commits made before it. Each case has a fixture test.

**Two more bugs of mine, found by output that looked wrong.** `load_bearing` ranked CLAUDE.md and
README first: the glob converter rewrote the `?` of regex text it had just inserted, so `**/*.md`
became `/^([^/]:.[^/]*\/)[^/][^/]*\.md$/` and matched nothing. Placeholders now; tests added. Search
put a long entry full of common words above the one about the question: entries containing every
word now rank before entries containing any.

**A second FalkorDB quirk:** `f.path ENDS WITH '/' + $q` parses as `(f.path ENDS WITH '/') + $q` —
"Type mismatch: expected Boolean but was String". Parenthesize the right-hand side.

## Day 2: The Team, and the Reasoning Effort Nobody Set (October 14 2026)

**Built:** the board graph (`<repo>__board`), local GLM workers, the code verifier, the integrator,
and the live board view. Workers share nothing but the board. FalkorDB serializes writes to one
graph, so each claim is one query and therefore atomic: 10 concurrent claimers got 10 different
sections, with no locks in code. Claims expire and are taken over; late work from a lost claim is
dropped; a cross-reference raised by one worker can only be confirmed by a different one, with a
verbatim quote from its own side. The self-confirm rule was mutation-tested: removing it fails a test.

**A frontier team was considered and dropped.** Claude subagents as extraction workers on public
repos, local workers on private ones — the sensitivity rule enforced in the claim query — made a
strong demo. Peter: *"Nah Im not spending any money on API. Keep it local."* The team is GLM only.

**Two wrong conclusions about the GPU box, both mine, both corrected by measuring.**
(1) Four parallel requests finished at 13, 20, 26 and 38 s; I read that as the server queueing
them. vLLM's own counters during a rerun: **4 running, 0 waiting** for the whole run. Staggered
finishes were different thinking lengths sharing throughput (~1.6× over sequential).
(2) I then set out to A/B "thinking on vs off" with `enable_thinking`. Reading GLM-5.3-Flash's chat
template (Peter asked whether it was on/off or levels) showed there is no off switch — it always
opens `<think>` — and the control is `reasoning_effort` in {low, high}; **anything else, including
nothing, means Max.** Every call so far had run at Max: 1,700–4,000 thinking tokens on five-line
entries, and on long entries the thinking exhausted the output budget, truncating the JSON
("response was not valid JSON" on every long section of the first run). The first A/B was invalid —
both halves would have run at Max — and was stopped.

**Low vs High, same four entries, four concurrent:** Low 36–67 s, 128–1,166 tokens, **63/69
findings verified**; High 43–160 s, 196–3,798 tokens, 60/70 verified. No invalid JSON either way.
Both found the same cross-reference (the Sep 30 router-prompt entry revises the Sep 29 misroutes
entry). Low is the default (`LLM_REASONING_EFFORT`); grammar-constrained output leaves the model
nowhere to narrate, which was the old reason to keep thinking high.

**`superseded_by`.** Neither effort linked the OpenCode entry to the Pi swap, though its heading says
"— SUPERSEDED by the Pi swap": the schema only let an entry point backward. An older entry may now
point forward; the checker reads the newer side, and the integrator draws the same newer → older
SUPERSEDES edge.

**Concepts too generic to link anything** (the project's own name in nearly every entry) are dropped
by the integrator, measured as a share of the whole log rather than a stopword list.

## Day 1 Audit: What the First Pass Got Wrong (October 14 2026)

Peter: *"We are done with day 1 stuff? No way we tested enough to review edge cases."* He was right.
Day 1 had been called done on one fixture test and ten traces. The audit read all 151 parsed entries
against the file, probed git edge cases on throwaway repos, and found eight real defects:

1. **Status from the category was wrong.** Everything filed under "Failed Approaches" was `failed`,
   but many of those entries end "**Status:** Active." — they record what failed on the way to a
   decision that stands (`!save` dual-write, the analytics pipeline). 86 entries carry an explicit
   Status line; it now outranks the category, and is kept verbatim as `statusText`.
2. **A section's own status was lost.** "## Multi-Backend Inference & MiniMax Swap (June 2026) —
   superseded by DeepSeek-V4-Flash swap above" is a section; its three entries came out `active`.
   Parent-heading status now passes down — and outranks the entries' own "Status: Active." lines,
   because a status word in a heading is an amendment, newer than the line written with the entry.
3. **"Failed Approaches" matched the FAILED marker.** The fix for (2) made the section name itself
   mark 13 entries failed — caught by a test, not by eye. KILLED / FAILED are markers only in
   capitals (as the corpus writes them); a title that describes a failure is not a failed decision.
   Result: superseded 1 → 4, failed 22 → 11, and the eleven read correctly one by one.
4. **The six "stale hashes" were not commits** — see the correction below.
5. **Non-ASCII paths came back git-quoted** (`"docs/\303\274…"`), so they could never match.
   `core.quotePath=false`; the path regex was ASCII-only too and is now any backticked text with a
   slash — safe because resolution keeps only what git has.
6. **Re-ingest did not converge.** MERGE only adds: a retitled entry left its old node, and a
   rewritten history (Invarail's happened on Sep 30) would have left its old commits. Ingest now
   removes decisions no longer in the file, commits no longer in the history, rebuilds its own link
   types, and drops orphaned files and people. Edges other passes add are left alone.
7. **A bad path crashed with a stack trace — and created an empty graph first.** Git is now read
   before the graph is touched; a non-repo, an empty repo, or FalkorDB down each give one clear line.
8. **Source ranges included trailing blank lines** (found earlier the same day by the fixture test).

Also checked and fine: lowercase `co-authored-by` trailers, renames, merge commits (no files), no
duplicate ids, no overlapping or uncovered lines, no headings in code fences (now handled anyway),
CRLF (now handled), impossible dates (keep the month only). Citations dated after their entry: five,
all one day later on entries spanning two days ("July 5-6") — no false matches.

**Open, not fixed:** a decision's id follows its title, so retitling an entry gives it a new id.
Question memory (Day 3) must not key on ids alone.

## Day 1: The Deterministic Spine (October 14 2026)

**Built:** git history → `(:Commit)`, `(:File)`, `(:Person)`; Invarail's DECISIONS.md → 151
`(:Decision)` nodes with `source` line ranges; `trace(decision_id)`. One graph per repo. No model
anywhere yet — ingest of 780 commits and 151 entries takes under a second and is idempotent (MERGE).

**The log has two layouts.** Dated `##` entries, and undated category sections ("Failed Approaches",
"Known Issues") whose `###` children are the entries. Entries are not in date order in the file, so
the date always comes from the heading; status comes from the heading's own words (KILLED,
SUPERSEDED, NO BUILD) and then the category.

**Cited hashes are evidence, not implementation — a modelling mistake caught on the first trace.**
The first version called every hash an entry cites `IMPLEMENTED_BY`. Tracing the Sep 29 "Misroutes"
entry showed `aa1f425` — an August eval the entry cites as background. Split into `CITES` (the entry
names the hash) and `RECORDED_IN` (git blame on the entry's heading line). `IMPLEMENTED_BY` is
reserved for a link something has verified.

**Blame is the strongest deterministic link.** Only 22 of 151 entries cite a hash, and demo question
1's entry (Sep 30, the router prompt) cites none. Blame on its heading finds `54359df` — the revert
commit itself, which touched `src/router/prompt.ts`. All 151 entries get a RECORDED_IN edge. Caveat,
visible in the OpenCode entry: blame returns the commit that *last* wrote the heading, so an amended
heading ("— SUPERSEDED by the Pi swap") points at the amendment.

**Six cited hashes do not resolve** (`ce77ec57 48f03018 db4dff42 44b13056 15e8b662 3fa2c1b9`).
Reported, never guessed. *(Corrected 2026-10-14, same day: this first said they were "consistent
with the Sep 30 history rewrite". That was a guess written as a finding. Read in context they are not
commits at all — ledger, cron and experience ids, which are also 8-hex: `confirm 48f03018`,
`cancel 15e8b662`, `commit:db4dff42` on an Experience node. Unique-prefix resolution against git is
what keeps them out; the regex alone cannot.)*

**People by name only.** Git emails carry a tailnet hostname; the graph never stores them. Agents
(Co-Authored-By: Claude …) are `Person {kind: 'agent'}` — 8 Claude identities across the history.
One human under two git names is merged by `PERSON_ALIASES` in `.env`.

**A FalkorDB quirk.** Two pattern comprehensions in one RETURN that reuse a variable name: the second
returns an empty list, silently (`[(d)-[:A]->(c) | c] AS a, [(d)-[:B]->(c) | c] AS b` → `b = []`).
Unique names fix it. Caught by the fixture test, not by reading the output.

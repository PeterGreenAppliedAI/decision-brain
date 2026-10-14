# Decisions — Decision Brain

What we decided while building, what failed, and why. Newest first. (The blog post comes from here.)

---

## An Outside Review, and What It Was Right About (October 14 2026, night)

Peter brought an outside review. Its verdict on the idea — "before changing this, here's why it
exists and what already failed" — was positive; its three criticisms were all correct, checked
against the code before acting on any of them.

**1. "Grounded" promised more than the checker established.** It checked that cited ids appeared in
tool results, not that the results supported the answer: "every request succeeded [id]" against
evidence saying 0/20 passed, and so did an answer containing "I don't know" that went on to claim
figures. The single label is now three, each claiming only what code checks — **citations** (each
names something a tool returned), **figures** (every number appears in the evidence its citation
brought, scoped to its paragraph or list block), **abstention** (opens by declining, claims nothing)
— and the prose is labelled model-written. 13 adversarial tests, mutation-checked (disable the
figure check → 4 fail). On the demo questions the stricter check found real problems: the agent
citing tool calls ("[who_knows: app/x.rb]") instead of ids, and "ADR 13" read as a figure. The
extraction verifier was relabelled the same way: a quote match proves provenance, not that a verdict
of "disproven" means what the quote means. A "What code checks — and what it doesn't" table is in the
README.

**2. Evidence was not invalidated when an entry changed.** Editing an entry without retitling it
left its old findings attached to new text. Now: a content hash on every decision; every finding
stamped with the hash of the text it was read from (same query as the text); every confirmed
relation stamped with the hash of the other side; the integrator promotes only evidence matching
current text and reports what it dropped; seeding resets changed entries, marks their findings
stale, reopens relations that quote them, and removes entries that no longer exist — but never on
a limited seed, where absent does not mean deleted (that bug was in the first draft). The existing
1,931 findings were backfilled by a script that refuses unless the decision log's last change is
older than the first finding (Invarail: Oct 5 < Oct 14; content-publisher: 2020); integration
afterwards gave identical counts and 0 stale.

**3. Historical review is approximate** — the README's "same commit, same packet, every time" was
false and is corrected: deterministic for a given graph, filtered by date, not yet rebuilt from the
decision log as it stood at that commit. Next after the evaluation set.

**Its strongest suggestion is the next step:** a small human-labelled evaluation set — relevant
decisions found, unsupported claims, stale evidence, correct abstentions — compared with simply
searching the decision log. Every claim so far is anecdotal; that set makes it measured.

## Code Knowledge and AI Provenance (October 14 2026, evening)

Three of Peter's ideas, built the same evening.

**File and directory summaries — map-reduce on the board.** *"We can do traversal hops over the
actual file that was changed, which should create a what does this file do… read by sub agents and
then pulled back in as a single summary."* The board gained dependencies: `(Section)-[:PART_OF]->
(Section)` with a `waiting` count; a directory is claimable only when every part is done, the repo
root last; a part that fails for good still counts its parent down (otherwise the parent waits
forever — caught before it shipped). Workers read each file at a commit; code keeps only the
functions, exports and imports that actually appear in the file, and a directory summary may name
only its own parts. Trial: 20 files + 12 directories in 140 s, mostly 90–100% of names verified.
`origin(background.ts)`: born in `bfc444a` on Jun 2, "Add Chrome extension browser companion with
page context injection", the same commit that recorded "Chrome extension: console API bypasses
orchestrator". Bug found reading output, not tests: subdirectories listed as `name/` and the model
copying the slash made the checker drop every subdirectory from a directory's parts.

**The honesty line, stated by the question "will it know the original intent?"** What code *does*
can be checked against the code; *why* must be something a person wrote — a decision, a commit
message, an instruction file — quoted. Summaries are labelled "describes code, not intent";
`origin()` returns `recordedIntent: null` when nothing was written down. Inferring a reason.md from
code was considered and rejected: fabrication with good formatting.

**Instruction files for AI agents — "what was the agent told when it wrote this?"** Peter: *"As AI
code is more prolific shouldn't we also be searching for an agent.md? claude.md etc.?"* Every version
of AGENTS.md / CLAUDE.md / .cursorrules / copilot-instructions… is split into sections; each distinct
section text is a `Guidance` node with a lifespan (from the version that introduced it until the one
that changed it), linked to the files it names and to the text it replaced. Deterministic, no model.
Invarail: CLAUDE.md, 71 versions, 216 section spans, 683 Claude-co-authored commits.
`told(54359df)`: co-written by Claude Opus 5.5; the CLAUDE.md in force was the version from Sep 29,
14:57; its Testing section named two scripts the commit touched — and changed two days later.

**Dates are UTC now.** Writing the told() test showed dates compared as strings while git gives each
author's local offset: `21:36-04:00` vs `02:00+01:00` sorts wrong. Commits and guidance versions are
stored in UTC (test added). Known approximation: decision-log dates are the author's calendar dates,
so review's "as of" can shift by a day around midnight.

## The Agent: Local GLM, Tools Over MCP, Citations Checked by Code (October 14 2026)

**MCP server** (`npm run mcp -- --graph <g>`, stdio): the nine graph tools — search, why, trace,
what_breaks, disproven, who_knows, connect, load_bearing, review — read-only, any graph per call,
board graphs refused. **The agent** is an MCP client of that same server: it sees the graph only
through the tools any client gets. It runs the generic loop on glm-5.3-flash (vLLM tool calling,
verified working) through an adapter from the loop's Ollama message shape to OpenAI's. **Grounding is
code:** every bracketed citation must name an id, sha, path or name a tool returned during the run;
an answer with an invented citation, or with claims and no valid citation, is NOT GROUNDED. Saying
"I don't know — the graph has no path for this" is grounded.

**Demo questions, all local, 7–20 s each:** Q1 the load-bearing router rule (cites the decision;
quotes "New text: 0/20 to memory. Old text: 16/20."); Q2 the handoff tool (2/5 vs 5/5, cites
`b23e312`); Q3 what to re-check if `fact-store.ts` changes (both standing decisions and the disproven
approaches not to reintroduce); Q4 what was disproven about memory; who should review `edition.rb`
(Kevin Dew, 37 commits); "Why did we choose Kubernetes?" → correctly declined.

**The one wrong answer was a silent failure, not the model.** "Why can content now be deleted…?" on
content-publisher answered "I don't know" — while ADR 13 and ADR 8 are exactly about it. Every search
returned `[]`: the graph was ingested before the full-text index was added, and **FalkorDB answers a
full-text query on a missing index with an empty result, not an error.** search() now checks the
index exists and fails loudly. Then the agent found ADR 13 and 8 but ran out of steps: trace returned
a decision's metadata, never what it says. trace now carries the entry's text (capped) and its
relations both ways with their quotes; and when the step budget runs out, the loop makes one last
tool-free call to answer from what it has. Re-asked: ADR 13 revises ADR 8, the access-limit reason,
and the two commits that changed the constraints (`126a40b5`, `5fdc3355`) — 4/4 citations valid.

**A fourth FalkorDB quirk:** an unnamed multi-type relationship (`-[:REVISES|SUPERSEDES]->`) yields one
row per node pair on 6.0.2; a named one (`-[r:…]->`) one row per edge. trace names it.

**The web server no longer dies with the database.** The client re-emits connection errors as
'error' events and an unheard one crashes Node; connect() now logs them, and the client reconnects —
tested by restarting FalkorDB under the running server (back in 1 s).

## FalkorDB 6.0.2, Pinned — and the Data Was Never in the Volume (October 14 2026)

**The CI failure was a FalkorDB version difference, not randomness.** CI pulls `falkordb:latest`
(6.0.2, Oct 8); the local container was the August image (4.20.3). On 6.0.2, any pattern comprehension
that comes after one which *nests* a comprehension returns `[]` — whatever the variable names:
`[(d)-[:R]->(rc) | rc {files: [(rc)-->(f) | f.path]}] AS a, [(d)-[:C]->(cc) | cc.sha] AS b` gives
`b = []`. trace() was written exactly that way. It is now plain MATCH + collect, one small query per
part; 60/60 tests pass on both versions. I logged two wrong causes first (load, then a 4%
all-digit short hash) — each a plausible story written down before it was tested. The tell that
finally pointed the right way: in CI the idempotency test (which asserts the CITES edge exists)
passed while trace's cites list was empty — the data was right, the query was not.

**Pinned to 6.0.2** in docker-compose and CI. A floating `latest` is how local and CI ended up a major
version apart without anyone choosing it; judges get the version the tests ran on.

**The data volume was mounted at the wrong path.** docker-compose mounted `falkordb-data:/data`;
FalkorDB writes `dump.rdb` to `/var/lib/falkordb/data`. Every graph — including the 31-minute
extraction — lived only in the container's writable layer: `docker compose down` would have deleted
it. Found when the pre-upgrade volume backup came out at 156 bytes. The dump was copied out of the
container first (3 MB), the mount fixed, the dump restored into the volume, and the upgrade verified:
node and relationship counts identical for all four graphs, and 151 decisions still present after a
full `down` + `up`. Also noted: the image's defaults include a 1 s query TIMEOUT and a 10,000-row
RESULTSET_SIZE — fine today, worth remembering for large queries.

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
and a digit; the all-digit limit has its own test.)* *(Corrected again, minutes later: that was not the
cause either. CI failed identically after the fix. The real cause is below — a FalkorDB 6 regression.
The 4% case is real arithmetic but never what happened; the fixture change stays as hardening.)*

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

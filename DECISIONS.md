# Decisions — Decision Brain

What we decided while building, what failed, and why. Newest first. (The blog post comes from here.)

---

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

**Six cited hashes do not resolve** (`ce77ec57 48f03018 db4dff42 44b13056 15e8b662 3fa2c1b9`) —
consistent with the Sep 30 history rewrite. Reported, never guessed.

**People by name only.** Git emails carry a tailnet hostname; the graph never stores them. Agents
(Co-Authored-By: Claude …) are `Person {kind: 'agent'}` — 8 Claude identities across the history.
One human under two git names is merged by `PERSON_ALIASES` in `.env`.

**A FalkorDB quirk.** Two pattern comprehensions in one RETURN that reuse a variable name: the second
returns an empty list, silently (`[(d)-[:A]->(c) | c] AS a, [(d)-[:B]->(c) | c] AS b` → `b = []`).
Unique names fix it. Caught by the fixture test, not by reading the output.

# Evaluation — 2026-10-14T23-21-39

25/25 questions labelled. **Label source:** model-drafted (glm-5.3-flash, each relevance judgement with a verbatim quote checked by code), then reviewed and corrected question by question by Claude (Opus 5.5) against the entries before any results were read — except inv-01..04 and cp-01, whose answers Claude had seen in earlier demo runs. Owner spot-check: pending.

| | Decision Brain (agent) | Baseline (keyword search, top 5) |
|---|---|---|
| Recall of relevant decisions | 52% (23/44) | 52% (23/44) |
| Precision of what it cites / returns | 79% | 24% |
| Correct on abstain questions | 100% | 0% |
| Ownership: labelled reviewers named | 100% (3/3) | n/a |
| Answers with an invalid citation | 1/25 | n/a |
| Answers with an unsupported figure | 0/25 | n/a |

_Baseline precision is over a fixed top 5, so it is low by construction; recall is the fairer comparison. The baseline cannot abstain — some word always matches._

| Question | Kind | Agent recall | Agent precision | Baseline recall | Baseline precision | Code check |
|---|---|---|---|---|---|---|
| inv-01 | find | 1/1 | 100% | 1/1 | 20% | supported |
| inv-02 | find | 1/1 | 100% | 1/1 | 20% | supported |
| inv-03 | find | 2/4 | 100% | 0/4 | 0% | supported |
| inv-04 | find | 1/7 | 20% | 2/7 | 40% | supported |
| inv-05 | find | 1/3 | 100% | 3/3 | 60% | supported |
| inv-06 | find | 1/3 | 100% | 0/3 | 0% | supported |
| inv-07 | find | 1/1 | 100% | 1/1 | 20% | supported |
| inv-08 | find | 1/3 | 100% | 2/3 | 40% | supported |
| inv-09 | find | 3/6 | 100% | 0/6 | 0% | supported |
| inv-10 | find | 1/1 | 100% | 1/1 | 20% | supported |
| inv-11 | trap | 1/1 | 100% | 1/1 | 20% | supported |
| inv-12 | trap | 0/1 | 0% | 0/1 | 0% | abstained |
| inv-13 | abstain | abstained ✓ | | returned 5 ✗ | | abstained |
| inv-14 | abstain | abstained ✓ | | returned 5 ✗ | | abstained |
| inv-15 | abstain | abstained ✓ | | returned 5 ✗ | | abstained |
| cp-01 | find | 2/2 | 100% | 1/2 | 20% | supported |
| cp-02 | find | 2/2 | 100% | 2/2 | 40% | supported |
| cp-03 | find | 1/1 | 100% | 1/1 | 20% | supported |
| cp-04 | find | 1/3 | 100% | 3/3 | 60% | supported |
| cp-05 | find | 1/1 | 100% | 1/1 | 20% | supported |
| cp-06 | find | 1/1 | 100% | 1/1 | 20% | supported |
| cp-07 | people | 3/3 named | | n/a | | supported |
| cp-08 | abstain | abstained ✓ | | returned 5 ✗ | | abstained |
| cp-09 | abstain | abstained ✓ | | returned 5 ✗ | | abstained |
| cp-10 | trap | 1/2 | 100% | 2/2 | 40% | invalid-citation |

## Trap questions — did the answer correct the false premise? (tick after reading)

### inv-11
_Judged by Claude (reading): **corrected** — "In fact, the opposite happened… reverted… 0/20 vs 16/20". Owner to confirm._
> The corrected router rule improved memory routing to 20/20 — when was that shipped?

> The premise doesn't match the record: the corrected rule was **not** shipped — it was measured and **reverted** the same night, 2026-09-30 [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].
> 
> Details from that decision:
> - The corrected text ("memory saves and recalls facts…") was A/B'd against the old text on qwen2.5:7b: **new text 0/20 to memory, old text 16/20** — the "wrong" rule was actually load-bearing, so the known-good text was restored exactly, with a comment marking it a measured artifact [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].
> - phi4 measured 54/54 before and after; qwen3.5:9b and gemma4:12b scored 10/10 each on memory either way [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].
> - The revert shipped in commit [54359df] (2026-09-30T01:36:56Z, by Claude Opus 5.5 and Peter Green), which also fixed the fallback `DEFAULT_CATEGORIES` and the router live check [54359df].
> 
> I don't know of any later change that got memory routing to 20/20 — the graph shows no such result.

- [ ] corrected the premise

### inv-12
_Judged by Claude (reading): **not corrected** — answered "I don't know" instead of that thinking hurt the 12B; its tools returned the small-tier eval but it did not use it. Owner to confirm._
> Why did thinking mode improve the 12B models' scores?

> I don't know — the graph has no path for this. The closest evidence: the gemma4:12b eval ran probes with thinking on (17×23 correct, 25.6 tok/s) [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches], and a separate decision records that thinking models need headroom for internal reasoning tokens — a low `num_predict` budget (1024) starved them, and bumping it to 8192 fixed empty/truncated output [2026-05-low-num-predict-starving-thinking-models]. But no decision in the graph states *why* thinking mode improved the 12B models' scores specifically.

- [ ] corrected the premise

### cp-10
_Judged by Claude (reading): **corrected** — "It doesn't — the premise is off… superseded by ADR 14". Owner to confirm._
> Why does ADR 6 still govern government tagging today?

> It doesn't — the premise is off. ADR 6 ("Tagging Content to Governments", 2018-12-12) is marked **superseded** by ADR 14 ("Political and Government Tagging", 2019-12-19) [adr-0006].
> 
> What ADR 6 decided was actually to *defer* supporting political content (option 1: do not implement), because Whitehall's approach had drawbacks — redundant data in document content, republishing all documents when the government changes, and unclear effects of the `political` flag [adr-0006]. ADR 14 later revised that reasoning: governments were added to the Publishing API, so content no longer needs republishing when the government is no longer current [adr-0006→adr-0014].
> 
> So government tagging today is governed by ADR 14, not ADR 6.

- [ ] corrected the premise

## All answers

### inv-01 — Why does the router prompt keep a rule that's factually wrong about memory?

_tools: why · 12.5 s · supported_

The rule is kept because it's load-bearing: when the factually wrong text was corrected, qwen2.5:7b's routing to memory collapsed from 16/20 to 0/20, while the old text kept working [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing]. The hypothesis that the false rule caused the 7B to misroute "Remember this" to cron was disproven — the false rule is what makes the 7B route memory correctly [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing]. Larger models (qwen3.5:9b, gemma4:12b) route memory 10/10 under either text, so the wrong rule only matters for the 7B [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].

### inv-02 — Why was the handoff tool removed the same night it was built?

_tools: search → disproven → trace · 23.5 s · supported_

The handoff tool was one of three levers tried that night to fix misrouted specialists improvising half-jobs [2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh]. It was built, measured, and removed because it made things worse: with the handoff tool offered, qwen3.5 produced malformed tool calls in 2/5 reps versus 5/5 without it [b23e312]. The hypothesis "a handoff tool offered to arena specialists would improve rerouting" was recorded as disproven [2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh]. The other two levers — can't-do descriptions and a specialist reroute — survived and took two-specialist requests from 18/30 to 30/30 [b23e312].

### inv-03 — If I change src/memory/fact-store.ts, what decisions should I re-check?

_tools: what_breaks · 15.4 s · supported_

Changing `src/memory/fact-store.ts` should trigger a re-check of two standing decisions:

1. **[2026-10-05-memory-polluted-itself-and-forgetting-didn-t-stick]** — Memory pollution and forgetting. Key evidence: flat store had 445 facts with 151 near-duplicate pairs vs. the graph store's clean 32 facts / 0 duplicates; the capped 92-fact view spent 20% on restatements. Disproven approaches to avoid repeating: substring dedup against the capped view, LLM MERGE consolidation, prompt-line forgetting, and chaining-based clustering (clusters must match the seed directly). Dedup threshold: ≥55% word overlap and ≥5 shared content words.

2. **[2026-09-27-four-ways-to-remember-memory-tiers-and-the-open-knowledge-fo]** — Memory tiers and the open knowledge format. Notably, the flat store is capped at five identity facts (it never loaded the whole fact file into the prompt — an earlier note was wrong), and FTS5 can carry retrieval without an embedder.

### inv-04 — What has been tried and disproven about memory?

_tools: disproven · 18.4 s · supported_

What was tried and disproven around memory:

**Memory/lesson-injection mechanisms**
- **Injecting lessons immediately is safe** — disproven: one hallucinated boundary silently steers every matching dispatch [2026-07-29-lessons-the-agent-gets-its-own-decisions-md].
- **Propose-confirm-everything works for lessons** — disproven: review fatigue caused the July-10 firehose / reflex-confirm problem [2026-07-29-lessons-the-agent-gets-its-own-decisions-md].
- **The model can self-assess failures in the hot path** — disproven: it never self-assesses; a 9B-honest limitation was accepted [2026-07-29-lessons-the-agent-gets-its-own-decisions-md].
- **Skills system self-reinforcement** — disproven: three hijacked runs in one week; self-reinforcement made wrong matches stronger [2026-08-10-localclaw-explored-the-design-space-invarail-is-what-survive].
- **Memory facts surfacing irrelevant context** — a failed decision [2026-04-memory-facts-surfacing-irrelevant-context].

**Related model/config assumptions**
- **embeddingModel/embeddingDims config fields were functional** — disproven: they were decorative, never passed to `embed()` [2026-09-19-the-a5000-settles-the-fleet-qwen3-8-27b-foreground].
- **Q2 quality is acceptable for agentic work** — disproven: 2-bit is past the quality cliff even when it fits [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].
- **gemma-4-12B degeneracy was a model-file problem** — disproven: the model files were innocent [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].

### inv-05 — Why did Invarail stop using OpenCode for coding tasks?

_tools: search → trace · 17.5 s · supported_

Invarail swapped OpenCode for the Pi coding agent ("picoder") on 2026-06-26 because OpenCode caused operational pain [2026-06-26-coding-agent-swap-opencode-pi-picoder]:

- **Manual server**: it required a manually-started `opencode serve` daemon.
- **Global session DB**: it kept a global session database that carried stale context across restarts.
- **Snapshot/move hack**: old project directories got swallowed by it.

Pi, by contrast, runs cwd-scoped (all writes land in `builds/<slug>/`, which structurally prevents the package.json-overwrite bug class) and is invoked headless per-build — no daemon, no global state — fitting the local-first/model-agnostic thesis better [2026-06-26-coding-agent-swap-opencode-pi-picoder].

### inv-06 — Which small model is recommended as the starter, and on what evidence?

_tools: search → trace · 24.5 s · supported_

The recommended starter is **qwen3.5:9b with `think: false`** (gemma4:12b named as the alternate; qwen2.5:7b on machines with under 12GB) [2026-09-27-where-tool-use-begins-the-small-tier-eval].

Evidence, from the September small-tier eval (same harness, 14 tasks × 3 reps, 3.8B–14.7B models on the utility box) [2026-09-27-where-tool-use-begins-the-small-tier-eval]:
- qwen3.5:9b@off scored **92%** — tool 100, extract 100, chat 100, code 67, zero flipped checks, 2.1 min at 6.6GB; @on 89% at 3.3× the time.
- gemma4:12b@off also hit 92% but with weaker chat (89) and 3.9 min; thinking mode cost it 13 points and 5× the time.
- The floor pair was chosen "on the strength of the top rows": qwen3.5:9b is smaller, faster, more stable, with perfect chat; gemma4:12b is better at code.

The shipped commit is [f93b608] ("Small-tier eval: native tool use begins at 12B; starter is gemma4:12b think:false; doctor says whether the model fits") — note its message names gemma4:12b as starter, while the decision text records qwen3.5:9b as the shipped starter preset and wizard first-pull recommendation.

### inv-07 — Why were completion contracts killed?

_tools: disproven → search → trace · 21.8 s · supported_

Completion contracts were killed on 2026-08-20 because **extraction recall proved a lottery**: the model-extracted contracts attached 0-for-3 "not checkable" on blatantly checkable asks (even "write the number to revenue.txt") in the clean think=low run [2026-08-20-completion-contracts-built-measured-killed-same-day]. Peter's call: "a gate that attaches probabilistically is not a gate" — it slides down the tier map toward the prose judge while carrying real machinery [2026-08-20-completion-contracts-built-measured-killed-same-day].

The rescue option (code-detected condition seeding via filename regexes/task verbs) was rejected on sight as "an unbounded rulebook" — the same taxonomy-sprawl/rule-mill disease the team was trying to escape [2026-08-20-completion-contracts-built-measured-killed-same-day].

The recorded lesson: contracts only work where tasks carry their own oracles (code+tests, claims+sources); you can't bolt an oracle onto an oracle-less ask. The `onFinalAnswer` seam and contract module were kept for eval use; the dispatch wiring, config block, and quality-judge contract branch were removed [2026-08-20-completion-contracts-built-measured-killed-same-day], recorded in commit [6795f28].

### inv-08 — What went wrong with the cross-check that verifies report claims?

_tools: search → trace · 22.5 s · supported_

The Tier-1 cross-check was correcting claims using evidence about the wrong thing. In the 2026-09-28 weekly AI-news report, 3 of 4 escalated claims were "contradicted" by irrelevant evidence: the LFM2.5-VL-3B WebGPU claim by a page about the 230M text-only model, the TÜV SÜD certification claim by a page about the Halos lab, and the September Gemini *hooks* claim by the May managed-agents launch — only the GPT-6 date fix (21st → 22nd) was real [2026-09-28-the-cross-check-that-corrected-the-wrong-thing].

Root cause: the judge prompt said "be conservative" but the 27B ignored it, and nothing in code checked whether the evidence was even about the claim — a false correction reads as confidence [2026-09-28-the-cross-check-that-corrected-the-wrong-thing].

Fix (commit [018e019]): an evidence gate in `tier1EvidenceGate` requiring a contradiction to restate the claim with one detail changed — quoted evidence must name the claim's subject and share ≥50% token overlap (subject coverage alone for existence claims); set-aside verdicts stay in verification.json with their reason and never touch prose. The same commit also fixed splice wounds from that report (unbalanced brackets, tripled citations, lost leading whitespace) via `guardRewrite` and `spliceSentence` [2026-09-28-the-cross-check-that-corrected-the-wrong-thing]. It was not yet measured live — the next weekly report was the test.

### inv-09 — How is the foreground model chosen, and why that hardware?

_tools: search → trace → trace · 27.8 s · supported_

**How it's chosen:** The foreground model is treated as a *slot*, not a dependency — it's swapped via the `MultiBackendClient` with only config + small code changes (qwen → MiniMax-M2.7 → DeepSeek-V4-Flash, the latter chosen for markedly better output, with vision kept on qwen3.6:27b since DeepSeek is text-only) [2026-06-foreground-model-swap-minimax-m2-7-deepseek-v4-flash]. An earlier split put foreground on a Spark and utility on the A5000, but that was superseded [2026-06-model-split-foreground-on-spark-utility-on-a5000].

**Why the 3060 hardware:** A head-to-head with identical gemma4:12b and a 9K-token cold prompt showed the 3060 (CUDA, 12GB) at **1,220 tok/s prefill (~3.3s for a 4,000-token prompt)** vs the M4 Mac Mini (MLX) at **123 tok/s (~33s)** — a 10x prefill gap from a card costing half the Mini. Prefill is compute-bound, and a context-heavy resident agent spends nearly all its time there [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060]. The fleet settled as: 3060 runs foreground (chat, arena, cron, memory, research, briefing, heartbeat, vision) with `session.contextSize` cut 96000 → 32768 to fit 12GB; Sparks/GLM-5.3 do coding only; the Mini stays for short-prompt subagent/eval work (7/7 on the duel there); the A5000 keeps the utility tier [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

**Standing note:** Clustering Minis over Thunderbolt won't fix it — pipeline parallelism adds capacity, not per-request FLOPS, and tensor parallelism needs ~900GB/s interconnect vs Thunderbolt's ~10GB/s [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

### inv-10 — Why do facts carry how we know them?

_tools: search → trace · 18.8 s · supported_

Facts carry provenance because of a real failure: `source` was free text that couldn't say *how* something was known, so a heartbeat's autonomous guess and a sentence Peter actually typed arrived in the prompt in the same voice — and the model asserted both back at him with equal confidence [2026-09-20-facts-carry-how-we-know-them-epistemic-provenance].

The fix: `FactProvenance` = `stated | observed | inferred` on facts, filterable in search [2026-09-20-facts-carry-how-we-know-them-epistemic-provenance]:
- **stated** — only the `!save` path where a human confirms the extracted list.
- **inferred** — consolidation merges; merging must never launder provenance upward.
- **observed** — everything else, by default; legacy nodes coalesce *down* to `observed`, never up.

Injection marks the weak classes (`[observed, unconfirmed]`, `[inferred]`) so the model asks about them rather than asserting them [2026-09-20-facts-carry-how-we-know-them-epistemic-provenance].

### inv-11 — The corrected router rule improved memory routing to 20/20 — when was that shipped?

_tools: search → trace · 23.5 s · supported_

The premise doesn't match the record: the corrected rule was **not** shipped — it was measured and **reverted** the same night, 2026-09-30 [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].

Details from that decision:
- The corrected text ("memory saves and recalls facts…") was A/B'd against the old text on qwen2.5:7b: **new text 0/20 to memory, old text 16/20** — the "wrong" rule was actually load-bearing, so the known-good text was restored exactly, with a comment marking it a measured artifact [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].
- phi4 measured 54/54 before and after; qwen3.5:9b and gemma4:12b scored 10/10 each on memory either way [2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing].
- The revert shipped in commit [54359df] (2026-09-30T01:36:56Z, by Claude Opus 5.5 and Peter Green), which also fixed the fallback `DEFAULT_CATEGORIES` and the router live check [54359df].

I don't know of any later change that got memory routing to 20/20 — the graph shows no such result.

### inv-12 — Why did thinking mode improve the 12B models' scores?

_tools: search → trace → search → trace → search → why → search · 56.3 s · abstained_

I don't know — the graph has no path for this. The closest evidence: the gemma4:12b eval ran probes with thinking on (17×23 correct, 25.6 tok/s) [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches], and a separate decision records that thinking models need headroom for internal reasoning tokens — a low `num_predict` budget (1024) starved them, and bumping it to 8192 fixed empty/truncated output [2026-05-low-num-predict-starving-thinking-models]. But no decision in the graph states *why* thinking mode improved the 12B models' scores specifically.

### inv-13 — Why did we choose Kubernetes for deployment?

_tools: search → why → search → disproven → search · 28.6 s · abstained_

I don't know — the graph has no path for this. I searched for decisions about Kubernetes, k8s, clusters, and deployment infrastructure, and found no decision, experiment, or commit rationale mentioning Kubernetes at all. The decision log covers things like the SGLang cutover [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency] and the A5000 fleet decision [2026-09-19-the-a5000-settles-the-fleet-qwen3-8-27b-foreground], but nothing records why Kubernetes (if it's even used) was chosen.

### inv-14 — Why was Postgres chosen as the primary database?

_tools: search → why → search → search → trace → search → search · 41.4 s · abstained_

I don't know — the graph has no record of Postgres being chosen as a primary database. The decision log doesn't mention Postgres at all.

What the graph does record about database choices:

- The memory system moved from a flat JSONL fact store to **FalkorDB** (a Redis-compatible graph database), chosen over Neo4j (free, ~85MB vs 2.6GB memory, sub-ms lookups, native vector search), SQLite (no graph traversal or relationship modeling), and Memgraph (lacked native vector search at evaluation time) [2026-05-memory-system-overhaul-flat-store-to-graph-database].
- SQLite was the existing EmbeddingStore before that migration [2026-05-memory-system-overhaul-flat-store-to-graph-database].

If you're thinking of a different project or a decision not logged here, I have no path to it.

### inv-15 — Who approved the cloud budget for the GPU cluster?

_tools: search · 11.7 s · abstained_

I don't know — the graph has no record of who approved a cloud budget for a GPU cluster. The search returned only loosely related decisions (e.g., [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency] about model serving infrastructure), none of which mention budget approval or an approver. This kind of organizational/financial decision isn't captured in the decision log.

### cp-01 — Why can content now be deleted when the database used to restrict deletion?

_tools: search → trace · 17.4 s · supported_

Because ADR 13 ("Permitted Deletion", 2019-07-24) revised the earlier rule. ADR 8 had set `restrict` on all foreign keys because no deletion use cases existed [adr-0008]. Then the access-limit feature created one: production data synced to integration environments with weaker access controls could expose sensitive content, so data had to be removed during sync [adr-0013]. Removal was chosen over redaction as simpler and format-agnostic, so the `restrict` constraints on editions and revisions were replaced with `cascade` behaviour (commits 126a40b5 and 5fdc3355) [adr-0013].

### cp-02 — How is political and government tagging decided, and what changed?

_tools: search → trace → trace · 25.2 s · supported_

Political/government tagging was first **deferred**, then **implemented** a year later:

- **ADR 6 (2018-12-12)** [adr-0006]: Content Publisher chose *not* to implement political/government tagging, deferring it. Whitehall's approach was seen as flawed: the `political` and `government` attributes were stored in the content itself (redundant data), forcing all documents to be republished whenever the current government changed, and the effect of marking content political was unclear.

- **ADR 14 (2019-12-19)** [adr-0014] superseded that: the political climate in December 2019 required the feature so content could enter history mode. The decision:
  - A service runs on each edit to determine whether content is political; if published or backdated, it also determines the government (based on first publication/backdated time). Values are stored in the editions database table — only the current value, since it's not part of publication history.
  - Publishers can override the political flag via `editor_political` (stored as part of a revision), which supersedes the computed `system_political`.
  - To the Publishing API it's sent as a boolean `political` attribute plus a government edition link — and since governments were added to the Publishing API, content no longer needs republishing when the government changes, fixing ADR 6's main objection.

Recorded in commit [bc023143] ("Add ADR to record government and political tagging decision", Kevin Dew); ADR 6 was recorded in [9dd75ca2] (Ben Thorner).

### cp-03 — Why does Content Publisher store its own data instead of relying only on the Publishing API?

_tools: why → trace → search → trace · 31.1 s · supported_

Content Publisher keeps a local datastore instead of relying solely on the Publishing API because of ADR 0002 [adr-0002]. The 2016 architecture goal was for publishing apps to be stateless Publishing API clients (as Specialist Publisher was built), but the difficulties of building a Rails app that way led the team to reconsider [adr-0002].

Key reasons for a local datastore:
- It's standard Rails — quick to build, easy to understand, and easy to test (no heavy stubbing or running the API in the test suite) [adr-0002]
- Easy to iterate the workflow; changing an API workflow is much harder [adr-0002]
- Only the final state of content belongs in the Publishing API — some formats need interim data not needed for publishing, plus publisher metadata like notes [adr-0002]
- Pragmatically, they wanted to store content before it's available as a draft on the Publishing API, which would otherwise require a complex holding place [adr-0002]

The trade-offs accepted: syncing between local and Publishing API, local data being hard for other apps to query, and possible mismatches between Content Schema and Rails validations [adr-0002].

### cp-04 — How is the history of a document modelled?

_tools: search → trace · 19.2 s · supported_

Document history is modelled via **ADR-0009 "Modelling history"** (2018-12-17, amended 2019-01-29) [adr-0009].

- Previously, the `documents`/`images` tables stored only the latest content, with history kept in Papertrail (not a permanent store) and a thin `TimelineEntry` model — causing pain points like being unable to discard a new draft of a published document or edit images after first publication [adr-0009].
- The decision: store **individual editions of a document, each revision of its content, and each status an edition has held**, using **immutability** of models as the implicit means of storing history — notably for revisions and images [adr-0009].
- It also covers impacts on the timeline and topics, and (per ADR-0003) does not share data between translations of a document [adr-0009].
- Recorded in commit [d1e3b7c6] by Kevin Dew, along with class, state, revision and image-revision diagrams [d1e3b7c6].

### cp-05 — Why was business logic moved out of controllers?

_tools: search → trace · 16.1 s · supported_

Business logic was moved out of controllers per [adr-0011] because, as Content Publisher grew, controller classes became increasingly complex — action methods were long, hard to understand, and expensive to test. More controller functionality (access limiting, concurrent editing protection, invalid state handling) was anticipated, so controllers were expected to become a growing pain point. The team evaluated alternatives (service objects, dry-transaction, Interactor, Trailblazer, the Publishing API command pattern) and found each flawed — e.g. the services directory had become "a mess" with little consistency, and dry-transaction's DSL made classes unlike plain Ruby objects [adr-0011].

### cp-06 — How are file attachments rendered?

_tools: search → trace · 16.0 s · supported_

File attachments are rendered via **GOV.UK Publishing Components**, per [adr-0012].

- Inside a document, attachments are rendered by Govspeak (GOV.UK's markdown dialect), which converts markdown into the HTML shown on GOV.UK [adr-0012].
- For previews outside a document, three options were considered; the chosen approach (option 3) is for both Govspeak and Content Publisher to depend on the GOV.UK Publishing Components gem, making it the single place that renders file attachments — avoiding duplicated markup/logic while allowing customisations like opening links in a new window and tracking interactions [adr-0012].

### cp-07 — Who should review a change to app/models/edition.rb?

_tools: who_knows · 9.0 s · supported_

**Kevin Dew** is the top candidate — 37 commits touching app/models/edition.rb, most recently on 2022-10-10 [who_knows: app/models/edition.rb].

Others familiar with it: Ben Thorner (18 commits), Emma Beynon (8), Graham Lewis and Jon Hallam (3 each) [who_knows: app/models/edition.rb].

### cp-08 — Why did the team switch from Rails to Django?

_tools: search → search → search → why → disproven → what_is · 29.2 s · abstained_

I don't know — the graph has no path for this. There's no decision or topic about switching from Rails to Django; in fact the evidence suggests the codebase is a Rails app (e.g. [lib/tasks/csv_report.rake], [spec/lib/tasks/csv_report_spec.rb], [db/migrate/20191114123329_repopulate_document_id_in_metadata_revisions.rb]), and no decision in the log mentions Django at all.

### cp-09 — Why was GraphQL adopted for the publishing API?

_tools: search → search → why → search → disproven · 23.5 s · abstained_

I don't know — the graph has no path for this. There are no decisions, commits, or disproven experiments mentioning GraphQL or its adoption for a publishing API. The closest related decisions in the log are about the publisher workflow's local datastore [adr-0002] and publishing times/change history [adr-0016], but neither mentions GraphQL.

### cp-10 — Why does ADR 6 still govern government tagging today?

_tools: search → trace · 19.4 s · invalid-citation_

It doesn't — the premise is off. ADR 6 ("Tagging Content to Governments", 2018-12-12) is marked **superseded** by ADR 14 ("Political and Government Tagging", 2019-12-19) [adr-0006].

What ADR 6 decided was actually to *defer* supporting political content (option 1: do not implement), because Whitehall's approach had drawbacks — redundant data in document content, republishing all documents when the government changes, and unclear effects of the `political` flag [adr-0006]. ADR 14 later revised that reasoning: governments were added to the Publishing API, so content no longer needs republishing when the government is no longer current [adr-0006→adr-0014].

So government tagging today is governed by ADR 14, not ADR 6.

# Evaluation labels

For each question, tick (`[x]`) every decision a good answer must rest on. Add missing ones on an
`add:` line by id (`npm run trace -- --graph <g> --find "<words>"` finds ids). For **abstain**
questions, tick "should abstain" if nothing in the graph answers it; for **trap** questions, tick
"should correct the premise" if the question assumes something false. For **people**, list who
should review on a `reviewers:` line. Mark each question `labelled: yes` when done.

These labels are the ground truth — the system never grades itself.

Label source: model-drafted (glm-5.3-flash, each relevance judgement with a verbatim quote checked by code), then reviewed and corrected question by question by Claude (Opus 5.5) against the entries before any results were read — except inv-01..04 and cp-01, whose answers Claude had seen in earlier demo runs. Owner spot-check: pending.

## inv-01 · find · invarail

> Why does the router prompt keep a rule that's factually wrong about memory?

- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [x] `2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing` — The Router Prompt's "Wrong" Rule Was Load-Bearing (2026-09-30) _keyword_
- [ ] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword_
- [ ] `2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh` — Misroutes Make a Mess: Three Levers, One Removed the Same Night (2026-09-29) _keyword_
- [ ] `2026-09-19-prefill-is-the-hidden-axis-and-our-prompt-order-was-throwing` — Prefill Is the Hidden Axis — and Our Prompt Order Was Throwing It Away (2026-09-19) _keyword_
- [ ] `2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat` — Voice Comes Home to the Mini — mlx-audio Replaces the Dead Gateway (2026-09-25) _keyword_
- [ ] `2026-06-chrome-extension-console-api-bypasses-orchestrator` — Chrome extension: console API bypasses orchestrator (2026-06) _search_
- [ ] `2026-06-async-compaction-cache-turn-count-gated-prewarm` — Async compaction cache → turn-count gated + prewarm (2026-06) _search_
- [ ] `2026-06-research-deck-pipeline-fragile` — Research / deck pipeline fragile (2026-06) _search_
- [ ] `2026-06-searxng-self-hosted-search-provider` — SearXNG self-hosted search provider (2026-06) _search_
- [ ] `2026-09-28-a-supervisor-without-bash-and-the-audit-tail` — A Supervisor Without Bash, and the Audit Tail (2026-09-28) _search_
- [ ] `2026-06-graph-provenance-edges-wired` — Graph provenance edges wired (2026-06) _search_
- [ ] `2026-06-scoped-tool-executor` — Scoped tool executor (2026-06) _search_
- [ ] `2026-04-phi4-mini-as-smart-router` — phi4-mini as smart router (2026-04) _search_
add: 
note: GLM also ticked the misroutes entry — context, not required; dropped. Not blind: saw the agent's demo answer earlier.
labelled: yes

## inv-02 · find · invarail

> Why was the handoff tool removed the same night it was built?

- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [x] `2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh` — Misroutes Make a Mess: Three Levers, One Removed the Same Night (2026-09-29) _keyword+search_
- [ ] `2026-07-20-mcp-client-bridge-the-ecosystem-for-the-price-of-one-protoco` — MCP Client Bridge: The Ecosystem for the Price of One Protocol (2026-07-20) _keyword_
- [ ] `2026-09-27-two-outside-reviews-land-the-walls-have-seams` — Two Outside Reviews Land — the Walls Have Seams (2026-09-27) _keyword_
- [ ] `2026-08-01-five-live-runs-five-layers-wiring-a-compiled-flow-into-produ` — Five Live Runs, Five Layers: Wiring a Compiled Flow Into Production (2026-08-01) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword+search_
- [ ] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword_
- [ ] `2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat` — Voice Comes Home to the Mini — mlx-audio Replaces the Dead Gateway (2026-09-25) _search_
- [ ] `2026-06-tool-loop-streaming` — Tool-loop streaming (2026-06) _search_
- [ ] `2026-07-07-self-identity-in-prompts-config-never-code` — Self-Identity in Prompts: Config, Never Code (2026-07-07) _search_
- [ ] `2026-06-progressive-tool-disclosure` — Progressive tool disclosure (2026-06) _search_
- [ ] `2026-06-scoped-tool-executor` — Scoped tool executor (2026-06) _search_
- [ ] `2026-05-save-writing-to-both-factstore-and-graphmemory` — !save writing to both FactStore and GraphMemory (2026-05) _search_
add: 
note: Agreed with GLM. Not blind (demo).
labelled: yes

## inv-03 · find · invarail

> If I change src/memory/fact-store.ts, what decisions should I re-check?

- [ ] `2026-07-29-lessons-the-agent-gets-its-own-decisions-md` — Lessons: The Agent Gets Its Own DECISIONS.md (2026-07-29) _keyword_
- [ ] `2026-09-27-two-outside-reviews-land-the-walls-have-seams` — Two Outside Reviews Land — the Walls Have Seams (2026-09-27) _keyword_
- [ ] `2026-04-memory-facts-surfacing-irrelevant-context` — Memory facts surfacing irrelevant context (2026-04) _keyword_
- [ ] `2026-05-opencode-pipeline-evolution` — OpenCode pipeline evolution (2026-05) _keyword_
- [ ] `2026-07-20-mcp-client-bridge-the-ecosystem-for-the-price-of-one-protoco` — MCP Client Bridge: The Ecosystem for the Price of One Protocol (2026-07-20) _keyword_
- [ ] `2026-08-10-localclaw-explored-the-design-space-invarail-is-what-survive` — LocalClaw Explored the Design Space — Invarail Is What Survived (2026-08-10) _keyword_
- [ ] `2026-08-29-the-factory-steward-and-software-factory-converge` — The Factory — Steward and Software Factory Converge (2026-08-29) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _search_
- [ ] `2026-05-structured-sub-dispatch-results` — Structured sub-dispatch results (2026-05) _search_
- [x] `2026-05-save-writing-to-both-factstore-and-graphmemory` — !save writing to both FactStore and GraphMemory (2026-05) _search_
- [ ] `2026-04-session-isolation-for-pipelines` — Session isolation for pipelines (2026-04) _search_
- [ ] `2026-06-contradiction-eviction` — Contradiction eviction (2026-06) _search_
- [ ] `2026-03-file-token-flow` — [FILE:] token flow (2026-03) _search_
- [ ] `2026-04-phone-call-integration` — Phone call integration (2026-04) _search_
- [ ] `2026-04-skill-matching-catching-everything` — Skill matching catching everything (2026-04) _search_
add: 2026-10-05-memory-polluted-itself-and-forgetting-didn-t-stick, 2026-06-factstore-importance-aware-char-bound, 2026-09-27-four-ways-to-remember-memory-tiers-and-the-open-knowledge-fo
note: Standing decisions that constrain the flat FactStore; found by searching fact-store/FactStore/flat store. GLM's 'contradiction eviction' (conference idea) and April 'facts surfacing' (failed approach, not standing) dropped. Not blind (demo).
labelled: yes

## inv-04 · find · invarail

> What has been tried and disproven about memory?

- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword_
- [x] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword_
- [x] `2026-09-27-four-ways-to-remember-memory-tiers-and-the-open-knowledge-fo` — Four Ways to Remember — Memory Tiers and the Open Knowledge Format (2026-09-27) _keyword_
- [ ] `2026-07-07-the-morning-after-migration-starved-the-briefing-s-memory` — The Morning After: Migration Starved the Briefing's Memory (2026-07-07) _keyword_
- [ ] `2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing` — The Router Prompt's "Wrong" Rule Was Load-Bearing (2026-09-30) _keyword_
- [ ] `2026-06-parallel-memory-router` — Parallel memory + router (2026-06) _keyword_
- [x] `2026-10-05-memory-polluted-itself-and-forgetting-didn-t-stick` — Memory Polluted Itself, and Forgetting Didn't Stick (2026-10-05) _keyword_
- [ ] `2026-04-session-isolation-for-pipelines` — Session isolation for pipelines (2026-04) _search_
- [ ] `2026-04-phi4-mini-as-smart-router` — phi4-mini as smart router (2026-04) _search_
- [ ] `2026-09-19-the-a5000-settles-the-fleet-qwen3-8-27b-foreground` — The A5000 Settles the Fleet — qwen3.8:27B Foreground (2026-09-19) _search_
- [ ] `2026-09-28-windows-is-a-target-now-and-the-third-review-s-first-slice` — Windows Is a Target Now, and the Third Review's First Slice (2026-09-28) _search_
- [ ] `2026-03-file-token-flow` — [FILE:] token flow (2026-03) _search_
- [ ] `2026-06-graph-provenance-edges-wired` — Graph provenance edges wired (2026-06) _search_
- [ ] `2026-06-token-economics-monitoring` — Token economics monitoring (2026-06) _search_
- [ ] `2026-06-chrome-extension-console-api-bypasses-orchestrator` — Chrome extension: console API bypasses orchestrator (2026-06) _search_
add: 2026-05-memory-system-overhaul-flat-store-to-graph-database, 2026-04-memory-facts-surfacing-irrelevant-context, 2026-06-graph-memory-maintenance-entity-quality-gate-orphan-cleanup, 2026-07-30-the-46-fact-removal-guards-that-stop-floods-can-create-leaks
note: Entries recording memory approaches tried and rejected (from disproven experiments + failed entries about memory). Not blind (demo).
labelled: yes

## inv-05 · find · invarail

> Why did Invarail stop using OpenCode for coding tasks?

- [x] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword+search_
- [x] `2026-06-26-coding-agent-swap-opencode-pi-picoder` — Coding Agent Swap: OpenCode → Pi/picoder (2026-06-26) _keyword_
- [ ] `2026-08-20-completion-contracts-the-harness-fix-built-and-re-measured` — Completion Contracts — the Harness Fix, Built and Re-Measured (2026-08-20) _keyword_
- [ ] `2026-08-22-the-harness-duel-dsh-vs-our-arena-measured` — The Harness Duel — dsh vs Our Arena, Measured (2026-08-22) _keyword_
- [x] `2026-05-opencode-integration-workspace-isolation` — OpenCode integration — workspace isolation (2026-05) _keyword_
- [ ] `2026-08-10-localclaw-explored-the-design-space-invarail-is-what-survive` — LocalClaw Explored the Design Space — Invarail Is What Survived (2026-08-10) _keyword_
- [ ] `2026-05-opencode-pipeline-evolution` — OpenCode pipeline evolution (2026-05) _keyword_
- [ ] `2026-05-opencode-specialist-retry-behavior` — OpenCode specialist retry behavior (2026-05) _keyword+search_
- [ ] `2026-05-gemma4-26b-for-chat` — Gemma4:26b for chat (2026-05) _search_
- [ ] `2026-03-file-token-flow` — [FILE:] token flow (2026-03) _search_
- [ ] `2026-06-chat-over-promises-tool-actions-band-aid-in-place` — Chat over-promises tool actions (band-aid in place) (2026-06) _search_
- [ ] `2026-06-scoped-tool-executor` — Scoped tool executor (2026-06) _search_
- [ ] `2026-06-web-search-over-trigger` — web_search over-trigger (2026-06) _search_
- [ ] `2026-04-skill-matching-catching-everything` — Skill matching catching everything (2026-04) _search_
add: 
note: GLM ticked only the swap; added the superseded OpenCode entry and 'Pi becomes the coding substrate' (OpenCode out, Pi in).
labelled: yes

## inv-06 · find · invarail

> Which small model is recommended as the starter, and on what evidence?

- [ ] `2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat` — Voice Comes Home to the Mini — mlx-audio Replaces the Dead Gateway (2026-09-25) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword_
- [ ] `2026-08-11-the-model-eval-that-kept-finding-our-bugs-instead` — The Model Eval That Kept Finding Our Bugs Instead (2026-08-11) _keyword_
- [ ] `2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp` — Prep Proposals: Never Ask a Model to Construct a Timestamp (2026-07-07) _keyword_
- [x] `2026-09-27-where-tool-use-begins-the-small-tier-eval` — Where Tool Use Begins — the Small-Tier Eval (2026-09-27) _keyword_
- [x] `2026-09-27-the-wizard-ranks-by-the-evals-not-by-size` — The Wizard Ranks by the Evals, Not by Size (2026-09-27) _keyword_
- [ ] `undated-double-message-delivery-on-discord-intermittent` — Double message delivery on Discord (intermittent) (undated) _search_
- [x] `2026-09-27-reliably-three-reps-one-deterministic-stall-one-bounded-nudg` — "Reliably?" — Three Reps, One Deterministic Stall, One Bounded Nudge (2026-09-27) _search_
- [ ] `2026-05-hallucination-detector-verb-aware` — Hallucination detector: verb-aware (2026-05) _search_
- [ ] `2026-06-web-search-recall-depth-freshness-effectiveness` — web_search recall depth + freshness effectiveness (2026-06) _search_
- [ ] `2026-08-23-the-source-audit-the-deficit-list-goes-exhaustive` — The Source Audit — the Deficit List Goes Exhaustive (2026-08-23) _search_
- [ ] `2026-06-factstore-importance-aware-char-bound` — FactStore importance-aware char bound (2026-06) _search_
- [ ] `2026-05-low-num-predict-starving-thinking-models` — Low num_predict starving thinking models (2026-05) _search_
- [ ] `2026-06-per-domain-source-diversity-cap-tried-and-reverted` — Per-domain source-diversity cap — tried and reverted (2026-06) _search_
add: 
note: Agreed with GLM.
labelled: yes

## inv-07 · find · invarail

> Why were completion contracts killed?

- [x] `2026-08-20-completion-contracts-built-measured-killed-same-day` — Completion Contracts — Built, Measured, KILLED Same Day (2026-08-20) _keyword+search_
- [ ] `2026-08-20-completion-contracts-the-harness-fix-built-and-re-measured` — Completion Contracts — the Harness Fix, Built and Re-Measured (2026-08-20) _keyword+search_
- [ ] `2026-08-11-the-model-eval-that-kept-finding-our-bugs-instead` — The Model Eval That Kept Finding Our Bugs Instead (2026-08-11) _keyword+search_
- [ ] `2026-06-browser-control-via-chrome-extension-evolution` — Browser control via Chrome extension — evolution (2026-06) _keyword_
- [ ] `2026-06-foreground-model-swap-minimax-m2-7-deepseek-v4-flash` — Foreground Model Swap: MiniMax-M2.7 → DeepSeek-V4-Flash (2026-06) _keyword_
- [ ] `2026-07-20-the-three-reminders-every-seam-in-the-cron-path-at-once` — The Three Reminders: Every Seam in the Cron Path at Once (2026-07-20) _keyword_
- [ ] `2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas` — Q2 on the .221 Mini — the Quant Cliff and the Memory Cliff, Measured (2026-09-19) _keyword_
- [ ] `2026-05-qwen3-6-35b-for-briefing` — qwen3.6:35b for briefing (2026-05) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _search_
- [ ] `2026-06-per-domain-source-diversity-cap-tried-and-reverted` — Per-domain source-diversity cap — tried and reverted (2026-06) _search_
- [ ] `2026-09-19-the-a5000-settles-the-fleet-qwen3-8-27b-foreground` — The A5000 Settles the Fleet — qwen3.8:27B Foreground (2026-09-19) _search_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _search_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _search_
add: 
note: Agreed. The same-day 'harness fix' entry is a later attempt, not why they were killed.
labelled: yes

## inv-08 · find · invarail

> What went wrong with the cross-check that verifies report claims?

- [x] `2026-06-evidence-verification-layer-for-research` — Evidence verification layer for research (2026-06) _keyword+search_
- [x] `2026-09-28-the-cross-check-that-corrected-the-wrong-thing` — The Cross-Check That Corrected the Wrong Thing (2026-09-28) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword+search_
- [ ] `2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh` — Misroutes Make a Mess: Three Levers, One Removed the Same Night (2026-09-29) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword+search_
- [ ] `2026-08-01-five-live-runs-five-layers-wiring-a-compiled-flow-into-produ` — Five Live Runs, Five Layers: Wiring a Compiled Flow Into Production (2026-08-01) _keyword_
- [ ] `2026-08-11-the-model-eval-that-kept-finding-our-bugs-instead` — The Model Eval That Kept Finding Our Bugs Instead (2026-08-11) _keyword_
- [x] `2026-08-15-absence-claims-get-tendrils-model-nominates-code-budgets` — Absence Claims Get Tendrils — Model Nominates, Code Budgets (2026-08-15) _keyword+search_
- [ ] `2026-09-27-two-outside-reviews-land-the-walls-have-seams` — Two Outside Reviews Land — the Walls Have Seams (2026-09-27) _search_
- [ ] `undated-double-message-delivery-on-discord-intermittent` — Double message delivery on Discord (intermittent) (undated) _search_
- [ ] `2026-06-expanded-pre-model-overrides` — Expanded pre-model overrides (2026-06) _search_
- [ ] `2026-06-graph-provenance-edges-wired` — Graph provenance edges wired (2026-06) _search_
add: 
note: Kept GLM's first two and 'absence claims' (Tier-1 never checked absence); dropped misroutes, five-live-runs, two-outside-reviews (no cross-check content).
labelled: yes

## inv-09 · find · invarail

> How is the foreground model chosen, and why that hardware?

- [ ] `2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat` — Voice Comes Home to the Mini — mlx-audio Replaces the Dead Gateway (2026-09-25) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword_
- [ ] `2026-08-11-the-model-eval-that-kept-finding-our-bugs-instead` — The Model Eval That Kept Finding Our Bugs Instead (2026-08-11) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [ ] `2026-09-28-the-synthesis-gate-re-run-and-a-harness-mistake-that-looked` — The Synthesis Gate Re-run, and a Harness Mistake That Looked Like Model Decline (2026-09-28) _keyword_
- [ ] `2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp` — Prep Proposals: Never Ask a Model to Construct a Timestamp (2026-07-07) _keyword_
- [x] `2026-06-foreground-model-swap-minimax-m2-7-deepseek-v4-flash` — Foreground Model Swap: MiniMax-M2.7 → DeepSeek-V4-Flash (2026-06) _keyword_
- [ ] `undated-double-message-delivery-on-discord-intermittent` — Double message delivery on Discord (intermittent) (undated) _search_
- [ ] `2026-09-28-a-supervisor-without-bash-and-the-audit-tail` — A Supervisor Without Bash, and the Audit Tail (2026-09-28) _search_
- [ ] `2026-06-searxng-self-hosted-search-provider` — SearXNG self-hosted search provider (2026-06) _search_
- [ ] `2026-06-research-deck-pipeline-fragile` — Research / deck pipeline fragile (2026-06) _search_
- [ ] `2026-06-web-search-recall-depth-freshness-effectiveness` — web_search recall depth + freshness effectiveness (2026-06) _search_
- [ ] `2026-04-exec-pipeline-vs-react-loop` — Exec pipeline vs ReAct loop (2026-04) _search_
- [ ] `2026-06-web-search-over-trigger` — web_search over-trigger (2026-06) _search_
- [ ] `2026-06-async-compaction-cache-turn-count-gated-prewarm` — Async compaction cache → turn-count gated + prewarm (2026-06) _search_
add: 2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060, 2026-09-19-the-a5000-settles-the-fleet-qwen3-8-27b-foreground, 2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches-t, 2026-08-15-the-day-the-foreground-slot-became-empirical, 2026-06-model-split-foreground-on-spark-utility-on-a5000
note: GLM's voice and Laya picks were wrong and the right entries were missing from its candidates; found by searching 'foreground'.
labelled: yes

## inv-10 · find · invarail

> Why do facts carry how we know them?

- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword+search_
- [x] `2026-09-20-facts-carry-how-we-know-them-epistemic-provenance` — Facts Carry How We Know Them — Epistemic Provenance (2026-09-20) _keyword+search_
- [ ] `2026-06-factstore-importance-aware-char-bound` — FactStore importance-aware char bound (2026-06) _keyword_
- [ ] `2026-09-27-four-ways-to-remember-memory-tiers-and-the-open-knowledge-fo` — Four Ways to Remember — Memory Tiers and the Open Knowledge Format (2026-09-27) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [ ] `2026-05-memory-system-overhaul-flat-store-to-graph-database` — Memory system overhaul: flat store to graph database (2026-05) _keyword_
- [ ] `2026-10-05-memory-polluted-itself-and-forgetting-didn-t-stick` — Memory Polluted Itself, and Forgetting Didn't Stick (2026-10-05) _keyword_
- [ ] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword+search_
- [ ] `2026-07-06-calendar-prep-proposals-first-proactive-autonomy-rung` — Calendar Prep Proposals — First Proactive Autonomy Rung (2026-07-06) _search_
- [ ] `2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat` — Voice Comes Home to the Mini — mlx-audio Replaces the Dead Gateway (2026-09-25) _search_
- [ ] `2026-04-memory-facts-surfacing-irrelevant-context` — Memory facts surfacing irrelevant context (2026-04) _search_
- [ ] `2026-06-memory-decay` — Memory decay (2026-06) _search_
- [ ] `2026-06-contradiction-eviction` — Contradiction eviction (2026-06) _search_
add: 
note: Core entry only; GLM's two extras are related, not required.
labelled: yes

## inv-11 · trap · invarail

> The corrected router rule improved memory routing to 20/20 — when was that shipped?

- [x] should correct the premise
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword+search_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword+search_
- [ ] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword_
- [x] `2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing` — The Router Prompt's "Wrong" Rule Was Load-Bearing (2026-09-30) _keyword_
- [ ] `2026-06-parallel-memory-router` — Parallel memory + router (2026-06) _keyword_
- [ ] `2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh` — Misroutes Make a Mess: Three Levers, One Removed the Same Night (2026-09-29) _keyword+search_
- [ ] `2026-09-27-four-ways-to-remember-memory-tiers-and-the-open-knowledge-fo` — Four Ways to Remember — Memory Tiers and the Open Knowledge Format (2026-09-27) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [ ] `2026-09-28-a-supervisor-without-bash-and-the-audit-tail` — A Supervisor Without Bash, and the Audit Tail (2026-09-28) _search_
- [ ] `2026-06-searxng-self-hosted-search-provider` — SearXNG self-hosted search provider (2026-06) _search_
- [ ] `2026-05-hallucination-detector-verb-aware` — Hallucination detector: verb-aware (2026-05) _search_
- [ ] `2026-03-file-token-flow` — [FILE:] token flow (2026-03) _search_
- [ ] `2026-06-conversational-guard-simplified` — Conversational guard simplified (2026-06) _search_
add: 
note: GLM wrong twice: the router entry is the answer and the premise is false (the corrected rule scored 0/20, not 20/20).
labelled: yes

## inv-12 · trap · invarail

> Why did thinking mode improve the 12B models' scores?

- [x] should correct the premise
- [ ] `2026-08-11-the-model-eval-that-kept-finding-our-bugs-instead` — The Model Eval That Kept Finding Our Bugs Instead (2026-08-11) _keyword_
- [ ] `2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat` — Voice Comes Home to the Mini — mlx-audio Replaces the Dead Gateway (2026-09-25) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword+search_
- [ ] `2026-05-low-num-predict-starving-thinking-models` — Low num_predict starving thinking models (2026-05) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword+search_
- [ ] `2026-09-28-the-synthesis-gate-re-run-and-a-harness-mistake-that-looked` — The Synthesis Gate Re-run, and a Harness Mistake That Looked Like Model Decline (2026-09-28) _keyword_
- [x] `2026-09-27-where-tool-use-begins-the-small-tier-eval` — Where Tool Use Begins — the Small-Tier Eval (2026-09-27) _keyword_
- [ ] `2026-05-tool-specific-error-recovery` — Tool-specific error recovery (2026-05) _search_
- [ ] `2026-07-07-self-identity-in-prompts-config-never-code` — Self-Identity in Prompts: Config, Never Code (2026-07-07) _search_
- [ ] `2026-07-14-falkordb-the-volume-that-wasn-t` — FalkorDB: The Volume That Wasn't (2026-07-14) _search_
- [ ] `2026-09-27-guarding-the-day-s-work-headless-wizard-selftest-in-ci-the-l` — Guarding the Day's Work: Headless Wizard, Selftest in CI, the Ledger in the Battery (2026-09-27) _search_
- [ ] `2026-06-vllm-backend-additive` — vLLM backend, additive (2026-06) _search_
- [ ] `2026-07-31-flowmcp-integration-the-ossification-rung-above-skills` — FlowMCP Integration: The Ossification Rung Above Skills (2026-07-31) _search_
add: 
note: GLM wrong: the small-tier eval says thinking HURT the 12B (13 points, 5x slower). Premise false.
labelled: yes

## inv-13 · abstain · invarail

> Why did we choose Kubernetes for deployment?

- [x] should abstain — nothing in the graph answers this
- [ ] `2026-09-27-two-outside-reviews-land-the-walls-have-seams` — Two Outside Reviews Land — the Walls Have Seams (2026-09-27) _keyword_
- [ ] `2026-08-18-pi-becomes-the-coding-substrate-localclaw-keeps-the-authorit` — Pi Becomes the Coding Substrate — LocalClaw Keeps the Authority (2026-08-18) _keyword_
- [ ] `2026-07-06-calendar-prep-proposals-first-proactive-autonomy-rung` — Calendar Prep Proposals — First Proactive Autonomy Rung (2026-07-06) _keyword_
- [ ] `2026-08-10-localclaw-explored-the-design-space-invarail-is-what-survive` — LocalClaw Explored the Design Space — Invarail Is What Survived (2026-08-10) _keyword_
- [ ] `2026-09-19-prefill-is-the-hidden-axis-and-our-prompt-order-was-throwing` — Prefill Is the Hidden Axis — and Our Prompt Order Was Throwing It Away (2026-09-19) _keyword_
- [ ] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword_
- [ ] `2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment` — A 421M Encoder Out-Routes phi4 — the Laya Experiment (2026-09-25) _keyword_
- [ ] `2026-09-29-misroutes-make-a-mess-three-levers-one-removed-the-same-nigh` — Misroutes Make a Mess: Three Levers, One Removed the Same Night (2026-09-29) _keyword_
- [ ] `2026-04-exec-pipeline-vs-react-loop` — Exec pipeline vs ReAct loop (2026-04) _search_
- [ ] `2026-05-tool-specific-error-recovery` — Tool-specific error recovery (2026-05) _search_
- [ ] `2026-06-web-search-over-trigger` — web_search over-trigger (2026-06) _search_
- [ ] `2026-05-gemma4-26b-for-chat` — Gemma4:26b for chat (2026-05) _search_
- [ ] `2026-05-opencode-pipeline-evolution` — OpenCode pipeline evolution (2026-05) _search_
- [ ] `2026-06-contradiction-eviction` — Contradiction eviction (2026-06) _search_
- [ ] `2026-03-file-token-flow` — [FILE:] token flow (2026-03) _search_
- [ ] `2026-04-phone-call-integration` — Phone call integration (2026-04) _search_
add: 
note: Confirmed: no 'kubernetes'/'k8s' anywhere in the log.
labelled: yes

## inv-14 · abstain · invarail

> Why was Postgres chosen as the primary database?

- [x] should abstain — nothing in the graph answers this
- [ ] `2026-05-memory-system-overhaul-flat-store-to-graph-database` — Memory system overhaul: flat store to graph database (2026-05) _keyword_
- [ ] `2026-08-10-localclaw-explored-the-design-space-invarail-is-what-survive` — LocalClaw Explored the Design Space — Invarail Is What Survived (2026-08-10) _keyword_
- [ ] `2026-09-27-four-ways-to-remember-memory-tiers-and-the-open-knowledge-fo` — Four Ways to Remember — Memory Tiers and the Open Knowledge Format (2026-09-27) _keyword_
- [ ] `2026-06-graph-memory-maintenance-entity-quality-gate-orphan-cleanup` — Graph memory maintenance: entity quality gate + orphan cleanup (2026-06) _keyword_
- [ ] `2026-07-25-the-skill-system-was-dead-for-three-months-resurrection-by-a` — The Skill System Was Dead for Three Months — Resurrection by Autopsy (2026-07-25) _keyword_
- [ ] `2026-09-19-the-a5000-settles-the-fleet-qwen3-8-27b-foreground` — The A5000 Settles the Fleet — qwen3.8:27B Foreground (2026-09-19) _keyword_
- [ ] `2026-09-27-two-outside-reviews-land-the-walls-have-seams` — Two Outside Reviews Land — the Walls Have Seams (2026-09-27) _keyword_
- [ ] `2026-09-28-the-second-review-s-text-came-back-f18-f21-f22-f23` — The Second Review's Text Came Back — F18, F21, F22, F23 (2026-09-28) _keyword_
- [ ] `2026-06-searxng-self-hosted-search-provider` — SearXNG self-hosted search provider (2026-06) _search_
- [ ] `2026-07-29-lessons-the-agent-gets-its-own-decisions-md` — Lessons: The Agent Gets Its Own DECISIONS.md (2026-07-29) _search_
- [ ] `2026-07-20-the-three-reminders-every-seam-in-the-cron-path-at-once` — The Three Reminders: Every Seam in the Cron Path at Once (2026-07-20) _search_
- [ ] `2026-07-30-the-46-fact-removal-guards-that-stop-floods-can-create-leaks` — The 46-Fact Removal: Guards That Stop Floods Can Create Leaks (2026-07-30) _search_
- [ ] `2026-07-07-self-identity-in-prompts-config-never-code` — Self-Identity in Prompts: Config, Never Code (2026-07-07) _search_
- [ ] `2026-08-21-arena-fleet-wide-every-conversational-pipeline-melts` — Arena Fleet-Wide — Every Conversational Pipeline Melts (2026-08-21) _search_
- [ ] `2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas` — Q2 on the .221 Mini — the Quant Cliff and the Memory Cliff, Measured (2026-09-19) _search_
- [ ] `2026-05-opencode-integration-workspace-isolation` — OpenCode integration — workspace isolation (2026-05) _search_
add: 
note: Confirmed: no 'postgres' anywhere in the log.
labelled: yes

## inv-15 · abstain · invarail

> Who approved the cloud budget for the GPU cluster?

- [x] should abstain — nothing in the graph answers this
- [ ] `2026-09-20-memory-gets-its-intake-fixed-and-a-synthesis-pass-is-measure` — Memory Gets Its Intake Fixed — and a Synthesis Pass Is Measured Out (2026-09-20) _keyword_
- [ ] `2026-07-05-small-model-hardening-bounded-autonomy-gates` — Small-Model Hardening + Bounded-Autonomy Gates (2026-07-05) _keyword_
- [ ] `2026-05-memory-system-overhaul-flat-store-to-graph-database` — Memory system overhaul: flat store to graph database (2026-05) _keyword_
- [ ] `2026-09-28-the-synthesis-gate-re-run-and-a-harness-mistake-that-looked` — The Synthesis Gate Re-run, and a Harness Mistake That Looked Like Model Decline (2026-09-28) _keyword_
- [ ] `2026-08-11-the-model-eval-that-kept-finding-our-bugs-instead` — The Model Eval That Kept Finding Our Bugs Instead (2026-08-11) _keyword_
- [ ] `2026-08-15-absence-claims-get-tendrils-model-nominates-code-budgets` — Absence Claims Get Tendrils — Model Nominates, Code Budgets (2026-08-15) _keyword_
- [ ] `2026-08-16-six-attempts-to-a-14-minute-report-stripping-the-last-accomm` — Six Attempts to a 14-Minute Report — Stripping the Last Accommodations (2026-08-16) _keyword_
- [ ] `2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency` — The SGLang Cutover — One Model, One Box, Real Concurrency (2026-08-16) _keyword_
- [ ] `2026-07-07-self-identity-in-prompts-config-never-code` — Self-Identity in Prompts: Config, Never Code (2026-07-07) _search_
- [ ] `2026-06-model-split-foreground-on-spark-utility-on-a5000` — Model split: foreground on Spark, utility on A5000 (2026-06) _search_
- [ ] `2026-08-19-local-first-gate-needs-a-floor-not-a-count-muse-glimmer-clas` — Local-First Gate Needs a Floor, Not a Count — Muse Glimmer Class, Second Strike (2026-08-19) _search_
- [ ] `2026-09-28-a-supervisor-without-bash-and-the-audit-tail` — A Supervisor Without Bash, and the Audit Tail (2026-09-28) _search_
- [ ] `2026-05-tool-specific-error-recovery` — Tool-specific error recovery (2026-05) _search_
- [ ] `2026-07-20-the-three-reminders-every-seam-in-the-cron-path-at-once` — The Three Reminders: Every Seam in the Cron Path at Once (2026-07-20) _search_
- [ ] `2026-09-30-the-router-prompt-s-wrong-rule-was-load-bearing` — The Router Prompt's "Wrong" Rule Was Load-Bearing (2026-09-30) _search_
- [ ] `2026-05-opencode-integration-workspace-isolation` — OpenCode integration — workspace isolation (2026-05) _search_
add: 
note: Confirmed: no cloud budget or approval of one in the log.
labelled: yes

## cp-01 · find · content-publisher

> Why can content now be deleted when the database used to restrict deletion?

- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword+search_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword_
- [x] `adr-0013` — Permitted Deletion (2019-07-24) _keyword+search_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _keyword+search_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword_
- [x] `adr-0008` — Restricted Deletion (2019-01-24) _keyword+search_
- [ ] `adr-0006` — Tagging Content to Governments (2018-12-12) _keyword_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword+search_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _search_
- [ ] `adr-0005` — Avoiding initialisation flickering in HTML (2018-11-27) _search_
- [ ] `adr-0001` — Record architecture decisions (2018-07-17) _search_
add: 
note: Added ADR 8 — the restriction ADR 13 revises. Not blind (demo).
labelled: yes

## cp-02 · find · content-publisher

> How is political and government tagging decided, and what changed?

- [x] `adr-0006` — Tagging Content to Governments (2018-12-12) _keyword+search_
- [x] `adr-0014` — Political and Government Tagging (2019-12-19) _keyword+search_
- [ ] `adr-0003` — Initial Domain Modelling (2018-07-23) _keyword_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword+search_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _keyword_
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword_
- [ ] `adr-0011` — Moving business logic out of controllers (2019-06-03) _search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _search_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _search_
- [ ] `adr-0004` — Editing Microcopy (2018-09-11) _search_
- [ ] `adr-0005` — Avoiding initialisation flickering in HTML (2018-11-27) _search_
add: 
note: Agreed with GLM.
labelled: yes

## cp-03 · find · content-publisher

> Why does Content Publisher store its own data instead of relying only on the Publishing API?

- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword+search_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword+search_
- [x] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _keyword+search_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword_
- [ ] `adr-0003` — Initial Domain Modelling (2018-07-23) _keyword+search_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _keyword+search_
- [ ] `adr-0011` — Moving business logic out of controllers (2019-06-03) _keyword_
- [ ] `adr-0001` — Record architecture decisions (2018-07-17) _search_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _search_
- [ ] `adr-0005` — Avoiding initialisation flickering in HTML (2018-11-27) _search_
add: 
note: ADR 2 ('Use local datastore for publisher workflow') is the answer; GLM's ADR 15/16 are about other things.
labelled: yes

## cp-04 · find · content-publisher

> How is the history of a document modelled?

- [x] `adr-0009` — Modelling history (2018-12-17) _keyword+search_
- [x] `adr-0016` — Publishing times and change history (2020-03-20) _keyword_
- [x] `adr-0003` — Initial Domain Modelling (2018-07-23) _keyword+search_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _keyword+search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _keyword_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword_
- [ ] `adr-0011` — Moving business logic out of controllers (2019-06-03) _keyword+search_
- [ ] `adr-0005` — Avoiding initialisation flickering in HTML (2018-11-27) _keyword_
- [ ] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _search_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _search_
- [ ] `adr-0004` — Editing Microcopy (2018-09-11) _search_
- [ ] `adr-0006` — Tagging Content to Governments (2018-12-12) _search_
add: 
note: Dropped GLM's ADR 2 (datastore, not history).
labelled: yes

## cp-05 · find · content-publisher

> Why was business logic moved out of controllers?

- [x] `adr-0011` — Moving business logic out of controllers (2019-06-03) _keyword+search_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword+search_
- [ ] `adr-0010` — Sending email notifiations (2019-04-09) _keyword_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword+search_
- [ ] `adr-0003` — Initial Domain Modelling (2018-07-23) _keyword_
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword+search_
- [ ] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _keyword_
- [ ] `adr-0005` — Avoiding initialisation flickering in HTML (2018-11-27) _keyword+search_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _search_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _search_
- [ ] `adr-0006` — Tagging Content to Governments (2018-12-12) _search_
add: 
note: GLM wrong: ADR 11 is literally 'Moving business logic out of controllers'.
labelled: yes

## cp-06 · find · content-publisher

> How are file attachments rendered?

- [x] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword+search_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword+search_
- [ ] `adr-0004` — Editing Microcopy (2018-09-11) _keyword_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _keyword+search_
- [ ] `adr-0010` — Sending email notifiations (2019-04-09) _keyword_
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword_
- [ ] `adr-0006` — Tagging Content to Governments (2018-12-12) _search_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _search_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _search_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _search_
add: 
note: Agreed with GLM.
labelled: yes

## cp-07 · people · content-publisher

> Who should review a change to app/models/edition.rb?

- [ ] `adr-0004` — Editing Microcopy (2018-09-11) _keyword+search_
- [ ] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _keyword_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword+search_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword+search_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _keyword+search_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword_
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _search_
- [ ] `adr-0006` — Tagging Content to Governments (2018-12-12) _search_
- [ ] `adr-0003` — Initial Domain Modelling (2018-07-23) _search_
reviewers: Kevin Dew, Ben Thorner, Emma Beynon
add: 
note: Reviewers from git: most commits on the file.
labelled: yes

## cp-08 · abstain · content-publisher

> Why did the team switch from Rails to Django?

- [x] should abstain — nothing in the graph answers this
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword_
- [ ] `adr-0010` — Sending email notifiations (2019-04-09) _keyword_
- [ ] `adr-0004` — Editing Microcopy (2018-09-11) _keyword_
- [ ] `adr-0011` — Moving business logic out of controllers (2019-06-03) _keyword_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword_
- [ ] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _keyword+search_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _search_
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _search_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _search_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _search_
- [ ] `adr-0003` — Initial Domain Modelling (2018-07-23) _search_
- [ ] `adr-0001` — Record architecture decisions (2018-07-17) _search_
add: 
note: Confirmed: no 'django' in the ADRs.
labelled: yes

## cp-09 · abstain · content-publisher

> Why was GraphQL adopted for the publishing API?

- [x] should abstain — nothing in the graph answers this
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword+search_
- [ ] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _keyword+search_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword+search_
- [ ] `adr-0003` — Initial Domain Modelling (2018-07-23) _keyword_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword_
- [ ] `adr-0010` — Sending email notifiations (2019-04-09) _keyword_
- [ ] `adr-0011` — Moving business logic out of controllers (2019-06-03) _keyword+search_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword_
- [ ] `adr-0014` — Political and Government Tagging (2019-12-19) _search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _search_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _search_
- [ ] `adr-0006` — Tagging Content to Governments (2018-12-12) _search_
add: 
note: Confirmed: no 'graphql' in the ADRs.
labelled: yes

## cp-10 · trap · content-publisher

> Why does ADR 6 still govern government tagging today?

- [x] should correct the premise
- [x] `adr-0014` — Political and Government Tagging (2019-12-19) _keyword+search_
- [x] `adr-0006` — Tagging Content to Governments (2018-12-12) _keyword+search_
- [ ] `adr-0015` — Bulk data loading (2019-12-19) _keyword_
- [ ] `adr-0009` — Modelling history (2018-12-17) _keyword_
- [ ] `adr-0016` — Publishing times and change history (2020-03-20) _keyword_
- [ ] `adr-0013` — Permitted Deletion (2019-07-24) _keyword+search_
- [ ] `adr-0001` — Record architecture decisions (2018-07-17) _keyword+search_
- [ ] `adr-0012` — Rendering File Attachments outside of Govspeak (2019-06-24) _keyword+search_
- [ ] `adr-0007` — Minimal Model (2019-01-21) _search_
- [ ] `adr-0008` — Restricted Deletion (2019-01-24) _search_
- [ ] `adr-0002` — Use local datastore for publisher workflow (2018-07-20) _search_
add: 
note: GLM wrong: ADR 6 was superseded by ADR 14 in 2019 — premise false.
labelled: yes

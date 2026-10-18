# Blind judging — 2026-10-15T15-42-48

For each question, read both answers against the key facts. Tick a fact only if the answer states it
correctly — numbers must describe the right outcome. Tick a must-not if the answer says it. For trap
questions, tick "corrected the premise" only if the answer says the premise is false. Do not open the
key file before every question is judged.
**Judged blind by a fresh subagent, 2026-10-15, before the key was opened; it saw only this sheet.**

## v2-inv-01 · find

> Why was a fabrication gate added for research reports?

### Answer A

> The fabrication gate was added after a manually-triggered weekly-news job produced a polished 15k-character report that was **entirely fabricated** — invented version numbers, benchmarks, and URLs — with the model even confessing in its intro that live search returned no results and it had "extrapolated," and the `revision_pass` then spending 166s polishing the hallucination [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].
> 
> Three stacked causes: (1) the job's stored category was `"cron"`, so dispatch fell back to live routing and landed on the thin `web_search` pipeline instead of `research`; (2) SearXNG's upstream engines had flagged the host (DDG CAPTCHA, Brave 429s, Wikidata 403s) after two days of unspaced eval+research bursts; (3) neither synthesis stage treated "zero sources fetched" as fatal [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].
> 
> The fix (commit e5ca468): `research` and `web_search` pipelines now abort (`ctx.abort`) before synthesis when zero sources exist, with an honest "search is down — I won't answer from memory" message. Doctrine: **degrade honestly, never fabricate** — no verifier can rescue a report whose every source is imaginary [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate]. This extends the verification layer's principle ("no claim should outrun its evidence") to the front door [2026-06-evidence-verification-layer-for-research].

- [x] A.fact1: a scheduled news report was delivered entirely fabricated (invented versions, benchmarks, URLs)
- [x] A.fact2: the job's stored category was 'cron', so dispatch fell back to live routing onto a thin web_search pipeline

### Answer B

> The fabrication gate was added after an incident on 2026-08-14 where a manually-triggered weekly-news job produced a polished 15k-character "report" that was **entirely fabricated** — invented model names, version numbers, benchmarks, and URLs — and the `revision_pass` then spent 166s polishing the hallucination [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].
> 
> Three causes stacked [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate]:
> 1. The job's stored category was mis-authored as `"cron"`, so dispatch fell back to live routing and landed on the thin `web_search` pipeline instead of `research`.
> 2. SearXNG's upstream engines had flagged the host (DDG CAPTCHA, Brave 429s, Wikidata 403s) after two days of unspaced eval+research bursts.
> 3. Neither synthesis stage treated "zero sources fetched" as fatal.
> 
> The fix (commit [e5ca468]) added evidence gates: `research` and `web_search` pipelines now abort before synthesis when zero sources exist, with an honest "search is down — I won't answer from memory" message. The doctrine: **degrade honestly, never fabricate** — no verifier can rescue a report whose every source is imaginary [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].

- [x] B.fact1: a scheduled news report was delivered entirely fabricated (invented versions, benchmarks, URLs)
- [x] B.fact2: the job's stored category was 'cron', so dispatch fell back to live routing onto a thin web_search pipeline

## v2-inv-02 · find

> Why must prep proposals never ask the model to construct a timestamp?

### Answer A

> Because asking the model to build `whenISO` (ISO-8601 with offset) from calendar text pushed date math and timezone reasoning into the model — a violation of "code decides, model executes." On a real qwen3.5:9b, the model burned its entire 1024-token budget on timezone prose and never emitted the JSON array, returning an empty section; mocked unit tests were green and missed it. The fix: code parses calendar lines and does all time math in the configured timezone; the model returns only an event index, an action, and an integer `minutesBefore` — an output shape too small to ruminate over [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].

- [x] A.fact1: the real qwen3.5:9b spent its whole 1024-token budget reasoning about time zones and emitted no JSON
- [x] A.fact2: the unit tests used a mocked model and were all green — only the real small model failed

### Answer B

> Because asking the model to build `whenISO` (an ISO-8601 timestamp with offset from text like "Wed, Jul 8 2:00 PM") is date math + timezone reasoning pushed into the model — a violation of the "code decides, model executes" rail. In live testing, qwen3.5:9b burned its entire 1024-token budget on timezone prose and never emitted the JSON array, so the prep-proposal check returned an empty section — even though all mocked-model unit tests were green [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].
> 
> The fix: code parses calendar lines and does all time math in the configured timezone; the model now returns only an event index, an action, and an integer `minutesBefore` — nothing code could compute [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].

- [x] B.fact1: the real qwen3.5:9b spent its whole 1024-token budget reasoning about time zones and emitted no JSON
- [x] B.fact2: the unit tests used a mocked model and were all green — only the real small model failed

## v2-inv-03 · find

> Why did the foreground model move to the RTX 3060 instead of staying on the Mac Mini?

### Answer A

> The foreground model moved to the RTX 3060 because a head-to-head benchmark showed the 3060 was ~10x faster at prefill than the Mac Mini — the dominant cost for a context-heavy resident agent [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> 
> Details:
> - Identical model (gemma4:12b), identical 9K-token cold prompt: the 3060 prefilled at **1,220 tok/s** (~3.3s for a 4,000-token chat prompt) vs the M4 Mini's **123 tok/s** (~33s) [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - Prefill is compute-bound (parallel matmul over every input token), and a resident agent spends nearly all its time there — published benchmarks put a 4090 at "3x+" an M4 Max on prompt processing [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - The Mini wasn't discarded: it stays routable for short-prompt work (subagent tasks, evals, batch), where it went 7/7 in the duel — 400-token prompts cost ~3s there [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - One trade-off: `session.contextSize` was cut from 96,000 to 32,768 because the 3060's 12GB means a large KV cache competes with the weights [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - Also ruled out: clustering Minis over Thunderbolt doesn't fix it — pipeline parallelism adds capacity, not per-request FLOPS, and tensor parallelism needs ~900GB/s interconnect vs Thunderbolt's ~10GB/s [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] A.fact1: prefill on the 3060 was about 1,220 tok/s versus about 123 tok/s on the M4 Mac Mini (roughly 10x)
- [x] A.fact2: prefill dominates a context-heavy resident agent
- [ ] A.wrong1: says "the Mac Mini was faster at prefill"

### Answer B

> I don't know — the entries have nothing on this. They describe the opposite direction of movement: voice serving moved *to* the Mac Mini (mlx-audio on `Peters-Mac-mini`) [2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat], and the voice fast-path was moved off the 3060 onto the A5000's 27B [2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat]. No entry explains a foreground model relocating to the RTX 3060.

- [ ] B.fact1: prefill on the 3060 was about 1,220 tok/s versus about 123 tok/s on the M4 Mac Mini (roughly 10x)
- [ ] B.fact2: prefill dominates a context-heavy resident agent
- [ ] B.wrong1: says "the Mac Mini was faster at prefill"

## v2-inv-04 · find

> Why must FalkorDB's data volume be mounted at /var/lib/falkordb/data?

### Answer A

> Because FalkorDB persists to `/var/lib/falkordb/data` (its `FALKORDB_DATA_PATH`) — the May container had mounted its volume at `/data` instead, so the volume was empty and the real `dump.rdb` lived in the container's disposable writable layer, meaning a plain `docker rm` would have destroyed all graph memory [2026-07-14-falkordb-the-volume-that-wasn-t]. The fix was mounting the volume at the correct path so the process's actual persistence path writes into it [2026-07-14-falkordb-the-volume-that-wasn-t].

- [x] A.fact1: the volume was mounted at /data but FalkorDB persists to /var/lib/falkordb/data
- [ ] A.fact2: two months of graph memory lived in the container's writable layer; removing the container would have destroyed it

### Answer B

> Because FalkorDB's actual persistence path is `/var/lib/falkordb/data` (its `FALKORDB_DATA_PATH`), and an earlier container mounted the volume at `/data` instead — leaving the volume empty while the real `dump.rdb` sat in the container's disposable writable layer. Two months of graph memory (1,301 turns, all facts/entities) would have been destroyed by any plain `docker rm`. The fix was to mount the volume at the correct path, plus a host-side RDB backup and `--restart unless-stopped` [2026-07-14-falkordb-the-volume-that-wasn-t].

- [x] B.fact1: the volume was mounted at /data but FalkorDB persists to /var/lib/falkordb/data
- [x] B.fact2: two months of graph memory lived in the container's writable layer; removing the container would have destroyed it

## v2-inv-05 · find

> Can Qwen3.8-27B at Q2 on a Mac Mini carry the conversational traffic?

### Answer A

> No — it was measured and failed, 1/7, dead on that hardware [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]. Two independent cliffs:
> 
> - **Quant cliff (model):** with thinking ON, the model got 17×23 wrong, and one task thrashed 30 iterations/259s without writing the file (vs 8.8s on NVFP4); its one clean pass was 6× slower. Only think-OFF short answers stayed correct and fast [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].
> - **Memory cliff (box):** ~13.5GB dynamic ceiling vs a 27B that barely fits — oMLX bounced requests as KV grew (12.92→13.85GB creep) and then evicted the model entirely (507). Conversational/agentic loops grow context, which this box rejects by design; Q3 never fit at all [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].
> 
> Standing conclusion from that decision: 2-bit is past the quality cliff for agentic work even when it fits, and a 16GB-class Mini can't hold a 27B with KV headroom. The Mini's real profile is small-model (4–14B at 4–8bit) utility work with short prompts — the follow-up tenant tested was gemma4:12b, which matched the flagship [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches].

- [x] A.fact1: no — it scored 1/7 on the oracle duel
- [x] A.fact2: two separate cliffs: quantization quality and memory
- [ ] A.wrong1: says "it worked well enough"

### Answer B

> No — it was measured and failed. Qwen3.8-27B@Q2 on the .221 Mac Mini scored **1/7** on the oracle duel, dead on two independent cliffs [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]:
> 
> - **Quant cliff:** with thinking ON, 17×23 came out wrong, md-linecounts thrashed 30 iterations/259s without writing the file (vs NVFP4's 8.8s), and the one clean pass (csv-revenue) was 6× slower at 117s. Only think-OFF short answers stayed correct and fast.
> - **Memory cliff:** ~13.5GB dynamic ceiling vs a 27B that barely fits — prefill guard bounced requests as KV grew, then evicted the model entirely (507). Q3 never fit at all.
> 
> Standing conclusion: 2-bit is past the quality cliff for agentic work even when it fits, and a 16GB-class box can't hold a 27B with agentic KV headroom. The Mini's real profile is small-model (4–14B at 4–8bit) short-prompt utility work. Conversational traffic went to gemma4:12b (7/7, avg 43.4s/task) on the Mini, with foreground later moved to the 3060 [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches] [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] B.fact1: no — it scored 1/7 on the oracle duel
- [x] B.fact2: two separate cliffs: quantization quality and memory
- [ ] B.wrong1: says "it worked well enough"

## v2-inv-06 · find

> What went wrong right after the SGLang cutover?

### Answer A

> Right after the SGLang cutover, the midnight cron produced a one-facet, 3-source report — the eval's own failure class. Root cause: the llm pipeline stages never forwarded `think` at all, so qwen's default-on thinking burned decompose's 700-token budget ("thinking models fail at budgets," now observed in prod). Verification carried the report honestly (6/9 flagged, 3 Tier-1 contradictions caught, self-flagged source concentration) [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency].

- [x] A.fact1: the midnight cron produced a thin one-facet, 3-source report
- [x] A.fact2: the LLM pipeline stages never forwarded `think`, so qwen's default-on thinking burned the decompose stage's 700-token budget

### Answer B

> Right after the cutover, two things went wrong:
> 
> 1. **The midnight cron produced a one-facet, 3-source report** — the same failure class the eval catches. Root cause: the LLM pipeline stages never forwarded `think` at all, so qwen's default-on thinking burned decompose's 700-token budget ("thinking models fail at budgets", now observed in prod). Verification carried the report honestly (6/9 flagged, 3 Tier-1 contradictions caught, self-flagged source concentration) [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency].
> 
> 2. **Chat latency complaint** — logs showed queueing behind the research cron on the shared fleet box, not model slowness; deepseek never felt this only because it had a dedicated box (tenancy, not intelligence) [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency].
> 
> Both were fixed in the cutover itself: per-stage think control (`LlmStage.think`, caps-gated forwarding, decompose/gap_check pinned to `think:false` with raised budgets) and Peter deploying SGLang + NVFP4 on Spark-2 with `--max-running-requests 4` for real continuous batching [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency].

- [x] B.fact1: the midnight cron produced a thin one-facet, 3-source report
- [x] B.fact2: the LLM pipeline stages never forwarded `think`, so qwen's default-on thinking burned the decompose stage's 700-token budget

## v2-inv-07 · trap

> Why was the RTX 3060 rejected in favour of the Mac Mini for the foreground model?

### Answer A

> The entries say the opposite happened: the foreground model moved **to** the 3060, not away from it. A head-to-head with identical model (gemma4:12b) and 9K-token cold prompt showed the 3060 at 1,220 tok/s prefill (~3.3s for a 4,000-token prompt) vs the M4 Mac Mini's 123 tok/s (~33s) — a 10x prefill advantage from a card costing half the Mini [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060]. The Mini was kept only for short-prompt subagent work, where it went 7/7 on the duel [2026-09-19].
> 
> If you're asking why the 3060 was later *reduced* in role: the voice fast-path model `qwen2.5:7b` living on the 12GB 3060 beside phi4 caused model thrashing (2.5s cold, 7.6s mid-thrash), so voice moved to the A5000's resident 27B [2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat] — but that's about voice, not the foreground model.

- [x] A.fact1: the premise is false: the 3060 was chosen — it was about 10x faster at prefill
- [ ] A.wrong1: says "the 3060 was rejected"
- [x] A.premise: corrected the premise

### Answer B

> The premise is inverted: the graph shows the RTX 3060 was *chosen* over the Mac Mini, not rejected. The head-to-head [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060] measured identical gemma4:12b with a 9K-token cold prompt: the 3060 prefilled at 1,220 tok/s (~3.3s for a 4,000-token prompt) vs the M4 Mini's 123 tok/s (~33s) — a 10x prefill gap from a card costing half the Mini. Since prefill is compute-bound and a context-heavy resident agent spends nearly all its time there, the foreground moved to the 3060; the Mini was demoted to short-prompt subagent work (400-token prompts cost ~3s there), where it went 7/7 in the duel.
> 
> The Mini's earlier foreground run [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches] had scored 7/7 on quality, but it was superseded the same day by the 3060 on speed. Note also the standing warning that clustering Minis over Thunderbolt wouldn't fix it — pipeline parallelism adds capacity, not per-request FLOPS [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] B.fact1: the premise is false: the 3060 was chosen — it was about 10x faster at prefill
- [ ] B.wrong1: says "the 3060 was rejected"
- [x] B.premise: corrected the premise

## v2-inv-08 · trap

> Why did Q2 quantisation make the 27B model faster on the Mac Mini?

### Answer A

> It didn't, really — the graph says Q2 was only faster in a narrow case, and the experiment was a failure overall.
> 
> Per [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]:
> 
> - **Where it was fast:** think-OFF short answers stayed correct and fast (3 ctok / 1.2s) — with 2-bit weights the model barely fits and reads far less memory per token, so short generations are quick.
> - **Where it wasn't:** with thinking ON, the model signal degraded — it got 17×23 wrong, and md-linecounts thrashed 30 iterations / 259s without writing the file (vs 8.8s on NVFP4). The one clean pass (csv-revenue) took 117s, 6× slower.
> - **It also didn't fit reliably:** the Mini's ~13.5GB dynamic ceiling meant oMLX's prefill guard bounced requests as KV grew (12.92→13.85GB creep), then evicted the model entirely (507, "current: 2.70GB"). Q3 never fit at all.
> 
> Standing conclusion from that decision: 2-bit is past the quality cliff for agentic work even when it fits, and a 16GB-class box can't hold a 27B with agentic KV headroom. The Mini's real profile is small-model (4–14B at 4–8bit) work — which is why the next tenant tested was gemma4:12b [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches].

- [ ] A.fact1: the premise is false: at Q2 it was worse and slower — 1/7, and the one pass was about 6x slower
- [ ] A.wrong1: says "Q2 made it faster"
- [x] A.premise: corrected the premise

### Answer B

> I don't know — the entries have nothing on this. They cover voice latency on the Mac Mini (mlx-audio, keepAlive pinning, model residency on the A5000) and model evaluation, but no decision-log entry mentions Q2 quantisation of the 27B model or why it made things faster.

- [ ] B.fact1: the premise is false: at Q2 it was worse and slower — 1/7, and the one pass was about 6x slower
- [ ] B.wrong1: says "Q2 made it faster"
- [ ] B.premise: corrected the premise

## v2-inv-09 · abstain

> Why was the gateway rewritten in Rust?

### Answer A

> I don't know — the entries have nothing on this. They describe gateway issues (429 rate limits, routing latency, a `format` typing bug, the gateway box being retired on the 19th) [2026-06-gateway-429-rate-limit-under-request-bursts, 2026-06-routing-latency-on-the-gateway, 2026-07-05-small-model-hardening-bounded-autonomy-gates, 2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat], but no entry mentions a Rust rewrite of the gateway or a reason for one.

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the graph has no path for this. I searched for a Rust rewrite of the gateway and found no decision, commit, or experiment recording one. The graph does show gateway-related problems that were open or parked — 429 rate limiting under bursts (cap of 100 requests/minute, proposed raise to 300–500, fixes "NOT yet done") [2026-06-gateway-429-rate-limit-under-request-bursts] and routing latency of 4957ms attributed inconclusively to gateway contention [2026-06-routing-latency-on-the-gateway] — but neither mentions a Rust rewrite as the cause or the fix.

- [x] B.abstained: declined without inventing a reason

## v2-inv-10 · abstain

> Why did Invarail choose AWS Lambda for scheduled jobs?

### Answer A

> I don't know — the entries have nothing on AWS Lambda or scheduled jobs. The decision log covers topics like the Pi coding substrate, the LocalClaw→Invarail rename, the harness duel, and the Laya router experiment, but no AWS Lambda decision appears anywhere.

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the graph has no path for this. There is no decision in the log about choosing AWS Lambda for scheduled jobs (searches for "Lambda" and "AWS Lambda scheduled jobs" return nothing relevant). The closest related material is about a heartbeat cron [2026-04-briefing-on-heartbeat-cron] and the cron path generally [2026-07-20-the-three-reminders-every-seam-in-the-cron-path-at-once], but neither mentions AWS Lambda or why it would have been chosen.

- [x] B.abstained: declined without inventing a reason

## v2-cp-01 · find

> How does Content Publisher stop elements flashing while the page initialises?

### Answer A

> I don't know — the entries have nothing on this. None of the decision-log entries (covering publishing times, history modelling, file attachment rendering, political tagging, and bulk data loading) mention preventing elements from flashing during page initialisation.

- [ ] A.fact1: it uses a `js-enabled` class (option 2) as the interim, pragmatic approach

### Answer B

> Content Publisher hides elements **before** JavaScript initialises using a `js-enabled` class added to the `<body>` while the page loads [adr-0005].
> 
> Details from [adr-0005]:
> - The problem: elements meant to be hidden until a user acts via JavaScript caused a distracting flash on load, with several ad-hoc fixes flagged in testing.
> - Three options were considered: do nothing; hide content in advance using the existing `js-enabled` body class; or add a `js-failed` fallback class after a 2-second grace period (via `setTimeout` checking `window.jsInitialised`) for when JS is enabled but fails.
> - The decision: take option 2 — use the `js-enabled` class — as the pragmatic interim approach, since option 1 was causing tester problems and option 3 was considered unusual and worth investigating further. The trade-off accepted is no fallback if JavaScript is enabled but fails.

- [x] B.fact1: it uses a `js-enabled` class (option 2) as the interim, pragmatic approach

## v2-cp-02 · find

> How does Content Publisher send email notifications?

### Answer A

> Per [adr-0010], Content Publisher sends email notifications (e.g. about publishing a document) via GOV.UK Notify. The entry notes the need to determine recipients, generate email content, and send the email, and that sending should be robust against transient failure and only happen after DB updates and critical API calls — but the entry is truncated, so the full decision details (e.g. exact job/mailer setup) aren't available.

- [ ] A.fact1: GOV.UK Notify, used with Action Mailer, Active Job and Sidekiq

### Answer B

> Content Publisher sends email notifications via **GOV.UK Notify**, using Rails **Action Mailer** with delivery handled asynchronously through **Active Job on Sidekiq** [adr-0010].
> 
> Key points from the ADR [adr-0010]:
> - Emails notify users of actions like publishing a document; recipients are worked out, content generated, then sent via the Notify Ruby client.
> - Sending is deliberately not on the critical path: emails are only sent after DB updates and critical API calls succeed, and the design is robust against transient failure (Active Job retry semantics with Sidekiq).
> - Non-production environments have a means of seeing what notifications *would* be sent rather than delivering them (Notify's team allow-list/whitelist behavior).
> - Failures are reported to Sentry (Raven's Active Job integration), and Sidekiq is monitored via Grafana.
> 
> The related worker code came from commits "Create basic Scheduled Publishing Worker" [88e27840] and "Use AbortWorkerError in ScheduledPublishingWorker" [ce13ccd3].

- [x] B.fact1: GOV.UK Notify, used with Action Mailer, Active Job and Sidekiq

## v2-cp-03 · find

> How does Content Publisher avoid slow requests when it needs long lists from the Publishing API?

### Answer A

> Content Publisher avoids slow web requests by never loading bulk data from the Publishing API during a request. Per [adr-0015]:
> 
> - Long lists (organisations, contacts, topic taxonomy) require multiple HTTP requests, which risk slow responses or timeouts when done inline — partially mitigated before by caching [adr-0015].
> - Instead, data is read from Redis at runtime, and a background job re-populates it on boot and every 15 minutes, following the pattern Whitehall uses for the topic taxonomy [adr-0015].
> - The cache is wrapped in `BulkData::Cache`, with repository classes handling loading/modelling [adr-0015].
> - Cached data expires after 24 hours — far longer than the 15-minute refresh — as a safety net so users see no issues even if repopulation fails; errors are logged and retried, with Sentry reporting decided per error type [adr-0015].

- [x] A.fact1: the data is read from Redis at runtime, and a periodic background job re-populates it (the same pattern as Whitehall)

### Answer B

> Content Publisher avoids slow requests by not loading bulk data from the Publishing API during web requests. Instead, it follows a pattern similar to Whitehall's: data is read from Redis at runtime, and a periodic background job re-populates the Redis data [adr-0015].
> 
> Specifically:
> - The Rails Redis cache store is wrapped in a `BulkData::Cache` object, with repository classes for loading and modelling the cached data [adr-0015].
> - A background job runs on application boot and every 15 minutes to re-populate the data, logging and retrying on errors [adr-0015].
> - Cached data expires after 24 hours — much longer than the 15-minute refresh interval — as a safety net so users see no issues even if repopulation fails for a while [adr-0015].

- [x] B.fact1: the data is read from Redis at runtime, and a periodic background job re-populates it (the same pattern as Whitehall)

## v2-cp-04 · find

> When should a class in Content Publisher be treated as a model?

### Answer A

> I don't know — the entries have nothing on this. They cover domain modelling decisions (documents, editions, revisions, timeline) [adr-0009] [adr-0003], but none of them define criteria for when a class in Content Publisher should be treated as a model.

- [ ] A.fact1: its name is a noun that represents a domain concept
- [ ] A.fact2: its instances have multiple attributes that encapsulate it

### Answer B

> Per [adr-0007] (Minimal Model, 2019-01-21), a class should be treated as a model (and live in `app/models`) if it has all of these properties:
> 
> - **Its name is a noun representing a domain concept** — e.g. `Document`; guideline: hard to rename to a verb, and documented in the README nomenclature.
> - **Instances have multiple attributes that encapsulate it** — e.g. `DocumentType` encapsulates publishing metadata and tags; attributes should be public and required.
> - **Instances have a unique identifier attribute** — e.g. `Document`'s database `id`, or `DocumentType`'s `id` in its config file.
> - **Instances support mass-assignment of attributes** — ActiveRecord-style for `Document`, assignment on initialize for readonly `DocumentType`.
> 
> Counter-examples that are *not* models: `DocumentUrl` (no public attributes) and `UserFacingState` (no unique ID) [adr-0007]. Consequence: `DocumentType` and `Supertype` were moved into `app/models`, and classes there lacking these properties should be moved out [adr-0007].

- [x] B.fact1: its name is a noun that represents a domain concept
- [x] B.fact2: its instances have multiple attributes that encapsulate it

## v2-cp-05 · find

> Which user-facing strings are extracted for translation, and which are not?

### Answer A

> The graph's answer comes from the translations ADR [adr-0004] (recorded in commit [cf8cc160]):
> 
> - **Extracted for translation:** all static user-facing strings in the application — page titles, button text, guidance pages, error messages — are extracted to a central location in `config/locales/en`, organized hierarchically (e.g. `I18n.t("publish.published.reviewed.title")`), with support for pluralization, raw HTML, and variables like `%{title}` [adr-0004].
> - **Not extracted:** the ADR explicitly considered leaving some strings in the tests (to keep tests readable), but the text recording which option was finally chosen is truncated in the graph, so I can't confirm from the graph whether test strings were ultimately extracted or left inline [adr-0004].
> 
> The rationale for extraction: inline strings are hard to audit (some only appear under special conditions like error messages), hard to change consistently without a developer, and distract from the code's logical flow [adr-0004].

- [ ] A.fact1: link and button labels are not extracted

### Answer B

> I don't know — the entries have nothing on this. [adr-0004] describes extracting static text into Rails translations in `config/locales/en` and discusses approaches for extracting strings in tests, but its text is truncated and never specifies which user-facing strings are extracted and which are not.

- [ ] B.fact1: link and button labels are not extracted

## v2-cp-06 · trap

> Why does Content Publisher forbid deleting any data?

### Answer A

> Content Publisher's deletion policy comes from [adr-0008] (Restricted Deletion, 2019-01-24, recorded in commit [86fae5cf]):
> 
> - At the time, the team had **no real-world scenarios for deleting data from the database**, so they chose the simplest thing: `restrict` on all foreign key delete actions, specified explicitly to signal a conscious decision [adr-0008].
> - They acknowledged this makes deletion difficult (e.g. removing a user's personal data) and intended to revisit it if it became a pain point [adr-0008].
> - Dev-environment cleanup should be done by resetting the database, not by loosening production deletion rules [adr-0008].
> 
> Note: it was later partially revised by [adr-0013] (Permitted Deletion, 2019-07-24), which dropped the hard-and-fast rule that all foreign keys must restrict deletion — so the current stance is case-by-case, not an absolute ban.

- [ ] A.fact1: the premise is false: ADR 13 permits deletion, for access-limited data synced to other environments, revising ADR 8's restriction
- [ ] A.wrong1: says "deletion is forbidden"
- [x] A.premise: corrected the premise

### Answer B

> I don't know — the entries have nothing on this. None of the provided decision-log entries mention a rule forbidding the deletion of data in Content Publisher. The closest related themes are immutability used as an implicit means of storing history in the domain model [adr-0009], but no entry states a prohibition on deleting data or the reasons for one.

- [ ] B.fact1: the premise is false: ADR 13 permits deletion, for access-limited data synced to other environments, revising ADR 8's restriction
- [ ] B.wrong1: says "deletion is forbidden"
- [ ] B.premise: corrected the premise

## v2-cp-07 · abstain

> Why was MongoDB chosen as the datastore?

### Answer A

> The graph doesn't contain a decision that explicitly names MongoDB as the datastore — I don't know why MongoDB specifically was chosen.
> 
> What the graph does record is the decision to use a **local datastore** at all ([adr-0002], "Use local datastore for publisher workflow", 2018-07-20). That ADR chose Option 2 (local datastore) over Option 1 (no local datastore, everything in the Publishing API) because:
> 
> - It's standard Rails, quick to build and easy to understand, and easy to test (testing against an API requires lots of stubbing) [adr-0002]
> - It's easy to iterate the workflow locally, whereas changing the API workflow is much harder [adr-0002]
> - Interim data is needed that isn't required for publishing, plus publisher metadata like notes, which would otherwise require new Publishing API features [adr-0002]
> - Difficulties building Specialist Publisher as an API-only client led the team to reconsider the 2016/2017 "no local datastore" architecture goals [adr-0002]
> 
> The decision was recorded in commit [61bd78b2] by Erin Raj-Staniland. But for MongoDB itself as the specific technology, I don't know — the graph has no path for this.

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the entries have nothing on this. The decision log covers the choice of a local datastore for the publisher workflow [adr-0002] and the use of Redis for bulk data caching [adr-0015], but no entry explains why MongoDB (or any specific datastore) was chosen.

- [x] B.abstained: declined without inventing a reason

## v2-l4b-01 · find

> Why does log4brains use Lunr for search?

### Answer A

> Log4brains chose Lunr.js over Fuse.js for its ADR search bar ([adr-20201103]).
> 
> The decision drivers were that the search must work in both preview mode and the statically built version, provide fuzzy search and stemming, be fast enough to show results while typing, and not consume too much client-side CPU/RAM ([adr-20201103]).
> 
> Lunr won because, compared to Fuse.js (fast indexing but slow searching, fuzzy-only with no stemming), Lunr offers fast searching, stemming and multi-language support, index serialization so indexes can be pre-built for the static version, and it retrieves the position of matched tokens ([adr-20201103]).

- [x] A.fact1: it had to work both in preview mode and in the statically built site
- [x] A.fact2: fuzzy search and stemming, fast enough to show results while typing, light on client CPU and memory
- [x] A.fact3: Lunr.js was chosen over Fuse.js

### Answer B

> Log4brains chose Lunr.js over Fuse.js for the ADR search bar because Lunr offers fast searching (results while typing), stemming and multi-language support, and supports index serialization so indexes can be pre-built — important since search must work in both preview mode and the statically built version without consuming too much client-side CPU/RAM. Fuse.js was rejected because its searching is slow and it only does fuzzy search with no stemming. [adr-20201103]

- [x] B.fact1: it had to work both in preview mode and in the statically built site
- [ ] B.fact2: fuzzy search and stemming, fast enough to show results while typing, light on client CPU and memory
- [x] B.fact3: Lunr.js was chosen over Fuse.js

## v2-l4b-02 · find

> Why is log4brains split into multiple packages in a monorepo?

### Answer A

> Log4brains uses a multi-package monorepo (with Yarn and Lerna) rather than a monolith because the team wanted the core library/API to be very well tested and developed with DDD and hexagonal architecture, with other packages (web UI, CLI) just calling that core API and containing as few business rules as possible. Since future features were uncertain (e.g., editing ADRs from the web UI, a VSCode extension, multi-repo ADR aggregation), this structure was seen as good for extensibility. Yarn + Lerna was also considered a well-established practice among open-source projects for publishing npm packages [adr-20200925-multi-packages-architecture-in-a-monorepo-with-yarn-and-lerna].

- [x] A.fact1: not a monolith: a well-tested core API that the other packages call
- [x] A.fact2: Yarn and Lerna

### Answer B

> It's a deliberate architecture decision recorded in [adr-20200925-multi-packages-architecture-in-a-monorepo-with-yarn-and-lerna] (2020-09-25, commit [03550dc]):
> 
> - A monolith was rejected because the team wanted the **core library/API to be very well tested**, developed with DDD and hexagonal architecture, with other packages (CLI, web UI) containing as few business rules as possible — good for extensibility since future features were uncertain (possible VSCode extension, ADR aggregation from multiple repos).
> - Among monorepo options, **Yarn + Lerna** was chosen because it's a well-established practice used by many open-source projects to publish npm packages.
> - A multi-repo split was considered but the monorepo with Yarn workspaces + Lerna won.
> 
> The result is the `packages/` layout (core, cli, cli-common, web-ui) you see today.

- [x] B.fact1: not a monolith: a well-tested core API that the other packages call
- [x] B.fact2: Yarn and Lerna

## v2-l4b-03 · find

> Why does the core API, rather than the UI, enhance ADR markdown with MDX?

### Answer A

> The core API enhances ADR markdown with MDX because, if a VSCode extension is developed in the future, it's better to keep more business logic in the core package, where it is better tested [adr-20201026]. This aligns with the broader monorepo architecture, where the core library/API is well tested and other packages just call it, containing as few business rules as possible [adr-20200925-multi-packages-architecture-in-a-monorepo-with-yarn-and-lerna].
> 
> A trade-off of this choice: the metadata in the header is simply removed, but each UI package must implement its own Header component [adr-20201026].

- [ ] A.fact1: links between ADRs must become URLs and the header must be rendered with components
- [x] A.fact2: a possible future VSCode extension was the decision driver

### Answer B

> Per [adr-20201026], the ADR markdown body can't be used as-is: inter-ADR links must be replaced with correct URLs and the header (status, date, deciders) must be rendered with specific components. Two options were considered — UI responsible vs. core API responsible (with MDX) — and the core API was chosen because a potential future VSCode extension would benefit from having more business logic in the core package, which is also better tested [adr-20201026]. Trade-offs: the header metadata is simply removed (positive), but each UI package must implement its own Header component (negative) [adr-20201026].

- [x] B.fact1: links between ADRs must become URLs and the header must be rendered with components
- [x] B.fact2: a possible future VSCode extension was the decision driver

## v2-l4b-04 · find

> Why is log4brains distributed as a global npm package?

### Answer A

> Log4brains is distributed as a global npm package to make installation simpler and language-agnostic [adr-20210113]. The previous procedure (`npx init-log4brains`, installing `@log4brains/cli` and `@log4brains/web` locally) was optimized for JS projects and didn't work for non-JS ones, but Log4brains is intended for all projects [adr-20210113]. The decision drivers were simplicity of installation, language agnosticism, an init script that works on any project, and a faster "getting started" [adr-20210113]. The new procedure is `npm install -g log4brains` followed by `log4brains init` [adr-20210113].
> 
> A noted trade-off: JS projects can no longer pin Log4brains to a specific version; an xo-like behavior (using a local install when available) may be implemented later [adr-20210113].

- [x] A.fact1: a simpler, language-agnostic installation that works on any kind of project

### Answer B

> Log4brains is distributed as a global npm package because its original install (`npx init-log4brains`, installing `@log4brains/cli` and `@log4brains/web` locally) only worked well for JS projects — non-JS projects had to install manually and the init script didn't work. Since Log4brains is intended for all projects, not just JS ones, the goal was a simpler, language-agnostic install with a faster getting-started experience: `npm install -g log4brains` then `log4brains init` [adr-20210113].
> 
> The global `log4brains` package requires the existing `@log4brains/cli` and `@log4brains/web` packages, and `init-log4brains` was renamed to `@log4brains/init` [adr-20210113]. Known trade-off: JS projects can no longer pin a specific version; an xo-like behavior (using a local install when available) was left as a possible future improvement [adr-20210113].

- [x] B.fact1: a simpler, language-agnostic installation that works on any kind of project

## v2-l4b-05 · find

> What does the codebase do instead of default exports?

### Answer A

> The codebase uses **named exports instead of default exports** — per ADR [adr-20200927] ("Avoid default exports", accepted 2020-09-27, source: docs/adr/20200927-avoid-default-exports.md:1-13), recorded in commit [03550dc]. The ADR cites external arguments against default exports (humanwhocodes blog, basarat's "default is bad").

- [x] A.fact1: named exports, everywhere

### Answer B

> The codebase uses named exports instead of default exports [adr-20200927].

- [x] B.fact1: named exports, everywhere

## v2-l4b-06 · trap

> Why does log4brains still use Simplified Git Flow?

### Answer A

> It doesn't anymore. Log4brains switched back to GitHub Flow on 2024-12-17 [adr-20241217]. The Simplified Git Flow (adopted 2024-09-26 [adr-20240926]) was abandoned because Lerna, used to manage the monorepo, doesn't integrate well with Git Flow — it couldn't publish a stable release from a branch other than the main one [adr-20241217]. They kept the automated beta releases but made stable releases a manual script run by maintainers [adr-20241217].

- [x] A.fact1: the premise is false: it switched back to GitHub Flow in December 2024, because Lerna could not publish a stable release from a branch other than the main one
- [ ] A.wrong1: says "it still uses Simplified Git Flow"
- [x] A.premise: corrected the premise

### Answer B

> It doesn't anymore — the graph shows the opposite. Simplified Git Flow was adopted on 2024-09-26 to separate development from releases while enabling automated beta releases [adr-20240926], but that experiment was **disproven** due to tooling limitations [adr-20241217]. On 2024-12-17 the project switched back to GitHub Flow, keeping only the automated beta releases [adr-20241217].

- [ ] B.fact1: the premise is false: it switched back to GitHub Flow in December 2024, because Lerna could not publish a stable release from a branch other than the main one
- [ ] B.wrong1: says "it still uses Simplified Git Flow"
- [x] B.premise: corrected the premise

## v2-l4b-07 · abstain

> Why was PostgreSQL chosen for storing ADRs?

### Answer A

> I don't know — the graph has no path for this. There's no decision, commit, or disproven experiment mentioning PostgreSQL anywhere in the graph. In fact, the ADRs here were decided to be stored as Markdown files, not in a database [adr-20200924].

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the entries have nothing on this. They cover ADR format (MADR), search (Lunr), code style, monorepo architecture, and MDX rendering, but no decision about PostgreSQL or any database for storing ADRs.

- [x] B.abstained: declined without inventing a reason

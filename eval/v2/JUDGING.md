# Blind judging — 2026-10-18T02-44-20

For each question, read both answers against the key facts. Tick a fact only if the answer states it
correctly — numbers must describe the right outcome. Tick a must-not if the answer says it. For trap
questions, tick "corrected the premise" only if the answer says the premise is false. Do not open the
key file before every question is judged.

**Judged blind by a fresh subagent, 2026-10-18, before the key was opened; it saw only this sheet.**

## v2-inv-01 · find

> Why was a fabrication gate added for research reports?

### Answer A

> The fabrication gate was added after a manually-triggered weekly-news job produced a polished 15k-character report that was **entirely fabricated** — invented version numbers, benchmarks, and URLs for Qwen3-Next, Llama 4.5, Ollama v0.8.2, and an arxiv preprint. The model even admitted in its intro that live search returned no results and it had "extrapolated," yet the `revision_pass` spent 166s polishing the hallucination anyway [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].
> 
> Three stacked causes: (1) the job's stored category was `"cron"` (mis-authored), so dispatch fell to live routing and landed on the thin `web_search` pipeline instead of `research`; (2) SearXNG's upstream engines had flagged the host (DDG CAPTCHA, Brave 429s, Wikidata 403s) after two days of unspaced eval+research bursts; (3) neither synthesis stage treated "zero sources fetched" as fatal [2026-08-14].
> 
> The fix (commit e5ca468): `research` and `web_search` pipelines now abort (`ctx.abort`) before synthesis when zero sources exist, with an honest "search is down — I won't answer from memory" message. Doctrine: **degrade honestly, never fabricate** — extending the verification layer's principle ("no claim should outrun its evidence" [2026-06-evidence-verification-layer-for-research]) to the front door, because no verifier can rescue a report whose every source is imaginary [2026-08-14].

- [x] A.fact1: a scheduled news report was delivered entirely fabricated (invented versions, benchmarks, URLs)
- [x] A.fact2: the job's stored category was 'cron', so dispatch fell back to live routing onto a thin web_search pipeline

### Answer B

> The fabrication gate was added after an incident where a manually-triggered weekly-news job produced a polished 15k-character "report" that was **entirely fabricated** — invented model names, version numbers, benchmarks, and URLs — and the `revision_pass` then spent 166s polishing the hallucination [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].
> 
> Three causes stacked [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate]:
> 1. The job's stored category was `"cron"` (mis-authored), so dispatch fell back to live routing and landed on the thin `web_search` pipeline instead of `research`.
> 2. SearXNG's upstream engines had flagged the host (DDG CAPTCHA, Brave 429s, Wikidata 403s) after two days of unspaced eval+research bursts — so zero sources were fetched.
> 3. Neither synthesis stage treated "zero sources fetched" as fatal.
> 
> The fix (commit [e5ca468]) added evidence gates: `research` and `web_search` pipelines now abort before synthesis when zero sources exist, with an honest "search is down — I won't answer from memory" message. The doctrine: **degrade honestly, never fabricate** — no verifier can rescue a report whose every source is imaginary [2026-08-14-zero-evidence-in-confident-report-out-the-fabrication-gate].

- [x] B.fact1: a scheduled news report was delivered entirely fabricated (invented versions, benchmarks, URLs)
- [x] B.fact2: the job's stored category was 'cron', so dispatch fell back to live routing onto a thin web_search pipeline

## v2-inv-02 · find

> Why must prep proposals never ask the model to construct a timestamp?

### Answer A

> Because asking the model to build `whenISO` (an ISO-8601 timestamp with offset from text like "Wed, Jul 8 2:00 PM") is date math + timezone reasoning pushed into the model — a violation of the "code decides, model executes" rail. In live testing on qwen3.5:9b, the model burned its entire 1024-token budget on timezone prose and never emitted the JSON array, returning an empty section — while all mocked-model unit tests stayed green [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].
> 
> The fix: code parses calendar lines and does all time math in the configured timezone; the model returns only an event index, an action, and an integer `minutesBefore` — a shape too small to ruminate over. That passed live on deepseek-v4-flash first try [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].

- [x] A.fact1: the real qwen3.5:9b spent its whole 1024-token budget reasoning about time zones and emitted no JSON
- [x] A.fact2: the unit tests used a mocked model and were all green — only the real small model failed

### Answer B

> Because asking the model to build `whenISO` (an ISO-8601 timestamp with offset) from calendar text is date math + timezone reasoning pushed into the model — a violation of "code decides, model executes." In live testing on qwen3.5:9b, the model burned its entire 1024-token budget on timezone prose and never emitted the JSON array, returning an empty section — a failure mocked unit tests couldn't catch [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].
> 
> The fix: code parses calendar lines and does all time math in the configured timezone; the model returns only an event index, an action, and an integer for the reminder. General lesson: a model's output schema should never contain anything code can compute — every such field is a place for a small model to drown [2026-07-07-prep-proposals-never-ask-a-model-to-construct-a-timestamp].

- [x] B.fact1: the real qwen3.5:9b spent its whole 1024-token budget reasoning about time zones and emitted no JSON
- [x] B.fact2: the unit tests used a mocked model and were all green — only the real small model failed

## v2-inv-03 · find

> Why did the foreground model move to the RTX 3060 instead of staying on the Mac Mini?

### Answer A

> The foreground model moved to the RTX 3060 because a head-to-head benchmark showed the 3060 was ~10x faster at prefill than the Mac Mini — the workload's dominant cost [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> 
> Details:
> - Identical model (gemma4:12b), identical 9K-token cold prompt: the 3060 prefilled at 1,220 tok/s (~3.3s for a 4,000-token chat prompt) vs the M4 Mini's 123 tok/s (~33s) [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - Prefill is compute-bound (parallel matmul over every input token), and a context-heavy resident agent spends nearly all its time there — confirmed against published benchmarks [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - The Mini wasn't discarded: it stays routable for short-prompt work (subagent tasks, evals, batch), where it won 7/7 in the duel, and serves as an agent "body" with its own OS/filesystem [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - One cost: `session.contextSize` was cut from 96000 to 32768 because the 3060's 12GB can't support a huge KV allocation alongside the weights [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> - Clustering Minis over Thunderbolt was ruled out as a fix: pipeline parallelism adds capacity, not per-request FLOPS, and tensor parallelism needs ~900GB/s interconnect vs Thunderbolt's ~10GB/s [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] A.fact1: prefill on the 3060 was about 1,220 tok/s versus about 123 tok/s on the M4 Mac Mini (roughly 10x)
- [x] A.fact2: prefill dominates a context-heavy resident agent
- [ ] A.wrong1: says "the Mac Mini was faster at prefill"

### Answer B

> I don't know — the entries have nothing on this. They describe the RTX 3060 hosting phi4 and the voice fast-path model `qwen2.5:7b` [2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat], and the Mac Mini running mlx-audio voice serving and Laya fine-tuning [2026-09-25-voice-comes-home-to-the-mini-mlx-audio-replaces-the-dead-gat; 2026-09-25-a-421m-encoder-out-routes-phi4-the-laya-experiment], but no entry records a decision to move the foreground model to the 3060 or why it didn't stay on the Mac Mini.

- [ ] B.fact1: prefill on the 3060 was about 1,220 tok/s versus about 123 tok/s on the M4 Mac Mini (roughly 10x)
- [ ] B.fact2: prefill dominates a context-heavy resident agent
- [ ] B.wrong1: says "the Mac Mini was faster at prefill"

## v2-inv-04 · find

> Why must FalkorDB's data volume be mounted at /var/lib/falkordb/data?

### Answer A

> Because FalkorDB's actual persistence path (`FALKORDB_DATA_PATH`) is `/var/lib/falkordb/data` — mounting the volume anywhere else leaves it empty. This was learned the hard way: the May container mounted its volume at `/data`, so two months of graph memory (1,301 turns, all facts/entities) sat in the container's disposable writable layer, and any `docker rm` would have destroyed it. The fix was to mount the volume at the correct path, plus a host-side RDB backup and `--restart unless-stopped` [2026-07-14-falkordb-the-volume-that-wasn-t].

- [x] A.fact1: the volume was mounted at /data but FalkorDB persists to /var/lib/falkordb/data
- [x] A.fact2: two months of graph memory lived in the container's writable layer; removing the container would have destroyed it

### Answer B

> Because FalkorDB persists to `/var/lib/falkordb/data` (its `FALKORDB_DATA_PATH`) — an earlier container mounted the volume at `/data` instead, leaving the volume empty while the real `dump.rdb` sat in the container's disposable writable layer, meaning a plain `docker rm` would have destroyed all graph memory. The fix was mounting the volume at the correct path [2026-07-14-falkordb-the-volume-that-wasn-t].

- [x] B.fact1: the volume was mounted at /data but FalkorDB persists to /var/lib/falkordb/data
- [ ] B.fact2: two months of graph memory lived in the container's writable layer; removing the container would have destroyed it

## v2-inv-05 · find

> Can Qwen3.8-27B at Q2 on a Mac Mini carry the conversational traffic?

### Answer A

> No. The entries measured exactly this: Qwen3.8-27B at Q2 on a Mac Mini scored **1/7** on the oracle duel — dead on that hardware, with two independent cliffs [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]:
> 
> - **Quant cliff:** with thinking on, 17×23 came out wrong, md-linecounts thrashed 30 iterations/259s without writing the file, and the one clean pass (csv-revenue) was 6× slower. Only think-off short answers stayed correct and fast.
> - **Memory cliff:** ~13.5GB dynamic ceiling vs a 27B that barely fits — prefill requests got bounced as KV grew, then the model was evicted entirely (507). Arena loops grow context by nature, and the box rejects grown context by design. Q3 never fit at all.
> 
> The standing conclusion: 2-bit is past the quality cliff for agentic work even when it fits, and a 16GB-class box can't hold a 27B with agentic KV headroom. The Mini's real profile is small-model (4–14B at 4–8bit) utility work with short prompts and no context growth [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]. Conversational traffic went to gemma4:12b (7/7 on the same Mini) and then to the 3060, with the Mini kept only for short-prompt subagent/eval work [2026-09-19-gemma4-12b-takes-the-foreground-a-12b-on-a-mac-mini-matches] [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] A.fact1: no — it scored 1/7 on the oracle duel
- [x] A.fact2: two separate cliffs: quantization quality and memory
- [ ] A.wrong1: says "it worked well enough"

### Answer B

> No — it was tested and failed, 1/7 on the oracle duel [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]. Two independent cliffs:
> 
> - **Quant cliff:** with thinking ON, the model got 17×23 wrong, thrashed 30 iterations/259s on md-linecounts without writing the file (NVFP4 did it in 8.8s), and its one clean pass (csv-revenue) took 117s — 6× slower. Only think-OFF short answers stayed correct and fast (3 ctok/1.2s) [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].
> - **Memory cliff:** the Mini has a ~13.5GB dynamic ceiling; KV growth (12.92→13.85GB) triggered oMLX's prefill guard, then the model was evicted entirely (507, "current: 2.70GB"). Q3 never fit at all [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].
> 
> Standing conclusion: 2-bit is past the quality cliff for agentic work even when it fits, and a 16GB-class box can't hold a 27B with agentic KV headroom. The Mini's real profile is small models (4–14B at 4–8bit) on short, non-growing contexts [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas].

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

> Right after the SGLang cutover, two things went wrong [2026-08-16-the-sglang-cutover-one-model-one-box-real-concurrency]:
> 
> 1. **The midnight cron produced a one-facet, 3-source report** — the eval's own failure class. Root cause: the LLM pipeline stages never forwarded `think` at all, so qwen's default-on thinking burned decompose's 700-token budget ("thinking models fail at budgets", now observed in prod). Verification carried the report honestly (6/9 flagged, 3 Tier-1 contradictions caught, self-flagged source concentration).
> 2. **Chat latency complaint** — logs showed queueing behind the research cron on the shared fleet box, not model slowness; deepseek never felt this only because it had a dedicated box (tenancy, not intelligence).
> 
> Both were fixed in the cutover itself: per-stage think control (`LlmStage.think`, decompose/gap_check pinned to `think:false` with raised budgets) and moving the model to SGLang + NVFP4 on Spark-2 with `--max-running-requests 4` for real continuous batching.

- [x] B.fact1: the midnight cron produced a thin one-facet, 3-source report
- [x] B.fact2: the LLM pipeline stages never forwarded `think`, so qwen's default-on thinking burned the decompose stage's 700-token budget

## v2-inv-07 · trap

> Why was the RTX 3060 rejected in favour of the Mac Mini for the foreground model?

### Answer A

> It's the reverse — the Mac Mini was rejected in favour of the RTX 3060. A head-to-head with the identical model (gemma4:12b) and a 9K-token cold prompt showed the 3060 (CUDA, 12GB) at 1,220 tok/s prefill (~3.3s for a 4,000-token prompt) versus the M4 Mac Mini (MLX) at 123 tok/s (~33s) — a 10x prefill gap from a card costing half the Mini's price [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060]. Prefill is compute-bound and a context-heavy resident agent spends nearly all its time there, so the 3060 became the foreground box while the Mini was kept only for short-prompt subagent work (~3s at 400 tokens) [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] A.fact1: the premise is false: the 3060 was chosen — it was about 10x faster at prefill
- [ ] A.wrong1: says "the 3060 was rejected"
- [x] A.premise: corrected the premise

### Answer B

> The premise is reversed: the RTX 3060 wasn't rejected — it won. The head-to-head [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060] settled it:
> 
> - Identical model (gemma4:12b), identical 9K-token cold prompt: the 3060 prefilled at **1,220 tok/s** (~3.3s for a 4,000-token chat prompt) vs the M4 Mac Mini's **123 tok/s** (~33s) — a 10x prefill gap from a card costing half the Mini.
> - Prefill is compute-bound, and a context-heavy resident agent spends nearly all its time there; published benchmarks put a 4090 at "3x+" an M4 Max on prompt processing.
> - The Mini wasn't discarded entirely: it stays routable for short-prompt work (subagent tasks, evals, batch), where it went 7/7 in the duel — 400-token prompts cost ~3s there.
> - Standing note: clustering Minis over Thunderbolt doesn't fix it — pipeline parallelism adds capacity, not per-request FLOPS, and tensor parallelism needs ~900GB/s vs Thunderbolt's ~10GB/s [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].
> 
> Peter's own admission: the second Mac Mini "was absolutely a waste of money" for inference [2026-09-19-the-300-card-beat-the-600-mini-foreground-moves-to-the-3060].

- [x] B.fact1: the premise is false: the 3060 was chosen — it was about 10x faster at prefill
- [ ] B.wrong1: says "the 3060 was rejected"
- [x] B.premise: corrected the premise

## v2-inv-08 · trap

> Why did Q2 quantisation make the 27B model faster on the Mac Mini?

### Answer A

> I don't know — the entries have nothing on this. They cover voice latency on the Mac Mini (mlx-audio, model residency, keepAlive, priming stalls) and model evals, but no decision-log entry mentions Q2 quantisation of the 27B model or its speed impact.

- [ ] A.fact1: the premise is false: at Q2 it was worse and slower — 1/7, and the one pass was about 6x slower
- [ ] A.wrong1: says "Q2 made it faster"
- [ ] A.premise: corrected the premise

### Answer B

> Short answer: it didn't really "make it faster" in a good way — Q2 was a failed experiment, and the speed only showed on short, non-thinking answers.
> 
> From the measured duel [2026-09-19-q2-on-the-221-mini-the-quant-cliff-and-the-memory-cliff-meas]:
> 
> - **Quant cliff:** with thinking ON, the Q2 27B degraded badly — it got 17×23 wrong, thrashed 30 iterations/259s without writing a file (vs 8.8s on NVFP4), and its one clean pass took 117s, 6× slower. Only think-OFF short answers stayed correct and fast (3 ctok / 1.2s).
> - **Memory cliff:** the Mini's ~13.5GB dynamic ceiling meant the 27B barely fit; oMLX's prefill guard bounced requests as KV grew (12.92→13.85GB creep) and then evicted the model entirely (507, "current: 2.70GB"). Q3 never fit at all.
> 
> Standing conclusion: 2-bit is past the quality cliff for agentic work even when it fits, and a 16GB-class box can't hold a 27B with agentic KV headroom. The Mini's real profile is small-model (4–14B at 4–8bit) steward work with short prompts and no context growth — where even the Q2 was correct and fast. Verdict was 1/7, dead on this hardware.

- [x] B.fact1: the premise is false: at Q2 it was worse and slower — 1/7, and the one pass was about 6x slower
- [ ] B.wrong1: says "Q2 made it faster"
- [x] B.premise: corrected the premise

## v2-inv-09 · abstain

> Why was the gateway rewritten in Rust?

### Answer A

> I don't know — the graph has no path for this. The graph contains no decision, commit, or experiment recording a Rust rewrite of the gateway. What it does record about the gateway are performance issues: a 429 rate limit under request bursts (cap of 100 requests/minute, with a proposed raise to 300–500 that was never done) [2026-06-gateway-429-rate-limit-under-request-bursts], and routing latency of 4957ms attributed to gateway contention on the A5000 node [2026-06-routing-latency-on-the-gateway]. Neither mentions Rust or a rewrite.

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the entries have nothing on this. They describe gateway issues (429 rate limits, routing latency, the `format` typing bug, the gateway box being retired on 2026-09-19), but no entry mentions a Rust rewrite of the gateway or a reason for one.

- [x] B.abstained: declined without inventing a reason

## v2-inv-10 · abstain

> Why did Invarail choose AWS Lambda for scheduled jobs?

### Answer A

> I don't know — the graph has no path for this. There are no decisions, commits, or files mentioning AWS Lambda or a choice of it for scheduled jobs. The closest related material is about a "heartbeat cron" [2026-04-briefing-on-heartbeat-cron] and cron-path seams [2026-07-20-the-three-reminders-every-seam-in-the-cron-path-at-once], but neither records why any particular infrastructure (Lambda or otherwise) was chosen. If Invarail made that choice, it isn't captured in this decision log.

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the entries have nothing on AWS Lambda or scheduled jobs. The decision log covers topics like the Pi coding substrate, the LocalClaw→Invarail rename, harness comparisons, and the Laya router experiment, but no entry mentions AWS Lambda.

- [x] B.abstained: declined without inventing a reason

## v2-cp-01 · find

> How does Content Publisher stop elements flashing while the page initialises?

### Answer A

> Content Publisher stops initialisation flicker by hiding elements up front with a `js-enabled` class on the body element, which is added while the page loads to indicate JavaScript is available; CSS rules hide content until JavaScript initialises [adr-0005].
> 
> Details from the decision [adr-0005]:
> - Three options were considered: do nothing, hide via `js-enabled`, or add a `js-failed` fallback class with a 2-second grace period.
> - Option 2 (`js-enabled`) was chosen as the pragmatic interim approach — option 1 was causing problems for testers, and option 3 was considered unusual and worth investigating further.
> - Known downside: there is no fallback if JavaScript is enabled on a device but fails for some reason.

- [x] A.fact1: it uses a `js-enabled` class (option 2) as the interim, pragmatic approach

### Answer B

> I don't know — the entries have nothing on this. The decision log covers publishing times, history modelling, file attachment rendering, political tagging, and bulk data loading, but none of them mention preventing elements flashing during page initialisation.

- [ ] B.fact1: it uses a `js-enabled` class (option 2) as the interim, pragmatic approach

## v2-cp-02 · find

> How does Content Publisher send email notifications?

### Answer A

> Content Publisher sends email notifications via GOV.UK Notify, using the Notify Ruby client gem to send emails, with Action Mailer used to generate the email content (subject and body) and an Action Mailer interceptor to handle notifications in non-production environments [adr-0010].
> 
> Sending email is done asynchronously as a background job via Active Job running on Sidekiq (govuk_sidekiq), so emails are sent only after DB updates and critical API calls, and jobs are retried on transient failure, with failures reported to Sentry [adr-0010].

- [x] A.fact1: GOV.UK Notify, used with Action Mailer, Active Job and Sidekiq

### Answer B

> Content Publisher sends email notifications via **GOV.UK Notify**, using the Notify Ruby client gem, wrapped in Rails **Action Mailer** mailers, and delivered asynchronously through **Active Job** on **Sidekiq** [adr-0010].
> 
> Key points from ADR 0010 [adr-0010]:
> - Emails notify users of actions like publishing a document; sending is deliberately not treated as a critical step of any user action, since it's prone to error and delay from external-system interaction.
> - Emails are only sent after DB updates and critical API calls succeed, so notifications are accurate.
> - Sending is made robust against transient failure via Active Job retry behavior (with Sidekiq), and failures are reported to Sentry (Raven).
> - Non-production environments have a means of seeing what notifications would be sent rather than delivering them (Notify's team/allow-list mechanism).
> 
> The design was shaped by the earlier ScheduledPublishingWorker work — including the "Create basic Scheduled Publishing Worker" commit [88e27840] and the later switch to `AbortWorkerError` in that worker [ce13ccd3], both cited by the ADR.

- [x] B.fact1: GOV.UK Notify, used with Action Mailer, Active Job and Sidekiq

## v2-cp-03 · find

> How does Content Publisher avoid slow requests when it needs long lists from the Publishing API?

### Answer A

> Per [adr-0015], Content Publisher avoids slow/timing-out web requests by not loading bulk data (organisations, contacts, topic taxonomy) from the Publishing API during a request at all:
> 
> - Data is read from **Redis** at runtime, wrapped in a `BulkData::Cache` object, with **repository classes** handling loading and modelling [adr-0015].
> - A background job (`PopulateBulkDataJob`) re-populates the cache **on application boot and every 15 minutes**, logging and retrying on error [adr-0015].
> - Cached entries expire after **24 hours** — deliberately much longer than the refresh interval, so failures are a safety net and users see no issues until that period lapses [adr-0015].
> 
> The pattern was copied from GOV.UK Whitehall, which loads the topic taxonomy from Redis with a periodic refresh job [adr-0015].

- [x] A.fact1: the data is read from Redis at runtime, and a periodic background job re-populates it (the same pattern as Whitehall)

### Answer B

> Content Publisher avoids slow requests by not loading bulk data from the Publishing API during web requests. Instead, it follows a pattern similar to Whitehall's: data is read from Redis at runtime, and a periodic background job re-populates the Redis data [adr-0015].
> 
> Specifically:
> - The Rails Redis cache store is wrapped in a `BulkData::Cache` object, with repository classes for loading and modelling the cached data [adr-0015].
> - A background job runs on application boot and every 15 minutes to re-populate the data, logging and retrying on errors [adr-0015].
> - Cached data expires after 24 hours — much longer than the 15-minute refresh interval — as a safety net so users see no issues unless problems persist [adr-0015].

- [x] B.fact1: the data is read from Redis at runtime, and a periodic background job re-populates it (the same pattern as Whitehall)

## v2-cp-04 · find

> When should a class in Content Publisher be treated as a model?

### Answer A

> I don't know — the entries have nothing on this. They discuss domain modelling decisions (e.g. editions, revisions, immutability in [adr-0009], localisation approaches in [adr-0003]) but none of them define criteria for when a class should be treated as a model.

- [ ] A.fact1: its name is a noun that represents a domain concept
- [ ] A.fact2: its instances have multiple attributes that encapsulate it

### Answer B

> Per [adr-0007], a class should be treated as a model (and live in `app/models`) if it has all of these properties:
> 
> - **Its name is a noun representing a domain concept** — e.g. `Document`; guideline: hard to rename to a verb, and documented in the README nomenclature.
> - **Instances have multiple attributes that encapsulate it** — e.g. `DocumentType` encapsulates publishing metadata and tags; attributes should be public and required.
> - **Instances have a unique identifier attribute** — e.g. `Document`'s database-assigned `id`, `DocumentType`'s config-file `id`.
> - **Instances support mass-assignment of attributes** — ActiveRecord-style assignment for `Document`, assignment on initialize for readonly `DocumentType`.
> 
> Classes lacking these (e.g. `DocumentUrl` with no public attributes, `UserFacingState` with no unique ID) are not models [adr-0007]. Consequence: `DocumentType` and `Supertype` were moved into `app/models`, and any `app/models` classes without these properties should be moved elsewhere [adr-0007].

- [x] B.fact1: its name is a noun that represents a domain concept
- [x] B.fact2: its instances have multiple attributes that encapsulate it

## v2-cp-05 · find

> Which user-facing strings are extracted for translation, and which are not?

### Answer A

> I don't know — the entries have nothing on this. [adr-0004] describes the general practice of extracting static text into Rails translations in `config/locales/en`, but it doesn't specify which user-facing strings are extracted and which are not (the entry is also truncated before its final decision on test string extraction).

- [ ] A.fact1: link and button labels are not extracted

### Answer B

> The graph has one relevant decision: [adr-0004] ("Editing Microcopy", docs/adr/0004-translations.md). What it records:
> 
> - All static user-facing strings (page titles, button text, guidance pages, error messages) are extracted from code/HTML into Rails i18n files under `config/locales/en`, organized in a hierarchy (e.g. `I18n.t("publish.published.reviewed.title")`), with support for variables like `%{title}`, pluralization, and raw HTML [adr-0004].
> - The rationale was auditability (strings only visible under special conditions), consistent changes without developer edits, and keeping inline text out of code logic [adr-0004].
> 
> On which strings are *not* extracted: the decision discusses three testing options (extract all strings everywhere; extract in app but leave some in tests; extract a subset in both), but the recorded text is truncated before stating which option was chosen, so I can't confirm from the graph which strings are deliberately left unextracted. I don't know — the graph has no path for that detail.

- [ ] B.fact1: link and button labels are not extracted

## v2-cp-06 · trap

> Why does Content Publisher forbid deleting any data?

### Answer A

> The original rule came from [adr-0008] (2019-01-24): the team had no real-world use cases for deleting data, so they chose the simplest policy — `restrict` on all foreign key delete actions, specified explicitly to signal a conscious choice. Consequences acknowledged it would make deletion hard (e.g. removing a user's personal data), and dev environments should reset the database rather than loosen production constraints.
> 
> Important nuance: this was later revised by [adr-0013] (2019-07-24). The access-limit feature required removing access-limited data during the production→integration sync, so `restrict` constraints on editions and revisions were replaced with `cascade` behaviour (commits [126a40b5], [5fdc3355]). There is no longer a hard-and-fast rule that all foreign keys restrict deletion — but developers must ensure schema changes don't block deletion of access-limited data during sync.

- [x] A.fact1: the premise is false: ADR 13 permits deletion, for access-limited data synced to other environments, revising ADR 8's restriction
- [ ] A.wrong1: says "deletion is forbidden"
- [x] A.premise: corrected the premise

### Answer B

> I don't know — the entries have nothing on this. None of the provided decision-log entries mention a rule forbidding the deletion of data in Content Publisher. The closest related material is [adr-0009], which discusses modelling history and immutability in models as a means of storing history, but it does not state a prohibition on deleting data or the reason for one.

- [ ] B.fact1: the premise is false: ADR 13 permits deletion, for access-limited data synced to other environments, revising ADR 8's restriction
- [ ] B.wrong1: says "deletion is forbidden"
- [ ] B.premise: corrected the premise

## v2-cp-07 · abstain

> Why was MongoDB chosen as the datastore?

### Answer A

> I don't know — the entries have nothing on this. The decision log covers the choice of a local datastore for the publisher workflow [adr-0002] and the use of Redis for bulk data caching [adr-0015], but no entry explains why MongoDB specifically was chosen as the datastore.

- [x] A.abstained: declined without inventing a reason

### Answer B

> The graph doesn't record a decision specifically about MongoDB — searching for "MongoDB" returned nothing, and the `why` tool found no path for it.
> 
> What the graph does record is the decision to use a **local datastore** for the publisher workflow at all, in [adr-0002] (docs/adr/0002-use-local-datastore.md, recorded in commit [61bd78b2] by Erin Raj-Staniland, 2018-07-20). The reasoning there:
> 
> - The original 2016 platform goal was for publishing apps to have no local datastore and use only the Publishing API, but the difficulties of building Specialist Publisher that way led to reconsidering [adr-0002].
> - A local datastore was chosen because it's standard Rails (quick to build, easy to understand), easy to test without heavy API stubbing, easy to iterate the workflow, and allows storing interim content before it's ready as a draft in the Publishing API [adr-0002].
> 
> If MongoDB specifically was chosen as that local datastore, the graph has no record of why — I don't know beyond the above.

- [x] B.abstained: declined without inventing a reason

## v2-l4b-01 · find

> Why does log4brains use Lunr for search?

### Answer A

> Log4brains chose Lunr.js over Fuse.js for its ADR search bar ([adr-20201103]).
> 
> The decision drivers were that the search must work in both preview mode and the statically built version, provide fuzzy search and stemming, be fast enough to show results while typing, and not consume too much client-side CPU/RAM ([adr-20201103]).
> 
> Lunr won because Fuse.js is slow at searching and offers only fuzzy search with no stemming, while Lunr — though slower at indexing — supports index serialization so indexes can be pre-built, searches fast, provides stemming and multi-language support, and retrieves the position of matched tokens ([adr-20201103]).

- [x] A.fact1: it had to work both in preview mode and in the statically built site
- [x] A.fact2: fuzzy search and stemming, fast enough to show results while typing, light on client CPU and memory
- [x] A.fact3: Lunr.js was chosen over Fuse.js

### Answer B

> Log4brains chose Lunr.js over Fuse.js because it works in both preview mode and the statically built version, provides good fuzzy search and stemming, is fast enough to show results while typing, and doesn't consume too much client-side CPU/RAM [adr-20201103]. Specifically, Lunr offers fast searching, stemming with multi-language support, index serialization for pre-building indexes, and retrieves matched token positions — whereas Fuse.js was slow at searching and only did fuzzy search without stemming [adr-20201103].

- [x] B.fact1: it had to work both in preview mode and in the statically built site
- [x] B.fact2: fuzzy search and stemming, fast enough to show results while typing, light on client CPU and memory
- [x] B.fact3: Lunr.js was chosen over Fuse.js

## v2-l4b-02 · find

> Why is log4brains split into multiple packages in a monorepo?

### Answer A

> It was a deliberate architecture decision recorded at project inception: **ADR 2020-09-25 "Multi-packages architecture in a monorepo with Yarn and Lerna"** [adr-20200925-multi-packages-architecture-in-a-monorepo-with-yarn-and-lerna].
> 
> - The team considered a monolith, multi-packages/multirepo, and multi-packages/monorepo (with NPM, with Yarn, or with Yarn + Lerna), and chose **multi-packages monorepo with Yarn and Lerna**.
> - They rejected a monolith because they wanted the **core library/API to be very well tested and developed with DDD and hexagonal architecture**, with other packages (CLI, web UI) containing as few business rules as possible — and since future features were uncertain (e.g., editing ADRs from the UI, a VSCode extension, multi-repo ADR aggregation), the split was good for extensibility.
> - Yarn + Lerna was chosen because it was a well-established practice among open-source projects for publishing npm packages.
> 
> The packages created in the founding commit [03550dc] were `packages/core`, `packages/cli`, and `packages/cli-common`.

- [x] A.fact1: not a monolith: a well-tested core API that the other packages call
- [x] A.fact2: Yarn and Lerna

### Answer B

> Log4brains uses a multi-packages monorepo (with Yarn and Lerna) because a monolith was rejected: the team wanted a well-tested core library/API (developed with DDD and hexagonal architecture) that other packages call, keeping business rules out of the other packages — which also helps extensibility since future features weren't yet certain (e.g., web UI editing, VSCode extension, multi-repo ADR aggregation). Yarn + Lerna was chosen as a well-established practice for publishing npm packages [adr-20200925-multi-packages-architecture-in-a-monorepo-with-yarn-and-lerna].
> 
> The packages themselves (e.g., `@log4brains/cli`, `@log4brains/web`, `@log4brains/init`) were later wrapped by a single global `log4brains` NPM package to make installation language-agnostic and simpler [adr-20210113].

- [x] B.fact1: not a monolith: a well-tested core API that the other packages call
- [x] B.fact2: Yarn and Lerna

## v2-l4b-03 · find

> Why does the core API, rather than the UI, enhance ADR markdown with MDX?

### Answer A

> Per [adr-20201026], the ADR markdown body can't be used as-is — inter-ADR links must be rewritten to correct URLs and the header (status, date, deciders) must be rendered with specific components. Two options were considered: doing this in the UI, or in the core API with MDX. The core API was chosen because a future VSCode extension was planned, so it's better to keep business logic in the core package, which is also better tested [adr-20201026].
> 
> Trade-offs recorded: the header metadata is simply removed (positive), but each UI package must implement its own Header component (negative) [adr-20201026].

- [x] A.fact1: links between ADRs must become URLs and the header must be rendered with components
- [x] A.fact2: a possible future VSCode extension was the decision driver

### Answer B

> The core API handles MDX enhancement because a potential future VSCode extension means it's better to keep business logic in the core package, where it's better tested [adr-20201026]. This also fits the monorepo architecture, where other packages just call the well-tested core API and contain as few business rules as possible [adr-20200925-multi-packages-architecture-in-a-monorepo-with-yarn-and-lerna]. A trade-off: each UI package must implement its own Header component [adr-20201026].

- [ ] B.fact1: links between ADRs must become URLs and the header must be rendered with components
- [x] B.fact2: a possible future VSCode extension was the decision driver

## v2-l4b-04 · find

> Why is log4brains distributed as a global npm package?

### Answer A

> Per [adr-20210113], Log4brains is meant for all projects, not just JS ones — but the old install (`npx init-log4brains` + local `@log4brains/cli`/`@log4brains/web` packages) only worked for JS projects. So it was decided to distribute a single global `log4brains` npm package providing a global `log4brains` command, making installation language-agnostic, simpler, and faster to get started. Known trade-off: JS projects can no longer pin a specific version (an xo-like "prefer local install" behavior was left as a possible future improvement).

- [x] A.fact1: a simpler, language-agnostic installation that works on any kind of project

### Answer B

> Log4brains is distributed as a global npm package because the previous installation procedure (via `npx init-log4brains`, installing local `@log4brains/cli` and `@log4brains/web` packages) only worked well for JS projects. Since Log4brains is intended for all projects, not just JS ones, they wanted a simpler, language-agnostic installation with a faster "getting started" experience. The new procedure is `npm install -g log4brains` followed by `log4brains init` [adr-20210113].
> 
> One trade-off noted: for JS projects, it's now impossible to pin Log4brains to a specific version, though an xo-like behavior (using a local install when available) may be implemented later [adr-20210113].

- [x] B.fact1: a simpler, language-agnostic installation that works on any kind of project

## v2-l4b-05 · find

> What does the codebase do instead of default exports?

### Answer A

> The codebase uses **named exports instead of default exports** — per ADR [adr-20200927] ("Avoid default exports", accepted 2020-09-27, source: docs/adr/20200927-avoid-default-exports.md:1-13), which cites arguments against default exports (humanwhocodes blog, basarat's "default is bad"). It was recorded in commit [03550dc] ("feat: initial features" by Thomas Vaillant).

- [x] A.fact1: named exports, everywhere

### Answer B

> The codebase uses named exports instead of default exports [adr-20200927].

- [x] B.fact1: named exports, everywhere

## v2-l4b-06 · trap

> Why does log4brains still use Simplified Git Flow?

### Answer A

> Actually, they don't — Simplified Git Flow was abandoned. It was adopted on 2024-09-26 to separate development from stable releases and enable automated beta releases [adr-20240926], but it was superseded on 2024-12-17 [adr-20241217].
> 
> The reason it was dropped: **Lerna doesn't integrate well with Git Flow** — it can't publish a stable release from a branch other than the main one (Lerna issue #2023) [adr-20241217]. They chose to switch back to GitHub Flow while keeping automated beta releases, with stable releases done via a manual script by maintainers [adr-20241217].

- [x] A.fact1: the premise is false: it switched back to GitHub Flow in December 2024, because Lerna could not publish a stable release from a branch other than the main one
- [ ] A.wrong1: says "it still uses Simplified Git Flow"
- [x] A.premise: corrected the premise

### Answer B

> It doesn't anymore. Log4brains switched back to GitHub Flow on 2024-12-17 [adr-20241217]. The Simplified Git Flow (adopted 2024-09-26 [adr-20240926]) was abandoned because Lerna, used to manage the monorepo, doesn't integrate well with Git Flow — it couldn't publish a stable release from a branch other than the main one [adr-20241217]. They kept the automated beta releases but stable releases are now a manual script run by maintainers [adr-20241217].

- [x] B.fact1: the premise is false: it switched back to GitHub Flow in December 2024, because Lerna could not publish a stable release from a branch other than the main one
- [ ] B.wrong1: says "it still uses Simplified Git Flow"
- [x] B.premise: corrected the premise

## v2-l4b-07 · abstain

> Why was PostgreSQL chosen for storing ADRs?

### Answer A

> I don't know — the entries have nothing on this. They cover ADR format (MADR), search (Lunr), architecture (monorepo), code style, and MDX rendering, but no decision about PostgreSQL or any database choice for storing ADRs.

- [x] A.abstained: declined without inventing a reason

### Answer B

> I don't know — the graph has no path for this. PostgreSQL doesn't appear anywhere in the decision log. In fact, ADRs here aren't stored in a database at all: the project uses Markdown Architectural Decision Records as files in the repo [adr-20200924], with Lunr for search [adr-20201103] and the ADR slug as its unique ID [adr-20201016].

- [x] B.abstained: declined without inventing a reason

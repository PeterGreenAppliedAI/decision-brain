# Evaluation v2 — 2026-10-15T15-42-48

Frozen set: eval/v2/set.json · spec: eval/v2/SPEC.md · judged blind (eval/v2/JUDGING.md), then unblinded.

| | Decision Brain (agent) | Same model, keyword-retrieved entries | Keyword retrieval only |
|---|---|---|---|
| Required evidence cited / retrieved | 100% (20/20) | 75% (15/20) | 75% (15/20) (in top 5) |
| Supporting evidence cited / retrieved | 50% (2/4) | 25% (1/4) | 25% (1/4) |
| Answers passing the rubric (all listed key facts, no listed wrong claim) | 80% (16/20) | 50% (10/20) | n/a |
| False premises corrected | 100% (4/4) | 50% (2/4) | n/a |
| Correct abstentions | 100% (4/4) | 100% (4/4) | n/a |
| Answers with a figure flagged by the checker | 4/24 | 2/24 | n/a |
| Median latency | 22.9 s | 7.8 s | — |
| Median tool calls | 3 | 0 (one model call) | — |

| Question | Kind | Agent | Same model + keyword | Keyword only |
|---|---|---|---|---|
| v2-inv-01 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-02 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-03 | find | correct · req 1/1 | not correct · req 0/1 | 0/1 in top 5 |
| v2-inv-04 | find | correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-inv-05 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-06 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-07 | trap | correct, premise ✓ · req 1/1 | correct, premise ✓ · req 1/1 | 1/1 in top 5 |
| v2-inv-08 | trap | not correct, premise ✓ · req 1/1 | not correct, premise ✗ · req 0/1 | 0/1 in top 5 |
| v2-inv-09 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |
| v2-inv-10 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |
| v2-cp-01 | find | correct · req 1/1 | not correct · req 0/1 | 0/1 in top 5 |
| v2-cp-02 | find | correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-cp-03 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-cp-04 | find | correct · req 1/1 | not correct · req 0/1 | 0/1 in top 5 |
| v2-cp-05 | find | not correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-cp-06 | trap | not correct, premise ✓ · req 1/1 | not correct, premise ✗ · req 0/1 | 0/1 in top 5 |
| v2-cp-07 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |
| v2-l4b-01 | find | correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-02 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-03 | find | correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-04 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-05 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-06 | trap | not correct, premise ✓ · req 1/1 | correct, premise ✓ · req 1/1 | 1/1 in top 5 |
| v2-l4b-07 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |

## Reading these numbers

**Run 2** (this file) re-ran the same frozen set on the code as of 2026-10-15 afternoon — after the
`what_breaks` fix, the summary-check fix and file summaries on all three repositories — and was judged
blind by a **fresh subagent that saw only the sheet** (no key, no earlier results, no repository). Run 1's
results and judged sheet are kept: `RESULTS-run1-2026-10-15T00-24-44.md`, `JUDGING-run1-…md`; run 1 was
judged by the same Claude session that built the system, with a disclosed blinding gap.

| | Run 1 (agent / same model + keyword) | Run 2 (agent / same model + keyword) |
|---|---|---|
| Answers passing the rubric | 17/20 vs 11/20 | 16/20 vs 10/20 |
| Required evidence cited | 20/20 vs 15/20 | 20/20 vs 15/20 |
| False premises corrected | 4/4 vs 2/4 | 4/4 vs 2/4 |
| Correct abstentions | 4/4 vs 4/4 | 4/4 vs 4/4 |
| Median latency | 20.6 s vs 7.9 s | 22.9 s vs 7.8 s |

- **The claim holds across both runs and both judges:** on this frozen set, Decision Brain answered more
  questions correctly than the same model given keyword-search results — 16–17 of 20 vs 10–11 — at
  roughly 2.6–2.9x the latency. Differences between runs are sampling and judging (e.g. v2-inv-04 and
  v2-inv-08 changed hands), not a measured improvement or regression.
- **Where the gap comes from** is unchanged: when keyword retrieval misses the entry an answer rests on
  (v2-inv-03, inv-08, cp-01, cp-04, cp-06), the baseline has nothing to answer from.
- **Figures flagged in 4 agent answers.** Checked by hand against the repositories: every flagged figure
  in v2-inv-05 and v2-inv-08 is in the cited entry (citation placement, as in run 1). In v2-inv-03 the
  agent wrote "96,000 → 32,768" where the entry says `96000 → 32768` — reformatted, which the prompt
  forbids and the exact-match check rightly flags. In v2-cp-07 it wrote "the 2016/2017 architecture
  goals", merging "the migration effort from 2016" and "Architecture Goals 2017-18+" into a figure the
  source does not state — a small misstatement, correctly flagged.
- **Borderline judging calls:** the run-2 judge reported 10 (listed in DECISIONS.md, October 15,
  "Evaluation v2, Run Again"). Re-scored with every one of them decided against the agent: 15/20 vs
  12/20, false premises 2/4 vs 2/4. Decided for it: 18/20 vs 9/20. The agent leads in every case; how
  far depends on the judging, and the premise result is not robust to it.

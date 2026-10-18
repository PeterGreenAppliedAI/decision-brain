# Evaluation v2 — 2026-10-18T02-44-20

Frozen set: eval/v2/set.json · spec: eval/v2/SPEC.md · judged blind (eval/v2/JUDGING.md), then unblinded.

| | Decision Brain (agent) | Same model, keyword-retrieved entries | Keyword retrieval only |
|---|---|---|---|
| Required evidence cited / retrieved | 100% (20/20) | 75% (15/20) | 75% (15/20) (in top 5) |
| Supporting evidence cited / retrieved | 50% (2/4) | 25% (1/4) | 25% (1/4) |
| Answers passing the rubric (all listed key facts, no listed wrong claim) | 95% (19/20) | 60% (12/20) | n/a |
| False premises corrected | 100% (4/4) | 50% (2/4) | n/a |
| Correct abstentions | 100% (4/4) | 100% (4/4) | n/a |
| Answers with a figure flagged by the checker | 2/24 | 2/24 | n/a |
| Median latency | 23.0 s | 7.5 s | — |
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
| v2-inv-08 | trap | correct, premise ✓ · req 1/1 | not correct, premise ✗ · req 0/1 | 0/1 in top 5 |
| v2-inv-09 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |
| v2-inv-10 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |
| v2-cp-01 | find | correct · req 1/1 | not correct · req 0/1 | 0/1 in top 5 |
| v2-cp-02 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-cp-03 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-cp-04 | find | correct · req 1/1 | not correct · req 0/1 | 0/1 in top 5 |
| v2-cp-05 | find | not correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-cp-06 | trap | correct, premise ✓ · req 1/1 | not correct, premise ✗ · req 0/1 | 0/1 in top 5 |
| v2-cp-07 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |
| v2-l4b-01 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-02 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-03 | find | correct · req 1/1 | not correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-04 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-05 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-l4b-06 | trap | correct, premise ✓ · req 1/1 | correct, premise ✓ · req 1/1 | 1/1 in top 5 |
| v2-l4b-07 | abstain | abstained ✓ | abstained ✓ | 0/0 in top 5 |

## Reading these numbers

**Run 3** (this file) re-ran the frozen set with **search by meaning added** to Decision Brain's search
tool (words first, then meaning matches from a FalkorDB vector index, cutoff 0.44 chosen on the v1
development questions, not on these), judged blind by a fresh subagent that saw only the sheet. The
baseline is unchanged. Runs 1 and 2 (words only) are kept beside it.

| | Run 1 (words) | Run 2 (words) | Run 3 (words + meaning) |
|---|---|---|---|
| Answers passing the rubric | 17/20 vs 11/20 | 16/20 vs 10/20 | 19/20 vs 12/20 |
| Required evidence cited | 20/20 vs 15/20 | 20/20 vs 15/20 | 20/20 vs 15/20 |
| False premises corrected | 4/4 vs 2/4 | 4/4 vs 2/4 | 4/4 vs 2/4 |
| Correct abstentions | 4/4 vs 4/4 | 4/4 vs 4/4 | 4/4 vs 4/4 |
| Median latency | 20.6 s vs 7.9 s | 22.9 s vs 7.8 s | 23.0 s vs 7.5 s |
| Borderline calls all against the agent | — | 14/20 vs 12/20 | 15/20 vs 13/20 |

- **What changed between run 2 and run 3:** three trap questions (v2-inv-08, v2-cp-06, v2-l4b-06) went
  from "premise corrected but a key fact missing" to fully correct. None of them is a question where
  keyword search missed the evidence, and two of the three are among the judge's borderline calls. Runs 1
  and 2, on identical code, already differed by one question. So run 3 shows **no regression and possibly
  an improvement; the gain is not attributed to search by meaning.**
- **What search by meaning measurably does:** for 18 of the 20 answerable questions the entry the answer
  rests on is the nearest vector match (second for the other two), where keyword search had it in its top
  5 for 15 of 20. Outside this set, a question worded differently from its entry ("why are invalid handoff
  confirmations retried?" for an entry about "a mis-copied quote") went from "I don't know" to a correct,
  supported answer.
- **Abstentions:** 4/4 as judged, but v2-cp-07 (Decision Brain's answer) was a borderline call — it said
  there is no record of why MongoDB was chosen, then described a related decision's reasons. Read strictly
  it is 3/4. Distance alone cannot separate "no record" from "a related record": in three of the four
  abstain questions some entry lies within the cutoff, so abstaining still rests on the agent.
- **Borderline calls:** `npm run eval:v2 -- sensitivity` re-scores this run from `eval/v2/borderline.json`
  (run 2's calls are in `borderline-run2.json`).

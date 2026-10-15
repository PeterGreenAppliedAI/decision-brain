# Evaluation v2 — 2026-10-15T00-24-44

Frozen set: eval/v2/set.json · spec: eval/v2/SPEC.md · judged blind (eval/v2/JUDGING.md), then unblinded.

| | Decision Brain (agent) | Same model, keyword-retrieved entries | Keyword retrieval only |
|---|---|---|---|
| Required evidence cited / retrieved | 100% (20/20) | 75% (15/20) | 75% (15/20) (in top 5) |
| Supporting evidence cited / retrieved | 50% (2/4) | 25% (1/4) | 25% (1/4) |
| Correct answers (all key facts, nothing wrong) | 85% (17/20) | 55% (11/20) | n/a |
| False premises corrected | 100% (4/4) | 50% (2/4) | n/a |
| Correct abstentions | 100% (4/4) | 100% (4/4) | n/a |
| Answers with a figure flagged by the checker | 5/24 | 2/24 | n/a |
| Median latency | 20.6 s | 7.9 s | — |
| Median tool calls | 3 | 0 (one model call) | — |

| Question | Kind | Agent | Same model + keyword | Keyword only |
|---|---|---|---|---|
| v2-inv-01 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-02 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-03 | find | correct · req 1/1 | not correct · req 0/1 | 0/1 in top 5 |
| v2-inv-04 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-05 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-06 | find | correct · req 1/1 | correct · req 1/1 | 1/1 in top 5 |
| v2-inv-07 | trap | correct, premise ✓ · req 1/1 | correct, premise ✓ · req 1/1 | 1/1 in top 5 |
| v2-inv-08 | trap | correct, premise ✓ · req 1/1 | not correct, premise ✗ · req 0/1 | 0/1 in top 5 |
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

- **What the graph adds, here:** when keyword retrieval misses the entry an answer must rest on
  (v2-inv-03, inv-08, cp-01, cp-04, cp-06), the same model given keyword-retrieved entries has nothing to
  answer from and says "I don't know"; the agent's tools find it. Required evidence: 20/20 vs 15/20.
  Correct answers: 17/20 vs 11/20. False premises corrected: 4/4 vs 2/4.
- **What it costs:** median latency 20.6 s vs 7.9 s (about 2.6x), with a median of 3 tool calls.
- **Figures flagged: 5 agent answers vs 2.** All 47 flagged figures in those agent answers appear in the
  source entry the question rests on: the flags are citation placement — the agent writing
  "[same decision]" instead of the id, or a list separated from its citation by a blank line — not
  invented numbers. The checker is right to flag them (those figures are not attached to a valid
  citation); they are a formatting defect to fix in the agent, not fabrication. The one baseline flag
  ("429") comes from an entry it retrieved that the abstain question is not about.
- **Where both fail — a system limit:** cp-05's answer ("link and button labels are not extracted")
  sits beyond the first 2,500 characters of a long ADR. Both systems cap an entry's text at 2,500
  characters, both said the text was cut off, both failed. Long entries need section-aware reading.
- **Agent misses:** cp-06 corrected the premise but left out the reason (access-limited data); l4b-06
  corrected it but did not give the Lerna reason — strict key facts count both as not correct.

## Limits of this evaluation

24 questions, one run each, one model. Questions, key facts and judgements by Claude, which built the
system; judging was blind to which system wrote which answer, but **only partly**: the run's progress
log named each system's code-check status and the judge saw it, so where one side abstained its
system could be guessed. Key facts were applied strictly. Owner spot-check pending. These are
observations on this set, not general capability claims.

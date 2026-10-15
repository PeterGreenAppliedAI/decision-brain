# Evaluation v2 — frozen specification

Frozen in the commit that adds this file, **before any system answered these questions**. Changing any
of the below after a run makes the result a different experiment; do it only with a new set.

## Questions and labels — `eval/v2/set.json`
24 questions over three repositories, none of them used to develop or tune the system: 16 *find*, 4
*trap* (false premise), 4 *abstain* (nothing in the record answers them; checked by searching the
sources for the topic). Each carries **required** evidence (decisions a correct answer must rest on),
**supporting** evidence (useful, not necessary), **key facts** a correct answer must state — numbers
included, and they must describe the right outcome — and **must-not** claims that make an answer wrong.
Written by Claude from the source entries; the owner spot-check is pending, as for v1.

## Repository revisions
- Invarail `638453658c0d2fd45875bc998491150af13a6f04`
- alphagov/content-publisher `a268264bd0ccfb4956f401c328bacced0b5a1d93`
- thomvaill/log4brains `17e3202` (upstream HEAD; a clean clone, not the judge-path copy that was edited)

Graphs: ingested and extracted at those revisions (Invarail 151 decisions, content-publisher 16,
log4brains 11).

## Systems compared
1. **Decision Brain agent** — `npm run ask`: glm-5.3-flash over MCP with the graph tools; at most 6
   tool rounds; tool results capped at 12,000 characters; then the code checks.
2. **Same model, keyword-retrieved entries** — `src/eval/rag.ts`: the top 5 entries by keyword score,
   each capped at 2,500 characters, given to glm-5.3-flash in one call with the same citation rules;
   checked by the same code.
3. **Keyword retrieval only** — the top 5 entries (`src/eval/baseline.ts`); evidence only, no answer.

Model settings for both model systems: `glm-5.3-flash` on vLLM, `reasoning_effort: low`,
temperature 0.2, max 4,096 output tokens.

## Scoring
- **Required / supporting evidence**: share of labelled decisions the answer cites (systems 1–2) or
  retrieves in its top 5 (system 3). Reported separately.
- **Correct answer**: every key fact stated correctly and no must-not claim — judged by reading.
- **False premise corrected** (trap) and **correct abstention** (abstain) — judged by reading.
- **Figures flagged** by the code checker; **median latency**; **median tool calls** (agent).
- **Judging is blind.** The two prose answers per question appear as A and B in a seeded order in
  `eval/v2/JUDGING.md`; the key is written to a separate file and not opened until every question is
  judged. Judge: Claude (the builder of the system — hence the blinding); owner spot-check pending.
- The 25 v1 questions remain a **regression** set; they are not used for this comparison.

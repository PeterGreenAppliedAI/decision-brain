/**
 * Every setting comes from the environment (a local .env is gitignored). Nothing personal is
 * committed: corpus paths, hosts and graph names are passed in, never written here.
 */

export const config = {
  /** The project's own FalkorDB — 6380 on the host; 6379 belongs to the parent project. */
  falkordbUrl: process.env.FALKORDB_URL ?? 'redis://127.0.0.1:6380',
  /** Author names matching this are recorded as agents, not humans (Co-Authored-By trailers). */
  agentAuthorPattern: new RegExp(process.env.AGENT_AUTHOR_PATTERN ?? '\\b(claude|codex|copilot|gpt|gemini)\\b', 'i'),
  /** Several git identities for one person: "alias=Name;alias2=Name". Personal — set in .env. */
  personAliases: Object.fromEntries((process.env.PERSON_ALIASES ?? '').split(';').filter(Boolean)
    .map((pair) => pair.split('=').map((s) => s.trim()) as [string, string])),
  /** OpenAI-compatible endpoint for the extraction workers (vLLM). Host lives in .env, never here. */
  llmUrl: process.env.LLM_URL ?? 'http://127.0.0.1:8000/v1',
  llmModel: process.env.LLM_MODEL ?? 'glm-5.3-flash',
  /** How hard the extraction model reasons before answering. GLM-5.3's chat template always thinks;
   *  it takes reasoning_effort low | high, and anything else (including nothing) means max. */
  llmReasoningEffort: process.env.LLM_REASONING_EFFORT ?? 'low',
  /** Abort a request when no token has arrived for this long (thinking counts as tokens). */
  llmIdleTimeoutMs: Number(process.env.LLM_IDLE_TIMEOUT_MS ?? 120_000),
  /** Embeddings for search by meaning (OpenAI-compatible /embeddings, e.g. Ollama's /v1). Unset: words only. */
  embedUrl: process.env.EMBED_URL ?? '',
  embedModel: process.env.EMBED_MODEL ?? 'qwen3-embedding:8b',
  /** A meaning match counts only within this cosine distance (0 = same direction); set from measurement. */
  embedMaxDistance: Number(process.env.EMBED_MAX_DISTANCE ?? 0.44),   // set on the v1 development questions
  /** Characters of an entry's text embedded (its title always is). */
  embedChars: Number(process.env.EMBED_CHARS ?? 6000),
  /** Extraction team: a claim lives this long without a heartbeat (workers beat every third of it). */
  claimTtlMs: Number(process.env.CLAIM_TTL_MS ?? 120_000),
  maxAttempts: Number(process.env.MAX_ATTEMPTS ?? 3),
  idlePollMs: Number(process.env.IDLE_POLL_MS ?? 2_000),
  /** A concept found in more than this share of all entries (and at least conceptMinCount of them)
   *  is too generic to link entries by — usually the project's own name. */
  conceptMaxShare: Number(process.env.CONCEPT_MAX_SHARE ?? 0.2),
  conceptMinCount: Number(process.env.CONCEPT_MIN_COUNT ?? 5),
  /** Where repos keep architecture decision records; the first that exists is ingested. */
  adrDirs: (process.env.ADR_DIRS ?? 'docs/adr,docs/adrs,doc/adr,docs/architecture/decisions,docs/decisions,docs/architecture/adr,adr')
    .split(',').map((d) => d.trim()).filter(Boolean),
  /** Files a decision's recording commit touched that are not part of its rationale: lockfiles and
   *  docs (the decision logs themselves are always excluded). Globs, comma-separated. */
  rationaleExclude: (process.env.RATIONALE_EXCLUDE ?? '**/*.lock,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml,**/*.md')
    .split(',').map((g) => g.trim()).filter(Boolean),
  /** A directory segment on fewer than this share of paths is distinctive enough to count as an entry
   *  naming the files under it ("chrome-extension", never "src"). */
  distinctiveSegmentShare: Number(process.env.DISTINCTIVE_SEGMENT_SHARE ?? 0.1),
  /** File summaries: which files count as source, and what is left out (tests, builds, vendored). */
  fileExtensions: (process.env.FILE_EXTENSIONS ?? 'ts,tsx,js,mjs,cjs,py,rb,go,rs,java,kt,cs,php,swift,c,h,cpp,sh,sql,erb,vue,svelte')
    .split(',').map((e) => e.trim()).filter(Boolean),
  fileExclude: (process.env.FILE_EXCLUDE ?? '**/node_modules/**,**/dist/**,**/build/**,**/vendor/**,**/coverage/**,**/*.min.*,**/*.d.ts,**/test/**,**/tests/**,**/spec/**,**/__tests__/**,**/*.test.*,**/*.spec.*')
    .split(',').map((g) => g.trim()).filter(Boolean),
  /** Larger files are shown to the model as head + tail, marked as cut. */
  fileMaxChars: Number(process.env.FILE_MAX_CHARS ?? 40_000),
  /** Instruction files written for AI coding agents — intent sources with a version history. */
  instructionFiles: (process.env.INSTRUCTION_FILES ?? '**/AGENTS.md,**/CLAUDE.md,**/GEMINI.md,**/.cursorrules,**/.cursor/rules/**,**/.github/copilot-instructions.md,**/.windsurfrules')
    .split(',').map((g) => g.trim()).filter(Boolean),
  /** Where each graph's repo is checked out ("graph=/path;graph2=/path") — lets review rebuild the
   *  decision log at a commit from MCP and the web too. Personal paths: .env only. */
  repoPaths: Object.fromEntries((process.env.REPO_PATHS ?? '').split(';').filter(Boolean)
    .map((pair) => pair.split('=').map((s) => s.trim()) as [string, string])),
  /** Rows per UNWIND write. */
  writeBatch: Number(process.env.WRITE_BATCH ?? 500),
};

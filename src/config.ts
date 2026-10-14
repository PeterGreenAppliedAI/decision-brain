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
  /** Abort a request when no token has arrived for this long (thinking counts as tokens). */
  llmIdleTimeoutMs: Number(process.env.LLM_IDLE_TIMEOUT_MS ?? 120_000),
  /** Rows per UNWIND write. */
  writeBatch: Number(process.env.WRITE_BATCH ?? 500),
};

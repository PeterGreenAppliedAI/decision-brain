/**
 * A small Ollama chat client — general library, no graph knowledge (adapted from Invarail's client).
 *
 * Two lessons carried over from Invarail, both learned in production:
 *  - Always stream. A non-streaming request sends no headers until generation finishes, and Node's
 *    fetch (undici) drops a header-less connection at 5 minutes; with streaming the only clock is ours.
 *  - Collect tool calls across EVERY chunk. Ollama can emit them mid-stream; reading them off the
 *    final (stats-only) chunk silently dropped every tool call for a day.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export interface ToolCall { function: { name: string; arguments: Record<string, unknown> } }

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  /** JSON schema for grammar-constrained output, or 'json'. */
  format?: Record<string, unknown> | 'json';
  think?: boolean;
  options?: { temperature?: number; num_ctx?: number; num_predict?: number };
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  promptTokens: number;
  completionTokens: number;
}

export interface LlmOptions {
  baseUrl?: string;
  /** Whole-request budget in ms (default 5 min). */
  timeoutMs?: number;
  /** Retries for connection failures and transient 5xx (default 2). */
  retries?: number;
  fetchImpl?: typeof fetch;
}

const TRANSIENT = new Set([429, 500, 502, 503, 504]);

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = 'LlmError'; }
}

export function createLlm(opts: LlmOptions = {}) {
  const baseUrl = (opts.baseUrl ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const retries = opts.retries ?? 2;
  const doFetch = opts.fetchImpl ?? fetch;

  async function once(req: ChatRequest): Promise<ChatResult> {
    const res = await doFetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...req, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new LlmError(`chat failed: HTTP ${res.status} ${text.slice(0, 200)}`, res.status);
    }
    const out: ChatResult = { content: '', toolCalls: [], promptTokens: 0, completionTokens: 0 };
    const decoder = new TextDecoder();
    let buffered = '';
    const take = (line: string) => {
      if (!line.trim()) return;
      const chunk = JSON.parse(line) as {
        message?: { content?: string; tool_calls?: ToolCall[] };
        prompt_eval_count?: number; eval_count?: number; error?: string;
      };
      if (chunk.error) throw new LlmError(`chat failed: ${chunk.error}`);
      if (chunk.message?.content) out.content += chunk.message.content;
      if (chunk.message?.tool_calls?.length) out.toolCalls.push(...chunk.message.tool_calls);
      if (chunk.prompt_eval_count) out.promptTokens = chunk.prompt_eval_count;
      if (chunk.eval_count) out.completionTokens = chunk.eval_count;
    };
    for await (const part of res.body as AsyncIterable<Uint8Array>) {
      buffered += decoder.decode(part, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf('\n')) !== -1) {
        take(buffered.slice(0, nl));
        buffered = buffered.slice(nl + 1);
      }
    }
    take(buffered);
    return out;
  }

  return {
    async chat(req: ChatRequest): Promise<ChatResult> {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await once(req);
        } catch (err) {
          lastErr = err;
          const status = err instanceof LlmError ? err.status : undefined;
          const transient = status === undefined ? !(err instanceof LlmError) : TRANSIENT.has(status);
          if (!transient || attempt === retries) break;
          await new Promise(r => setTimeout(r, 250 * 2 ** attempt + Math.random() * 100));
        }
      }
      throw lastErr;
    },
  };
}

export type Llm = ReturnType<typeof createLlm>;

/** Thinking models wrap reasoning in <think>…</think>; strip it before an answer leaves the agent. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
}

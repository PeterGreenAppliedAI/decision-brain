/**
 * A client for OpenAI-compatible servers (vLLM, SGLang) that returns one grammar-constrained JSON
 * object. The extraction workers use it: the model fills a fixed shape, code builds the edges.
 *
 * Same lessons as lib/llm.ts: always stream (the only clock is ours — an idle timeout, not a total
 * one, so a long think is fine as long as tokens keep coming), retry 429/5xx and dropped connections,
 * never 4xx. Reasoning arrives separately (`reasoning_content` / `reasoning`) when the server runs a
 * reasoning parser; if it leaks into the content instead, `<think>` blocks are stripped.
 */
import { stripThinking } from '../../lib/llm.js';
import { config } from '../config.js';

export interface JsonRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  temperature?: number;
}

export interface JsonResult<T> {
  value: T;
  reasoning: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

export class LlmJsonError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly raw?: string) { super(message); }
}

export interface OpenAiOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  idleTimeoutMs?: number;
  retries?: number;
  think?: boolean;
  fetchImpl?: typeof fetch;
}

export function createJsonClient(opts: OpenAiOptions = {}) {
  const baseUrl = (opts.baseUrl ?? config.llmUrl).replace(/\/$/, '');
  const model = opts.model ?? config.llmModel;
  const idleTimeoutMs = opts.idleTimeoutMs ?? config.llmIdleTimeoutMs;
  const retries = opts.retries ?? 2;
  const think = opts.think ?? config.llmThink;
  const doFetch = opts.fetchImpl ?? fetch;

  async function once<T>(req: JsonRequest): Promise<JsonResult<T>> {
    const started = Date.now();
    const ctrl = new AbortController();
    let idle = setTimeout(() => ctrl.abort(), idleTimeoutMs);
    const touch = () => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort(), idleTimeoutMs); };

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0.2,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
          response_format: { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
          chat_template_kwargs: { enable_thinking: think },
        }),
      });
    } catch (err) {
      clearTimeout(idle);
      throw new LlmJsonError(`connection failed: ${String(err)}`, true);
    }
    if (!res.ok || !res.body) {
      clearTimeout(idle);
      const text = await res.text().catch(() => '');
      throw new LlmJsonError(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status === 429 || res.status >= 500);
    }

    let content = '', reasoning = '', promptTokens = 0, completionTokens = 0, buf = '';
    const decoder = new TextDecoder();
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        touch();
        buf += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          const evt = JSON.parse(data);
          const delta = evt.choices?.[0]?.delta ?? {};
          content += delta.content ?? '';
          reasoning += delta.reasoning_content ?? delta.reasoning ?? '';
          if (evt.usage) { promptTokens = evt.usage.prompt_tokens ?? 0; completionTokens = evt.usage.completion_tokens ?? 0; }
        }
      }
    } catch (err) {
      throw new LlmJsonError(`stream failed: ${String(err)}`, true);
    } finally {
      clearTimeout(idle);
    }

    const json = stripThinking(content).trim();
    try {
      return { value: JSON.parse(json) as T, reasoning, promptTokens, completionTokens, ms: Date.now() - started };
    } catch {
      throw new LlmJsonError('response was not valid JSON', false, content);
    }
  }

  return {
    model,
    think,
    async json<T>(req: JsonRequest): Promise<JsonResult<T>> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await once<T>(req);
        } catch (err) {
          if (!(err instanceof LlmJsonError) || !err.retryable || attempt >= retries) throw err;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
    },
  };
}

export type JsonClient = ReturnType<typeof createJsonClient>;

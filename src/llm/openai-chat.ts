/**
 * Puts an OpenAI-compatible server (vLLM) behind lib/llm.ts's `chat()` contract, so the generic
 * tool loop runs on it unchanged. The loop speaks Ollama's message shape (tool calls with object
 * arguments, tool results by name); OpenAI's needs call ids — assigned here, in order.
 *
 * Streams, like every client here: the only clock is an idle timeout, and tool-call fragments are
 * collected across every chunk by index.
 */
import type { ChatMessage, ChatRequest, ChatResult, ToolCall } from '../../lib/llm.js';
import { config } from '../config.js';

export interface OpenAiChatOptions { baseUrl?: string; reasoningEffort?: string; idleTimeoutMs?: number; retries?: number; fetchImpl?: typeof fetch }

/** Ollama-shaped history → OpenAI messages, giving each tool call an id its result can answer. */
export function toOpenAiMessages(messages: ChatMessage[]) {
  const out: Array<Record<string, unknown>> = [];
  const pending: string[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const calls = m.tool_calls.map((c, j) => {
        const id = `call_${i}_${j}`;
        pending.push(id);
        return { id, type: 'function', function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments ?? {}) } };
      });
      out.push({ role: 'assistant', content: m.content || null, tool_calls: calls });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: pending.shift() ?? `call_orphan_${i}`, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  });
  return out;
}

export function createOpenAiChat(opts: OpenAiChatOptions = {}) {
  const baseUrl = (opts.baseUrl ?? config.llmUrl).replace(/\/$/, '');
  const effort = opts.reasoningEffort ?? config.llmReasoningEffort;
  const idleMs = opts.idleTimeoutMs ?? config.llmIdleTimeoutMs;
  const retries = opts.retries ?? 2;
  const doFetch = opts.fetchImpl ?? fetch;

  async function once(req: ChatRequest): Promise<ChatResult> {
    const ctrl = new AbortController();
    let idle = setTimeout(() => ctrl.abort(), idleMs);
    const touch = () => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort(), idleMs); };
    try {
      const res = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: req.model, stream: true, stream_options: { include_usage: true },
          messages: toOpenAiMessages(req.messages),
          ...(req.tools?.length ? { tools: req.tools, tool_choice: 'auto' } : {}),
          temperature: req.options?.temperature ?? 0.2,
          max_tokens: req.options?.num_predict ?? 4096,
          chat_template_kwargs: { reasoning_effort: effort },
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`) as Error & { retryable?: boolean };
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      let content = '', buf = '', promptTokens = 0, completionTokens = 0;
      const calls = new Map<number, { name: string; args: string }>();
      const decoder = new TextDecoder();
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        touch();
        buf += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
          const evt = JSON.parse(line.slice(5));
          const delta = evt.choices?.[0]?.delta ?? {};
          content += delta.content ?? '';
          for (const tc of delta.tool_calls ?? []) {
            const cur = calls.get(tc.index) ?? { name: '', args: '' };
            cur.name += tc.function?.name ?? '';
            cur.args += tc.function?.arguments ?? '';
            calls.set(tc.index, cur);
          }
          if (evt.usage) { promptTokens = evt.usage.prompt_tokens ?? 0; completionTokens = evt.usage.completion_tokens ?? 0; }
        }
      }
      const toolCalls: ToolCall[] = [...calls.entries()].sort(([a], [b]) => a - b).map(([, c]) => {
        let args: Record<string, unknown> = {};
        try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = { _unparsed: c.args }; }
        return { function: { name: c.name, arguments: args } };
      });
      return { content, toolCalls, promptTokens, completionTokens };
    } finally {
      clearTimeout(idle);
    }
  }

  return {
    async chat(req: ChatRequest): Promise<ChatResult> {
      for (let attempt = 0; ; attempt++) {
        try { return await once(req); } catch (err) {
          const retryable = (err as { retryable?: boolean }).retryable
            ?? ((err as Error).name === 'AbortError' || /fetch failed|ECONN/.test(String(err)));
          if (!retryable || attempt >= retries) throw err;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
    },
  };
}

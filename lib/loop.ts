/**
 * A generic tool-calling loop — general library, no graph knowledge. The agent built during the event
 * supplies the tools; this file only runs them and keeps the trace.
 *
 * The trace is the point: every tool call, its arguments and its result are returned, so an answer
 * can always be shown next to the path that produced it.
 */
import type { ChatMessage, Llm, ToolSchema } from './llm.js';
import { stripThinking } from './llm.js';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<string>;
}

export interface Step { tool: string; args: Record<string, unknown>; result: string; error?: boolean }

export interface LoopResult {
  answer: string;
  steps: Step[];
  /** True when the step budget ran out before the model answered. */
  exhausted: boolean;
}

export interface LoopOptions {
  llm: Llm;
  model: string;
  system: string;
  user: string;
  tools: Tool[];
  /** Hard bound on tool-calling rounds (default 8). */
  maxSteps?: number;
  /** Results longer than this are truncated before the model sees them (default 4000 chars). */
  maxResultChars?: number;
  think?: boolean;
  history?: ChatMessage[];
}

export async function runLoop(opts: LoopOptions): Promise<LoopResult> {
  const maxSteps = opts.maxSteps ?? 8;
  const cap = opts.maxResultChars ?? 4000;
  const byName = new Map(opts.tools.map(t => [t.name, t]));
  const schemas: ToolSchema[] = opts.tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    ...(opts.history ?? []),
    { role: 'user', content: opts.user },
  ];
  const steps: Step[] = [];

  for (let round = 0; round < maxSteps; round++) {
    const res = await opts.llm.chat({ model: opts.model, messages, tools: schemas, think: opts.think });
    if (res.toolCalls.length === 0) {
      return { answer: stripThinking(res.content), steps, exhausted: false };
    }
    messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      const name = call.function.name;
      const args = call.function.arguments ?? {};
      const tool = byName.get(name);
      let result: string;
      let error = false;
      if (!tool) {
        result = `Error: no tool named "${name}". Available: ${[...byName.keys()].join(', ')}`;
        error = true;
      } else {
        try {
          result = await tool.run(args);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          error = true;
        }
      }
      steps.push({ tool: name, args, result, ...(error ? { error } : {}) });
      const seen = result.length > cap ? `${result.slice(0, cap)}\n… [${result.length - cap} more chars truncated]` : result;
      messages.push({ role: 'tool', content: seen, tool_name: name });
    }
  }
  return { answer: '', steps, exhausted: true };
}

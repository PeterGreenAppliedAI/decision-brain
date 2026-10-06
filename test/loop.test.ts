import { describe, it, expect, vi } from 'vitest';
import { runLoop, type Tool } from '../lib/loop.js';
import type { Llm, ChatResult } from '../lib/llm.js';

const reply = (r: Partial<ChatResult>): ChatResult => ({ content: '', toolCalls: [], promptTokens: 0, completionTokens: 0, ...r });
const call = (name: string, args: Record<string, unknown>) => ({ function: { name, arguments: args } });
const scripted = (...rs: ChatResult[]): Llm => {
  const chat = vi.fn();
  rs.forEach(r => chat.mockResolvedValueOnce(r));
  chat.mockResolvedValue(reply({ content: 'done' }));
  return { chat } as unknown as Llm;
};
const echo: Tool = { name: 'echo', description: 'echo', parameters: { type: 'object', properties: {} }, run: async a => `echo:${JSON.stringify(a)}` };

describe('runLoop', () => {
  it('runs a tool, feeds the result back, and returns the answer with the full trace', async () => {
    const llm = scripted(reply({ toolCalls: [call('echo', { x: 1 })] }), reply({ content: '<think>ok</think>Because of x.' }));
    const r = await runLoop({ llm, model: 'm', system: 's', user: 'u', tools: [echo] });
    expect(r.answer).toBe('Because of x.');
    expect(r.steps).toEqual([{ tool: 'echo', args: { x: 1 }, result: 'echo:{"x":1}' }]);
    expect(r.exhausted).toBe(false);
    const second = (llm.chat as any).mock.calls[1][0].messages;
    expect(second.at(-1)).toMatchObject({ role: 'tool', content: 'echo:{"x":1}', tool_name: 'echo' });
  });

  it('an unknown tool becomes an error observation naming the real tools, not a crash', async () => {
    const r = await runLoop({ llm: scripted(reply({ toolCalls: [call('nope', {})] })), model: 'm', system: 's', user: 'u', tools: [echo] });
    expect(r.steps[0]).toMatchObject({ tool: 'nope', error: true });
    expect(r.steps[0].result).toMatch(/Available: echo/);
  });

  it('a throwing tool becomes an error observation', async () => {
    const boom: Tool = { ...echo, name: 'boom', run: async () => { throw new Error('graph down'); } };
    const r = await runLoop({ llm: scripted(reply({ toolCalls: [call('boom', {})] })), model: 'm', system: 's', user: 'u', tools: [boom] });
    expect(r.steps[0]).toMatchObject({ result: 'Error: graph down', error: true });
  });

  it('stops at maxSteps and says so', async () => {
    const always = { chat: vi.fn().mockResolvedValue(reply({ toolCalls: [call('echo', {})] })) } as unknown as Llm;
    const r = await runLoop({ llm: always, model: 'm', system: 's', user: 'u', tools: [echo], maxSteps: 3 });
    expect(r.exhausted).toBe(true);
    expect(r.steps).toHaveLength(3);
  });

  it('truncates long results for the model but keeps them whole in the trace', async () => {
    const big: Tool = { ...echo, name: 'big', run: async () => 'x'.repeat(50) };
    const llm = scripted(reply({ toolCalls: [call('big', {})] }), reply({ content: 'ok' }));
    const r = await runLoop({ llm, model: 'm', system: 's', user: 'u', tools: [big], maxResultChars: 10 });
    expect(r.steps[0].result).toHaveLength(50);
    expect((llm.chat as any).mock.calls[1][0].messages.at(-1).content).toMatch(/40 more chars truncated/);
  });
});

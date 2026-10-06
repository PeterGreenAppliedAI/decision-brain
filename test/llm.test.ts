import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLlm, stripThinking, LlmError } from '../lib/llm.js';

let server: Server | undefined;
afterEach(() => new Promise<void>(r => (server ? server.close(() => r()) : r())));

/** A fake Ollama: each request gets the next scripted response (status + NDJSON lines). */
async function fakeOllama(script: Array<{ status: number; lines: object[] }>, seen: unknown[] = []): Promise<string> {
  let i = 0;
  server = createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      seen.push(JSON.parse(body));
      const step = script[Math.min(i++, script.length - 1)];
      res.writeHead(step.status, { 'content-type': 'application/x-ndjson' });
      for (const l of step.lines) res.write(JSON.stringify(l) + '\n');
      res.end();
    });
  });
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe('createLlm', () => {
  it('always asks for a stream and joins content across chunks', async () => {
    const seen: any[] = [];
    const url = await fakeOllama([{ status: 200, lines: [{ message: { content: 'Hel' } }, { message: { content: 'lo' } }, { done: true, prompt_eval_count: 12, eval_count: 3 }] }], seen);
    const r = await createLlm({ baseUrl: url }).chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(seen[0].stream).toBe(true);
    expect(r.content).toBe('Hello');
    expect(r.promptTokens).toBe(12);
    expect(r.completionTokens).toBe(3);
  });

  it('collects tool calls from a MIDDLE chunk, not only the last one (the Invarail day-long bug)', async () => {
    const url = await fakeOllama([{ status: 200, lines: [
      { message: { content: '' } },
      { message: { content: '', tool_calls: [{ function: { name: 'why', arguments: { target: 'src/router/prompt.ts' } } }] } },
      { done: true, eval_count: 9 },
    ] }]);
    const r = await createLlm({ baseUrl: url }).chat({ model: 'm', messages: [] });
    expect(r.toolCalls).toEqual([{ function: { name: 'why', arguments: { target: 'src/router/prompt.ts' } } }]);
  });

  it('retries a transient 503, then succeeds', async () => {
    const url = await fakeOllama([
      { status: 503, lines: [{ error: 'busy' }] },
      { status: 200, lines: [{ message: { content: 'ok' } }, { done: true }] },
    ]);
    const r = await createLlm({ baseUrl: url, retries: 1 }).chat({ model: 'm', messages: [] });
    expect(r.content).toBe('ok');
  });

  it('does not retry a 400 — a bad request stays bad', async () => {
    const seen: unknown[] = [];
    const url = await fakeOllama([{ status: 400, lines: [{ error: 'model does not support tools' }] }], seen);
    await expect(createLlm({ baseUrl: url, retries: 2 }).chat({ model: 'm', messages: [] })).rejects.toBeInstanceOf(LlmError);
    expect(seen).toHaveLength(1);
  });

  it('surfaces an error chunk inside a 200 stream', async () => {
    const url = await fakeOllama([{ status: 200, lines: [{ error: 'model ran out of memory' }] }]);
    await expect(createLlm({ baseUrl: url, retries: 0 }).chat({ model: 'm', messages: [] })).rejects.toThrow(/out of memory/);
  });
});

describe('stripThinking', () => {
  it('removes think blocks, including an unopened leading one', () => {
    expect(stripThinking('<think>plan</think>Answer.')).toBe('Answer.');
    expect(stripThinking('reasoning without an opener</think> Answer.')).toBe('Answer.');
  });
});

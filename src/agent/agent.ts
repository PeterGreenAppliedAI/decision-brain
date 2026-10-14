/**
 * The agent: a local model that answers questions about a codebase's history by choosing among the
 * graph tools — reached over MCP, the same server any client gets — and cites what it used. Code
 * then checks every citation against what the tools actually returned (ground.ts).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { runLoop, type Step, type Tool } from '../../lib/loop.js';
import { config } from '../config.js';
import { createOpenAiChat } from '../llm/openai-chat.js';
import { ground, type Grounding } from './ground.js';

export const SYSTEM = `You answer questions about why a codebase is the way it is, using ONLY the graph tools.
The graph holds the project's decision log (decisions, what was measured, what was tried and disproven, what superseded what), its git history (commits, files, people) and the links between them.

How to work:
- Call tools before answering. Pick the tool that fits: why (a file/topic), what_breaks (impact of changing a file), disproven (what failed before), who_knows (people), trace (one decision in full), connect (how two things relate), review (a commit), search (when nothing exact is named), load_bearing (most-depended-on files), what_is (what a file or directory does now), origin (a file's original intent and how it changed), told (what instructions an AI agent had when it wrote a commit).
- A summary from what_is describes what code does — never present it as the reason the code exists. Reasons come from decisions and commit messages.
- If a target is ambiguous, the tool returns suggestions — call again with one of them.
- Answer only from what the tools returned. Never add facts from your own knowledge.
- Cite every claim with the exact id the tool returned, in square brackets: a decision id like [2026-09-30-some-title], a commit like [54359df], a file like [src/router/prompt.ts]. Cite ids, never tool names or calls — [who_knows: x] is not a citation; [x] is.
- Every paragraph or list item that states a number must carry the citation of the item that number came from. Copy numbers exactly as the tool gave them — never round, convert or combine them. Code checks each figure against the cited evidence.
- If the tools return nothing relevant, say "I don't know — the graph has no path for this." Do not guess.
- Be brief: a few sentences or a short list.`;

export interface AgentResult { question: string; answer: string; steps: Step[]; grounding: Grounding; exhausted: boolean; ms: number }

export async function openGraphTools(graph: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve(import.meta.dirname, '../mcp/server.ts'), '--graph', graph],
    env: { ...process.env } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'decision-brain-agent', version: '0.1.0' });
  await client.connect(transport);
  const listed = await client.listTools();
  const tools: Tool[] = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    parameters: t.inputSchema as Record<string, unknown>,
    run: async (args) => {
      const r = await client.callTool({ name: t.name, arguments: args }) as { content: Array<{ type: string; text?: string }> };
      return r.content.map((c) => c.text ?? '').join('\n');
    },
  }));
  return { tools, close: () => client.close() };
}

export async function ask(question: string, opts: { graph: string; maxSteps?: number; onStep?: (s: Step) => void }): Promise<AgentResult> {
  const started = Date.now();
  const { tools, close } = await openGraphTools(opts.graph);
  try {
    const r = await runLoop({
      llm: createOpenAiChat() as never, model: config.llmModel, system: SYSTEM, user: question, tools,
      maxSteps: opts.maxSteps ?? 6, maxResultChars: 12_000,
      onStep: opts.onStep,
      finalAnswer: 'Step budget reached. Answer now, only from the tool results above, citing ids in brackets — or say "I don\'t know — the graph has no path for this."',
    });
    return { question, answer: r.answer.trim(), steps: r.steps, grounding: ground(r.answer, r.steps), exhausted: r.exhausted, ms: Date.now() - started };
  } finally {
    await close();
  }
}

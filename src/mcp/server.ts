/**
 * The graph tools over MCP (stdio). Any MCP client — our agent, Claude Desktop, a judge's own client —
 * gets the same read-only, deterministic tools, each returning JSON whose items carry the ids and
 * source lines an answer must cite.
 *
 *   npm run mcp -- --graph <repo-graph>       (the graph each tool uses unless a call names another)
 *
 * stdout is the protocol channel: nothing else may be printed there; logs go to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { connect, type Graph } from '../graph/db.js';
import { connect as connectPath, disproven, loadBearing, origin, search, told, trace, whatBreaks, whatIs, whoKnows, why } from '../tools/graph-tools.js';
import { review } from '../tools/review.js';

const { values } = parseArgs({ options: { graph: { type: 'string' } } });
const defaultGraph = values.graph ?? process.env.DEFAULT_GRAPH;

const db = await connect();
const graphs = new Map<string, Graph>();
const graphOf = async (name?: string) => {
  const g = name ?? defaultGraph;
  if (!g) throw new Error('no graph named — pass "graph", or start the server with --graph');
  if (!/^[A-Za-z0-9_.-]+$/.test(g) || g.endsWith('__board')) throw new Error(`not a brain graph: ${g}`);
  if (!graphs.has(g)) {
    if (!(await db.list()).includes(g)) throw new Error(`no graph "${g}" — run npm run ingest`);
    graphs.set(g, db.selectGraph(g));
  }
  return graphs.get(g)!;
};

const server = new McpServer({ name: 'decision-brain', version: '0.1.0' });
const graphArg = { graph: z.string().optional().describe('Which repo graph to read; defaults to the one the server was started with.') };
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] });
const run = <A>(fn: (g: Graph, a: A) => Promise<unknown>) =>
  async (a: A & { graph?: string }) => {
    try { return json(await fn(await graphOf(a.graph), a)); } catch (err) { return { ...json({ error: (err as Error).message }), isError: true }; }
  };

server.registerTool('search', {
  description: 'Find decisions by free text over their titles and bodies. Use when the question names nothing exact.',
  inputSchema: { query: z.string(), limit: z.number().int().min(1).max(20).optional(), ...graphArg },
}, run((g, a: { query: string; limit?: number }) => search(g, a.query, a.limit)));

server.registerTool('why', {
  description: 'Why is a file, topic or decision the way it is: the decisions that shaped it, newest first, each with how it connects and its measurements and experiments.',
  inputSchema: { target: z.string().describe('A file path (or unique suffix), a topic word, or a decision id'), ...graphArg },
}, run((g, a: { target: string }) => why(g, a.target)));

server.registerTool('trace', {
  description: 'The full path behind one decision: its source lines, the commit that recorded it and the commits it cites (authors, files), the files it names, and what it supersedes or is superseded by.',
  inputSchema: { decision_id: z.string(), ...graphArg },
}, run((g, a: { decision_id: string }) => trace(g, a.decision_id)));

server.registerTool('what_breaks', {
  description: 'If this file changes, which standing decisions rest on it and should be re-checked — with their evidence. Settled (superseded or failed) decisions are listed apart as history.',
  inputSchema: { file: z.string(), ...graphArg },
}, run((g, a: { file: string }) => whatBreaks(g, a.file)));

server.registerTool('disproven', {
  description: 'What was tried and disproven, or dropped, around a file or topic — so nobody tries it again.',
  inputSchema: { target: z.string(), ...graphArg },
}, run((g, a: { target: string }) => disproven(g, a.target)));

server.registerTool('who_knows', {
  description: 'Who knows a file (commits that touched it) or a topic (commits that recorded decisions about it). Humans ranked by commits; AI agents listed apart.',
  inputSchema: { target: z.string(), ...graphArg },
}, run((g, a: { target: string }) => whoKnows(g, a.target)));

server.registerTool('connect', {
  description: 'The shortest chain of reasoning between two things (files, topics, decisions) — through decisions and specific concepts, never through a person or a hub.',
  inputSchema: { from: z.string(), to: z.string(), ...graphArg },
}, run((g, a: { from: string; to: string }) => connectPath(g, a.from, a.to)));

server.registerTool('load_bearing', {
  description: 'PageRank over the rationale graph: the files the most reasoning rests on.',
  inputSchema: { limit: z.number().int().min(1).max(30).optional(), ...graphArg },
}, run((g, a: { limit?: number }) => loadBearing(g, a.limit)));

server.registerTool('what_is', {
  description: 'What a file or directory does now, from its summary (which describes code at a commit — not intent). "." or "repo" for the whole repository. Says when the file changed since it was summarized.',
  inputSchema: { target: z.string().describe('A file path, a directory path, or "repo"'), ...graphArg },
}, run((g, a: { target: string }) => whatIs(g, a.target)));

server.registerTool('origin', {
  description: 'Original intent of a file and how it evolved: the commit that created it (its message — the closest thing to stated intent) and any decision it recorded, every later decision resting on it in date order, and what it does now. recordedIntent is null when nothing was written down.',
  inputSchema: { file: z.string(), ...graphArg },
}, run((g, a: { file: string }) => origin(g, a.file)));

server.registerTool('told', {
  description: "What an AI agent was told when it wrote a commit: the instruction-file guidance (CLAUDE.md, AGENTS.md, …) in force on the commit's date, about the files it touched — which agents co-wrote it, and whether that guidance has changed since.",
  inputSchema: { commit: z.string(), ...graphArg },
}, run((g, a: { commit: string }) => told(g, a.commit)));

server.registerTool('review', {
  description: 'The deterministic review packet for a commit: the decision it records, standing decisions on its files to re-check (with measurements), disproven experiments, superseded reasoning, and reviewers — all as of the commit. Items have stable ids (C1, R1, D1, S1, P1).',
  inputSchema: { commit: z.string().describe('A commit sha or unique prefix'), ...graphArg },
}, run((g, a: { commit: string }) => review(g, a.commit)));

await server.connect(new StdioServerTransport());
console.error(`[mcp] decision-brain ready${defaultGraph ? ` (graph: ${defaultGraph})` : ''}`);

/**
 * npm run web  →  http://127.0.0.1:4100  (WEB_HOST / WEB_PORT)
 *
 * Read-only HTTP for the views: static files from web/, JSON snapshots, and server-sent events that
 * push a fresh board snapshot whenever it changes. No writes, no auth — the same build judges get.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { boardName } from '../board/board.js';
import { connect, type Graph } from '../graph/db.js';
import { ask } from '../agent/agent.js';
import { buildPath } from '../agent/path.js';
import { trace } from '../tools/trace.js';

const ROOT = resolve(import.meta.dirname, '../../web');
const VENDOR: Record<string, string> = {
  '/vendor/cytoscape.min.js': resolve(import.meta.dirname, '../../node_modules/cytoscape/dist/cytoscape.min.js'),
};
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const host = process.env.WEB_HOST ?? '127.0.0.1';
const port = Number(process.env.WEB_PORT ?? 4100);

const db = await connect();
const graphs = new Map<string, Graph>();
const graph = (name: string) => { if (!graphs.has(name)) graphs.set(name, db.selectGraph(name)); return graphs.get(name)!; };
const safeName = (s: string) => /^[A-Za-z0-9_.-]+$/.test(s) ? s : null;

export async function boardSnapshot(board: Graph) {
  const q = async <T>(cypher: string) => (await board.roQuery<T>(cypher)).data ?? [];
  const [sections, agents, handoffs, events, findings] = await Promise.all([
    q<{ id: string; title: string; date: string | null; status: string; claimedBy: string | null; attempts: number; order: number }>(
      'MATCH (s:Section) RETURN s.id AS id, s.title AS title, s.date AS date, s.status AS status, s.claimedBy AS claimedBy, s.attempts AS attempts, s.order AS order ORDER BY s.order'),
    q<{ name: string; model: string; lastSeen: number; leftAt: number | null; holding: string[]; findings: number }>(
      `MATCH (a:Agent) RETURN a.name AS name, a.model AS model, a.lastSeen AS lastSeen, a.leftAt AS leftAt,
         [(a)-[:CLAIMED]->(n) | coalesce(n.id, n.key)] AS holding,
         size([(a)<-[:FROM]-(f:Finding) | f]) AS findings
       ORDER BY a.name`),
    q<{ key: string; source: string; target: string; relation: string; status: string; raisedBy: string; resolvedBy: string | null; reason: string | null }>(
      `MATCH (f:Finding)-[:RAISED]->(h:Handoff)-[:FOR]->(t:Section), (f)-[:ABOUT]->(s:Section), (f)-[:FROM]->(a:Agent)
       RETURN h.key AS key, s.id AS source, t.id AS target, h.relation AS relation, h.status AS status,
              a.name AS raisedBy, h.resolvedBy AS resolvedBy, h.reason AS reason`),
    q<{ at: number; kind: string; agent: string | null; section: string | null; text: string }>(
      'MATCH (e:Event) RETURN e.at AS at, e.kind AS kind, e.agent AS agent, e.section AS section, e.text AS text ORDER BY e.at DESC LIMIT 80'),
    q<{ section: string; verified: number; total: number }>(
      `MATCH (f:Finding)-[:ABOUT]->(s:Section)
       RETURN s.id AS section, sum(CASE WHEN f.verified THEN 1 ELSE 0 END) AS verified, count(f) AS total`),
  ]);
  return { sections, agents, handoffs, events, findings, now: Date.now() };
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body as string);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${host}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (parts[0] === 'api') {
      if (parts[1] === 'graphs') {
        const all = await db.list();
        return send(res, 200, all.filter((g) => !/__(board|files)$/.test(g) && !g.startsWith('test-'))
          .map((g) => ({ name: g, board: all.includes(boardName(g)), files: all.includes(`${g}__files`) })));
      }
      const name = safeName(parts[2] ?? '');
      if (!name) return send(res, 400, { error: 'bad graph name' });

      // ?job=files shows the file-summary board instead of the decision-extraction board.
      const boardOf = (n: string) => url.searchParams.get('job') === 'files' ? `${n}__files` : boardName(n);
      if (parts[1] === 'board' && parts[3] === 'stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        let last = '';
        const tick = async () => {
          const snap = await boardSnapshot(graph(boardOf(name)));
          const { now: _now, ...rest } = snap;
          const hash = createHash('sha1').update(JSON.stringify(rest)).digest('hex');
          if (hash !== last) { last = hash; res.write(`data: ${JSON.stringify(snap)}\n\n`); }
          else res.write(': keep-alive\n\n');
        };
        await tick();
        const timer = setInterval(() => { tick().catch(() => {}); }, 1000);
        req.on('close', () => clearInterval(timer));
        return;
      }
      if (parts[1] === 'board') return send(res, 200, await boardSnapshot(graph(boardOf(name))));

      // The agent, streamed: each tool call as it completes, then the answer, its grounding and its path.
      if (parts[1] === 'ask' && parts[3] === 'stream') {
        const question = (url.searchParams.get('q') ?? '').trim().slice(0, 500);
        if (!question) return send(res, 400, { error: 'empty question' });
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        const emit = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
        const ping = setInterval(() => res.write(': keep-alive\n\n'), 10_000);
        try {
          const r = await ask(question, {
            graph: name,
            onStep: (st) => emit('step', { tool: st.tool, args: st.args, chars: st.result.length, error: Boolean(st.error), preview: st.result.slice(0, 400) }),
          });
          const path = await buildPath(graph(name), r.answer, r.steps, r.grounding);
          emit('answer', { answer: r.answer, grounding: r.grounding, exhausted: r.exhausted, ms: r.ms, path });
        } catch (err) {
          emit('error', { message: (err as Error).message });
        } finally {
          clearInterval(ping);
          res.end();
        }
        return;
      }
      if (parts[1] === 'trace' && parts[3]) {
        const t = await trace(graph(name), parts[3]);
        return t ? send(res, 200, t) : send(res, 404, { error: 'no such decision' });
      }
      return send(res, 404, { error: 'not found' });
    }

    if (VENDOR[url.pathname]) return send(res, 200, await readFile(VENDOR[url.pathname], 'utf8'), 'text/javascript');
    const rel = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
    const body = await readFile(file, 'utf8').catch(() => null);
    return body === null ? send(res, 404, 'not found', 'text/plain') : send(res, 200, body, TYPES[extname(file)] ?? 'text/plain');
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
});

server.listen(port, host, () => console.log(`[web] http://${host}:${port}`));

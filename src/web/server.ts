/**
 * npm run web  →  http://127.0.0.1:4100  (WEB_HOST / WEB_PORT)
 *
 * Read-only HTTP for the views: static files from web/, JSON snapshots, and server-sent events that
 * push a fresh board snapshot whenever it changes. No auth — the same build judges get. The one write,
 * adding a repository (src/web/add.ts), is off unless WEB_ALLOW_INGEST=1, for local use.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { boardName } from '../board/board.js';
import { connect, type Graph } from '../graph/db.js';
import { ask } from '../agent/agent.js';
import { buildPath } from '../agent/path.js';
import { origin, whatBreaks, whatIs, why } from '../tools/graph-tools.js';
import { trace } from '../tools/trace.js';
import { addEnabled, currentJob, startAdd } from './add.js';

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
      // Adding a repository: GET for whether it is on and the job's progress; POST (JSON, same origin) to start.
      if (parts[1] === 'add') {
        if (req.method === 'GET') return send(res, 200, { enabled: addEnabled, job: currentJob() });
        if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
        const origin = req.headers.origin;
        if (!/^application\/json\b/.test(req.headers['content-type'] ?? '') || (origin && origin !== `http://${req.headers.host}`))
          return send(res, 403, { error: 'same-origin JSON only' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 4096) return send(res, 413, { error: 'too large' }); }
        let input: { url?: unknown; summaries?: unknown };
        try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'bad JSON' }); }
        const r = await startAdd(String(input.url ?? ''), input.summaries === true, await db.list());
        return 'error' in r ? send(res, 400, r) : send(res, 202, r);
      }
      if (parts[1] === 'graphs') {
        const all = await db.list();
        const names = all.filter((g) => !/__(board|files)$/.test(g) && !g.startsWith('test-'));
        // A demo copy (scripts/demo/setup.ts marks it) holds scripted changes; pages list it only on request.
        const demo = await Promise.all(names.map(async (g) =>
          ((await graph(g).roQuery<{ n: number }>('MATCH (m:DemoCopy) RETURN count(m) AS n')).data?.[0]?.n ?? 0) > 0));
        return send(res, 200, names.map((g, i) => ({ name: g, board: all.includes(boardName(g)), files: all.includes(`${g}__files`), demo: demo[i] })));
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
      // A decision's extracted evidence: measurements and experiments, each with its quote.
      if (parts[1] === 'evidence' && parts[3]) {
        const d = (await why(graph(name), parts[3])).decisions.find((x) => x.id === parts[3]);
        return d ? send(res, 200, { measurements: d.measurements, experiments: d.experiments }) : send(res, 404, { error: 'no such decision' });
      }
      // A file-summary tile: what the file or directory does now; for a file, also the decisions that
      // rest on it (with their evidence) and the commit that created it.
      if (parts[1] === 'file' && parts[3]) {
        const g = graph(name);
        if (parts[3].startsWith('dir:')) return send(res, 200, { now: await whatIs(g, parts[3].slice(4)) });
        const path = parts[3].replace(/^file:/, '');
        const [now, breaks, o] = await Promise.all([whatIs(g, path), whatBreaks(g, path), origin(g, path)]);
        // No summary in the brain: say whether one was written and rejected by the code check, and why.
        const rejected = 'purpose' in now && now.purpose === null && (await db.list()).includes(`${name}__files`)
          ? ((await graph(`${name}__files`).roQuery<{ reason: string }>(
              `MATCH (f:Finding {kind: 'summary'})-[:ABOUT]->(:Section {id: $id}) WHERE NOT f.verified
               RETURN f.reason AS reason ORDER BY f.at DESC LIMIT 1`, { params: { id: `file:${path}` } })).data?.[0]?.reason ?? null)
          : null;
        return send(res, 200, { now, rejected, recheck: breaks.recheck, history: breaks.history, birth: o.birth, bornWith: o.recordedIntent?.decisions ?? [] });
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

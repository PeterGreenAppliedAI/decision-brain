/**
 * The board: shared state for the extraction team, in its own FalkorDB graph (`<repo>__board`).
 * Agents never talk to each other — they claim work, post findings and raise handoffs here.
 *
 *   (:Section {id, title, date, order, status: pending|claimed|done|failed, attempts, claimedBy, expiresAt})
 *   (:Agent {name, model, lastSeen})
 *   (:Agent)-[:CLAIMED {at}]->(:Section|:Handoff)        // the live claim; it expires
 *   (:Finding {id, kind, data, quote, verified, reason, at, hash, stale})-[:FROM]->(:Agent), -[:ABOUT]->(:Section)
 *                                                       // hash: of the text it was extracted from
 *   (:Handoff {key, relation, status: open|claimed|confirmed|rejected, attempts, claimedBy, expiresAt,
 *              quote, reason})-[:FOR]->(:Section)        // the target, read by another agent
 *   (:Finding {kind: 'cross_ref'})-[:RAISED]->(:Handoff)
 *   (:Event {at, kind, agent, section, text})            // the feed the board view streams
 *
 * FalkorDB serializes writes to one graph, so every claim is a single query and therefore atomic:
 * concurrent claimers always get different work, with no locks in code.
 *
 * Dependencies: (:Section)-[:PART_OF]->(:Section) with `waiting` = how many parts are not done yet.
 * A section is claimable only at waiting = 0, and finishing a part counts its parent down — so a
 * directory summary is written only after every file in it, and the repo summary last.
 */
import type { Graph } from '../graph/db.js';

export const boardName = (repoGraph: string) => `${repoGraph}__board`;

export interface FindingRow {
  kind: 'measurement' | 'experiment' | 'concept' | 'model' | 'cross_ref' | 'summary';
  data: Record<string, unknown>;
  quote: string | null;
  verified: boolean;
  reason: string | null;
  /** cross_ref only: the section the handoff is for, and the claimed relation. */
  target?: string;
  relation?: string;
}

export interface Claim { id: string; takeover: boolean; fromAgent: string | null }

export async function ensureBoardSchema(board: Graph): Promise<void> {
  for (const [label, prop] of [['Section', 'id'], ['Section', 'status'], ['Agent', 'name'], ['Handoff', 'key'],
    ['Handoff', 'status'], ['Event', 'at']] as const) {
    try { await board.createNodeRangeIndex(label, prop); } catch (err) {
      if (!/already indexed/i.test(String(err))) throw err;
    }
  }
}

export async function event(board: Graph, kind: string, agent: string | null, section: string | null, text: string, now = Date.now()) {
  await board.query('CREATE (:Event {at: $now, kind: $kind, agent: $agent, section: $section, text: $text})',
    { params: { now, kind, agent, section, text } });
}

/**
 * One Section per decision in the brain graph. Existing sections keep their state — unless the
 * decision's text changed since it was extracted (content hash): then the section goes back to
 * pending, its findings are marked stale, and handoffs touching it are reopened or retired.
 * Sections for decisions that no longer exist are removed.
 */
export async function seedBoard(board: Graph, brain: Graph, limit?: number): Promise<{ sections: number; changed: string[]; removed: number }> {
  await ensureBoardSchema(board);
  const res = await brain.roQuery<{ id: string; title: string; date: string | null; hash: string | null }>(
    `MATCH (d:Decision) RETURN d.id AS id, d.title AS title, d.date AS date, d.contentHash AS hash
     ORDER BY CASE WHEN d.date IS NULL THEN 1 ELSE 0 END, d.date DESC, d.id${limit ? ' LIMIT $limit' : ''}`,
    { params: { limit: limit ?? 0 } });
  const rows = (res.data ?? []).map((r, order) => ({ ...r, order }));

  const changed = ((await board.query<{ id: string }>(
    `UNWIND $rows AS r MATCH (s:Section {id: r.id}) WHERE s.hash IS NOT NULL AND s.hash <> r.hash RETURN s.id AS id`,
    { params: { rows: rows as never } })).data ?? []).map((r) => r.id);
  if (changed.length) {
    await board.query(
      `MATCH (s:Section) WHERE s.id IN $ids
       SET s.status = 'pending', s.attempts = 0, s.claimedBy = null, s.expiresAt = null
       WITH s OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(s) DELETE c`, { params: { ids: changed } });
    await board.query(`MATCH (f:Finding)-[:ABOUT]->(s:Section) WHERE s.id IN $ids SET f.stale = true`, { params: { ids: changed } });
    // Raised from a changed entry: its evidence is gone until re-extraction raises it again.
    await board.query(
      `MATCH (f:Finding)-[:RAISED]->(h:Handoff), (f)-[:ABOUT]->(s:Section) WHERE s.id IN $ids SET h.status = 'stale'`, { params: { ids: changed } });
    // About a changed entry: the confirmation quoted old text — check it again.
    await board.query(
      `MATCH (h:Handoff)-[:FOR]->(t:Section) WHERE t.id IN $ids AND h.status <> 'stale'
       SET h.status = 'open', h.attempts = 0, h.claimedBy = null, h.resolvedBy = null, h.quote = null, h.targetHash = null`, { params: { ids: changed } });
    for (const id of changed) await event(board, 'invalidated', null, id, 'entry text changed — evidence stale, queued for re-extraction');
  }
  // Only a full seed knows which entries are gone: with a limit, absent ≠ deleted.
  const gone = limit ? { data: [{ n: 0 }] } : await board.query<{ n: number }>(
    `MATCH (s:Section) WHERE s.kind IS NULL AND NOT s.id IN $ids
     OPTIONAL MATCH (f:Finding)-[:ABOUT]->(s) OPTIONAL MATCH (h:Handoff)-[:FOR]->(s)
     WITH collect(DISTINCT s) + collect(DISTINCT f) + collect(DISTINCT h) AS doomed
     UNWIND doomed AS x DETACH DELETE x RETURN count(x) AS n`, { params: { ids: rows.map((r) => r.id) } });

  await board.query(
    `UNWIND $rows AS r
     MERGE (s:Section {id: r.id})
     ON CREATE SET s.status = 'pending', s.attempts = 0
     SET s.title = r.title, s.date = r.date, s.order = r.order, s.hash = r.hash`,
    { params: { rows: rows as never } });
  await event(board, 'seed', null, null, `${rows.length} sections${changed.length ? `, ${changed.length} changed since extraction` : ''}`);
  return { sections: rows.length, changed, removed: gone.data?.[0]?.n ?? 0 };
}

export async function registerAgent(board: Graph, name: string, model: string): Promise<void> {
  await board.query('MERGE (a:Agent {name: $name}) SET a.model = $model, a.lastSeen = $now',
    { params: { name, model, now: Date.now() } });
  await event(board, 'join', name, null, model);
}

/**
 * Claim the next open section — or one whose claim has expired (its worker crashed or stalled) —
 * in one atomic query. Sections that have used up their attempts are not offered again.
 */
export async function claimSection(board: Graph, agent: string, ttlMs: number, maxAttempts: number, now = Date.now()): Promise<Claim | null> {
  const res = await board.query<Claim>(`
    MATCH (s:Section)
    WHERE (s.status = 'pending' OR (s.status = 'claimed' AND s.expiresAt < $now)) AND s.attempts < $max
      AND coalesce(s.waiting, 0) = 0
    WITH s ORDER BY s.order LIMIT 1
    OPTIONAL MATCH (prev:Agent)-[old:CLAIMED]->(s)
    WITH s, prev, old, s.status = 'claimed' AS takeover
    DELETE old
    WITH s, prev, takeover
    MATCH (a:Agent {name: $agent})
    SET s.status = 'claimed', s.claimedBy = $agent, s.expiresAt = $now + $ttl, s.attempts = s.attempts + 1,
        a.lastSeen = $now
    CREATE (a)-[:CLAIMED {at: $now}]->(s)
    RETURN s.id AS id, takeover, prev.name AS fromAgent`,
  { params: { agent, now, ttl: ttlMs, max: maxAttempts } });
  const claim = res.data?.[0] ?? null;
  if (claim) {
    await event(board, claim.takeover ? 'takeover' : 'claim', agent, claim.id,
      claim.takeover ? `took over from ${claim.fromAgent} (claim expired)` : 'claimed');
  }
  return claim;
}

/**
 * Claim an open handoff — never one this agent raised itself: a handoff is confirmed by a second
 * agent reading the other side, or it is not confirmed.
 */
export async function claimHandoff(board: Graph, agent: string, ttlMs: number, maxAttempts: number, now = Date.now()):
  Promise<{ key: string; relation: string; target: string; source: string; quote: string; raisedBy: string } | null> {
  const res = await board.query<{ key: string; relation: string; target: string; source: string; quote: string; raisedBy: string }>(`
    MATCH (h:Handoff)
    WHERE (h.status = 'open' OR (h.status = 'claimed' AND h.expiresAt < $now)) AND h.attempts < $max
      AND NOT (h)<-[:RAISED]-(:Finding)-[:FROM]->(:Agent {name: $agent})
    WITH h ORDER BY h.createdAt LIMIT 1
    OPTIONAL MATCH (:Agent)-[old:CLAIMED]->(h)
    DELETE old
    WITH h
    MATCH (a:Agent {name: $agent}), (h)-[:FOR]->(t:Section), (f:Finding)-[:RAISED]->(h), (f)-[:ABOUT]->(src:Section),
          (f)-[:FROM]->(raiser:Agent)
    SET h.status = 'claimed', h.claimedBy = $agent, h.expiresAt = $now + $ttl, h.attempts = h.attempts + 1,
        a.lastSeen = $now
    CREATE (a)-[:CLAIMED {at: $now}]->(h)
    RETURN h.key AS key, h.relation AS relation, t.id AS target, src.id AS source, f.quote AS quote,
           raiser.name AS raisedBy`,
  { params: { agent, now, ttl: ttlMs, max: maxAttempts } });
  const h = res.data?.[0] ?? null;
  if (h) await event(board, 'handoff_claim', agent, h.target, `picked up ${h.raisedBy}'s claim: ${h.source} ${h.relation} ${h.target}`);
  return h;
}

/** Extend a live claim. Returns false when the claim was lost (expired and taken over). */
export async function heartbeat(board: Graph, agent: string, label: 'Section' | 'Handoff', key: string, ttlMs: number, now = Date.now()): Promise<boolean> {
  const keyProp = label === 'Section' ? 'id' : 'key';
  const res = await board.query<{ ok: boolean }>(
    `MATCH (n:${label} {${keyProp}: $key}) WHERE n.status = 'claimed' AND n.claimedBy = $agent
     SET n.expiresAt = $now + $ttl
     WITH n MATCH (a:Agent {name: $agent}) SET a.lastSeen = $now
     RETURN true AS ok`,
    { params: { key, agent, now, ttl: ttlMs } });
  return Boolean(res.data?.[0]?.ok);
}

/**
 * Post a section's findings and mark it done — only if this agent still holds the claim. A worker
 * that stalled past its expiry and was taken over gets `false`, and its late work is dropped.
 * Verified cross-refs open a Handoff on their target (one per source/relation/target).
 */
export async function completeSection(board: Graph, agent: string, sectionId: string, findings: FindingRow[], note: string,
  now = Date.now(), hash: string | null = null): Promise<boolean> {
  const owned = await board.query<{ ok: boolean }>(
    `MATCH (s:Section {id: $id}) WHERE s.status = 'claimed' AND s.claimedBy = $agent
     SET s.status = 'done', s.doneAt = $now, s.note = $note
     WITH s OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(s) DELETE c
     RETURN true AS ok`,
    { params: { id: sectionId, agent, now, note } });
  if (!owned.data?.[0]?.ok) {
    await event(board, 'lost', agent, sectionId, 'claim lost before finishing — work dropped');
    return false;
  }
  // A re-extraction replaces what the old text yielded (the event log keeps that it happened).
  await board.query('MATCH (f:Finding {stale: true})-[:ABOUT]->(:Section {id: $id}) DETACH DELETE f', { params: { id: sectionId } });
  // Count the parent down: its last part finishing makes it claimable.
  await board.query('MATCH (:Section {id: $id})-[:PART_OF]->(p:Section) SET p.waiting = p.waiting - 1', { params: { id: sectionId } });
  const rows = findings.map((f, i) => ({
    id: `${sectionId}#${agent}#${now}#${i}`, kind: f.kind, data: JSON.stringify(f.data), quote: f.quote,
    verified: f.verified, reason: f.reason, target: f.target ?? null, relation: f.relation ?? null,
    key: f.target ? `${sectionId}|${f.relation}|${f.target}` : null,
  }));
  await board.query(
    `UNWIND $rows AS r
     MATCH (s:Section {id: $section}), (a:Agent {name: $agent})
     CREATE (f:Finding {id: r.id, kind: r.kind, data: r.data, quote: r.quote, verified: r.verified, reason: r.reason, at: $now, hash: $hash, stale: false})
     CREATE (f)-[:FROM]->(a), (f)-[:ABOUT]->(s)`,
    { params: { rows: rows as never, section: sectionId, agent, now, hash } });
  const handoffs = rows.filter((r) => r.kind === 'cross_ref' && r.verified && r.key);
  if (handoffs.length) {
    await board.query(
      `UNWIND $rows AS r
       MATCH (f:Finding {id: r.id}), (t:Section {id: r.target})
       MERGE (h:Handoff {key: r.key})
       ON CREATE SET h.relation = r.relation, h.status = 'open', h.attempts = 0, h.createdAt = $now
       ON MATCH SET h.status = CASE WHEN h.status = 'stale' THEN 'open' ELSE h.status END,
                    h.attempts = CASE WHEN h.status = 'stale' THEN 0 ELSE h.attempts END
       MERGE (h)-[:FOR]->(t)
       MERGE (f)-[:RAISED]->(h)`,
      { params: { rows: handoffs as never, now } });
  }
  const verified = findings.filter((f) => f.verified).length;
  await event(board, 'done', agent, sectionId, `${verified}/${findings.length} findings verified${handoffs.length ? `, ${handoffs.length} handoff(s) raised` : ''}`);
  for (const h of handoffs) await event(board, 'handoff_raised', agent, h.target, `${sectionId} ${h.relation} ${h.target}`);
  return true;
}

/** Record the second agent's verdict on a handoff — only if it still holds the claim. */
export async function resolveHandoff(board: Graph, agent: string, key: string,
  verdict: { confirmed: boolean; quote: string | null; reason: string }, now = Date.now(), targetHash: string | null = null): Promise<boolean> {
  const res = await board.query<{ target: string }>(
    `MATCH (h:Handoff {key: $key})-[:FOR]->(t:Section) WHERE h.status = 'claimed' AND h.claimedBy = $agent
     SET h.status = $status, h.resolvedBy = $agent, h.resolvedAt = $now, h.quote = $quote, h.reason = $reason, h.targetHash = $targetHash
     WITH h, t OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(h) DELETE c
     RETURN t.id AS target`,
    { params: { key, agent, now, status: verdict.confirmed ? 'confirmed' : 'rejected', quote: verdict.quote, reason: verdict.reason, targetHash } });
  const target = res.data?.[0]?.target;
  if (!target) return false;
  await event(board, verdict.confirmed ? 'handoff_confirmed' : 'handoff_rejected', agent, target, `${key.replace(/\|/g, ' ')} — ${verdict.reason}`);
  return true;
}

/** Give up a claim explicitly (an extraction error): the work goes back to the pool at once. */
export async function release(board: Graph, agent: string, label: 'Section' | 'Handoff', key: string, why: string,
  maxAttempts: number): Promise<void> {
  const keyProp = label === 'Section' ? 'id' : 'key';
  const back = label === 'Section' ? 'pending' : 'open';
  const res = await board.query<{ status: string }>(
    `MATCH (n:${label} {${keyProp}: $key}) WHERE n.claimedBy = $agent AND n.status = 'claimed'
     SET n.status = CASE WHEN n.attempts >= $max THEN 'failed' ELSE $back END, n.lastError = $why
     WITH n OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(n) DELETE c
     RETURN n.status AS status`,
    { params: { key, agent, back, why, max: maxAttempts } });
  if (label === 'Section' && res.data?.[0]?.status === 'failed') await releaseParents(board, [key]);
  await event(board, 'release', agent, label === 'Section' ? key : null, why.slice(0, 200));
}

/** A part that failed for good still counts its parent down — the parent is written without it. */
async function releaseParents(board: Graph, ids: string[]): Promise<void> {
  if (ids.length) await board.query('MATCH (s:Section)-[:PART_OF]->(p:Section) WHERE s.id IN $ids SET p.waiting = p.waiting - 1', { params: { ids } });
}

/** Expired claims whose sections have no attempts left are failed, so the team can finish. */
export async function sweepExhausted(board: Graph, maxAttempts: number, now = Date.now()): Promise<void> {
  const res = await board.query<{ id: string | null }>(
    `MATCH (n) WHERE (n:Section OR n:Handoff) AND n.status = 'claimed' AND n.expiresAt < $now AND n.attempts >= $max
     SET n.status = 'failed'
     WITH n OPTIONAL MATCH (:Agent)-[c:CLAIMED]->(n) DELETE c
     RETURN CASE WHEN n:Section THEN n.id ELSE null END AS id`,
    { params: { now, max: maxAttempts } });
  await releaseParents(board, (res.data ?? []).map((r) => r.id).filter((x): x is string => Boolean(x)));
}

export interface BoardCounts { pending: number; claimed: number; done: number; failed: number; handoffsOpen: number; handoffsClaimed: number }

export async function counts(board: Graph): Promise<BoardCounts> {
  const res = await board.roQuery<BoardCounts>(`
    OPTIONAL MATCH (s:Section)
    WITH sum(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END) AS pending,
         sum(CASE WHEN s.status = 'claimed' THEN 1 ELSE 0 END) AS claimed,
         sum(CASE WHEN s.status = 'done' THEN 1 ELSE 0 END) AS done,
         sum(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) AS failed
    OPTIONAL MATCH (h:Handoff)
    RETURN pending, claimed, done, failed,
           sum(CASE WHEN h.status = 'open' THEN 1 ELSE 0 END) AS handoffsOpen,
           sum(CASE WHEN h.status = 'claimed' THEN 1 ELSE 0 END) AS handoffsClaimed`);
  return res.data![0];
}

/** Mark an idle agent as still present, so colleagues know someone may yet pick up their handoffs. */
export async function touchAgent(board: Graph, agent: string, now = Date.now()): Promise<void> {
  await board.query('MATCH (a:Agent {name: $agent}) SET a.lastSeen = $now', { params: { agent, now } });
}

/** Other agents seen within the window — the ones that could still confirm this agent's handoffs. */
export async function othersAlive(board: Graph, agent: string, windowMs: number, now = Date.now()): Promise<number> {
  const res = await board.roQuery<{ n: number }>(
    'MATCH (a:Agent) WHERE a.name <> $agent AND a.lastSeen > $since AND coalesce(a.leftAt, 0) < a.lastSeen RETURN count(a) AS n',
    { params: { agent, since: now - windowMs } });
  return res.data?.[0]?.n ?? 0;
}

/** A worker leaving cleanly says so, so nobody waits out its window. */
export async function leave(board: Graph, agent: string, summary: string, now = Date.now()): Promise<void> {
  await board.query('MATCH (a:Agent {name: $agent}) SET a.leftAt = $now, a.lastSeen = $now', { params: { agent, now } });
  await event(board, 'leave', agent, null, summary);
}

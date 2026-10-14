// The board view: the extraction team working live. Sections are tiles (colour = status), agents sit
// above them with an edge to whatever they hold, and handoffs are arcs between sections.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const SILENT_MS = 3 * 60_000;

const cy = cytoscape({
  container: $('cy'),
  wheelSensitivity: 0.3,
  maxZoom: 1.4,
  boxSelectionEnabled: false,
  style: [
    { selector: 'node.section', style: { shape: 'round-rectangle', width: 26, height: 26, 'background-color': css('--pending'),
      label: 'data(short)', 'font-size': 7, color: '#8b95a7', 'text-valign': 'bottom', 'text-margin-y': 3, 'font-family': 'monospace' } },
    { selector: 'node.section.claimed', style: { 'background-color': css('--claimed') } },
    { selector: 'node.section.done', style: { 'background-color': css('--done') } },
    { selector: 'node.section.failed', style: { 'background-color': css('--failed') } },
    { selector: 'node.section:selected', style: { 'border-width': 2, 'border-color': '#fff' } },
    { selector: 'node.agent', style: { shape: 'ellipse', width: 38, height: 38, 'background-color': css('--agent'),
      label: 'data(id)', color: css('--text'), 'font-size': 10, 'text-valign': 'top', 'text-margin-y': -4, 'font-family': 'monospace' } },
    { selector: 'node.agent.left', style: { 'background-color': css('--dim') } },
    { selector: 'node.agent.silent', style: { 'background-color': css('--failed') } },
    { selector: 'edge.claim', style: { width: 2, 'line-color': css('--claimed'), 'curve-style': 'straight', opacity: 0.85,
      'target-arrow-shape': 'triangle', 'target-arrow-color': css('--claimed'), 'arrow-scale': 0.8 } },
    { selector: 'edge.handoff', style: { width: 2.5, 'line-color': css('--handoff'), 'line-style': 'dashed', 'curve-style': 'unbundled-bezier',
      'control-point-distances': 60, 'target-arrow-shape': 'triangle', 'target-arrow-color': css('--handoff'),
      label: 'data(relation)', 'font-size': 8, color: css('--handoff'), 'text-background-color': '#0b0e14', 'text-background-opacity': 1, 'font-family': 'monospace' } },
    { selector: 'edge.handoff.claimed', style: { 'line-style': 'solid' } },
    { selector: 'edge.handoff.confirmed', style: { 'line-style': 'solid', 'line-color': css('--confirmed'), 'target-arrow-color': css('--confirmed'), color: css('--confirmed') } },
    { selector: 'edge.handoff.rejected', style: { 'line-style': 'dotted', 'line-color': css('--rejected'), 'target-arrow-color': css('--rejected'), color: css('--rejected') } },
  ],
});

let graphName = new URLSearchParams(location.search).get('graph');
let source = null;
let seenEvents = new Set();
let laidOut = '';

function layout(snap) {
  const n = snap.sections.length;
  const cols = Math.max(6, Math.ceil(Math.sqrt(n * 2.2)));
  const gap = 46;
  const pos = {};
  snap.sections.forEach((s, i) => { pos[s.id] = { x: (i % cols) * gap, y: 120 + Math.floor(i / cols) * gap }; });
  const span = (cols - 1) * gap;
  snap.agents.forEach((a, i) => { pos[`agent:${a.name}`] = { x: snap.agents.length === 1 ? span / 2 : (i * span) / (snap.agents.length - 1), y: 0 }; });
  return pos;
}

function render(snap) {
  const pos = layout(snap);
  const key = snap.sections.map((s) => s.id).join() + '|' + snap.agents.map((a) => a.name).join();
  const want = new Map();
  for (const s of snap.sections) {
    want.set(s.id, { group: 'nodes', data: { id: s.id, short: (s.date ?? '').slice(5) || '—', title: s.title }, classes: `section ${s.status}`, position: pos[s.id] });
  }
  for (const a of snap.agents) {
    const silent = !a.leftAt && snap.now - a.lastSeen > SILENT_MS;
    want.set(`agent:${a.name}`, { group: 'nodes', data: { id: `agent:${a.name}` }, classes: `agent ${a.leftAt ? 'left' : ''} ${silent ? 'silent' : ''}`, position: pos[`agent:${a.name}`] });
    for (const h of a.holding) {
      const target = snap.sections.some((s) => s.id === h) ? h : h.split('|')[2];   // a handoff key: source|relation|target
      if (target) want.set(`claim:${a.name}:${h}`, { group: 'edges', data: { id: `claim:${a.name}:${h}`, source: `agent:${a.name}`, target }, classes: 'claim' });
    }
  }
  for (const h of snap.handoffs) {
    want.set(`ho:${h.key}`, { group: 'edges', data: { id: `ho:${h.key}`, source: h.source, target: h.target, relation: h.relation }, classes: `handoff ${h.status}` });
  }

  cy.batch(() => {
    cy.elements().forEach((el) => { if (!want.has(el.id())) el.remove(); });
    for (const [id, el] of want) {
      const existing = cy.getElementById(id);
      if (existing.nonempty()) { existing.classes(el.classes); if (el.position) existing.position(el.position); }
      else cy.add(el);
    }
  });
  // Label the agent nodes by name rather than the internal id.
  cy.nodes('.agent').forEach((n) => n.style('label', n.id().slice(6)));
  if (key !== laidOut) { cy.fit(undefined, 30); laidOut = key; }

  const count = (st) => snap.sections.filter((s) => s.status === st).length;
  const open = snap.handoffs.filter((h) => h.status === 'open' || h.status === 'claimed').length;
  $('counts').innerHTML = ['pending', 'claimed', 'done', 'failed'].map((st) => `<span class="${st}"><b>${count(st)}</b> ${st}</span>`).join('') +
    `<span class="ho"><b>${snap.handoffs.filter((h) => h.status === 'confirmed').length}</b>/${snap.handoffs.length} handoffs confirmed${open ? ` · ${open} open` : ''}</span>`;

  const doneBy = (name) => snap.sections.filter((s) => s.status === 'done' && s.claimedBy === name).length;
  $('agents').innerHTML = snap.agents.length ? snap.agents.map((a) => {
    const silent = !a.leftAt && snap.now - a.lastSeen > SILENT_MS;
    const state = a.leftAt ? 'left' : silent ? 'silent' : a.holding.length ? 'working' : 'idle';
    return `<div class="agent ${a.leftAt ? 'left' : ''} ${silent ? 'silent' : ''}">
      <div class="name">${esc(a.name)} <span class="state">${state}</span></div>
      <div class="holding">${a.holding.length ? '▸ ' + esc(a.holding.join(', ')) : '&nbsp;'}</div>
      <div class="meta">${esc(a.model)} · ${doneBy(a.name)} sections · ${a.findings} findings</div></div>`;
  }).join('') : '<div class="empty">no agents yet</div>';

  $('handoffs').innerHTML = snap.handoffs.length ? snap.handoffs.map((h) => `<div class="handoff ${h.status}">
      <div><span class="rel">${esc(h.relation)}</span> · ${esc(h.status)}</div>
      <div class="ids">${esc(h.source)} → ${esc(h.target)}</div>
      <div class="who">raised by ${esc(h.raisedBy)}${h.resolvedBy ? ` · ${h.status} by ${esc(h.resolvedBy)}` : ''}</div>
      ${h.reason ? `<div class="who">${esc(h.reason)}</div>` : ''}</div>`).join('') : '<div class="empty">none yet</div>';

  const fresh = new Set();
  $('events').innerHTML = snap.events.map((e) => {
    const id = `${e.at}|${e.kind}|${e.agent}|${e.section}`;
    if (!seenEvents.has(id)) fresh.add(id);
    return `<li class="${e.kind} ${seenEvents.size && !seenEvents.has(id) ? 'fresh' : ''}">
      <span class="t">${new Date(e.at).toTimeString().slice(0, 8)}</span><span class="k">${esc(e.kind)}</span>
      ${e.agent ? `<span class="a">${esc(e.agent)}</span>` : ''}${e.section ? `${esc(e.section)} ` : ''}<span>${esc(e.text)}</span></li>`;
  }).join('');
  fresh.forEach((id) => seenEvents.add(id));
}

async function showDetail(id) {
  const t = await fetch(`/api/trace/${encodeURIComponent(graphName)}/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : null);
  if (!t) return;
  const d = t.decision;
  const commit = (label, c) => `<div class="commit"><span class="sha">${esc(c.short)}</span> ${esc(label)} · ${esc(c.date.slice(0, 10))}<br>${esc(c.message.slice(0, 160))}<br>
    <span class="src">${esc(c.authors.join(', '))} · ${c.files.length} files</span></div>`;
  $('detail').innerHTML = `<button class="close" onclick="this.parentElement.hidden=true">✕</button>
    <h3>${esc(d.title)}</h3><div class="src">${esc(d.date ?? 'undated')} · ${esc(d.status)} · ${esc(d.source)}</div>
    ${t.recordedIn.map((c) => commit('recorded in', c)).join('')}${t.cites.map((c) => commit('cited', c)).join('')}
    ${t.mentions.length ? `<div class="src">mentions ${esc(t.mentions.join(', '))}</div>` : ''}
    ${t.supersedes.length ? `<div>supersedes ${t.supersedes.map((x) => esc(x.title)).join(', ')}</div>` : ''}
    ${t.supersededBy.length ? `<div>superseded by ${t.supersededBy.map((x) => esc(x.title)).join(', ')}</div>` : ''}`;
  $('detail').hidden = false;
}
cy.on('tap', 'node.section', (e) => showDetail(e.target.id()));

const STATIC = new URLSearchParams(location.search).has('static');   // one snapshot, no stream (screenshots)

function connectStream() {
  if (STATIC) {
    fetch(`/api/board/${encodeURIComponent(graphName)}`).then((r) => r.json()).then((snap) => { $('live').textContent = 'snapshot'; render(snap); });
    return;
  }
  source?.close();
  seenEvents = new Set(); laidOut = '';
  source = new EventSource(`/api/board/${encodeURIComponent(graphName)}/stream`);
  source.onmessage = (m) => { $('live').className = 'live on'; $('live').textContent = 'live'; render(JSON.parse(m.data)); };
  source.onerror = () => { $('live').className = 'live'; $('live').textContent = 'reconnecting…'; };
}

(async () => {
  const graphs = await fetch('/api/graphs').then((r) => r.json());
  $('graph').innerHTML = graphs.map((g) => `<option ${g.board ? '' : 'disabled'}>${esc(g.name)}</option>`).join('');
  graphName ??= (graphs.find((g) => g.board) ?? graphs[0])?.name;
  if (!graphName) { $('live').textContent = 'no graphs — run npm run ingest'; return; }
  $('graph').value = graphName;
  $('graph').onchange = () => { graphName = $('graph').value; history.replaceState(null, '', `?graph=${graphName}`); connectStream(); };
  connectStream();
})();

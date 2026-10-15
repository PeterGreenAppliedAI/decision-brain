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
      label: 'data(short)', 'font-size': 7, 'min-zoomed-font-size': 9, color: '#8b95a7', 'text-valign': 'bottom', 'text-margin-y': 3, 'font-family': 'monospace' } },
    { selector: 'node.section.claimed', style: { 'background-color': css('--claimed') } },
    { selector: 'node.section.done', style: { 'background-color': css('--done') } },
    { selector: 'node.section.failed', style: { 'background-color': css('--failed') } },
    { selector: 'node.section.rejected', style: { 'background-color': css('--pending'), 'border-width': 2, 'border-color': css('--failed') } },
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
let job = new URLSearchParams(location.search).get('job') === 'files' ? 'files' : 'board';
const jobQs = () => (job === 'files' ? '?job=files' : '');
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
  // Done, but nothing it found passed the code check (e.g. a summary naming code the file lacks).
  const rejected = new Set(snap.findings.filter((f) => f.total > 0 && f.verified === 0).map((f) => f.section));
  for (const s of snap.sections) {
    const label = job === 'files' ? (s.id.startsWith('dir:') ? s.id.slice(4).split('/').pop() + '/' : s.id.split('/').pop()) : (s.date ?? '').slice(5) || '—';
    want.set(s.id, { group: 'nodes', data: { id: s.id, short: label, title: s.title }, classes: `section ${s.status}${s.status === 'done' && rejected.has(s.id) ? ' rejected' : ''}`, position: pos[s.id] });
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
    (rejected.size ? `<span class="failed" title="done, but nothing it produced passed the code check"><b>${rejected.size}</b> rejected</span>` : '') +
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

  $('handoffs').innerHTML = snap.handoffs.length ? snap.handoffs.map((h) => `<div class="handoff ${h.status}" data-source="${esc(h.source)}">
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

const panel = (html) => { $('detail').innerHTML = `<button class="close" onclick="this.parentElement.hidden=true">✕</button>${html}`; $('detail').hidden = false; $('detail').scrollTop = 0; };
const askLink = (q) => `<a class="ask" href="/ask.html?graph=${encodeURIComponent(graphName)}&q=${encodeURIComponent(q)}">Ask: ${esc(q)} →</a>`;
const evidence = (ms, es, n = 6) =>
  (ms.length ? `<div class="ev"><b>measured</b>${ms.slice(0, n).map((m) => `<div title="${esc(m.quote)}">${esc(m.metric)} <span class="val">${esc(m.value)}</span></div>`).join('')}${ms.length > n ? `<div class="src">+${ms.length - n} more</div>` : ''}</div>` : '') +
  (es.length ? `<div class="ev"><b>tried</b>${es.map((e) => `<div title="${esc(e.quote)}">"${esc(e.hypothesis)}" — <span class="verdict ${esc(e.verdict)}">${esc(e.verdict)}</span></div>`).join('')}</div>` : '');
const focus = (id) => { const n = cy.getElementById(id); if (n.nonempty()) { cy.$(':selected').unselect(); n.select(); cy.animate({ center: { eles: n } }, { duration: 250 }); } };

// A decision tile: the entry, the commits behind it, and the evidence the agents extracted from it.
async function showDetail(id) {
  const [t, ev] = await Promise.all([
    fetch(`/api/trace/${encodeURIComponent(graphName)}/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : null),
    fetch(`/api/evidence/${encodeURIComponent(graphName)}/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : { measurements: [], experiments: [] }),
  ]);
  if (!t) return;
  const d = t.decision;
  const commit = (label, c) => `<div class="commit"><span class="sha">${esc(c.short)}</span> ${esc(label)} · ${esc(c.date.slice(0, 10))}<br>${esc(c.message.slice(0, 160))}<br>
    <span class="src">${esc(c.authors.join(', '))} · ${c.files.length} files</span></div>`;
  panel(`<h3>${esc(d.title)}</h3><div class="src">${esc(d.date ?? 'undated')} · ${esc(d.status)} · ${esc(d.source)}</div>
    ${evidence(ev.measurements, ev.experiments)}
    ${t.related.map((r) => `<div class="rel-line"><span class="rel">${esc(r.relation.replace('_', ' '))}</span> <a href="#" data-dec="${esc(r.id)}">${esc(r.title)}</a></div>`).join('')}
    ${t.recordedIn.map((c) => commit('recorded in', c)).join('')}${t.cites.map((c) => commit('cited', c)).join('')}
    ${t.mentions.length ? `<div class="src">names ${t.mentions.map(esc).join(', ')}</div>` : ''}
    ${askLink(`Why: ${d.title}`)}`);
}

// A file-summary tile: what it does now (model-written, from the code); for a file, the decisions that
// rest on it and where it came from; for a directory, its parts, each clickable.
async function showFile(id) {
  const r = await fetch(`/api/file/${encodeURIComponent(graphName)}/${encodeURIComponent(id)}`).then((x) => x.ok ? x.json() : null);
  if (!r) return;
  const now = r.now;
  const head = (path) => `<h3>${esc(path)}</h3>`;
  if (!now.purpose) return panel(`${head(id.replace(/^(file|dir):/, ''))}<div class="src">${r.rejected
    ? `no summary: the one written was rejected by the code check (${esc(r.rejected)}) — a summary that names code the file does not contain is not kept`
    : 'not summarized yet'}</div>${r.recheck?.length ? `<div class="ev"><b>decisions resting on it</b>${r.recheck.map((d) => `<div><a href="#" data-dec="${esc(d.id)}">${esc(d.title)}</a></div>`).join('')}</div>` : ''}`);
  const note = `<div class="src">summary of the code (model-written)${now.describesCommit ? ` at ${esc(now.describesCommit.slice(0, 7))}` : ''}${now.stale ? ` · <span class="stale">changed ${now.changedSince}× since — run sync</span>` : ''}</div>`;
  if (now.kind === 'directory') {
    const child = (p) => cy.getElementById(`dir:${p}`).nonempty() ? `dir:${p}` : `file:${p}`;
    const role = new Map((now.parts ?? []).map((x) => [x.name, x.role]));
    const items = now.contains.map((p) => { const nm = p.split('/').pop(); const cid = child(p);
      return `<div class="part"><a href="#" data-id="${esc(cid)}">${esc(nm)}${cid.startsWith('dir:') ? '/' : ''}</a> ${esc(role.get(nm) ?? role.get(nm + '/') ?? '')}</div>`; }).join('');
    panel(`${head(now.path === '.' ? '(repository root)' : now.path + '/')}${note}<p>${esc(now.purpose)}</p><div class="ev"><b>parts</b>${items}</div>`);
  } else {
    const dec = (d) => `<div class="dec"><a href="#" data-dec="${esc(d.id)}">${esc(d.title)}</a> <span class="src">${esc(d.date ?? 'undated')} · ${esc(d.status)} · via ${esc((d.via ?? []).join(', '))}</span>${evidence(d.measurements ?? [], d.experiments ?? [], 3)}</div>`;
    panel(`${head(now.path)}${note}<p>${esc(now.purpose)}</p>
      ${(now.responsibilities ?? []).length ? `<div class="ev"><b>does</b>${now.responsibilities.map((x) => `<div>${esc(x.text)}</div>`).join('')}</div>` : ''}
      <div class="ev"><b>decisions resting on it</b>${r.recheck.length ? r.recheck.map(dec).join('') : '<div class="src">none recorded</div>'}</div>
      ${r.history.length ? `<div class="ev"><b>settled history</b>${r.history.map(dec).join('')}</div>` : ''}
      ${r.birth ? `<div class="ev"><b>born</b><div class="commit"><span class="sha">${esc(r.birth.short)}</span> ${esc(r.birth.date.slice(0, 10))} · ${esc(r.birth.authors.join(', '))}<br>${esc(r.birth.message.slice(0, 160))}</div>${r.bornWith.length ? `<div class="src">recorded with it: ${r.bornWith.map((d) => esc(d.title)).join(', ')}</div>` : ''}</div>` : ''}
      ${askLink(`Why is ${now.path} the way it is?`)}`);
  }
}
$('detail').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-id], a[data-dec]');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.id) { focus(a.dataset.id); showFile(a.dataset.id); }
  else showDetail(a.dataset.dec);   // its tile is on the decisions board; the panel works from either
});
cy.on('tap', 'node.section', (e) => (job === 'files' ? showFile : showDetail)(e.target.id()));
cy.on('mouseover', 'node.section', (e) => { $('hover').textContent = e.target.data('title') ?? ''; });
cy.on('mouseout', 'node.section', () => { $('hover').textContent = ''; });
// A handoff card opens the entry that raised it.
$('handoffs').addEventListener('click', (e) => { const h = e.target.closest('.handoff[data-source]'); if (h) { focus(h.dataset.source); showDetail(h.dataset.source); } });

const STATIC = new URLSearchParams(location.search).has('static');   // one snapshot, no stream (screenshots)

function connectStream() {
  if (STATIC) {
    fetch(`/api/board/${encodeURIComponent(graphName)}${jobQs()}`).then((r) => r.json()).then((snap) => { $('live').textContent = 'snapshot'; render(snap); });
    return;
  }
  source?.close();
  seenEvents = new Set(); laidOut = '';
  source = new EventSource(`/api/board/${encodeURIComponent(graphName)}/stream${jobQs()}`);
  source.onmessage = (m) => { $('live').className = 'live on'; $('live').textContent = 'live'; render(JSON.parse(m.data)); };
  source.onerror = () => { $('live').className = 'live'; $('live').textContent = 'reconnecting…'; };
}

(async () => {
  const all = await fetch('/api/graphs').then((r) => r.json());
  const graphs = all.filter((g) => !g.demo || g.name === graphName);   // demo copies only when the URL names one
  // One entry per board: the decision-extraction board and the file-summary board of each graph.
  const opts = graphs.flatMap((g) => [
    ...(g.board ? [{ v: `${g.name}|board`, label: `${g.name}${g.demo ? ' (demo copy)' : ''} · decisions` }] : []),
    ...(g.files ? [{ v: `${g.name}|files`, label: `${g.name}${g.demo ? ' (demo copy)' : ''} · file summaries` }] : []),
  ]);
  $('graph').innerHTML = opts.map((o) => `<option value="${esc(o.v)}">${esc(o.label)}</option>`).join('');
  if (!graphName) [graphName, job] = (opts[0]?.v ?? '|board').split('|');
  if (!graphName) { $('live').textContent = 'no boards yet — run npm run team or npm run summarize'; return; }
  $('graph').value = `${graphName}|${job}`;
  const demoBanner = () => { $('demo').hidden = !all.find((g) => g.name === graphName)?.demo; };
  demoBanner();
  $('graph').addEventListener('change', demoBanner);
  $('graph').onchange = () => { [graphName, job] = $('graph').value.split('|'); history.replaceState(null, '', `?graph=${graphName}${job === 'files' ? '&job=files' : ''}`); connectStream(); };
  connectStream();
})();

// The Ask view: a question, the agent's tool calls as they happen, the answer with its citations,
// and the path behind it — the cited subgraph, read from the graph.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const EXAMPLES = {
  invarail: [
    "Why does the router prompt keep a rule that's factually wrong about memory?",
    'Why was the handoff tool removed the same night it was built?',
    'If I change src/router/prompt.ts, what should I re-check?',
    'If I change src/memory/fact-store.ts, what decisions should I re-check?',
    'What has been tried and disproven about memory?',
  ],
  log4brains: [
    'Why does log4brains identify an ADR by its slug instead of a number?',
    'What branching strategy does the project use, and why did it change?',
    'Why did the team choose Kubernetes?',
  ],
  'content-publisher': [
    'Why can content now be deleted when the database used to restrict deletion?',
    'Who should review a change to app/models/edition.rb?',
    'How is political tagging decided?',
  ],
};

const KIND = {
  decision: { color: '--k-decision', shape: 'round-rectangle', w: 46, h: 30 },
  commit: { color: '--k-commit', shape: 'ellipse', w: 26, h: 26 },
  file: { color: '--k-file', shape: 'rectangle', w: 30, h: 22 },
  measurement: { color: '--k-measurement', shape: 'diamond', w: 26, h: 26 },
  experiment: { color: '--k-experiment', shape: 'triangle', w: 28, h: 26 },
};

const cy = cytoscape({
  container: $('cy'), wheelSensitivity: 0.3, maxZoom: 1.6,
  style: [
    ...Object.entries(KIND).map(([k, v]) => ({ selector: `node.${k}`, style: {
      shape: v.shape, width: v.w, height: v.h, 'background-color': css(v.color) } })),
    { selector: 'node', style: { label: 'data(short)', color: css('--text'), 'font-size': 9, 'font-family': 'monospace',
      'text-wrap': 'wrap', 'text-max-width': 110, 'text-valign': 'bottom', 'text-margin-y': 4, 'min-zoomed-font-size': 8 } },
    { selector: 'node.decision', style: { 'font-size': 11, 'text-max-width': 170, 'min-zoomed-font-size': 0 } },
    { selector: 'node.cited', style: { 'border-width': 2, 'border-color': '#ffffff' } },
    { selector: 'node.hi', style: { 'border-width': 4, 'border-color': css('--claimed') } },
    { selector: 'edge', style: { width: 1.5, 'line-color': '#3b4556', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle',
      'target-arrow-color': '#3b4556', 'font-size': 7, color: css('--dim'), 'font-family': 'monospace',
      'text-background-color': '#0b0e14', 'text-background-opacity': 1, 'text-rotation': 'autorotate' } },
    { selector: 'edge.rel', style: { label: 'data(type)', 'font-size': 9, 'line-color': css('--handoff'), 'target-arrow-color': css('--handoff'), width: 2.5, color: css('--handoff') } },
  ],
});

let graphName = new URLSearchParams(location.search).get('graph');
let source = null;

const short = (n) => n.kind === 'decision' ? n.label.slice(0, 48) + (n.label.length > 48 ? '…' : '')
  : n.kind === 'file' ? n.label.split('/').slice(-2).join('/') : n.label.slice(0, 40);

function drawPath(path) {
  cy.elements().remove();
  $('empty').hidden = path.nodes.length > 0;
  cy.add(path.nodes.map((n) => ({ group: 'nodes', data: { id: n.id, short: short(n), node: n }, classes: `${n.kind} ${n.cited ? 'cited' : ''}` })));
  cy.add(path.edges.map((e, i) => ({ group: 'edges', data: { id: `e${i}`, source: e.source, target: e.target, type: e.type.toLowerCase() },
    classes: ['SUPERSEDES', 'REVISES', 'DISPROVES'].includes(e.type) ? 'rel' : '' })));
  // Rings: decisions at the centre, then the commits and files they rest on, then their evidence.
  const RING = { decision: 3, commit: 2, file: 2, measurement: 1, experiment: 1 };
  cy.layout({ name: 'concentric', concentric: (n) => RING[n.data('node').kind] ?? 1, levelWidth: () => 1,
    minNodeSpacing: 34, spacingFactor: 1.1, padding: 30, startAngle: -Math.PI / 2 }).run();
  cy.fit(undefined, 40);
}

function renderAnswer(text, grounding) {
  const valid = new Set(grounding.valid);
  const html = esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\s][^\]]{1,200})\]/g, (_, c) => `<span class="cite ${valid.has(c) ? 'ok' : 'bad'}" data-c="${esc(c)}">${esc(c.length > 34 ? c.slice(0, 32) + '…' : c)}</span>`)
    .split('\n').map((l) => /^\s*[-*] /.test(l) ? `<li>${l.replace(/^\s*[-*] /, '')}</li>` : /^\s*\d+\. /.test(l) ? `<li>${l.replace(/^\s*\d+\. /, '')}</li>` : l ? `<p>${l}</p>` : '').join('');
  // Three labels, each claiming only what code checked.
  const g = grounding;
  const badge = `<div class="checks">
    <span class="badge ${g.invalid.length ? 'bad' : 'ok'}" title="Each [id] names something a tool returned in this run">${g.invalid.length ? `invalid citation: ${esc(g.invalid.join(', '))}` : `${g.valid.length} citation${g.valid.length === 1 ? '' : 's'} checked`}</span>
    <span class="badge ${g.unsupportedNumbers.length ? 'bad' : 'ok'}" title="Each figure appears in the evidence its citation brought">${g.unsupportedNumbers.length ? `unsupported: ${esc(g.unsupportedNumbers.map((u) => u.number).join(', '))}` : `${g.numbersChecked} figure${g.numbersChecked === 1 ? '' : 's'} matched to evidence`}</span>
    ${(g.premiseFigures ?? []).length ? `<span class="badge neutral" title="Repeated from the question; code cannot tell rejection from endorsement">unverified: ${esc(g.premiseFigures.map((u) => u.number).join(', '))}</span>` : ''}
    ${g.declined ? '<span class="badge ok">abstained</span>' : '<span class="badge neutral" title="Code has not verified the wording">prose: model-written</span>'}
  </div>`;
  return `${badge}<div class="text">${html}</div>`;
}

async function showDetail(n) {
  if (n.kind === 'decision') {
    const [t, ev] = await Promise.all([
      fetch(`/api/trace/${encodeURIComponent(graphName)}/${encodeURIComponent(n.id)}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/evidence/${encodeURIComponent(graphName)}/${encodeURIComponent(n.id)}`).then((r) => r.ok ? r.json() : { measurements: [], experiments: [] }),
    ]);
    if (!t) return;
    const evidence = (ev.measurements.length ? `<div class="ev"><b>measured</b>${ev.measurements.slice(0, 8).map((m) => `<div title="${esc(m.quote)}">${esc(m.metric)} <span class="val">${esc(m.value)}</span></div>`).join('')}</div>` : '') +
      (ev.experiments.length ? `<div class="ev"><b>tried</b>${ev.experiments.map((x) => `<div title="${esc(x.quote)}">"${esc(x.hypothesis)}" — <span class="verdict ${esc(x.verdict)}">${esc(x.verdict)}</span></div>`).join('')}</div>` : '');
    $('detail').innerHTML = `<button class="close" onclick="this.parentElement.hidden=true">✕</button>
      <h3>${esc(t.decision.title)}</h3><div class="src">${esc(t.decision.date ?? 'undated')} · ${esc(t.decision.status)} · ${esc(t.decision.source)}</div>
      ${evidence}${t.related.map((r) => `<div class="rel-line"><b>${esc(r.relation.replace('_', ' '))}</b> ${esc(r.title)}${r.quote ? `<br><span class="src">“${esc(r.quote.slice(0, 160))}”</span>` : ''}</div>`).join('')}
      <pre class="body">${esc(t.text)}</pre>`;
  } else {
    $('detail').innerHTML = `<button class="close" onclick="this.parentElement.hidden=true">✕</button>
      <h3>${esc(n.kind)}: ${esc(n.label)}</h3>${n.detail ? `<div class="src">${esc(n.detail)}</div>` : ''}`;
  }
  $('detail').hidden = false;
}
cy.on('tap', 'node', (e) => showDetail(e.target.data('node')));
cy.on('mouseover', 'node', (e) => { const n = e.target.data('node'); $('hover').textContent = `${n.kind}: ${n.label}${n.detail ? ` — ${n.detail}` : ''}`; });
cy.on('mouseout', 'node', () => { $('hover').textContent = ''; });

function highlight(c) {
  cy.nodes().removeClass('hi');
  const hit = cy.nodes().filter((n) => n.id() === c || (/^[0-9a-f]{7,40}$/.test(c) && n.id().startsWith(c)));
  hit.addClass('hi');
  if (hit.nonempty()) { cy.animate({ center: { eles: hit }, duration: 300 }); showDetail(hit[0].data('node')); }
}
$('answer').addEventListener('click', (e) => { const c = e.target.closest('.cite'); if (c) highlight(c.dataset.c); });

function askQuestion(q) {
  source?.close();
  $('steps').innerHTML = ''; $('answer').hidden = false; $('detail').hidden = true;
  $('answer').innerHTML = '<div class="thinking">walking the graph…</div>';
  $('status').className = 'live on'; $('status').textContent = 'asking (local model)';
  $('go').disabled = true;
  const t0 = Date.now();
  source = new EventSource(`/api/ask/${encodeURIComponent(graphName)}/stream?q=${encodeURIComponent(q)}`);
  source.addEventListener('step', (m) => {
    const s = JSON.parse(m.data);
    const li = document.createElement('li');
    li.className = `fresh ${s.error ? 'err' : ''}`;
    li.innerHTML = `<span class="t">+${((Date.now() - t0) / 1000).toFixed(1)}s</span><b>${esc(s.tool)}</b>(${esc(Object.values(s.args).join(', '))})
      <div class="meta">${s.chars} chars ${s.error ? '· error' : ''}</div>`;
    $('steps').appendChild(li);
  });
  source.addEventListener('answer', (m) => {
    const a = JSON.parse(m.data);
    $('answer').innerHTML = renderAnswer(a.answer || '(no answer)', a.grounding) + `<div class="meta">${(a.ms / 1000).toFixed(1)} s · ${a.path.nodes.length} nodes in the path</div>`;
    drawPath(a.path);
    done();
  });
  source.addEventListener('error', (m) => {
    const msg = m.data ? JSON.parse(m.data).message : 'connection lost';
    $('answer').innerHTML = `<span class="badge bad">error</span><p>${esc(msg)}</p>`;
    done();
  });
  function done() { source.close(); $('go').disabled = false; $('status').className = 'live'; $('status').textContent = 'ready'; }
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); const q = $('q').value.trim(); if (q) askQuestion(q); });
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form').requestSubmit(); } });

function showExamples() {
  $('examples').innerHTML = (EXAMPLES[graphName] ?? EXAMPLES[graphName.replace(/-demo$/, '')] ?? []).map((q) => `<button class="ex">${esc(q)}</button>`).join('');
  $('examples').querySelectorAll('.ex').forEach((b) => b.addEventListener('click', () => { $('q').value = b.textContent; askQuestion(b.textContent); }));
}

(async () => {
  const all = await fetch('/api/graphs').then((r) => r.json());
  // Demo copies only when the URL names one.
  const graphs = all.filter((g) => !g.demo || g.name === graphName);
  $('graph').innerHTML = graphs.map((g) => `<option value="${esc(g.name)}">${esc(g.name)}${g.demo ? ' (demo copy)' : ''}</option>`).join('');
  if (!graphs.some((g) => g.name === graphName)) graphName = graphs[0]?.name;
  const demoBanner = () => { $('demo').hidden = !all.find((g) => g.name === graphName)?.demo; };
  demoBanner();
  $('graph').addEventListener('change', demoBanner);
  $('graph').value = graphName;
  $('graph').onchange = () => {
    graphName = $('graph').value; history.replaceState(null, '', `?graph=${graphName}`);
    // Nothing from the previous graph stays on screen.
    source?.close(); $('answer').hidden = true; $('steps').innerHTML = ''; $('detail').hidden = true; cy.elements().remove(); $('empty').hidden = false;
    $('go').disabled = false; $('status').className = 'live'; $('status').textContent = 'ready';
    showExamples();
  };
  showExamples();
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('q').value = q; askQuestion(q); }
})();

// The Review view: a repository's commits, the review packet for one — the decisions it rests on, what was
// tried and disproven, what is superseded, who knows the files — and, with local actions on, sync and the
// demo's scripted steps.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, opts) => fetch(path, opts).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));
const post = (path) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

let graphName = new URLSearchParams(location.search).get('graph');
let selected = new URLSearchParams(location.search).get('commit');
let all = [];

const setUrl = () => history.replaceState(null, '', `?graph=${encodeURIComponent(graphName)}${selected ? `&commit=${selected}` : ''}`);
const links = () => {
  $('nav-board').href = `/?graph=${encodeURIComponent(graphName)}`;
  $('nav-ask').href = `/ask.html?graph=${encodeURIComponent(graphName)}`;
  $('watch').href = `/?graph=${encodeURIComponent(graphName)}`;
};

async function loadCommits() {
  const { ok, body } = await api(`/api/commits/${encodeURIComponent(graphName)}`);
  $('commits').innerHTML = ok ? body.map((c) => `<li data-sha="${esc(c.sha)}" class="${c.sha.startsWith(selected ?? '-') ? 'on' : ''}">
      <span class="sha">${esc(c.short)}</span> <span class="msg">${esc(c.subject)}</span>
      <div class="src">${esc(c.author)} · ${esc(c.date.slice(0, 16).replace('T', ' '))}</div></li>`).join('')
    : `<li class="src">${esc(body.error ?? 'no repository known for this graph')}</li>`;
}
$('commits').addEventListener('click', (e) => { const li = e.target.closest('li[data-sha]'); if (li) select(li.dataset.sha); });

let showing = 0;   // only the latest selection may render: an older, slower review must not replace it
async function select(sha) {
  const mine = ++showing;
  selected = sha; setUrl();
  document.querySelectorAll('#commits li').forEach((li) => li.classList.toggle('on', li.dataset.sha.startsWith(sha)));   // a job reports a short sha
  $('packet').innerHTML = '<div class="thinking">reviewing…</div>';
  $('detail').hidden = true;
  const [p, d] = await Promise.all([api(`/api/review/${encodeURIComponent(graphName)}/${sha}`), api(`/api/diff/${encodeURIComponent(graphName)}/${sha}`)]);
  if (mine !== showing) return;
  $('packet').innerHTML = p.ok ? render(p.body, d.ok ? d.body : null) : `<span class="badge bad">error</span> ${esc(p.body.error)}`;
}

const few = (xs, n, f) => xs.slice(0, n).map(f).join('') + (xs.length > n ? `<div class="src">+${xs.length - n} more</div>` : '');
const dec = (d, replaced = false) => `<a href="#" data-dec="${esc(d.id)}" class="dtitle">${esc(d.title)}</a>
  <span class="src">${esc(d.date ?? 'undated')} · ${replaced && d.status !== 'superseded' ? 'superseded by a later entry' : esc(d.statusThen && d.statusThen !== d.status ? `${d.statusThen} then, ${d.status} now` : d.status)} · ${esc(d.source)}</span>`;

function render(p, d) {
  const c = p.change;
  const items = (k) => p.items.filter((i) => i.kind === k);
  const card = (i, body) => `<div class="card k-${i.kind}"><span class="tag">${esc(i.id)}</span>${body}</div>`;
  const section = (k, title, hint, f) => items(k).length ? `<h2>${title}</h2>${hint ? `<div class="src hint">${hint}</div>` : ''}${items(k).map((i) => card(i, f(i))).join('')}` : '';
  const diffHtml = d ? `<details class="diff" open><summary>The change — ${esc((d.patch.match(/^ \S.*\|/gm) ?? []).length || c.files.length)} file(s)</summary>
      <pre>${esc(d.patch).split('\n').map((l) => /^\+(?!\+\+)/.test(l) ? `<span class="add">${l}</span>` : /^-(?!--)/.test(l) ? `<span class="del">${l}</span>` : l).join('\n')}${d.cut ? '\n…' : ''}</pre></details>` : '';
  const basis = p.basis.method === 'log-at-commit'
    ? `Decision log rebuilt as it stood at this commit (${p.basis.entriesThen} entries${p.basis.editedSince ? `; ${p.basis.editedSince} edited since — their extracted evidence left out` : ''})`
    : 'Approximate: decisions filtered by date, not rebuilt from the log at this commit';
  return `<div class="phead"><h1>${esc(c.message?.split('\n')[0] ?? c.ref)}</h1>
      <div class="src"><span class="sha">${esc((c.sha ?? c.ref).slice(0, 7))}</span> · ${esc(c.authors.join(', '))} · ${c.files.length} file(s): ${esc(c.files.join(', '))}${p.asOf ? ` · as of ${esc(p.asOf)}` : ''}</div>
      <div class="src">${basis} · graph ${esc(p.basis.fingerprint)}</div></div>
    ${diffHtml}
    ${section('records', 'Decisions this change records', '', (i) => dec(i.decision) + measured(i.measurements))}
    ${section('recheck', 'Standing decisions this change rests on — re-check', 'Decisions whose reasoning rests on the files this change touches.', (i) => `<div class="file">${esc(i.file)}</div>${dec(i.decision)}${measured(i.measurements)}`)}
    ${section('disproven', 'Tried before and disproven — do not retry', '', (i) => `<div class="hyp">“${esc(i.experiment.hypothesis)}”</div><div class="src">from ${dec(i.decision)}</div>`)}
    ${section('superseded', 'Superseded reasoning — do not cite', '', (i) => `${dec(i.decision, (i.supersededBy ?? []).length > 0)}${(i.supersededBy ?? []).length ? `<div class="src">replaced by ${i.supersededBy.map((s) => `<a href="#" data-dec="${esc(s.id)}">${esc(s.title)}</a>`).join(', ')}</div>` : ''}${(i.triedThen ?? []).length ? `<div class="src">it had found disproven (history, not a current warning): ${i.triedThen.map((e) => `“${esc(e.hypothesis)}”`).join('; ')}</div>` : ''}`)}
    ${section('reviewer', 'Who knows these files', '', (i) => `<b>${esc(i.reviewer.name)}</b> <span class="src">— ${i.reviewer.commits} commits on ${esc(i.reviewer.files.join(', '))}</span>`)}
    ${p.items.length ? '' : '<div class="src">The graph holds no decisions about these files.</div>'}`;
}
const measured = (ms) => (ms ?? []).length ? `<div class="ev"><b>measured</b>${few(ms, 4, (m) => `<div title="${esc(m.quote)}">${esc(m.metric)} <span class="val">${esc(m.value)}</span></div>`)}</div>` : '';

// A decision, opened from the packet: its evidence, relations and source.
$('packet').addEventListener('click', (e) => { const a = e.target.closest('a[data-dec]'); if (a) { e.preventDefault(); showDecision(a.dataset.dec); } });
$('detail').addEventListener('click', (e) => { const a = e.target.closest('a[data-dec]'); if (a) { e.preventDefault(); showDecision(a.dataset.dec); } });
async function showDecision(id) {
  const [t, ev] = await Promise.all([api(`/api/trace/${encodeURIComponent(graphName)}/${encodeURIComponent(id)}`), api(`/api/evidence/${encodeURIComponent(graphName)}/${encodeURIComponent(id)}`)]);
  if (!t.ok) return;
  const d = t.body.decision, m = ev.ok ? ev.body : { measurements: [], experiments: [] };
  $('detail').innerHTML = `<button class="close" onclick="this.parentElement.hidden=true">✕</button>
    <h3>${esc(d.title)}</h3><div class="src">${esc(d.date ?? 'undated')} · ${esc(d.status)} · ${esc(d.source)}</div>
    ${m.measurements.length ? `<div class="ev"><b>measured</b>${m.measurements.map((x) => `<div title="${esc(x.quote)}">${esc(x.metric)} <span class="val">${esc(x.value)}</span></div>`).join('')}</div>` : ''}
    ${m.experiments.length ? `<div class="ev"><b>tried</b>${m.experiments.map((x) => `<div title="${esc(x.quote)}">“${esc(x.hypothesis)}” — <span class="verdict ${esc(x.verdict)}">${esc(x.verdict)}</span></div>`).join('')}</div>` : ''}
    ${t.body.related.map((r) => `<div class="rel-line"><span class="rel">${esc(r.relation.replace('_', ' '))}</span> <a href="#" data-dec="${esc(r.id)}">${esc(r.title)}</a></div>`).join('')}
    <pre class="body">${esc(t.body.text)}</pre>`;
  $('detail').hidden = false; $('detail').scrollTop = 0;
}

// Local actions: sync and the demo steps, one job at a time; the panel follows the job.
async function act(path) {
  const { ok, body } = await post(path);
  if (!ok) { $('job').innerHTML = `<div class="stale">${esc(body.error)}</div>`; return; }
  onJob(body.job);                                           // a demo step is already done in this reply
  if (!stream || stream.readyState === 2) connectJobs();   // the stream reports progress and the finish
}
$('sync').onclick = () => act(`/api/sync/${encodeURIComponent(graphName)}`);
document.querySelectorAll('.step').forEach((b) => b.onclick = () => act(`/api/demo/${encodeURIComponent(graphName)}/${b.dataset.step}`));

// Job progress arrives as a stream: it keeps flowing while this tab is in the background (timers there
// are throttled), so the review is up to date the moment you come back.
let lastJob = null;
// The demo steps run once each, in order: done ones get a tick, only the next one is enabled.
let demoSteps = null, running = false;
async function loadDemoState() {
  const d = await api(`/api/demo/${encodeURIComponent(graphName)}`).then((r) => r.body);
  demoSteps = d.state;
  paintSteps();
}
function paintSteps() {
  const order = ['propose', 'record', 'resubmit'];
  const next = demoSteps ? order.find((s) => !demoSteps[s]) : null;
  document.querySelectorAll('.step').forEach((b) => {
    const s = b.dataset.step;
    b.classList.toggle('done', Boolean(demoSteps?.[s]));
    b.classList.toggle('next', s === next);
    b.disabled = running || (s !== 'reset' && s !== next);
  });
  $('sync').disabled = running;
}
function onJob(j) {
  if (!j) return;
  const secs = (((j.endedAt ?? Date.now()) - j.startedAt) / 1000).toFixed(0);
  $('job').innerHTML = `<div class="ev"><b>${esc(j.what)} — ${j.state === 'running' ? `running · ${secs} s` : `${esc(j.state)} · ${secs} s`}</b>
    ${j.error ? `<div class="stale">${esc(j.error)}</div>` : ''}<pre class="body">${esc(j.log.slice(-6).join('\n'))}</pre></div>`;
  running = j.state === 'running'; paintSteps();
  $('status').className = j.state === 'running' ? 'live on' : 'live';
  $('status').textContent = j.state === 'running' ? j.what : 'ready';
  // A job finished: one we saw running, or a new one that was already over when we heard of it (steps are instant).
  const finished = j.state !== 'running' && (!lastJob || lastJob.startedAt !== j.startedAt || lastJob.state === 'running');
  lastJob = j;
  if (finished && j.graph === graphName) afterJob(j);
}
async function afterJob(j) {
  await Promise.all([loadCommits(), loadDemoState()]);
  if (j.what.startsWith('demo reset')) {
    selected = null; setUrl();
    $('packet').innerHTML = '<div class="empty-canvas static">Demo reset. Start with step 1.</div>';
  } else if (j.result?.sha) await select(j.result.sha);                 // a new commit: review it
  else if (selected && j.state === 'done') {                              // after sync: the review may change
    await select(selected);
    $('packet').insertAdjacentHTML('afterbegin', `<div class="updated">↻ Review updated after sync — ${esc(j.log.at(-1) ?? '')}</div>`);
  }
}
let stream = null;
function connectJobs() {
  stream?.close();
  stream = new EventSource('/api/action/stream');
  stream.onmessage = (m) => onJob(JSON.parse(m.data).job);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && (!stream || stream.readyState === 2)) connectJobs(); });

(async () => {
  all = await api('/api/graphs').then((r) => r.body);
  const graphs = all.filter((g) => !g.demo || g.name === graphName);   // demo copies only when the link names one
  $('graph').innerHTML = graphs.map((g) => `<option value="${esc(g.name)}">${esc(g.name)}${g.demo ? ' (demo copy)' : ''}</option>`).join('');
  if (!graphs.some((g) => g.name === graphName)) graphName = graphs[0]?.name;
  $('graph').value = graphName;
  const show = async () => {
    const g = all.find((x) => x.name === graphName);
    $('demo').hidden = !g?.demo;
    const action = await api('/api/action').then((r) => r.body);
    $('actions').hidden = !action.enabled;
    $('demo-actions').hidden = !(action.enabled && g?.demo);
    if (action.enabled && g?.demo) await loadDemoState();
    links(); await loadCommits();
    if (selected) await select(selected); else $('packet').innerHTML = '<div class="empty-canvas static">Pick a commit to review it against the decisions it touches.</div>';
    lastJob = action.job; connectJobs();
  };
  $('graph').onchange = () => { graphName = $('graph').value; selected = null; setUrl(); show(); };
  await show();
})();

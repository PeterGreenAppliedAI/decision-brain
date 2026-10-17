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
let polling = null;

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

async function select(sha) {
  selected = sha; setUrl();
  document.querySelectorAll('#commits li').forEach((li) => li.classList.toggle('on', li.dataset.sha === sha));
  $('packet').innerHTML = '<div class="thinking">reviewing…</div>';
  $('detail').hidden = true;
  const [p, d] = await Promise.all([api(`/api/review/${encodeURIComponent(graphName)}/${sha}`), api(`/api/diff/${encodeURIComponent(graphName)}/${sha}`)]);
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
  follow();
}
$('sync').onclick = () => act(`/api/sync/${encodeURIComponent(graphName)}`);
document.querySelectorAll('.step').forEach((b) => b.onclick = () => act(`/api/demo/${encodeURIComponent(graphName)}/${b.dataset.step}`));

async function follow() {
  clearInterval(polling);
  const tick = async () => {
    const { body } = await api('/api/action');
    const j = body.job;
    if (!j) return false;
    const secs = (((j.endedAt ?? Date.now()) - j.startedAt) / 1000).toFixed(0);
    $('job').innerHTML = `<div class="ev"><b>${esc(j.what)} — ${j.state === 'running' ? `running · ${secs} s` : `${esc(j.state)} · ${secs} s`}</b>
      ${j.error ? `<div class="stale">${esc(j.error)}</div>` : ''}<pre class="body">${esc(j.log.slice(-6).join('\n'))}</pre></div>`;
    document.querySelectorAll('.act').forEach((b) => b.disabled = j.state === 'running');
    $('status').className = j.state === 'running' ? 'live on' : 'live';
    $('status').textContent = j.state === 'running' ? j.what : 'ready';
    if (j.state !== 'running') {
      clearInterval(polling); polling = null;
      if (j.graph === graphName) {
        await loadCommits();
        if (j.result?.sha) await select(j.result.sha);                 // a new commit: review it
        else if (selected && j.state === 'done') await select(selected); // after sync: the review may change
        if (j.what.startsWith('demo reset')) { selected = null; setUrl(); $('packet').innerHTML = '<div class="empty-canvas static">Demo reset. Pick a commit, or start with step 1.</div>'; }
      }
    }
    return j.state === 'running';
  };
  if (await tick()) polling = setInterval(tick, 1500);
}

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
    links(); await loadCommits();
    if (selected) await select(selected); else $('packet').innerHTML = '<div class="empty-canvas static">Pick a commit to review it against the decisions it touches.</div>';
    if (action.job?.state === 'running') follow();
  };
  $('graph').onchange = () => { graphName = $('graph').value; selected = null; setUrl(); show(); };
  await show();
})();

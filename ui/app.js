// Sohbet çekirdeği: mesaj akışı, araç zaman çizelgesi, izin kartları, ekler, orb durumu.
const log = $('log'), input = $('input');
const TOOL_ICONS = {
  Read: '📖', Edit: '✏️', Write: '📝', MultiEdit: '✏️', NotebookEdit: '📓', Bash: '⌨️', PowerShell: '⌨️',
  Grep: '🔎', Glob: '🗂️', WebSearch: '🌐', WebFetch: '🌐', Agent: '🤖', Task: '🤖', Skill: '✦',
  TodoWrite: '☑️', ToolSearch: '🧰', AskUserQuestion: '❓', Artifact: '🖼️',
};

let bot = null, buf = '', raf = 0, busy = false, apiKey = false;
let steps = null;          // aktif araç grubu
const tools = new Map();   // tool_use id -> { row, t0 }
let attachments = [];      // { kind: 'image'|'file', name, data?, mediaType?, path?, thumb? }

const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 140;
const scroll = (force) => { if (force || nearBottom()) log.scrollTop = log.scrollHeight; };

function add(cls, html) {
  $('empty')?.remove();
  const el = document.createElement('div');
  el.className = cls;
  if (html != null) el.innerHTML = html;
  log.appendChild(el);
  scroll();
  return el;
}

// ---- Orb: idle / thinking / speaking ----
function orb(state) {
  for (const o of document.querySelectorAll('.orb')) o.dataset.state = state;
  document.body.dataset.state = state;
}

function setBusy(b) {
  busy = b;
  $('stop').hidden = !b;
  $('go').hidden = b;
  orb(b ? 'thinking' : 'idle');
}

// ---- Markdown + kod ----
marked.setOptions({ gfm: true, breaks: true });

function decorateCode(root) {
  root.querySelectorAll('pre > code').forEach((code) => {
    if (code.dataset.done) return;
    code.dataset.done = '1';
    try { hljs.highlightElement(code); } catch {}
    const pre = code.parentElement;
    const lang = [...code.classList].find((c) => c.startsWith('language-'))?.slice(9) ?? '';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    bar.innerHTML = `<span>${esc(lang || 'kod')}</span><button class="copy">Kopyala</button>`;
    bar.querySelector('button').onclick = (e) => {
      navigator.clipboard.writeText(code.innerText);
      e.target.textContent = 'Kopyalandı ✓';
      setTimeout(() => (e.target.textContent = 'Kopyala'), 1400);
    };
    pre.prepend(bar);
  });
}

function render() {
  raf = 0;
  if (!bot) return;
  bot.querySelector('.body').innerHTML = marked.parse(buf);
  scroll();
}

function botMsg() {
  const el = add('msg bot', `<div class="avatar"><div class="orb xs"><span></span></div></div><div class="body"></div>`);
  return el;
}

function endText() {
  if (raf) { cancelAnimationFrame(raf); render(); }
  if (bot) decorateCode(bot);
  bot = null;
  buf = '';
}

// ---- Araç zaman çizelgesi ----
function toolSummary(name, i = {}) {
  const v = i.command ?? i.file_path ?? i.pattern ?? i.path ?? i.url ?? i.query ?? i.description ?? i.skill ?? i.prompt ?? '';
  return String(v).split('\n')[0];
}

function closeSteps() {
  if (!steps) return;
  steps.el.open = false;
  steps = null;
}

function addTool(id, name, inp) {
  endText();
  if (!steps) {
    const el = add('steps');
    el.innerHTML = `<details open><summary><span class="spin"></span><span class="lbl">Çalışıyor…</span><span class="cnt"></span></summary><div class="rows"></div></details>`;
    steps = { el: el.querySelector('details'), rows: el.querySelector('.rows'), n: 0, t0: performance.now(), wrap: el };
  }
  steps.n++;
  const row = document.createElement('div');
  row.className = 'step running';
  row.innerHTML = `<span class="ic">${TOOL_ICONS[name] ?? '⚙️'}</span><b>${esc(name)}</b><span class="arg">${esc(toolSummary(name, inp))}</span><span class="dur"></span>`;
  steps.rows.appendChild(row);
  steps.el.querySelector('.cnt').textContent = `${steps.n} adım`;
  tools.set(id, { row, t0: performance.now(), group: steps });
  scroll();
}

function toolDone(id, error) {
  const t = tools.get(id);
  if (!t) return;
  t.row.classList.remove('running');
  t.row.classList.add(error ? 'err' : 'ok');
  t.row.querySelector('.dur').textContent = `${((performance.now() - t.t0) / 1000).toFixed(1)} sn`;
  const g = t.group;
  if (![...g.rows.children].some((r) => r.classList.contains('running'))) {
    g.el.querySelector('.lbl').textContent = 'Tamamlandı';
    g.wrap.classList.add('done');
    g.el.querySelector('.cnt').textContent = `${g.n} adım · ${((performance.now() - g.t0) / 1000).toFixed(1)} sn`;
  }
}

// ---- İzin kartları ----
function permCard(ev) {
  endText();
  const card = add('card glass');
  if (ev.name === 'AskUserQuestion') {
    const answers = {};
    const qs = ev.input.questions ?? [];
    card.innerHTML = `<div class="card-h">❓ Noyan soruyor</div>` + qs.map((q, qi) =>
      `<div class="q">${esc(q.question)}</div><div class="row">${q.options.map((o, oi) =>
        `<button class="opt" data-q="${qi}" data-o="${oi}" title="${esc(o.description ?? '')}">${esc(o.label)}</button>`).join('')}</div>`
    ).join('') + `<div class="row end"><button class="primary" data-act="send">Cevapla</button><button class="ghost" data-act="deny">Geç</button></div>`;
    card.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.q != null) {
        const q = qs[b.dataset.q];
        answers[q.question] = q.options[b.dataset.o].label;
        card.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle('sel', x === b));
      } else finish(b.dataset.act === 'deny' ? 'deny' : 'allow', b.dataset.act === 'send' ? answers : undefined);
    };
  } else {
    card.innerHTML = `<div class="card-h">${TOOL_ICONS[ev.name] ?? '⚙️'} <b>${esc(ev.name)}</b> izin istiyor</div>
      <pre class="perm-input">${esc(JSON.stringify(ev.input, null, 2))}</pre>
      <div class="row end"><button class="primary" data-c="allow">İzin ver</button><button class="ghost" data-c="always">Hep izin ver</button><button class="ghost danger" data-c="deny">Reddet</button></div>`;
    card.onclick = (e) => { const c = e.target.closest('button')?.dataset.c; if (c) finish(c); };
  }
  function finish(choice, answers) {
    window.noyan.perm({ id: ev.id, choice, answers });
    card.classList.add('done');
    card.onclick = null;
    card.querySelectorAll('button').forEach((b) => (b.disabled = true));
    orb('thinking');
  }
  card.dataset.perm = ev.id;
  orb('waiting');
  scroll(true);
}

// ---- Olaylar ----
window.noyan.on((ev) => {
  switch (ev.kind) {
    case 'init':
      apiKey = ev.apiKey;
      $('meta').textContent = `${ev.model} · ${ev.mode ?? ''}`;
      window.dispatchEvent(new CustomEvent('noyan:init', { detail: ev }));
      break;
    case 'thinking':
      if (busy) orb('thinking');
      break;
    case 'delta':
      if (!bot) { closeSteps(); bot = botMsg(); }
      orb('speaking');
      buf += ev.text;
      if (!raf) raf = requestAnimationFrame(render);
      break;
    case 'blockend':
      endText();
      if (busy) orb('thinking');
      break;
    case 'tool':
      addTool(ev.id, ev.name, ev.input);
      break;
    case 'toolres':
      toolDone(ev.id, ev.error);
      break;
    case 'perm':
      permCard(ev);
      break;
    case 'perm-cancel':
      document.querySelector(`[data-perm="${ev.id}"]`)?.classList.add('done');
      break;
    case 'done':
      endText();
      closeSteps();
      setBusy(false);
      if (ev.error) add('msg error', esc(ev.error));
      $('usage').textContent = `${(ev.ms / 1000).toFixed(1)} sn${apiKey && ev.cost ? ` · $${ev.cost.toFixed(3)}` : ''}`;
      window.dispatchEvent(new Event('noyan:done'));
      break;
    case 'error':
      endText();
      setBusy(false);
      add('msg error', esc(ev.text));
      break;
    case 'closed':
      setBusy(false);
      break;
    case 'reset':
      clearChat('Yeni oturum.', 'Temiz sayfa.');
      $('sessTitle').textContent = 'yeni oturum';
      window.dispatchEvent(new Event('noyan:done'));
      break;
  }
});

function clearChat(h1 = 'Selam.', p = 'Vault yüklü. Ne üzerinde çalışıyoruz?') {
  endText();
  steps = null;
  tools.clear();
  log.innerHTML = `<div class="empty" id="empty"><div class="orb lg"><span></span></div><h1>${esc(h1)}</h1><p>${esc(p)}</p></div>`;
  $('meta').textContent = 'hazır';
  $('usage').textContent = '';
  setBusy(false);
}

// Eski oturumu ekrana basar (side.js kullanır).
function renderHistory(items, title) {
  clearChat();
  log.innerHTML = '';
  $('sessTitle').textContent = title;
  let group = null;
  for (const it of items) {
    if (it.role === 'tool') {
      if (!group) {
        group = add('steps done');
        group.innerHTML = `<details><summary><span class="lbl">Araçlar</span><span class="cnt"></span></summary><div class="rows"></div></details>`;
        group.n = 0;
      }
      group.n++;
      group.querySelector('.cnt').textContent = `${group.n} adım`;
      group.querySelector('.rows').insertAdjacentHTML('beforeend',
        `<div class="step ok"><span class="ic">${TOOL_ICONS[it.name] ?? '⚙️'}</span><b>${esc(it.name)}</b><span class="arg">${esc(toolSummary(it.name, it.input))}</span><span class="dur"></span></div>`);
      continue;
    }
    group = null;
    if (it.role === 'user') add('msg user').textContent = it.text;
    else { const el = botMsg(); el.querySelector('.body').innerHTML = marked.parse(it.text); decorateCode(el); }
  }
  add('divider', '<span>kaldığın yerden devam</span>');
  scroll(true);
}

// ---- Ekler: sürükle-bırak + yapıştır ----
function renderAttachments() {
  const box = $('attachments');
  box.innerHTML = attachments.map((a, i) =>
    `<div class="att">${a.thumb ? `<img src="${a.thumb}" alt="">` : '<span>📄</span>'}<em>${esc(a.name)}</em><button data-i="${i}" title="Kaldır">✕</button></div>`).join('');
  box.hidden = !attachments.length;
}
$('attachments').onclick = (e) => { const i = e.target.closest('button')?.dataset.i; if (i != null) { attachments.splice(i, 1); renderAttachments(); } };

function addFile(file) {
  const p = window.noyan.pathFor(file);
  if (p) {
    const isImg = file.type.startsWith('image/');
    attachments.push({ kind: 'file', name: file.name, path: p, thumb: null });
    if (isImg) {
      const r = new FileReader();
      const a = attachments.at(-1);
      r.onload = () => { a.thumb = r.result; renderAttachments(); };
      r.readAsDataURL(file);
    }
  } else if (file.type.startsWith('image/')) {
    const r = new FileReader();
    r.onload = () => {
      const [, mediaType, data] = r.result.match(/^data:(.+?);base64,(.*)$/);
      attachments.push({ kind: 'image', name: file.name || 'görsel.png', mediaType, data, thumb: r.result });
      renderAttachments();
    };
    r.readAsDataURL(file);
  }
  renderAttachments();
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('dropzone').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('dropzone').hidden = true;
  [...e.dataTransfer.files].forEach(addFile);
  input.focus();
});
input.addEventListener('paste', (e) => {
  const imgs = [...e.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile());
  if (imgs.length) { e.preventDefault(); imgs.forEach(addFile); }
});

// ---- Gönderme ----
function submit() {
  const text = input.value.trim();
  if (!text && !attachments.length) return;
  endText();
  closeSteps();
  const el = add('msg user');
  el.textContent = text;
  if (attachments.length) {
    const strip = document.createElement('div');
    strip.className = 'msg-atts';
    strip.innerHTML = attachments.map((a) => a.thumb ? `<img src="${a.thumb}" alt="">` : `<span class="chip-file">📄 ${esc(a.name)}</span>`).join('');
    el.appendChild(strip);
  }
  if ($('sessTitle').textContent === 'yeni oturum' && text) $('sessTitle').textContent = text.slice(0, 50);
  scroll(true);
  window.noyan.send({
    text,
    images: attachments.filter((a) => a.kind === 'image').map(({ mediaType, data }) => ({ mediaType, data })),
    files: attachments.filter((a) => a.kind === 'file').map((a) => a.path),
  });
  attachments = [];
  renderAttachments();
  input.value = '';
  autosize();
  setBusy(true);
}

function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.4) + 'px'; }

function setInput(text) {
  input.value = text;
  autosize();
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && busy) window.noyan.interrupt();
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); window.noyan.reset(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); document.body.classList.toggle('no-side'); }
  if (e.ctrlKey && e.key.toLowerCase() === 'j') { e.preventDefault(); document.body.classList.toggle('no-right'); }
});
$('go').onclick = submit;
$('stop').onclick = () => window.noyan.interrupt();
$('new').onclick = () => window.noyan.reset();
$('vault').onclick = () => window.noyan.openVault();
$('toggleSide').onclick = () => document.body.classList.toggle('no-side');
$('toggleRight').onclick = () => document.body.classList.toggle('no-right');

// ---- Model / izin modu ----
$('modelSel').onchange = (e) => window.noyan.setModel(e.target.value);
$('modeSel').onchange = (e) => window.noyan.setMode(e.target.value);
const prefs = window.noyan.settings();
prefs.then((s) => { $('modeSel').value = s.mode; });
Promise.all([window.noyan.models(), prefs]).then(([list, s]) => {
  $('modelSel').innerHTML = `<option value="">Model: varsayılan</option>` +
    list.map((m) => `<option value="${esc(m.value)}" title="${esc(m.description)}">${esc(m.name)}</option>`).join('');
  $('modelSel').value = s.model;
}).catch(() => {});

orb('idle');
window.Noyan = { setInput, renderHistory, clearChat };

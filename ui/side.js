// Sol panel: oturum geçmişi, açık Threads, projeler.
(() => {
  const list = $('sideList'), search = $('sideSearch');
  let tab = 'sessions';
  const data = { sessions: [], threads: [], projects: [] };
  let current = '';

  const loaders = {
    sessions: () => window.noyan.sessions(),
    threads: () => window.noyan.threads(),
    projects: () => window.noyan.projects(),
  };

  async function refresh(which = tab) {
    try { data[which] = await loaders[which](); } catch (e) { data[which] = []; console.error(e); }
    if (which === tab) render();
  }

  const statusDot = (s) => ({ active: 'on', aktif: 'on', paused: 'pause', done: 'done', archived: 'done' }[s] ?? '');

  function render() {
    const term = search.value.trim().toLocaleLowerCase('tr');
    const hit = (s) => !term || s.toLocaleLowerCase('tr').includes(term);
    let html = '';
    if (tab === 'sessions') {
      html = data.sessions.filter((s) => hit(s.title)).map((s) => `
        <button class="item${s.id === current ? ' on' : ''}" data-id="${esc(s.id)}">
          <span class="t">${esc(s.title)}</span><span class="sub">${ago(s.at)}</span>
        </button>`).join('');
    } else if (tab === 'threads') {
      html = data.threads.filter((t) => hit(t.title + t.status)).map((t, i) => `
        <button class="item thread" data-i="${i}">
          <span class="t">🧵 ${esc(t.title)}</span><span class="desc">${esc(t.status)}</span>
          <span class="go">sohbete al →</span>
        </button>`).join('');
    } else {
      html = data.projects.filter((p) => hit(p.name)).map((p) => `
        <button class="item proj" data-rel="${esc(p.rel)}">
          <span class="t"><i class="st ${statusDot(p.status)}"></i>${esc(p.name)}</span>
          <span class="sub">${esc(p.status || 'not')} · ${ago(p.modified)}</span>
        </button>`).join('');
    }
    list.innerHTML = html || `<div class="side-empty">Boş.</div>`;
  }

  $('sideTabs').onclick = (e) => {
    const t = e.target.closest('button')?.dataset.tab;
    if (!t) return;
    tab = t;
    document.querySelectorAll('#sideTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    search.value = '';
    render();
    refresh(t);
  };
  search.oninput = render;

  list.onclick = async (e) => {
    const b = e.target.closest('.item');
    if (!b) return;
    if (b.dataset.id) {
      const s = data.sessions.find((x) => x.id === b.dataset.id);
      current = s.id;
      render();
      try { window.Noyan.renderHistory(await window.noyan.resume(s.id), s.title); }
      catch (err) { window.Noyan.clearChat('Oturum açılamadı', String(err.message ?? err)); }
    } else if (b.dataset.i != null) {
      const t = data.threads[b.dataset.i];
      window.Noyan.setInput(`"${t.title}" thread'ine devam edelim. Durum ne, sıradaki adım ne?`);
    } else if (b.dataset.rel) {
      window.noyan.openObsidian(b.dataset.rel);
    }
  };

  window.addEventListener('noyan:init', (e) => { current = e.detail.sessionId; });
  window.addEventListener('noyan:done', () => { refresh('sessions'); if (tab !== 'sessions') refresh(tab); });

  refresh('sessions');
  refresh('threads');
  refresh('projects');
})();

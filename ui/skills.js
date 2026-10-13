// Skiller paneli: kart ızgarası, kategori filtresi, arama. Karta tıklamak /skill komutunu input'a yazar.
(() => {
  const el = (id) => document.getElementById(id);
  const overlay = el('skills'), grid = el('skGrid'), cats = el('skCats'), search = el('skSearch'), count = el('skCount');
  const input = el('input');
  const ORDER = ['AliOS', 'Anthropic', 'Kişisel'];
  let skills = null, loading = null, cat = 'Tümü';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const pretty = (s) => s.replace(/[-_]/g, ' ');

  function load() {
    loading ??= window.noyan.skills()
      .then((list) => { skills = list; render(); })
      .catch((e) => { loading = null; count.textContent = 'Yüklenemedi: ' + e.message; });
    return loading;
  }

  function categories() {
    const all = [...new Set(skills.map((s) => s.category))];
    const rank = (c) => (ORDER.includes(c) ? ORDER.indexOf(c) : c === 'Claude Code' ? 99 : 50);
    return ['Tümü', ...all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))];
  }

  function tile(s) {
    if (s.icon) return `<div class="sk-icon img"><img src="${s.icon}" alt=""></div>`;
    const bg = s.color
      ? `linear-gradient(135deg, ${s.color}, color-mix(in srgb, ${s.color} 45%, #000))`
      : `linear-gradient(135deg, hsl(${hue(s.name)} 65% 55%), hsl(${(hue(s.name) + 40) % 360} 60% 32%))`;
    const glyph = s.emoji ? `<span class="emo">${s.emoji}</span>` : esc(s.short.split(/[-_ ]/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
    return `<div class="sk-icon" data-bg="${esc(bg)}">${glyph}</div>`;
  }

  function visible() {
    const term = search.value.trim().toLocaleLowerCase('tr');
    return skills.filter((s) =>
      (cat === 'Tümü' ? !s.builtin : s.category === cat) &&
      (!term || (s.name + ' ' + s.description).toLocaleLowerCase('tr').includes(term)));
  }

  function render() {
    if (!skills) return;
    cats.innerHTML = categories().map((c) => {
      const n = c === 'Tümü' ? skills.filter((s) => !s.builtin).length : skills.filter((s) => s.category === c).length;
      return `<button class="chip${c === cat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)} <span>${n}</span></button>`;
    }).join('');
    const list = visible();
    count.textContent = `${list.length} skill`;
    grid.innerHTML = list.map((s, i) => `
      <button class="sk-card" data-i="${skills.indexOf(s)}" data-d="${Math.min(i, 30) * 18}" title="/${esc(s.name)}">
        ${tile(s)}
        <div class="sk-body">
          <div class="sk-name">${esc(pretty(s.short))}</div>
          <div class="sk-cmd">/${esc(s.name)}${s.argumentHint ? ' <i>' + esc(s.argumentHint) + '</i>' : ''}</div>
          <div class="sk-desc">${esc(s.description)}</div>
        </div>
        <span class="sk-tag" lang="en">${esc(s.category)}</span>
      </button>`).join('') || `<div class="sk-none">Eşleşen skill yok.</div>`;
    // CSP inline style'ı engeller; CSSOM üzerinden atanır.
    grid.querySelectorAll('[data-bg]').forEach((n) => (n.style.background = n.dataset.bg));
    grid.querySelectorAll('[data-d]').forEach((n) => n.style.setProperty('--d', n.dataset.d + 'ms'));
  }

  function pick(s) {
    close();
    input.value = `/${s.name} `;
    input.dispatchEvent(new Event('input'));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function open() {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('show'));
    search.value = '';
    search.focus();
    if (skills) render(); else load();
  }

  function close() {
    overlay.classList.remove('show');
    overlay.hidden = true;
  }

  cats.onclick = (e) => { const c = e.target.closest('.chip')?.dataset.cat; if (c) { cat = c; render(); } };
  grid.onclick = (e) => { const i = e.target.closest('.sk-card')?.dataset.i; if (i != null) pick(skills[i]); };
  search.oninput = render;
  search.onkeydown = (e) => { if (e.key === 'Enter') { const first = visible()[0]; if (first) pick(first); } };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  el('skillsBtn').onclick = open;

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay.hidden ? open() : close(); }
    else if (e.key === 'Escape' && !overlay.hidden) { e.stopPropagation(); close(); input.focus(); }
  }, true);

  // ---- "/" komut paleti: input "/..." ile başlarken açılır ----
  const palette = el('palette');
  let matches = [], sel = 0;

  function paletteUpdate() {
    const m = input.value.match(/^\/(\S*)$/);
    if (!m || !skills) return paletteClose();
    const term = m[1].toLowerCase();
    const pool = skills.filter((s) => !s.builtin || term);
    matches = pool
      .map((s) => ({ s, rank: s.name.toLowerCase().startsWith(term) ? 0 : s.short.toLowerCase().startsWith(term) ? 1 : s.name.toLowerCase().includes(term) ? 2 : 9 }))
      .filter((x) => x.rank < 9)
      .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name))
      .slice(0, 8)
      .map((x) => x.s);
    if (!matches.length) return paletteClose();
    sel = Math.min(sel, matches.length - 1);
    palette.innerHTML = matches.map((s, i) => `
      <div class="pal-row${i === sel ? ' on' : ''}" data-i="${i}">
        ${tile(s).replace('sk-icon', 'sk-icon xs')}
        <div><b>/${esc(s.name)}</b>${s.argumentHint ? ` <i>${esc(s.argumentHint)}</i>` : ''}<div class="pal-desc">${esc(s.description)}</div></div>
        <span class="pal-cat" lang="en">${esc(s.category)}</span>
      </div>`).join('');
    palette.querySelectorAll('[data-bg]').forEach((n) => (n.style.background = n.dataset.bg));
    palette.hidden = false;
  }

  function paletteClose() { palette.hidden = true; matches = []; sel = 0; }

  function paletteChoose(i) {
    const s = matches[i];
    if (!s) return;
    paletteClose();
    window.Noyan.setInput(`/${s.name} `);
  }

  input.addEventListener('input', () => { sel = 0; paletteUpdate(); });
  input.addEventListener('keydown', (e) => {
    if (palette.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      paletteUpdate();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      paletteChoose(sel);
    } else if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      paletteClose();
    }
  }, true);
  palette.addEventListener('mousedown', (e) => { const i = e.target.closest('.pal-row')?.dataset.i; if (i != null) { e.preventDefault(); paletteChoose(+i); } });
  input.addEventListener('blur', () => setTimeout(paletteClose, 120));

  load(); // oturumu da ısıtır: ilk mesaj daha hızlı gider
})();

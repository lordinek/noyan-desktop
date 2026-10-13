// Paylaşılan küçük yardımcılar.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'şimdi';
  if (s < 3600) return `${Math.floor(s / 60)} dk`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} gün`;
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

const money = (n, d = 2) => n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

// Değer dizisinden inline SVG sparkline (CSP'ye takılmaz: sadece attribute).
function sparkline(values, { w = 100, h = 28, up } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 2 - ((x - min) / span) * (h - 4)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const rising = up ?? v.at(-1) >= v[0];
  const c = rising ? '#4ade80' : '#f87171';
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}

// CSP inline style'ı engeller; data-* ile işaretlenen stiller CSSOM üzerinden uygulanır.
function applyDataStyles(root) {
  root.querySelectorAll('[data-bg]').forEach((n) => (n.style.background = n.dataset.bg));
  root.querySelectorAll('[data-d]').forEach((n) => n.style.setProperty('--d', n.dataset.d + 'ms'));
  root.querySelectorAll('[data-w]').forEach((n) => (n.style.width = n.dataset.w + '%'));
}

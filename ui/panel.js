// Sağ panel: Binance canlı fiyatlar + Bot Komuta Merkezi özetleri.
(() => {
  // Logolar: CoinGecko resmi görselleri, ui/logos/ altında yerel.
  const SYMBOLS = [['BTCUSDT', 'BTC', 'btc'], ['ETHUSDT', 'ETH', 'eth'], ['SOLUSDT', 'SOL', 'sol'], ['PAXGUSDT', 'ALTIN', 'paxg']];
  const API = 'https://api.binance.com/api/v3';
  const klines = {};
  let tickAt = 0, botsAt = 0;

  async function loadKlines() {
    await Promise.all(SYMBOLS.map(async ([s]) => {
      const r = await fetch(`${API}/klines?symbol=${s}&interval=1h&limit=48`);
      if (r.ok) klines[s] = (await r.json()).map((k) => +k[4]);
    }));
  }

  async function loadTicker() {
    try {
      const r = await fetch(`${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(SYMBOLS.map((x) => x[0])))}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = await r.json();
      $('ticker').innerHTML = SYMBOLS.map(([s, label, logo]) => {
        const t = rows.find((x) => x.symbol === s);
        if (!t) return '';
        const ch = +t.priceChangePercent, last = +t.lastPrice;
        const series = klines[s] ? [...klines[s].slice(0, -1), last] : [];
        return `<div class="tick">
          <div class="tk-l"><img class="coin" src="logos/${logo}.png" alt="${label}"><div><b>${label}</b><small>${pct(ch)}</small></div></div>
          ${sparkline(series, { up: ch >= 0 })}
          <div class="tk-r ${ch >= 0 ? 'up' : 'down'}">$${money(last, last < 10 ? 4 : 2)}</div>
        </div>`;
      }).join('');
      tickAt = Date.now();
    } catch (e) {
      $('ticker').innerHTML = `<div class="muted">Fiyat alınamadı (${esc(e.message)})</div>`;
    }
  }

  async function loadBots() {
    $('botsRefresh').classList.add('spinning');
    const d = await window.noyan.bots();
    $('botsRefresh').classList.remove('spinning');
    if (d.error) { $('bots').innerHTML = `<div class="muted">${esc(d.error)}</div>`; return; }
    const p = d.portfolio;
    const pp = p.starting_balance ? (p.pnl / p.starting_balance) * 100 : 0;
    $('portfolio').innerHTML = `
      <div class="pf-label">Toplam portföy (paper)</div>
      <div class="pf-val">$${money(p.equity)}</div>
      <div class="pf-pnl ${p.pnl >= 0 ? 'up' : 'down'}">${p.pnl >= 0 ? '▲' : '▼'} $${money(Math.abs(p.pnl))} · ${pct(pp)}</div>`;
    const sorted = [...d.bots].sort((a, b) => a.stopped - b.stopped || (b.pnlPct ?? 0) - (a.pnlPct ?? 0));
    $('bots').innerHTML = sorted.map((b) => `
      <div class="bot${b.stopped ? ' stopped' : ''}" title="${esc(b.subtitle)}${b.note ? '\n' + esc(b.note) : ''}${b.signal ? '\n' + esc(b.signal) : ''}">
        <div class="bot-top">
          <span class="bot-name"><i class="st ${b.stopped ? 'pause' : 'on'}"></i>${esc(b.name)}</span>
          <span class="bot-pnl ${(b.pnl ?? 0) >= 0 ? 'up' : 'down'}">${pct(b.pnlPct)}</span>
        </div>
        <div class="bot-mid">${sparkline(b.history)}</div>
        <div class="bot-sub"><span>${esc(b.position)}</span><span>$${money(b.equity)} · ${esc(b.ago)}</span></div>
      </div>`).join('');
    botsAt = Date.now();
    $('botsAgo').textContent = d.updated ? '' : '';
  }

  setInterval(() => {
    $('tickAgo').textContent = tickAt ? ago(tickAt) : '';
    $('botsAgo').textContent = botsAt ? ago(botsAt) : '';
  }, 5000);

  $('botsRefresh').onclick = loadBots;
  loadKlines().then(loadTicker);
  setInterval(loadTicker, 15000);
  setInterval(loadKlines, 10 * 60 * 1000);
  loadBots();
  setInterval(loadBots, 2 * 60 * 1000);
})();

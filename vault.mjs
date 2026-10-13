// Vault ve çevre verisi: oturum geçmişi, Threads, projeler, bot durumları. Hepsi salt okunur.
import { listSessions, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// İsteğe bağlı bot panosu: NOYAN_BOT_DIR, export_payload.py içeren klasör.
const BOT_DIR = process.env.NOYAN_BOT_DIR || '';

const stripReminders = (s) => s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();

export async function sessions(vault) {
  const list = await listSessions({ dir: vault, limit: 60 });
  return list
    .map((s) => ({ id: s.sessionId, title: stripReminders(s.summary ?? '').slice(0, 90) || 'Adsız oturum', at: s.lastModified }))
    .sort((a, b) => b.at - a.at);
}

// Oturum kaydını ekranda gösterilecek sade mesajlara çevirir.
export async function history(vault, id) {
  const msgs = await getSessionMessages(id, { dir: vault });
  const out = [];
  for (const m of msgs) {
    if (m.parent_tool_use_id) continue;
    const content = m.message?.content;
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    if (m.type === 'user') {
      const text = stripReminders(blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
      if (text && !text.startsWith('<')) out.push({ role: 'user', text });
    } else if (m.type === 'assistant') {
      for (const b of blocks) {
        if (b.type === 'text' && b.text.trim()) out.push({ role: 'bot', text: b.text });
        else if (b.type === 'tool_use') out.push({ role: 'tool', name: b.name, input: b.input });
      }
    }
  }
  return out;
}

export function threads(vault) {
  const file = path.join(vault, '🔮 850-Companion', 'Threads.md');
  if (!existsSync(file)) return [];
  const md = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const active = md.split(/^## /m).find((s) => s.startsWith('Active Threads')) ?? md;
  return active.split(/^### Thread:\s*/m).slice(1).map((chunk) => {
    const [title, ...rest] = chunk.split('\n');
    const body = rest.join('\n');
    const status = body.match(/\*\*Status:\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/)?.[1] ?? body;
    const clean = status.replace(/[*`_]/g, '').replace(/\s+/g, ' ').trim();
    return { title: title.trim(), status: clean.length > 180 ? clean.slice(0, 180) + '…' : clean };
  });
}

export function projects(vault) {
  const dir = path.join(vault, '🏰 300-Projects');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() || e.name.endsWith('.md'))
    .map((e) => {
      const full = path.join(dir, e.name);
      const note = e.isDirectory() ? path.join(full, 'README.md') : full;
      const fm = existsSync(note) ? readFileSync(note, 'utf8').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '' : '';
      return {
        name: e.name.replace(/\.md$/, '').replace(/-/g, ' '),
        rel: path.relative(vault, note),
        status: fm.match(/^status:\s*(\S+)/m)?.[1] ?? '',
        modified: existsSync(note) ? statSync(note).mtimeMs : 0,
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

// Bot Komuta Merkezi'nin ortak formatını kullanır (bots.py adaptörleri); botlara dokunmaz.
const BOT_SCRIPT = 'import json,export_payload as e; print(json.dumps(e.build_payload(), ensure_ascii=False))';
export function bots() {
  return new Promise((resolve) => {
    if (!BOT_DIR || !existsSync(BOT_DIR)) return resolve({ error: 'Komuta merkezi bulunamadı' });
    execFile('python', ['-c', BOT_SCRIPT], { cwd: BOT_DIR, timeout: 30000, maxBuffer: 8 << 20, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve({ error: String(err.message).split('\n')[0] });
        try {
          const d = JSON.parse(stdout);
          resolve({
            updated: d.updated_at,
            portfolio: d.portfolio,
            bots: d.bots.map((b) => ({
              name: b.name, subtitle: b.subtitle, position: b.position, note: b.position_note,
              equity: b.equity, pnl: b.pnl, pnlPct: b.pnl_pct, signal: b.signal_text, ago: b.updated_ago,
              stopped: b.updated_ago === 'durduruldu', history: (b.history ?? []).map((h) => h.equity).filter((x) => x != null),
            })),
          });
        } catch (e) { resolve({ error: 'Çıktı okunamadı: ' + e.message }); }
      });
  });
}

// Noyan: AliOS vault'unda çalışan Claude Code oturumunu masaüstü penceresinde sunar.
import { app, BrowserWindow, Menu, Notification, Tray, globalShortcut, ipcMain, nativeImage, shell } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichSkills } from './skills.mjs';
import * as vaultData from './vault.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vault yolu: NOYAN_VAULT ortam değişkeni, yoksa ~/Vault.
const VAULT = process.env.NOYAN_VAULT || path.join(os.homedir(), 'Vault');
const CLAUDE_EXE = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
const HOTKEY = 'Control+Alt+N';
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

let win = null;
let tray = null;
let quitting = false;
let q = null;          // aktif Query
let inbox = null;      // q'ya kullanıcı mesajı besleyen kuyruk
let sessionId = '';
// Kalıcı tercihler (userData/settings.json): model ve izin modu. Varsayılan izin modu: auto (CLI'daki gibi).
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(readFileSync(SETTINGS_FILE(), 'utf8')); } catch { return {}; }
}
function saveSettings() {
  try { writeFileSync(SETTINGS_FILE(), JSON.stringify({ model, mode }, null, 2)); } catch {}
}
let model = undefined; // seçilen model; undefined = ayarlardaki varsayılan
let mode = 'auto';     // seçilen izin modu
const pending = new Map(); // izin bekleyen araç çağrıları

const send = (ev) => win?.webContents.send('ev', ev);

// Streaming input: tek uzun ömürlü oturum, mesajlar kuyruktan akar.
function makeInbox() {
  const queue = [];
  let wake = null;
  let closed = false;
  return {
    push(m) { queue.push(m); wake?.(); },
    close() { closed = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        while (queue.length) yield queue.shift();
        if (closed) break;
        await new Promise((r) => (wake = r));
        wake = null;
      }
    },
  };
}

async function canUseTool(name, input, { signal, suggestions }) {
  const id = randomUUID();
  send({ kind: 'perm', id, name, input });
  notify('İzin gerekiyor', `${name} çalıştırmak için onay bekliyor`);
  return new Promise((resolve) => {
    pending.set(id, { resolve, input, suggestions });
    signal?.addEventListener('abort', () => {
      if (!pending.delete(id)) return;
      send({ kind: 'perm-cancel', id });
      resolve({ behavior: 'deny', message: 'İptal edildi' });
    });
  });
}

function start(resume) {
  inbox = makeInbox();
  const cur = query({
    prompt: inbox,
    options: {
      cwd: VAULT,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      includePartialMessages: true,
      ...(existsSync(CLAUDE_EXE) ? { pathToClaudeCodeExecutable: CLAUDE_EXE } : {}),
      canUseTool,
      ...(model ? { model } : {}),
      ...(mode ? { permissionMode: mode } : {}),
      ...(resume ? { resume } : {}),
    },
  });
  q = cur;
  pump(cur);
  return cur;
}

const ensure = () => q ?? start(sessionId || undefined);

function stop() {
  for (const [id, p] of pending) {
    p.resolve({ behavior: 'deny', message: 'Oturum kapandı' });
    send({ kind: 'perm-cancel', id });
  }
  pending.clear();
  inbox?.close();
  q?.close?.();
  q = null;
  inbox = null;
}

async function pump(cur) {
  try {
    for await (const m of cur) {
      if (cur !== q) break;
      handle(m);
    }
  } catch (e) {
    if (cur === q) send({ kind: 'error', text: String(e?.message ?? e) });
  } finally {
    if (cur === q) { q = null; inbox = null; send({ kind: 'closed' }); }
  }
}

function handle(m) {
  if (m.parent_tool_use_id) return; // alt-agent içi akışı gösterme
  switch (m.type) {
    case 'system':
      if (m.subtype === 'init') {
        sessionId = m.session_id;
        send({ kind: 'init', model: m.model, sessionId, mode: m.permissionMode, apiKey: m.apiKeySource !== 'none' });
      }
      break;
    case 'stream_event': {
      const e = m.event;
      if (e.type === 'message_start') send({ kind: 'thinking' });
      else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') send({ kind: 'delta', text: e.delta.text });
      else if (e.type === 'content_block_stop') send({ kind: 'blockend' });
      break;
    }
    case 'assistant':
      for (const b of m.message.content ?? []) {
        if (b.type === 'tool_use') send({ kind: 'tool', id: b.id, name: b.name, input: b.input });
      }
      break;
    case 'user':
      if (Array.isArray(m.message?.content)) {
        for (const b of m.message.content) {
          if (b.type === 'tool_result') send({ kind: 'toolres', id: b.tool_use_id, error: !!b.is_error });
        }
      }
      break;
    case 'result':
      send({ kind: 'done', cost: m.total_cost_usd, ms: m.duration_ms, error: m.is_error ? (m.result ?? m.subtype) : null });
      notify('Noyan bitirdi', typeof m.result === 'string' ? m.result.slice(0, 140) : 'Cevap hazır');
      break;
  }
}

function notify(title, body) {
  if (win?.isFocused() || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'icon.ico'), silent: false });
  n.on('click', showWindow);
  n.show();
}

// Mesaj: metin + yapıştırılan görseller + sürüklenen dosyalar. Görsel dosyalar içerik bloğu olur, diğerleri yol olarak gider.
function buildContent({ text = '', images = [], files = [] }) {
  const blocks = images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }));
  const paths = [];
  for (const f of files) {
    const mt = IMAGE_TYPES[path.extname(f).toLowerCase()];
    if (mt) blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: readFileSync(f).toString('base64') } });
    paths.push(f);
  }
  const body = paths.length ? `${text}\n\nEklenen dosyalar:\n${paths.map((p) => `- ${p}`).join('\n')}` : text;
  return blocks.length ? [...blocks, { type: 'text', text: body.trim() || 'Bu görsele bak.' }] : body;
}

ipcMain.on('send', (_, msg) => {
  ensure();
  const content = buildContent(typeof msg === 'string' ? { text: msg } : msg);
  inbox.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: sessionId });
});

ipcMain.on('interrupt', () => { q?.interrupt().catch(() => {}); });

ipcMain.on('new', () => { stop(); sessionId = ''; send({ kind: 'reset' }); });

ipcMain.on('perm', (_, { id, choice, answers }) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (choice === 'deny') return p.resolve({ behavior: 'deny', message: 'Kullanıcı reddetti' });
  p.resolve({
    behavior: 'allow',
    updatedInput: answers ? { ...p.input, answers } : p.input,
    ...(choice === 'always' && p.suggestions ? { updatedPermissions: p.suggestions } : {}),
  });
});

ipcMain.on('open-vault', () => shell.openPath(VAULT));

// Sadece vault içindeki yollar açılır.
ipcMain.on('open-path', (_, rel) => {
  const full = path.resolve(VAULT, rel);
  if (full.startsWith(VAULT + path.sep)) shell.openPath(full);
});

ipcMain.on('open-obsidian', (_, rel) => {
  shell.openExternal(`obsidian://open?vault=${encodeURIComponent(path.basename(VAULT))}&file=${encodeURIComponent(rel.replace(/\\/g, '/'))}`);
});

// Skill listesi canlı oturumdan gelir; oturum yoksa mesaj göndermeden açılır.
ipcMain.handle('skills', async () => enrichSkills(await ensure().supportedCommands(), { vault: VAULT, appDir: __dirname }));

ipcMain.handle('models', async () => {
  const list = await ensure().supportedModels();
  return list.map((m) => ({ value: m.value, name: m.displayName, description: m.description }));
});

ipcMain.handle('settings', () => ({ model: model ?? '', mode }));
ipcMain.handle('set-model', async (_, value) => { model = value || undefined; saveSettings(); await q?.setModel(model); });
ipcMain.handle('set-mode', async (_, value) => { mode = value || 'auto'; saveSettings(); await q?.setPermissionMode(mode); });

ipcMain.handle('sessions', () => vaultData.sessions(VAULT));
ipcMain.handle('resume', async (_, id) => {
  stop();
  sessionId = id;
  return vaultData.history(VAULT, id);
});
ipcMain.handle('threads', () => vaultData.threads(VAULT));
ipcMain.handle('projects', () => vaultData.projects(VAULT));
ipcMain.handle('bots', () => vaultData.bots());

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 520,
    title: 'Noyan',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8e8f0', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); shell.openExternal(url); });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  // Kapatınca tepsiye iner; oturum arkada yaşamaya devam eder.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.ico')));
  tray.setToolTip(`Noyan (${HOTKEY.replace('Control', 'Ctrl')})`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Noyan\'ı aç', click: showWindow },
    { label: 'Yeni oturum', click: () => { showWindow(); stop(); sessionId = ''; send({ kind: 'reset' }); } },
    { type: 'separator' },
    { label: 'Çık', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', showWindow);

app.setAppUserModelId('com.ali.noyan');
app.whenReady().then(() => {
  const saved = loadSettings();
  model = saved.model || undefined;
  mode = saved.mode || 'auto';
  createWindow();
  createTray();
  globalShortcut.register(HOTKEY, () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow()));
});
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); stop(); });

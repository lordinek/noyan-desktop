// Skill listesini SDK'dan alır; disk üzerindeki SKILL.md klasörleri ve skills-meta.json ile görsel bilgi ekler.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ICON_FILES = ['icon.png', 'icon.svg', 'icon.webp', 'icon.jpg'];
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

// SKILL.md dosyalarını bulur: name -> { dir, source }
function scanSkillDirs(vault) {
  const roots = [
    [path.join(vault, '.claude', 'skills'), 'AliOS'],
    [path.join(os.homedir(), '.claude', 'skills'), 'Kişisel'],
    [path.join(os.homedir(), '.claude', 'plugins', 'cache'), 'Plugin'],
  ];
  const found = new Map();
  const walk = (dir, source, depth) => {
    if (depth > 7 || !existsSync(dir)) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
      const md = readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
      const name = md.match(/^name:\s*(.+)$/m)?.[1].trim() ?? path.basename(dir);
      const synced = dir.split(path.sep).includes('synced');
      if (!found.has(name)) found.set(name, { dir, source: synced ? 'Anthropic' : source });
      return;
    }
    for (const e of entries) if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) walk(path.join(dir, e.name), source, depth + 1);
  };
  for (const [root, source] of roots) walk(root, source, 0);
  return found;
}

function iconData(dir) {
  for (const f of ICON_FILES) {
    const p = path.join(dir, f);
    if (existsSync(p)) return `data:${MIME[path.extname(f)]};base64,${readFileSync(p).toString('base64')}`;
  }
  return null;
}

function loadMeta(appDir) {
  try { return JSON.parse(readFileSync(path.join(appDir, 'skills-meta.json'), 'utf8')); } catch { return {}; }
}

export function enrichSkills(commands, { vault, appDir }) {
  const dirs = scanSkillDirs(vault);
  const meta = loadMeta(appDir);
  return commands.map((c) => {
    const [prefix, short] = c.name.includes(':') ? c.name.split(/:(.*)/s) : [null, c.name];
    const local = dirs.get(c.name) ?? dirs.get(short);
    const category = c.builtin ? 'Claude Code'
      : local?.source === 'AliOS' ? 'AliOS'
      : prefix ?? local?.source ?? 'Kişisel';
    const m = meta[c.name] ?? meta[short] ?? {};
    return {
      name: c.name,
      short,
      description: (c.description ?? '').replace(/^\([^)]*\)\s*/, ''),
      argumentHint: c.argumentHint ?? '',
      builtin: !!c.builtin,
      category,
      icon: (local && iconData(local.dir)) ?? null,
      emoji: m.emoji ?? null,
      color: m.color ?? null,
    };
  });
}

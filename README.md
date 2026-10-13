# Noyan Desktop

A desktop AI agent that lives on top of an Obsidian "second brain" vault. Built with **Electron** and the **Claude Agent SDK**, it gives a long-running Claude session a native window, a system-tray presence and a live view of the vault it works in.

> UI language: Turkish. Code comments: Turkish.

## Features

- **Streaming agent session**: one long-lived `query()` fed from an async message queue, so follow-up messages, interrupts and model switches happen without restarting the session.
- **Interactive permissions**: every tool call goes through `canUseTool`, rendered as approve / deny / always-allow cards in the UI. Permission mode (`auto`, `default`, `plan`, ...) and model can be switched live.
- **Multimodal input**: paste or drop images and files into the chat; they are converted to Claude content blocks.
- **Session history**: lists and resumes previous agent sessions with `listSessions` / `getSessionMessages`.
- **Vault side panels**: open threads, active projects (parsed from Markdown frontmatter) and an optional trading-bot panel with equity sparklines.
- **Skill browser**: shows the slash commands and skills available to the agent, grouped by source.
- **Desktop integration**: tray icon, global hotkey (`Ctrl+Alt+N`), native notifications when a long task finishes in the background, open-in-Obsidian links.

## Stack

| Layer | Tech |
| --- | --- |
| Shell | Electron 44 (ESM main process, sandboxed preload) |
| Agent | `@anthropic-ai/claude-agent-sdk` |
| Rendering | `marked` + `highlight.js` |
| Data | Plain Markdown vault, read-only |

## Run

```bash
npm install
# Claude Code must be installed and logged in
set NOYAN_VAULT=C:\path\to\your\vault          # default: ~/Vault
set NOYAN_BOT_DIR=C:\path\to\bot_dashboard     # optional
npm start
```

## Structure

```
main.mjs     Electron main: agent session, permissions, IPC, tray, hotkey
vault.mjs    Read-only vault data: sessions, threads, projects, bot payload
skills.mjs   Skill/command metadata enrichment
preload.cjs  Context-isolated bridge
ui/          Renderer: chat, side panels, skill browser
```

## License

MIT

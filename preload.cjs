const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('noyan', {
  send: (msg) => ipcRenderer.send('send', msg),
  interrupt: () => ipcRenderer.send('interrupt'),
  reset: () => ipcRenderer.send('new'),
  perm: (reply) => ipcRenderer.send('perm', reply),
  openVault: () => ipcRenderer.send('open-vault'),
  openPath: (rel) => ipcRenderer.send('open-path', rel),
  openObsidian: (rel) => ipcRenderer.send('open-obsidian', rel),
  skills: () => ipcRenderer.invoke('skills'),
  models: () => ipcRenderer.invoke('models'),
  settings: () => ipcRenderer.invoke('settings'),
  setModel: (v) => ipcRenderer.invoke('set-model', v),
  setMode: (v) => ipcRenderer.invoke('set-mode', v),
  sessions: () => ipcRenderer.invoke('sessions'),
  resume: (id) => ipcRenderer.invoke('resume', id),
  threads: () => ipcRenderer.invoke('threads'),
  projects: () => ipcRenderer.invoke('projects'),
  bots: () => ipcRenderer.invoke('bots'),
  pathFor: (file) => webUtils.getPathForFile(file),
  on: (fn) => ipcRenderer.on('ev', (_, ev) => fn(ev)),
});

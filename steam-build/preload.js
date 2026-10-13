'use strict';
// Ponte segura entre o jogo (página) e o Electron/Steam.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('app:quit'),
  toggleFullscreen: () => ipcRenderer.send('app:fullscreen'),
  steam: {
    unlock: (name) => ipcRenderer.send('steam:achievement', name),
    info: () => ipcRenderer.invoke('steam:info'),
  },
});

'use strict';
// Processo principal do Electron: janela do jogo + Steamworks (overlay, conquistas) quando disponível.
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let steam = null;
function initSteam() {
  try {
    const appIdFile = path.join(path.dirname(process.execPath), 'steam_appid.txt');
    const devIdFile = path.join(__dirname, 'steam_appid.txt');
    const idText = fs.existsSync(appIdFile) ? fs.readFileSync(appIdFile, 'utf8') : fs.existsSync(devIdFile) ? fs.readFileSync(devIdFile, 'utf8') : '';
    const appId = parseInt(idText, 10);
    if (!appId) return;
    const steamworks = require('steamworks.js');
    steam = steamworks.init(appId);
    steamworks.electronEnableSteamOverlay();
    console.log('Steam conectado:', steam.localplayer.getName());
  } catch (err) {
    // sem Steam aberto (ou sem steamworks.js): o jogo roda normalmente, só sem overlay/conquistas
    console.log('Steam indisponível:', err.message);
    steam = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#05060c',
    autoHideMenuBar: true,
    title: app.getName(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  if (process.argv.includes('--fullscreen')) win.setFullScreen(true);
  return win;
}

ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('steam:achievement', (e, name) => {
  try {
    if (steam) steam.achievement.activate(String(name));
  } catch (err) {
    console.log('conquista falhou:', err.message);
  }
});
ipcMain.handle('steam:info', () => (steam ? { name: steam.localplayer.getName(), online: true } : { online: false }));

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(() => {
  initSteam();
  createWindow();
});
app.on('window-all-closed', () => app.quit());

'use strict';
(function () {
  const E = window.ENG;
  const FAMILY = "'Cascadia Mono','Consolas','DejaVu Sans Mono',monospace";

  E.toast = (msg) => {
    const t = document.getElementById('toast');
    t.textContent = '[ ' + msg + ' ]';
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2400);
  };
  E.download = (name, data) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  E.setFontSize = (size) => {
    E.Game.fontSize = size;
    E.Renderer.setFont(size, FAMILY);
    E.aspect = E.Renderer.ch / E.Renderer.cw;
    E.clearSpriteCache();
  };
  E.rgbHex = (c) => '#' + (c || [1, 1, 1]).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  E.hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

  const hud = document.getElementById('hud');
  E.hud = (r) => {
    if (E.hud._t && performance.now() - E.hud._t < 250) return;
    E.hud._t = performance.now();
    const p = E.Game.player;
    hud.textContent = `${E.Game.fps} fps · ${((r.cols * r.rows) / 1000).toFixed(1)}k glifos · ${E.Game.world.name} · x${Math.round(p.x)} y${Math.round(p.y)} · ${E.Ents.list.length} entidades${E.Editor.active ? ' · EDITOR' : ''}`;
  };

  function start() {
    const cv = document.getElementById('view');
    try {
      E.Renderer.init(cv);
    } catch (err) {
      document.body.innerHTML = `<pre style="color:#f88;padding:20px;white-space:pre-wrap">${err.message}</pre>`;
      throw err;
    }
    E.setFontSize(E.Game.fontSize);
    let world;
    if (window.GAME_DATA) {
      // build exportada: projeto embutido, sem editor
      E.GAME_MODE = true;
      document.body.classList.add('game-mode');
      world = E.ProjectIO.fromJSON(JSON.parse(JSON.stringify(window.GAME_DATA)));
      if (window.GAME_DATA.font) E.setFontSize(window.GAME_DATA.font);
    } else {
      world = E.ProjectIO.loadLocal();
      if (!world) {
        E.ProjectIO.createDefault();
        world = E.Project.worlds[E.Project.startMap];
      }
    }
    E.Game.inv = new E.Inventory();
    E.Game.inv.add('pocao', 2);
    E.Game.inv.add('bomba', 2);
    E.UI.init();
    E.Overlay.init();
    E.Game.enterWorld(world);
    if (window.GAME_DATA && window.GAME_DATA.heroName != null) E.Game.name = window.GAME_DATA.heroName;
    if (!E.GAME_MODE) E.Editor.init();
    // engine/index.html?editor abre direto com o editor ligado
    if (!E.GAME_MODE && /[?&]editor/.test(location.search)) setTimeout(() => E.Editor.toggle(true), 50);
    // na build publicada o modo criativo começa desligado (pode ser ligado em Opções)
    try {
      if (E.GAME_MODE && !('creative' in JSON.parse(localStorage.getItem('asciiengine.options') || '{}'))) E.Options.creative = false;
    } catch (e) {}
    E.Creative.init();
    window.addEventListener('resize', () => E.Renderer.resize());
    if (!E.GAME_MODE) window.addEventListener('beforeunload', () => E.ProjectIO.saveLocal());
    requestAnimationFrame(E.Game.frame);
    if (E.GAME_MODE) E.Menu.open('title');
    else setTimeout(() => E.toast('←→ andar · Espaço pular · Shift dash · mouse/J atacar · E interagir · I inventário · C criativo · Esc opções · Tab editor'), 600);
  }

  window.addEventListener('DOMContentLoaded', () => {
    // game-data.js só existe na build exportada
    const sc = document.createElement('script');
    sc.src = 'game-data.js';
    sc.onload = start;
    sc.onerror = start;
    document.head.appendChild(sc);
  });
})();

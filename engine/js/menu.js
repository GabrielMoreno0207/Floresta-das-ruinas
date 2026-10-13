'use strict';
// Menus ASCII: inicial, pausa (Esc) e opções. Salvamento de progresso nas fogueiras.
(function () {
  const E = window.ENG;
  const G = () => E.Game;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const key = () => 'asciiengine.save.' + (E.Project.name || 'jogo').replace(/\W+/g, '_');

  E.Save = {
    save() {
      const p = G().player, w = G().world;
      const data = { v: 1, map: w.id, x: w.spawn.x, y: w.spawn.y, hp: p.hp, inv: G().inv.slots, gear: G().inv.gear, weapon: G().inv.weapon, light: G().inv.light, upg: G().inv.upg, bonusHp: G().inv.bonusHp, vars: E.API.vars, t: Date.now() };
      try {
        localStorage.setItem(key(), JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    load() {
      try {
        return JSON.parse(localStorage.getItem(key()) || 'null');
      } catch (e) {
        return null;
      }
    },
    apply(d) {
      const w = E.Project.worlds[d.map] || E.Project.worlds[E.Project.startMap];
      w.spawn = { x: d.x, y: d.y };
      G().inv = new E.Inventory();
      G().inv.slots = d.inv || G().inv.slots;
      G().inv.weapon = d.weapon || 'espada';
      G().inv.gear = d.gear || G().inv.gear;
      G().inv.light = d.light || null;
      G().inv.upg = d.upg || {};
      G().inv.bonusHp = d.bonusHp || 0;
      Object.assign(E.API.vars, d.vars || {});
      G().enterWorld(w, d.x, d.y);
      if (d.hp) G().player.hp = d.hp;
      E.UI.refresh();
    },
  };

  const fullscreen = () => {
    if (window.desktop) return window.desktop.toggleFullscreen();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const quit = () => {
    if (window.desktop) window.desktop.quit();
    else E.UI.message('Sair só funciona na versão instalada.');
  };

  // título em letras grandes de blocos (5 linhas)
  const FONT = {
    A: ['▄█▄', '█ █', '███', '█ █', '█ █'], B: ['██▄', '█ █', '██▄', '█ █', '██▀'], C: ['▄██', '█  ', '█  ', '█  ', '▀██'], D: ['██▄', '█ █', '█ █', '█ █', '██▀'],
    E: ['███', '█  ', '██ ', '█  ', '███'], F: ['███', '█  ', '██ ', '█  ', '█  '], G: ['▄██', '█  ', '█▄█', '█ █', '▀██'], H: ['█ █', '█ █', '███', '█ █', '█ █'],
    I: ['███', ' █ ', ' █ ', ' █ ', '███'], J: ['  █', '  █', '  █', '█ █', '▀█▀'], K: ['█ █', '██ ', '█▄ ', '█ █', '█ █'], L: ['█  ', '█  ', '█  ', '█  ', '███'],
    M: ['█▄█', '███', '█ █', '█ █', '█ █'], N: ['█▄ █', '██▄█', '█ ██', '█  █', '█  █'], O: ['▄█▄', '█ █', '█ █', '█ █', '▀█▀'], P: ['██▄', '█ █', '██▀', '█  ', '█  '],
    Q: ['▄█▄', '█ █', '█ █', '█▄█', '▀██'], R: ['██▄', '█ █', '██▀', '█ █', '█ █'], S: ['▄██', '█  ', '▀█▄', '  █', '██▀'], T: ['███', ' █ ', ' █ ', ' █ ', ' █ '],
    U: ['█ █', '█ █', '█ █', '█ █', '▀█▀'], V: ['█ █', '█ █', '█ █', '▀▄▀', ' █ '], W: ['█ █', '█ █', '█ █', '███', '█▀█'], X: ['█ █', '▀▄▀', ' █ ', '▄▀▄', '█ █'],
    Y: ['█ █', '█ █', '▀█▀', ' █ ', ' █ '], Z: ['███', '  █', ' █ ', '█  ', '███'], ' ': ['  ', '  ', '  ', '  ', '  '],
  };
  E.BIG_FONT = FONT;
  const bigText = (s) => {
    const norm = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const rows = ['', '', '', '', ''];
    for (const ch of norm) {
      const g = FONT[ch] || FONT[' '];
      for (let r = 0; r < 5; r++) rows[r] += g[r] + ' ';
    }
    return rows;
  };

  E.Menu = {
    sel: 0,
    open(kind) {
      E.UI.menuOpen = kind;
      if (E.UI.invOpen) E.UI.toggleInventory(false);
      G().paused = true;
      this.kind = kind;
      this.sel = 0;
      this.render();
      $('#menu').className = 'open ' + kind;
    },
    close() {
      if (E.TitleArt) E.TitleArt.hide();
      E.UI.menuOpen = false;
      G().paused = false;
      $('#menu').className = '';
      E.Audio.play('ok');
    },
    items() {
      const O = E.Options, save = E.Save.load();
      if (this.kind === 'title')
        return [save && ['cont', 'Continuar'], ['new', 'Novo jogo'], ['opts', 'Opções'], window.desktop && ['quit', 'Sair']].filter(Boolean);
      if (this.kind === 'pause') return [['resume', 'Continuar'], ['opts', 'Opções'], ['title', 'Menu principal'], window.desktop && ['quit', 'Sair do jogo']].filter(Boolean);
      return [
        ['master', 'Volume geral', 'bar', O.master],
        ['music', 'Música', 'bar', O.music],
        ['sfx', 'Efeitos', 'bar', O.sfx],
        ['font', 'Tamanho do glifo', 'num', G().fontSize],
        ['glow', 'Brilho (bloom)', 'bar', (G().world.settings.glow || 1) / 2.5],
        ['shake', 'Tremor de tela', 'chk', O.shake],
        ['fps', 'Mostrar FPS', 'chk', O.fps],
        ['creative', 'Modo criativo (tecla C)', 'chk', O.creative],
        ['fs', 'Tela cheia', 'act'],
        ['back', 'Voltar', 'act'],
      ];
    },
    render() {
      const its = this.items();
      this.sel = Math.max(0, Math.min(this.sel, its.length - 1));
      const W = 52;
      const L = [];
      // menu principal: a cena do cavaleiro (title.js) fica por trás, também nas Opções abertas a partir dele
      const titleMode = this.kind === 'title' || (this.kind === 'opts' && this.back === 'title');
      if (E.TitleArt) titleMode ? E.TitleArt.show() : E.TitleArt.hide();
      if (this.kind === 'title') L.push('<span class="fr">' + ' '.repeat(16) + '·  ·  ·  ✦  ·  ·  ·</span>', '');
      its.forEach(([k, label, type, v], i) => {
        const on = i === this.sel;
        let right = '';
        if (type === 'bar') right = `${E.asciiBar(v, 12)} ${String(Math.round(v * 100)).padStart(3)}%`;
        else if (type === 'chk') right = v ? '<span class="acc">[■]</span>' : '<span class="fr">[ ]</span>';
        else if (type === 'num') right = `<span class="fr">◄</span> ${v} <span class="fr">►</span>`;
        const left = `${on ? '<span class="acc">▶</span>' : ' '} <span class="${on ? 'acc' : ''}">${esc(label)}</span>`;
        L.push(`<span data-mi="${i}" class="mi">${E.asciiPad(left, W - (right ? 24 : 0))}${right ? E.asciiPad(right, 24) : ''}</span>`);
      });
      L.push('');
      L.push('<span class="fr">[↑↓] escolher   [Enter] confirmar</span>', '<span class="fr">[←→] ajustar    [Esc] voltar</span>');
      const title = this.kind === 'title' ? '' : this.kind === 'pause' ? 'PAUSADO' : 'OPÇÕES';
      $('#menu').innerHTML = `<pre class="ascii menu-box">${E.asciiBox(title, L, W, 'double')}</pre>`;
      $('#menu').classList.toggle('title', titleMode);
      const m = $('#menu');
      m.onmousemove = (e) => {
        const it = e.target.closest('[data-mi]');
        if (it && +it.dataset.mi !== this.sel) {
          this.sel = +it.dataset.mi;
          E.Audio.play('menu', { gap: 0.04 });
          this.render();
        }
      };
      m.onclick = (e) => {
        const it = e.target.closest('[data-mi]');
        if (!it) return;
        this.sel = +it.dataset.mi;
        const t = this.items()[this.sel];
        if (t[2] === 'bar' || t[2] === 'num') this.adjust(1);
        else this.activate();
      };
      m.oncontextmenu = (e) => {
        e.preventDefault();
        this.adjust(-1);
      };
    },
    adjust(d) {
      const it = this.items()[this.sel];
      if (!it) return;
      const O = E.Options, k = it[0];
      if (it[2] === 'bar') {
        if (k === 'glow') G().world.settings.glow = Math.max(0, Math.min(2.5, (G().world.settings.glow || 1) + d * 0.25));
        else O[k] = Math.round(Math.max(0, Math.min(1, O[k] + d * 0.1)) * 10) / 10;
      } else if (it[2] === 'num' && k === 'font') E.setFontSize(Math.max(4, Math.min(14, G().fontSize + d)));
      else if (it[2] === 'chk') O[k] = !O[k];
      else return;
      E.saveOptions();
      E.Audio.play('menu');
      this.render();
    },
    activate() {
      const it = this.items()[this.sel];
      if (!it) return;
      const k = it[0];
      E.Audio.play('ok');
      if (it[2] === 'chk') return this.adjust(1);
      if (k === 'cont') {
        E.Save.apply(E.Save.load());
        this.close();
      } else if (k === 'new') {
        if (window.GAME_DATA) E.ProjectIO.fromJSON(JSON.parse(JSON.stringify(window.GAME_DATA)));
        G().inv = new E.Inventory();
        G().inv.add('pocao', 2);
        G().enterWorld(E.Project.worlds[E.Project.startMap]);
        this.close();
      } else if (k === 'resume') this.close();
      else if (k === 'opts') {
        this.back = this.kind;
        this.kind = 'opts';
        this.sel = 0;
        this.render();
      } else if (k === 'back') {
        this.kind = this.back || 'pause';
        this.sel = 0;
        this.render();
      } else if (k === 'title') {
        this.kind = 'title';
        this.sel = 0;
        $('#menu').className = 'open title';
        this.render();
      } else if (k === 'fs') fullscreen();
      else if (k === 'quit') quit();
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F11') {
      e.preventDefault();
      fullscreen();
    }
    if (E.Editor && E.Editor.active) return;
    const M = E.Menu;
    if (E.UI.menuOpen) {
      const n = M.items().length;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        M.sel = (M.sel - 1 + n) % n;
        E.Audio.play('menu');
        M.render();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        M.sel = (M.sel + 1) % n;
        E.Audio.play('menu');
        M.render();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') M.adjust(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') M.adjust(1);
      else if (e.code === 'Enter' || e.code === 'Space') M.activate();
      else if (e.code === 'Escape') {
        if (M.kind === 'opts') {
          M.kind = M.back || 'pause';
          M.sel = 0;
          M.render();
        } else if (M.kind === 'pause') M.close();
      }
      e.preventDefault();
      return;
    }
    if (e.code !== 'Escape') return;
    if (E.UI.invOpen) return E.UI.toggleInventory(false);
    if (E.UI.shopOpen) return E.UI.closeShop();
    if (E.Creative && E.Creative.active) return E.Creative.toggle(false);
    M.open('pause');
  });
})();

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
      // saves antigos podem apontar para mapas de masmorra que agora fazem parte do mundo principal
      const w = E.Project.worlds[d.map] || E.Project.worlds[E.Project.startMap];
      if (w.id !== d.map) Object.assign(d, w.spawn);
      w.spawn = { x: d.x, y: d.y };
      G().inv = new E.Inventory();
      G().inv.slots = d.inv || G().inv.slots;
      while (G().inv.slots.length < 25) G().inv.slots.push(null); // saves antigos tinham 20 espaços
      G().inv.weapon = d.weapon === undefined ? 'espada' : d.weapon; // null = de mãos vazias
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
        ['glow', 'Halo das luzes', 'bar', (G().world.settings.glow || 1) / 2.5],
        ['grade', 'Paleta de cor (F8)', 'opt', (E.GRADES[O.grade ?? 1] || E.GRADES[0]).name],
        ['filter', 'Filtro (tecla F7)', 'opt', E.FILTERS[O.filter] || E.FILTERS[0]],
        ['outline', 'Contorno do herói', 'chk', O.outline],
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
      // menu principal: a cena do herói (title.js) fica por trás, também nas Opções abertas a partir dele
      const titleMode = this.kind === 'title' || (this.kind === 'opts' && this.back === 'title');
      if (E.TitleArt) titleMode ? E.TitleArt.show() : E.TitleArt.hide();
      const ICON = { cont: '▶', new: '✦', opts: '≡', quit: 'x', resume: '▶', title: '⌂', fs: '□', back: '◄' }; // só glifos de largura simples (não entortam a moldura)
      const SEC = { master: 'SOM', font: 'VÍDEO', shake: 'JOGO' };
      if (this.kind === 'title') L.push('<span class="fr">' + ' '.repeat(15) + '·  ·  ·  <span class="acc">✦</span>  ·  ·  ·</span>', '');
      its.forEach(([k, label, type, v], i) => {
        if (this.kind === 'opts' && SEC[k]) {
          if (i) L.push('');
          L.push(`<span class="sec">── ${SEC[k]} ${'─'.repeat(W - 5 - SEC[k].length)}</span>`);
        }
        const on = i === this.sel;
        let right = '';
        if (type === 'bar') right = `${E.asciiBar(v, 12)} ${String(Math.round(v * 100)).padStart(3)}%`;
        else if (type === 'chk') right = v ? '<span class="acc">[■] sim</span>' : '<span class="fr">[ ] não</span>';
        else if (type === 'num' || type === 'opt') right = `<span class="fr">◄</span> ${v} <span class="fr">►</span>`;
        const ic = ICON[k] ? `<span class="${on ? 'acc' : 'fr'}">${ICON[k]}</span> ` : '  ';
        const left = `${on ? '<span class="acc">›</span>' : ' '} ${ic}<span class="${on ? 'acc' : ''}">${esc(label)}</span>`;
        L.push(`<span data-mi="${i}" class="mi${on ? ' on' : ''}">${E.asciiPad(left, W - (right ? 24 : 0))}${right ? E.asciiPad(right, 24) : ''}</span>`);
        // resumo do jogo salvo embaixo de "Continuar"
        if (k === 'cont') {
          const info = this.saveInfo();
          if (info) L.push(`<span class="fr">     ${info}</span>`);
        }
      });
      L.push('');
      L.push('<span class="fr">[↑↓] escolher   [Enter] confirmar</span>', `<span class="fr">${this.kind === 'opts' ? '[←→] ajustar    ' : '[F11] tela cheia '}[Esc] voltar</span>`);
      const title = this.kind === 'title' ? '' : this.kind === 'pause' ? 'PAUSADO' : 'OPÇÕES';
      const box = E.asciiBox(title, L, W, 'double');
      if (this.kind === 'pause') {
        // pausa: o herói em 3D girando e os dados da partida ao lado do menu
        const left = E.asciiBox(esc(G().name || 'Herói').toUpperCase(), this.pauseCard(), 30, 'double').split('\n'), right = box.split('\n');
        const n = Math.max(left.length, right.length), out = [];
        for (let i = 0; i < n; i++) out.push(E.asciiPad(left[i] || '', 34) + ' ' + (right[i] || ''));
        $('#menu').innerHTML = `<pre class="ascii menu-box">${out.join('\n')}</pre>`;
      } else $('#menu').innerHTML = `<pre class="ascii menu-box">${box}</pre>`;
      $('#menu').classList.toggle('title', titleMode);
      clearInterval(this._spin);
      if (this.kind === 'pause') {
        this.rotY ??= 0.6;
        this._spin = setInterval(() => {
          if (E.UI.menuOpen !== 'pause' || this.kind !== 'pause') return clearInterval(this._spin);
          this.rotY += 0.07;
          const inv = G().inv, Lh = E.Hero3D ? E.Hero3D.lines(28, 20, this.rotY, inv.look(), inv.weaponDef(), performance.now() / 1000) : [];
          document.querySelectorAll('#menu .p3d').forEach((el) => (el.innerHTML = Lh[+el.dataset.r] || ''));
        }, 70);
      }
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
    // resumo do save: vida, moedas, onde o herói parou e há quanto tempo
    saveInfo() {
      const d = E.Save.load();
      if (!d) return '';
      const coins = (d.inv || []).reduce((n, q) => n + (q && q.id === 'moeda' ? q.qty || 1 : 0), 0);
      return [`<span class="hp">♥</span> ${d.hp ?? '?'}`, `<span class="acc">o</span> ${coins}`, this.where(E.Project.worlds[d.map], d.x, d.y), d.t ? this.ago(d.t) : ''].filter(Boolean).join(' · ');
    },
    where(w, x, y) {
      if (!w) return '';
      const dg = w.dungeonAt && w.dungeonAt(x, y);
      if (dg) return dg.name;
      const b = (w.biomes || []).find((q) => x >= q.x0 && x < q.x1);
      return b ? E.BIOME_NAMES[b.id] || b.id : w.name || '';
    },
    ago(t) {
      const m = Math.round((Date.now() - t) / 60000);
      return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
    },
    // cartão da pausa: herói 3D + vida, moedas, defesa, arma, local e hora
    pauseCard() {
      const inv = G().inv, p = G().player, w = G().world, s = w.settings;
      this.rotY ??= 0.6;
      const L = (E.Hero3D ? E.Hero3D.lines(28, 20, this.rotY, inv.look(), inv.weaponDef(), performance.now() / 1000) : []).map((l, k) => `<span class="p3d" data-r="${k}">${l}</span>`);
      L.push('---');
      const hearts = '<span class="hp">' + '♥'.repeat(Math.max(0, Math.ceil(p.hp))) + '</span><span class="fr">' + '♡'.repeat(Math.max(0, p.maxHp - Math.ceil(p.hp))) + '</span>';
      const wd = inv.weapon && E.Project.items[inv.weapon];
      L.push(`<span class="fr">Vida  </span> ${hearts}`);
      L.push(`<span class="fr">Moedas</span> <span class="acc">${inv.count('moeda')}</span>   <span class="fr">Defesa</span> ${inv.defense()}`);
      L.push(`<span class="fr">Arma  </span> ${wd ? esc(inv.label(inv.weapon)) : '—'}`);
      L.push(`<span class="fr">Local </span> ${esc(this.where(w, p.x, p.y))}`);
      if (s.dayNight && s.sky !== 'Caverna') {
        const h = s.hour ?? 0;
        L.push(`<span class="fr">Hora  </span> ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} ${h >= 6 && h < 19 ? '☼' : '☾'}`);
      }
      return L;
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
      else if (k === 'grade') O.grade = ((O.grade ?? 1) + d + E.GRADES.length) % E.GRADES.length;
      else if (k === 'filter') O.filter = ((O.filter || 0) + d + E.FILTERS.length) % E.FILTERS.length;
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

  // filtros de tela (índice = uFilter no shader)
  E.FILTERS = ['Nenhum', 'CRT', 'Vivo', 'Pergaminho', 'Fósforo verde', 'Noite fria', '1-bit'];
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F11') {
      e.preventDefault();
      fullscreen();
    }
    if (e.code === 'F8') {
      e.preventDefault();
      const O = E.Options;
      O.grade = ((O.grade ?? 1) + (e.shiftKey ? -1 : 1) + E.GRADES.length) % E.GRADES.length;
      E.saveOptions();
      if (E.toast) E.toast('Paleta: ' + E.GRADES[O.grade].name);
      if (E.UI.menuOpen) E.Menu.render();
    }
    if (e.code === 'F7') {
      e.preventDefault();
      const O = E.Options;
      O.filter = ((O.filter || 0) + (e.shiftKey ? -1 : 1) + E.FILTERS.length) % E.FILTERS.length;
      E.saveOptions();
      if (E.toast) E.toast('Filtro: ' + E.FILTERS[O.filter]);
      if (E.UI.menuOpen) E.Menu.render();
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

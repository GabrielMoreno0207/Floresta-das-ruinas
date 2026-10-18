'use strict';
// Interface do jogo 100% ASCII: HUD, hotbar, mensagens, coletas e inventário (teclado e mouse).
(function () {
  const E = window.ENG;
  const G = () => E.Game;
  const $ = (s) => document.querySelector(s);
  const css = (c) => `rgb(${(c || [1, 1, 1]).map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ---------- construtor de janelas ASCII ----------
  const visLen = (s) => [...String(s).replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '_')].length;
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - visLen(s)));
  const fr = (s) => `<span class="fr">${s}</span>`;
  const STY = {
    double: ['╔', '═', '╗', '║', '╚', '╝', '╟', '─', '╢'],
    single: ['┌', '─', '┐', '│', '└', '┘', '├', '─', '┤'],
  };
  // lines: strings (HTML permitido); '---' = separador
  E.asciiBox = (title, lines, w, style = 'double') => {
    const c = STY[style];
    const t = title ? ` ${title} ` : '';
    const left = Math.floor((w + 2 - visLen(t)) / 2);
    const top = fr(c[0] + c[1].repeat(Math.max(0, left)) ) + `<span class="tt">${t}</span>` + fr(c[1].repeat(Math.max(0, w + 2 - left - visLen(t))) + c[2]);
    const out = [top];
    for (const l of lines) {
      if (l === '---') out.push(fr(c[6] + c[7].repeat(w + 2) + c[8]));
      else out.push(fr(c[3]) + ' ' + pad(l, w) + ' ' + fr(c[3]));
    }
    out.push(fr(c[4] + c[1].repeat(w + 2) + c[5]));
    return out.join('\n');
  };
  E.asciiBar = (v, n = 10) => {
    const k = Math.round(Math.max(0, Math.min(1, v)) * n);
    return `<span class="acc">${'■'.repeat(k)}</span><span class="fr">${'□'.repeat(n - k)}</span>`;
  };
  E.asciiPad = pad;

  // caixinha de espaço do inventário (3 linhas) com data-i em cada pedaço
  const slotLines = (s, i, sel, label) => {
    const d = s && E.Project.items[s.id];
    const g = d ? `<span style="color:${css(d.color)}">${esc(d.glyph)}</span>` : ' ';
    const q = s && s.qty > 1 ? String(Math.min(99, s.qty)).padStart(2) : '  ';
    const c = sel ? ['╔', '═', '╗', '║', '╚', '╝'] : ['┌', '─', '┐', '│', '└', '┘'];
    const k = sel ? 'acc' : 'fr';
    const lab = label != null ? String(label) : c[1];
    return [
      `<span data-i="${i}" class="${k}">${c[0]}${c[1].repeat(3)}${c[2]}</span>`,
      `<span data-i="${i}"><span class="${k}">${c[3]}</span>${g}${q}<span class="${k}">${c[3]}</span></span>`,
      `<span data-i="${i}" class="${k}">${c[4]}${c[1]}${lab}${c[1]}${c[5]}</span>`,
    ];
  };

  const slotBig = (s, i, sel, label) => {
    const d = s && E.Project.items[s.id];
    const IW = 6, IH = 5;
    const c = sel ? ['╔', '═', '╗', '║', '╚', '╝'] : ['┌', '─', '┐', '│', '└', '┘'];
    const k = sel ? 'acc' : 'fr';
    const rows = [];
    let ic = null;
    if (d && d.icon) ic = d.icon;
    const oy = ic ? Math.floor((IH - Math.min(IH, ic.h)) / 2) : 0, ox = ic ? Math.floor((IW - Math.min(IW, ic.w)) / 2) : 0;
    rows.push(`<span data-i="${i}" class="${k}">${c[0]}${c[1].repeat(IW)}${c[2]}</span>`);
    for (let y = 0; y < IH; y++) {
      let line = '';
      for (let x = 0; x < IW; x++) {
        if (ic) {
          const yy = y - oy, xx = x - ox;
          const cell = yy >= 0 && xx >= 0 && yy < ic.h && xx < ic.w ? ic.cells[yy * ic.w + xx] : null;
          line += cell ? `<span style="color:${cell[1]}">${esc(cell[0])}</span>` : ' ';
        } else if (d && y === 2 && x === 2) line += `<span style="color:${css(d.color)}">${esc(d.glyph)}</span>`;
        else line += ' ';
      }
      rows.push(`<span data-i="${i}"><span class="${k}">${c[3]}</span>${line}<span class="${k}">${c[3]}</span></span>`);
    }
    const q = s && s.qty > 1 ? 'x' + s.qty : '';
    const lab = label != null ? String(label) : '';
    const mid = (lab + c[1].repeat(IW)).slice(0, IW - q.length) + q;
    rows.push(`<span data-i="${i}" class="${k}">${c[4]}${mid}${c[5]}</span>`);
    return rows;
  };

  E.HOTBAR = 10; // espaços da hotbar (os primeiros do inventário)
  E.UI = {
    invOpen: false,
    menuOpen: false,
    msgT: 0,
    invSel: 0,
    init() {
      $('#ui').innerHTML = `<pre id="uiTop" class="ascii"></pre><pre id="uiHot" class="ascii"></pre><pre id="uiMsg" class="ascii"></pre><pre id="uiFeed" class="ascii"></pre><pre id="uiFps" class="ascii"></pre><div id="uiInv"><pre class="ascii" id="invBox"></pre></div><pre id="uiBoss" class="ascii"></pre><div id="uiShop"><pre class="ascii" id="shopBox"></pre></div><div id="uiMap"></div><div id="uiBubbles"></div>`;
      const hot = $('#uiHot'), box = $('#invBox');
      hot.addEventListener('click', (e) => {
        const s = e.target.closest('[data-i]');
        if (s && G().inv.use(+s.dataset.i, E.API)) this.refresh();
      });
      box.addEventListener('mousemove', (e) => {
        const s = e.target.closest('[data-i]');
        if (s && +s.dataset.i !== this.invSel) {
          this.invSel = +s.dataset.i;
          E.Audio.play('menu', { gap: 0.04 });
          this.refresh();
        }
      });
      // herói 3D do inventário: arrastar com o mouse gira; os botões ◄ ► giram 45°
      this.rotY = 0.5;
      this.rotAuto = true;
      box.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.p3d')) return;
        this._rotDrag = { x: e.clientX, y0: this.rotY };
        this.rotAuto = false;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!this._rotDrag) return;
        this.rotY = this._rotDrag.y0 + (e.clientX - this._rotDrag.x) * 0.016;
        this.updateHero3D();
      });
      window.addEventListener('mouseup', () => {
        if (this._rotDrag) setTimeout(() => (this.rotAuto = true), 2500); // volta a girar sozinho depois de um tempo
        this._rotDrag = null;
      });
      box.addEventListener('click', (e) => {
        const rb = e.target.closest('[data-rot]');
        if (rb) {
          this.rotY += (+rb.dataset.rot * Math.PI) / 4;
          this.rotAuto = false;
          E.Audio.play('menu', { gap: 0.04 });
          this.updateHero3D();
        }
        const s = e.target.closest('[data-i]');
        if (s) this.useSel();
        const eq = e.target.closest('[data-eq]');
        if (eq && G().inv.unequip(eq.dataset.eq)) {
          E.Audio.play('equipar');
          this.refresh();
        }
        if (e.target.closest('[data-act="close"]')) this.toggleInventory(false);
      });
      const sb = $('#shopBox');
      sb.addEventListener('mousemove', (e) => {
        const s = e.target.closest('[data-s]');
        if (s && +s.dataset.s !== this.shopSel) {
          this.shopSel = +s.dataset.s;
          E.Audio.play('menu', { gap: 0.04 });
          this.renderShop();
        }
      });
      sb.addEventListener('click', (e) => {
        if (e.target.closest('[data-s]')) this.shopAct();
        if (e.target.closest('[data-act="close"]')) this.closeShop();
      });
      window.addEventListener('keydown', (e) => {
        if (!this.shopOpen) return;
        const n = this._shopN || 1;
        const mv = { ArrowUp: -1, ArrowDown: 1, KeyW: -1, KeyS: 1 }[e.code];
        if (mv) {
          e.preventDefault();
          this.shopSel = (this.shopSel + mv + n) % n;
          E.Audio.play('menu');
          this.renderShop();
        } else if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.shopAct();
        } else if (e.code === 'KeyE' || e.code === 'KeyI') this.closeShop();
      });
      box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.target.closest('[data-i]')) this.dropSel();
      });
      window.addEventListener('keydown', (e) => {
        if (!this.invOpen) return;
        const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5, KeyA: -1, KeyD: 1, KeyW: -5, KeyS: 5 }[e.code];
        if (mv) {
          e.preventDefault();
          this.invSel = (this.invSel + mv + 20) % 20;
          E.Audio.play('menu');
          this.refresh();
        } else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') {
          e.preventDefault();
          this.useSel();
        } else if (e.code === 'KeyX' || e.code === 'Delete') this.dropSel();
      });
    },
    useSel() {
      if (G().inv.use(this.invSel, E.API)) {
        E.Audio.play('ok');
        this.refresh();
      }
    },
    dropSel() {
      const inv = G().inv, slot = inv.slots[this.invSel];
      if (!slot) return;
      const p = G().player;
      E.Ents.dropItem(slot.id, p.x + p.facing * 6, p.y - 4, slot.qty).age = -0.6;
      inv.slots[this.invSel] = null;
      E.Audio.play('colocar');
      this.refresh();
    },
    refresh() {
      const p = G().player, inv = G().inv;
      if (!p || !inv) return;
      // painel do herói
      let hp = '';
      for (let i = 0; i < p.maxHp; i++) hp += i < p.hp ? '<span class="hp">♥</span>' : '<span class="fr">♡</span>';
      const coins = `<span style="color:#ffd23f">o</span> ${inv.count('moeda')}`;
      const st = Object.entries(p.status || {}).map(([k, t]) => `<span style="color:${css(E.STATUS[k]?.color)}">${k} ${Math.ceil(t)}s</span>`);
      const lines = [`${hp}  ${coins}`];
      const st0 = G().world && G().world.settings;
      if (st0 && st0.dayNight && st0.sky !== 'Caverna') {
        const h = st0.hour ?? 21, hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
        lines.push(`${G().isDay ? '<span class="acc">☼</span>' : '<span style="color:#a9c1ff">☾</span>'} ${hh}:${mm}`);
      }
      if (st.length) lines.push(st.join(' '));
      $('#uiTop').innerHTML = E.asciiBox(esc(G().name || 'Herói'), lines, Math.max(18, p.maxHp + 8), 'single');
      // hotbar
      // 10 espaços grandes (teclas 1–9 e 0), com o ícone inteiro como no inventário
      const rows = ['', '', '', '', '', '', ''];
      inv.slots.slice(0, E.HOTBAR).forEach((s, i) => slotBig(s, i, i === inv.hot, (i + 1) % 10).forEach((l, k) => (rows[k] += l)));
      $('#uiHot').innerHTML = rows.join('\n');
      if (this.invOpen) this.renderInventory();
    },
    // retrato do herói em ASCII (maior que no jogo), com as armaduras equipadas
    heroPortrait(cols = 30, rows = 26) {
      const inv = G().inv;
      const W = cols * 8, H = Math.round(rows * 8 * E.aspect);
      const cv = (this._pcv ||= document.createElement('canvas'));
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, W, H);
      const img = E.Project.player.image;
      if (img && img.src) E.drawImageHero(ctx, W, H, img, 'idle', performance.now() / 1000, 1, { variant: G().inv.weaponDef().shape, look: G().inv.look(), weapon: G().inv.weaponDef() });
      else {
        const fcv = (this._pfcv ||= document.createElement('canvas'));
        fcv.width = W;
        fcv.height = H;
        const fctx = fcv.getContext('2d');
        ctx.save();
        fctx.save();
        ctx.translate(-W * 0.15, 0);
        fctx.translate(-W * 0.15, 0);
        const t = performance.now() / 1000;
        const capeL = [0, 1, 2, 3, 4].map((i) => [W * 0.42 - i * W * 0.05 + Math.sin(t * 1.5 + i) * 3, H * 0.33 + i * H * 0.13]);
        E.drawHeroLine(ctx, fctx, W * 1.3, H, { unit: (W * 1.3) / 22, state: 'idle', t, phase: 0, facing: 1, vx: 0, vy: 0, atk: { n: 1, t: 0, local: Math.PI / 2 }, weaponColor: inv.weaponDef().color, weaponShape: inv.weaponDef().shape, gear: inv.look(), cape: capeL });
        ctx.restore();
        fctx.restore();
        this._portraitLine = true;
      }
      const fr = this._portraitLine ? E.canvasToLineCells(cv, this._pfcv, cols, rows) : E.canvasToCells(cv, cols, rows);
      this._portraitLine = false;
      const ramp = [...E.MAT_BY_ID[E.MAT.INK].glyphs], chars = [...E.ATLAS_CHARS];
      const lines = [];
      for (let y = 0; y < rows; y++) {
        let s = '';
        for (let x = 0; x < cols; x++) {
          const c = fr.cells[y * cols + x];
          if (!c) {
            s += ' ';
            continue;
          }
          const l = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
          const g = c[3] >= 0 ? chars[c[3]] : ramp[Math.min(ramp.length - 1, Math.floor(l * 1.15 * ramp.length))];
          s += `<span style="color:rgb(${Math.min(255, c[0] * 1.2) | 0},${Math.min(255, c[1] * 1.2) | 0},${Math.min(255, c[2] * 1.2) | 0})">${esc(g)}</span>`;
        }
        lines.push(s);
      }
      return lines;
    },
    // ícone ASCII multi-célula de um item
    iconLines(d) {
      const ic = d && d.icon;
      if (!ic) return [`<span style="color:${css(d && d.color)}">${esc(d ? d.glyph : ' ')}</span>`];
      const out = [];
      for (let y = 0; y < ic.h; y++) {
        let s = '';
        for (let x = 0; x < ic.w; x++) {
          const c = ic.cells[y * ic.w + x];
          s += c ? `<span style="color:${c[1]}">${esc(c[0])}</span>` : ' ';
        }
        out.push(s);
      }
      return out;
    },
    renderInventory() {
      const inv = G().inv, W = 50;
      const name = (id, w = 18) => {
        const d = id && E.Project.items[id];
        const t = d ? (d.glyph + ' ' + inv.label(id)).slice(0, w) : '—';
        return d ? `<span style="color:${css(d.color)}">${esc(t)}</span>` + ' '.repeat(Math.max(0, w - [...t].length)) : `<span class="fr">—</span>${' '.repeat(w - 1)}`;
      };
      // coluna da direita: grade de itens
      const L = [];
      for (let r = 0; r < Math.ceil(inv.slots.length / 5); r++) {
        const rows = ['', '', '', '', '', '', ''];
        for (let c = 0; c < 5; c++) {
          const i = r * 5 + c;
          slotBig(inv.slots[i], i, i === this.invSel, i < E.HOTBAR ? (i + 1) % 10 : null).forEach((l, k) => (rows[k] += l));
        }
        if (r * 5 < E.HOTBAR) rows[3] += ' <span class="fr">←hotbar</span>';
        L.push(...rows);
      }
      L.push('---');
      const s = inv.slots[this.invSel], d = s && E.Project.items[s.id];
      const types = { consumivel: 'consumível', arma: 'arma', luz: 'luz', arremesso: 'arremesso', chave: 'chave', material: 'material', armadura: 'armadura' };
      const info = [];
      if (d) {
        info.push(`<span style="color:${css(d.color)}">${esc(inv.label(s.id))}</span>${s.qty > 1 ? ' x' + s.qty : ''}`);
        info.push(`<span class="fr">[${types[d.type] || d.type}${d.slot ? ' · ' + d.slot : ''}${d.defense ? ' · def ' + d.defense : ''}${d.weapon ? ' · dano ' + (d.weapon.projectile ? d.weapon.projectile.damage : d.weapon.damage) : ''}${d.price ? ' · ' + d.price + 'o' : ''}]</span>`);
        const words = String(d.desc || '').split(' ');
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 32) {
            info.push(esc(line.trim()));
            line = '';
          }
          line += ' ' + w;
        }
        if (line.trim()) info.push(esc(line.trim()));
      } else info.push('<span class="fr">(espaço vazio)</span>');
      const ic = d ? this.iconLines(d) : [];
      const icw = d && d.icon ? d.icon.w : 1;
      const n = Math.max(5, ic.length, info.length);
      for (let k = 0; k < n; k++) L.push(E.asciiPad(ic[k] || '', icw) + '  ' + (info[k] || ''));
      L.push('---');
      L.push('<span class="fr">[Enter]</span> usar  <span class="fr">[X]</span> largar  <span class="fr">[setas]</span> mover');
      L.push('<span class="fr">[clique]</span> usar  <span class="fr">[dir.]</span> largar  <span data-act="close" class="btn">[I] fechar</span>');
      const right = E.asciiBox('INVENTÁRIO', L, W, 'double').split('\n');
      // coluna da esquerda: herói em 3D ASCII (gira) + equipamento
      const PW = 44, PH = 34;
      const PL = E.Hero3D ? E.Hero3D.lines(PW, PH, this.rotY, inv.look(), inv.weaponDef(), performance.now() / 1000).map((l, k) => `<span class="p3d" data-r="${k}">${l}</span>`) : this.heroPortrait();
      PL.push(`<span data-rot="-1" class="btn">[◄]</span> <span class="fr">arraste para girar</span> <span data-rot="1" class="btn">[►]</span>`);
      PL.push('---');
      const eq = [['cabeca', 'Cabeça'], ['corpo', 'Corpo '], ['pes', 'Pés   ']];
      for (const [k, lab] of eq) PL.push(`<span data-eq="${k}" class="mi"><span class="fr">${lab}</span> [${name(inv.gear && inv.gear[k], 20)}]</span>`);
      PL.push(`<span data-eq="arma" class="mi"><span class="fr">Arma  </span> [${name(inv.weapon, 20)}]</span>`);
      PL.push(`<span class="fr">Luz   </span> [${name(inv.light, 20)}]`);
      const def = inv.defense(), sp = Math.round((inv.speedMul() - 1) * 100);
      PL.push(`<span class="fr">Defesa</span> ${E.asciiBar(def / 4, 8)} ${def}   <span class="fr">Vel.</span> ${sp >= 0 ? '+' : ''}${sp}%`);
      const left = E.asciiBox(esc(G().name || 'Herói').toUpperCase(), PL, PW, 'double').split('\n');
      const lw = PW + 4, n2 = Math.max(left.length, right.length);
      const out = [];
      for (let k = 0; k < n2; k++) out.push(E.asciiPad(left[k] || '', lw) + ' ' + (right[k] || ''));
      $('#invBox').innerHTML = out.join('\n');
      this._invT = performance.now();
    },
    // gira o herói 3D trocando só as linhas dele (os espaços de item continuam os mesmos elementos)
    updateHero3D() {
      this._h3T = performance.now();
      const rows = document.querySelectorAll('#invBox .p3d');
      if (!rows.length || !E.Hero3D) return;
      const inv = G().inv, L = E.Hero3D.lines(44, 34, this.rotY, inv.look(), inv.weaponDef(), performance.now() / 1000);
      rows.forEach((el) => (el.innerHTML = L[+el.dataset.r] || ''));
    },
    // barra de vida do chefe acordado
    bossBar() {
      const el = $('#uiBoss');
      if (!el) return;
      const b = E.Ents.list.find((e) => e.kind === 'creature' && e.def.boss && e.vars.awake && !e.dead);
      const key = b ? b.uid + '|' + Math.ceil(b.hp) : '';
      if (key === this._bossKey) return;
      this._bossKey = key;
      if (!b) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      const f = Math.max(0, b.hp / b.maxHp), n = 44, k = Math.round(f * n);
      el.innerHTML = `<span class="hp">☠ ${esc(b.def.name.toUpperCase())} ☠</span>\n<span class="fr">[</span><span class="hp">${'█'.repeat(k)}</span><span class="fr">${'░'.repeat(n - k)}]</span>`;
    },
    tick(dt) {
      this.bubbles();
      this.bossBar();
      if (this.invOpen && this.rotAuto && !this._rotDrag) this.rotY += dt * 0.7;
      if (this.invOpen && performance.now() - (this._h3T || 0) > 60) this.updateHero3D();
      if (this.msgT > 0) {
        this.msgT -= dt;
        if (this.msgT <= 0) $('#uiMsg').classList.remove('show');
      }
      const p = G().player;
      const st1 = G().world && G().world.settings;
      const key = p.hp + '|' + p.maxHp + '|' + Object.entries(p.status || {}).map(([k, t]) => k + Math.ceil(t)).join() + '|' + (st1 && st1.dayNight ? Math.floor((st1.hour || 0) * 6) : '');
      if (key !== this._k) {
        this._k = key;
        this.refresh();
      }
      const f = $('#uiFps');
      if (E.Options.fps) {
        if (!this._ft || performance.now() - this._ft > 400) {
          this._ft = performance.now();
          f.textContent = `[ ${G().fps} fps ]`;
        }
      } else if (f.textContent) f.textContent = '';
    },
    // balões de fala (HTML, letra maior) e etiqueta da criatura sob o mouse
    bubbles() {
      const host = $('#uiBubbles');
      if (!host) return;
      host.style.display = this.shopOpen || this.invOpen ? 'none' : '';
      const r = E.Renderer, g = G(), dpr = r.dpr || 1;
      const rect = r.canvas.getBoundingClientRect();
      const seen = new Set();
      const place = (key, html, wx, wy, cls) => {
        seen.add(key);
        let el = this._bub.get(key);
        if (!el) {
          el = document.createElement('pre');
          el.className = 'ascii bubble ' + cls;
          host.appendChild(el);
          this._bub.set(key, el);
        }
        if (el._html !== html) el.innerHTML = el._html = html;
        el.style.left = rect.left + ((wx - g.cam.x) * r.cw) / dpr + 'px';
        el.style.top = rect.top + ((wy - g.cam.y) * r.ch) / dpr + 'px';
      };
      this._bub ||= new Map();
      for (const e of E.Ents.list) {
        if (e.kind !== 'creature' || !e.say || !(e.sayT > 0) || !g.inView(e.x, e.y, 10)) continue;
        const words = e.say.split(' '), lines = [];
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 30) {
            lines.push(line.trim());
            line = '';
          }
          line += ' ' + w;
        }
        lines.push(line.trim());
        const wmax = Math.max(...lines.map((l) => l.length));
        place('s' + e.uid, E.asciiBox(esc(e.def.name), lines.map(esc), Math.max(wmax, e.def.name.length + 2), 'single') + '\n' + ' '.repeat(Math.floor(wmax / 2) + 1) + '<span class="fr">\\/</span>', e.x, e.y - (e.def.sh || e.h) - 1, 'say');
      }
      const h = g.hover;
      if (h && !(h.say && h.sayT > 0)) {
        let txt = `<span class="${h.team === 'inimigo' ? 'hp' : 'acc'}">${esc(h.def.name)}</span>`;
        if (h.maxHp) {
          let hp = '';
          for (let k = 0; k < Math.min(10, h.maxHp); k++) hp += k < Math.ceil((h.hp / h.maxHp) * Math.min(10, h.maxHp)) ? '♥' : '♡';
          txt += ' <span class="hp">' + hp + '</span>';
        }
        if (h.hooks && h.hooks.onInteract) txt += ' <span class="fr">[E]</span>';
        place('hover', txt, h.x, h.y - (h.def.sh || h.h) - 1, 'tag');
      }
      for (const [k, el] of this._bub) if (!seen.has(k)) {
        el.remove();
        this._bub.delete(k);
      }
    },
    message(text, secs = 3.5) {
      const words = String(text).split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > 52) {
          lines.push(line.trim());
          line = '';
        }
        line += ' ' + w;
      }
      lines.push(line.trim());
      const w = Math.max(...lines.map((l) => l.length));
      $('#uiMsg').innerHTML = E.asciiBox('', lines.map(esc), w, 'single');
      $('#uiMsg').classList.add('show');
      this.msgT = secs;
    },
    pickup(id, qty) {
      const d = E.Project.items[id];
      if (!d) return;
      const el = document.createElement('div');
      el.innerHTML = `<span class="fr">+</span>${qty} <span style="color:${css(d.color)}">${esc(d.glyph)}</span> ${esc(d.name)}`;
      $('#uiFeed').appendChild(el);
      setTimeout(() => el.remove(), 2200);
      this.refresh();
    },
    // mapa do mundo em ASCII (tecla M)
    toggleMap(on = !this.mapOpen) {
      this.mapOpen = on;
      const el = $('#uiMap');
      el.classList.toggle('open', on);
      E.Audio.play(on ? 'ok' : 'menu');
      if (!on) return;
      const w = G().world, p = G().player;
      const MW = 150, MH = 38, sx = w.W / MW, top = Math.max(0, Math.floor(w.H * 0.25)), sy = (w.H - top) / MH;
      const C = { 0: [' ', null], [E.MAT.WATER]: ['~', '#3b7fd0'], [E.MAT.LAVA]: ['~', '#ff6a1a'], [E.MAT.SAND]: ['.', '#d8b878'], [E.MAT.SANDSTONE]: ['=', '#b08850'], [E.MAT.SNOW]: ['*', '#e8eeff'], [E.MAT.ICE]: ['=', '#8fd0ff'], [E.MAT.GRASS]: ['"', '#5fbf4a'], [E.MAT.MOSS]: ['"', '#4f9a4a'], [E.MAT.DIRT]: ['%', '#7a5232'], [E.MAT.STONE]: ['#', '#6a7080'], [E.MAT.WOOD]: ['=', '#a87a4a'], [E.MAT.CRYSTAL]: ['◆', '#73eff7'], [E.MAT.ROOF]: ['^', '#8a4a3a'] };
      const lines = [];
      for (let my = 0; my < MH; my++) {
        let s = '';
        for (let mx = 0; mx < MW; mx++) {
          const x = Math.floor(mx * sx + sx / 2), y = Math.floor(top + my * sy + sy / 2);
          if (Math.abs(x - p.x) < sx && Math.abs(y - (p.y - 8)) < sy) {
            s += '<span class="acc">@</span>';
            continue;
          }
          const gate = (w.dungeons || []).find((d) => Math.abs(x - d.gate.x) < sx / 2 + 1 && Math.abs(y - d.gate.y) < sy);
          if (gate) {
            s += '<span style="color:#ffcf5a">▼</span>';
            continue;
          }
          let m = w.get('main', x, y);
          if (!m) {
            const b = w.get('back', x, y);
            if (b === E.MAT.STONE || b === E.MAT.MOSS) m = E.MAT.STONE;
            else if (b === E.MAT.LEAVES || b === E.MAT.PINE) {
              s += '<span style="color:#2f6a3a">♣</span>';
              continue;
            }
          }
          const c = C[m] || ['#', '#555a68'];
          s += c[1] ? `<span style="color:${c[1]}">${c[0]}</span>` : ' ';
        }
        lines.push(s);
      }
      const legend = (w.biomes || []).map((b) => (E.BIOME_NAMES[b.id] || b.id)).join(' · ');
      lines.push('---', `<span class="fr">${esc(legend)}</span>`);
      if (w.dungeons && w.dungeons.length) lines.push(`<span style="color:#ffcf5a">▼</span> <span class="fr">entradas: ${esc(w.dungeons.map((d) => d.name).join(' · '))}</span>`);
      lines.push('<span class="acc">@</span> você   <span class="fr">[M] fechar</span>');
      el.innerHTML = `<pre class="ascii">${E.asciiBox('MAPA — ' + esc(w.name), lines, MW, 'double')}</pre>`;
    },
    // ---------- loja do mercador ----------
    shopOpen: false,
    shopSel: 0,
    openShop(npc) {
      if (performance.now() - (this._shopClosed || 0) < 350 || this.shopOpen) return;
      const stock = (npc.props.stock && npc.props.stock.length ? npc.props.stock : ['pocao', 'pao', 'antidoto', 'tocha_mao', 'faca_arremesso']).filter((id) => E.Project.items[id]);
      this.shop = { npc, stock };
      this.shopOpen = true;
      this.shopSel = 0;
      $('#uiShop').classList.add('open');
      E.Audio.play('ok');
      this.renderShop();
    },
    closeShop() {
      this.shopOpen = false;
      this._shopClosed = performance.now();
      $('#uiShop').classList.remove('open');
      E.Audio.play('menu');
    },
    sellPrice(d) {
      return Math.max(1, Math.floor((d.price || 2) / 2));
    },
    // ---------- ferreiro: melhora a arma e as armaduras equipadas ----------
    openForge(npc) {
      if (performance.now() - (this._shopClosed || 0) < 350 || this.shopOpen) return;
      this.shop = { npc, forge: true, stock: [] };
      this.shopOpen = true;
      this.shopSel = 0;
      $('#uiShop').classList.add('open');
      E.Audio.play('ok');
      this.renderShop();
    },
    forgeList() {
      const inv = G().inv;
      return [['arma', 'Arma', inv.weapon], ['cabeca', 'Cabeça', inv.gear.cabeca], ['corpo', 'Corpo', inv.gear.corpo], ['pes', 'Pés', inv.gear.pes]].filter((r) => r[2]);
    },
    forgeCost(slot, lv) {
      return slot === 'arma' ? { coins: [40, 90, 180][lv], bars: [1, 2, 3][lv] } : { coins: [30, 70, 140][lv], bars: [1, 2, 3][lv] };
    },
    forgeAct() {
      const inv = G().inv, r = this.forgeList()[this.shopSel];
      if (!r) return;
      const [slot, , id] = r, lv = inv.level(id);
      if (lv >= 3) return E.Audio.play('bloqueio'), this.message('Já está no nível máximo.', 1.5);
      const c = this.forgeCost(slot, lv);
      if (inv.count('moeda') < c.coins || inv.count('lingote_ferro') < c.bars) return E.Audio.play('bloqueio'), this.message('Faltam moedas ou lingotes de ferro.', 1.8);
      inv.take('moeda', c.coins);
      inv.take('lingote_ferro', c.bars);
      inv.upg[id] = lv + 1;
      E.Audio.play('metal');
      setTimeout(() => E.Audio.play('metal'), 180);
      E.Audio.play('equipar');
      const n = this.shop.npc;
      E.API.anim(n, 'ataque', 0.5);
      E.FX.spawn('faisca', n.x - 6, n.y - 3);
      E.toast(inv.label(id) + '!');
      this.refresh();
      this.renderShop();
    },
    renderForge() {
      const inv = G().inv, items = E.Project.items, W = 60;
      const L = [];
      const list = this.forgeList();
      this._shopN = Math.max(1, list.length);
      this.shopSel = Math.min(this.shopSel, this._shopN - 1);
      L.push(`<span class="fr">Moedas:</span> <span style="color:#ffd23f">o</span> <span class="acc">${inv.count('moeda')}</span>   <span class="fr">Lingotes de ferro:</span> <span class="acc">${inv.count('lingote_ferro')}</span>`);
      L.push('---');
      L.push('<span class="acc">MELHORAR EQUIPAMENTO</span> <span class="fr">(até +3)</span>');
      if (!list.length) L.push('<span class="fr">  nada equipado</span>');
      list.forEach(([slot, lab, id], k) => {
        const d = items[id], lv = inv.level(id), sel = k === this.shopSel;
        const c = lv < 3 ? this.forgeCost(slot, lv) : null;
        const ok = c && inv.count('moeda') >= c.coins && inv.count('lingote_ferro') >= c.bars;
        const eff = slot === 'arma' ? (d.weapon && d.weapon.ranged ? 'dano das flechas +1' : 'dano +1') : 'defesa +1';
        const cost = c ? `<span class="${ok ? 'acc' : 'hp'}">${String(c.coins).padStart(4)} o + ${c.bars} ▬</span>` : '<span class="acc">  MÁXIMO</span>';
        L.push(`<span data-s="${k}" class="mi">${sel ? '<span class="acc">►</span>' : ' '} <span class="fr">${E.asciiPad(lab, 7)}</span><span style="color:${css(d.color)}">${esc(d.glyph)}</span> ${E.asciiPad(esc(inv.label(id)), 26)} ${cost}</span>`);
        if (sel && c) L.push(`<span class="fr">            próximo: +${lv + 1} · ${eff}</span>`);
      });
      L.push('---');
      L.push('<span class="fr">O ferreiro usa lingotes de ferro: cavaleiros e</span>');
      L.push('<span class="fr">esqueletos guerreiros deixam cair, e o armeiro vende.</span>');
      L.push('---');
      L.push('<span class="fr">[Enter/clique]</span> melhorar  <span class="fr">[setas]</span> escolher  <span data-act="close" class="btn">[E] sair</span>');
      $('#shopBox').innerHTML = E.asciiBox(esc(this.shop.npc.def.name).toUpperCase() + ' · FORJA', L, W, 'double');
    },
    shopAct() {
      if (this.shop.forge) return this.forgeAct();
      const inv = G().inv, items = E.Project.items, b = this.shop.stock.length, n = this.shopSel;
      if (n < b) {
        const id = this.shop.stock[n], d = items[id], pr = d.price || 10;
        if (inv.count('moeda') < pr) return E.Audio.play('bloqueio'), this.message('Moedas insuficientes.', 1.5);
        if (!inv.add(id, 1)) return E.Audio.play('bloqueio'), this.message('Inventário cheio.', 1.5);
        inv.take('moeda', pr);
        E.Audio.play('moeda');
        E.toast('Comprou ' + d.name);
      } else {
        const it = this._sell[n - b];
        if (!it) return;
        const s = inv.slots[it.i];
        if (!s) return;
        const d = items[s.id];
        s.qty--;
        if (!s.qty) inv.slots[it.i] = null;
        inv.add('moeda', this.sellPrice(d));
        E.Audio.play('moeda');
        E.toast('Vendeu ' + d.name);
      }
      this.refresh();
      this.renderShop();
    },
    renderShop() {
      if (!this.shopOpen) return;
      if (this.shop.forge) return this.renderForge();
      const inv = G().inv, items = E.Project.items, W = 60, coins = inv.count('moeda');
      const L = [];
      const buy = this.shop.stock;
      const sell = (this._sell = inv.slots.map((s, i) => ({ s, i })).filter(({ s }) => s && s.id !== 'moeda' && items[s.id]));
      this._shopN = buy.length + sell.length;
      this.shopSel = Math.min(this.shopSel, this._shopN - 1);
      L.push(`<span class="fr">Suas moedas:</span> <span style="color:#ffd23f">o</span> <span class="acc">${coins}</span>`);
      L.push('---');
      L.push('<span class="acc">COMPRAR</span>');
      const row = (k, d, right, ok) => {
        const sel = k === this.shopSel;
        return `<span data-s="${k}" class="mi">${sel ? '<span class="acc">►</span>' : ' '} <span style="color:${css(d.color)}">${esc(d.glyph)}</span> ${sel ? '<span class="acc">' : ''}${E.asciiPad(esc(d.name), 30)}${sel ? '</span>' : ''} <span class="${ok ? 'acc' : 'hp'}">${right}</span></span>`;
      };
      buy.forEach((id, k) => {
        const d = items[id], pr = d.price || 10;
        L.push(row(k, d, String(pr).padStart(5) + ' o', coins >= pr));
      });
      L.push('---');
      L.push('<span class="acc">VENDER</span> <span class="fr">(metade do preço)</span>');
      if (!sell.length) L.push('<span class="fr">  nada para vender</span>');
      sell.forEach(({ s }, k) => {
        const d = items[s.id];
        L.push(row(buy.length + k, d, (s.qty > 1 ? 'x' + s.qty + ' ' : '') + '+' + this.sellPrice(d) + ' o', true));
      });
      L.push('---');
      const n = this.shopSel, d = n < buy.length ? items[buy[n]] : sell[n - buy.length] && items[sell[n - buy.length].s.id];
      const info = [];
      if (d) {
        info.push(`<span style="color:${css(d.color)}">${esc(d.name)}</span>`);
        const words = String(d.desc || '').split(' ');
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 40) {
            info.push(esc(line.trim()));
            line = '';
          }
          line += ' ' + w;
        }
        if (line.trim()) info.push(esc(line.trim()));
      }
      const ic = d ? this.iconLines(d) : [];
      const icw = d && d.icon ? d.icon.w : 1;
      for (let k = 0; k < Math.max(5, ic.length, info.length); k++) L.push(E.asciiPad(ic[k] || '', icw) + '  ' + (info[k] || ''));
      L.push('---');
      L.push('<span class="fr">[Enter/clique]</span> comprar/vender  <span class="fr">[setas]</span> escolher  <span data-act="close" class="btn">[E] sair</span>');
      $('#shopBox').innerHTML = E.asciiBox(esc(this.shop.npc.def.name).toUpperCase(), L, W, 'double');
    },
    toggleInventory(on = !this.invOpen) {
      if (on && this.menuOpen) return;
      this.invOpen = on;
      $('#uiInv').classList.toggle('open', on);
      E.Audio.play(on ? 'ok' : 'menu');
      this.refresh();
    },
  };
})();

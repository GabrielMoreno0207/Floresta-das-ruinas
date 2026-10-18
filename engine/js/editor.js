'use strict';
// Editor da engine (Tab): mapa, colisão, objetos, spawners, gatilhos, prefabs (criaturas + scripts), itens e mundo.
(function () {
  const E = window.ENG;
  const G = () => E.Game;
  const W = () => E.Game.world;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  const STAMPS = {
    'Cabana com porta': (w, x, y) => E.Struct.cabin(w, x, y, E.rng(x | 1)),
    'Casa enxaimel': (w, x, y) => E.Struct.house(w, x, y, E.rng(x | 1), { kind: 'enxaimel', role: 'comerciante' }),
    'Casa de pedra': (w, x, y) => E.Struct.house(w, x, y, E.rng(x | 1), { kind: 'pedra', role: 'nobre', floors: 2 }),
    'Casa de adobe': (w, x, y) => E.Struct.house(w, x, y, E.rng(x | 1), { kind: 'adobe', role: 'simples' }),
    Estalagem: (w, x, y) => E.Struct.house(w, x, y, E.rng(x | 1), { kind: 'estalagem', role: 'estalagem', sign: 'Estalagem' }),
    'Oficina do ferreiro': (w, x, y) => E.Struct.forge(w, x, y),
    'Barraca de mercado': (w, x, y) => E.Struct.stall(w, x, y, [200, 60, 50], 'mercador'),
    'Poste de rua': (w, x, y) => E.Struct.lampPost(w, x, y),
    ...Object.fromEntries(Object.keys(E.PROPS || {}).filter((k) => E.PROPS[k]).map((k) => ['Objeto: ' + k, (w, x, y) => E.prop(w, k, x, y)])),
    'Porta de madeira': (w, x, y) => E.Struct.doorAt(w, x, y),
    'Entrada de caverna': (w, x, y) => E.Struct.caveEntrance(w, x, y, E.rng(x | 1)),
    'Poço de mina': (w, x, y) => E.Struct.mineShaft(w, x, y, 30),
    'Torre de vigia': (w, x, y) => E.Struct.tower(w, x, y),
    Ponte: (w, x, y) => E.Struct.bridge(w, x, y, 30),
    'Escadaria de pedra': (w, x, y) => E.Struct.stairs(w, x, y, 12, 1),
    Poço: (w, x, y) => E.Struct.well(w, x, y),
    Cerca: (w, x, y) => E.Struct.fence(w, x, y, 20),
    Árvore: (w, x, y) => E.Struct.tree(w, x, y, E.rng((x * 7 + y) | 1)),
    'Árvore grande': (w, x, y) => E.Struct.tree(w, x, y, E.rng((x * 7 + y) | 1), 1.5),
    Lanterna: (w, x, y) => E.Struct.lantern(w, x, y, 6),
    'Poste c/ lanterna': (w, x, y) => E.Struct.gallows(w, x, y),
    Estandarte: (w, x, y) => E.Struct.banner(w, x, y),
    Tocha: (w, x, y) => E.Struct.torch(w, x, y),
    Teia: (w, x, y) => E.Struct.web(w, x, y, 10),
    Ruína: (w, x, y) => E.Struct.ruin(w, x, y, 90, 40, E.rng(x | 1)),
    Plataforma: (w, x, y) => E.Struct.platform(w, x, y, 16),
    Escada: (w, x, y) => E.Struct.ladder(w, x, y - 20, y),
    'Cogumelos luminosos': (w, x, y) => E.Struct.mushrooms(w, x, y, E.rng(x | 1)),
  };
  const TABS = [
    ['pintar', 'Pintar'], ['colisao', 'Colisão'], ['objetos', 'Objetos'], ['spawners', 'Spawners'],
    ['gatilhos', 'Gatilhos'], ['prefabs', 'Criaturas'], ['itens', 'Itens'], ['mundo', 'Mundo'],
  ];
  const SPRITES = ['spider', 'slime', 'bat', 'skeleton', 'skeleton2', 'knight', 'torch', 'wisp', 'npc', 'chest', 'bonfire', 'door'];

  // ---------- formulários genéricos ----------
  // spec: [chave, rótulo, tipo, opções]; tipos: text number check select color textarea range
  const getPath = (o, k) => k.split('.').reduce((a, p) => (a == null ? undefined : a[p]), o);
  const setPath = (o, k, v) => {
    const ps = k.split('.');
    let a = o;
    for (let i = 0; i < ps.length - 1; i++) a = a[ps[i]] ??= {};
    a[ps[ps.length - 1]] = v;
  };
  function form(el, obj, specs, onChange) {
    el.innerHTML = specs
      .map(([k, label, type, opt]) => {
        const v = getPath(obj, k);
        if (type === 'check') return `<label class="chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
        let input;
        if (type === 'select') input = `<select data-k="${k}">${(typeof opt === 'function' ? opt() : opt).map((o) => { const [val, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val == v ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
        else if (type === 'textarea') input = `<textarea data-k="${k}" rows="${typeof opt === 'number' ? opt : 3}" spellcheck="false">${esc(opt === 'json' ? JSON.stringify(v ?? null) : v)}</textarea>`;
        else if (type === 'color') input = `<input type="color" data-k="${k}" value="${E.rgbHex(v || [1, 1, 1])}">`;
        else if (type === 'range') input = `<input type="range" data-k="${k}" min="${opt[0]}" max="${opt[1]}" step="${opt[2]}" value="${v ?? opt[0]}">`;
        else input = `<input type="${type}" data-k="${k}" value="${esc(v)}" ${type === 'number' ? 'step="any"' : ''}>`;
        return `<label>${label}${input}</label>`;
      })
      .join('');
    el.oninput = el.onchange = (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      const spec = specs.find((s) => s[0] === k);
      let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if (spec[2] === 'number' || spec[2] === 'range') v = v === '' ? undefined : +v;
      if (spec[2] === 'color') v = E.hexRgb(v);
      if (spec[3] === 'json') {
        try {
          v = JSON.parse(v || 'null');
          e.target.classList.remove('bad');
        } catch (err) {
          e.target.classList.add('bad');
          return;
        }
      }
      setPath(obj, k, v);
      onChange && onChange(k, v, e.type);
    };
  }

  const Ed = (E.Editor = {
    active: false,
    tab: 'pintar',
    tool: 'pincel',
    layer: 'main',
    mat: 2,
    colType: 1,
    size: 3,
    lightType: 'lanterna',
    stamp: 'Cabana com porta',
    place: 'aranha',
    image: null,
    imageCols: 40,
    mouse: null,
    down: 0,
    sel: null,
    rect: null,
    undo: [],
    redo: [],
    prefabSel: 'aranha',
    itemSel: 'pocao',

    toggle(on = !this.active) {
      this.active = on;
      document.body.classList.toggle('editing', on);
      E.Renderer.resize();
      if (on) this.buildPanel();
      else {
        // volta a jogar com objetos/spawners/scripts atualizados
        E.Script.clearCache();
        E.Ents.load(W());
        E.ProjectIO.saveLocal();
      }
      E.toast(on ? 'Editor — Tab volta a jogar' : 'Jogando — Tab abre o editor');
    },

    cellAt(ev) {
      const r = E.Renderer, cv = r.canvas;
      const rect = cv.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (cv.width / rect.width), py = (ev.clientY - rect.top) * (cv.height / rect.height);
      return { x: G().cam.x + px / r.cw, y: G().cam.y + py / r.ch };
    },

    // ---------- desfazer ----------
    LAYER_KEYS: ['main', 'back', 'front', 'col', 'mainCol', 'backCol', 'frontCol'],
    capture(w) {
      return { id: w.id, layers: this.LAYER_KEYS.map((k) => w[k].slice()), objs: JSON.stringify({ lights: w.lights, entities: w.entities, spawners: w.spawners, triggers: w.triggers, spawn: w.spawn }) };
    },
    snapshot() {
      this.undo.push(this.capture(W()));
      if (this.undo.length > 20) this.undo.shift();
      this.redo = [];
    },
    restore(from, to) {
      const s = from.pop();
      if (!s) return;
      const w = E.Project.worlds[s.id];
      if (!w) return;
      to.push(this.capture(w));
      this.LAYER_KEYS.forEach((k, i) => w[k].set(s.layers[i]));
      Object.assign(w, JSON.parse(s.objs));
      w.computeSurface();
      this.sel = null;
      E.Ents.load(w);
      this.renderTab();
    },

    init() {
      const cv = $('#overlay');
      [cv, E.Renderer.canvas].forEach((c) => c.addEventListener('contextmenu', (e) => e.preventDefault()));
      cv.addEventListener('pointerdown', (e) => {
        if (!this.active) return;
        cv.setPointerCapture(e.pointerId);
        this.down = e.button === 2 ? 2 : e.button === 1 ? 3 : 1;
        this.mouse = this.cellAt(e);
        this.panStart = { x: e.clientX, y: e.clientY, cx: G().cam.x, cy: G().cam.y };
        if (this.down !== 3) this.pointer('down');
      });
      cv.addEventListener('pointermove', (e) => {
        this.mouse = this.cellAt(e);
        if (!this.active || !this.down) return;
        if (this.down === 3) {
          const r = E.Renderer;
          G().cam.x = this.panStart.cx - ((e.clientX - this.panStart.x) * r.dpr) / r.cw;
          G().cam.y = this.panStart.cy - ((e.clientY - this.panStart.y) * r.dpr) / r.ch;
          return;
        }
        this.pointer('move');
      });
      cv.addEventListener('pointerup', () => {
        if (this.active && this.down && this.down !== 3) this.pointer('up');
        this.down = 0;
      });
      cv.addEventListener('wheel', (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.size = Math.max(1, Math.min(40, this.size + (e.deltaY < 0 ? 1 : -1)));
        const el = $('#edSize');
        if (el) el.value = this.size;
      }, { passive: false });
      cv.addEventListener('dragover', (e) => e.preventDefault());
      cv.addEventListener('drop', (e) => {
        e.preventDefault();
        const f = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
        if (!f) return;
        if (!this.active) this.toggle(true);
        this.loadImage(f);
      });
      window.addEventListener('keydown', (e) => {
        if (e.target.matches && e.target.matches('input,select,textarea')) return;
        if (e.code === 'Tab') {
          e.preventDefault();
          this.toggle();
        }
        if (e.code === 'F2') {
          e.preventDefault();
          G().showColliders = !G().showColliders;
        }
        if (!this.active) return;
        if (e.ctrlKey && e.code === 'KeyZ') {
          e.preventDefault();
          this.restore(this.undo, this.redo);
        }
        if (e.ctrlKey && e.code === 'KeyY') {
          e.preventDefault();
          this.restore(this.redo, this.undo);
        }
        if ((e.code === 'Delete' || e.code === 'Backspace') && this.sel) this.deleteSel();
      });
      setInterval(() => this.active && E.ProjectIO.saveLocal(), 30000);
    },

    update(dt) {
      if (document.activeElement && document.activeElement.matches('input,select,textarea')) return;
      const k = G().keys, sp = (k.ShiftLeft || k.ShiftRight ? 240 : 90) * dt;
      if (k.KeyA || k.ArrowLeft) G().cam.x -= sp;
      if (k.KeyD || k.ArrowRight) G().cam.x += sp;
      if (k.KeyW || k.ArrowUp) G().cam.y -= sp / 2;
      if (k.KeyS || k.ArrowDown) G().cam.y += sp / 2;
    },

    // ---------- interação com o mapa ----------
    pointer(phase) {
      const w = W(), m = this.mouse;
      const cx = Math.floor(m.x), cy = Math.floor(m.y);
      const erase = this.down === 2;
      const aspect = E.Renderer.ch / E.Renderer.cw;
      const tab = this.tab;
      const zoneTab = tab === 'spawners' || tab === 'gatilhos';
      const rectTool = (tab === 'pintar' || tab === 'colisao') && this.tool === 'retangulo';

      if (zoneTab && this.dragSel) {
        const o = this.sel.ref;
        if (phase === 'move') {
          if (this.dragSel.resize) {
            o.w = Math.max(2, cx - o.x + 1);
            o.h = Math.max(2, cy - o.y + 1);
          } else {
            o.x = Math.round(m.x - this.dragSel.ox);
            o.y = Math.round(m.y - this.dragSel.oy);
          }
        } else if (phase === 'up') {
          this.dragSel = null;
          this.renderTab();
        }
        return;
      }
      if (rectTool || zoneTab) {
        if (phase === 'down') {
          if (zoneTab) {
            const arr = tab === 'spawners' ? w.spawners : w.triggers;
            const hit = this.hitRect(arr, m);
            if (hit) {
              this.snapshot();
              if (erase) {
                arr.splice(arr.indexOf(hit), 1);
                this.sel = null;
                return this.renderTab();
              }
              this.sel = { type: tab, ref: hit };
              this.dragSel = { ox: m.x - hit.x, oy: m.y - hit.y, resize: m.x > hit.x + hit.w - 2 && m.y > hit.y + hit.h - 2 };
              return this.renderTab();
            }
          }
          this.rect = { x0: cx, y0: cy, x1: cx, y1: cy, erase };
        } else if (phase === 'move' && this.rect) {
          this.rect.x1 = cx;
          this.rect.y1 = cy;
        } else if (phase === 'up' && this.rect) {
          const r = this.rect;
          const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), rw = Math.abs(r.x1 - r.x0) + 1, rh = Math.abs(r.y1 - r.y0) + 1;
          this.rect = null;
          if (tab === 'pintar') {
            this.snapshot();
            const layers = this.layer === 'all' ? ['back', 'main', 'front'] : [this.layer];
            for (const L of layers) w.fillRect(L, x, y, rw, rh, r.erase ? 0 : this.mat);
            w.computeSurface(x - 1, x + rw + 1);
          } else if (tab === 'colisao') {
            this.snapshot();
            for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) if (w.idx(xx, yy) >= 0) w.col[w.idx(xx, yy)] = r.erase ? 0 : this.colType;
            w.computeSurface(x - 1, x + rw + 1);
          } else if (rw > 2 && rh > 1 && !r.erase) {
            this.snapshot();
            if (tab === 'spawners') {
              const s = { id: 'sp' + Date.now().toString(36), prefab: E.Project.prefabs[this.place] ? this.place : 'aranha', x, y, w: rw, h: rh, interval: 10, max: 2, initial: 1, range: 140, active: true };
              w.spawners.push(s);
              this.sel = { type: 'spawners', ref: s };
            } else {
              const t = { id: 'gatilho' + (w.triggers.length + 1), x, y, w: rw, h: rh, once: false, script: E.SCRIPT_TEMPLATES['Gatilho: mensagem'] };
              w.triggers.push(t);
              this.sel = { type: 'gatilhos', ref: t };
            }
            this.renderTab();
          }
        }
        return;
      }
      if (tab === 'pintar' || tab === 'colisao') {
        if (this.tool === 'pincel') {
          if (phase === 'down') this.snapshot();
          if (phase === 'up') return;
          if (tab === 'pintar') {
            const layers = this.layer === 'all' ? ['back', 'main', 'front'] : [this.layer];
            for (const L of layers) w.brush(L, cx, cy, this.size, erase ? 0 : this.mat, aspect);
          } else {
            const ry = this.size / aspect;
            for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
              for (let x = Math.floor(cx - this.size); x <= Math.ceil(cx + this.size); x++) {
                const dx = x - cx, dy = (y - cy) * aspect;
                if (dx * dx + dy * dy <= this.size * this.size + 0.5 && w.idx(x, y) >= 0) w.col[w.idx(x, y)] = erase ? 0 : this.colType;
              }
          }
          w.computeSurface(cx - this.size - 1, cx + this.size + 2);
        } else if (this.tool === 'conta' && phase === 'down') {
          for (const L of ['front', 'main', 'back']) {
            const v = w.get(L, cx, cy);
            if (v) {
              this.mat = v;
              this.layer = L;
              this.tool = 'pincel';
              this.renderTab();
              break;
            }
          }
        } else if (this.tool === 'carimbo' && phase === 'down' && !erase) {
          this.snapshot();
          if (this.stamp === '__image' && this.image) {
            const st = this.image, x0 = Math.round(cx - st.w / 2), y0 = cy - st.h + 1;
            for (let j = 0; j < st.h; j++)
              for (let i = 0; i < st.w; i++) {
                const c = st.cells[j * st.w + i];
                if (c) w.set(this.layer === 'all' ? 'back' : this.layer, x0 + i, y0 + j, E.MAT.INK, c.slice(0, 3).map(Math.round));
              }
          } else STAMPS[this.stamp]?.(w, cx, cy);
          w.computeSurface();
          E.Ents.load(w);
        } else if (this.tool === 'luz') {
          if (phase === 'down') {
            const near = this.hitLight(m);
            this.snapshot();
            if (erase) {
              if (near) w.lights.splice(w.lights.indexOf(near), 1);
              this.sel = null;
            } else if (near) {
              this.sel = { type: 'luz', ref: near };
              this.dragging = true;
            } else {
              const l = Object.assign({ x: m.x, y: m.y, type: this.lightType }, E.LIGHTS[this.lightType]);
              l.c = l.c.slice();
              if (this.lightType === 'tocha' || this.lightType === 'lava') l.embers = true;
              w.lights.push(l);
              this.sel = { type: 'luz', ref: l };
              this.dragging = true;
            }
            this.renderTab();
          } else if (phase === 'move' && this.dragging && this.sel) {
            this.sel.ref.x = m.x;
            this.sel.ref.y = m.y;
          } else if (phase === 'up') this.dragging = false;
        }
        return;
      }
      if (tab === 'objetos') {
        if (phase === 'down') {
          const hit = this.hitEntity(m);
          if (erase) {
            if (hit) {
              this.snapshot();
              w.entities.splice(w.entities.indexOf(hit), 1);
              this.sel = null;
              E.Ents.load(w);
              this.renderTab();
            }
            return;
          }
          this.snapshot();
          if (this.place === '__spawn') {
            w.spawn = { x: cx, y: cy + 1 };
            return;
          }
          if (hit) {
            this.sel = { type: 'objetos', ref: hit };
            this.dragOff = { x: m.x - hit.x, y: m.y - hit.y };
            this.renderTab();
            return;
          }
          const isItem = this.place.startsWith('item:');
          const d = isItem
            ? { id: 'e' + Date.now().toString(36), prefab: '__item', x: cx, y: cy + 1, props: { item: this.place.slice(5), qty: 1 } }
            : { id: 'e' + Date.now().toString(36), prefab: this.place, x: cx, y: cy + 1, facing: 1, props: {} };
          w.entities.push(d);
          this.sel = { type: 'objetos', ref: d };
          this.dragOff = { x: 0, y: -1 };
          this.renderTab();
        } else if (phase === 'move' && this.sel && this.dragOff) {
          this.sel.ref.x = Math.round(m.x - this.dragOff.x);
          this.sel.ref.y = Math.round(m.y - this.dragOff.y);
        } else if (phase === 'up') {
          if (this.dragOff) E.Ents.load(w);
          this.dragOff = null;
        }
      }
    },
    hitRect(arr, m) {
      let best = null;
      for (const r of arr) if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h && (!best || r.w * r.h < best.w * best.h)) best = r;
      return best;
    },
    hitLight(m) {
      return W().lights.find((l) => Math.abs(l.x - m.x) < 2.5 && Math.abs(l.y - m.y) < 1.5) || null;
    },
    hitEntity(m) {
      let best = null;
      for (const d of W().entities) {
        const def = d.prefab === '__item' ? null : E.Project.prefabs[d.prefab];
        const bw = def ? def.sw || def.w : 3, bh = def ? def.sh || def.h : 2;
        if (m.x >= d.x - bw / 2 && m.x <= d.x + bw / 2 && m.y >= d.y - bh && m.y <= d.y + 0.5) best = d;
      }
      return best;
    },
    deleteSel() {
      const w = W(), s = this.sel;
      if (!s) return;
      this.snapshot();
      const arr = s.type === 'luz' ? w.lights : s.type === 'spawners' ? w.spawners : s.type === 'gatilhos' ? w.triggers : w.entities;
      const i = arr.indexOf(s.ref);
      if (i >= 0) arr.splice(i, 1);
      this.sel = null;
      E.Ents.load(w);
      this.renderTab();
    },

    async loadImage(file) {
      this.imageSrc = await createImageBitmap(file);
      this.makeImage();
      this.tab = 'pintar';
      this.tool = 'carimbo';
      this.stamp = '__image';
      this.buildPanel();
    },
    makeImage() {
      if (!this.imageSrc) return;
      this.image = E.imageToStamp(this.imageSrc, this.imageCols, E.Renderer.ch / E.Renderer.cw);
      this.ghost = this.image;
    },

    showErrors() {
      const el = $('#edErrors');
      if (el) el.innerHTML = E.Script.errors.slice(0, 6).map((m) => `<div>${esc(m)}</div>`).join('');
    },

    // ---------- painel ----------
    buildPanel() {
      $('#panel').innerHTML = `
        <div class="ed-head"><b>Floresta das Ruínas · Editor</b> <small>Tab = jogar · Ctrl+Z/Y · F2 colisores · WASD ou botão do meio move a câmera</small></div>
        <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div id="tabBody"></div>
        <div id="edErrors" class="errors"></div>`;
      $('#panel .tabs').onclick = (e) => {
        const b = e.target.closest('[data-tab]');
        if (!b) return;
        this.tab = b.dataset.tab;
        this.sel = null;
        if (this.tab === 'colisao' && this.tool !== 'retangulo') this.tool = 'pincel';
        this.buildPanel();
      };
      this.renderTab();
      this.showErrors();
    },
    syncPanel() {
      if (this.active) this.buildPanel();
    },
    renderTab() {
      const body = $('#tabBody');
      if (!body) return;
      this.ghost = null;
      clearInterval(this._pv);
      const fn = this['tab_' + this.tab];
      if (fn) fn.call(this, body);
    },

    tab_pintar(el) {
      const mats = E.MATERIALS.filter((m) => !m.hidden).map((m) => `<button class="mat ${m.id === this.mat ? 'on' : ''}" data-mat="${m.id}" title="${m.name}" style="--c:rgb(${m.color.map((v) => Math.round(v * 255)).join(',')})"><b>${esc([...m.glyphs].find((c) => c !== ' '))}</b>${m.name}</button>`).join('');
      el.innerHTML = `
        <div class="tools">${[['pincel', 'Pincel'], ['retangulo', 'Retângulo'], ['conta', 'Conta-gotas'], ['carimbo', 'Construir'], ['luz', 'Luz']].map(([k, l]) => `<button data-tool="${k}" class="${k === this.tool ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label>Camada <select id="edLayer"><option value="back">Fundo (sem colisão)</option><option value="main">Principal (colide se sólido)</option><option value="front">Frente (na frente do herói)</option><option value="all">Todas</option></select></label>
        <label>Tamanho do pincel <input type="range" id="edSize" min="1" max="40" value="${this.size}"></label>
        <div id="sub"></div>`;
      $('#edLayer').value = this.layer;
      $('#edLayer').onchange = (e) => (this.layer = e.target.value);
      $('#edSize').oninput = (e) => (this.size = +e.target.value);
      el.querySelector('.tools').onclick = (e) => {
        const b = e.target.closest('[data-tool]');
        if (b) {
          this.tool = b.dataset.tool;
          this.renderTab();
        }
      };
      const sub = $('#sub');
      if (this.tool === 'carimbo') {
        sub.innerHTML = `<h4>Construções</h4><select id="edStamp" size="12">${Object.keys(STAMPS).map((k) => `<option ${k === this.stamp ? 'selected' : ''}>${k}</option>`).join('')}<option value="__image" ${this.stamp === '__image' ? 'selected' : ''}>Imagem importada</option></select>
          <div class="hint">Clique no mapa: o ponto clicado é o chão (base) da construção. Porta e cabana criam uma porta que abre com E.</div>
          <label class="file">Importar PNG/JPG → ASCII<input type="file" id="edImg" accept="image/*" hidden></label>
          <label>Largura da imagem (células)<input type="number" id="edImgCols" value="${this.imageCols}"></label>`;
        $('#edStamp').onchange = (e) => {
          this.stamp = e.target.value;
          this.ghost = this.stamp === '__image' ? this.image : null;
        };
        $('#edImg').onchange = (e) => e.target.files[0] && this.loadImage(e.target.files[0]);
        $('#edImgCols').onchange = (e) => {
          this.imageCols = Math.max(4, Math.min(400, +e.target.value || 40));
          this.makeImage();
        };
        if (this.stamp === '__image') this.ghost = this.image;
      } else if (this.tool === 'luz') {
        sub.innerHTML = `<h4>Luz</h4><select id="edLight">${Object.keys(E.LIGHTS).map((k) => `<option ${k === this.lightType ? 'selected' : ''}>${k}</option>`).join('')}</select><div id="lightForm"></div><div class="hint">Clique cria ou seleciona e arrasta · botão direito apaga</div>`;
        $('#edLight').onchange = (e) => (this.lightType = e.target.value);
        if (this.sel && this.sel.type === 'luz')
          form($('#lightForm'), this.sel.ref, [['c', 'Cor', 'color'], ['r', 'Raio', 'range', [4, 140, 1]], ['i', 'Intensidade', 'range', [0.1, 3, 0.05]], ['flicker', 'Oscilação', 'range', [0, 0.8, 0.01]], ['pulse', 'Pulsar', 'check'], ['embers', 'Soltar brasas', 'check']]);
      } else {
        sub.innerHTML = `<h4>Materiais</h4><div class="mats">${mats}</div>`;
        sub.querySelector('.mats').onclick = (e) => {
          const b = e.target.closest('[data-mat]');
          if (!b) return;
          this.mat = +b.dataset.mat;
          if (this.tool === 'conta') this.tool = 'pincel';
          this.renderTab();
        };
      }
    },

    tab_colisao(el) {
      el.innerHTML = `
        <div class="tools">${[['pincel', 'Pincel'], ['retangulo', 'Retângulo']].map(([k, l]) => `<button data-tool="${k}" class="${k === this.tool ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label>Tamanho do pincel <input type="range" id="edSize" min="1" max="40" value="${this.size}"></label>
        <h4>Tipo de colisão</h4>
        <div class="cols">${E.CT_INFO.map((c) => `<button data-ct="${c.id}" class="${c.id === this.colType ? 'on' : ''}" style="--c:${c.color ? `rgb(${c.color.join(',')})` : '#888'}">${c.name}</button>`).join('')}</div>
        <div class="hint">A colisão vem do material (pedra/terra/madeira = sólido). Pinte por cima para mudar: <b>plataforma vazada</b> se atravessa por baixo (↓ + pulo desce); <b>forçar vazio</b> cria passagens secretas; <b>perigo</b> causa dano; <b>escada</b> permite subir.<br>Cores fortes = definido à mão · fracas = automático. Botão direito volta para automático.</div>
        <label class="chk"><input type="checkbox" id="edShowCol" ${G().showColliders ? 'checked' : ''}> mostrar colisores também durante o jogo (F2)</label>`;
      $('#edSize').oninput = (e) => (this.size = +e.target.value);
      el.querySelector('.tools').onclick = (e) => {
        const b = e.target.closest('[data-tool]');
        if (b) {
          this.tool = b.dataset.tool;
          this.renderTab();
        }
      };
      el.querySelector('.cols').onclick = (e) => {
        const b = e.target.closest('[data-ct]');
        if (b) {
          this.colType = +b.dataset.ct;
          this.renderTab();
        }
      };
      $('#edShowCol').onchange = (e) => (G().showColliders = e.target.checked);
    },

    tab_objetos(el) {
      const P = E.Project;
      const opts = Object.entries(P.prefabs).map(([id, d]) => `<button data-place="${id}" class="${this.place === id ? 'on' : ''}">${esc(d.name)}</button>`).join('');
      const items = Object.entries(P.items).map(([id, d]) => `<button data-place="item:${id}" class="${this.place === 'item:' + id ? 'on' : ''}"><b style="color:${E.rgbHex(d.color)}">${esc(d.glyph)}</b> ${esc(d.name)}</button>`).join('');
      el.innerHTML = `
        <div class="hint">Escolha e clique no mapa para colocar · clique em um objeto para selecionar e arrastar · botão direito apaga</div>
        <h4>Criaturas e objetos</h4><div class="places">${opts}<button data-place="__spawn" class="${this.place === '__spawn' ? 'on' : ''}">▼ Início do jogador</button></div>
        <h4>Itens no chão</h4><div class="places">${items}</div>
        <div id="selForm"></div>`;
      el.querySelectorAll('.places').forEach((pl) => (pl.onclick = (e) => {
        const b = e.target.closest('[data-place]');
        if (b) {
          this.place = b.dataset.place;
          this.sel = null;
          this.renderTab();
        }
      }));
      const s = this.sel && this.sel.type === 'objetos' && this.sel.ref;
      if (!s) return;
      const sf = $('#selForm');
      if (s.prefab === '__item') {
        sf.innerHTML = '<h4>Item selecionado</h4><div id="f"></div><button id="del" class="danger">Apagar</button>';
        form($('#f'), s, [['props.item', 'Item', 'select', () => Object.keys(P.items)], ['props.qty', 'Quantidade', 'number']], () => E.Ents.load(W()));
      } else {
        s.props ||= {};
        sf.innerHTML = `<h4>${esc(P.prefabs[s.prefab]?.name || s.prefab)} selecionado</h4><div id="f"></div>
          <label>Aplicar modelo de script só nesta instância <select id="tpl"><option value="">—</option>${Object.keys(E.SCRIPT_TEMPLATES).map((k) => `<option>${k}</option>`).join('')}</select></label>
          <div class="row"><button id="del" class="danger">Apagar</button><button id="test">Testar aqui</button></div>`;
        form($('#f'), s, [
          ['facing', 'Direção', 'select', [[1, 'direita'], [-1, 'esquerda']]],
          ['props', 'Propriedades (JSON). Ex.: {"fala":"Oi|Tchau"} · {"loot":["pocao"]} · {"trancada":true} · {"destino":"caverna","x":30,"y":80}', 'textarea', 'json'],
          ['script', 'Script desta instância (vazio = usa o da criatura)', 'textarea', 8],
        ], (k) => {
          if (k === 'facing') s.facing = +s.facing;
          E.Ents.load(W());
        });
        $('#tpl').onchange = (e) => {
          if (!e.target.value) return;
          s.script = E.SCRIPT_TEMPLATES[e.target.value];
          this.renderTab();
        };
        $('#test').onclick = () => {
          this.toggle(false);
          G().player.x = s.x - 20;
          G().player.y = s.y;
        };
      }
      $('#del').onclick = () => this.deleteSel();
    },

    tab_spawners(el) {
      const P = E.Project;
      el.innerHTML = `<div class="hint">Arraste no mapa para criar uma área de spawn · clique para selecionar e arrastar · canto inferior direito redimensiona · botão direito apaga</div>
        <label>Criatura para novos spawners <select id="spPrefab">${Object.entries(P.prefabs).map(([id, d]) => `<option value="${id}" ${id === this.place ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <h4>Spawners deste mapa (${W().spawners.length})</h4><div class="list">${W().spawners.map((s, i) => `<div data-i="${i}" class="${this.sel && this.sel.ref === s ? 'on' : ''}">⟳ ${esc(P.prefabs[s.prefab]?.name || s.prefab)} · a cada ${s.interval}s · máx ${s.max}</div>`).join('')}</div>
        <div id="selForm"></div>`;
      $('#spPrefab').onchange = (e) => (this.place = e.target.value);
      el.querySelector('.list').onclick = (e) => {
        const d = e.target.closest('[data-i]');
        if (!d) return;
        const s = W().spawners[+d.dataset.i];
        this.sel = { type: 'spawners', ref: s };
        G().cam.x = s.x - E.Renderer.cols / 2;
        G().cam.y = s.y - E.Renderer.rows / 2;
        this.renderTab();
      };
      const s = this.sel && this.sel.type === 'spawners' && this.sel.ref;
      if (!s) return;
      $('#selForm').innerHTML = '<h4>Spawner selecionado</h4><div id="f"></div><button id="del" class="danger">Apagar</button>';
      form($('#f'), s, [
        ['prefab', 'Criatura', 'select', () => Object.entries(P.prefabs).map(([id, d]) => [id, d.name])],
        ['interval', 'Intervalo entre spawns (segundos)', 'number'],
        ['max', 'Máximo vivo ao mesmo tempo', 'number'],
        ['initial', 'Quantidade ao entrar no mapa', 'number'],
        ['range', 'Só ativa com o jogador a até N células (0 = sempre)', 'number'],
        ['active', 'Ativo', 'check'],
        ['period', 'Período', 'select', [['', 'sempre'], ['noite', 'só à noite'], ['dia', 'só de dia']]],
        ['x', 'X', 'number'], ['y', 'Y', 'number'], ['w', 'Largura', 'number'], ['h', 'Altura', 'number'],
      ]);
      $('#del').onclick = () => this.deleteSel();
    },

    tab_gatilhos(el) {
      el.innerHTML = `<div class="hint">Arraste no mapa para criar uma área de gatilho. O script roda quando o jogador entra (onEnter), fica (onStay) ou sai (onExit).</div>
        <h4>Gatilhos (${W().triggers.length})</h4><div class="list">${W().triggers.map((t, i) => `<div data-i="${i}" class="${this.sel && this.sel.ref === t ? 'on' : ''}">⚡ ${esc(t.id)}</div>`).join('')}</div>
        <div id="selForm"></div>`;
      el.querySelector('.list').onclick = (e) => {
        const d = e.target.closest('[data-i]');
        if (!d) return;
        const t = W().triggers[+d.dataset.i];
        this.sel = { type: 'gatilhos', ref: t };
        G().cam.x = t.x - E.Renderer.cols / 2;
        G().cam.y = t.y - E.Renderer.rows / 2;
        this.renderTab();
      };
      const t = this.sel && this.sel.type === 'gatilhos' && this.sel.ref;
      if (!t) return;
      $('#selForm').innerHTML = `<h4>Gatilho selecionado</h4>
        <label>Modelo de script <select id="tpl"><option value="">— escolher —</option>${Object.keys(E.SCRIPT_TEMPLATES).filter((k) => k.startsWith('Gatilho')).map((k) => `<option>${k}</option>`).join('')}</select></label>
        <div id="f"></div><div class="row"><button id="del" class="danger">Apagar</button><button id="api">API</button></div><pre class="api" hidden></pre>`;
      form($('#f'), t, [['id', 'Nome', 'text'], ['once', 'Só uma vez', 'check'], ['script', 'Script', 'textarea', 12], ['x', 'X', 'number'], ['y', 'Y', 'number'], ['w', 'Largura', 'number'], ['h', 'Altura', 'number']]);
      $('#tpl').onchange = (e) => {
        if (!e.target.value) return;
        t.script = E.SCRIPT_TEMPLATES[e.target.value];
        this.renderTab();
      };
      $('#del').onclick = () => this.deleteSel();
      $('#api').onclick = () => {
        const h = el.querySelector('.api');
        h.hidden = !h.hidden;
        h.textContent = API_HELP;
      };
    },

    tab_prefabs(el) {
      const P = E.Project;
      if (!P.prefabs[this.prefabSel]) this.prefabSel = Object.keys(P.prefabs)[0];
      const id = this.prefabSel, d = P.prefabs[id];
      el.innerHTML = `
        <select id="pfSel">${Object.entries(P.prefabs).map(([k, x]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(x.name)} (${k})</option>`).join('')}</select>
        <div class="row"><button id="pfNew">+ Nova</button><button id="pfDup">Duplicar</button><button id="pfDel" class="danger">Apagar</button><button id="pfSpawn">Criar perto do herói</button></div>
        <canvas id="pfPrev" width="270" height="150"></canvas>
        <div id="f"></div>
        <h4>Sprite de imagem (PNG / spritesheet)</h4>
        <label class="file">Importar imagem<input type="file" id="pfImg" accept="image/*" hidden></label>
        <div id="fi"></div>
        <h4>Script da criatura</h4>
        <label>Modelo <select id="tpl"><option value="">— aplicar modelo —</option>${Object.keys(E.SCRIPT_TEMPLATES).map((k) => `<option>${k}</option>`).join('')}</select></label>
        <textarea id="pfScript" rows="16" spellcheck="false">${esc(d.script || '')}</textarea>
        <div class="row"><button id="pfApply" class="primary">Aplicar script</button><button id="pfHelp">API</button></div>
        <pre class="api" hidden></pre>`;
      $('#pfSel').onchange = (e) => {
        this.prefabSel = e.target.value;
        this.renderTab();
      };
      const refresh = () => {
        E.clearSpriteCache();
        for (const e of E.Ents.list) if (e.prefab === id) Object.assign(e, { w: d.w, h: d.h, maxHp: d.hp });
      };
      form($('#f'), d, [
        ['name', 'Nome', 'text'],
        ['sprite', 'Sprite procedural', 'select', SPRITES],
        ['sw', 'Largura do sprite (células)', 'number'], ['sh', 'Altura do sprite (células)', 'number'],
        ['w', 'Colisor: largura', 'number'], ['h', 'Colisor: altura', 'number'],
        ['hp', 'Vida (0 = indestrutível)', 'number'], ['damage', 'Dano ao tocar', 'number'], ['speed', 'Velocidade', 'number'],
        ['gravity', 'Tem gravidade (desmarque para voadores)', 'check'],
        ['team', 'Time', 'select', ['inimigo', 'neutro', 'objeto', 'aliado']],
        ['emissive', 'Brilha no escuro', 'check'],
        ['deathFx', 'Efeito ao morrer', 'select', () => E.FX.names()],
        ['loot', 'Loot (JSON): [{"item":"moeda","chance":0.5,"min":1,"max":3}]', 'textarea', 'json'],
        ['sounds.idle', 'Som: parado (aleatório)', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
        ['sounds.move', 'Som: movimento', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
        ['sounds.attack', 'Som: ataque à distância', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
        ['sounds.melee', 'Som: golpe corpo a corpo', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
        ['sounds.hit', 'Som: ao levar dano', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
        ['sounds.die', 'Som: morte', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
        ['sounds.voice', 'Som: voz (fala)', 'select', () => ['', ...Object.keys(E.Audio.SFX)]],
      ], (k, v) => {
        refresh();
        if (k.startsWith('sounds.') && v) E.Audio.play(v);
      });
      $('#f').insertAdjacentHTML('beforeend', '<div class="row"><button id="pfHear">▶ Ouvir sons desta criatura</button></div>');
      $('#pfHear').onclick = () => Object.values(d.sounds || {}).filter(Boolean).forEach((n, k) => setTimeout(() => E.Audio.play(n), k * 550));
      const fi = $('#fi');
      if (d.image) {
        form(fi, d.image, [['cols', 'Colunas de quadros na imagem', 'number'], ['rows', 'Linhas de quadros', 'number'], ['fps', 'FPS', 'number'], ['anims.idle', 'Quadros "idle" (ex.: 0-3)', 'text'], ['anims.walk', 'Quadros "walk"', 'text'], ['anims.ataque', 'Quadros "ataque"', 'text'], ['pixel', 'Pixel art (sem suavizar)', 'check']], refresh);
        fi.insertAdjacentHTML('beforeend', '<button id="pfImgDel">Remover imagem</button>');
        $('#pfImgDel').onclick = () => {
          d.image = null;
          refresh();
          this.renderTab();
        };
      } else fi.innerHTML = '<div class="hint">Sem imagem: usa o sprite procedural. Com imagem, cada quadro vira ASCII com os glifos de contorno, igual ao herói.</div>';
      $('#pfImg').onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          d.image = { src: rd.result, cols: 1, rows: 1, fps: 8, anims: { idle: '0' }, pixel: true };
          setTimeout(refresh, 150);
          this.renderTab();
        };
        rd.readAsDataURL(f);
      };
      $('#tpl').onchange = (e) => {
        if (e.target.value) $('#pfScript').value = E.SCRIPT_TEMPLATES[e.target.value];
      };
      $('#pfApply').onclick = () => {
        d.script = $('#pfScript').value;
        E.Script.clearCache();
        const c = E.Script.compile(d.script, 'prefab ' + id);
        for (const e of E.Ents.list) if (e.prefab === id && !e.ownScript) e.hooks = c;
        E.toast('Script aplicado' + (Object.values(c).some(Boolean) ? '' : ' (nenhuma função de evento encontrada)'));
        this.showErrors();
      };
      $('#pfHelp').onclick = () => {
        const h = el.querySelector('.api');
        h.hidden = !h.hidden;
        h.textContent = API_HELP;
      };
      $('#pfSpawn').onclick = () => {
        const p = G().player;
        E.Ents.spawn(id, p.x + p.facing * 20, p.y - 2);
        E.toast('Criado perto do herói (Tab para ver)');
      };
      $('#pfNew').onclick = () => {
        let n = 1;
        while (P.prefabs['criatura' + n]) n++;
        P.prefabs['criatura' + n] = { name: 'Nova criatura', sprite: 'slime', sw: 10, sh: 6, w: 8, h: 4, hp: 2, damage: 1, speed: 10, gravity: true, team: 'inimigo', deathFx: 'faisca', loot: [], script: E.SCRIPT_TEMPLATES.Patrulha };
        this.prefabSel = 'criatura' + n;
        this.renderTab();
      };
      $('#pfDup').onclick = () => {
        let nid = id + '_copia';
        while (P.prefabs[nid]) nid += '_';
        P.prefabs[nid] = JSON.parse(JSON.stringify(d));
        P.prefabs[nid].name += ' (cópia)';
        this.prefabSel = nid;
        this.renderTab();
      };
      $('#pfDel').onclick = (e) => {
        if (!e.target.dataset.armed) {
          e.target.dataset.armed = 1;
          e.target.textContent = 'confirmar?';
          return;
        }
        delete P.prefabs[id];
        this.renderTab();
      };
      this.drawPrefabPreview(d, id);
      this._pv = setInterval(() => this.active && this.tab === 'prefabs' && this.drawPrefabPreview(d, id), 120);
    },

    drawPrefabPreview(d, id) {
      const cv = $('#pfPrev');
      if (!cv) return;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#05060c';
      ctx.fillRect(0, 0, cv.width, cv.height);
      const t = performance.now() / 1000;
      const fr = E.entityFrame({ def: d, prefab: '__prev_' + id, anim: 'idle', t, facing: 1, onGround: true, vx: 3 });
      const cw = Math.max(3, Math.min(10, Math.floor(250 / Math.max(fr.w, 1)), Math.floor(120 / Math.max(fr.h * 2, 1)))), ch = cw * 2;
      const ox = (cv.width - fr.w * cw) / 2, oy = cv.height - 12 - fr.h * ch;
      ctx.font = `${ch}px Cascadia Mono, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ramp = [...E.MAT_BY_ID[E.MAT.INK].glyphs];
      const chars = [...E.ATLAS_CHARS];
      fr.cells.forEach((c, i) => {
        if (!c) return;
        const l = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
        const g = c[3] >= 0 ? chars[c[3]] : ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
        ctx.fillStyle = `rgb(${Math.min(255, c[0] * 1.3)},${Math.min(255, c[1] * 1.3)},${Math.min(255, c[2] * 1.3)})`;
        ctx.fillText(g, ox + (i % fr.w) * cw + cw / 2, oy + Math.floor(i / fr.w) * ch + ch / 2);
      });
      ctx.strokeStyle = 'rgba(255,80,80,0.9)';
      ctx.strokeRect(cv.width / 2 - (d.w * cw) / 2, cv.height - 12 - d.h * ch, d.w * cw, d.h * ch);
      ctx.fillStyle = '#7d8399';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('caixa vermelha = colisor', 4, 12);
    },

    tab_itens(el) {
      const P = E.Project;
      if (!P.items[this.itemSel]) this.itemSel = Object.keys(P.items)[0];
      const id = this.itemSel, d = P.items[id];
      if (!d.icon) d.icon = E.makeIcon([' ' + d.glyph + ' '], [' a '], { a: E.rgbHex(d.color) });
      this.ico ||= { tool: 'lapis', ch: '#', col: '#ffd23f' };
      const T = this.ico;
      const GLYPHS = '#%@&*+=-:.·oO0Q$^~/\\|_()[]{}<>!?♥♦♣♠☼‖●○◆◇■□▲▼◄►█▓▒░▀▄═║╔╗╚╝─│┌┐└┘├┤┬┴┼≈°•∩ШΛʟ≡';
      const SW = ['#ffd23f', '#e8a23a', '#8a5a1a', '#ff4a50', '#a02028', '#f0f2f8', '#9aa3b8', '#5c6378', '#5fc8ff', '#2a6fa8', '#6fe07a', '#2f8a3a', '#ff8a2a', '#ffd060', '#7a5232', '#4a3220', '#c8ccd6', '#2a2a32', '#d63a2c', '#b46cff'];
      el.innerHTML = `
        <div class="list items">${Object.entries(P.items).map(([k, x]) => `<div data-id="${k}" class="${k === id ? 'on' : ''}"><b style="color:${E.rgbHex(x.color)}">${esc(x.glyph)}</b> ${esc(x.name)} <small>${x.type}</small></div>`).join('')}</div>
        <div class="row"><input id="itNewId" placeholder="id do novo item" style="flex:1"><button id="itNew">+ Novo</button><button id="itDup">Duplicar</button></div>
        <div class="row"><button id="itGive">Dar ao herói</button><button id="itDel" class="danger">Apagar</button></div>
        <h4>Estúdio do ícone</h4>
        <div class="row"><label style="margin:0">L <input type="number" id="icW" value="${d.icon.w}" min="1" max="12" style="width:46px"></label><label style="margin:0">A <input type="number" id="icH" value="${d.icon.h}" min="1" max="8" style="width:46px"></label>
          ${[['lapis', 'Lápis'], ['balde', 'Balde'], ['borracha', 'Borracha'], ['conta', 'Conta-gotas']].map(([k, l]) => `<button data-ict="${k}" class="${T.tool === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <canvas id="icCv" width="300" height="190"></canvas>
        <div class="glyphs">${[...GLYPHS].map((c) => `<button data-g="${esc(c)}" class="${c === T.ch ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
        <div class="row"><input type="color" id="icCol" value="${T.col}"><span class="sw">${SW.map((c) => `<i data-c="${c}" style="background:${c}"></i>`).join('')}</span></div>
        <div class="row"><button id="icAuto">Gerar do glifo</button><button id="icClear" class="danger">Limpar</button></div>
        <h4>Prévia no jogo</h4>
        <div class="previews"><pre class="ascii" id="icPrevInv"></pre><div><pre class="ascii" id="icPrevSlot"></pre><canvas id="icPrevWorld" width="120" height="70"></canvas></div></div>
        <h4>Propriedades</h4>
        <div id="f"></div>`;
      el.querySelector('.items').onclick = (e) => {
        const r = e.target.closest('[data-id]');
        if (r) {
          this.itemSel = r.dataset.id;
          this.renderTab();
        }
      };
      const newItem = (base) => {
        const nid = ($('#itNewId').value || (base ? id + '_2' : 'item' + Object.keys(P.items).length)).replace(/\W+/g, '_');
        if (P.items[nid]) return E.toast('Esse id já existe');
        P.items[nid] = base ? JSON.parse(JSON.stringify(base)) : { name: 'Novo item', glyph: '*', color: [1, 1, 1], type: 'consumivel', stack: 9, effect: { heal: 1 }, desc: '' };
        if (base) P.items[nid].name += ' (cópia)';
        this.itemSel = nid;
        this.renderTab();
      };
      $('#itNew').onclick = () => newItem(null);
      $('#itDup').onclick = () => newItem(d);
      $('#itGive').onclick = () => {
        G().inv.add(id, 1);
        E.UI.refresh();
        E.toast('Adicionado ao inventário (I para ver)');
      };
      $('#itDel').onclick = (e) => {
        if (!e.target.dataset.armed) {
          e.target.dataset.armed = 1;
          e.target.textContent = 'confirmar?';
          return;
        }
        delete P.items[id];
        this.renderTab();
      };
      // ---------- canvas de desenho ----------
      const cv = $('#icCv'), ctx = cv.getContext('2d');
      const ic = d.icon;
      const cell = () => {
        const cw = Math.floor(Math.min(cv.width / ic.w, (cv.height / ic.h) / 1.9));
        return { cw, ch: Math.floor(cw * 1.9), ox: (cv.width - cw * ic.w) / 2, oy: (cv.height - Math.floor(cw * 1.9) * ic.h) / 2 };
      };
      const draw = () => {
        const { cw, ch, ox, oy } = cell();
        ctx.fillStyle = '#05060c';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.font = `${Math.floor(ch * 0.85)}px Cascadia Mono, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = 0; y < ic.h; y++)
          for (let x = 0; x < ic.w; x++) {
            ctx.strokeStyle = '#1c2030';
            ctx.strokeRect(ox + x * cw + 0.5, oy + y * ch + 0.5, cw - 1, ch - 1);
            const c = ic.cells[y * ic.w + x];
            if (c) {
              ctx.fillStyle = c[1];
              ctx.fillText(c[0], ox + x * cw + cw / 2, oy + y * ch + ch / 2 + 1);
            }
          }
        previews();
      };
      const previews = () => {
        const lines = E.UI.iconLines(d);
        $('#icPrevInv').innerHTML = E.asciiBox('', lines.map((l, k) => E.asciiPad(l, ic.w) + '  ' + (k === 0 ? `<span style="color:${E.rgbHex(d.color)}">${esc(d.name)}</span>` : k === 1 ? `<span class="fr">[${d.type}]</span>` : '')), ic.w + 2 + Math.max(10, d.name.length), 'single');
        $('#icPrevSlot').innerHTML = `<span class="fr">┌───┐</span>\n<span class="fr">│</span><span style="color:${E.rgbHex(d.color)}">${esc(d.glyph)}</span> 2<span class="fr">│</span>\n<span class="fr">└─1─┘</span>`;
        const w = $('#icPrevWorld'), c2 = w.getContext('2d');
        c2.fillStyle = '#05060c';
        c2.fillRect(0, 0, w.width, w.height);
        const g = c2.createRadialGradient(60, 34, 2, 60, 34, 34);
        g.addColorStop(0, E.rgbHex(d.color.map((v) => v * 0.6)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c2.fillStyle = g;
        c2.fillRect(0, 0, w.width, w.height);
        c2.font = '20px Cascadia Mono, Consolas, monospace';
        c2.textAlign = 'center';
        c2.fillStyle = E.rgbHex(d.color);
        c2.fillText(d.glyph, 60, 40 + Math.sin(performance.now() / 300) * 2);
        c2.fillStyle = '#3a6a2a';
        c2.fillText('/|\\|/|\\', 60, 62);
        c2.font = '10px system-ui';
        c2.fillStyle = '#7d8399';
        c2.textAlign = 'left';
        c2.fillText('no chão', 4, 12);
      };
      const at = (e) => {
        const r = cv.getBoundingClientRect(), { cw, ch, ox, oy } = cell();
        const x = Math.floor(((e.clientX - r.left) * (cv.width / r.width) - ox) / cw), y = Math.floor(((e.clientY - r.top) * (cv.height / r.height) - oy) / ch);
        return x >= 0 && y >= 0 && x < ic.w && y < ic.h ? y * ic.w + x : -1;
      };
      const paint = (e) => {
        const i = at(e);
        if (i < 0) return;
        const erase = e.buttons === 2 || T.tool === 'borracha';
        if (T.tool === 'conta') {
          const c = ic.cells[i];
          if (c) {
            T.ch = c[0];
            T.col = c[1];
            T.tool = 'lapis';
            this.renderTab();
          }
          return;
        }
        if (T.tool === 'balde' && !erase) {
          const target = JSON.stringify(ic.cells[i]);
          const st = [i], seen = new Set();
          while (st.length) {
            const k = st.pop();
            if (k < 0 || k >= ic.cells.length || seen.has(k) || JSON.stringify(ic.cells[k]) !== target) continue;
            seen.add(k);
            ic.cells[k] = [T.ch, T.col];
            const x = k % ic.w;
            if (x > 0) st.push(k - 1);
            if (x < ic.w - 1) st.push(k + 1);
            st.push(k - ic.w, k + ic.w);
          }
        } else ic.cells[i] = erase ? null : [T.ch, T.col];
        draw();
        E.UI.refresh();
      };
      cv.oncontextmenu = (e) => e.preventDefault();
      cv.onpointerdown = (e) => {
        cv.setPointerCapture(e.pointerId);
        paint(e);
      };
      cv.onpointermove = (e) => e.buttons && T.tool !== 'balde' && T.tool !== 'conta' && paint(e);
      el.querySelector('.glyphs').onclick = (e) => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        T.ch = b.dataset.g;
        if (T.tool === 'borracha' || T.tool === 'conta') T.tool = 'lapis';
        el.querySelectorAll('.glyphs button').forEach((x) => x.classList.toggle('on', x === b));
      };
      $('#icCol').oninput = (e) => (T.col = e.target.value);
      el.querySelector('.sw').onclick = (e) => {
        const c = e.target.dataset.c;
        if (c) {
          T.col = c;
          $('#icCol').value = c;
        }
      };
      el.querySelectorAll('[data-ict]').forEach((b) => (b.onclick = () => {
        T.tool = b.dataset.ict;
        el.querySelectorAll('[data-ict]').forEach((x) => x.classList.toggle('on', x === b));
      }));
      const resize = () => {
        const w = Math.max(1, Math.min(12, +$('#icW').value || ic.w)), h = Math.max(1, Math.min(8, +$('#icH').value || ic.h));
        const cells = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(x < ic.w && y < ic.h ? ic.cells[y * ic.w + x] : null);
        Object.assign(ic, { w, h, cells });
        draw();
      };
      $('#icW').onchange = resize;
      $('#icH').onchange = resize;
      $('#icAuto').onclick = () => {
        ic.cells = ic.cells.map(() => null);
        ic.cells[Math.floor(ic.h / 2) * ic.w + Math.floor(ic.w / 2)] = [d.glyph, E.rgbHex(d.color)];
        draw();
      };
      $('#icClear').onclick = () => {
        ic.cells = ic.cells.map(() => null);
        draw();
      };
      draw();
      this._pv = setInterval(() => this.active && this.tab === 'itens' && previews(), 120);
      // ---------- propriedades ----------
      form($('#f'), d, [
        ['name', 'Nome', 'text'], ['glyph', 'Glifo (hotbar e chão)', 'text'], ['color', 'Cor', 'color'],
        ['type', 'Tipo', 'select', [['consumivel', 'consumível'], ['arma', 'arma'], ['armadura', 'armadura'], ['luz', 'luz (lanterna)'], ['arremesso', 'arremesso (Q)'], ['chave', 'chave'], ['material', 'material']]],
        ['stack', 'Empilha até', 'number'], ['desc', 'Descrição', 'text'],
        ['slot', 'Armadura: espaço', 'select', [['', '—'], ['cabeca', 'cabeça'], ['corpo', 'corpo'], ['pes', 'pés']]],
        ['defense', 'Armadura: defesa (cada ponto = 10% de bloquear, até 70%)', 'number'],
        ['speed', 'Armadura: multiplicador de velocidade', 'number'],
        ['look.helmet', 'Visual: elmo', 'select', [['', 'capuz (padrão)'], ['ferro', 'elmo de ferro'], ['ouro', 'elmo de ouro']]],
        ['look.chest', 'Visual: peito', 'select', [['', '—'], ['ferro', 'peitoral de ferro'], ['ouro', 'peitoral de ouro']]],
        ['look.cloak', 'Visual: capa', 'select', [['', 'cinza (padrão)'], ['rubra', 'rubra'], ['gelo', 'gélida'], ['verde', 'floresta'], ['sombra', 'sombria']]],
        ['look.hood', 'Visual: capuz', 'select', [['', 'padrão'], ['sombra', 'sombrio']]], ['jumps', 'Armadura: pulos extras no ar', 'number'], ['price', 'Preço no mercador (venda = metade)', 'number'],
        ['look.boots', 'Visual: botas', 'select', [['', 'escuras (padrão)'], ['couro', 'couro']]],
        ['effect.heal', 'Consumível: cura', 'number'], ['effect.status', 'Consumível: status', 'select', ['', ...Object.keys(E.STATUS)]], ['effect.time', 'Consumível: duração (s)', 'number'],
        ['fx', 'Efeito visual ao usar', 'select', ['', ...E.FX.names()]],
        ['weapon.damage', 'Arma: dano', 'number'], ['weapon.range', 'Arma: alcance (1 = normal)', 'number'], ['weapon.shape', 'Arma: formato', 'select', [['', 'espada'], ['adaga', 'adaga'], ['lanca', 'lança'], ['machado', 'machado'], ['martelo', 'martelo'], ['cajado', 'cajado'], ['arco', 'arco']]], ['weapon.speed', 'Arma: velocidade (1 = normal)', 'number'], ['weapon.knock', 'Arma: empurrão', 'number'], ['weapon.color', 'Arma: cor da lâmina/golpe', 'color'], ['weapon.status', 'Arma: aplica status', 'select', ['', ...Object.keys(E.STATUS)]], ['weapon.fx', 'Arma: efeito ao acertar', 'select', ['', ...E.FX.names()]],
        ['light.r', 'Luz: raio', 'number'], ['light.i', 'Luz: intensidade', 'number'], ['light.c', 'Luz: cor', 'color'],
        ['throw.damage', 'Arremesso: dano', 'number'], ['throw.radius', 'Arremesso: raio da explosão', 'number'], ['throw.fx', 'Arremesso: efeito', 'select', ['', ...E.FX.names()]],
        ['script', 'Script onUse(api, item) — retorne false para cancelar', 'textarea', 6],
      ], (k) => {
        if (k === 'name' || k === 'glyph' || k === 'color' || k === 'type') previews();
        E.UI.refresh();
      });
    },

    tab_mundo(el) {
      const P = E.Project, w = W(), s = w.settings;
      s.ambK ??= 1;
      s.caveK ??= 1;
      el.innerHTML = `
        <h4>Mapas do jogo</h4>
        <div class="list">${Object.values(P.worlds).map((m) => `<div data-map="${m.id}" class="${m === w ? 'on' : ''}">${m.id === P.startMap ? '★ ' : ''}${esc(m.name)} <small>${m.id} · ${m.W}×${m.H}</small></div>`).join('')}</div>
        <div id="fm"></div>
        <div class="row"><button id="mStart">★ Mapa inicial</button><input id="mSeed" type="number" value="1" style="width:56px"><button id="mRegen">Regenerar terreno</button></div>
        <h4>Projeto</h4>
        <label>Nome <input id="pName" value="${esc(P.name)}"></label>
        <div class="row"><button id="pSave" class="primary">Salvar projeto (.json)</button><label class="file btn">Abrir…<input type="file" id="pOpen" accept=".json" hidden></label></div>
        <div class="row"><button id="pMap">Exportar este mapa</button><button id="pShot">Screenshot</button><button id="pReset" class="danger">Restaurar jogo original</button></div>
        <h4>Gerar build do jogo</h4>
        <div id="buildBox"></div>
        <details><summary class="hint">Avançado: exportar só o game-data.js</summary><div class="row"><button id="pExport">Baixar game-data.js</button><button id="pExportDir">Salvar na pasta…</button></div></details>
        <h4>Visual deste mapa</h4><div id="fv"></div>
        <h4>Movimento e vida do jogador</h4><div id="fp"></div>
        <h4>Sprite do herói</h4>
        <div class="hint">Use um spritesheet PNG seu (ex.: exportado do Aseprite). A imagem é ajustada a ${E.HERO.cols}×${E.HERO.rows} células e convertida para ASCII a cada quadro. Deixe vazio para o herói procedural.</div>
        <label class="file">Importar spritesheet do herói<input type="file" id="pHeroImg" accept="image/*" hidden></label>
        <div id="fhi"></div>
        <label>Nome exibido <input id="pHero" value="${esc(G().name)}"></label>
        <label>Tamanho do glifo <input type="range" id="pFont" min="5" max="16" value="${G().fontSize}"></label>`;
      el.querySelector('.list').onclick = (e) => {
        const r = e.target.closest('[data-map]');
        if (r) {
          G().enterWorld(P.worlds[r.dataset.map]);
          this.renderTab();
        }
      };
      form($('#fm'), w, [['name', 'Nome do mapa', 'text']]);
      $('#mStart').onclick = () => {
        P.startMap = w.id;
        this.renderTab();
      };
      $('#mRegen').onclick = () => {
        const seed = +$('#mSeed').value || 1;
        const nw = s.sky === 'Caverna' ? E.generateCave(seed, s.cave || {}) : E.generateWorld(seed);
        nw.id = w.id;
        nw.name = w.name;
        // refaz as ligações das portas entre o mundo e as masmorras
        for (const c of Object.values(P.worlds)) if (c.settings && c.settings.sky === 'Caverna' && c.id !== w.id) E.ProjectIO.linkCave(nw, c);
        if (s.sky === 'Caverna' && P.worlds.fase1) E.ProjectIO.linkCave(P.worlds.fase1, nw);
        P.worlds[w.id] = nw;
        G().enterWorld(nw);
        this.renderTab();
      };
      $('#pName').onchange = (e) => (P.name = e.target.value);
      $('#pSave').onclick = () => {
        E.download((P.name || 'jogo').replace(/\W+/g, '_') + '.project.json', JSON.stringify(E.ProjectIO.toJSON()));
        E.ProjectIO.saveLocal();
      };
      $('#pOpen').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          G().enterWorld(E.ProjectIO.fromJSON(JSON.parse(await f.text())));
          this.renderTab();
          E.toast('Aberto: ' + f.name);
        } catch (err) {
          E.toast('Arquivo inválido: ' + err.message);
        }
      };
      $('#pMap').onclick = () => E.download(w.id + '.world.json', JSON.stringify(w.toJSON()));
      const gameData = () => 'window.GAME_DATA = ' + JSON.stringify(Object.assign(E.ProjectIO.toJSON(), { font: G().fontSize, heroName: G().name })) + ';\n';
      $('#pExport').onclick = () => E.download('game-data.js', new Blob([gameData()], { type: 'text/javascript' }));
      $('#pExportDir').onclick = async () => {
        if (!window.showDirectoryPicker) return E.toast('Seu navegador não permite escolher pasta; use o botão de download.');
        try {
          const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
          const fh = await dir.getFileHandle('game-data.js', { create: true });
          const wtr = await fh.createWritable();
          await wtr.write(gameData());
          await wtr.close();
          E.toast('game-data.js salvo em ' + dir.name);
        } catch (err) {
          if (err.name !== 'AbortError') E.toast('Falhou: ' + err.message);
        }
      };
      E.Build.mount($('#buildBox'), gameData);
      $('#pShot').onclick = () => E.Renderer.canvas.toBlob((b) => E.download('screenshot.png', b));
      $('#pReset').onclick = (e) => {
        if (!e.target.dataset.armed) {
          e.target.dataset.armed = 1;
          e.target.textContent = 'confirmar? (perde o salvo local)';
          return;
        }
        E.ProjectIO.clearLocal();
        E.ProjectIO.createDefault();
        G().inv = new E.Inventory();
        G().enterWorld(P.worlds[P.startMap]);
        this.renderTab();
      };
      form($('#fv'), s, [
        ['sky', 'Céu', 'select', Object.keys(E.SKIES)],
        ['ambK', 'Luz ambiente', 'range', [0, 2.5, 0.01]],
        ['caveK', 'Luz nas cavernas', 'range', [0, 3, 0.01]],
        ['glow', 'Bloom', 'range', [0, 2.5, 0.01]],
        ['fog', 'Neblina', 'range', [0, 1.5, 0.01]],
        ['rain', 'Chuva', 'range', [0, 1, 0.01]],
        ['shadows', 'Sombras', 'check'],
        ['dayNight', 'Ciclo de dia e noite', 'check'],
        ['cycle', 'Duração de um dia (minutos reais)', 'number'],
        ['hour', 'Hora atual (0–24)', 'range', [0, 24, 0.1]],
      ], (k) => {
        if (k === 'sky' || k === 'ambK') {
          s.amb = (E.SKIES[s.sky] || E.SKIES.Noite).amb.map((v) => v * s.ambK);
          E.applySky();
        }
      });
      form($('#fp'), P.player, [
        ['maxHp', 'Vida máxima', 'number'], ['speed', 'Velocidade', 'number'], ['accel', 'Aceleração no chão', 'number'], ['airAccel', 'Aceleração no ar', 'number'],
        ['jump', 'Força do pulo', 'number'], ['gravity', 'Gravidade subindo', 'number'], ['fallGravity', 'Gravidade caindo', 'number'], ['maxFall', 'Queda máxima', 'number'],
        ['coyote', 'Coyote time (s)', 'number'], ['buffer', 'Buffer de pulo (s)', 'number'],
        ['dash', 'Dash (Shift/K)', 'check'], ['dashSpeed', 'Velocidade do dash', 'number'], ['dashTime', 'Duração do dash', 'number'], ['dashCooldown', 'Recarga do dash', 'number'],
        ['doubleJump', 'Pulo duplo', 'check'], ['wallJump', 'Deslizar e pular na parede', 'check'], ['wallSlide', 'Velocidade deslizando', 'number'], ['climbSpeed', 'Velocidade na escada', 'number'],
      ], (k, v) => {
        if (k === 'maxHp') {
          G().player.maxHp = v;
          G().player.hp = Math.min(G().player.hp, v);
          E.UI.refresh();
        }
      });
      $('#pHero').oninput = (e) => (G().name = e.target.value.slice(0, 16));
      $('#pFont').oninput = (e) => E.setFontSize(+e.target.value);
      const hi = P.player.image;
      if (hi) {
        form($('#fhi'), hi, [['cols', 'Colunas de quadros', 'number'], ['rows', 'Linhas de quadros', 'number'], ['fps', 'FPS', 'number'], ['anims.idle', 'idle (ex.: 0-3)', 'text'], ['anims.run', 'run', 'text'], ['anims.jump', 'jump', 'text'], ['anims.fall', 'fall', 'text'], ['anims.attack', 'attack', 'text'], ['anims.dash', 'dash', 'text'], ['anims.climb', 'climb', 'text'], ['anims.hurt', 'hurt', 'text'], ['pixel', 'Pixel art (sem suavizar)', 'check']]);
        $('#fhi').insertAdjacentHTML('beforeend', '<button id="pHeroDel">Voltar ao herói procedural</button>');
        $('#pHeroDel').onclick = () => {
          P.player.image = null;
          this.renderTab();
        };
      }
      $('#pHeroImg').onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          P.player.image = { src: rd.result, cols: 1, rows: 1, fps: 10, anims: { idle: '0' }, pixel: true };
          this.renderTab();
        };
        rd.readAsDataURL(f);
      };
    },
  });

  const API_HELP = `Eventos (declare as funções que quiser):
  onSpawn(self, api)             ao nascer
  onUpdate(self, dt, api)        todo quadro
  onHit(self, dano, api)         ao levar dano
  onDeath(self, api)             ao morrer
  onTouch(self, player, api)     ao encostar no jogador
  onInteract(self, player, api)  jogador apertou E perto
Gatilhos: onEnter(api) onStay(api, dt) onExit(api)
Itens: onUse(api, item)

self: x y vx vy facing hp maxHp onGround vars (memória) props (do mapa) def (criatura) anim

api.player  api.time  api.vars (memória global)
api.dist(a,b?) api.dx(a) api.dy(a)     distância/deltas até o jogador
api.every(self,'nome',seg)             true a cada N segundos
api.move(self,dir,vel) api.stop(self) api.jump(self,força)
api.fly(self,x,y,vel)                  para voadores
api.face(self,dir) api.facePlayer(self) api.anim(self,'nome',seg?)
api.onGround(self) api.wallAhead(self) api.gapAhead(self)
api.shoot(self,{speed,damage,glyph,color,arc,homing,light,status})
api.spawn('criatura',x,y,props)  api.drop('item',x,y,qtd)
api.fx('explosao|cura|fogo|magia|faisca|poeira|sangue|gosma|fumaca|raio|moedas',x,y)
api.say(self,'texto',seg)  api.message('texto')  api.sound('nome', self?)
api.damage(alvo,n) api.heal(alvo,n)
api.status(alvo,'queimando|veneno|velocidade|regeneracao|brilho|escudo|lento',seg)
api.kill(self) api.teleport(self,x,y)
api.give('item',qtd) api.has('item',qtd) api.take('item',qtd)
api.goto('mapa',x,y) api.setSpawn(x,y)
api.setCollider(x,y,w,h,tipo)   0 auto 1 sólido 2 vazada 3 vazio 4 perigo 5 escada
api.weather({rain,fog,glow,sky}) api.shake(n) api.light(self,{c,r,i})
api.random(a,b) api.chance(p) api.log(...)`;
})();

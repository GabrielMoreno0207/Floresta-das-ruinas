'use strict';
// Editor de mapa: tiles, entidades, camadas de fundo com parallax, iluminação ASCII e modo de teste jogável.
(function () {
  const AF = window.AF;
  const $ = (s, r = document) => r.querySelector(s);

  AF.LIGHT_PRESETS = {
    Tocha: { color: '#ffb347', radius: 14, intensity: 1.2, flicker: 0.25, mode: 'flicker' },
    Vela: { color: '#ffd27f', radius: 7, intensity: 0.9, flicker: 0.35, mode: 'flicker' },
    Cristal: { color: '#73eff7', radius: 11, intensity: 1.0, flicker: 0.3, mode: 'pulse' },
    Lava: { color: '#ff3b1a', radius: 16, intensity: 1.1, flicker: 0.15, mode: 'flicker' },
    Lua: { color: '#a9c1ff', radius: 40, intensity: 0.6, flicker: 0, mode: 'steady' },
    Magia: { color: '#b46cff', radius: 10, intensity: 1.3, flicker: 0.5, mode: 'pulse' },
    Neon: { color: '#ff3df5', radius: 9, intensity: 1.1, flicker: 0.08, mode: 'flicker' },
  };

  AF.newMap = (name = 'Fase 1', w = 20, h = 9, tileW = 6, tileH = 3) => ({
    id: AF.uid(),
    name,
    w,
    h,
    tileW,
    tileH,
    tiles: Array(w * h).fill(null),
    entities: [],
    lights: [],
    layers: [],
    bgColor: '#07070c',
    ambient: { color: '#6a7ad0', level: 0.6 },
    fx: { lighting: true, shadows: true, glyphLight: true, haze: 0.6 },
  });

  // ---------- ruído para flicker ----------
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise1 = (t, seed) => {
    const i = Math.floor(t), f = t - i;
    const a = hash(i, seed), b = hash(i + 1, seed);
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
  const lightFactor = (L, t) => {
    const seed = (L.seed ??= Math.floor(Math.random() * 9999));
    if (L.mode === 'pulse') return 1 + L.flicker * Math.sin(t * 3 + seed);
    if (L.mode === 'flicker') return 1 + L.flicker * (noise1(t * 9, seed) * 1.4 - 0.7 + (noise1(t * 23, seed + 7) - 0.5) * 0.6);
    return 1;
  };

  // glifos que balançam; o valor é o glifo "em repouso"
  const SWAY = { '|': '|', '/': '|', '\\': '|', '!': '!', "'": "'", '"': '"', ',': ',', '`': "'", i: 'i', l: 'l', v: 'v', V: 'V', w: 'w', W: 'W', y: 'y', Y: 'Y', ')': '|', '(': '|', ';': ';', '¡': '¡' };

  // ---------- degradação de glifo pela luz ----------
  const degCache = new Map();
  // só na quase-escuridão: o glifo vira pontuação esparsa e some no breu (preserva as formas na meia-luz)
  function degradeChar(c, l) {
    if (l >= 0.3 || c == null || c === ' ') return c;
    if (l < 0.07) return ' ';
    const code = c.codePointAt(0);
    if ('█▓▒░'.includes(c)) return l < 0.18 ? '░' : '▒';
    if (code >= 0x2800 && code <= 0x28ff) return c;
    const key = c + (l < 0.18 ? 0 : 1);
    if (degCache.has(key)) return degCache.get(key);
    const d = code < 0x2500 ? AF.glyphDensity(c) : 0.3;
    const out = l < 0.18 ? (d > 0.12 ? '.' : ' ') : d > 0.22 ? ':' : d > 0.1 ? '.' : c;
    degCache.set(key, out);
    return out;
  }

  // ---------- composição + iluminação ----------
  // retorna buffer com chars/cores já iluminados para a janela [camX, camX+vw)
  AF.composeMap = (map, project, t, camX, vw, camY = 0, vh = null) => {
    const VW = vw, VH = vh || map.h * map.tileH;
    const N = VW * VH;
    const C = new Array(N).fill(null), F = new Array(N), B = new Array(N).fill(null), EM = new Uint8Array(N), SOL = new Uint8Array(N);
    const byId = AF.assetIndex(project);
    const blit = (g, wx, wy, em, solid, flip) => {
      for (let y = 0; y < g.h; y++) {
        const vy = wy + y - camY;
        if (vy < 0 || vy >= VH) continue;
        for (let x = 0; x < g.w; x++) {
          const vx = wx + (flip ? g.w - 1 - x : x) - camX;
          if (vx < 0 || vx >= VW) continue;
          const cell = g.cells[y * g.w + x];
          if (cell.c == null && !cell.b) continue;
          const i = vy * VW + vx;
          if (cell.c != null && cell.c !== ' ') {
            C[i] = flip ? AF.mirrorChar(cell.c, 'h') : cell.c;
            F[i] = AF.hexToRgb(cell.f);
          }
          if (cell.b) B[i] = AF.hexToRgb(cell.b);
          EM[i] = em ? 1 : 0;
          if (solid) SOL[i] = 1;
        }
      }
    };
    // camadas de fundo (parallax, repetidas na horizontal)
    for (const L of map.layers) {
      const a = byId[L.assetId];
      if (!a) continue;
      const g = AF.frameAt(a.anims[0], t);
      const off = Math.round(camX * (1 - (L.parallax ?? 0.5)));
      const start = camX - off;
      let x0 = Math.floor(start / g.w) * g.w;
      for (let x = x0; x < start + VW + g.w; x += g.w) {
        blit(g, x + off, L.y || 0, a.emissive, false, false);
        if (L.repeat === false) break;
      }
    }
    // tiles
    const tx0 = Math.max(0, Math.floor(camX / map.tileW)), tx1 = Math.min(map.w, Math.ceil((camX + VW) / map.tileW));
    const foliage = [];
    for (let ty = 0; ty < map.h; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        const id = map.tiles[ty * map.w + tx];
        const a = id && byId[id];
        if (!a) continue;
        const g = AF.frameAt(a.anims[0], t + tx * 0.13);
        blit(g, tx * map.tileW, ty * map.tileH, a.emissive, a.solid, false);
        if (a.foliage) foliage.push([tx * map.tileW, ty * map.tileH, g]);
      }
    // folhagem: vento + curvatura ao redor das entidades (inspirado no "grass physics" do @ansenjeo)
    if (foliage.length) {
      const pushers = map.entities.filter((e) => byId[e.assetId]?.kind === 'sprite').map((e) => {
        const a = byId[e.assetId];
        return { x: e.x + a.w / 2, y: e.y + a.h, vx: e.vx || 0 };
      });
      for (const [wx, wy, g] of foliage)
        for (let y = 0; y < Math.min(g.h, map.tileH); y++)
          for (let x = 0; x < Math.min(g.w, map.tileW); x++) {
            if (g.cells[y * g.w + x].c == null) continue;
            const gx = wx + x, gy = wy + y;
            const vx = gx - camX, vy = gy - camY;
            if (vx < 0 || vx >= VW || vy < 0 || vy >= VH) continue;
            const i = vy * VW + vx;
            if (!C[i] || !SWAY[C[i]]) continue;
            let bend = Math.sin(t * 1.7 + gx * 0.35) * 0.55 + Math.sin(t * 3.1 + gx * 0.9) * 0.2;
            for (const p of pushers) {
              const dx = gx - p.x, dy = gy - p.y;
              if (Math.abs(dx) < 4 && dy > -3 && dy < 2) bend += Math.sign(dx || p.vx || 1) * (1.6 - Math.abs(dx) * 0.3);
            }
            C[i] = bend > 0.5 ? (bend > 1.4 ? '_' : '/') : bend < -0.5 ? (bend < -1.4 ? '_' : '\\') : SWAY[C[i]];
          }
    }
    // entidades
    for (const e of map.entities) {
      const a = byId[e.assetId];
      if (!a) continue;
      const anim = a.anims.find((x) => x.name === e.anim) || a.anims[0];
      blit(AF.frameAt(anim, t + (e.phase || 0)), Math.round(e.x), Math.round(e.y), a.emissive, false, e.flip);
    }

    if (!map.fx.lighting) return { VW, VH, C, F, B, EM, lit: null };

    const m = AF.metrics(32);
    const aspect = m.ch / m.cw;
    // ambiente = matiz normalizada * nível (a cor define o tom, o nível define o brilho)
    const ambRaw = AF.hexToRgb(map.ambient.color), ambMax = Math.max(1, ...ambRaw);
    const amb = ambRaw.map((v) => (v / ambMax) * map.ambient.level);
    const LR = new Float32Array(N), LG = new Float32Array(N), LB = new Float32Array(N), DY = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      LR[i] = amb[0];
      LG[i] = amb[1];
      LB[i] = amb[2];
    }
    const lights = map.lights.concat(map._runtimeLights || []);
    for (const L of lights) {
      const lx = L.x - camX, ly = L.y - camY;
      const col = AF.hexToRgb(L.color).map((v) => v / 255);
      const k = L.intensity * lightFactor(L, t);
      const r = L.radius;
      const ry = r / aspect;
      const x0 = Math.max(0, Math.floor(lx - r)), x1 = Math.min(VW - 1, Math.ceil(lx + r));
      const y0 = Math.max(0, Math.floor(ly - ry)), y1 = Math.min(VH - 1, Math.ceil(ly + ry));
      const lcx = Math.round(lx), lcy = Math.round(ly);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = x - lx, dy = (y - ly) * aspect;
          const d = Math.sqrt(dx * dx + dy * dy) / r;
          if (d >= 1) continue;
          let att = Math.pow(1 - d, 1.6) * k;
          if (map.fx.shadows && att > 0.01) {
            // raio em grade (DDA) até a célula; células sólidas no caminho bloqueiam
            const steps = Math.max(Math.abs(x - lcx), Math.abs(y - lcy));
            for (let s = 1; s < steps; s++) {
              const px = Math.round(lcx + ((x - lcx) * s) / steps), py = Math.round(lcy + ((y - lcy) * s) / steps);
              if (px >= 0 && py >= 0 && px < VW && py < VH && SOL[py * VW + px]) {
                att *= 0.12;
                break;
              }
            }
          }
          const i = y * VW + x;
          LR[i] += col[0] * att;
          LG[i] += col[1] * att;
          LB[i] += col[2] * att;
          DY[i * 3] += col[0] * att;
          DY[i * 3 + 1] += col[1] * att;
          DY[i * 3 + 2] += col[2] * att;
        }
    }
    const haze = map.fx.haze || 0;
    const tq = Math.floor(t * 3);
    for (let i = 0; i < N; i++) {
      if (EM[i] && C[i] != null) continue;
      const l = (0.2126 * LR[i] + 0.7152 * LG[i] + 0.0722 * LB[i]);
      if (C[i] != null && !EM[i]) {
        if (map.fx.glyphLight) C[i] = degradeChar(C[i], l);
        const f = F[i];
        F[i] = [f[0] * LR[i], f[1] * LG[i], f[2] * LB[i]];
      } else if (haze > 0) {
        const dl = 0.2126 * DY[i * 3] + 0.7152 * DY[i * 3 + 1] + 0.0722 * DY[i * 3 + 2];
        const hv = dl * haze;
        const x = i % VW, y = (i / VW) | 0;
        const rnd = hash(x + camX * 1, y * 31 + (hash(x + camX, y) < 0.04 ? tq : 0));
        if (hv > 0.06 && rnd < hv * 0.55) {
          C[i] = hv > 0.7 && rnd < 0.08 ? '*' : hv > 0.4 ? '·' : '.';
          const mx = Math.max(DY[i * 3], DY[i * 3 + 1], DY[i * 3 + 2], 1e-3);
          const s = 255 * Math.min(1, 0.35 + hv);
          F[i] = [(DY[i * 3] / mx) * s, (DY[i * 3 + 1] / mx) * s, (DY[i * 3 + 2] / mx) * s];
        }
      }
      if (B[i] && !EM[i]) {
        const b = B[i];
        B[i] = [b[0] * LR[i], b[1] * LG[i], b[2] * LB[i]];
      }
    }
    return { VW, VH, C, F, B, EM, lit: true };
  };

  AF.drawComposed = (ctx, buf, m, bgColor) => {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, buf.VW * m.cw, buf.VH * m.ch);
    AF.prepCtx(ctx, m.size);
    const hex = (c) => (typeof c === 'string' ? c : AF.rgbToHex(c[0], c[1], c[2]));
    for (let i = 0; i < buf.C.length; i++) {
      const c = buf.C[i], b = buf.B[i];
      if (c == null && !b) continue;
      const x = (i % buf.VW) * m.cw, y = Math.floor(i / buf.VW) * m.ch;
      AF.drawGlyph(ctx, c, c != null ? hex(buf.F[i]) : null, b ? hex(b) : null, x, y, m.cw, m.ch);
    }
  };

  // ---------- UI ----------
  const S = {
    tool: 'tile',
    tileId: null,
    entityId: null,
    light: Object.assign({}, AF.LIGHT_PRESETS.Tocha),
    sel: null, // {type:'light'|'entity', ref}
    camX: 0,
    vw: 80,
    animate: true,
    play: false,
    t0: performance.now(),
    hover: null,
    drag: null,
  };
  AF.mapState = S;

  const map = () => AF.currentMap();

  function panelHTML() {
    return `
    <div class="map-left panel">
      <div class="tools" id="mapTools">
        ${[['tile', '▦ Tile'], ['erase', '⌫ Apagar'], ['entity', '☺ Entidade'], ['light', '☼ Luz'], ['select', '✥ Mover']]
          .map(([k, l]) => `<button data-tool="${k}">${l}</button>`)
          .join('')}
      </div>
      <h4>Tiles</h4><div id="mapTiles" class="swatch-list"></div>
      <h4>Entidades / FX</h4><div id="mapEnts" class="swatch-list"></div>
      <h4>Luz</h4>
      <div id="lightPresets" class="chips"></div>
      <label>Cor <input type="color" id="lColor"></label>
      <label>Raio <input type="range" id="lRadius" min="3" max="60"><span></span></label>
      <label>Intensidade <input type="range" id="lInt" min="0.1" max="3" step="0.05"><span></span></label>
      <label>Oscilação <input type="range" id="lFlick" min="0" max="1" step="0.01"><span></span></label>
      <label>Modo <select id="lMode"><option value="flicker">fogo (flicker)</option><option value="pulse">pulso</option><option value="steady">fixa</option></select></label>
      <div id="selInfo" class="hint"></div>
    </div>
    <div class="map-center">
      <div class="map-bar">
        <button id="mPlay" class="primary">▶ Testar (jogar)</button>
        <label><input type="checkbox" id="mAnimate" checked> animar</label>
        <label>Câmera <input type="range" id="mCam" min="0" max="0" value="0"></label>
        <label>Largura da tela <input type="number" id="mVW" min="20" max="400" style="width:60px"></label>
        <span class="hint" id="mapHint">Clique para pintar • botão direito apaga • Delete remove seleção</span>
      </div>
      <div class="canvas-wrap" id="mapWrap"><canvas id="mapCanvas" tabindex="0"></canvas></div>
    </div>
    <div class="map-right panel">
      <h4>Mapa</h4>
      <label>Nome <input id="mName"></label>
      <div class="row2"><label>Larg (tiles) <input type="number" id="mW" min="1" max="400"></label><label>Alt (tiles) <input type="number" id="mH" min="1" max="100"></label></div>
      <div class="row2"><label>Tile L <input type="number" id="mTW" min="1" max="32"></label><label>Tile A <input type="number" id="mTH" min="1" max="32"></label></div>
      <label>Fundo <input type="color" id="mBg"></label>
      <h4>Iluminação</h4>
      <label><input type="checkbox" id="mLit"> iluminação ligada</label>
      <label>Ambiente <input type="color" id="mAmbC"></label>
      <label>Nível ambiente <input type="range" id="mAmbL" min="0" max="1.5" step="0.01"><span></span></label>
      <label><input type="checkbox" id="mShadows"> sombras (raycast)</label>
      <label><input type="checkbox" id="mGlyph"> luz troca glifos (escuro = menos denso)</label>
      <label>Névoa luminosa <input type="range" id="mHaze" min="0" max="2" step="0.01"><span></span></label>
      <h4>Camadas de fundo (parallax)</h4>
      <div id="mLayers"></div>
      <div class="row2"><select id="mLayerAdd"></select><button id="mLayerBtn">+ camada</button></div>
      <h4>Lista de luzes</h4>
      <div id="mLightList" class="mini-list"></div>
    </div>`;
  }

  function bindRange(id, get, set) {
    const el = $(id), span = el.nextElementSibling;
    el.value = get();
    if (span) span.textContent = (+el.value).toFixed(2).replace(/\.00$/, '');
    el.oninput = () => {
      set(+el.value);
      if (span) span.textContent = (+el.value).toFixed(2).replace(/\.00$/, '');
      AF.markDirty();
    };
  }

  AF.Map = {
    init(root) {
      root.innerHTML = panelHTML();
      $('#mapTools').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) {
          S.tool = b.dataset.tool;
          AF.Map.refresh();
        }
      };
      $('#lightPresets').innerHTML = Object.keys(AF.LIGHT_PRESETS)
        .map((k) => `<button data-p="${k}" style="--c:${AF.LIGHT_PRESETS[k].color}">${k}</button>`)
        .join('');
      $('#lightPresets').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const p = AF.LIGHT_PRESETS[b.dataset.p];
        const target = S.sel?.type === 'light' ? S.sel.ref : S.light;
        Object.assign(target, p);
        S.tool = S.sel?.type === 'light' ? S.tool : 'light';
        AF.markDirty();
        AF.Map.refresh();
      };
      const lightTarget = () => (S.sel?.type === 'light' ? S.sel.ref : S.light);
      $('#lColor').oninput = (e) => {
        lightTarget().color = e.target.value;
        AF.markDirty();
      };
      $('#lMode').onchange = (e) => {
        lightTarget().mode = e.target.value;
        AF.markDirty();
      };
      $('#mPlay').onclick = () => AF.Map.togglePlay();
      $('#mAnimate').onchange = (e) => (S.animate = e.target.checked);
      $('#mCam').oninput = (e) => (S.camX = +e.target.value);
      $('#mVW').onchange = (e) => {
        S.vw = AF.clamp(+e.target.value || 120, 20, 400);
        AF.Map.refresh();
      };
      $('#mLayerBtn').onclick = () => {
        const id = $('#mLayerAdd').value;
        if (!id) return;
        map().layers.push({ assetId: id, parallax: 0.3, y: 0, repeat: true });
        AF.markDirty();
        AF.Map.refresh();
      };
      const cv = $('#mapCanvas');
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('pointerdown', (e) => this.onDown(e));
      cv.addEventListener('pointermove', (e) => this.onMove(e));
      window.addEventListener('pointerup', () => (S.drag = null));
      cv.addEventListener('pointerleave', () => (S.hover = null));
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      requestAnimationFrame(this.loop.bind(this));
    },

    refresh() {
      const M = map();
      if (!M) return;
      document.querySelectorAll('#mapTools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
      const P = AF.project;
      const tiles = P.assets.filter((a) => a.kind === 'tile');
      const ents = P.assets.filter((a) => a.kind === 'sprite' || a.kind === 'fx');
      if (!S.tileId || !tiles.find((a) => a.id === S.tileId)) S.tileId = tiles[0]?.id || null;
      if (!S.entityId || !ents.find((a) => a.id === S.entityId)) S.entityId = ents[0]?.id || null;
      const sw = (a, cur) =>
        `<button class="swatch ${a.id === cur ? 'on' : ''}" data-id="${a.id}" title="${a.name}">${AF.thumbHTML(a, 6)}<span>${a.name}</span></button>`;
      $('#mapTiles').innerHTML = tiles.map((a) => sw(a, S.tileId)).join('') || '<div class="hint">Crie assets do tipo "tile".</div>';
      $('#mapEnts').innerHTML = ents.map((a) => sw(a, S.entityId)).join('') || '<div class="hint">Crie sprites ou FX.</div>';
      $('#mapTiles').onclick = (e) => {
        const b = e.target.closest('.swatch');
        if (b) {
          S.tileId = b.dataset.id;
          S.tool = 'tile';
          this.refresh();
        }
      };
      $('#mapEnts').onclick = (e) => {
        const b = e.target.closest('.swatch');
        if (b) {
          S.entityId = b.dataset.id;
          S.tool = 'entity';
          this.refresh();
        }
      };
      // luz
      const L = S.sel?.type === 'light' ? S.sel.ref : S.light;
      $('#lColor').value = L.color;
      $('#lMode').value = L.mode;
      bindRange('#lRadius', () => L.radius, (v) => (L.radius = v));
      bindRange('#lInt', () => L.intensity, (v) => (L.intensity = v));
      bindRange('#lFlick', () => L.flicker, (v) => (L.flicker = v));
      $('#selInfo').textContent = S.sel
        ? S.sel.type === 'light'
          ? 'Editando luz selecionada (Delete remove).'
          : 'Entidade selecionada: arraste para mover, F espelha, P marca como jogador, Delete remove.'
        : 'Ajustes valem para a próxima luz colocada.';
      // mapa
      $('#mName').value = M.name;
      $('#mName').onchange = (e) => {
        M.name = e.target.value;
        AF.markDirty();
        AF.App.refreshAssets();
      };
      $('#mW').value = M.w;
      $('#mH').value = M.h;
      $('#mTW').value = M.tileW;
      $('#mTH').value = M.tileH;
      const resize = () => {
        const w = AF.clamp(+$('#mW').value || M.w, 1, 400), h = AF.clamp(+$('#mH').value || M.h, 1, 100);
        const nt = Array(w * h).fill(null);
        for (let y = 0; y < Math.min(h, M.h); y++) for (let x = 0; x < Math.min(w, M.w); x++) nt[(h - 1 - y) * w + x] = M.tiles[(M.h - 1 - y) * M.w + x];
        const dy = (h - M.h) * M.tileH;
        M.entities.forEach((e) => (e.y += dy));
        M.lights.forEach((l) => (l.y += dy));
        M.tiles = nt;
        M.w = w;
        M.h = h;
        M.tileW = AF.clamp(+$('#mTW').value || M.tileW, 1, 32);
        M.tileH = AF.clamp(+$('#mTH').value || M.tileH, 1, 32);
        AF.markDirty();
        this.refresh();
      };
      ['#mW', '#mH', '#mTW', '#mTH'].forEach((s) => ($(s).onchange = resize));
      $('#mBg').value = M.bgColor;
      $('#mBg').oninput = (e) => {
        M.bgColor = e.target.value;
        AF.markDirty();
      };
      $('#mLit').checked = M.fx.lighting;
      $('#mLit').onchange = (e) => (M.fx.lighting = e.target.checked);
      $('#mAmbC').value = M.ambient.color;
      $('#mAmbC').oninput = (e) => {
        M.ambient.color = e.target.value;
        AF.markDirty();
      };
      bindRange('#mAmbL', () => M.ambient.level, (v) => (M.ambient.level = v));
      $('#mShadows').checked = M.fx.shadows;
      $('#mShadows').onchange = (e) => (M.fx.shadows = e.target.checked);
      $('#mGlyph').checked = M.fx.glyphLight;
      $('#mGlyph').onchange = (e) => (M.fx.glyphLight = e.target.checked);
      bindRange('#mHaze', () => M.fx.haze, (v) => (M.fx.haze = v));
      // camadas
      const byId = AF.assetIndex(P);
      $('#mLayers').innerHTML = M.layers
        .map(
          (L, i) => `<div class="layer-row" data-i="${i}">
          <b>${byId[L.assetId]?.name || '?'}</b>
          <label>parallax <input type="range" min="0" max="1" step="0.01" value="${L.parallax}" data-k="parallax"></label>
          <label>y <input type="number" value="${L.y || 0}" data-k="y" style="width:50px"></label>
          <button data-del="${i}" title="remover">✕</button></div>`
        )
        .join('') || '<div class="hint">Nenhuma. Use assets do tipo "fundo".</div>';
      $('#mLayers').oninput = (e) => {
        const row = e.target.closest('.layer-row');
        if (!row || !e.target.dataset.k) return;
        M.layers[+row.dataset.i][e.target.dataset.k] = +e.target.value;
        AF.markDirty();
      };
      $('#mLayers').onclick = (e) => {
        if (e.target.dataset.del != null) {
          M.layers.splice(+e.target.dataset.del, 1);
          AF.markDirty();
          this.refresh();
        }
      };
      const bgs = P.assets.filter((a) => a.kind === 'bg');
      $('#mLayerAdd').innerHTML = bgs.map((a) => `<option value="${a.id}">${a.name}</option>`).join('') || '<option value="">(sem fundos)</option>';
      // luzes
      $('#mLightList').innerHTML = M.lights
        .map((l, i) => `<div data-i="${i}" class="${S.sel?.ref === l ? 'on' : ''}"><i style="background:${l.color}"></i> luz ${i + 1} · r${l.radius}</div>`)
        .join('');
      $('#mLightList').onclick = (e) => {
        const d = e.target.closest('[data-i]');
        if (!d) return;
        S.sel = { type: 'light', ref: M.lights[+d.dataset.i] };
        this.refresh();
      };
      $('#mVW').value = S.vw;
      this.layout();
    },

    layout() {
      const M = map();
      const worldW = M.w * M.tileW;
      S.vwEff = Math.min(S.vw, worldW);
      const cam = $('#mCam');
      cam.max = Math.max(0, worldW - S.vwEff);
      S.camX = AF.clamp(S.camX, 0, +cam.max);
      cam.value = S.camX;
    },

    cellAt(e) {
      const m = AF.metrics(AF.App.zoom());
      const r = e.target.getBoundingClientRect();
      const sx = e.target.width / r.width, sy = e.target.height / r.height;
      return { x: Math.floor(((e.clientX - r.left) * sx) / m.cw) + S.camX, y: Math.floor(((e.clientY - r.top) * sy) / m.ch) };
    },

    hit(M, p) {
      const byId = AF.assetIndex(AF.project);
      for (const l of M.lights) if (Math.abs(l.x - p.x) <= 1 && Math.abs(l.y - p.y) <= 1) return { type: 'light', ref: l };
      for (let i = M.entities.length - 1; i >= 0; i--) {
        const e = M.entities[i], a = byId[e.assetId];
        if (a && p.x >= e.x && p.x < e.x + a.w && p.y >= e.y && p.y < e.y + a.h) return { type: 'entity', ref: e };
      }
      return null;
    },

    onDown(e) {
      if (S.play) return;
      const M = map();
      const p = this.cellAt(e);
      e.target.focus();
      const tx = Math.floor(p.x / M.tileW), ty = Math.floor(p.y / M.tileH);
      const inMap = tx >= 0 && ty >= 0 && tx < M.w && ty < M.h;
      if (e.button === 2) {
        const h = this.hit(M, p);
        if (h) this.removeSel(h);
        else if (inMap) M.tiles[ty * M.w + tx] = null;
        S.drag = { erase: true };
        AF.markDirty();
        return;
      }
      if (S.tool === 'tile' || S.tool === 'erase') {
        if (inMap) M.tiles[ty * M.w + tx] = S.tool === 'tile' ? S.tileId : null;
        S.drag = { paint: true };
      } else if (S.tool === 'entity' && S.entityId) {
        const a = AF.assetIndex(AF.project)[S.entityId];
        const ent = { id: AF.uid(), assetId: S.entityId, anim: a.anims[0].name, x: p.x, y: p.y - a.h + 1, flip: false, phase: Math.random() };
        M.entities.push(ent);
        S.sel = { type: 'entity', ref: ent };
        // FX emissivo ganha uma luz acoplada automaticamente
        if (a.emissive && a.kind === 'fx') M.lights.push(Object.assign({ id: AF.uid(), x: ent.x + a.w / 2, y: ent.y + a.h / 2 }, S.light));
      } else if (S.tool === 'light') {
        const l = Object.assign({ id: AF.uid(), x: p.x, y: p.y }, S.light);
        delete l.seed;
        M.lights.push(l);
        S.sel = { type: 'light', ref: l };
      } else if (S.tool === 'select') {
        S.sel = this.hit(M, p);
        if (S.sel) S.drag = { sel: S.sel, ox: p.x - S.sel.ref.x, oy: p.y - S.sel.ref.y };
      }
      AF.markDirty();
      this.refresh();
    },

    onMove(e) {
      const M = map();
      const p = this.cellAt(e);
      S.hover = p;
      if (!S.drag) return;
      const tx = Math.floor(p.x / M.tileW), ty = Math.floor(p.y / M.tileH);
      const inMap = tx >= 0 && ty >= 0 && tx < M.w && ty < M.h;
      if (S.drag.erase && inMap) M.tiles[ty * M.w + tx] = null;
      else if (S.drag.paint && inMap) M.tiles[ty * M.w + tx] = S.tool === 'tile' ? S.tileId : null;
      else if (S.drag.sel) {
        S.drag.sel.ref.x = p.x - S.drag.ox;
        S.drag.sel.ref.y = p.y - S.drag.oy;
      }
      AF.markDirty();
    },

    removeSel(h) {
      const M = map();
      if (h.type === 'light') M.lights = M.lights.filter((l) => l !== h.ref);
      else M.entities = M.entities.filter((x) => x !== h.ref);
      if (S.sel?.ref === h.ref) S.sel = null;
      AF.markDirty();
      this.refresh();
    },

    keys: {},
    onKey(e, down) {
      if (AF.App.view !== 'map') return;
      if (e.target.matches('input,textarea,select')) return;
      this.keys[e.key.toLowerCase()] = down;
      if (S.play && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
      if (!down || S.play) {
        if (down && e.key === 'Escape') this.togglePlay();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) this.removeSel(S.sel);
      if (e.key.toLowerCase() === 'f' && S.sel?.type === 'entity') {
        S.sel.ref.flip = !S.sel.ref.flip;
        AF.markDirty();
      }
      if (e.key.toLowerCase() === 'p' && S.sel?.type === 'entity') {
        map().entities.forEach((x) => (x.player = x === S.sel.ref));
        AF.toast('Entidade marcada como jogador');
        AF.markDirty();
      }
    },

    // ---------- modo de teste ----------
    togglePlay() {
      const M = map();
      S.play = !S.play;
      $('#mPlay').textContent = S.play ? '■ Parar (Esc)' : '▶ Testar (jogar)';
      if (S.play) {
        S.backup = JSON.stringify(M.entities);
        const byId = AF.assetIndex(AF.project);
        let pl = M.entities.find((e) => e.player) || M.entities.find((e) => byId[e.assetId]?.kind === 'sprite');
        if (!pl) {
          AF.toast('Coloque um sprite no mapa para testar');
          S.play = false;
          $('#mPlay').textContent = '▶ Testar (jogar)';
          return;
        }
        S.player = pl;
        pl.vx = 0;
        pl.vy = 0;
        M._runtimeLights = [{ x: 0, y: 0, color: '#ffe2b0', radius: 10, intensity: 0.7, flicker: 0.05, mode: 'flicker' }];
        $('#mapCanvas').focus();
      } else {
        M.entities = JSON.parse(S.backup);
        delete M._runtimeLights;
        S.player = null;
      }
    },

    solidAt(M, cx, cy) {
      const tx = Math.floor(cx / M.tileW), ty = Math.floor(cy / M.tileH);
      if (tx < 0 || tx >= M.w) return true;
      if (ty < 0) return false;
      if (ty >= M.h) return false;
      const a = AF.assetIndex(AF.project)[M.tiles[ty * M.w + tx]];
      if (!a || !a.solid) return false;
      // colisão por célula: o caractere do tile precisa existir
      const g = a.anims[0].frames[0];
      const c = g.cells[(cy - ty * M.tileH) * g.w + (cx - tx * M.tileW)];
      if (!c || (a.foliage && SWAY[c.c])) return false;
      return (c.c != null && c.c !== ' ') || !!c.b;
    },

    stepPlayer(dt) {
      const M = map(), p = S.player;
      const a = AF.assetIndex(AF.project)[p.assetId];
      const k = this.keys;
      const left = k['arrowleft'] || k['a'], right = k['arrowright'] || k['d'], jump = k[' '] || k['arrowup'] || k['w'];
      const speed = 22, grav = 70, jumpV = -30;
      p.vx = (right ? speed : 0) - (left ? speed : 0);
      if (left) p.flip = true;
      if (right) p.flip = false;
      const collides = (x, y) => {
        const x0 = Math.round(x), y0 = Math.round(y);
        for (let yy = 0; yy < a.h; yy++) for (let xx = 0; xx < a.w; xx++) if (this.solidAt(M, x0 + xx, y0 + yy)) return true;
        return false;
      };
      const onGround = collides(p.x, p.y + 1);
      if (jump && onGround) p.vy = jumpV;
      p.vy = Math.min(p.vy + grav * dt, 40);
      const nx = p.x + p.vx * dt;
      if (!collides(nx, p.y)) p.x = nx;
      else if (!collides(nx, p.y - 1) && onGround) {
        p.x = nx;
        p.y -= 1;
      } // degrau
      const ny = p.y + p.vy * dt;
      if (!collides(p.x, ny)) p.y = ny;
      else {
        if (p.vy > 0) p.y = Math.round(p.y);
        p.vy = 0;
      }
      if (p.y > M.h * M.tileH + 10) {
        Object.assign(p, JSON.parse(S.backup).find((e) => e.id === p.id));
        p.vx = p.vy = 0;
      }
      const names = a.anims.map((x) => x.name);
      const pick = (...n) => n.find((x) => names.includes(x)) || names[0];
      p.anim = !onGround ? (p.vy < 0 ? pick('jump', 'pulo', 'fall') : pick('fall', 'jump', 'pulo')) : p.vx ? pick('run', 'correr', 'walk') : pick('idle', 'parado');
      M._runtimeLights[0].x = p.x + a.w / 2;
      M._runtimeLights[0].y = p.y + a.h / 2;
      // câmera segue
      S.camX = AF.clamp(Math.round(p.x + a.w / 2 - S.vwEff / 2), 0, Math.max(0, M.w * M.tileW - S.vwEff));
      $('#mCam').value = S.camX;
    },

    lastT: 0,
    loop(now) {
      requestAnimationFrame(this.loop.bind(this));
      if (AF.App.view !== 'map') return;
      const M = map();
      if (!M) return;
      const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
      this.lastT = now;
      if (S.play && S.player) this.stepPlayer(dt);
      const t = S.animate || S.play ? (now - S.t0) / 1000 : 0;
      const m = AF.metrics(AF.App.zoom());
      const cv = $('#mapCanvas');
      const VH = M.h * M.tileH;
      const W = S.vwEff * m.cw, H = VH * m.ch;
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const ctx = cv.getContext('2d');
      const buf = AF.composeMap(M, AF.project, t, S.camX, S.vwEff);
      AF.drawComposed(ctx, buf, m, M.bgColor);
      if (S.play) return;
      // overlays
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#8aa';
      for (let x = (M.tileW - (S.camX % M.tileW)) % M.tileW; x <= S.vwEff; x += M.tileW) {
        ctx.beginPath();
        ctx.moveTo(x * m.cw + 0.5, 0);
        ctx.lineTo(x * m.cw + 0.5, H);
        ctx.stroke();
      }
      for (let y = 0; y <= M.h; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * M.tileH * m.ch + 0.5);
        ctx.lineTo(W, y * M.tileH * m.ch + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      for (const l of M.lights) {
        const x = (l.x - S.camX + 0.5) * m.cw, y = (l.y + 0.5) * m.ch;
        ctx.strokeStyle = S.sel?.ref === l ? '#fff' : l.color;
        ctx.beginPath();
        ctx.arc(x, y, m.cw * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
      const byId = AF.assetIndex(AF.project);
      if (S.sel?.type === 'entity') {
        const e = S.sel.ref, a = byId[e.assetId];
        if (a) {
          ctx.strokeStyle = '#fff';
          ctx.setLineDash([4, 3]);
          ctx.strokeRect((e.x - S.camX) * m.cw + 0.5, e.y * m.ch + 0.5, a.w * m.cw, a.h * m.ch);
          ctx.setLineDash([]);
        }
      }
      for (const e of M.entities)
        if (e.player) {
          ctx.fillStyle = '#ffd23f';
          ctx.font = '10px sans-serif';
          ctx.fillText('P', (e.x - S.camX) * m.cw, e.y * m.ch - 2);
        }
      if (S.hover) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#fff';
        if (S.tool === 'tile' || S.tool === 'erase') {
          const tx = Math.floor(S.hover.x / M.tileW), ty = Math.floor(S.hover.y / M.tileH);
          ctx.strokeRect((tx * M.tileW - S.camX) * m.cw + 0.5, ty * M.tileH * m.ch + 0.5, M.tileW * m.cw, M.tileH * m.ch);
        } else ctx.strokeRect((S.hover.x - S.camX) * m.cw + 0.5, S.hover.y * m.ch + 0.5, m.cw, m.ch);
      }
      ctx.restore();
    },
  };
})();

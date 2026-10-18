'use strict';
// Mundo em resolução de célula: 3 camadas (fundo, principal, frente), cada célula = material + cor.
(function () {
  const E = window.ENG;
  const LAYERS = ['back', 'main', 'front'];

  E.World = class {
    constructor(W, H) {
      this.W = W;
      this.H = H;
      for (const L of LAYERS) {
        this[L] = new Uint8Array(W * H);
        this[L + 'Col'] = new Uint8Array(W * H * 3);
      }
      // colisão por célula: 0 auto (pelo material), 1 sólido, 2 plataforma vazada, 3 forçar vazio,
      // 4 perigo, 5 escada, 6 água
      this.col = new Uint8Array(W * H);
      this.id = 'fase1';
      this.name = 'Fase 1';
      this.lights = [];
      this.entities = []; // {id, prefab, x, y, facing, props, script}
      this.spawners = []; // {id, prefab, x, y, w, h, interval, max, initial, range, active}
      this.triggers = []; // {id, x, y, w, h, script, once}
      this.spawn = { x: 40, y: 60 };
      this.settings = { amb: [0.24, 0.28, 0.42], glow: 1, rain: 0, fog: 0.5, sky: 'Noite', shadows: true, horizon: 0.62, dayNight: true, cycle: 8, hour: 21 };
    }
    idx(x, y) {
      return x >= 0 && y >= 0 && x < this.W && y < this.H ? y * this.W + x : -1;
    }
    set(layer, x, y, mat, rgb) {
      const i = this.idx(x, y);
      if (i < 0) return;
      this[layer][i] = mat;
      const c = rgb || (mat ? E.matColor(mat, x, y) : [0, 0, 0]);
      this[layer + 'Col'].set(c, i * 3);
    }
    get(layer, x, y) {
      const i = this.idx(x, y);
      return i < 0 ? 0 : this[layer][i];
    }
    // primeira célula sólida de cada coluna (de cima): define quanto do céu ilumina cada célula
    computeSurface(x0 = 0, x1 = this.W) {
      if (!this.surf) this.surf = new Int16Array(this.W).fill(this.H);
      for (let x = Math.max(0, x0); x < Math.min(this.W, x1); x++) {
        let y = 0;
        while (y < this.H && !this.solid(x, y)) y++;
        this.surf[x] = y;
      }
      // interiores de construções: recebem luz do dia pelas janelas, não a penumbra de caverna
      this.inTop = new Int16Array(this.W).fill(-1);
      this.inBot = new Int16Array(this.W).fill(-1);
      for (const b of this.buildings || [])
        for (let x = Math.max(0, b.x0); x <= Math.min(this.W - 1, b.x1); x++) {
          this.inTop[x] = b.y0;
          this.inBot[x] = b.y1;
        }
    }
    indoor(x, y) {
      return !!this.inTop && x >= 0 && x < this.W && y >= this.inTop[x] && y < this.inBot[x];
    }
    // masmorra (região no subsolo profundo) que contém o ponto, se houver
    dungeonAt(x, y) {
      return (this.dungeons || []).find((d) => x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) || null;
    }
    // ponto debaixo da terra (caverna): mapas de caverna inteiros ou fundo o bastante sob a superfície
    inCave(x, y) {
      if (this.settings.sky === 'Caverna') return true;
      const sx = Math.max(0, Math.min(this.W - 1, Math.floor(x)));
      return !!this.surf && y - this.surf[sx] > 18 && !this.indoor(sx, y);
    }
    skyAt(x, y) {
      if (!this.surf || x < 0 || x >= this.W) return 255;
      const d = y - this.surf[x];
      if (d > 0 && this.inTop && y >= this.inTop[x] && y < this.inBot[x]) return 200;
      return d <= 0 ? 255 : Math.round(255 * Math.exp(-d / 7));
    }
    cellType(x, y) {
      if (x < 0 || x >= this.W || y >= this.H) return E.CT.SOLID;
      if (y < 0) return E.CT.NONE;
      const i = y * this.W + x, c = this.col[i];
      if (c) return c === 3 ? E.CT.NONE : c;
      const m = this.main[i];
      if (!m) return E.CT.NONE;
      if (m === E.MAT.WATER) return E.CT.WATER;
      if (m === E.MAT.LAVA) return E.CT.HAZARD;
      return E.MAT_BY_ID[m]?.solid ? E.CT.SOLID : E.CT.NONE;
    }
    solid(x, y) {
      return this.cellType(x, y) === E.CT.SOLID;
    }
    fillRect(layer, x0, y0, w, h, mat) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(layer, x, y, mat);
    }
    fillEllipse(layer, cx, cy, rx, ry, mat, rough = 0, seed = 1) {
      for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++)
        for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          const n = rough ? (E.hash2(x * 3 + seed, y * 5) - 0.5) * rough : 0;
          if (dx * dx + dy * dy <= 1 + n) this.set(layer, x, y, mat);
        }
    }
    // pincel circular (raio em larguras de célula; vertical corrigido pela proporção da célula)
    brush(layer, cx, cy, r, mat, aspect = 2, rgb = null) {
      const ry = Math.max(0, r / aspect);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x - cx, dy = (y - cy) * aspect;
          if (dx * dx + dy * dy <= r * r + 0.5) this.set(layer, x, y, mat, rgb);
        }
    }

    // ---------- serialização (RLE de materiais + cores só das células de tinta) ----------
    toJSON() {
      const rle = (a) => {
        const out = [];
        for (let i = 0; i < a.length; ) {
          let j = i;
          while (j < a.length && a[j] === a[i] && j - i < 65535) j++;
          out.push(a[i], j - i);
          i = j;
        }
        return out;
      };
      const layers = { col: { rle: rle(this.col), ink: [] } };
      for (const L of LAYERS) {
        const ink = [];
        const a = this[L], c = this[L + 'Col'];
        for (let i = 0; i < a.length; i++) if (a[i] === E.MAT.INK) ink.push(i, c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
        layers[L] = { rle: rle(a), ink };
      }
      const lights = this.lights.map(({ seed, ...l }) => l);
      return { format: 'asciiforge-world@2', id: this.id, name: this.name, W: this.W, H: this.H, layers, lights, entities: this.entities, spawners: this.spawners, triggers: this.triggers, spawn: this.spawn, settings: this.settings, biomes: this.biomes, villages: this.villages, dungeons: this.dungeons, smokes: this.smokes, buildings: this.buildings };
    }
    static fromJSON(o) {
      const w = new E.World(o.W, o.H);
      if (o.biomes) w.biomes = o.biomes;
      if (o.villages) w.villages = o.villages;
      if (o.smokes) w.smokes = o.smokes;
      if (o.buildings) w.buildings = o.buildings;
      if (o.dungeons) w.dungeons = o.dungeons;
      if (o.layers.col) {
        let p = 0;
        const r = o.layers.col.rle;
        for (let k = 0; k < r.length; k += 2) for (let n = 0; n < r[k + 1]; n++, p++) w.col[p] = r[k];
      }
      for (const L of LAYERS) {
        const d = o.layers[L];
        let p = 0;
        for (let k = 0; k < d.rle.length; k += 2) for (let n = 0; n < d.rle[k + 1]; n++, p++) if (d.rle[k]) w.set(L, p % o.W, Math.floor(p / o.W), d.rle[k]);
        for (let k = 0; k < d.ink.length; k += 4) w[L + 'Col'].set([d.ink[k + 1], d.ink[k + 2], d.ink[k + 3]], d.ink[k] * 3);
      }
      w.lights = o.lights || [];
      w.entities = o.entities || [];
      w.spawners = o.spawners || (o.enemies || []).map((e, i) => ({ id: 'sp' + i, prefab: 'aranha', x: e.x - 10, y: e.y - 10, w: 20, h: 12, interval: 15, max: 1, initial: 1, range: 120, active: true }));
      w.triggers = o.triggers || [];
      w.id = o.id || w.id;
      w.name = o.name || w.name;
      w.spawn = o.spawn || w.spawn;
      Object.assign(w.settings, o.settings || {});
      w.computeSurface();
      return w;
    }
  };

  // ---------- RNG / ruído ----------
  E.rng = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  };
  const vnoise = (seed) => (x) => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    return E.hash2(i, seed) * (1 - s) + E.hash2(i + 1, seed) * s;
  };
  // ruído suave 2D com duas oitavas: forma manchas orgânicas (sem quadriculado)
  const vnoise2 = (seed) => {
    const h = (a, b) => E.hash2(a * 7 + seed, b * 13 - seed);
    const one = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const h00 = h(ix, iy), h01 = h(ix, iy + 1);
      const a = h00 + (h(ix + 1, iy) - h00) * sx, b = h01 + (h(ix + 1, iy + 1) - h01) * sx;
      return a + (b - a) * sy;
    };
    const f = (x, y) => one(x, y) * 0.65 + one(x * 2.3 + 17.1, y * 2.3 - 9.7) * 0.35;
    f.one = one; // uma oitava só, para usos baratos
    return f;
  };
  E.vnoise2 = vnoise2;
  // camadas de rocha: a cor da pedra varia em faixas onduladas (estratos) e ganha o tom do bioma de cima
  const strataN = vnoise(4242), strataW = vnoise(4343);
  E.BIOME_TINT = { deserto: [1.1, 0.98, 0.8], neve: [0.88, 0.96, 1.12], oceano_gelado: [0.9, 0.97, 1.1], floresta: [0.97, 1.02, 0.93], floresta_grande: [0.95, 1.03, 0.92], castelo: [0.98, 0.96, 1.02], oceano: [0.98, 1, 1.05], praia: [1.04, 1, 0.92] };
  const strataOff = new Float32Array(16384).fill(NaN), ONE = [1, 1, 1];
  const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  E.strataColor = (mat, x, y, tintA) => {
    let o = strataOff[x & 16383];
    if (o !== o) o = strataOff[x & 16383] = (strataW(x * 0.004) - 0.5) * 70;
    const k = 0.84 + 0.32 * strataN((y + o) * 0.09), t = tintA || ONE, m = E.MAT_BY_ID[mat];
    const k1 = (1 + (E.hash2(x, y) - 0.5) * 2 * m.vary) * k * 255, k2 = (1 + (E.hash2(x + 913, y - 71) - 0.5) * m.vary) * k * 255;
    return [c255(m.color[0] * k1 * t[0]), c255(m.color[1] * k2 * t[1]), c255(m.color[2] * k1 * t[2])];
  };

  E.LIGHTS = {
    lanterna: { c: [1.0, 0.72, 0.35], r: 30, i: 1.25, flicker: 0.12 },
    tocha: { c: [1.0, 0.55, 0.2], r: 34, i: 1.4, flicker: 0.3 },
    cristal: { c: [0.35, 0.85, 1.0], r: 26, i: 1.0, flicker: 0.05, pulse: true },
    lava: { c: [1.0, 0.3, 0.08], r: 44, i: 1.2, flicker: 0.15 },
    lua: { c: [0.55, 0.65, 1.0], r: 90, i: 0.5, flicker: 0 },
    magia: { c: [0.75, 0.45, 1.0], r: 24, i: 1.3, flicker: 0.4, pulse: true },
    vagalume: { c: [0.8, 1.0, 0.4], r: 9, i: 0.8, flicker: 0.5 },
  };

  // ---------- arte ASCII carimbada no mundo ----------
  // paleta compartilhada por construções, móveis e biomas (mesmos tons dos materiais); 4º valor = brilha
  E.ART_PAL = {
    w: [172, 118, 66], W: [122, 82, 46], b: [104, 68, 38], i: [140, 144, 158], I: [82, 84, 98], g: [232, 182, 72], G: [160, 115, 40],
    s: [152, 152, 160], S: [96, 96, 108], c: [182, 58, 48], C: [58, 88, 160], v: [70, 130, 72], V: [120, 70, 150], y: [214, 174, 84],
    k: [52, 50, 54], K: [30, 28, 32], f: [255, 150, 50, 1], F: [255, 222, 120, 1], l: [255, 196, 108, 1], L: [150, 190, 255, 1],
    p: [222, 204, 164], r: [172, 140, 92], o: [226, 218, 196], m: [80, 122, 70], x: [150, 82, 52], e: [72, 142, 62], E: [40, 96, 46],
    t: [192, 102, 62], q: [58, 76, 104], n: [236, 242, 252], z: [150, 212, 255, 1], Z: [110, 170, 230], a: [212, 186, 132], A: [168, 140, 92],
    d: [112, 80, 50], u: [150, 96, 200], U: [200, 150, 255, 1], h: [196, 170, 120], j: [120, 160, 90], R: [130, 30, 30], B: [40, 30, 22],
  };
  // material-glifo espelhado ('/' ↔ '\', '(' ↔ ')'...): usado quando um mapa é copiado de trás para frente
  const ART_MIR = { '/': '\\', '\\': '/', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '◄': '►', '►': '◄' };
  let artMirTable = null;
  E.artMirror = (id) => {
    if (!artMirTable) {
      artMirTable = new Uint8Array(256).map((_, i) => i);
      for (const [a, b] of Object.entries(ART_MIR)) {
        if (E.ART_MAT[a] && E.ART_MAT[b]) artMirTable[E.ART_MAT[a]] = E.ART_MAT[b];
        if (E.ART_GLOW_MAT[a] && E.ART_GLOW_MAT[b]) artMirTable[E.ART_GLOW_MAT[a]] = E.ART_GLOW_MAT[b];
      }
    }
    return artMirTable[id];
  };
  // rows: linhas de caracteres; keys: linhas de chaves de cor (como nos ícones). ' ' não pinta.
  // o: { layer ('back'), keep (não pinta sobre células já ocupadas), solid (colisão sólida), mirror (espelha) }
  E.stampArt = (w, x, y, rows, keys, o = {}) => {
    const pal = o.pal || E.ART_PAL, layer = o.layer || 'back';
    const MIR = ART_MIR;
    rows.forEach((row, j) => {
      const cs = [...row], ks = [...((keys && keys[j]) || '')], n = cs.length;
      cs.forEach((ch, i) => {
        if (ch === ' ') return;
        const k = ks[i] || o.key || 's', col = pal[k];
        if (!col) return;
        const c = o.mirror ? MIR[ch] || ch : ch, X = x + (o.mirror ? n - 1 - i : i), Y = y + j;
        if (o.keep && w.get(layer, X, Y)) return;
        const id = col[3] ? E.ART_GLOW_MAT[c] || E.ART_MAT[c] : E.ART_MAT[c];
        if (!id) return;
        const sh = 1 + (E.hash2(X, Y) - 0.5) * (o.vary ?? 0.12);
        w.set(layer, X, Y, id, [col[0] * sh, col[1] * sh, col[2] * sh].map((v) => Math.max(0, Math.min(255, v))));
        if (o.solid && w.idx(X, Y) >= 0) w.col[w.idx(X, Y)] = E.CT.SOLID;
      });
    });
  };

  // ---------- estruturas (também usadas como carimbos no editor) ----------
  E.Struct = {
    tree(w, x, groundY, rnd, big = 1) {
      const h = Math.round((22 + rnd() * 18) * big), tw = Math.max(2, Math.round((2 + rnd() * 2) * big));
      for (let y = groundY - h; y < groundY; y++) {
        const lean = Math.round(Math.sin((groundY - y) * 0.08) * 1.2);
        w.fillRect('back', x - (tw >> 1) + lean, y, tw + (y > groundY - 4 ? 2 : 0), 1, E.MAT.BARK);
      }
      // raízes
      for (let k = 0; k < 3; k++) w.set('back', x - tw - k, groundY - 1, E.MAT.BARK), w.set('back', x + tw + k, groundY - 1, E.MAT.BARK);
      const cy = groundY - h, rx = (9 + rnd() * 7) * big, ry = (5 + rnd() * 3) * big;
      for (let k = 0; k < 5; k++) {
        const ox = (rnd() - 0.5) * rx * 1.4, oy = (rnd() - 0.5) * ry * 1.2;
        w.fillEllipse('back', x + ox, cy + oy, rx * (0.55 + rnd() * 0.4), ry * (0.6 + rnd() * 0.4), E.MAT.LEAVES, 0.5, k * 17 + x);
      }
      // algumas folhas na frente para dar profundidade
      if (rnd() < 0.5) w.fillEllipse('front', x + (rnd() - 0.5) * rx, cy + ry * 0.6, rx * 0.35, ry * 0.35, E.MAT.LEAVES, 0.8, x);
    },
    lantern(w, x, y, len = 6) {
      for (let k = 0; k < len; k++) w.set('back', x, y + k, E.MAT.IRON);
      w.fillRect('back', x - 2, y + len, 5, 1, E.MAT.GOLD);
      w.fillRect('back', x - 2, y + len + 1, 1, 3, E.MAT.GOLD);
      w.fillRect('back', x + 2, y + len + 1, 1, 3, E.MAT.GOLD);
      w.fillRect('back', x - 1, y + len + 1, 3, 3, E.MAT.FLAME);
      w.fillRect('back', x - 2, y + len + 4, 5, 1, E.MAT.GOLD);
      w.lights.push(Object.assign({ x: x + 0.5, y: y + len + 2.5, type: 'lanterna' }, E.LIGHTS.lanterna));
    },
    gallows(w, x, groundY) {
      // poste com lanterna pendurada (como na captura)
      const h = 26;
      w.fillRect('back', x, groundY - h, 2, h, E.MAT.WOOD);
      w.fillRect('back', x, groundY - h, 12, 1, E.MAT.WOOD);
      for (let k = 0; k < 4; k++) w.set('back', x + 2 + k, groundY - h + 4 - k, E.MAT.WOOD);
      E.Struct.lantern(w, x + 10, groundY - h + 1, 4);
    },
    banner(w, x, y, bw = 7, bh = 22) {
      w.fillRect('back', x - 1, y, bw + 2, 1, E.MAT.WOOD);
      for (let yy = 0; yy < bh; yy++)
        for (let xx = 0; xx < bw; xx++) {
          const tail = yy > bh - 5 && Math.abs(xx - (bw - 1) / 2) < (yy - (bh - 5)) * 0.9;
          if (!tail) w.set('back', x + xx, y + 1 + yy, E.MAT.CLOTH);
        }
      // emblema dourado
      w.fillRect('back', x + (bw >> 1) - 1, y + 6, 3, 3, E.MAT.GOLD);
    },
    torch(w, x, y) {
      w.fillRect('back', x, y, 1, 4, E.MAT.WOOD);
      w.fillRect('back', x - 1, y - 2, 3, 2, E.MAT.FLAME);
      w.lights.push(Object.assign({ x: x + 0.5, y: y - 1.5, type: 'tocha', embers: true }, E.LIGHTS.tocha));
    },
    ruin(w, x0, groundY, width, height, rnd) {
      // muralha de fundo com arcos e janelas
      const top = groundY - height;
      for (let y = top; y < groundY; y++)
        for (let x = x0; x < x0 + width; x++) {
          const crenel = y < top + 3 && Math.floor((x - x0) / 5) % 2 === 1;
          const broken = y < top + 10 && E.hash2(x >> 2, 9) < 0.25 && y < top + 10 * E.hash2(x, 3);
          if (!crenel && !broken) w.set('back', x, y, rnd() < 0.15 ? E.MAT.MOSS : E.MAT.MASONRY);
        }
      // arcos (portas) e janelas vazadas
      for (let ax = x0 + 8; ax < x0 + width - 12; ax += 26) {
        const aw = 14, ah = Math.min(height - 8, 28);
        for (let y = groundY - ah; y < groundY; y++)
          for (let x = ax; x < ax + aw; x++) {
            const dx = (x - ax - aw / 2 + 0.5) / (aw / 2), dy = (y - (groundY - ah + aw / 2 / 2)) / (aw / 4);
            if (y > groundY - ah + aw / 4 || dx * dx + dy * dy < 1) w.set('back', x, y, 0);
          }
        E.Struct.banner(w, ax + aw + 3, top + 6);
        E.Struct.torch(w, ax - 3, groundY - 14);
      }
      // piso/plataformas sólidas na ruína
      w.fillRect('main', x0 - 2, top - 1, width + 4, 2, E.MAT.MASONRY);
      w.fillRect('main', x0 + width / 2 - 10, top + Math.round(height * 0.45), 20, 2, E.MAT.MASONRY);
      E.Struct.lantern(w, x0 + width / 2, top + 1, 5);
      E.Deco.ruinWear(w, x0, x0 + width, top, groundY, rnd);
    },
    // escada de mão bem visível: trilhos e degraus claros desenhados na camada do meio (o fundo escurece);
    // onde já há algo no meio (um piso), desenha no fundo
    ladder(w, x, y0, y1) {
      const put = (xx, y, ch, k) => E.stampArt(w, xx, y, [ch], [k], { layer: w.get('main', xx, y) ? 'back' : 'main', vary: 0.08 });
      for (let y = y0; y <= y1; y++) {
        const rung = (y - y0) % 3 === 0;
        put(x, y, '|', 'w');
        put(x + 3, y, '|', 'w');
        if (rung) for (let k = 1; k < 3; k++) put(x + k, y, '=', 'y');
        for (let k = 0; k < 4; k++) w.col[w.idx(x + k, y)] = E.CT.LADDER;
      }
    },
    platform(w, x, y, len) {
      w.fillRect('main', x, y, len, 1, E.MAT.WOOD);
      for (let k = 0; k < len; k++) if (w.idx(x + k, y) >= 0) w.col[w.idx(x + k, y)] = E.CT.ONEWAY;
      for (let k = 0; k < len; k += 6) for (let j = 1; j < 4; j++) w.set('back', x + k, y + j, E.MAT.WOOD);
    },
    doorAt(w, x, groundY, props = {}) {
      w.entities.push({ id: 'porta' + Math.random().toString(36).slice(2, 7), prefab: 'porta', x, y: groundY, facing: 1, props });
    },
    // casa simples de tábuas com telhado de palha (arquitetura.js tem as variações)
    cabin(w, x, groundY, rnd, props = {}) {
      return E.Struct.house(w, x, groundY, rnd, { kind: 'palha', role: 'simples', props });
    },
    // boca de caverna natural: rochedo saliente sobre a entrada, dentes de pedra, pedregulhos, musgo e cipós;
    // túnel inclinado de paredes irregulares que termina numa câmara. theme muda a cobertura do rochedo
    caveEntrance(w, x, groundY, rnd, len = 90, theme = 'pedra') {
      const nz = vnoise2(x * 3 + 11);
      const surf = (xx) => {
        let g = groundY - 40;
        while (g < groundY + 25 && !w.solid(xx, g)) g++;
        return g;
      };
      // 1) paredão de rocha com a boca voltada para quem chega (a saliência por cima forma o arco) e
      //    encosta suave do outro lado
      const R0 = x - 7, R1 = x + 58, peak = x + 16;
      const prof = (xx) => {
        const j = (nz(xx * 0.25, 5) - 0.5) * 3;
        if (xx < x + 2) return 19 + (xx - R0) * 0.4 + j;
        if (xx < peak) return 22 + nz(xx * 0.1, 1) * 4 + j;
        const t = (xx - peak) / (R1 - peak);
        return (22 + nz(xx * 0.05, 1) * 4) * (1 - t * t * (3 - 2 * t)) + j;
      };
      for (let xx = R0; xx <= R1; xx++) {
        const g = surf(xx), h = Math.max(0, Math.round(prof(xx)));
        for (let y = g - h; y < g + 3; y++) {
          w.set('main', xx, y, nz(xx * 0.12, y * 0.25) < 0.32 ? E.MAT.MOSS : E.MAT.STONE);
          w.set('front', xx, y, 0);
          w.set('back', xx, y, E.MAT.ROCK);
        }
        for (let k = 1; k <= 12; k++) if (w.get('main', xx, g - h - k) === E.MAT.GRASS) w.set('main', xx, g - h - k, 0);
        if (h < 2) continue;
        const y0 = g - h - 1;
        if (theme === 'areia') {
          w.set('main', xx, y0 + 1, E.MAT.SAND);
          if (E.hash2(xx, 3) < 0.5) w.set('main', xx, y0, E.MAT.SAND);
        } else if (theme === 'gelo') {
          w.set('main', xx, y0 + 1, E.MAT.SNOW);
          if (E.hash2(xx, 3) < 0.6) w.set('main', xx, y0, E.MAT.SNOW);
        } else if (E.hash2(xx, 7) < 0.75)
          for (let k = 0; k < 1 + Math.floor(E.hash2(xx, 8) * 4); k++) w.set(k < 1 && E.hash2(xx, 9) < 0.5 ? 'front' : 'main', xx, y0 - k, E.MAT.GRASS);
      }
      // 2) túnel inclinado com paredes irregulares; o fundo de rocha só aparece onde havia terra (sem linha reta)
      let cx = x, cy = groundY - 3;
      const carve = (px, py) => {
        const m = w.get('main', px, py);
        if ((m && E.MAT_BY_ID[m].solid) || py > surf(px)) w.set('back', px, py, E.MAT.ROCK);
        w.set('main', px, py, 0);
        w.set('front', px, py, 0);
      };
      for (let s = 0; s < len; s++) {
        cx += 1.1;
        cy += s < len - 20 ? 0.5 : 0.1;
        const r = 12.5 + nz(s * 0.07, 9) * 4;
        for (let yy = -17; yy <= 10; yy++)
          for (let xx = -18; xx <= 18; xx++) {
            const px = Math.round(cx + xx), py = Math.round(cy + yy);
            if ((xx * xx + yy * yy * 1.4) / (r * r) + (nz(px * 0.11, py * 0.22) - 0.5) * 0.55 < 1) carve(px, py);
          }
      }
      // 3) câmara no fim, de contorno irregular
      for (let yy = -30; yy <= 12; yy++)
        for (let xx = -62; xx <= 62; xx++) {
          const px = Math.round(cx + 30 + xx), py = Math.round(cy - 6 + yy);
          if ((xx / 55) ** 2 + (yy / 24) ** 2 + (nz(px * 0.07, py * 0.14) - 0.5) * 0.7 < 1) {
            w.set('main', px, py, 0);
            w.set('back', px, py, E.MAT.ROCK);
          }
        }
      // 4) dentes de pedra (ou pingentes) pendurados na borda da saliência, e cipós
      for (let xx = x - 18; xx <= x + 20; xx++) {
        let y = groundY - 45;
        while (y < groundY + 6 && !w.solid(xx, y)) y++;
        while (y < groundY + 6 && w.solid(xx, y)) y++;
        if (y >= groundY + 6) continue;
        let free = 0;
        while (free < 30 && !w.solid(xx, y + free)) free++;
        const hh = E.hash2(xx, 41);
        if (hh < 0.38 && free > 20) {
          const L = 1 + Math.floor(E.hash2(xx, 42) * 4);
          for (let k = 0; k < L; k++) w.set('main', xx, y + k, theme === 'gelo' ? E.MAT.ICE : E.MAT.STONE);
        } else if (hh > 0.62 && theme !== 'areia') for (let k = 0; k < 3 + Math.floor(E.hash2(xx, 43) * 9) && !w.solid(xx, y + k); k++) w.set('back', xx, y + k, theme === 'gelo' ? E.MAT.ICE : E.MAT.VINE);
      }
      // 5) pedregulhos dos dois lados e cascalho no chão do túnel
      for (const bx of [x - 40, x - 34, x + 52, x + 60]) {
        const g = surf(bx), rx = 2 + E.hash2(bx, 1) * 2.5, ry = 1.4 + E.hash2(bx, 2) * 1.2;
        w.fillEllipse('main', bx, g - ry * 0.6, rx, ry, E.hash2(bx, 3) < 0.4 ? E.MAT.MOSS : E.MAT.STONE, 0.5, bx);
      }
      for (let k = 0; k < len; k += 7) {
        const px = Math.round(x + k * 1.1 + 6);
        let y = Math.round(groundY - 3 + k * 0.5);
        while (y < groundY + 80 && !w.solid(px, y)) y++;
        if (E.hash2(px, 5) < 0.5) w.set('main', px, y - 1, E.MAT.STONE);
      }
      w.spawners.push({ id: 'cav' + Math.round(cx), prefab: 'aranha', x: Math.round(cx), y: Math.round(cy - 16), w: 60, h: 18, interval: 12, max: 3, initial: 2, range: 120, active: true });
      w.spawners.push({ id: 'cavs' + Math.round(cx), prefab: 'esqueleto_guerreiro', x: Math.round(cx + 20), y: Math.round(cy - 16), w: 40, h: 18, interval: 20, max: 1, initial: 1, range: 120, active: true });
      E.Struct.torch(w, Math.round(cx + 4), Math.round(cy) - 3);
      // tocha logo na entrada: ilumina o arco e marca a abertura
      let ty = groundY - 12;
      while (ty < groundY + 30 && !w.solid(x + 12, ty)) ty++;
      E.Struct.torch(w, x + 12, ty - 4);
      E.Struct.mushrooms(w, Math.round(cx + 30), Math.round(cy + 3), rnd);
      E.Struct.mushrooms(w, Math.round(cx + 6), Math.round(cy + 3), rnd);
      E.Struct.mushrooms(w, Math.round(x + 30), Math.round(groundY + 12), rnd);
      w.fillEllipse('main', cx + 55, cy + 2, 2.5, 1.5, E.MAT.CRYSTAL);
      w.lights.push(Object.assign({ x: cx + 55, y: cy - 1, type: 'cristal' }, E.LIGHTS.cristal));
      return { x: Math.round(cx + 30), y: Math.round(cy + 3) };
    },
    mineShaft(w, x, groundY, depth = 30) {
      const x0 = x - 5;
      for (let y = groundY - 1; y < groundY + depth; y++)
        for (let xx = x0; xx < x0 + 11; xx++) {
          w.set('main', xx, y, 0);
          w.set('back', xx, y, E.MAT.ROCK);
        }
      w.fillRect('back', x0 - 2, groundY - 16, 2, 16, E.MAT.WOOD);
      w.fillRect('back', x0 + 9, groundY - 16, 2, 16, E.MAT.WOOD);
      w.fillRect('back', x0 - 3, groundY - 17, 15, 1, E.MAT.WOOD);
      E.Struct.lantern(w, x, groundY - 16, 3);
      for (let y = groundY + 6; y < groundY + depth; y += 8) w.fillRect('back', x0, y, 9, 1, E.MAT.WOOD);
      E.Struct.ladder(w, x0 + 1, groundY - 1, groundY + depth - 1);
      // galeria no fundo
      const by = groundY + depth;
      for (let y = by - 26; y < by; y++)
        for (let xx = x0 - 34; xx < x0 + 11; xx++) {
          w.set('main', xx, y, 0);
          w.set('back', xx, y, E.MAT.ROCK);
        }
      w.fillRect('main', x0 - 32, by, 43, 2, E.MAT.STONE);
      for (let xx = x0 - 30; xx < x0 + 9; xx += 10) w.fillRect('back', xx, by - 26, 1, 26, E.MAT.WOOD);
      E.Struct.torch(w, x0 - 6, by - 6);
      return { x: x0 - 24, y: by };
    },
    tower(w, x, groundY, th = 80) {
      const tw = 22, x0 = x - (tw >> 1), top = groundY - th;
      for (let y = top; y < groundY; y++)
        for (let xx = x0; xx < x0 + tw; xx++) {
          w.set('main', xx, y, 0);
          w.set('back', xx, y, E.hash2(xx, y) < 0.15 ? E.MAT.MOSS : E.MAT.MASONRY);
        }
      w.fillRect('main', x0, top, 2, th - 27, E.MAT.MASONRY);
      w.fillRect('main', x0 + tw - 2, top, 2, th, E.MAT.MASONRY);
      for (let k = 0; k < tw + 4; k += 4) w.fillRect('main', x0 - 2 + k, top - 3, 2, 3, E.MAT.MASONRY);
      w.fillRect('main', x0 - 2, top - 1, tw + 4, 1, E.MAT.MASONRY);
      for (let xx = x0 + 4; xx < x0 + 8; xx++) if (w.idx(xx, top - 1) >= 0) w.col[w.idx(xx, top - 1)] = E.CT.ONEWAY;
      // andares a cada 26 linhas, com seteira estreita em cada um
      for (let y = groundY - 26; y > top + 6; y -= 26) {
        E.Struct.platform(w, x0 + 6, y, tw - 8);
        E.stampArt(w, x0 + tw - 7, y - 12, ['/^\\', '|█|', '|█|', '|█|', '|█|', '\\_/'], ['SSS', 'SKS', 'SKS', 'SKS', 'SKS', 'SSS']);
      }
      E.Struct.ladder(w, x0 + 2, top - 1, groundY - 1);
      E.Struct.torch(w, x0 + tw - 5, groundY - 6);
      E.Struct.banner(w, x0 + tw + 1, top + 4, 5, 16);
    },
    bridge(w, x, y, len) {
      for (let k = 0; k < len; k++) {
        const sag = Math.round(Math.sin((k / (len - 1)) * Math.PI) * 2);
        w.set('main', x + k, y + sag, E.MAT.WOOD);
        if (w.idx(x + k, y + sag) >= 0) w.col[w.idx(x + k, y + sag)] = E.CT.ONEWAY;
        w.set('back', x + k, y + sag - 5, E.MAT.VINE);
        if (k % 5 === 0) for (let j = 1; j < 5; j++) w.set('back', x + k, y + sag - j, E.MAT.VINE);
      }
      w.fillRect('back', x - 1, y - 7, 1, 8, E.MAT.WOOD);
      w.fillRect('back', x + len, y - 7, 1, 8, E.MAT.WOOD);
    },
    stairs(w, x, groundY, n = 12, dir = 1) {
      for (let k = 0; k < n; k++) w.fillRect('main', x + k * 3 * dir - (dir < 0 ? 2 : 0), groundY - 1 - k, 3, k + 1, E.MAT.MASONRY);
    },
    mushrooms(w, x, groundY, rnd) {
      for (let k = 0; k < 4; k++) {
        const mx = x + Math.round((rnd() - 0.5) * 10), h = 1 + Math.floor(rnd() * 3);
        for (let j = 1; j <= h; j++) w.set('back', mx, groundY - j, E.MAT.BARK);
        const cap = 1 + Math.floor(rnd() * 2);
        const hue = rnd() < 0.5 ? [120, 240, 215] : [240, 120, 230];
        for (let i = -cap; i <= cap; i++) w.set('back', mx + i, groundY - h - 1, E.MAT.MUSHROOM, hue.map((v) => Math.min(255, v * (0.8 + rnd() * 0.3))));
      }
      w.lights.push({ x, y: groundY - 3, type: 'cogumelo', c: [0.4, 0.95, 0.85], r: 16, i: 0.7, flicker: 0.05, pulse: true });
    },
    web(w, x, y, r) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        for (let k = 0; k < r; k++) w.set('back', Math.round(x + Math.cos(ang) * k), Math.round(y + (Math.sin(ang) * k) / 2), E.MAT.WEB);
      }
      for (let rr = 3; rr < r; rr += 3)
        for (let a = 0; a < 40; a++) {
          const ang = (a / 40) * Math.PI * 2;
          if (E.hash2(a, rr) < 0.7) w.set('back', Math.round(x + Math.cos(ang) * rr), Math.round(y + (Math.sin(ang) * rr) / 2), E.MAT.WEB);
        }
    },
  };

  // ---------- gerador de fase: "Floresta das Ruínas" ----------
  // o.fadeL: largura (células) em que as árvores rareiam na borda esquerda, ao encostar em outro bioma
  E.generate = (seed = 1, W = 1000, H = 180, o = {}) => {
    const w = new E.World(W, H);
    const rnd = E.rng(seed);
    const n1 = vnoise(seed), n2 = vnoise(seed + 9), n3 = vnoise(seed + 33);
    const base = Math.round(H * 0.68);
    const ground = new Int32Array(W);
    for (let x = 0; x < W; x++) ground[x] = Math.round(base + (n1(x * 0.008) - 0.5) * 34 + (n2(x * 0.04) - 0.5) * 8);
    // trecho plano para as ruínas e um lago
    const ruinX = Math.round(W * 0.42), ruinW = 120;
    for (let x = ruinX - 10; x < ruinX + ruinW + 10; x++) ground[x] = ground[ruinX - 10];
    const pondX = Math.round(W * 0.22), pondW = 70;
    const pondLevel = ground[pondX];
    for (let x = pondX; x < pondX + pondW; x++) {
      const t = (x - pondX) / pondW;
      ground[x] = pondLevel + Math.round(Math.sin(t * Math.PI) * 14);
    }
    for (let x = pondX - 6; x < pondX; x++) ground[x] = Math.min(ground[x], pondLevel);
    for (let x = pondX + pondW; x < pondX + pondW + 6; x++) ground[x] = Math.min(ground[x], pondLevel);
    // poço de lava no fim
    const lavaX = Math.round(W * 0.8), lavaW = 40;
    const lavaLevel = ground[lavaX] + 4;
    for (let x = lavaX; x < lavaX + lavaW; x++) ground[x] = lavaLevel + 8;

    // terreno
    const cnS = vnoise2(seed + 71);
    for (let x = 0; x < W; x++) {
      const g = ground[x];
      const dirtDepth = 18 + Math.round(n3(x * 0.1) * 8);
      for (let y = g; y < H; y++) {
        const d = y - g;
        w.set('main', x, y, d < dirtDepth + (cnS(x * 0.05, y * 0.1) - 0.5) * 12 || (d < 110 && cnS(x * 0.07 + 900, y * 0.14) < 0.16) ? E.MAT.DIRT : E.MAT.STONE);
        w.set('back', x, y, E.MAT.ROCK);
      }
    }
    // cavernas (minhocas de ruído) abaixo do chão, com cristais; paredes deformadas por ruído suave
    const cnF = vnoise2(seed + 61);
    for (let k = 0; k < 6; k++) {
      let x = 60 + rnd() * (W - 120), y = Math.min(H - 26, base + 30 + rnd() * 25), ang = rnd() * 6.28;
      const len = 80 + rnd() * 120;
      for (let s = 0; s < len; s++) {
        ang += (rnd() - 0.5) * 0.5;
        x += Math.cos(ang) * 1.6;
        y += Math.sin(ang) * 0.5 + (n3(s * 0.06 + k * 3.1) - 0.5) * 1.1;
        // ao tocar o limite o túnel muda de rumo (quica), em vez de deslizar rente a ele e formar um teto reto
        const lo = (ground[Math.round(x)] || base) + 24, hi = H - 24;
        if (y < lo) (y = lo + (lo - y)), (ang = -ang);
        if (y > hi) (y = hi - (y - hi)), (ang = -ang);
        // também quica nas bordas laterais: a fase é encaixada no mundo e um corte ali vira parede reta
        if (x < 60) (x = 60 + (60 - x)), (ang = Math.PI - ang);
        if (x > W - 60) (x = W - 60 - (x - (W - 60))), (ang = Math.PI - ang);
        const r = 16 + n2(s * 0.05 + k) * 10;
        for (let yy = -r * 0.65; yy <= r * 0.65; yy++) for (let xx = -r * 1.3; xx <= r * 1.3; xx++) if ((xx * xx + yy * yy * 4) / (r * r) + (cnF(Math.round(x + xx) * 0.09, Math.round(y + yy) * 0.18) - 0.5) * 0.7 < 1) w.set('main', Math.round(x + xx), Math.round(y + yy), 0);
        if (s % 37 === 0) {
          const cx = Math.round(x), cy = Math.round(y + r / 2);
          w.fillEllipse('main', cx, cy, 2.5, 1.5, E.MAT.CRYSTAL);
          w.lights.push(Object.assign({ x: cx, y: cy - 2, type: 'cristal' }, E.LIGHTS.cristal));
        }
      }
    }
    // lago
    for (let x = pondX - 6; x < pondX + pondW + 6; x++) for (let y = pondLevel; y < ground[x]; y++) w.set('main', x, y, E.MAT.WATER);
    // lava
    for (let x = lavaX; x < lavaX + lavaW; x++) for (let y = lavaLevel; y < lavaLevel + 8; y++) w.set('main', x, y, E.MAT.LAVA);
    for (let x = lavaX + 4; x < lavaX + lavaW; x += 14) w.lights.push(Object.assign({ x, y: lavaLevel - 1, type: 'lava', embers: true }, E.LIGHTS.lava));

    // grama densa: lâminas acima da superfície (principal = atrás do herói, frente = na frente)
    for (let x = 0; x < W; x++) {
      const g = ground[x];
      if (w.get('main', x, g) !== E.MAT.DIRT) continue;
      const tall = 3 + Math.round(n2(x * 0.05) * 7 + E.hash2(x, 1) * 3);
      for (let k = 1; k <= tall; k++) {
        const layer = k <= 2 && E.hash2(x, k) < 0.55 ? 'front' : 'main';
        const c = E.matColor(E.MAT.GRASS, x, g - k);
        const tip = 0.75 + (k / tall) * 0.5;
        w.set(layer, x, g - k, E.MAT.GRASS, c.map((v) => Math.min(255, v * tip)));
      }
      // grama também cobre o topo da terra
      if (E.hash2(x, 5) < 0.8) w.set('main', x, g, E.MAT.MOSS);
      if (E.hash2(x, 77) < 0.012) w.fillEllipse('front', x, g - 2, 3, 1.5, E.MAT.BUSH, 0.6, x);
      if (E.hash2(x, 91) < 0.02) w.set('main', x, g - tall - 1, E.MAT.FLOWER);
    }
    // árvores
    for (let x = 30; x < W - 30; x += 28 + Math.floor(rnd() * 40)) {
      if (o.fadeL && E.hash2(x, 404) > (x - 20) / o.fadeL) continue;
      if (x > ruinX - 20 && x < ruinX + ruinW + 20) continue;
      if (x > pondX - 4 && x < pondX + pondW + 4) continue;
      if (x > lavaX - 10 && x < lavaX + lavaW + 10) continue;
      E.Struct.tree(w, x, ground[x], rnd, rnd() < 0.3 ? 1.4 : 1);
    }
    // ruínas
    E.Struct.ruin(w, ruinX, ground[ruinX], ruinW, 58, rnd);
    E.Struct.web(w, ruinX + ruinW - 8, ground[ruinX] - 50, 12);
    // postes com lanterna e plataformas de madeira
    E.Struct.gallows(w, 70, ground[70]);
    E.Struct.gallows(w, pondX + pondW + 14, ground[pondX + pondW + 14]);
    for (let x = 120; x < W - 60; x += 70 + Math.floor(rnd() * 60)) {
      if (x > ruinX - 30 && x < ruinX + ruinW + 10) continue;
      const y = ground[x] - 14 - Math.floor(rnd() * 10);
      E.Struct.platform(w, x, y, 14 + Math.floor(rnd() * 10));
      if (rnd() < 0.5) E.Struct.lantern(w, x + 6, y - 14, 6);
    }
    // plataformas sobre o lago
    E.Struct.platform(w, pondX + 14, pondLevel - 10, 12);
    E.Struct.platform(w, pondX + 40, pondLevel - 16, 12);
    E.Struct.torch(w, pondX + 20, pondLevel - 15);

    // cabana com porta perto do início, poço e cerca
    E.Struct.cabin(w, 130, ground[130], rnd);
    E.Struct.well(w, 175, ground[175]);
    E.Struct.fence(w, 185, ground[185], 20);
    // entrada de caverna, torre e poço de mina que leva à Caverna Profunda
    const caveX = Math.round(W * 0.6);
    w.caveRoom = E.Struct.caveEntrance(w, caveX, ground[caveX], rnd);
    E.Struct.tower(w, ruinX - 40, ground[ruinX - 40]);
    const mineX = Math.round(W * 0.72);
    const mine = E.Struct.mineShaft(w, mineX, ground[mineX], 32);
    w.mineDoor = mine;
    E.Struct.doorAt(w, mine.x, mine.y, { destino: 'caverna' });
    E.Struct.bridge(w, lavaX - 4, lavaLevel - 14, lavaW + 8);
    // escadas até as plataformas mais altas do lago
    E.Struct.ladder(w, pondX + 52, pondLevel - 16, pondLevel - 1);

    // spawners de criaturas
    const sp = (prefab, x, y, ww, hh, interval, max, extra = {}) => w.spawners.push(Object.assign({ id: 'sp' + w.spawners.length, prefab, x, y, w: ww, h: hh, interval, max, initial: max, range: 140, active: true }, extra));
    for (let x = 160; x < W - 60; x += 110 + Math.floor(rnd() * 60)) {
      if (x > ruinX - 10 && x < ruinX + ruinW + 10) continue;
      if (x > lavaX - 20 && x < lavaX + lavaW + 20) continue;
      const kind = rnd() < 0.7 ? 'aranha' : 'slime';
      sp(kind, x - 15, ground[x] - 14, 30, 14, 12 + Math.floor(rnd() * 10), kind === 'slime' ? 3 : 2);
    }
    sp('morcego', pondX + 10, pondLevel - 40, 50, 20, 10, 3);
    sp('esqueleto', ruinX + 20, ground[ruinX] - 14, 80, 14, 20, 2);
    sp('espirito', lavaX, lavaLevel - 40, lavaW, 25, 25, 1);
    sp('aranha', ruinX + ruinW - 30, ground[ruinX] - 62, 25, 8, 30, 1, { initial: 1 });
    // objetos fixos
    let eid = 0;
    const ent = (prefab, x, props = {}) => w.entities.push({ id: 'e' + eid++, prefab, x, y: ground[x], facing: 1, props });
    ent('fogueira', 55);
    ent('npc', 95, { fala: 'As ruínas a leste guardam uma espada de fogo... mas cuidado com os esqueletos.' });
    ent('bau', ruinX + ruinW / 2, { loot: ['espada_fogo', 'elmo_ferro', 'pocao'] });
    ent('bau', pondX + pondW + 30, { loot: ['capa_rubra', 'pocao', 'moeda'] });
    ent('bau', 150, { loot: ['botas_couro', 'pocao', 'pao', 'maca'] });
    ent('fogueira', ruinX - 15);
    ent('fogueira', lavaX - 25);
    for (let x = 140; x < W - 40; x += 45 + Math.floor(rnd() * 40)) if (w.cellType(x, ground[x] - 2) === E.CT.NONE) w.entities.push({ id: 'e' + eid++, prefab: '__item', x, y: ground[x] - 1, props: { item: rnd() < 0.8 ? 'moeda' : 'pocao', qty: rnd() < 0.8 ? 1 + Math.floor(rnd() * 3) : 1 } });
    w.entities.push({ id: 'e' + eid++, prefab: '__item', x: pondX + 46, y: pondLevel - 17, props: { item: 'elixir', qty: 1 } });
    w.entities.push({ id: 'e' + eid++, prefab: '__item', x: ruinX + ruinW / 2, y: ground[ruinX] - 59, props: { item: 'lanterna', qty: 1 } });
    // gatilho de exemplo: aviso ao chegar perto da lava
    w.triggers.push({ id: 't0', x: lavaX - 30, y: lavaLevel - 30, w: 12, h: 40, once: true, script: `function onEnter(api) {
  api.message('O ar fica quente... a lava queima ao toque.');
  api.weather({ rain: 0, fog: 0.9 });
}` });

    w.spawn = { x: 40, y: ground[40] - 2 };
    w.ground = ground;
    w.computeSurface();
    return w;
  };

  // ---------- construções dos biomas ----------
  Object.assign(E.Struct, {
    giantTree(w, x, gy, rnd) {
      const h = 70 + Math.floor(rnd() * 35), tw = 7 + Math.floor(rnd() * 4);
      for (let y = gy - h; y < gy; y++) {
        const flare = y > gy - 8 ? Math.round((y - (gy - 8)) * 0.9) : 0;
        w.fillRect('back', x - (tw >> 1) - flare, y, tw + flare * 2, 1, E.MAT.BARK);
      }
      // galhos alternados com plataformas de madeira (dá para escalar pulando)
      let side = rnd() < 0.5 ? -1 : 1;
      for (let y = gy - 16; y > gy - h + 12; y -= 15) {
        const len = 12 + Math.floor(rnd() * 10);
        const x0 = side > 0 ? x + (tw >> 1) : x - (tw >> 1) - len;
        w.fillRect('back', x0, y + 1, len, 2, E.MAT.BARK);
        E.Struct.platform(w, x0 - (side > 0 ? 0 : 2), y, len + 2);
        w.fillEllipse('back', side > 0 ? x0 + len : x0, y - 4, 9, 4, E.MAT.LEAVES, 0.6, y);
        if (rnd() < 0.35) E.Struct.lantern(w, side > 0 ? x0 + len - 3 : x0 + 3, y + 3, 3);
        side *= -1;
      }
      // copa enorme
      const cy = gy - h;
      for (let k = 0; k < 9; k++) w.fillEllipse('back', x + (rnd() - 0.5) * 50, cy + (rnd() - 0.5) * 14, 14 + rnd() * 12, 6 + rnd() * 5, E.MAT.LEAVES, 0.6, k * 13 + x);
      if (rnd() < 0.6) w.fillEllipse('front', x + (rnd() - 0.5) * 30, cy + 8, 8, 4, E.MAT.LEAVES, 0.8, x + 1);
      E.Struct.platform(w, x - 8, cy + 4, 16);
    },
    palm(w, x, gy, rnd) {
      const h = 18 + Math.floor(rnd() * 8);
      let px = x;
      for (let k = 0; k < h; k++) {
        px = x + Math.round(Math.sin((k / h) * 1.4) * 5);
        w.fillRect('back', px - 1, gy - k, 3, 1, E.MAT.BARK);
      }
      const tx = px, ty = gy - h;
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        for (let s = 0; s < 14; s++) {
          const fx = tx + Math.cos(a) * s * 1.4, fy = ty + (Math.sin(a) * s) / 2.4 + (s * s) / 40;
          w.set('back', Math.round(fx), Math.round(fy), E.MAT.LEAVES);
        }
      }
      w.fillEllipse('back', tx, ty + 1, 2, 1.2, E.MAT.WOOD);
    },
    cactus(w, x, gy, rnd) {
      const h = 6 + Math.floor(rnd() * 8);
      w.fillRect('back', x - 1, gy - h, 3, h, E.MAT.CACTUS);
      for (const s of [-1, 1])
        if (rnd() < 0.7) {
          const ay = gy - 3 - Math.floor(rnd() * (h - 4));
          w.fillRect('back', s > 0 ? x + 2 : x - 4, ay, 3, 1, E.MAT.CACTUS);
          w.fillRect('back', s > 0 ? x + 4 : x - 4, ay - 3, 1, 4, E.MAT.CACTUS);
        }
    },
    snowPine(w, x, gy, rnd) {
      const h = 20 + Math.floor(rnd() * 16);
      w.fillRect('back', x - 1, gy - 6, 3, 6, E.MAT.BARK);
      for (let k = 0; k < h; k++) {
        const y = gy - 6 - k, half = Math.round(((h - k) / h) * (8 + rnd() * 0.5) * ((k % 6) / 6 + 0.55));
        for (let i = -half; i <= half; i++) w.set('back', x + i, y, Math.abs(i) >= half - 1 && k % 6 === 5 ? E.MAT.SNOW : E.MAT.PINE);
      }
      w.set('back', x, gy - 6 - h, E.MAT.SNOW);
    },
    shipwreck(w, x, floor, rnd) {
      for (let k = -22; k <= 22; k++) {
        const y = floor - Math.round(9 - (k * k) / 60);
        w.fillRect('back', x + k, y, 1, floor - y, E.MAT.WOOD);
        if (Math.abs(k) > 18 || rnd() < 0.15) w.set('main', x + k, y, E.MAT.WOOD);
      }
      w.fillRect('main', x - 20, floor - 1, 40, 1, E.MAT.WOOD);
      for (let k = 0; k < 26; k++) w.set('back', x - 4 + Math.round(k * 0.35), floor - 10 - k, E.MAT.BARK);
      w.entities.push({ id: 'nau' + x, prefab: 'bau', x: x + 6, y: floor - 1, facing: 1, props: { loot: ['moeda', 'moeda', 'capa_rubra', 'gema_safira', 'faca_arremesso', 'pocao'] } });
    },
    pyramid(w, cx, gy, rnd) {
      const H = 52, half0 = 70;
      for (let k = 0; k < H; k++) {
        const half = Math.round(half0 - k * 1.33), y = gy - 1 - k;
        for (let i = -half; i <= half; i++) {
          w.set('main', cx + i, y, E.MAT.SANDSTONE);
          w.set('back', cx + i, y, E.MAT.SANDSTONE);
        }
      }
      for (let y = gy; y < gy + 6; y++) for (let i = -half0 - 2; i <= half0 + 2; i++) w.set('main', cx + i, y, E.MAT.SANDSTONE);
      // túnel de entrada (lado esquerdo) até a câmara central
      for (let x = cx - half0 - 2; x < cx + 6; x++) for (let y = gy - 21; y < gy; y++) w.set('main', x, y, 0);
      for (let x = cx - 18; x < cx + 26; x++) for (let y = gy - 30; y < gy; y++) w.set('main', x, y, 0);
      E.Struct.torch(w, cx - 14, gy - 10);
      E.Struct.torch(w, cx + 22, gy - 10);
      E.Struct.torch(w, cx - half0 + 6, gy - 10);
      w.fillRect('main', cx - 6, gy - 2, 12, 2, E.MAT.GOLD);
      w.entities.push({ id: 'pir' + cx, prefab: 'bau', x: cx + 2, y: gy - 2, facing: 1, props: { loot: ['espada_fogo', 'elixir', 'gema_rubi', 'adaga_veneno', 'moeda', 'moeda'] } });
      w.spawners.push({ id: 'spPir' + cx, prefab: 'escorpiao', x: cx - 16, y: gy - 28, w: 40, h: 26, interval: 14, max: 2, initial: 2, range: 120, active: true });
      w.spawners.push({ id: 'spPirE' + cx, prefab: 'esqueleto', x: cx - 10, y: gy - 28, w: 30, h: 26, interval: 25, max: 1, initial: 1, range: 120, active: true });
    },
    // fortaleza tomada pelos cavaleiros caídos: três andares de 28 linhas (escala do herói), torres altas nas
    // pontas, portão com grade levadiça, janelas em arco, estandartes com brasão e sala do trono no topo
    castle(w, x0, gy, rnd) {
      const CW = 300, FH = 28, wallH = FH * 3 + 2, floors = [gy, gy - FH, gy - FH * 2];
      const x1 = x0 + CW;
      // fundo de pedra (blocos variados, musgo nas partes baixas) e interior limpo
      for (let y = gy - wallH; y < gy; y++)
        for (let x = x0; x < x1; x++) {
          w.set('main', x, y, 0);
          w.set('front', x, y, 0);
          const low = (gy - y) / wallH;
          w.set('back', x, y, E.hash2(x >> 2, y >> 1) < 0.18 * (1.3 - low) ? E.MAT.MOSS : (gy - y) < 4 ? E.MAT.COBBLE : E.MAT.MASONRY);
        }
      for (let x = x0 - 6; x < x1 + 6; x++) for (let y = gy; y < gy + 4; y++) w.set('main', x, y, E.MAT.MASONRY);
      // muralhas laterais (portão à esquerda, na altura de uma porta grande)
      w.fillRect('main', x0, gy - wallH, 5, wallH - 30, E.MAT.MASONRY);
      w.fillRect('main', x1 - 5, gy - wallH, 5, wallH, E.MAT.MASONRY);
      // grade levadiça erguida sobre o portão e arco de pedra
      E.stampArt(w, x0 - 1, gy - 31, ['/=====\\', '|#|#|#|', '|#|#|#|', 'v v v v'], ['SSSSSSS', 'IiIiIiI', 'IiIiIiI', 'i i i i'], { layer: 'main', solid: true });
      // andares com vãos e escadas
      for (let f = 1; f < floors.length; f++) {
        const y = floors[f];
        w.fillRect('main', x0 + 5, y, CW - 10, 2, E.MAT.MASONRY);
        const gap = f % 2 ? x0 + 30 : x1 - 50;
        w.fillRect('main', gap, y, 16, 2, 0);
        E.Struct.ladder(w, gap + 6, y, floors[f - 1] - 1);
      }
      // telhado com ameias e merlões
      w.fillRect('main', x0 - 2, gy - wallH - 1, CW + 4, 2, E.MAT.MASONRY);
      for (let x = x0 - 2; x < x1 + 2; x += 6) w.fillRect('main', x, gy - wallH - 4, 3, 3, E.MAT.MASONRY);
      E.Struct.ladder(w, x1 - 30, gy - wallH - 1, floors[2] - 1);
      for (let x = x1 - 30; x < x1 - 26; x++) if (w.idx(x, gy - wallH - 1) >= 0) w.col[w.idx(x, gy - wallH - 1)] = E.CT.ONEWAY;
      // torres de alturas diferentes nas pontas e uma torre de vigia no meio do adarve
      E.Struct.tower(w, x0 - 8, gy, wallH + 22);
      E.Struct.tower(w, x1 + 8, gy, wallH + 34);
      const wx = x0 + CW / 2, wy = gy - wallH - 1;
      for (let y = wy - 20; y < wy; y++) for (let xx = wx - 6; xx <= wx + 6; xx++) w.set('main', xx, y, Math.abs(xx - wx) > 4 ? E.MAT.MASONRY : 0), w.set('back', xx, y, E.MAT.MASONRY);
      for (let xx = wx - 8; xx <= wx + 8; xx += 4) w.fillRect('main', xx, wy - 23, 2, 3, E.MAT.MASONRY);
      w.fillRect('main', wx - 8, wy - 21, 17, 1, E.MAT.MASONRY);
      E.stampArt(w, wx - 1, wy - 16, ['/^\\', '|█|', '|█|', '\\_/'], ['SSS', 'SKS', 'SKS', 'SSS']);
      // janelas em arco, tochas e estandartes com brasão em cada andar
      for (let f = 0; f < floors.length; f++) {
        const fy = floors[f];
        for (let x = x0 + 22; x < x1 - 20; x += 34) {
          E.windowArt(w, x, fy - 21, 8, 12, { arch: true, lit: f === 2 && E.hash2(x, fy) < 0.5, frame: 'S' });
          E.Struct.torch(w, x + 16, fy - 9);
          if (rnd() < 0.55) {
            E.Struct.banner(w, x - 9, fy - 24, 6, 15);
            E.stampArt(w, x - 7, fy - 17, ['♦'], ['g']);
          }
        }
      }
      // portão com porta
      w.entities.push({ id: 'portao' + x0, prefab: 'porta', x: x0 + 2, y: gy, facing: 1, props: {} });
      // sala do trono no último andar: tapeçaria, trono dourado e lanternas
      const tx = x0 + CW / 2;
      w.fillRect('back', tx - 6, floors[2] - 22, 13, 22, E.MAT.CLOTH);
      E.stampArt(w, tx - 1, floors[2] - 19, ['W'], ['g']);
      E.stampArt(w, tx - 5, floors[2] - 11, ['  _/^\\_  ', ' |  ♦  | ', ' |=====| ', ' |#####| ', '_|_____|_', '|_______|'], ['  ggggg  ', ' gRRgRRg ', ' gggggg g', ' gcccccg ', 'gggggggg ', 'GGGGGGGGG']);
      E.Struct.lantern(w, tx - 22, floors[2] - 26, 4);
      E.Struct.lantern(w, tx + 22, floors[2] - 26, 4);
      w.entities.push({ id: 'trono' + x0, prefab: 'bau', x: tx + 14, y: floors[2], facing: 1, props: { loot: ['peitoral_ouro', 'elmo_ouro', 'espada_cavaleiro', 'pocao_grande', 'pocao'] } });
      // guardas
      const sp = (prefab, fy, xa, ww, interval, max) => w.spawners.push({ id: 'spC' + prefab + fy + xa, prefab, x: xa, y: fy - 26, w: ww, h: 24, interval, max, initial: max, range: 150, active: true });
      sp('esqueleto_guerreiro', floors[0], x0 + 40, 220, 18, 3);
      sp('esqueleto', floors[1], x0 + 40, 220, 22, 2);
      sp('esqueleto_guerreiro', floors[1], x0 + 60, 180, 22, 2);
      sp('espirito', floors[2], x0 + 60, 180, 30, 1);
      sp('esqueleto_guerreiro', floors[2], x0 + 40, 220, 25, 2);
      // marcas do tempo: rachaduras, entulho e vigas
      E.Deco.ruinWear(w, x0 + 6, x1 - 6, gy - wallH, gy, rnd, { runes: false });
    },
  });

  E.Struct.ruinedKeep = (w, x, gy, rnd, snowy = false) => {
    const KW = 74, x0 = x - KW / 2, top = gy - 34;
    const broken = (xx) => Math.round(top + 8 + (E.hash2(xx >> 2, 7) * 0.6 + E.hash2(xx, 9) * 0.4) * 18);
    for (let xx = x0; xx < x0 + KW; xx++) {
      const bt = broken(xx);
      for (let y = top; y < gy; y++) {
        w.set('main', xx, y, 0);
        if (y >= bt && !(E.hash2(xx >> 2, y >> 2) < 0.18)) w.set('back', xx, y, E.hash2(xx, y) < 0.22 ? E.MAT.MOSS : E.MAT.MASONRY);
      }
    }
    for (let xx = x0 - 2; xx < x0 + KW + 2; xx++) for (let y = gy; y < gy + 3; y++) w.set('main', xx, y, E.MAT.MASONRY);
    // torre partida à esquerda, muro baixo à direita, arco desabado no meio
    for (let y = top - 8; y < gy; y++) for (let xx = x0; xx < x0 + 10; xx++) if (y > top - 8 + (xx - x0) % 4 * 2 + E.hash2(xx, 3) * 4) w.set('main', xx, y, E.MAT.MASONRY);
    for (let y = gy - 14; y < gy; y++) for (let xx = x0 + KW - 6; xx < x0 + KW; xx++) if (y > gy - 14 + E.hash2(xx, 5) * 6) w.set('main', xx, y, E.MAT.MASONRY);
    E.Struct.platform(w, x0 + 10, top + 14, 18);
    for (let k = 0; k < 6; k++) w.fillEllipse('main', x0 + 14 + rnd() * (KW - 28), gy - 1, 2 + rnd() * 3, 1 + rnd(), E.MAT.MASONRY);
    for (let k = 0; k < 10; k++) {
      const vx = x0 + Math.floor(rnd() * KW), vy = broken(vx);
      for (let j = 0; j < 3 + rnd() * 8; j++) w.set('back', vx, vy + j, E.MAT.VINE);
    }
    E.Struct.banner(w, x0 + 34, top + 10, 5, 9);
    E.Struct.torch(w, x0 + 24, gy - 6);
    if (snowy) for (let xx = x0 - 2; xx < x0 + KW + 2; xx++) {
      let y = 0;
      while (y < gy && !w.solid(xx, y)) y++;
      if (y < gy && E.hash2(xx, 12) < 0.85) w.set('main', xx, y - 1, E.MAT.SNOW);
    }
    w.entities.push({ id: 'keep' + x, prefab: 'bau', x: x0 + 52, y: gy, facing: 1, props: { loot: ['moeda', 'moeda', 'pocao', ['regen', 'pao', 'carne_assada', 'faca_arremesso', 'botas_ferro', 'capa_floresta', 'lanca', 'machado', 'lingote_ferro'][Math.floor(rnd() * 9)]] } });
    w.spawners.push({ id: 'spKeep' + x, prefab: 'cavaleiro', x: x0 + 12, y: gy - 18, w: KW - 24, h: 17, interval: 22, max: 2, initial: 2, range: 160, active: true });
    E.Deco.ruinWear(w, x0, x0 + KW, top, gy, rnd, { bones: true });
  };

  // ---------- vilarejos ----------
  E.VILLAGES = {
    porto: {
      name: 'Porto da Areia', forge: true,
      houses: [{ kind: 'palha', role: 'simples', width: 50 }, { kind: 'estalagem', role: 'estalagem', sign: 'Estalagem' }],
      stalls: [['pescador', ['peixe_assado', 'pao', 'maca', 'faca_arremesso', 'bomba', 'tocha_mao']], ['mercador', ['pocao', 'antidoto', 'lanca', 'arco_curto', 'botas_couro', 'capa_rubra', 'lanterna']]],
      folk: [['aldeao', 'Bem-vindo ao Porto da Areia!|Dizem que perto da pirâmide há catacumbas... e um rei que não morre.|O ferreiro aqui do lado deixa sua espada afiada como nunca.'], ['aldea', 'Os peixes andam sumindo...|O oceano a oeste esconde um navio afundado. Dizem que há safiras lá.'], ['guarda', 'Fique de olho nos escorpiões.|A entrada das catacumbas fica a leste da pirâmide.'], ['marinheiro', 'Já cruzei o oceano três vezes!|Uma tempestade levou meu navio para o fundo, a oeste.|Na estalagem servem o melhor ensopado do deserto.']],
    },
    oasis: {
      name: 'Oásis', forge: false,
      houses: [{ kind: 'adobe', role: 'simples' }, { kind: 'adobe', role: 'comerciante', floors: 2, width: 60, sign: 'Mercado' }],
      stalls: [['alquimista', ['pocao', 'pocao_grande', 'elixir', 'antidoto', 'regen', 'cogumelo_brilho', 'pocao_escudo']], ['mercador', ['carne_assada', 'pao', 'adaga_veneno', 'arco_curto', 'bomba', 'cristal_luz', 'botas_aladas']]],
      folk: [['aldeao', 'A água do oásis é a coisa mais preciosa do deserto.|Ouço passos de ossos vindos do subsolo à noite...'], ['aldea', 'O alquimista prepara poções com ervas daqui.|Dizem que o Rei Esqueleto guarda uma coroa de ouro.'], ['aldeao', 'Já foi às catacumbas? Leve antídoto: os escorpiões de lá são cruéis.'], ['curandeira', 'Ervas do oásis curam quase tudo.|Se um escorpião te picar, beba antídoto antes que o veneno suba.'], ['monge', 'O silêncio do deserto ensina paciência.|Nas catacumbas jazem reis antigos. Respeite os mortos.']],
    },
    bosque: {
      name: 'Vila do Bosque', forge: true,
      houses: [{ kind: 'enxaimel', role: 'artesao', sign: 'Oficina' }, { kind: 'pedra', role: 'nobre', floors: 2, width: 62 }],
      stalls: [['armeiro', ['espada_cavaleiro', 'machado', 'martelo_guerra', 'lanca', 'elmo_ferro', 'peitoral_ferro', 'botas_ferro', 'capa_floresta', 'lingote_ferro']], ['alquimista', ['pocao', 'pocao_grande', 'regen', 'antidoto', 'pocao_escudo', 'cogumelo_brilho', 'bomba']]],
      folk: [['aldeao', 'As árvores da Floresta Grande têm mais de cem anos.|A leste há um covil cheio de gosma... o Slime Rei mora lá.'], ['aldea', 'Traga lingotes de ferro para o ferreiro, ele melhora sua armadura.|Cuidado com as aranhas à noite.'], ['guarda', 'O castelo a leste caiu nas mãos dos cavaleiros.|No fundo da mina da floresta antiga vive a Rainha Aranha.'], ['cacador', 'Rastros de aranha gigante perto da mina...|Flechas não mentem: mire na cabeça.'], ['nobre', 'Esta vila prospera sob a proteção da minha casa.|O castelo era nosso, antes dos cavaleiros malditos.'], ['paladino', 'Juramos retomar o castelo a leste.|Nenhum cavaleiro caído vence uma lâmina abençoada.']],
    },
    gelada: {
      name: 'Vila Gelada', forge: true,
      houses: [{ kind: 'palha', role: 'simples' }, { kind: 'pedra', role: 'estalagem', floors: 2, width: 66, sign: 'Taverna' }],
      stalls: [['armeiro', ['espada_gelo', 'cajado_arcano', 'elmo_ouro', 'peitoral_ouro', 'capa_gelida', 'botas_aladas', 'lingote_ferro']], ['alquimista', ['pocao_grande', 'carne_assada', 'bomba_gelo', 'pocao_escudo', 'elixir', 'antidoto']]],
      folk: [['aldeao', 'Brrr! Bem-vindo à Vila Gelada.|Na gruta a leste, um golem de gelo acordou.'], ['aldea', 'O lago congelado é lindo ao amanhecer.|Uma capa gélida protege do frio que deixa lento.'], ['guarda', 'Nunca enfrente o golem sem poções.|Os slimes de gelo grudam nas botas.'], ['mineiro', 'O gelo esconde veios de safira na gruta.|Minha lamparina nunca apaga, é truque de anão.'], ['mago', 'O golem desperta quando a lua está alta.|Magia de gelo? Nada que o fogo não resolva.'], ['misterioso', '...|Você também ouve os sussurros sob a neve?|Nem todo espírito errante quer seu mal.']],
    },
  };
  // vilarejo na escala do herói (±215 colunas). Da esquerda para a direita: cerca, casa simples, poste,
  // fogueira, oficina (ou lagoa no oásis), poço, caixotes, duas barracas, poste, casa de destaque, cerca.
  // Os moradores têm profissões que combinam com o lugar.
  E.VILLAGE_HALF = 215;
  E.Struct.village = (w, cx, gy, rnd, kind, ground) => {
    const V = E.VILLAGES[kind];
    const snowy = kind === 'gelada', sandy = kind === 'porto' || kind === 'oasis';
    const HW = E.VILLAGE_HALF;
    for (let x = cx - HW; x < cx + HW; x++) {
      for (let y = gy - 95; y < gy; y++) {
        w.set('main', x, y, 0);
        w.set('front', x, y, 0);
        w.set('back', x, y, 0);
      }
      for (let y = gy; y < gy + 6; y++) if (!w.get('main', x, y)) w.set('main', x, y, sandy ? E.MAT.SAND : E.MAT.DIRT);
      if (ground) ground[x] = gy;
    }
    // rua: pedra no porto e no oásis, tábuas no bosque, neve batida na vila gelada
    for (let x = cx - 120; x < cx + 120; x++) w.set('main', x, gy, sandy ? E.MAT.SANDSTONE : snowy ? E.MAT.SNOW : E.MAT.PLANK);
    const H = V.houses;
    E.Struct.house(w, cx - 150, gy, rnd, Object.assign({ door: 1 }, H[0]));
    E.Struct.house(w, cx + 158, gy, rnd, Object.assign({ door: -1 }, H[1]));
    if (V.forge) {
      E.Struct.forge(w, cx - 58, gy);
      w.entities.push({ id: 'v' + kind + 'ferreiro', prefab: 'ferreiro', x: cx - 68, y: gy, facing: 1, props: {} });
    } else {
      // lagoa do oásis com palmeiras e juncos
      for (let x = cx - 84; x < cx - 30; x++) {
        const d = Math.round(Math.sin(((x - cx + 84) / 54) * Math.PI) * 6);
        for (let y = gy; y < gy + d; y++) w.set('main', x, y, E.MAT.WATER);
      }
      E.Struct.palm(w, cx - 90, gy, rnd);
      E.Struct.palm(w, cx - 24, gy, rnd);
      E.prop(w, 'junco', cx - 80, gy);
      E.prop(w, 'junco', cx - 40, gy);
    }
    E.Struct.well(w, cx - 8, gy);
    E.prop(w, 'caixotes', cx + 5, gy, { keep: true });
    const cols = [[200, 60, 50], [60, 110, 190], [70, 150, 80], [190, 140, 50]];
    V.stalls.forEach(([prefab, stock], k) => {
      const sx = cx + 44 + k * 50;
      E.Struct.stall(w, sx, gy, cols[(k + kind.length) % 4], prefab);
      w.entities.push({ id: 'v' + kind + prefab + k, prefab, x: sx, y: gy, facing: -1, props: { stock } });
    });
    E.Struct.lampPost(w, cx - 114, gy);
    E.Struct.lampPost(w, cx + 120, gy);
    E.Struct.fence(w, cx - HW + 2, gy, 18);
    E.Struct.fence(w, cx + HW - 20, gy, 18);
    w.entities.push({ id: 'v' + kind + 'fogo', prefab: 'fogueira', x: cx - 100, y: gy, facing: 1, props: {} });
    // moradores espalhados pela rua; o guarda vigia a entrada
    const spots = [-92, -18, 20, 70, 112, 136, 26];
    let s = 0;
    V.folk.forEach(([prefab, fala], k) => {
      const x = prefab === 'guarda' || prefab === 'paladino' ? cx + (k % 2 ? -192 : 192) : cx + spots[s++ % spots.length];
      w.entities.push({ id: 'v' + kind + 'npc' + k, prefab, x, y: gy, facing: k % 2 ? -1 : 1, props: { fala } });
    });
    w.lights.push(Object.assign({ x: cx, y: gy - 30 }, E.LIGHTS.lanterna, { r: 22, i: 0.6 }));
    if (snowy)
      for (let x = cx - HW; x < cx + HW; x++) {
        let y = gy - 95;
        while (y < gy && !w.solid(x, y)) y++;
        if (y < gy && E.hash2(x, 12) < 0.9) w.set('main', x, y - 1, E.MAT.SNOW);
      }
    w.villages ||= [];
    w.villages.push({ x: cx, name: V.name });
  };

  // ---------- entradas das masmorras: fachada na superfície + descida até o subsolo profundo ----------
  Object.assign(E.Struct, {
    // detalhes temáticos sobre a boca natural da caverna (x = boca, gy = chão original)
    dungeonGate(w, x, gy, theme, rnd) {
      const top = (xx) => {
        let y = gy - 50;
        while (y < gy + 20 && !w.solid(xx, y)) y++;
        return y;
      };
      if (theme === 'areia') {
        // ruínas meio enterradas: colunas quebradas de arenito com inscrições em ouro, bloco caído e tochas
        for (const [px, h] of [[x - 24, 20], [x + 50, 12]]) {
          const g = top(px + 1);
          for (let y = g - h; y < g; y++)
            for (let k = 0; k < 4; k++) {
              const broken = y < g - h + 3 && E.hash2(px + k, y) < 0.5;
              if (!broken) w.set('back', px + k, y, (y - g) % 4 === 0 && k === 1 ? E.MAT.GOLD : E.MAT.SANDSTONE);
            }
          w.fillRect('back', px - 1, g - 2, 6, 2, E.MAT.MASONRY);
          E.Struct.torch(w, px + 1, g - h - 4);
        }
        const fx = x + 14, fg = top(fx);
        w.fillRect('main', fx - 3, fg - 3, 8, 3, E.MAT.SANDSTONE);
        w.set('main', fx, fg - 2, E.MAT.MASONRY), w.set('back', fx + 2, fg - 4, E.MAT.GOLD);
        E.Struct.cactus(w, x - 46, top(x - 46), rnd);
      } else if (theme === 'gelo') {
        // pingentes grandes na saliência, cristais de gelo nos lados e uma poça congelada na entrada
        for (let xx = x - 16; xx <= x + 18; xx++) {
          let y = gy - 45;
          while (y < gy + 6 && !w.solid(xx, y)) y++;
          while (y < gy + 6 && w.solid(xx, y)) y++;
          if (y >= gy + 6 || E.hash2(xx, 51) > 0.3) continue;
          let free = 0;
          while (free < 30 && !w.solid(xx, y + free)) free++;
          for (let k = 0; k < Math.min(free - 20, 2 + Math.floor(E.hash2(xx, 52) * 5)); k++) w.set('main', xx, y + k, E.MAT.ICE);
        }
        for (const cx of [x - 38, x + 58]) {
          const g = top(cx);
          for (let k = 0; k < 3; k++) w.fillEllipse('main', cx + (k - 1) * 3, g - 1 - k * 1.5, 1.4, 1.6 + k, E.MAT.CRYSTAL);
          w.lights.push(Object.assign({ x: cx, y: g - 5, type: 'cristal' }, E.LIGHTS.cristal, { r: 30 }));
        }
        for (let xx = x - 10; xx < x + 6; xx++) {
          const g = top(xx);
          if (w.get('main', xx, g) !== E.MAT.ICE) w.set('main', xx, g, E.MAT.ICE);
        }
        w.lights.push(Object.assign({ x: x + 8, y: gy - 4, type: 'cristal' }, E.LIGHTS.cristal, { r: 22, i: 0.7 }));
      } else if (theme === 'fungo') {
        // o rochedo vira musgo, cogumelos gigantes crescem por cima e cipós longos caem sobre a boca
        for (let xx = x - 31; xx <= x + 47; xx++)
          for (let y = gy - 45; y < gy + 3; y++) if (w.get('main', xx, y) === E.MAT.STONE && E.hash2(xx, y) < 0.85) w.set('main', xx, y, E.MAT.MOSS);
        for (const [px, h, rx] of [[x - 12, 16, 9], [x + 26, 22, 11], [x + 40, 10, 6]]) {
          const g = top(px);
          w.fillRect('back', px - 1, g - h, 3, h, E.MAT.BARK);
          w.fillEllipse('back', px, g - h, rx, 3, E.MAT.MUSHROOM, 0.3, px);
          for (let k = -rx + 2; k < rx - 1; k += 3) w.set('back', px + k, g - h + 3, E.MAT.MUSHROOM);
          w.lights.push({ x: px, y: g - h + 2, type: 'cogumelo', c: [0.4, 0.95, 0.75], r: 26, i: 0.9, flicker: 0.05, pulse: true });
        }
        for (let xx = x - 14; xx <= x + 16; xx += 2) {
          let y = gy - 45;
          while (y < gy + 6 && !w.solid(xx, y)) y++;
          while (y < gy + 6 && w.solid(xx, y)) y++;
          for (let k = 0; k < 4 + Math.floor(E.hash2(xx, 3) * 12) && !w.solid(xx, y + k); k++) w.set('back', xx, y + k, E.MAT.VINE);
        }
        E.Struct.mushrooms(w, x - 40, top(x - 40), rnd);
        E.Struct.mushrooms(w, x + 58, top(x + 58), rnd);
      }
    },
    // poço com escada, plataformas de descanso e luzes, revestido pelo tema da masmorra
    descent(w, x, y0, y1, theme, rnd) {
      const n = vnoise(x * 7 + 1);
      const LINE = { pedra: E.MAT.STONE, areia: E.MAT.MASONRY, gelo: E.MAT.ICE, fungo: E.MAT.MOSS }[theme] || E.MAT.STONE;
      for (let y = y0; y < y1; y++) {
        const half = 8 + Math.round(n(y * 0.08) * 4), off = Math.round((n(y * 0.025 + 40) - 0.5) * 5);
        for (let xx = -half - 2; xx <= half + 2; xx++) {
          const X = x + off + xx;
          if (Math.abs(xx) <= half) {
            w.set('main', X, y, 0);
            w.set('front', X, y, 0);
            w.set('back', X, y, theme === 'areia' ? E.MAT.SANDSTONE : E.MAT.ROCK);
          } else if (w.solid(X, y)) w.set('main', X, y, LINE);
        }
        if (theme === 'pedra' && y % 10 === 0) {
          // escoramento de mina: viga e postes de madeira
          w.fillRect('back', x + off - half, y, half * 2 + 1, 1, E.MAT.WOOD);
          for (let j = 0; j < 10; j++) w.set('back', x + off - half, y + j, E.MAT.WOOD), w.set('back', x + off + half, y + j, E.MAT.WOOD);
        }
        if (theme === 'areia' && y % 7 === 0) for (let xx = -half; xx <= half; xx += 6) w.set('back', x + off + xx, y, E.MAT.MASONRY);
        if (theme === 'fungo' && E.hash2(x, y) < 0.25) for (let j = 0; j < 4; j++) w.set('back', x + off + (E.hash2(y, 3) < 0.5 ? -half : half), y + j, E.MAT.VINE);
        if (theme === 'gelo' && E.hash2(x, y) < 0.18) w.set('main', x + off + (E.hash2(y, 4) < 0.5 ? -half : half), y, E.MAT.ICE);
      }
      E.Struct.ladder(w, x - 4, y0, y1 - 1);
      // plataformas vazadas do lado direito para descansar na subida
      let k = 0;
      for (let y = y0 + 14; y < y1 - 8; y += 15, k++) {
        E.Struct.platform(w, x + 1, y, 7);
        if (k % 2 === 0) {
          if (theme === 'pedra') E.Struct.lantern(w, x + 4, y - 9, 3);
          else if (theme === 'areia') E.Struct.torch(w, x + 6, y - 4);
          else if (theme === 'gelo') {
            w.fillEllipse('main', x + 9, y - 1, 1.5, 1, E.MAT.CRYSTAL);
            w.lights.push(Object.assign({ x: x + 8, y: y - 3, type: 'cristal' }, E.LIGHTS.cristal));
          } else E.Struct.mushrooms(w, x + 4, y, rnd);
        } else if (theme === 'pedra' && rnd() < 0.6) E.Struct.web(w, x - 6, y - 6, 6);
      }
      // arco de pedra marcando a chegada à masmorra
      for (const px of [x - 12, x + 10]) w.fillRect('back', px, y1 - 20, 3, 20, LINE === E.MAT.ICE ? E.MAT.ICE : E.MAT.MASONRY);
      for (let k = -12; k <= 12; k++) w.set('back', x + k, y1 - 21 - Math.round(Math.cos((k / 12) * 1.4) * 3), E.MAT.MASONRY);
      E.Struct.torch(w, x - 9, y1 - 6);
      E.Struct.torch(w, x + 8, y1 - 6);
    },
  });

  // ---------- mundo grande com biomas (estilo Terraria) ----------
  E.BIOME_NAMES = { oceano: 'Oceano', praia: 'Praia', deserto: 'Deserto', floresta: 'Floresta das Ruínas', floresta_grande: 'Floresta Grande', castelo: 'Castelo da Floresta', neve: 'Terras Geladas', oceano_gelado: 'Oceano Gelado' };
  E.generateWorld = (seed = 1) => {
    // HU = fundo do subsolo comum; abaixo dele ficam as masmorras, no mesmo mapa
    const W = 9500, H = 540, HU = 300, SEA = 150, T = 170; // T = meia-largura das faixas de transição
    const w = new E.World(W, H);
    const rnd = E.rng(seed * 7 + 3);
    const n1 = vnoise(seed + 101), n2 = vnoise(seed + 202), n3 = vnoise(seed + 303);
    const B = [['oceano', 0, 600], ['praia', 600, 820], ['deserto', 820, 2900], ['floresta', 2900, 3900], ['floresta_grande', 3900, 6000], ['castelo', 6000, 6600], ['neve', 6600, 8900], ['oceano_gelado', 8900, 9500]];
    w.biomes = B.map(([id, x0, x1]) => ({ id, x0, x1 }));
    const idxAt = (x) => Math.max(0, B.findIndex((b) => x >= b[1] && x < b[2]));
    const sm = (t) => t * t * (3 - 2 * t);
    const bn = vnoise2(seed + 55), pn = vnoise2(seed + 77);
    // cada fronteira tem largura própria (0,65T–1,35T) e ondula com a profundidade: nada de linha vertical
    const TW = B.map((_, i) => T * (0.65 + 0.7 * E.hash2(i, seed + 5)));
    const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const near = (x) => B.some((b, i) => i > 0 && Math.abs(x - b[1]) < TW[i] + 75);
    const mixAt = (x, y = 0) => {
      if (!near(x)) {
        const i = idxAt(x);
        return { a: B[i][0], b: B[i][0], t: 0 };
      }
      const xe = Math.max(0, Math.min(W - 1, x + (bn(x * 0.006, y * 0.02) - 0.5) * 140));
      const i = idxAt(xe), [id, x0, x1] = B[i];
      if (i > 0 && xe - x0 < TW[i]) return { a: id, b: B[i - 1][0], t: 0.5 * sm(c01(1 - (xe - x0) / TW[i])) };
      if (i < B.length - 1 && x1 - xe < TW[i + 1]) return { a: id, b: B[i + 1][0], t: 0.5 * sm(c01(1 - (x1 - xe) / TW[i + 1])) };
      return { a: id, b: id, t: 0 };
    };
    // manchas suaves (~15×8 células): a mistura é intensa na fronteira e some no interior do bioma
    const blob = (x, y) => c01(0.5 + (pn(x * 0.07, y * 0.13) - 0.5) * 1.7);
    const pick = (x, y) => {
      const m = mixAt(x, y);
      if (!m.t) return m.a;
      return blob(x, y) < m.t ? m.b : m.a;
    };
    // 1) Floresta das Ruínas original encaixada
    const chunk = E.generate(seed, 1000, 180, { fadeL: 260 });
    const OX = 2900, DY = SEA - Math.round(chunk.H * 0.68);
    const LK = ['main', 'back', 'front'];
    for (let y = 0; y < chunk.H; y++)
      for (let x = 0; x < chunk.W; x++) {
        if (y + DY < 0 || y + DY >= H) continue;
        const si = y * chunk.W + x, di = (y + DY) * W + x + OX;
        for (const L of LK) {
          w[L][di] = chunk[L][si];
          w[L + 'Col'][di * 3] = chunk[L + 'Col'][si * 3];
          w[L + 'Col'][di * 3 + 1] = chunk[L + 'Col'][si * 3 + 1];
          w[L + 'Col'][di * 3 + 2] = chunk[L + 'Col'][si * 3 + 2];
        }
        w.col[di] = chunk.col[si];
      }
    const FT = E.BIOME_TINT.floresta;
    for (let y = chunk.H + DY; y < H; y++)
      for (let x = OX; x < OX + chunk.W; x++) {
        w.set('main', x, y, E.MAT.STONE, E.strataColor(E.MAT.STONE, x, y, FT));
        w.set('back', x, y, E.MAT.ROCK, E.strataColor(E.MAT.ROCK, x, y, FT));
      }
    // a rocha da fase encaixada ganha os mesmos estratos do resto do mundo
    for (let y = Math.max(0, DY); y < chunk.H + DY; y++)
      for (let x = OX; x < OX + chunk.W; x++) {
        const m = w.get('main', x, y), bk = w.get('back', x, y);
        if (m === E.MAT.STONE || m === E.MAT.MOSS) w.set('main', x, y, m, E.strataColor(m, x, y, FT));
        if (bk === E.MAT.ROCK) w.set('back', x, y, bk, E.strataColor(bk, x, y, FT));
      }
    const mv = (o) => Object.assign(o, { x: o.x + OX, y: o.y + DY });
    w.lights = chunk.lights.map((l) => mv(Object.assign({}, l)));
    w.entities = chunk.entities.map((e) => mv(JSON.parse(JSON.stringify(e))));
    w.spawners = chunk.spawners.map((s) => mv(Object.assign({}, s)));
    w.triggers = chunk.triggers.map((t) => mv(Object.assign({}, t)));
    w.spawn = mv(Object.assign({}, chunk.spawn));
    w.mineDoor = chunk.mineDoor && mv(Object.assign({}, chunk.mineDoor));
    const inChunk = (x) => x >= OX && x < OX + chunk.W;
    // 2) relevo
    const rawB = (id, x) => {
      if (id === 'oceano') return SEA + 10 + 55 * Math.pow(Math.max(0, 1 - x / 600), 0.8);
      if (id === 'oceano_gelado') return SEA + 10 + 55 * Math.pow(Math.max(0, (x - 8900) / 600), 0.8);
      if (id === 'praia') return SEA - 2 + 8 * Math.max(0, 1 - (x - 600) / 220);
      if (id === 'deserto') return SEA - 9 - 10 * Math.sin(x * 0.018) - 9 * (n1(x * 0.01) - 0.5) * 2;
      if (id === 'floresta' || id === 'floresta_grande') return SEA - 13 - 13 * (n2(x * 0.006) - 0.5) * 2 - 3 * (n3(x * 0.04) - 0.5);
      if (id === 'castelo') return SEA - 16 - 3 * (n2(x * 0.004) - 0.5);
      if (id === 'neve') return SEA - 20 - 28 * n3(x * 0.007) - 6 * (n1(x * 0.035) - 0.5);
      return SEA - 10;
    };
    const ground = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      if (inChunk(x)) {
        ground[x] = chunk.ground[x - OX] + DY;
        continue;
      }
      const m = mixAt(x);
      ground[x] = Math.round(rawB(m.a, x) * (1 - m.t) + rawB(m.b, x) * m.t);
    }
    const seam = (edgeX, dir) => {
      const eh = ground[edgeX];
      for (let k = 1; k <= 2 * T; k++) {
        const x = edgeX + dir * k, t = sm(1 - k / (2 * T));
        ground[x] = Math.round(ground[x] * (1 - t) + eh * t);
      }
    };
    seam(OX, -1);
    seam(OX + chunk.W - 1, 1);
    const plateau = (x0, x1, h, ramp) => {
      for (let x = x0 - ramp; x < x1 + ramp; x++) {
        const t = x < x0 ? sm((x - (x0 - ramp)) / ramp) : x >= x1 ? sm(1 - (x - x1) / ramp) : 1;
        ground[x] = Math.round(ground[x] * (1 - t) + h * t);
      }
    };
    const castleX = 6130, pyrX = 1800, lake = 7900;
    const VILLAGES = [{ x: 1090, kind: 'porto' }, { x: 2400, kind: 'oasis' }, { x: 4700, kind: 'bosque' }, { x: 7450, kind: 'gelada' }];
    const KEEPS = [[2680, false], [4250, false], [5480, false], [6950, true]];
    const CAVES = [{ x: 2130, dest: 'catacumbas' }, { x: 5180, dest: 'covil' }, { x: 8420, dest: 'gruta_gelada' }];
    const SHAFTS = [1450, 4420, 5750, 7180, 8180];
    plateau(castleX - 30, castleX + 330, SEA - 16, 60);
    plateau(pyrX - 85, pyrX + 85, ground[pyrX], 50);
    for (const v of VILLAGES) plateau(v.x - E.VILLAGE_HALF - 4, v.x + E.VILLAGE_HALF + 4, ground[v.x], 45);
    const nearV = (x, r = E.VILLAGE_HALF + 25) => VILLAGES.some((v) => Math.abs(x - v.x) < r) || CAVES.some((c) => Math.abs(x - c.x) < 30) || SHAFTS.some((s) => Math.abs(x - s) < 14) || KEEPS.some(([k]) => Math.abs(x - k) < 45);
    // 3) materiais por célula
    const fillCol = (x) => {
      const g = ground[x], cb = mixAt(x, g).a, TT = E.BIOME_TINT[cb];
      const sandy = cb === 'deserto' || cb === 'praia' || cb.startsWith('oceano');
      for (let y = g; y < H; y++) {
        // abaixo de ~70 células todo bioma é rocha: não precisa sortear a mistura
        const d = y - g, b = d > 70 ? '' : pick(x, y);
        const edge = (pn.one(x * 0.05 + 70, y * 0.1) - 0.5) * 12; // borda irregular entre solo e rocha
        let m;
        if (!b) m = E.MAT.STONE;
        else if (b === 'oceano' || b === 'praia' || b === 'oceano_gelado') m = d < 11 + edge * 0.4 ? E.MAT.SAND : d < 26 + edge ? E.MAT.SANDSTONE : E.MAT.STONE;
        else if (b === 'deserto') m = d < 15 + edge * 0.5 ? E.MAT.SAND : d < 42 + edge ? E.MAT.SANDSTONE : E.MAT.STONE;
        else if (b === 'neve') m = d < 3 ? E.MAT.SNOW : d < 18 + n1(x * 0.1) * 6 + edge ? E.MAT.DIRT : E.MAT.STONE;
        else m = d < 22 + n1(x * 0.1) * 8 + edge ? E.MAT.DIRT : E.MAT.STONE;
        if (m === E.MAT.STONE) {
          // bolsões de terra (ou areia no deserto) presos na rocha, mais comuns perto da superfície
          if (d < 120 && pn.one(x * 0.07 + 900, y * 0.14) < 0.16 - d * 0.0008) m = sandy ? E.MAT.SANDSTONE : E.MAT.DIRT;
          else if (pn.one(x * 0.09 + 500, y * 0.18) < 0.2) m = E.MAT.MOSS;
        }
        w.set('main', x, y, m, m === E.MAT.STONE || m === E.MAT.MOSS ? E.strataColor(m, x, y, TT) : undefined);
        if (d > 1) {
          const bm = b === 'deserto' && d < 46 ? E.MAT.SANDSTONE : E.MAT.ROCK;
          w.set('back', x, y, bm, E.strataColor(bm, x, y, TT));
        }
      }
    };
    const tint = (c, to, k) => c.map((v, i) => Math.round(v + (to[i] - v) * c01(k)));
    const DRY = [150, 138, 70], FROST = [175, 205, 200];
    // superfície de uma coluna: grama, flores, arbustos secos, neve e gelo seguem o peso de cada bioma
    // fw/dw/sw = peso da floresta, do deserto e da neve; as manchas vêm de ruído suave ao longo de x
    const surface = (x, g, fw, dw, sw) => {
      const top = w.get('main', x, g), patch = pn(x * 0.045, 3.7), patch2 = pn(x * 0.11, 9.1);
      const snowy = sw > 0.04 && patch < sw * 1.1;
      if (snowy && top !== E.MAT.SAND) w.set('main', x, g, E.MAT.SNOW);
      else if (sw > 0.2 && sw < 0.95 && patch2 < sw * 0.32 && !w.solid(x - 1, g - 1) && !w.solid(x + 1, g - 1)) w.set('main', x, g, E.MAT.ICE);
      const soil = w.get('main', x, g);
      if (soil === E.MAT.DIRT || soil === E.MAT.MOSS) {
        // grama: cobertura cai aos poucos perto do deserto e da neve, e fica seca ou gelada
        if (fw > 0 && patch2 < 0.2 + fw * 0.95 - dw * 0.35 - sw * 0.5) {
          const tall = Math.max(1, Math.round((3 + n2(x * 0.05) * 8 + E.hash2(x, 1) * 3) * Math.min(1, 0.25 + fw * 0.9)));
          for (let k = 1; k <= tall; k++) {
            let c = E.matColor(E.MAT.GRASS, x, g - k).map((v) => Math.min(255, v * (0.75 + (k / tall) * 0.5)));
            c = tint(tint(c, DRY, dw * 1.6), FROST, sw * 1.5);
            w.set(k <= 2 && E.hash2(x, k) < 0.55 ? 'front' : 'main', x, g - k, E.MAT.GRASS, c);
          }
          if (soil === E.MAT.DIRT) w.set('main', x, g, E.MAT.MOSS);
          if (fw > 0.6 && E.hash2(x, 91) < 0.03 * fw) w.set('main', x, g - tall - 1, E.MAT.FLOWER);
        } else if (dw > 0.15 && E.hash2(x, 23) < 0.3) w.set('main', x, g - 1, E.MAT.GRASS, tint(E.matColor(E.MAT.GRASS, x, g - 1), DRY, 1));
      } else if (soil === E.MAT.SAND && fw > 0.08 && patch2 < fw * 0.7) {
        // tufos secos sobre a areia, mais raros longe da floresta
        for (let k = 1; k <= 1 + Math.round(fw * 2 * E.hash2(x, 5)); k++) w.set('main', x, g - k, E.MAT.GRASS, tint(E.matColor(E.MAT.GRASS, x, g - k), DRY, 0.85));
      } else if (soil === E.MAT.SNOW && fw > 0.1 && E.hash2(x, 33) < fw * 0.6) w.set('main', x, g - 1, E.MAT.GRASS, tint(E.matColor(E.MAT.GRASS, x, g - 1), FROST, 0.8));
      // arbustos resistentes à seca na faixa entre deserto e floresta
      if (dw > 0.12 && fw > 0.12 && E.hash2(x, 61) < 0.022) {
        const c = tint(E.matColor(E.MAT.BUSH, x, g), [120, 112, 55], dw * 1.3);
        for (let yy = -2; yy <= 0; yy++) for (let xx = -3 + Math.abs(yy); xx <= 3 - Math.abs(yy); xx++) if (!w.get('back', x + xx, g - 1 + yy)) w.set('back', x + xx, g - 1 + yy, E.MAT.BUSH, c);
      }
      // arbustos nevados perto da fronteira fria
      if (sw > 0.12 && fw > 0.12 && E.hash2(x, 67) < 0.02) for (let xx = -2; xx <= 2; xx++) {
          if (w.get('back', x + xx, g - 1)) continue;
          w.set('back', x + xx, g - 1, E.MAT.BUSH, tint(E.matColor(E.MAT.BUSH, x, g), FROST, 0.5));
          if (Math.abs(xx) < 2 && !w.get('back', x + xx, g - 2)) w.set('back', x + xx, g - 2, E.MAT.SNOW);
        }
    };
    for (let x = 0; x < W; x++) {
      if (inChunk(x)) continue;
      fillCol(x);
      const g = ground[x], m = mixAt(x, g);
      const wOf = (id) => (m.a === id ? 1 - m.t : 0) + (m.b === id ? m.t : 0);
      const sea = wOf('oceano') + wOf('oceano_gelado') + wOf('praia') > 0 && g > SEA;
      if (sea) for (let y = SEA; y < g; y++) w.set('main', x, y, E.MAT.WATER);
      if (wOf('oceano_gelado') > 0.5 && g > SEA && E.hash2(x, 3) < wOf('oceano_gelado')) w.set('main', x, SEA, E.MAT.ICE);
      if (sea) continue;
      surface(x, g, wOf('floresta') + wOf('floresta_grande') + wOf('castelo'), wOf('deserto'), wOf('neve'));
    }
    // a Floresta das Ruínas encaixada também recebe a transição com o deserto (antes: parede reta em OX)
    for (let x = OX; x < OX + 300; x++) {
      const g = ground[x];
      let wdTop = 0;
      for (let y = Math.max(0, g - 16); y < Math.min(HU, g + 70); y++) {
        const m = mixAt(x, y), wd = (m.a === 'deserto' ? 1 - m.t : 0) + (m.b === 'deserto' ? m.t : 0);
        if (y === g) wdTop = wd;
        if (wd <= 0 || blob(x, y) >= wd) continue;
        const d = y - g, cur = w.get('main', x, y);
        if (d < 0) continue;
        if (cur === E.MAT.DIRT || cur === E.MAT.MOSS) w.set('main', x, y, d < 14 ? E.MAT.SAND : E.MAT.SANDSTONE);
        else if (cur === E.MAT.STONE && d < 34) w.set('main', x, y, E.MAT.SANDSTONE);
        if (d > 1 && d < 40 && w.get('back', x, y) === E.MAT.ROCK) w.set('back', x, y, E.MAT.SANDSTONE);
      }
      // sobre a areia a grama some ou vira tufo seco; na terra ela vai secando
      const onSand = w.get('main', x, g) === E.MAT.SAND;
      for (let k = 1; k <= 14; k++)
        for (const L of ['main', 'front']) {
          const c = w.get(L, x, g - k);
          if (c !== E.MAT.GRASS && c !== E.MAT.FLOWER) continue;
          // grama rareia e encurta perto do deserto (em manchas), em vez de acabar numa linha
          const thin = pn(x * 0.11, 9.1) < wdTop * 1.5 ? 2 : 99;
          if ((onSand && (k > 2 || E.hash2(x, k + 40) < 0.6)) || k > thin || (wdTop > 0.3 && pn(x * 0.05, 4.4) < wdTop - 0.1)) w.set(L, x, g - k, 0);
          else if (wdTop > 0.05) {
            const i = w.idx(x, g - k) * 3, col = w[L + 'Col'];
            col.set(tint([col[i], col[i + 1], col[i + 2]], DRY, wdTop * 1.6), i);
          }
        }
      if (onSand && E.hash2(x, 23) < 0.25) w.set('main', x, g - 1, E.MAT.GRASS, tint(E.matColor(E.MAT.GRASS, x, g - 1), DRY, 0.9));
      if (wdTop > 0.12 && E.hash2(x, 61) < 0.02) for (let xx = -2; xx <= 2; xx++) if (!w.get('back', x + xx, g - 1)) w.set('back', x + xx, g - 1, E.MAT.BUSH, [118, 110, 56]);
    }
    // lago congelado
    for (let x = lake; x < lake + 90; x++) {
      const dep = Math.round(Math.sin(((x - lake) / 90) * Math.PI) * 12), top = ground[lake];
      for (let y = top - 6; y < top; y++) w.set('main', x, y, 0);
      for (let y = top; y < top + dep; y++) w.set('main', x, y, y === top ? E.MAT.ICE : E.MAT.WATER);
      ground[x] = top;
    }
    // cavernas subterrâneas: túneis longos + salões enormes
    // as paredes são deformadas por ruído suave (reentrâncias, nichos e tetos acidentados), não por chiado por célula
    const cn = vnoise2(seed + 909);
    // limites de teto e de fundo ondulados por coluna (pré-calculados): nenhum corte reto
    const capLo = new Int16Array(W), capHi = new Int16Array(W);
    for (let X = 0; X < W; X++) {
      capLo[X] = ground[X] + 13 + Math.round(cn(X * 0.05, 33.3) * 9);
      capHi[X] = HU - 6 - Math.round(cn(X * 0.04, 77.7) * 12);
    }
    const carveC = (cx, cy, rx, ry, rough = 1) => {
      for (let yy = -Math.ceil(ry * 1.3); yy <= ry * 1.3; yy++)
        for (let xx = -Math.ceil(rx * 1.3); xx <= rx * 1.3; xx++) {
          const X = Math.round(cx + xx), Y = Math.round(cy + yy);
          if (X < 2 || X >= W - 2 || Y >= capHi[X] || Y <= capLo[X] || !w.main[Y * W + X]) continue;
          const warp = (cn.one(X * 0.085, Y * 0.17) * 0.7 + cn.one(X * 0.2 + 9.3, Y * 0.4) * 0.3 - 0.5) * 0.6 * rough;
          if ((xx / rx) ** 2 + (yy / ry) ** 2 + warp >= 1) continue;
          w.set('main', X, Y, 0);
        }
    };
    const okUnder = (x) => !(x > OX - 60 && x < OX + chunk.W + 60) && !mixAt(Math.round(x)).a.startsWith('oceano');
    const tunnelPts = [];
    // minhoca: largura oscila entre passagens estreitas e trechos largos; às vezes ramifica
    const worm = (x, y, ang, steps, scale, depth) => {
      for (let s = 0; s < steps; s++) {
        ang += (rnd() - 0.5) * 0.5 + Math.sin(s * 0.07 + x * 0.01) * 0.04;
        x += Math.cos(ang) * 2;
        const gx = Math.round(Math.max(0, Math.min(W - 1, x)));
        y += Math.sin(ang) * 0.9;
        const lo = ground[gx] + 32, hi = HU - 26;
        if (y < lo) (y = lo + (lo - y)), (ang = -ang);
        if (y > hi) (y = hi - (y - hi)), (ang = -ang);
        if (!okUnder(x)) break;
        const wv = n2(s * 0.035 + depth * 7.3 + x * 0.001);
        // altura mínima de ~19 células: o herói (17) sempre passa, mesmo nos gargalos
        const r = (5 + wv * wv * 15) * scale;
        carveC(x, y, r * 1.5 + 3, Math.max(11, r * 0.7 + 4));
        if (s % 4 === 0) tunnelPts.push([x, y, r]);
        if (s % 60 === 30) {
          w.fillEllipse('main', x, y + Math.max(11, r * 0.7 + 4), 2.5, 1.5, E.MAT.CRYSTAL);
          w.lights.push(Object.assign({ x, y: y + r * 0.7, type: 'cristal' }, E.LIGHTS.cristal));
        }
        if (depth < 2 && s > 20 && rnd() < 0.012) worm(x, y, ang + (rnd() < 0.5 ? 1 : -1) * (0.7 + rnd() * 0.8), 50 + rnd() * 90, scale * 0.7, depth + 1);
      }
    };
    for (let k = 0; k < 46; k++) {
      const x = 60 + rnd() * (W - 120), y = SEA + 45 + rnd() * (HU - SEA - 75);
      if (okUnder(x)) worm(x, Math.max(y, ground[Math.round(x)] + 36), rnd() * 6.28, 260, 1, 0);
    }
    // fendas verticais e abismos ligando níveis do subsolo
    for (let k = 0; k < 28 && tunnelPts.length; k++) {
      let [x, y] = tunnelPts[Math.floor(rnd() * tunnelPts.length)];
      const len = 25 + rnd() * 70, wd = 2.5 + rnd() * 4, dir = rnd() < 0.3 ? -1 : 1;
      for (let s = 0; s < len; s++) {
        x += (n3(s * 0.15 + k * 5) - 0.5) * 1.2;
        y += dir;
        if (y < ground[Math.round(x)] + 20 || y > HU - 10 || !okUnder(x)) break;
        carveC(x, y, wd * (0.6 + 0.6 * n1(s * 0.2 + k)), 1.6, 0.4);
      }
    }
    const halls = [];
    // salão: vários bolsões sobrepostos de tamanhos diferentes, nunca uma elipse única
    const hall = (x, y, rx, ry) => {
      carveC(x, y, rx, ry, 1.8);
      const lobes = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < lobes; i++) {
        const a = rnd() * 6.28, d = 0.45 + rnd() * 0.4;
        carveC(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d * 0.8, rx * (0.25 + rnd() * 0.35), Math.max(10, ry * (0.35 + rnd() * 0.45)), 1.5);
      }
      halls.push({ x, y, rx, ry });
    };
    for (let k = 0; k < 34; k++) {
      const x = 90 + rnd() * (W - 180), y = SEA + 62 + rnd() * (HU - SEA - 100);
      if (!okUnder(x)) continue;
      hall(x, y, 30 + rnd() * 70, 13 + rnd() * 18);
    }
    // poços de mina levam do chão aos salões
    for (const sx of SHAFTS) {
      const end = E.Struct.mineShaft(w, sx, ground[sx], 44);
      hall(end.x - 10, end.y - 14, 70, 18);
    }
    // 3b) acabamento das cavernas: formações, poças, minérios e paredes que acompanham o bioma de cima
    const air = (x, y) => w.get('main', x, y) === 0 && !w.col[w.idx(x, y)];
    const freeDown = (x, y) => {
      let k = 0;
      while (k < 40 && air(x, y + k)) k++;
      return k;
    };
    const freeUp = (x, y) => {
      let k = 0;
      while (k < 40 && air(x, y - k)) k++;
      return k;
    };
    // pilares: colunas que descem do teto dos salões altos e estalagmites embaixo (sempre sobra vão para o herói)
    for (const h of halls) {
      for (let i = 0, np = 1 + Math.floor(rnd() * (h.rx / 30)); i < np; i++) {
        const px = Math.round(h.x + (rnd() - 0.5) * h.rx * 1.3);
        let top = Math.round(h.y), bot = top;
        if (!air(px, top)) continue;
        while (top > 0 && air(px, top - 1)) top--;
        while (bot < HU - 2 && air(px, bot + 1)) bot++;
        if (bot - top < 34) continue;
        const end = bot - 21;
        for (let y = top; y <= end; y++) {
          const t = (y - top) / Math.max(1, end - top), wd = 1 + (1 - t) * 3.5 + (cn(px * 0.3, y * 0.25) - 0.5) * 2.2;
          for (let xx = -Math.round(wd); xx <= Math.round(wd); xx++) if (air(px + xx, y)) w.set('main', px + xx, y, E.MAT.STONE);
        }
        for (let y = bot; y > bot - 3; y--) for (let xx = -(bot - y + 1); xx <= bot - y + 1; xx++) if (air(px + xx, y) && freeUp(px + xx, y) > 20) w.set('main', px + xx, y, E.MAT.STONE);
      }
    }
    // poças nos fundos dos salões: só enche trechos com parede dos dois lados e chão por baixo
    const pool = (x0, x1, yTop, yBot, mat) => {
      let filled = 0;
      for (let y = yBot; y >= yTop; y--)
        for (let x = x0; x <= x1; ) {
          if (!air(x, y)) {
            x++;
            continue;
          }
          let e = x, ok = w.solid(x - 1, y);
          while (e <= x1 + 40 && air(e, y)) {
            const below = w.get('main', e, y + 1);
            if (!(w.solid(e, y + 1) || below === E.MAT.WATER || below === E.MAT.LAVA)) ok = false;
            e++;
          }
          if (ok && w.solid(e, y) && e - x < 140) for (let i = x; i < e; i++) w.set('main', i, y, mat), filled++;
          x = e + 1;
        }
      return filled;
    };
    halls.forEach((h, k) => {
      const m = mixAt(Math.round(h.x), Math.round(h.y)), wOf = (id) => (m.a === id ? 1 - m.t : 0) + (m.b === id ? m.t : 0);
      if (rnd() < 0.35 + wOf('deserto') * 0.5) return;
      const lava = h.y > 245 && wOf('neve') < 0.3 && rnd() < 0.4;
      const yTop = Math.round(h.y + h.ry * (0.35 + rnd() * 0.25));
      const n = pool(Math.round(h.x - h.rx * 1.3), Math.round(h.x + h.rx * 1.3), yTop, Math.round(h.y + h.ry * 1.4), lava ? E.MAT.LAVA : E.MAT.WATER);
      if (n && lava) for (let x = Math.round(h.x - h.rx); x < h.x + h.rx; x += 24) if (w.get('main', x, yTop) === E.MAT.LAVA) w.lights.push(Object.assign({ x, y: yTop - 1, type: 'lava', embers: true }, E.LIGHTS.lava));
      if (n && !lava && wOf('neve') > 0.5) for (let x = Math.round(h.x - h.rx * 1.3); x < h.x + h.rx * 1.3; x++) for (let y = yTop; y < yTop + 30; y++) if (w.get('main', x, y) === E.MAT.WATER) {
        if (!w.get('main', x, y - 1)) w.set('main', x, y, E.MAT.ICE);
        break;
      }
    });
    for (let k = 0; k < tunnelPts.length; k += 23) {
      const [x, y, r] = tunnelPts[k];
      if (rnd() < 0.5) pool(Math.round(x - 25), Math.round(x + 25), Math.round(y + 4), Math.round(y + r + 14), E.MAT.WATER);
    }
    // varredura do subsolo: espeleotemas, veios de ferro e cristal, e paredes no tom do bioma de cima
    const ore = vnoise2(seed + 1234), gem = vnoise2(seed + 4321);
    for (let x = 3; x < W - 3; x++) {
      for (let y = ground[x] + 14; y < HU - 3; y++) {
        const m0 = w.get('main', x, y);
        if (m0 === E.MAT.STONE || m0 === E.MAT.MOSS) {
          const dep = (y - SEA) / (HU - SEA);
          if (ore(x * 0.075, y * 0.15) > 0.84 - dep * 0.05) {
            w.set('main', x, y, E.MAT.IRON);
            continue;
          }
          if (gem(x * 0.2, y * 0.4) > 0.9 - dep * 0.04 && (air(x, y - 1) || air(x, y + 1) || air(x - 1, y) || air(x + 1, y))) {
            w.set('main', x, y, E.MAT.CRYSTAL);
            continue;
          }
        }
        if (!w.solid(x, y)) continue;
        const up = air(x, y - 1), down = air(x, y + 1), side = air(x - 1, y) || air(x + 1, y);
        if (!up && !down && !side) continue;
        const m = mixAt(x, y), wOf = (id) => (m.a === id ? 1 - m.t : 0) + (m.b === id ? m.t : 0);
        const sw = wOf('neve') + wOf('oceano_gelado') * 0.5, dw = wOf('deserto'), ow = wOf('oceano') + wOf('praia') + wOf('oceano_gelado') * 0.5;
        const fw = wOf('floresta'), gw = wOf('floresta_grande'), cw = wOf('castelo'), ew = fw + gw + cw;
        const b = blob(x, y), cur = w.get('main', x, y);
        const rock = cur === E.MAT.STONE || cur === E.MAT.MOSS || cur === E.MAT.DIRT || cur === E.MAT.SANDSTONE || cur === E.MAT.SAND;
        // paredes com a cara do bioma de cima (forte no interior, misturada nas fronteiras):
        // gelo e neve no frio, arenito e areia no deserto e na costa, terra e musgo sob as florestas,
        // alvenaria de ruínas enterradas sob o castelo
        if (rock) {
          if (sw > 0.05 && b < sw * 0.85) w.set('main', x, y, up && b < sw * 0.5 ? E.MAT.SNOW : E.MAT.ICE);
          else if (dw > 0.05 && b < dw * 0.95) w.set('main', x, y, up && b < dw * 0.45 ? E.MAT.SAND : E.MAT.SANDSTONE);
          else if (ow > 0.05 && b < ow * 0.9) w.set('main', x, y, up ? E.MAT.SAND : E.MAT.SANDSTONE);
          else if (cw > 0.05 && blob(x * 0.5 + 300, y * 0.5) < cw * 0.42) w.set('main', x, y, E.MAT.MASONRY, [150, 150, 165].map((v) => Math.round(v * (0.8 + E.hash2(x >> 2, y >> 1) * 0.3))));
          else if (fw + gw > 0.05 && b < (fw + gw) * 0.8) w.set('main', x, y, up || b < (fw + gw) * 0.3 ? E.MAT.MOSS : E.MAT.DIRT);
        }
        if (down) {
          // teto: estalactites (gelo no frio), raízes e cipós sob as florestas, raízes gigantes sob a Floresta Grande,
          // correntes nas ruínas do castelo
          const h = E.hash2(x, y + 77);
          if (h < 0.05 + sw * 0.06) {
            const L = 1 + Math.floor(E.hash2(x, y + 3) * (sw > 0.4 ? 6 : 4));
            if (freeDown(x, y + 1) > L + 20) {
              const top = w.get('main', x, y);
              const mat = sw > 0.4 && E.hash2(x, y) < sw ? E.MAT.ICE : top === E.MAT.SANDSTONE || top === E.MAT.SAND ? E.MAT.SANDSTONE : E.MAT.STONE;
              for (let k = 1; k <= L; k++) w.set('main', x, y + k, mat);
              y += L; // não reprocessa a própria estalactite
              continue;
            }
          } else if (gw > 0.3 && h < 0.05 + gw * 0.025) {
            const L = 6 + Math.floor(E.hash2(x, y + 9) * 16);
            for (let k = 1; k <= L && air(x, y + k); k++) for (let j = 0; j < 2 + (k < L / 2 ? 1 : 0); j++) w.set('back', x + j, y + k, E.MAT.BARK);
          } else if (ew > 0.1 && h < 0.05 + (fw + gw) * 0.1) {
            const L = 2 + Math.floor(E.hash2(x, y + 9) * 10 * (fw + gw));
            for (let k = 1; k <= L && air(x, y + k); k++) w.set('back', x, y + k, E.hash2(x, k) < 0.3 ? E.MAT.BARK : E.MAT.VINE);
          } else if (cw > 0.3 && h < 0.05 + cw * 0.008) for (let k = 1; k <= 4 + Math.floor(E.hash2(x, y + 2) * 8) && air(x, y + k); k++) w.set('back', x, y + k, E.MAT.IRON);
        }
        if (up) {
          const h2 = E.hash2(x, y + 51);
          if (h2 < 0.035 && freeUp(x, y - 1) > 24) {
            // estalagmites baixas (dá para pular por cima)
            const L = 1 + Math.floor(E.hash2(x, y + 5) * 3), top = w.get('main', x, y);
            for (let k = 1; k <= L; k++) w.set('main', x, y - k, sw > 0.4 ? E.MAT.ICE : top === E.MAT.SANDSTONE || top === E.MAT.SAND ? E.MAT.SANDSTONE : E.MAT.STONE);
          } else if (h2 > 0.996 - (fw + gw) * 0.004 && freeUp(x, y - 1) > 10) E.Struct.mushrooms(w, x, y, rnd);
          else if (dw > 0.4 && h2 > 0.993 && air(x, y - 1)) {
            // ossos e fósseis na areia do deserto
            for (const [dx, dy] of [[0, -1], [1, -1], [2, -1], [-1, -1], [1, -2]]) if (air(x + dx, y + dy)) w.set('back', x + dx, y + dy, E.MAT.INK, [225, 215, 190]);
          } else if (ow > 0.4 && h2 > 0.985 && air(x, y - 1)) for (let k = 1; k <= 1 + Math.floor(E.hash2(x, y) * 3); k++) w.set('back', x, y - k, E.MAT.CORAL);
          else if (cw > 0.4 && h2 > 0.993 && air(x, y - 1)) w.fillRect('main', x, y - 2, 3, 2, E.MAT.MASONRY);
        }
      }
    }
    // 4) vegetação e construções
    const wAt = (x, id) => {
      const m = mixAt(x);
      return (m.a === id ? 1 - m.t : 0) + (m.b === id ? m.t : 0);
    };
    for (let x = 20; x < 800; x += 6 + Math.floor(rnd() * 10)) {
      if (ground[x] <= SEA + 2) continue;
      const L = 3 + Math.floor(rnd() * 9);
      for (let k = 1; k <= L; k++) w.set('back', x + Math.round(Math.sin(k * 0.8) * 0.6), ground[x] - k, E.MAT.VINE);
      if (rnd() < 0.3) w.fillEllipse('back', x + 3, ground[x] - 1, 2, 1.2, E.MAT.CORAL, 0.5, x);
    }
    for (let x = 8920; x < 9490; x += 8 + Math.floor(rnd() * 10)) if (ground[x] > SEA + 2) for (let k = 1; k <= 2 + Math.floor(rnd() * 5); k++) w.set('back', x, ground[x] - k, E.MAT.VINE);
    E.Struct.shipwreck(w, 260, ground[260], rnd);
    E.Struct.shipwreck(w, 9250, ground[9250], rnd);
    for (let x = 640; x < 900; x += 22 + Math.floor(rnd() * 25)) if (ground[x] <= SEA && !nearV(x) && rnd() < 0.5 + wAt(x, 'praia')) E.Struct.palm(w, x, ground[x], rnd);
    for (let x = 840; x < 3000; x += 16 + Math.floor(rnd() * 28)) {
      if (Math.abs(x - pyrX) < 110 || inChunk(x) || nearV(x)) continue;
      const dw = wAt(x, 'deserto');
      if (rnd() < dw * 1.1) E.Struct.cactus(w, x, ground[x], rnd);
      else if (rnd() < (1 - dw) * 0.5) E.Struct.tree(w, x, ground[x], rnd, 0.8);
    }
    for (let x = pyrX - 90; x < pyrX + 90; x++)
      for (let y = 0; y < ground[x]; y++) {
        const m0 = w.get('main', x, y);
        if (m0 === E.MAT.SAND || m0 === E.MAT.SANDSTONE || m0 === E.MAT.GRASS) w.set('main', x, y, 0);
      }
    E.Struct.pyramid(w, pyrX, ground[pyrX], rnd);
    for (let x = 3920; x < 5990; x += 46 + Math.floor(rnd() * 30)) {
      if (inChunk(x) || nearV(x)) continue;
      const gw = wAt(x, 'floresta_grande');
      if (gw > 0.55) E.Struct.giantTree(w, x, ground[x], rnd);
      else E.Struct.tree(w, x, ground[x], rnd, 1 + gw);
    }
    for (let x = 6000; x < 6110; x += 40) E.Struct.tree(w, x, ground[x], rnd, 1.2);
    E.Struct.castle(w, castleX, ground[castleX], rnd);
    for (const [kx, snowy] of KEEPS) {
      for (let x = kx - 50; x < kx + 50; x++) ground[x] = Math.round(ground[x] * 0.3 + ground[kx] * 0.7);
      E.Struct.ruinedKeep(w, kx, ground[kx], rnd, snowy);
    }
    for (let x = 6520; x < 8900; x += 14 + Math.floor(rnd() * 20) + (wAt(x, 'neve') < 0.85 ? 16 : 0)) {
      if ((x > lake - 10 && x < lake + 100) || nearV(x)) continue;
      const sw = wAt(x, 'neve');
      if (sw > 0.5 || rnd() < sw * 1.6) E.Struct.snowPine(w, x, ground[x], rnd);
      else if (rnd() < 0.5) E.Struct.tree(w, x, ground[x], rnd, 0.9);
    }
    for (const v of VILLAGES) E.Struct.village(w, v.x, ground[v.x], rnd, v.kind, ground);
    // masmorras no subsolo profundo do mesmo mapa: entrada detalhada na superfície e uma descida até elas
    const DUNGEONS = { catacumbas: [11, 'areia'], caverna: [7, 'pedra'], covil: [17, 'fungo'], gruta_gelada: [13, 'gelo'] };
    w.entities = w.entities.filter((e) => !(e.prefab === 'porta' && e.props && DUNGEONS[e.props.destino]));
    w.dungeons = [];
    const embed = (id, sx, sy, flip) => {
      const [seed, theme] = DUNGEONS[id];
      const c = E.generateLostDungeon(seed, { theme, W: 1150, H: H - HU - 12 });
      // a descida cai exatamente na coluna de entrada da masmorra (chão garantido em exitDoor.y)
      const ex = c.exitDoor.x - 2, oy = HU + 4, lx = flip ? c.W - 1 - ex : ex, ox = sx - lx;
      for (let y = 0; y < c.H; y++)
        for (let x = 0; x < c.W; x++) {
          const X = ox + (flip ? c.W - 1 - x : x), Y = oy + y;
          if (X < 0 || X >= W) continue;
          const si = y * c.W + x, di = Y * W + X;
          if (c.mask && !c.mask[si]) continue;
          for (const L of LK) {
            w[L][di] = flip ? E.artMirror(c[L][si]) : c[L][si];
            w[L + 'Col'].set(c[L + 'Col'].subarray(si * 3, si * 3 + 3), di * 3);
          }
          w.col[di] = c.col[si];
        }
      const fx = (x, wd = 0) => ox + (flip ? c.W - x - wd : x);
      for (const l of c.lights) w.lights.push(Object.assign({}, l, { x: fx(l.x), y: l.y + oy }));
      for (const e of c.entities) {
        if (e.id === 'saida') continue;
        w.entities.push(Object.assign(JSON.parse(JSON.stringify(e)), { id: e.id === 'chefe' ? 'chefe_' + id : id + '_' + e.id, x: fx(e.x, 1), y: e.y + oy, facing: (e.facing || 1) * (flip ? -1 : 1) }));
      }
      for (const s of c.spawners) w.spawners.push(Object.assign({}, s, { id: id + '_' + s.id, x: fx(s.x, s.w), y: s.y + oy }));
      for (const t of c.triggers) w.triggers.push(Object.assign({}, t, { id: id + '_' + t.id, x: fx(t.x, t.w), y: t.y + oy }));
      // a descida termina no chão do corredor de entrada da masmorra
      const fy = c.exitDoor.y + oy;
      E.Struct.descent(w, sx, sy, fy, theme, rnd);
      const TH = E.CAVE_THEMES[theme];
      w.triggers.push({ id: 'desce_' + id, x: sx - 12, y: sy - 4, w: 24, h: 14, once: true, script: `function onEnter(api) { api.message('Uma escada desce na escuridão até o ${c.name}...', 3.5); }` });
      w.dungeons.push({ id, name: c.name, theme, amb: TH.amb, x0: ox, x1: ox + c.W, y0: oy, y1: oy + c.H, gate: { x: sx, y: sy } });
    };
    // Caverna Profunda: pelo poço de mina da Floresta das Ruínas
    if (w.mineDoor) {
      // boca da mina: trilhos, carrinho com minério e placa
      const mx = w.mineDoor.x + 29, gy = w.mineDoor.y - 32;
      for (let k = -30; k < 26; k++) if (!w.solid(mx + k, gy - 1)) w.set('back', mx + k, gy - 1, E.MAT.IRON);
      w.fillRect('back', mx + 9, gy - 5, 8, 3, E.MAT.IRON);
      w.fillRect('back', mx + 10, gy - 6, 6, 1, E.MAT.STONE);
      w.set('back', mx + 12, gy - 7, E.MAT.CRYSTAL), w.set('back', mx + 14, gy - 6, E.MAT.GOLD);
      w.fillRect('back', mx - 16, gy - 9, 1, 9, E.MAT.WOOD);
      w.fillRect('back', mx - 21, gy - 11, 11, 3, E.MAT.PLANK);
      w.triggers.push({ id: 'placaMina', x: mx - 24, y: gy - 20, w: 16, h: 20, once: true, script: "function onEnter(api) { api.message('Placa: Mina abandonada. A escada desce até a Caverna Profunda.', 4); }" });
      embed('caverna', w.mineDoor.x, w.mineDoor.y - 20, false);
    }
    for (const c of CAVES) {
      const gy = ground[c.x];
      const end = E.Struct.caveEntrance(w, c.x, gy, rnd, 70, DUNGEONS[c.dest][1]);
      E.Struct.dungeonGate(w, c.x, gy, DUNGEONS[c.dest][1], rnd);
      const dx = end.x + 30;
      let dy = end.y - 12;
      while (dy < HU - 2 && !w.solid(dx, dy + 1)) dy++;
      embed(c.dest, dx, dy - 18, c.dest === 'gruta_gelada');
      E.Struct.torch(w, dx - 14, dy - 4);
      E.Struct.torch(w, dx + 13, dy - 4);
    }
    // 5) vida por bioma (superfície e subsolo)
    const sp = (prefab, x, interval, max, extra = {}) => w.spawners.push(Object.assign({ id: 'spW' + prefab + Math.round(x), prefab, x: x - 20, y: ground[x] - 16, w: 40, h: 16, interval, max, initial: Math.min(2, max), range: 150, active: true }, extra));
    for (let x = 900; x < 2850; x += 150) if (Math.abs(x - pyrX) > 110 && !nearV(x)) sp('escorpiao', x, 14, 2);
    for (const sx of [4000, 4450, 5050, 5650]) if (!nearV(sx)) sp('slime', sx, 15, 2, { initial: 1 });
    for (let x = 3960; x < 5960; x += 130) if (!nearV(x)) sp(rnd() < 0.6 ? 'aranha' : 'slime', x, 13, 3);
    sp('morcego', 5000, 12, 3, { y: ground[5000] - 60, h: 30, period: 'noite' });
    sp('aranha', 5600, 16, 4, { period: 'noite' });
    for (let x = 6650; x < 8850; x += 120) if (Math.abs(x - lake - 45) > 70 && !nearV(x)) sp('slime_gelo', x, 14, 3);
    sp('morcego', 8000, 14, 2, { y: ground[8000] - 50, h: 30 });
    const under = { deserto: ['escorpiao', 'esqueleto', 'morcego'], praia: ['escorpiao', 'morcego'], floresta: ['aranha', 'esqueleto_guerreiro', 'morcego', 'slime'], floresta_grande: ['aranha', 'esqueleto_guerreiro', 'morcego', 'slime', 'espirito'], castelo: ['esqueleto_guerreiro', 'esqueleto', 'espirito'], neve: ['slime_gelo', 'esqueleto', 'morcego'] };
    const treasure = [['moeda', 'moeda', 'pocao'], ['lingote_ferro', 'pocao', 'bomba'], ['gema_rubi', 'moeda'], ['gema_safira', 'regen'], ['cristal_luz', 'pocao_grande'], ['faca_arremesso', 'faca_arremesso', 'antidoto'], ['lingote_ferro', 'lingote_ferro', 'moeda'], ['cogumelo_brilho', 'elixir']];
    halls.forEach((h, k) => {
      const kinds = under[mixAt(Math.round(h.x)).a] || ['aranha', 'morcego'];
      let kind = kinds[k % kinds.length];
      if (kind === 'espirito' && VILLAGES.some((v) => Math.abs(v.x - h.x) < 260)) kind = 'morcego';
      w.spawners.push({ id: 'spH' + k, prefab: kind, x: Math.round(h.x - h.rx * 0.6), y: Math.round(h.y - h.ry * 0.5), w: Math.round(h.rx * 1.2), h: Math.round(h.ry), interval: 16, max: kind === 'espirito' ? 1 : 3, initial: 1, range: 140, active: true });
      let fy = Math.round(h.y);
      while (fy < HU - 2 && !w.solid(Math.round(h.x), fy + 1)) fy++;
      if (k % 3 === 0 && fy < HU - 3) w.entities.push({ id: 'bauH' + k, prefab: 'bau', x: Math.round(h.x), y: fy + 1, facing: 1, props: { loot: treasure[k % treasure.length] } });
      // decoração do salão conforme o bioma de cima
      const hb = mixAt(Math.round(h.x), Math.round(h.y)).a, hx = Math.round(h.x + h.rx * 0.4);
      let hfy = Math.round(h.y);
      while (hfy < HU - 2 && !w.solid(hx, hfy + 1)) hfy++;
      if (hb === 'floresta' || hb === 'floresta_grande') {
        E.Struct.mushrooms(w, Math.round(h.x - h.rx * 0.3), fy + 1, rnd);
        E.Struct.mushrooms(w, hx, hfy + 1, rnd);
        if (hb === 'floresta_grande') {
          // cogumelo gigante brilhante
          const gx = Math.round(h.x - h.rx * 0.6);
          let gfy = Math.round(h.y);
          while (gfy < HU - 2 && !w.solid(gx, gfy + 1)) gfy++;
          for (let y = gfy - 14; y <= gfy; y++) w.set('back', gx, y, E.MAT.BARK), w.set('back', gx + 1, y, E.MAT.BARK);
          w.fillEllipse('back', gx, gfy - 14, 8, 2.6, E.MAT.MUSHROOM, 0.3, gx);
          w.lights.push({ x: gx, y: gfy - 12, type: 'cogumelo', c: [0.45, 1, 0.75], r: 26, i: 0.85, flicker: 0.05, pulse: true });
        }
      } else if (hb === 'castelo') {
        // colunas de ruína enterrada e uma tocha
        for (const cx of [Math.round(h.x - h.rx * 0.5), Math.round(h.x + h.rx * 0.5)]) {
          let t = Math.round(h.y), bt = t;
          while (t > 2 && !w.solid(cx, t - 1)) t--;
          while (bt < HU - 2 && !w.solid(cx, bt + 1)) bt++;
          for (let y = t; y <= bt; y++) if (E.hash2(cx, y >> 2) > 0.2) for (let j = 0; j < 3; j++) w.set('back', cx + j, y, E.MAT.MASONRY);
        }
        E.Struct.torch(w, hx, hfy - 3);
      } else if (hb === 'oceano' || hb === 'praia' || hb === 'oceano_gelado') {
        for (let i = 0; i < 4; i++) w.fillEllipse('back', hx - 8 + i * 5, hfy - 1, 1.6, 2 + E.hash2(hx, i) * 2, E.MAT.CORAL, 0.5, hx + i);
        w.lights.push({ x: hx, y: hfy - 3, type: 'coral', c: [1, 0.5, 0.6], r: 16, i: 0.5, flicker: 0.05, pulse: true });
      } else {
        // deserto e neve: cristais (gelo azul na neve, âmbar no deserto)
        w.fillEllipse('main', hx, hfy + 1, 3, 1.5, E.MAT.CRYSTAL);
        const amber = hb === 'deserto';
        if (amber) for (let yy = -2; yy <= 2; yy++) for (let xx = -3; xx <= 3; xx++) if (w.get('main', hx + xx, hfy + 1 + yy) === E.MAT.CRYSTAL) w.set('main', hx + xx, hfy + 1 + yy, E.MAT.CRYSTAL, [255, 190, 90]);
        w.lights.push(Object.assign({ x: hx, y: hfy - 2, type: 'cristal' }, E.LIGHTS.cristal, amber ? { c: [1, 0.72, 0.35] } : {}));
      }
    });
    for (const x of [700, 1650, 2130 - 40, 4150, 5300, 5850, 6750, 8250, 8800]) w.entities.push({ id: 'fogoW' + x, prefab: 'fogueira', x, y: ground[x], facing: 1, props: {} });
    w.entities.push({ id: 'merc' + (OX + 75), prefab: 'mercador', x: OX + 75, y: ground[OX + 75], facing: -1, props: { stock: ['pocao', 'pao', 'maca', 'antidoto', 'tocha_mao', 'faca_arremesso', 'lanca', 'machado', 'botas_couro', 'capa_floresta'] } });
    for (let x = 60; x < W - 60; x += 70 + Math.floor(rnd() * 60)) {
      if (inChunk(x) || nearV(x)) continue;
      const y = ground[x] - 1;
      if (w.cellType(x, y) !== E.CT.NONE) continue;
      w.entities.push({ id: 'itW' + x, prefab: '__item', x, y, props: { item: rnd() < 0.7 ? 'moeda' : ['pocao', 'regen', 'maca', 'pao', 'faca_arremesso'][Math.floor(rnd() * 5)], qty: 1 + Math.floor(rnd() * 3) } });
    }
    // decoração dos biomas e do subsolo (objetos ASCII de arquitetura.js/biomas.js)
    const decoMix = (x) => mixAt(x, ground[Math.max(0, Math.min(W - 1, x))]);
    const decoSkip = (x) => inChunk(x) || nearV(x) || Math.abs(x - pyrX) < 100 || (x > castleX - 40 && x < castleX + 340);
    E.Deco.surface(w, { ground, mix: decoMix, skip: decoSkip, rnd });
    E.Deco.underground(w, { ground, HU, mix: decoMix, skip: inChunk, rnd });
    w.ground = ground;
    w.computeSurface();
    w.id = 'fase1';
    w.name = 'Floresta das Ruínas';
    return w;
  };

  // ---------- masmorras (cavernas com chefe) ----------
  E.CAVE_THEMES = {
    pedra: { name: 'Caverna Profunda', wall: 'STONE', acc: 'MOSS', accK: 0.12, liquid: 'lava', boss: 'rainha_aranha', mobs: ['esqueleto_guerreiro', 'aranha', 'esqueleto', 'morcego', 'aranha', 'espirito'], amb: [1, 1, 1],
      loot: [['bomba', 'bomba', 'pocao', 'cristal_luz'], ['peitoral_ferro', 'chave', 'martelo_guerra'], ['regen', 'elixir', 'cogumelo_brilho', 'capa_sombria'], ['pocao', 'moeda', 'gema_rubi', 'cajado_arcano'], ['lingote_ferro', 'lingote_ferro', 'pocao_grande']] },
    areia: { name: 'Catacumbas', wall: 'SANDSTONE', acc: 'MASONRY', accK: 0.3, liquid: null, boss: 'rei_esqueleto', mobs: ['esqueleto', 'esqueleto_guerreiro', 'escorpiao', 'morcego', 'esqueleto_guerreiro', 'espirito'], amb: [1.15, 0.95, 0.75],
      loot: [['gema_rubi', 'moeda', 'moeda', 'pocao'], ['adaga_veneno', 'antidoto', 'faca_arremesso'], ['elmo_ouro', 'lingote_ferro'], ['pocao_grande', 'bomba', 'bomba'], ['arco_curto', 'elixir']] },
    gelo: { name: 'Gruta Gelada', wall: 'STONE', acc: 'ICE', accK: 0.22, liquid: 'agua', boss: 'golem_gelo', mobs: ['slime_gelo', 'esqueleto', 'morcego', 'slime_gelo', 'espirito'], amb: [0.8, 0.95, 1.25],
      loot: [['gema_safira', 'pocao_grande'], ['capa_gelida', 'bomba_gelo', 'bomba_gelo'], ['espada_gelo', 'lingote_ferro'], ['cristal_luz', 'carne_assada'], ['peitoral_ouro', 'pocao']] },
    fungo: { name: 'Covil Fúngico', wall: 'STONE', acc: 'MOSS', accK: 0.4, liquid: 'agua', boss: 'slime_rei', mobs: ['slime', 'aranha', 'morcego', 'slime', 'esqueleto'], amb: [0.85, 1.2, 0.9],
      loot: [['cogumelo_brilho', 'cogumelo_brilho', 'regen'], ['capa_floresta', 'pocao_grande'], ['botas_aladas', 'gosma'], ['bomba', 'bomba', 'antidoto'], ['lingote_ferro', 'lingote_ferro', 'pocao']] },
  };
  E.generateCave = (seed = 7, o = {}) => {
    const theme = o.theme || 'pedra', TH = E.CAVE_THEMES[theme];
    const W = o.W || 1500, H = o.H || 320;
    const w = new E.World(W, H);
    w.name = TH.name;
    const rnd = E.rng(seed);
    const n1 = vnoise(seed + 3);
    const WALL = E.MAT[TH.wall], ACC = E.MAT[TH.acc];
    const cnD = vnoise2(seed + 808), pat = (x, y) => Math.max(0, Math.min(1, 0.5 + (cnD(x * 0.07 + 300, y * 0.14) - 0.5) * 1.7));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        w.set('main', x, y, pat(x, y) < TH.accK ? ACC : WALL);
        w.set('back', x, y, theme === 'areia' && pat(x * 0.6 + 900, y * 0.6) < 0.5 ? E.MAT.SANDSTONE : E.MAT.ROCK);
      }
    const carve = (cx, cy, rx, ry) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (!w.main[y * W + x]) continue;
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (cnD(x * 0.08, y * 0.16) - 0.5) * 0.6 + (E.hash2(x, y) - 0.5) * 0.08;
          if (d < 1 && y > 2 && y < H - 3 && x > 2 && x < W - 3) w.set('main', x, y, 0);
        }
    };
    // salão do chefe no fim
    const AX = W - 125;
    // corredor principal ondulado até o salão
    let y = H * 0.45;
    const path = [];
    for (let x = 6; x < AX; x += 2) {
      y += (n1(x * 0.02) - 0.5) * 2.2;
      y = Math.max(50, Math.min(H - 70, y));
      carve(x, y, 15, 15 + n1(x * 0.05) * 10);
      path.push([x, Math.round(y)]);
    }
    const AY = Math.round(y), FY = AY + 22;
    carve(AX, AY, 110, 36);
    for (let x = AX - 112; x <= AX + 112; x++) for (let yy = FY; yy < FY + 14; yy++) w.set('main', x, yy, theme === 'areia' ? E.MAT.MASONRY : WALL);
    const rooms = [];
    for (let k = 0; k < 16; k++) {
      const rx = 80 + rnd() * (W - 360), ry = 45 + rnd() * (H - 100);
      const sx = 45 + rnd() * 50, sy = 18 + rnd() * 15;
      if (theme === 'areia' && k % 2 === 0) {
        // cripta retangular com paredes de alvenaria
        for (let yy = Math.round(ry - sy - 2); yy <= ry + sy + 2; yy++)
          for (let xx = Math.round(rx - sx - 2); xx <= rx + sx + 2; xx++) {
            const inside = Math.abs(xx - rx) <= sx && Math.abs(yy - ry) <= sy;
            if (yy > 2 && yy < H - 3 && xx > 2 && xx < W - 3) {
              if (inside) w.set('main', xx, yy, 0);
              else if (w.get('main', xx, yy)) w.set('main', xx, yy, E.MAT.MASONRY);
              w.set('back', xx, yy, E.MAT.MASONRY);
            }
          }
        for (let xx = Math.round(rx - sx); xx <= rx + sx; xx += 14) E.Struct.torch(w, xx, Math.round(ry + sy - 5));
      } else carve(rx, ry, sx, sy);
      rooms.push({ x: rx, y: ry, sx, sy });
    }
    for (let k = 0; k < 10; k++) {
      let x = 40 + rnd() * (W - 300), yy = 30 + rnd() * (H - 60), ang = rnd() * 6.28;
      for (let s = 0; s < 150; s++) {
        ang += (rnd() - 0.5) * 0.45;
        x = Math.max(10, Math.min(AX - 120, x + Math.cos(ang) * 1.8));
        yy += Math.sin(ang) * 0.6;
        carve(x, yy, 12, 14);
      }
    }
    // estalactites (gelo: pingentes)
    for (let x = 4; x < W - 4; x++)
      for (let yy = 4; yy < H - 4; yy++)
        if (w.solid(x, yy) && !w.solid(x, yy + 1) && E.hash2(x, yy) < 0.06) {
          const L = 1 + Math.floor(E.hash2(x, yy + 9) * (theme === 'gelo' ? 7 : 5));
          for (let k = 1; k <= L; k++) if (!w.solid(x, yy + k + 1)) w.set('main', x, yy + k, theme === 'gelo' ? E.MAT.ICE : WALL);
        }
    const floors = [];
    for (let x = 4; x < W - 4; x += 3)
      for (let yy = 4; yy < H - 4; yy++) if (!w.solid(x, yy) && !w.solid(x, yy - 1) && w.solid(x, yy + 1)) floors.push({ x, y: yy + 1 });
    const free = floors.filter((f) => f.x < AX - 125);
    const pick = () => free[Math.floor(rnd() * free.length)];
    // estalagmites subindo do chão
    for (const f of free)
      if (E.hash2(f.x, f.y + 3) < 0.05) {
        const L = 1 + Math.floor(E.hash2(f.x, f.y + 7) * 4);
        for (let k = 1; k <= L; k++) if (!w.solid(f.x, f.y - k - 1)) w.set('main', f.x, f.y - k, theme === 'gelo' ? E.MAT.ICE : WALL);
      }
    // raízes e cipós pendurados no teto
    if (theme !== 'areia')
      for (let x = 4; x < AX - 125; x += 3)
        for (let yy = 4; yy < H - 30; yy++)
          if (w.solid(x, yy) && !w.solid(x, yy + 1) && E.hash2(x, yy + 5) < (theme === 'fungo' ? 0.16 : 0.05)) {
            const L = 3 + Math.floor(E.hash2(x, yy + 8) * 9);
            for (let k = 1; k <= L && !w.solid(x, yy + k + 1); k++) w.set('back', x, yy + k, theme === 'gelo' ? E.MAT.ICE : E.MAT.VINE);
          }
    // um ponto do corredor principal: chão e teto naquela coluna
    const span = (x, y0) => {
      let a = y0, b = y0;
      while (a > 2 && !w.solid(x, a - 1)) a--;
      while (b < H - 2 && !w.solid(x, b + 1)) b++;
      return [a, b];
    };
    path.forEach(([px, py], k) => {
      if (k % 22 !== 11 || px < 30 || w.solid(px, py)) return;
      const [top, bot] = span(px, py);
      if (bot - top < 8) return;
      if (theme === 'pedra') {
        // escoramento de mina antiga com lampião
        for (let yy = top; yy <= bot; yy++) w.set('back', px - 7, yy, E.MAT.WOOD), w.set('back', px + 7, yy, E.MAT.WOOD);
        w.fillRect('back', px - 8, top, 17, 1, E.MAT.WOOD);
        if (k % 44 === 11) E.Struct.lantern(w, px, top + 1, 2);
        w.fillRect('back', px - 9, bot, 19, 1, E.MAT.IRON);
      } else if (theme === 'areia') {
        // colunas de alvenaria e nichos com ouro
        for (const cx of [px - 9, px + 8]) w.fillRect('back', cx, top, 2, bot - top + 1, E.MAT.MASONRY);
        w.fillRect('back', px - 3, bot - 7, 7, 1, E.MAT.MASONRY);
        w.fillRect('back', px - 2, bot - 9, 5, 2, E.MAT.GOLD);
      } else if (theme === 'gelo') {
        // colunas de gelo do chão ao teto, ao fundo
        for (let yy = top; yy <= bot; yy++) {
          const r = 1 + Math.round(Math.abs(yy - (top + bot) / 2) / ((bot - top) / 2) * 2);
          for (let i = -r; i <= r; i++) w.set('back', px + i, yy, E.MAT.ICE);
        }
        w.lights.push(Object.assign({ x: px, y: (top + bot) / 2, type: 'cristal' }, E.LIGHTS.cristal, { r: 20, i: 0.7 }));
      } else if (theme === 'fungo') {
        // cogumelo gigante
        const h = Math.min(bot - top - 3, 10 + Math.floor(rnd() * 10));
        w.fillRect('back', px - 1, bot - h, 3, h, E.MAT.BARK);
        w.fillEllipse('back', px, bot - h, 7 + rnd() * 4, 2.5, E.MAT.MUSHROOM, 0.3, px);
        w.lights.push({ x: px, y: bot - h + 2, type: 'cogumelo', c: [0.45, 1, 0.75], r: 24, i: 0.85, flicker: 0.05, pulse: true });
      }
    });
    // sarcófagos nas catacumbas
    if (theme === 'areia')
      for (let k = 0; k < 14; k++) {
        const f = free[Math.floor(rnd() * free.length)];
        if (!f || w.solid(f.x + 7, f.y - 1) || !w.solid(f.x + 7, f.y)) continue;
        w.fillRect('back', f.x, f.y - 3, 8, 3, E.MAT.SANDSTONE);
        w.fillRect('back', f.x + 1, f.y - 4, 6, 1, E.MAT.MASONRY);
        w.set('back', f.x + 3, f.y - 2, E.MAT.GOLD), w.set('back', f.x + 4, f.y - 2, E.MAT.GOLD);
      }
    // líquidos nas partes baixas
    if (TH.liquid)
      for (const f of free)
        if (f.y > H * 0.68 && rnd() < 0.5)
          for (let k = 1; k <= 3; k++)
            for (let i = 0; i < 3; i++)
              if (!w.solid(f.x + i, f.y - k)) w.set('main', f.x + i, f.y - k, TH.liquid === 'lava' && f.y > H * 0.85 ? E.MAT.LAVA : theme === 'gelo' && k === 3 ? E.MAT.ICE : E.MAT.WATER);
    if (theme === 'gelo') for (const f of floors) if (rnd() < 0.5) for (let i = 0; i < 3; i++) if (w.solid(f.x + i, f.y)) w.set('main', f.x + i, f.y, E.MAT.SNOW);
    if (theme === 'fungo') for (const f of floors) if (rnd() < 0.35) for (let i = 0; i < 3; i++) if (!w.solid(f.x + i, f.y - 1)) w.set('main', f.x + i, f.y - 1, E.MAT.GRASS, [90, 170, 120]);
    const nDeco = theme === 'fungo' ? 70 : 55;
    for (let k = 0; k < nDeco; k++) {
      const f = pick();
      if (!f) break;
      const r = k % 3;
      if (r === 0 || (theme === 'gelo' && r === 2)) {
        w.fillEllipse('main', f.x, f.y, 2.5, 1.5, E.MAT.CRYSTAL);
        w.lights.push(Object.assign({ x: f.x, y: f.y - 3, type: 'cristal' }, E.LIGHTS.cristal));
      } else if (r === 1 || theme === 'fungo') E.Struct.mushrooms(w, f.x, f.y, rnd);
      else if (theme === 'areia') E.Struct.torch(w, f.x, f.y - 5);
      else E.Struct.web(w, f.x, f.y - 14, 8);
    }
    if (TH.liquid === 'lava') for (const f of free) if (f.y > H * 0.85 && rnd() < 0.05) w.lights.push(Object.assign({ x: f.x, y: f.y - 3, type: 'lava', embers: true }, E.LIGHTS.lava));
    // entrada
    const start = floors.filter((f) => f.x < 50).sort((a, b) => a.x - b.x)[0] || pick();
    w.spawn = { x: start.x + 8, y: start.y };
    w.exitDoor = { x: start.x + 2, y: start.y };
    w.entities.push({ id: 'saida', prefab: 'porta', x: start.x + 2, y: start.y, facing: 1, props: { destino: 'fase1' } });
    E.Struct.torch(w, start.x + 14, start.y - 4);
    w.entities.push({ id: 'fogo1', prefab: 'fogueira', x: start.x + 20, y: start.y, props: {} });
    // salão do chefe: braseiros, fogueira antes da luta e o chefe
    w.entities.push({ id: 'fogoChefe', prefab: 'fogueira', x: AX - 100, y: FY, props: {} });
    for (const bx of [AX - 80, AX - 30, AX + 30, AX + 80]) {
      w.fillRect('main', bx - 1, FY - 3, 3, 3, theme === 'areia' ? E.MAT.MASONRY : E.MAT.IRON);
      w.set('main', bx, FY - 4, E.MAT.FLAME);
      w.lights.push(Object.assign({ x: bx, y: FY - 6, type: 'tocha' }, E.LIGHTS.tocha));
    }
    w.entities.push({ id: 'chefe', prefab: TH.boss, x: AX + 35, y: FY, facing: -1, props: {} });
    // spawners e tesouros
    let i = 0;
    for (const r of rooms) {
      const kind = TH.mobs[i++ % TH.mobs.length];
      w.spawners.push({ id: 'csp' + i, prefab: kind, x: Math.round(r.x - r.sx / 2), y: Math.round(r.y - r.sy / 2), w: Math.round(r.sx), h: Math.round(r.sy), interval: 14, max: kind === 'espirito' ? 1 : kind === 'aranha' ? 4 : 2, initial: kind === 'espirito' ? 1 : 2, range: 130, active: true });
    }
    TH.loot.forEach((l, k) => {
      const f = pick();
      w.entities.push({ id: 'cb' + k, prefab: 'bau', x: f.x, y: f.y, props: { loot: l } });
    });
    for (let k = 0; k < 30; k++) {
      const f = pick();
      w.entities.push({ id: 'ci' + k, prefab: '__item', x: f.x, y: f.y - 1, props: { item: k % 6 === 5 ? 'lingote_ferro' : 'moeda', qty: 1 + Math.floor(rnd() * 3) } });
    }
    Object.assign(w.settings, { sky: 'Caverna', amb: E.SKIES.Caverna.amb.map((v, k) => v * TH.amb[k]), ambK: 1, fog: 0.35, rain: 0, glow: 1.2, dayNight: false, cave: { theme } });
    w.computeSurface();
    return w;
  };

  // ---------- masmorras perdidas: uma planta própria para cada chefe ----------
  // Todas têm 1150×228, entrada no alto à esquerda (x≈20) e a arena do chefe no fundo à direita.
  // O caminho é transitável nos dois sentidos: degraus de no máximo 2 células, saltos curtos
  // e plataformas vazadas ou escadas onde é preciso subir mais.
  E.LOST_NAMES = { pedra: 'Ninho da Rainha Aranha', areia: 'Cripta do Rei Esqueleto', fungo: 'Covil do Slime Rei', gelo: 'Salão do Golem de Gelo' };
  E.generateLostDungeon = (seed = 7, o = {}) => {
    const theme = o.theme || 'pedra', TH = E.CAVE_THEMES[theme], M = E.MAT;
    const W = o.W || 1150, H = o.H || 228;
    const w = new E.World(W, H);
    w.name = E.LOST_NAMES[theme] || TH.name;
    const rnd = E.rng(seed * 31 + 7), nz = vnoise2(seed + 3), nz2 = vnoise2(seed + 41);
    const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const inb = (x, y) => x > 2 && y > 2 && x < W - 3 && y < H - 3;
    const air = (x, y) => inb(x, y) && !w.get('main', x, y) && !w.col[w.idx(x, y)];
    let eid = 0;
    const K = {
      // rocha base da masmorra: parede + manchas de acento + bolsões de um segundo material, com estratos
      fill(wall, acc, accK, back, backRgb, acc2, acc2K = 0) {
        const tintA = E.BIOME_TINT[{ pedra: 'floresta', areia: 'deserto', fungo: 'floresta_grande', gelo: 'neve' }[theme]];
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            let m = c01(0.5 + (nz(x * 0.07 + 300, y * 0.14) - 0.5) * 1.7) < accK ? acc : wall;
            if (acc2 && nz2.one(x * 0.06 + 700, y * 0.12) < acc2K) m = acc2;
            w.set('main', x, y, m, m === M.STONE || m === M.MOSS ? E.strataColor(m, x, y, tintA) : undefined);
            const c = backRgb ? E.matColor(back, x, y).map((v, i) => Math.round(v * 0.4 + backRgb[i] * 0.6)) : E.strataColor(back, x, y, tintA);
            w.set('back', x, y, back, c);
          }
        K.base = { main: w.main.slice(), back: w.back.slice() };
      },
      // revestimento: muda o material das paredes até `depth` células da área aberta; fn(x, y, dist, acima livre) → material
      lining(depth, fn) {
        const D = new Uint16Array(W * H).fill(999);
        for (let i = 0; i < W * H; i++) if (!w.main[i] && !w.col[i]) D[i] = 0;
        for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) { const i = y * W + x; D[i] = Math.min(D[i], D[i - 1] + 1, D[i - W] + 1); }
        for (let y = H - 2; y >= 0; y--) for (let x = W - 2; x >= 0; x--) { const i = y * W + x; D[i] = Math.min(D[i], D[i + 1] + 1, D[i + W] + 1); }
        for (let y = 3; y < H - 3; y++)
          for (let x = 3; x < W - 3; x++) {
            const i = y * W + x, d = D[i];
            if (!d || d > depth || w.col[i] || !w.solid(x, y)) continue;
            const r = fn(x, y, d, D[i - W] === 0);
            if (r) Array.isArray(r) ? w.set('main', x, y, r[0], r[1]) : w.set('main', x, y, r);
          }
      },
      clear(x, y) {
        if (!inb(x, y)) return;
        w.set('main', x, y, 0);
        w.set('front', x, y, 0);
      },
      // bolsão natural de contorno irregular
      blob(cx, cy, rx, ry, rough = 1) {
        for (let y = Math.floor(cy - ry * 1.3); y <= cy + ry * 1.3; y++)
          for (let x = Math.floor(cx - rx * 1.3); x <= cx + rx * 1.3; x++)
            if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (nz2(x * 0.08, y * 0.16) - 0.5) * 0.6 * rough < 1) K.clear(x, y);
      },
      // túnel natural entre dois pontos (ondula no meio, mantém as pontas); guarda o percurso em K.paths
      paths: [],
      tube(ax, ay, bx, by, rx = 14, ry = 12) {
        const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 2), pts = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t + Math.sin(t * Math.PI) * (nz(ax * 0.01 + t * 3, 7) - 0.5) * 14;
          K.blob(px, py, rx * (0.85 + nz(t * 5, ax * 0.01) * 0.4), Math.max(11, ry), 0.5);
          pts.push([Math.round(px), Math.round(py)]);
        }
        K.paths.push(pts);
      },
      rect(x0, y0, x1, y1, back) {
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            K.clear(x, y);
            if (back && inb(x, y)) w.set('back', x, y, back);
          }
      },
      solid(x0, y0, x1, y1, mat) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && x < W && y >= 0 && y < H) w.set('main', x, y, mat);
      },
      floor(x, y) {
        while (y < H - 2 && !w.solid(x, y)) y++;
        return y;
      },
      // rampa: preenche o ar abaixo da linha (xa,ya)→(xb,yb), criando um chão contínuo para andar
      ramp(xa, ya, xb, yb, mat) {
        for (let x = xa; x <= xb; x++) for (let y = Math.round(ya + ((yb - ya) * (x - xa)) / (xb - xa)); y < H - 3 && air(x, y); y++) w.set('main', x, y, mat);
      },
      ceil(x, y) {
        while (y > 1 && !w.solid(x, y - 1)) y--;
        return y;
      },
      oneway(x, y, len, mat, rgb) {
        for (let k = 0; k < len; k++)
          if (inb(x + k, y)) {
            w.set('main', x + k, y, mat, rgb);
            w.col[w.idx(x + k, y)] = E.CT.ONEWAY;
          }
      },
      light(x, y, type, extra) {
        w.lights.push(Object.assign({ x, y, type }, E.LIGHTS[type] || {}, extra || {}));
      },
      ent(prefab, x, y, props = {}, id) {
        w.entities.push({ id: id || 'ld' + eid++, prefab, x: Math.round(x), y: Math.round(y), facing: 1, props });
      },
      chest(x, y, k) {
        K.ent('bau', x, K.floor(Math.round(x), Math.round(y)), { loot: TH.loot[k % TH.loot.length] });
      },
      spawn(prefab, x, y, ww, hh, max = 2, interval = 14) {
        w.spawners.push({ id: 'ls' + w.spawners.length, prefab, x: Math.round(x), y: Math.round(y), w: Math.round(ww), h: Math.round(hh), interval, max, initial: Math.min(2, max), range: 130, active: true });
      },
      // poça: enche só trechos com parede dos dois lados e chão por baixo
      pool(x0, x1, yTop, yBot, mat, rgb) {
        x0 = Math.round(x0), x1 = Math.round(x1);
        for (let y = yBot; y >= yTop; y--)
          for (let x = x0; x <= x1; ) {
            if (!air(x, y)) {
              x++;
              continue;
            }
            let e = x, ok = w.solid(x - 1, y);
            while (e <= x1 + 40 && air(e, y)) {
              const b = w.get('main', e, y + 1);
              if (!(w.solid(e, y + 1) || b === M.WATER || b === M.LAVA)) ok = false;
              e++;
            }
            if (ok && w.solid(e, y) && e - x < 160) for (let i = x; i < e; i++) w.set('main', i, y, mat, rgb);
            x = e + 1;
          }
      },
      // plataformas vazadas empilhadas a cada 13 linhas para subir um salão alto (cogumelo, seda ou gelo)
      ledges(cx, cy, rx, kind) {
        const fy = K.floor(cx, cy), top = K.ceil(cx, cy - 1);
        for (let y = fy - 13, i = 0; y > top + 19; y -= 13, i++) {
          const lx = Math.round(cx + (i % 2 ? 1 : -1) * rx * 0.25 - 8);
          let ok = true;
          for (let k = -2; k < 18; k++) if (!air(lx + k, y)) ok = false;
          if (!ok) continue;
          if (kind === 'mush') {
            const rgb = rnd() < 0.5 ? [120, 240, 215] : [240, 130, 225];
            K.oneway(lx, y, 16, M.MUSHROOM, rgb);
            for (let k = 2; k < 14; k += 4) w.set('back', lx + k, y + 1, M.MUSHROOM, rgb);
            for (let yy = y + 2, b = K.floor(lx + 8, y + 2); yy < b; yy++) w.set('back', lx + 7, yy, M.BARK), w.set('back', lx + 8, yy, M.BARK);
            if (i % 2 === 0) w.lights.push({ x: lx + 8, y: y + 2, type: 'cogumelo', c: [0.4, 0.95, 0.8], r: 18, i: 0.6, flicker: 0.05, pulse: true });
          } else if (kind === 'web') {
            K.oneway(lx, y, 16, M.WEB, [225, 225, 235]);
            for (const ex of [lx, lx + 15]) for (let yy = y - 1, c = K.ceil(ex, y - 1); yy >= c && yy > y - 30; yy--) w.set('back', ex, yy, M.WEB);
          } else if (kind === 'ice') {
            K.oneway(lx, y, 16, M.ICE);
            for (let k = 1; k < 15; k += 3) for (let j = 1; j <= 1 + Math.floor(E.hash2(lx + k, y) * 3); j++) w.set('back', lx + k, y + j, M.ICE);
          } else K.oneway(lx, y, 16, M.WOOD);
        }
      },
      // estalactites e estalagmites com vão garantido para o herói
      formations(mat, k = 0.05) {
        for (let x = 4; x < W - 4; x++)
          for (let y = 4; y < H - 6; y++) {
            if (!w.solid(x, y) || w.col[w.idx(x, y)]) continue;
            if (air(x, y + 1) && E.hash2(x, y + 99) < k) {
              let free = 0;
              while (free < 40 && air(x, y + 1 + free)) free++;
              const L = 1 + Math.floor(E.hash2(x, y + 7) * 5);
              if (free > L + 21) {
                for (let j = 1; j <= L; j++) w.set('main', x, y + j, mat);
                y += L;
              }
            } else if (air(x, y - 1) && E.hash2(x, y + 55) < k * 0.6) {
              let free = 0;
              while (free < 40 && air(x, y - 1 - free)) free++;
              if (free > 24) for (let j = 1; j <= 1 + Math.floor(E.hash2(x, y + 5) * 2); j++) w.set('main', x, y - j, mat);
            }
          }
      },
      hangBack(x, yFrom, mat, len, rgb) {
        for (let k = 0; k < len && air(x, yFrom + k); k++) w.set('back', x, yFrom + k, mat, rgb);
      },
      // itens soltos em chãos aleatórios
      scatter(n) {
        for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
          const x = 30 + Math.floor(rnd() * (W - 200)), y = 10 + Math.floor(rnd() * (H - 20));
          if (!air(x, y)) continue;
          const fy = K.floor(x, y);
          if (fy >= H - 3 || !air(x, fy - 2)) continue;
          K.ent('__item', x, fy - 1, { item: k % 6 === 5 ? 'lingote_ferro' : 'moeda', qty: 1 + Math.floor(rnd() * 3) });
          k++;
        }
      },
      fire(x, y) {
        K.ent('fogueira', x, K.floor(Math.round(x), Math.round(y)));
      },
      boss(x, fy) {
        w.entities.push({ id: 'chefe', prefab: TH.boss, x, y: fy, facing: -1, props: {} });
      },
      finish(ex, ey) {
        ey = K.floor(ex, ey);
        w.spawn = { x: ex + 8, y: ey };
        w.exitDoor = { x: ex + 2, y: ey };
        E.Struct.torch(w, ex + 14, ey - 4);
        K.fire(ex + 22, ey - 2);
        Object.assign(w.settings, { sky: 'Caverna', amb: E.SKIES.Caverna.amb.map((v, k) => v * TH.amb[k]), ambK: 1, fog: 0.35, rain: 0, glow: 1.2, dayNight: false, cave: { theme } });
        // objetos do tema (sarcófagos, cristais, juncos, ossos...) nos chãos livres; o salão do chefe fica limpo
        const fl = [];
        for (let x = 4; x < W - 4; x += 3) for (let y = 4; y < H - 4; y++) if (!w.solid(x, y) && !w.solid(x, y - 1) && w.solid(x, y + 1)) fl.push({ x, y: y + 1 });
        const boss = w.entities.find((e) => e.id === 'chefe');
        E.Deco.cave(w, theme, boss ? fl.filter((f) => Math.abs(f.x - boss.x) > 90) : fl, rnd);
        // máscara do que foi construído/escavado + 4 células de revestimento: só isso entra no mundo,
        // o resto continua sendo a rocha do próprio mundo (nada de retângulo recortado)
        const T = new Uint8Array(W * H), R = 4;
        for (let i = 0; i < W * H; i++) if (w.main[i] !== K.base.main[i] || w.back[i] !== K.base.back[i] || w.col[i]) T[i] = 1;
        const Hm = new Uint8Array(W * H);
        for (let y = 0; y < H; y++)
          for (let x = 0, run = -99; x < W; x++) {
            if (T[y * W + x]) run = x;
            if (x - run <= R) Hm[y * W + x] = 1;
          }
        for (let y = 0; y < H; y++)
          for (let x = W - 1, run = W + 99; x >= 0; x--) {
            if (T[y * W + x]) run = x;
            if (run - x <= R) Hm[y * W + x] = 1;
          }
        const mask = new Uint8Array(W * H);
        for (let x = 0; x < W; x++)
          for (let y = 0; y < H; y++)
            for (let k = -R; k <= R; k++)
              if (y + k >= 0 && y + k < H && Hm[(y + k) * W + x]) {
                mask[y * W + x] = 1;
                break;
              }
        w.mask = mask;
        w.computeSurface();
        return w;
      },
    };
    // decorações que se repetem
    const cocoon = (x, y) => {
      const c = K.ceil(x, y), L = 3 + Math.floor(rnd() * 8);
      for (let k = 0; k < L; k++) w.set('back', x, c + k, M.WEB);
      for (let yy = -3; yy <= 3; yy++) for (let xx = -1; xx <= 1; xx++) if (Math.abs(xx) + Math.abs(yy) / 1.6 < 2.4) w.set('back', x + xx, c + L + 3 + yy, M.WEB, [222, 220, 228]);
    };
    const eggs = (x, y) => {
      const fy = K.floor(x, y);
      for (let k = 0; k < 4; k++) for (const [dx, dy] of [[0, -1], [1, -1], [0, -2], [-1, -1]]) w.set('back', x + k * 3 - 4 + dx, fy + dy, M.WEB, [240, 232, 205]);
      w.lights.push({ x, y: fy - 2, type: 'ovos', c: [0.95, 0.85, 0.6], r: 12, i: 0.45, flicker: 0.05, pulse: true });
    };
    const bones = (x, y) => {
      const fy = K.floor(x, y);
      for (const [dx, dy] of [[0, -1], [1, -1], [2, -1], [3, -2], [-1, -2]]) if (air(x + dx, fy + dy)) w.set('back', x + dx, fy + dy, M.INK, [225, 218, 196]);
    };
    const giantMush = (x, y, h, rx) => {
      const fy = K.floor(x, y);
      for (let yy = fy - h; yy < fy; yy++) w.set('back', x, yy, M.BARK), w.set('back', x + 1, yy, M.BARK);
      w.fillEllipse('back', x, fy - h, rx, 2.6, M.MUSHROOM, 0.3, x);
      w.lights.push({ x, y: fy - h + 2, type: 'cogumelo', c: [0.45, 1, 0.75], r: 24, i: 0.85, flicker: 0.05, pulse: true });
    };
    const crystal = (x, y, up = true) => {
      const fy = up ? K.floor(x, y) : K.ceil(x, y);
      for (let k = 0; k < 3; k++) w.fillEllipse('main', x + (k - 1) * 2.5, up ? fy - 1 : fy + 1, 1.2, 0.8 + (k === 1 ? 1 : 0), M.CRYSTAL);
      K.light(x, up ? fy - 4 : fy + 4, 'cristal');
    };

    // escoramento de mina abandonada ao longo de um túnel: postes, viga, parede de tábuas, trilho e lampião
    const mineSupports = (pts, step = 26) => {
      for (let i = step >> 1; i < pts.length; i += step) {
        const [px, py] = pts[i];
        if (!air(px, py)) continue;
        const top = K.ceil(px, py), bot = K.floor(px, py);
        if (bot - top < 16 || bot - top > 40) continue;
        for (const ox of [-7, 7]) for (let y = top; y < bot; y++) w.set('back', px + ox, y, M.WOOD);
        for (let x = px - 8; x <= px + 8; x++) w.set('back', x, top, M.WOOD), w.set('back', x, top + 1, M.WOOD);
        if (rnd() < 0.55) for (let y = top + 2; y < bot; y++) for (let x = px - 6; x <= px + 6; x++) if (E.hash2(x, y >> 1) < 0.78) w.set('back', x, y, M.PLANK);
        for (let x = px - 10; x <= px + 10; x++) if (air(x, bot - 1)) w.set('back', x, bot - 1, M.IRON);
        if (rnd() < 0.35) E.Struct.lantern(w, px, top + 2, 2);
        else if (rnd() < 0.5) E.Struct.web(w, px - 6, top + 5, 5);
      }
    };
    // raiz grossa que desce do teto em diagonal até o chão (fundo)
    const root = (x, y, dir, wd = 2) => {
      let px = x, py = K.ceil(x, y);
      for (let k = 0; k < 60 && air(Math.round(px), py); k++, py++) {
        for (let j = 0; j < wd; j++) w.set('back', Math.round(px) + j, py, M.BARK);
        px += dir * (0.3 + nz(k * 0.1, x) * 0.5);
      }
    };
    const PLANS = {
      // NINHO DA RAINHA ARANHA: câmaras de rocha ligadas por túneis, um abismo vertical com pontes de teia,
      // bolsões de ovos e casulos, e um ninho redondo gigante como arena
      pedra() {
        K.fill(M.STONE, M.MOSS, 0.15, M.ROCK, null, M.DIRT, 0.22);
        const N = [[40, 50, 34, 18], [170, 82, 50, 22], [310, 60, 40, 20], [560, 150, 55, 24], [690, 110, 45, 22], [800, 165, 50, 22]];
        for (const n of N) K.blob(...n);
        K.blob(432, 112, 42, 64, 0.8); // abismo
        K.tube(40, 52, 170, 84);
        K.tube(170, 84, 310, 62);
        K.tube(310, 62, 404, 66);
        K.tube(460, 160, 560, 152);
        K.tube(560, 152, 690, 112);
        K.tube(690, 112, 800, 166);
        K.tube(800, 168, 905, 176, 16, 14);
        // bolsões laterais (ovos, casulos e baús) e um poço de lava
        K.tube(150, 96, 112, 124, 12, 11), K.blob(108, 128, 30, 15);
        K.tube(700, 108, 748, 96, 12, 11), K.blob(758, 92, 30, 14);
        K.tube(590, 166, 612, 196, 12, 11), K.blob(616, 200, 40, 14);
        // arena: ninho redondo com chão plano
        K.blob(1012, 138, 126, 60, 0.7);
        K.solid(880, 190, 1146, H - 1, M.STONE);
        // paredes de terra e musgo em volta de tudo que foi escavado
        K.lining(3, (x, y, d, up) => (up ? (nz(x * 0.2, y * 0.2) < 0.55 ? M.MOSS : M.DIRT) : d <= 2 && nz2.one(x * 0.15, y * 0.3) < 0.5 ? M.DIRT : null));
        // mina abandonada que as aranhas tomaram
        for (const pts of K.paths) mineSupports(pts);
        K.ledges(432, 150, 42, 'web');
        // pontes de teia de parede a parede no abismo
        for (const by of [80, 122]) {
          let a = 432, b = 432;
          while (a > 380 && !w.solid(a - 1, by)) a--;
          while (b < 490 && !w.solid(b + 1, by)) b++;
          K.oneway(a, by, b - a + 1, M.WEB, [225, 225, 235]);
          for (let x = a; x <= b; x += 6) for (let yy = by - 1, c = K.ceil(x, by - 1); yy >= c && yy > by - 26; yy--) w.set('back', x, yy, M.WEB);
        }
        K.ledges(1012, 180, 126, 'web');
        K.formations(M.STONE, 0.04);
        K.pool(590, 650, 203, 214, M.LAVA);
        for (let x = 595; x < 650; x += 18) K.light(x, 200, 'lava', { embers: true });
        for (const [cx, cy, rx] of [...N, [432, 80, 42], [108, 128, 30], [758, 92, 30]]) {
          const lx = Math.round(cx - rx * 0.65), rx2 = Math.round(cx + rx * 0.6);
          E.Struct.web(w, lx, K.ceil(lx, cy) + 6, 8 + Math.floor(rnd() * 5));
          E.Struct.web(w, rx2, K.ceil(rx2, cy) + 5, 7 + Math.floor(rnd() * 4));
          for (let k = 0; k < 2; k++) cocoon(Math.round(cx + (rnd() - 0.5) * rx * 1.2), cy);
          if (rnd() < 0.6) eggs(Math.round(cx + (rnd() - 0.5) * rx), cy);
          if (rnd() < 0.5) bones(Math.round(cx + (rnd() - 0.5) * rx), cy);
        }
        eggs(108, 128), eggs(120, 128), eggs(762, 92);
        // ninho: teias enormes, casulos pendurados, ovos no chão e luz roxa
        E.Struct.web(w, 905, 120, 22), E.Struct.web(w, 1125, 112, 22), E.Struct.web(w, 1012, 90, 16);
        for (let x = 920; x < 1120; x += 26) cocoon(x + Math.floor(rnd() * 8), 140);
        for (const x of [930, 975, 1060, 1105]) eggs(x, 180);
        for (const x of [950, 1000, 1085]) bones(x, 180);
        K.light(960, 150, 'magia', { r: 40, i: 0.7 });
        K.light(1070, 150, 'magia', { r: 40, i: 0.7 });
        K.fire(812, 160);
        K.boss(1045, 190);
        [[108, 128], [758, 92], [560, 150], [800, 160], [300, 60]].forEach(([x, y], k) => K.chest(x, y, k));
        K.spawn('aranha', 140, 70, 60, 20, 3), K.spawn('aranha', 290, 45, 40, 18, 2), K.spawn('morcego', 400, 70, 60, 40, 3);
        K.spawn('aranha', 530, 135, 60, 20, 3), K.spawn('esqueleto', 650, 95, 60, 20, 2), K.spawn('espirito', 760, 150, 60, 20, 1), K.spawn('aranha', 740, 80, 40, 16, 2);
        K.scatter(28);
        return K.finish(20, 50);
      },
      // CRIPTA DO REI ESQUELETO: túmulo de três níveis ligados por escadarias, galeria de nichos, ossuário,
      // criptas secretas por escadas de mão e a sala do trono como arena; rachaduras e areia por cima
      areia() {
        K.fill(M.SANDSTONE, M.SAND, 0.12, M.SANDSTONE, null, M.STONE, 0.12);
        // sala de túmulo já desgastada: teto e paredes irregulares, alvenaria com falhas onde a rocha aparece;
        // o chão fica plano para andar
        const room = (x0, y0, x1, y1) => {
          for (let y = y0 - 7; y <= y1 + 3; y++)
            for (let x = x0 - 5; x <= x1 + 5; x++) {
              if (!inb(x, y)) continue;
              const jy = Math.round((nz(x * 0.09, y0 * 0.3) - 0.3) * 9), jx = Math.round((nz(y * 0.12, x0 * 0.3 + 5) - 0.5) * 7);
              if (x >= x0 - jx && x <= x1 + jx && y >= y0 - jy && y <= y1) K.clear(x, y);
              else if (w.solid(x, y) && (y > y1 ? nz2(x * 0.1, y * 0.4) > 0.3 : nz2(x * 0.18, y * 0.3) > 0.45)) w.set('main', x, y, M.MASONRY);
              w.set('back', x, y, nz2(x * 0.05 + 40, y * 0.08) > 0.32 ? M.MASONRY : M.SANDSTONE);
            }
        };
        const stairs = (xa, xb, ya, yb) => {
          for (let x = xa; x <= xb; x++) {
            const fy = Math.min(yb, ya + Math.floor((x - xa) / 3) * 2);
            for (let y = fy - 26; y < fy; y++) {
              K.clear(x, y);
              w.set('back', x, y, M.MASONRY);
            }
            for (let y = fy; y < fy + 4; y++) w.set('main', x, y, M.MASONRY);
            for (let y = fy - 29; y < fy - 26; y++) if (w.solid(x, y)) w.set('main', x, y, M.MASONRY);
          }
        };
        room(6, 36, 90, 66); // vestíbulo
        room(90, 44, 400, 66); // galeria dos nichos
        stairs(400, 495, 67, 127);
        room(495, 92, 760, 126); // ossuário
        stairs(760, 855, 127, 188);
        room(855, 116, 1144, 187); // sala do trono
        // criptas secretas: acima e abaixo do ossuário e sob a galeria, por escadas de mão
        room(560, 62, 640, 86), K.rect(596, 87, 604, 91), E.Struct.ladder(w, 598, 78, 126);
        room(650, 142, 730, 160), K.rect(686, 127, 694, 141), E.Struct.ladder(w, 688, 127, 160);
        room(200, 76, 280, 98), K.rect(236, 67, 244, 75), E.Struct.ladder(w, 238, 67, 98);
        // desabamentos: o teto cedeu para cavernas naturais em vários pontos
        for (const [cx, cy, rx, ry] of [[150, 32, 30, 10], [260, 38, 42, 12], [700, 84, 30, 9], [980, 106, 60, 15], [1110, 104, 28, 12], [470, 70, 22, 12]]) K.blob(cx, cy, rx, ry, 1.5);
        // erosão: faces de parede e teto perdem blocos ou viram arenito; o chão não é tocado
        for (let y = 4; y < H - 4; y++)
          for (let x = 4; x < W - 4; x++) {
            if (w.get('main', x, y) !== M.MASONRY || w.col[w.idx(x, y)] || air(x, y - 1)) continue;
            if ((air(x, y + 1) || air(x - 1, y) || air(x + 1, y)) && nz2(x * 0.2 + 11, y * 0.35) < 0.45) w.set('main', x, y, rnd() < 0.55 ? 0 : M.SANDSTONE);
          }
        // piso: lajes quebradas, com arenito e areia em manchas (continua sólido e plano)
        for (let y = 4; y < H - 4; y++)
          for (let x = 4; x < W - 4; x++)
            if (w.get('main', x, y) === M.MASONRY && air(x, y - 1) && !w.col[w.idx(x, y)]) {
              const n = nz2(x * 0.12 + 300, y * 0.5);
              if (n < 0.3) w.set('main', x, y, M.SAND);
              else if (n < 0.45) w.set('main', x, y, M.SANDSTONE);
            }
        // raízes e cipós entrando pelas rachaduras do teto
        for (let x = 4; x < W - 4; x++)
          for (let y = 4; y < H - 30; y++)
            if (w.get('main', x, y) === M.SANDSTONE && air(x, y + 1) && E.hash2(x, y + 9) < 0.05) K.hangBack(x, y + 1, E.hash2(x, y) < 0.4 ? M.BARK : M.VINE, 3 + Math.floor(E.hash2(x, y + 1) * 10));
        // colunas, tochas, nichos com ossos e sarcófagos
        const columns = (x0, x1, y0, y1, step) => {
          for (let x = x0 + 12; x < x1 - 8; x += step) {
            for (let y = y0; y <= y1; y++) w.set('back', x, y, M.MASONRY, [175, 165, 140]), w.set('back', x + 1, y, M.MASONRY, [175, 165, 140]);
            w.fillRect('back', x - 1, y0, 4, 1, M.SANDSTONE), w.fillRect('back', x - 1, y1, 4, 1, M.SANDSTONE);
          }
        };
        columns(90, 400, 44, 66, 26), columns(495, 760, 92, 126, 30), columns(855, 1144, 116, 187, 40);
        for (const [x0, x1, y] of [[10, 90, 60], [96, 400, 60], [500, 760, 120], [860, 1140, 180]]) for (let x = x0 + 6; x < x1; x += 30) E.Struct.torch(w, x, y);
        const niche = (x, y) => {
          for (let yy = y; yy < y + 6; yy++) for (let xx = x; xx < x + 8; xx++) w.set('back', xx, yy, M.ROCK, [45, 38, 30]);
          for (const dx of [2, 3, 4, 5]) w.set('back', x + dx, y + 5, M.INK, [225, 218, 196]);
          w.set('back', x + 3, y + 4, M.INK, [235, 228, 205]);
        };
        for (let x = 104; x < 392; x += 26) niche(x, 48);
        for (let x = 505; x < 750; x += 30) niche(x, 96), niche(x + 12, 106);
        const sarco = (x, fy) => {
          w.fillRect('back', x, fy - 3, 9, 3, M.SANDSTONE);
          w.fillRect('back', x + 1, fy - 4, 7, 1, M.MASONRY);
          w.set('back', x + 4, fy - 2, M.GOLD);
        };
        for (let x = 515; x < 745; x += 34) sarco(x, 127);
        for (let x = 120; x < 390; x += 52) sarco(x, 67);
        sarco(606, 87), sarco(670, 161), sarco(250, 99);
        // desgaste: rachaduras com arenito, montes de areia e teias nos cantos
        for (let k = 0; k < 70; k++) {
          const x = 10 + Math.floor(rnd() * (W - 20)), y = 30 + Math.floor(rnd() * (H - 40));
          if (w.get('main', x, y) !== M.MASONRY) continue;
          const r = 2 + rnd() * 4;
          for (let yy = -r; yy <= r; yy++)
            for (let xx = -r * 1.6; xx <= r * 1.6; xx++) {
              const X = x + Math.round(xx), Y = y + Math.round(yy);
              if (w.get('main', X, Y) === M.MASONRY && (xx / 1.6) ** 2 + yy * yy < r * r * (0.6 + nz(X * 0.3, Y * 0.3) * 0.6)) w.set('main', X, Y, M.SANDSTONE);
            }
        }
        for (let k = 0; k < 40; k++) {
          const x = 20 + Math.floor(rnd() * 820);
          for (const fy0 of [67, 127]) {
            if (!air(x, fy0 - 1) || !w.solid(x, fy0) || rnd() < 0.6) continue;
            const h = 1 + Math.floor(rnd() * 2);
            for (let xx = -h * 2; xx <= h * 2; xx++) for (let j = 1; j <= h - Math.floor(Math.abs(xx) / 2); j++) if (air(x + xx, fy0 - j) && w.solid(x + xx, fy0)) w.set('main', x + xx, fy0 - j, M.SAND);
          }
        }
        for (const [x, y] of [[10, 40], [86, 40], [94, 48], [396, 48], [500, 96], [756, 96], [860, 120], [1140, 120]]) E.Struct.web(w, x, y, 6);
        // pedaços de coluna caídos pelo chão
        for (let k = 0; k < 14; k++) {
          const x = 30 + Math.floor(rnd() * 800);
          for (const fy0 of [67, 127]) if (air(x, fy0 - 1) && air(x + 5, fy0 - 1) && w.solid(x, fy0) && w.solid(x + 5, fy0) && rnd() < 0.5) w.fillRect('main', x, fy0 - 2, 6, 2, M.MASONRY);
        }
        // sala do trono: estandartes, braseiros, trono dourado e o rei
        for (let x = 880; x < 1130; x += 48) E.Struct.banner(w, x, 118, 7, 26);
        for (const bx of [900, 980, 1080]) {
          w.fillRect('main', bx - 1, 186, 3, 2, M.IRON);
          w.set('main', bx, 185, M.FLAME);
          K.light(bx, 182, 'tocha');
        }
        w.fillRect('back', 1112, 160, 14, 28, M.GOLD), w.fillRect('back', 1114, 172, 10, 6, M.CLOTH), w.fillRect('back', 1110, 156, 18, 4, M.GOLD);
        K.light(1119, 166, 'lanterna', { r: 36, i: 0.9 });
        K.light(1000, 140, 'magia', { r: 44, i: 0.5 });
        K.fire(866, 186);
        K.boss(1060, 188);
        [[606, 86], [670, 160], [250, 98], [40, 66], [740, 126]].forEach(([x, y], k) => K.chest(x, y, k));
        K.spawn('esqueleto', 150, 50, 120, 16, 3), K.spawn('escorpiao', 320, 50, 60, 16, 2), K.spawn('morcego', 420, 80, 60, 30, 2);
        K.spawn('esqueleto_guerreiro', 540, 105, 120, 20, 3), K.spawn('espirito', 640, 100, 80, 20, 1), K.spawn('esqueleto', 790, 140, 50, 20, 2);
        K.scatter(26);
        return K.finish(20, 60);
      },
      // COVIL DO SLIME REI: bolhas de musgo ligadas por tubos curtos, com rotas alternativas, chapéus de
      // cogumelo como plataformas, poças de gosma verde e uma tigela enorme como arena
      fungo() {
        K.fill(M.MOSS, M.STONE, 0.35, M.ROCK, [55, 72, 55], M.DIRT, 0.25);
        const B = [[40, 58, 32, 20], [150, 92, 42, 28], [275, 62, 36, 24], [395, 112, 50, 32], [525, 72, 40, 26], [645, 130, 48, 30], [770, 90, 40, 26], [870, 160, 36, 22]];
        B.forEach((b) => K.blob(b[0], b[1], b[2], b[3], 1.4));
        for (let i = 0; i < B.length - 1; i++) K.tube(B[i][0], B[i][1] + B[i][3] * 0.35, B[i + 1][0], B[i + 1][1] + B[i + 1][3] * 0.35, 13, 12);
        K.tube(150, 108, 395, 130, 12, 11), K.tube(525, 88, 770, 104, 12, 11); // rotas alternativas
        K.blob(1012, 138, 128, 62, 1);
        K.tube(870, 170, 905, 178, 14, 12);
        K.solid(882, 188, 1146, H - 1, M.MOSS);
        K.lining(3, (x, y, d, up) => (up ? M.MOSS : nz(x * 0.2, y * 0.2) < 0.5 ? M.DIRT : M.MOSS));
        // ruínas engolidas pelo fungo: paredes de tijolo musguento ao fundo, com arcos, em algumas bolhas
        for (const [cx, cy, rx, ry] of [B[2], B[4], B[6], [1012, 138, 128, 62]]) {
          for (let y = Math.round(cy - ry); y <= cy + ry; y++)
            for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
              if (!air(x, y) || nz2(x * 0.05 + 50, y * 0.1) < 0.4) continue;
              const ax = (((x - cx) % 18) + 18) % 18 - 9, ay = y - (cy - ry * 0.2);
              if (ax * ax + ay * ay * 2 < 30 || (Math.abs(ax) < 5 && ay > 0 && ay < 10)) continue; // arco
              w.set('back', x, y, M.BRICK, [96, 112, 80].map((v) => Math.round(v * (0.8 + E.hash2(x >> 2, y) * 0.35))));
            }
        }
        // raízes gigantes atravessando as bolhas
        for (const [cx, cy, rx] of B) for (let k = 0; k < 2; k++) root(Math.round(cx + (rnd() - 0.5) * rx * 1.4), cy, rnd() < 0.5 ? -1 : 1, 2 + Math.floor(rnd() * 2));
        for (const [x0, x1] of [[890, 918], [1108, 1136]]) K.rect(x0, 186, x1, 189), K.pool(x0 - 2, x1 + 2, 186, 189, M.WATER, [80, 200, 90]);
        B.forEach((b) => K.ledges(b[0], b[1], b[2], 'mush'));
        K.ledges(925, 184, 30, 'mush'), K.ledges(1100, 184, 30, 'mush');
        K.formations(M.MOSS, 0.03);
        for (const b of [B[3], B[5]]) K.pool(b[0] - b[2] * 1.3, b[0] + b[2] * 1.3, Math.round(b[1] + b[3] * 0.55), Math.round(b[1] + b[3] * 1.4), M.WATER, [80, 200, 90]);
        for (const [cx, cy, rx] of B) {
          giantMush(Math.round(cx - rx * 0.5), cy, 10 + Math.floor(rnd() * 10), 6 + rnd() * 4);
          if (rnd() < 0.7) giantMush(Math.round(cx + rx * 0.55), cy, 8 + Math.floor(rnd() * 8), 5 + rnd() * 3);
          E.Struct.mushrooms(w, Math.round(cx), K.floor(Math.round(cx), cy), rnd);
        }
        // cipós, gotas de gosma e grama sobre o musgo
        for (let x = 4; x < W - 4; x++)
          for (let y = 4; y < H - 4; y++) {
            if (!w.solid(x, y) || w.col[w.idx(x, y)]) continue;
            if (air(x, y + 1) && E.hash2(x, y) < 0.12) {
              const goo = E.hash2(x, y + 1) < 0.2;
              K.hangBack(x, y + 1, goo ? M.INK : M.VINE, goo ? 2 + Math.floor(E.hash2(x, y + 2) * 3) : 3 + Math.floor(E.hash2(x, y + 2) * 10), goo ? [90, 220, 100] : undefined);
            }
            if (air(x, y - 1) && E.hash2(x, y + 3) < 0.3) w.set('main', x, y - 1, M.GRASS, [90, 175, 120]);
          }
        for (const x of [950, 1012, 1075]) giantMush(x, 184, 26 + Math.floor(rnd() * 12), 10);
        K.fire(872, 176);
        K.boss(1040, 188);
        [[150, 100], [395, 120], [645, 140], [770, 95], [275, 70]].forEach(([x, y], k) => K.chest(x, y, k));
        B.slice(1, 7).forEach(([cx, cy, rx, ry], k) => K.spawn(['slime', 'aranha', 'slime', 'morcego', 'slime', 'esqueleto'][k], cx - rx * 0.6, cy - ry * 0.5, rx * 1.2, ry, 3));
        K.scatter(26);
        return K.finish(20, 58);
      },
      // SALÃO DO GOLEM DE GELO: rampa de geleira, lago congelado com colunas de gelo, fenda funda com ponte
      // de gelo e o salão do golem com cachoeira congelada e cristais
      gelo() {
        K.fill(M.STONE, M.ICE, 0.3, M.ROCK, [70, 88, 115], M.SNOW, 0.15);
        K.blob(40, 55, 32, 18);
        K.tube(55, 58, 330, 128, 22, 16); // rampa de geleira
        K.blob(486, 130, 165, 30, 0.8); // lago
        K.tube(560, 136, 700, 138, 18, 14); // margem leste do lago até a ponte
        K.solid(326, 152, 650, 172, M.STONE);
        for (let x = 330; x < 646; x++) {
          w.set('main', x, 152, M.ICE);
          if (x > 345 && x < 630) for (let y = 153; y < 162; y++) w.set('main', x, y, M.WATER);
        }
        for (const hx of [420, 560]) for (let x = hx; x < hx + 7; x++) w.set('main', x, 152, M.WATER); // buracos no gelo
        K.blob(704, 168, 52, 56, 0.7); // fenda
        K.tube(728, 137, 892, 178, 16, 14); // nasce dentro da fenda: sem laje fina entre os dois
        // ponte de gelo sobre a fenda até o chão do túnel, com pingentes por baixo
        for (let x = 646; x < 762; x++) for (const y of [151, 152]) w.set('main', x, y, M.ICE);
        K.ramp(756, 151, 868, 181, M.STONE);
        for (let x = 650; x < 764; x += 3) for (let j = 1; j <= 1 + Math.floor(E.hash2(x, 3) * 5); j++) if (air(x, 152 + j) && (x < 690 || x > 718)) w.set('main', x, 152 + j, M.ICE);
        K.ledges(704, 215, 52, 'ice');
        // gelo rachado no meio da ponte: dá para atravessar e, com ↓+Espaço, descer ao fundo da fenda
        for (let x = 692; x <= 716; x++) {
          w.set('main', x, 152, 0);
          w.set('main', x, 151, M.ICE, [150, 205, 235]);
          w.col[w.idx(x, 151)] = E.CT.ONEWAY;
        }
        K.oneway(696, 164, 16, M.ICE);
        K.blob(1012, 142, 128, 58, 0.7);
        K.solid(882, 190, 1146, H - 1, M.STONE);
        for (let x = 882; x < 1146; x++) if (air(x, 189)) w.set('main', x, 190, M.ICE);
        K.lining(3, (x, y, d, up) => (w.get('main', x, y) === M.ICE ? null : up ? M.SNOW : d <= 2 && nz(x * 0.15, y * 0.3) < 0.55 ? M.ICE : null));
        // palácio congelado: paredes de tijolo de gelo ao fundo do lago e do salão, com janelas em arco
        const palace = (x0, x1, y0, y1) => {
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              if (!air(x, y) || nz2(x * 0.04 + 90, y * 0.08) < 0.28) continue;
              const wx = ((x - x0) % 40) - 20, wy = y - (y0 + 18);
              if (wx * wx + wy * wy * 3 < 50 || (Math.abs(wx) < 7 && wy > 0 && wy < 14)) continue; // janela
              w.set('back', x, y, M.MASONRY, [150, 195, 230].map((v) => Math.round(v * (0.85 + E.hash2(x >> 2, y) * 0.25))));
            }
        };
        palace(340, 640, 100, 151), palace(886, 1142, 96, 189);
        for (let x = 910; x < 1130; x += 70) {
          E.Struct.banner(w, x, 106, 6, 20);
          for (let y = 106; y < 130; y++) for (let k = 0; k < 6; k++) if (w.get('back', x + k, y) === M.CLOTH) w.set('back', x + k, y, M.CLOTH, [90, 140, 205]);
        }
        K.formations(M.ICE, 0.07);
        for (let x = 4; x < W - 4; x++) for (let y = 4; y < H - 4; y++) if (w.get('main', x, y) === M.STONE && air(x, y - 1) && E.hash2(x, y) < 0.7) w.set('main', x, y, M.SNOW);
        const pillar = (x, y) => {
          const t = K.ceil(x, y), b = K.floor(x, y);
          for (let yy = t; yy < b; yy++) {
            const r = 1 + Math.round((Math.abs(yy - (t + b) / 2) / Math.max(1, (b - t) / 2)) * 2.5);
            for (let i = -r; i <= r; i++) w.set('back', x + i, yy, M.ICE);
          }
        };
        for (let x = 360; x < 640; x += 46) pillar(x, 140);
        for (let x = 910; x < 1130; x += 44) pillar(x, 170);
        for (const [x, y] of [[60, 60], [200, 100], [300, 120], [450, 120], [610, 125], [700, 200], [740, 150], [960, 180], [1060, 180], [1120, 170]]) crystal(x, y, true);
        for (const [x, y] of [[480, 110], [1000, 100], [820, 150]]) crystal(x, y, false);
        for (let y = K.ceil(1012, 150); y < 190; y++) for (let i = -3; i <= 3; i++) w.set('back', 1012 + i, y, M.ICE, [170, 225, 255]);
        K.light(1012, 150, 'cristal', { r: 46, i: 0.9 });
        K.fire(880, 170);
        K.boss(1050, 190);
        [[704, 215], [486, 140], [60, 60], [250, 110], [600, 140]].forEach(([x, y], k) => K.chest(x, y, k));
        K.spawn('slime_gelo', 150, 80, 80, 20, 3), K.spawn('morcego', 300, 100, 60, 30, 2), K.spawn('slime_gelo', 420, 125, 120, 20, 3);
        K.spawn('esqueleto', 560, 125, 60, 20, 2), K.spawn('espirito', 700, 170, 60, 30, 1), K.spawn('slime_gelo', 800, 150, 60, 20, 2);
        K.scatter(26);
        return K.finish(20, 55);
      },
    };
    return (PLANS[theme] || PLANS.pedra)();
  };

  // ---------- ciclo de dia e noite (horas → céu, luz, astro) ----------
  const DAY_KEYS = [
    [0, { top: [0.05, 0.06, 0.16], bot: [0.25, 0.2, 0.42], amb: [0.24, 0.28, 0.42], fog: [0.35, 0.4, 0.6], k: 0 }],
    [5, { top: [0.05, 0.06, 0.16], bot: [0.25, 0.2, 0.42], amb: [0.24, 0.28, 0.42], fog: [0.35, 0.4, 0.6], k: 0 }],
    [6.5, { top: [0.22, 0.17, 0.35], bot: [0.98, 0.58, 0.42], amb: [0.62, 0.48, 0.5], fog: [0.75, 0.55, 0.55], k: 0.5 }],
    [8, { top: [0.24, 0.45, 0.82], bot: [0.66, 0.82, 0.96], amb: [1.0, 0.97, 0.9], fog: [0.75, 0.82, 0.9], k: 1 }],
    [17, { top: [0.24, 0.45, 0.82], bot: [0.66, 0.82, 0.96], amb: [1.0, 0.97, 0.9], fog: [0.75, 0.82, 0.9], k: 1 }],
    [18.5, { top: [0.2, 0.1, 0.3], bot: [0.92, 0.42, 0.28], amb: [0.68, 0.44, 0.4], fog: [0.7, 0.45, 0.45], k: 0.5 }],
    [20, { top: [0.05, 0.06, 0.16], bot: [0.25, 0.2, 0.42], amb: [0.24, 0.28, 0.42], fog: [0.35, 0.4, 0.6], k: 0 }],
    [24, { top: [0.05, 0.06, 0.16], bot: [0.25, 0.2, 0.42], amb: [0.24, 0.28, 0.42], fog: [0.35, 0.4, 0.6], k: 0 }],
  ];
  const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  E.dayState = (h) => {
    h = ((h % 24) + 24) % 24;
    let i = 0;
    while (i < DAY_KEYS.length - 2 && h > DAY_KEYS[i + 1][0]) i++;
    const [h0, A] = DAY_KEYS[i], [h1, B] = DAY_KEYS[i + 1];
    const t = h1 > h0 ? Math.min(1, (h - h0) / (h1 - h0)) : 0;
    const s = { top: lerp3(A.top, B.top, t), bot: lerp3(A.bot, B.bot, t), amb: lerp3(A.amb, B.amb, t), fog: lerp3(A.fog, B.fog, t), k: A.k + (B.k - A.k) * t };
    // sol de 6h às 19h, lua de 18h às 6h (arco no céu)
    const sunP = (h - 6) / 13, moonP = (((h - 18) % 24) + 24) % 24 / 12;
    const arc = (p) => [0.08 + 0.84 * p, 0.62 - 0.5 * Math.sin(Math.PI * p)];
    if (sunP >= 0 && sunP <= 1 && (moonP > 1 || sunP > 0.08)) s.cel = [...arc(sunP), 1, 1];
    else if (moonP <= 1) s.cel = [...arc(moonP), 0, 1];
    else s.cel = [0.5, 1.5, 0, 0];
    s.stars = Math.max(0, 1 - s.k * 1.6);
    s.isDay = h >= 6 && h < 19;
    return s;
  };

  E.SKIES = {
    Noite: { top: [0.05, 0.06, 0.16], bot: [0.25, 0.2, 0.42], moon: [0.85, 0.86, 0.78], fog: [0.35, 0.4, 0.6], amb: [0.24, 0.28, 0.42] },
    Crepúsculo: { top: [0.12, 0.06, 0.22], bot: [0.85, 0.42, 0.3], moon: [1, 0.85, 0.6], fog: [0.6, 0.4, 0.45], amb: [0.3, 0.22, 0.28] },
    Névoa: { top: [0.12, 0.15, 0.18], bot: [0.35, 0.42, 0.45], moon: [0.9, 0.92, 0.95], fog: [0.55, 0.62, 0.65], amb: [0.26, 0.3, 0.32] },
    Caverna: { top: [0.01, 0.01, 0.02], bot: [0.04, 0.04, 0.07], moon: [0.3, 0.6, 0.7], fog: [0.2, 0.25, 0.35], amb: [0.11, 0.11, 0.16] },
  };
})();

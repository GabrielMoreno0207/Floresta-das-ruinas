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
    }
    skyAt(x, y) {
      if (!this.surf || x < 0 || x >= this.W) return 255;
      const d = y - this.surf[x];
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
      return { format: 'asciiforge-world@2', id: this.id, name: this.name, W: this.W, H: this.H, layers, lights, entities: this.entities, spawners: this.spawners, triggers: this.triggers, spawn: this.spawn, settings: this.settings, biomes: this.biomes, villages: this.villages };
    }
    static fromJSON(o) {
      const w = new E.World(o.W, o.H);
      if (o.biomes) w.biomes = o.biomes;
      if (o.villages) w.villages = o.villages;
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

  E.LIGHTS = {
    lanterna: { c: [1.0, 0.72, 0.35], r: 30, i: 1.25, flicker: 0.12 },
    tocha: { c: [1.0, 0.55, 0.2], r: 34, i: 1.4, flicker: 0.3 },
    cristal: { c: [0.35, 0.85, 1.0], r: 26, i: 1.0, flicker: 0.05, pulse: true },
    lava: { c: [1.0, 0.3, 0.08], r: 44, i: 1.2, flicker: 0.15 },
    lua: { c: [0.55, 0.65, 1.0], r: 90, i: 0.5, flicker: 0 },
    magia: { c: [0.75, 0.45, 1.0], r: 24, i: 1.3, flicker: 0.4, pulse: true },
    vagalume: { c: [0.8, 1.0, 0.4], r: 9, i: 0.8, flicker: 0.5 },
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
    },
    ladder(w, x, y0, y1) {
      for (let y = y0; y <= y1; y++) {
        w.set('back', x, y, E.MAT.WOOD);
        w.set('back', x + 3, y, E.MAT.WOOD);
        if (y % 3 === 0) for (let k = 1; k < 3; k++) w.set('back', x + k, y, E.MAT.WOOD);
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
    cabin(w, x, groundY, rnd, props = {}) {
      const bw = 46, bh = 25, x0 = x - (bw >> 1), top = groundY - bh;
      // limpa o interior e pinta a parede de tábuas no fundo
      for (let y = top; y < groundY; y++)
        for (let xx = x0; xx < x0 + bw; xx++) {
          w.set('main', xx, y, 0);
          w.set('front', xx, y, 0);
          w.set('back', xx, y, (xx - x0) % 6 === 0 ? E.MAT.BARK : E.MAT.PLANK);
        }
      // chão de madeira sobre terra até o fundo
      w.fillRect('main', x0 - 1, groundY, bw + 2, 1, E.MAT.WOOD);
      for (let xx = x0 - 1; xx < x0 + bw + 1; xx++) for (let y = groundY + 1; y < groundY + 8; y++) if (!w.get('main', xx, y)) w.set('main', xx, y, E.MAT.DIRT);
      // paredes: esquerda com vão da porta, direita inteira com janela no fundo
      w.fillRect('main', x0, top, 2, bh - 19, E.MAT.WOOD);
      w.fillRect('main', x0 + bw - 2, top, 2, bh, E.MAT.WOOD);
      for (let y = top + 5; y < top + 12; y++) for (let xx = x0 + bw - 14; xx < x0 + bw - 5; xx++) w.set('back', xx, y, xx === x0 + bw - 9 || y === top + 6 ? E.MAT.WOOD : 0);
      // telhado (sólido, dá para andar em cima)
      for (let k = 0; k < 9; k++) {
        const y = top - 1 - k, half = (bw >> 1) + 3 - k * 2.6;
        if (half < 1) break;
        w.fillRect('main', Math.round(x - half), y, Math.round(half * 2), 1, E.MAT.ROOF);
      }
      w.fillRect('main', x0 + bw - 8, top - 10, 3, 6, E.MAT.BRICK);
      E.Struct.lantern(w, x + 4, top, 4);
      E.Struct.doorAt(w, x0 + 1, groundY, props);
    },
    caveEntrance(w, x, groundY, rnd, len = 90) {
      let cx = x, cy = groundY - 3;
      for (let s = 0; s < len; s++) {
        cx += 1.1;
        cy += s < len - 20 ? 0.5 : 0.1;
        for (let yy = -15; yy <= 7; yy++)
          for (let xx = -14; xx <= 14; xx++) {
            if (xx * xx + yy * yy * 1.4 > 196) continue;
            const px = Math.round(cx + xx), py = Math.round(cy + yy);
            w.set('main', px, py, 0);
            w.set('front', px, py, 0);
            if (py > groundY - 2) w.set('back', px, py, E.MAT.ROCK);
          }
      }
      // câmara no fim
      for (let yy = -24; yy <= 8; yy++)
        for (let xx = -55; xx <= 55; xx++)
          if ((xx / 55) ** 2 + (yy / 24) ** 2 + (E.hash2(xx, yy) - 0.5) * 0.15 < 1) {
            w.set('main', Math.round(cx + 30 + xx), Math.round(cy - 6 + yy), 0);
            w.set('back', Math.round(cx + 30 + xx), Math.round(cy - 6 + yy), E.MAT.ROCK);
          }
      w.spawners.push({ id: 'cav' + Math.round(cx), prefab: 'aranha', x: Math.round(cx), y: Math.round(cy - 16), w: 60, h: 18, interval: 12, max: 3, initial: 2, range: 120, active: true });
      w.spawners.push({ id: 'cavs' + Math.round(cx), prefab: 'esqueleto_guerreiro', x: Math.round(cx + 20), y: Math.round(cy - 16), w: 40, h: 18, interval: 20, max: 1, initial: 1, range: 120, active: true });
      // pedras na boca e tochas
      for (let k = -11; k <= 11; k++) w.set('main', x + k, groundY - 14 + Math.round(Math.abs(k) * 0.3), E.MAT.STONE);
      E.Struct.torch(w, x - 9, groundY - 4);
      E.Struct.torch(w, Math.round(cx + 4), Math.round(cy) - 3);
      E.Struct.mushrooms(w, Math.round(cx + 30), Math.round(cy + 3), rnd);
      E.Struct.mushrooms(w, Math.round(cx + 6), Math.round(cy + 3), rnd);
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
    tower(w, x, groundY) {
      const tw = 20, th = 64, x0 = x - (tw >> 1), top = groundY - th;
      for (let y = top; y < groundY; y++)
        for (let xx = x0; xx < x0 + tw; xx++) {
          w.set('main', xx, y, 0);
          w.set('back', xx, y, E.hash2(xx, y) < 0.15 ? E.MAT.MOSS : E.MAT.MASONRY);
        }
      w.fillRect('main', x0, top, 2, th - 19, E.MAT.MASONRY);
      w.fillRect('main', x0 + tw - 2, top, 2, th, E.MAT.MASONRY);
      for (let k = 0; k < tw + 4; k += 4) w.fillRect('main', x0 - 2 + k, top - 3, 2, 3, E.MAT.MASONRY);
      w.fillRect('main', x0 - 2, top - 1, tw + 4, 1, E.MAT.MASONRY);
      for (let xx = x0 + 4; xx < x0 + 8; xx++) if (w.idx(xx, top - 1) >= 0) w.col[w.idx(xx, top - 1)] = E.CT.ONEWAY;
      for (let y = groundY - 18; y > top + 6; y -= 18) {
        E.Struct.platform(w, x0 + 6, y, tw - 8);
        for (let yy = y - 4; yy < y - 1; yy++) for (let xx = x0 + tw - 6; xx < x0 + tw - 3; xx++) w.set('back', xx, yy, 0);
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
    well(w, x, groundY) {
      w.fillRect('main', x - 5, groundY - 3, 11, 3, E.MAT.MASONRY);
      w.fillRect('main', x - 3, groundY - 3, 7, 3, 0);
      w.fillRect('back', x - 3, groundY - 2, 7, 2, E.MAT.WATER);
      w.fillRect('back', x - 5, groundY - 12, 1, 9, E.MAT.WOOD);
      w.fillRect('back', x + 5, groundY - 12, 1, 9, E.MAT.WOOD);
      for (let k = 0; k < 4; k++) w.fillRect('main', x - 7 + k, groundY - 13 - k, 15 - k * 2, 1, E.MAT.ROOF);
      w.fillRect('back', x, groundY - 12, 1, 5, E.MAT.IRON);
      w.fillRect('back', x - 1, groundY - 7, 3, 2, E.MAT.WOOD);
    },
    fence(w, x, groundY, len) {
      for (let k = 0; k < len; k++) {
        if (k % 5 === 0) w.fillRect('back', x + k, groundY - 4, 1, 4, E.MAT.WOOD);
        w.set('back', x + k, groundY - 3, E.MAT.WOOD);
        w.set('back', x + k, groundY - 1, E.MAT.WOOD);
      }
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
  E.generate = (seed = 1, W = 1000, H = 180) => {
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
    for (let x = 0; x < W; x++) {
      const g = ground[x];
      const dirtDepth = 6 + Math.round(n3(x * 0.1) * 6);
      for (let y = g; y < H; y++) {
        const d = y - g;
        w.set('main', x, y, d < dirtDepth ? E.MAT.DIRT : d < dirtDepth + 2 && E.hash2(x, y) < 0.5 ? E.MAT.DIRT : E.MAT.STONE);
        w.set('back', x, y, E.MAT.ROCK);
      }
    }
    // cavernas (minhocas de ruído) abaixo do chão, com cristais
    for (let k = 0; k < 6; k++) {
      let x = 60 + rnd() * (W - 120), y = base + 30 + rnd() * 25, ang = rnd() * 6.28;
      const len = 80 + rnd() * 120;
      for (let s = 0; s < len; s++) {
        ang += (rnd() - 0.5) * 0.5;
        x += Math.cos(ang) * 1.6;
        y += Math.sin(ang) * 0.5;
        y = Math.max(ground[Math.round(x)] + 18 || y, Math.min(H - 12, y));
        const r = 16 + n2(s * 0.05 + k) * 10;
        for (let yy = -r / 2; yy <= r / 2; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy * 4 <= r * r) w.set('main', Math.round(x + xx), Math.round(y + yy), 0);
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
    castle(w, x0, gy, rnd) {
      const CW = 300, wallH = 58, floors = [gy, gy - 21, gy - 42];
      const x1 = x0 + CW;
      // fundo de pedra e interior limpo
      for (let y = gy - wallH; y < gy; y++)
        for (let x = x0; x < x1; x++) {
          w.set('main', x, y, 0);
          w.set('front', x, y, 0);
          w.set('back', x, y, E.hash2(x >> 2, y >> 1) < 0.18 ? E.MAT.MOSS : E.MAT.MASONRY);
        }
      for (let x = x0 - 6; x < x1 + 6; x++) for (let y = gy; y < gy + 4; y++) w.set('main', x, y, E.MAT.MASONRY);
      // muralhas laterais (portão à esquerda)
      w.fillRect('main', x0, gy - wallH, 5, wallH - 20, E.MAT.MASONRY);
      w.fillRect('main', x1 - 5, gy - wallH, 5, wallH, E.MAT.MASONRY);
      // andares com vãos e escadas
      for (let f = 1; f < floors.length; f++) {
        const y = floors[f];
        w.fillRect('main', x0 + 5, y, CW - 10, 2, E.MAT.MASONRY);
        const gap = f % 2 ? x0 + 30 : x1 - 50;
        w.fillRect('main', gap, y, 16, 2, 0);
        E.Struct.ladder(w, gap + 6, y, floors[f - 1] - 1);
      }
      // telhado com ameias
      w.fillRect('main', x0 - 2, gy - wallH - 1, CW + 4, 2, E.MAT.MASONRY);
      for (let x = x0 - 2; x < x1 + 2; x += 6) w.fillRect('main', x, gy - wallH - 4, 3, 3, E.MAT.MASONRY);
      E.Struct.ladder(w, x1 - 30, gy - wallH - 1, floors[2] - 1);
      for (let x = x1 - 30; x < x1 - 26; x++) if (w.idx(x, gy - wallH - 1) >= 0) w.col[w.idx(x, gy - wallH - 1)] = E.CT.ONEWAY;
      // torres nas pontas
      E.Struct.tower(w, x0 - 6, gy);
      E.Struct.tower(w, x1 + 6, gy);
      // janelas, estandartes, tochas
      for (let f = 0; f < floors.length; f++) {
        const fy = floors[f];
        for (let x = x0 + 22; x < x1 - 20; x += 34) {
          for (let y = fy - 14; y < fy - 7; y++) for (let k = 0; k < 6; k++) w.set('back', x + k, y, 0);
          E.Struct.torch(w, x + 14, fy - 7);
          if (rnd() < 0.5) E.Struct.banner(w, x - 8, fy - 19, 6, 12);
        }
      }
      // portão com porta
      w.entities.push({ id: 'portao' + x0, prefab: 'porta', x: x0 + 2, y: gy, facing: 1, props: {} });
      // sala do trono no último andar
      const tx = x0 + CW / 2;
      w.fillRect('back', tx - 4, floors[2] - 14, 9, 14, E.MAT.CLOTH);
      w.fillRect('main', tx - 3, floors[2] - 6, 7, 6, E.MAT.GOLD);
      E.Struct.lantern(w, tx - 18, floors[2] - 20, 4);
      E.Struct.lantern(w, tx + 18, floors[2] - 20, 4);
      w.entities.push({ id: 'trono' + x0, prefab: 'bau', x: tx + 12, y: floors[2], facing: 1, props: { loot: ['peitoral_ouro', 'elmo_ouro', 'espada_cavaleiro', 'pocao_grande', 'pocao'] } });
      // guardas
      const sp = (prefab, fy, xa, ww, interval, max) => w.spawners.push({ id: 'spC' + prefab + fy + xa, prefab, x: xa, y: fy - 18, w: ww, h: 16, interval, max, initial: max, range: 150, active: true });
      sp('esqueleto_guerreiro', floors[0], x0 + 40, 220, 18, 3);
      sp('esqueleto', floors[1], x0 + 40, 220, 22, 2);
      sp('esqueleto_guerreiro', floors[1], x0 + 60, 180, 22, 2);
      sp('espirito', floors[2], x0 + 60, 180, 30, 1);
      sp('esqueleto_guerreiro', floors[2], x0 + 40, 220, 25, 2);
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
  };

  // ---------- vilarejos ----------
  E.VILLAGES = {
    porto: {
      name: 'Porto da Areia', forge: true,
      stalls: [['pescador', ['peixe_assado', 'pao', 'maca', 'faca_arremesso', 'bomba', 'tocha_mao']], ['mercador', ['pocao', 'antidoto', 'lanca', 'arco_curto', 'botas_couro', 'capa_rubra', 'lanterna']]],
      folk: [['aldeao', 'Bem-vindo ao Porto da Areia!|Dizem que perto da pirâmide há catacumbas... e um rei que não morre.|O ferreiro aqui do lado deixa sua espada afiada como nunca.'], ['aldea', 'Os peixes andam sumindo...|O oceano a oeste esconde um navio afundado. Dizem que há safiras lá.'], ['guarda', 'Fique de olho nos escorpiões.|A entrada das catacumbas fica a leste da pirâmide.']],
    },
    oasis: {
      name: 'Oásis', forge: false,
      stalls: [['alquimista', ['pocao', 'pocao_grande', 'elixir', 'antidoto', 'regen', 'cogumelo_brilho', 'pocao_escudo']], ['mercador', ['carne_assada', 'pao', 'adaga_veneno', 'arco_curto', 'bomba', 'cristal_luz', 'botas_aladas']]],
      folk: [['aldeao', 'A água do oásis é a coisa mais preciosa do deserto.|Ouço passos de ossos vindos do subsolo à noite...'], ['aldea', 'O alquimista prepara poções com ervas daqui.|Dizem que o Rei Esqueleto guarda uma coroa de ouro.'], ['aldeao', 'Já foi às catacumbas? Leve antídoto: os escorpiões de lá são cruéis.']],
    },
    bosque: {
      name: 'Vila do Bosque', forge: true,
      stalls: [['armeiro', ['espada_cavaleiro', 'machado', 'martelo_guerra', 'lanca', 'elmo_ferro', 'peitoral_ferro', 'botas_ferro', 'capa_floresta', 'lingote_ferro']], ['alquimista', ['pocao', 'pocao_grande', 'regen', 'antidoto', 'pocao_escudo', 'cogumelo_brilho', 'bomba']]],
      folk: [['aldeao', 'As árvores da Floresta Grande têm mais de cem anos.|A leste há um covil cheio de gosma... o Slime Rei mora lá.'], ['aldea', 'Traga lingotes de ferro para o ferreiro, ele melhora sua armadura.|Cuidado com as aranhas à noite.'], ['guarda', 'O castelo a leste caiu nas mãos dos cavaleiros.|No fundo da mina da floresta antiga vive a Rainha Aranha.']],
    },
    gelada: {
      name: 'Vila Gelada', forge: true,
      stalls: [['armeiro', ['espada_gelo', 'cajado_arcano', 'elmo_ouro', 'peitoral_ouro', 'capa_gelida', 'botas_aladas', 'lingote_ferro']], ['alquimista', ['pocao_grande', 'carne_assada', 'bomba_gelo', 'pocao_escudo', 'elixir', 'antidoto']]],
      folk: [['aldeao', 'Brrr! Bem-vindo à Vila Gelada.|Na gruta a leste, um golem de gelo acordou.'], ['aldea', 'O lago congelado é lindo ao amanhecer.|Uma capa gélida protege do frio que deixa lento.'], ['guarda', 'Nunca enfrente o golem sem poções.|Os slimes de gelo grudam nas botas.']],
    },
  };
  E.Struct.stall = (w, x, gy, col) => {
    for (let y = gy - 14; y < gy; y++) {
      w.set('back', x - 9, y, E.MAT.WOOD);
      w.set('back', x + 9, y, E.MAT.WOOD);
    }
    for (let xx = x - 11; xx <= x + 11; xx++) for (let k = 0; k < 2; k++) w.set('back', xx, gy - 15 - k, E.MAT.CLOTH, ((xx + 30) >> 2) % 2 ? col : [235, 225, 205]);
    w.fillRect('back', x - 7, gy - 5, 15, 1, E.MAT.WOOD);
    for (const k of [-5, -1, 3]) w.set('back', x + k, gy - 6, E.MAT.GOLD);
  };
  E.Struct.forge = (w, x, gy) => {
    for (let y = gy - 18; y < gy; y++) for (let xx = x - 13; xx <= x + 13; xx++) w.set('back', xx, y, E.MAT.BRICK);
    w.fillRect('main', x - 15, gy - 19, 31, 1, E.MAT.ROOF);
    w.fillRect('main', x - 12, gy - 9, 8, 9, E.MAT.BRICK);
    w.fillRect('main', x - 11, gy - 30, 4, 11, E.MAT.BRICK);
    for (let y = gy - 6; y < gy - 2; y++) for (let xx = x - 10; xx < x - 6; xx++) {
      w.set('main', xx, y, 0);
      w.set('back', xx, y, E.MAT.LAVA);
    }
    w.lights.push(Object.assign({ x: x - 8, y: gy - 4, type: 'lava', embers: true }, E.LIGHTS.lava, { r: 30 }));
    w.fillRect('main', x + 3, gy - 2, 5, 1, E.MAT.IRON);
    w.fillRect('main', x + 4, gy - 1, 3, 1, E.MAT.IRON);
  };
  E.Struct.village = (w, cx, gy, rnd, kind, ground) => {
    const V = E.VILLAGES[kind];
    const snowy = kind === 'gelada', sandy = kind === 'porto' || kind === 'oasis';
    for (let x = cx - 122; x < cx + 122; x++) {
      for (let y = gy - 50; y < gy; y++) {
        w.set('main', x, y, 0);
        w.set('front', x, y, 0);
        w.set('back', x, y, 0);
      }
      for (let y = gy; y < gy + 6; y++) if (!w.get('main', x, y)) w.set('main', x, y, sandy ? E.MAT.SAND : E.MAT.DIRT);
      if (ground) ground[x] = gy;
    }
    // caminho de tábuas no centro
    for (let x = cx - 60; x < cx + 60; x++) w.set('main', x, gy, sandy ? E.MAT.SANDSTONE : snowy ? E.MAT.SNOW : E.MAT.PLANK);
    E.Struct.cabin(w, cx - 86, gy, rnd);
    E.Struct.cabin(w, cx + 86, gy, rnd);
    if (V.forge) {
      E.Struct.forge(w, cx - 34, gy);
      w.entities.push({ id: 'v' + kind + 'ferreiro', prefab: 'ferreiro', x: cx - 28, y: gy, facing: -1, props: {} });
    } else {
      // lagoa do oásis com palmeiras
      for (let x = cx - 48; x < cx - 20; x++) {
        const d = Math.round(Math.sin(((x - cx + 48) / 28) * Math.PI) * 4);
        for (let y = gy; y < gy + d; y++) w.set('main', x, y, E.MAT.WATER);
      }
      E.Struct.palm(w, cx - 52, gy, rnd);
      E.Struct.palm(w, cx - 16, gy, rnd);
    }
    const cols = [[200, 60, 50], [60, 110, 190], [70, 150, 80], [190, 140, 50]];
    V.stalls.forEach(([prefab, stock], k) => {
      const sx = cx + 2 + k * 46;
      E.Struct.stall(w, sx, gy, cols[(k + kind.length) % 4]);
      w.entities.push({ id: 'v' + kind + prefab + k, prefab, x: sx, y: gy, facing: -1, props: { stock } });
    });
    E.Struct.well(w, cx + 25, gy);
    for (const lx of [cx - 58, cx + 66]) {
      for (let y = gy - 15; y < gy; y++) w.set('back', lx, y, E.MAT.WOOD);
      E.Struct.lantern(w, lx, gy - 15, 2);
    }
    E.Struct.fence(w, cx - 120, gy, 10);
    E.Struct.fence(w, cx + 110, gy, 10);
    w.entities.push({ id: 'v' + kind + 'fogo', prefab: 'fogueira', x: cx - 58 + 4, y: gy, facing: 1, props: {} });
    V.folk.forEach(([prefab, fala], k) => w.entities.push({ id: 'v' + kind + 'npc' + k, prefab, x: cx - 10 + k * 34 + (prefab === 'guarda' ? 70 : 0), y: gy, facing: k % 2 ? -1 : 1, props: { fala } }));
    // placa com o nome
    w.lights.push(Object.assign({ x: cx, y: gy - 22 }, E.LIGHTS.lanterna, { r: 22, i: 0.7 }));
    if (snowy)
      for (let x = cx - 122; x < cx + 122; x++) {
        let y = gy - 50;
        while (y < gy && !w.solid(x, y)) y++;
        if (y < gy && E.hash2(x, 12) < 0.9) w.set('main', x, y - 1, E.MAT.SNOW);
      }
    w.villages ||= [];
    w.villages.push({ x: cx, name: V.name });
  };

  // ---------- mundo grande com biomas (estilo Terraria) ----------
  E.BIOME_NAMES = { oceano: 'Oceano', praia: 'Praia', deserto: 'Deserto', floresta: 'Floresta das Ruínas', floresta_grande: 'Floresta Grande', castelo: 'Castelo da Floresta', neve: 'Terras Geladas', oceano_gelado: 'Oceano Gelado' };
  E.generateWorld = (seed = 1) => {
    const W = 9500, H = 300, SEA = 150, T = 170; // T = meia-largura das faixas de transição
    const w = new E.World(W, H);
    const rnd = E.rng(seed * 7 + 3);
    const n1 = vnoise(seed + 101), n2 = vnoise(seed + 202), n3 = vnoise(seed + 303);
    const B = [['oceano', 0, 600], ['praia', 600, 820], ['deserto', 820, 2900], ['floresta', 2900, 3900], ['floresta_grande', 3900, 6000], ['castelo', 6000, 6600], ['neve', 6600, 8900], ['oceano_gelado', 8900, 9500]];
    w.biomes = B.map(([id, x0, x1]) => ({ id, x0, x1 }));
    const idxAt = (x) => Math.max(0, B.findIndex((b) => x >= b[1] && x < b[2]));
    const sm = (t) => t * t * (3 - 2 * t);
    const mixAt = (x) => {
      const i = idxAt(x), [id, x0, x1] = B[i];
      if (i > 0 && x - x0 < T) return { a: id, b: B[i - 1][0], t: 0.5 * sm(1 - (x - x0) / T) };
      if (i < B.length - 1 && x1 - x < T) return { a: id, b: B[i + 1][0], t: 0.5 * sm(1 - (x1 - x) / T) };
      return { a: id, b: id, t: 0 };
    };
    const pick = (x, y) => {
      const m = mixAt(x);
      if (!m.t) return m.a;
      const h = E.hash2(x >> 2, (y >> 2) + 911) * 0.6 + E.hash2(x, y) * 0.4;
      return h < m.t ? m.b : m.a;
    };
    // 1) Floresta das Ruínas original encaixada
    const chunk = E.generate(seed);
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
    for (let y = chunk.H + DY; y < H; y++)
      for (let x = OX; x < OX + chunk.W; x++) {
        w.set('main', x, y, E.MAT.STONE);
        w.set('back', x, y, E.MAT.ROCK);
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
    for (const v of VILLAGES) plateau(v.x - 118, v.x + 118, ground[v.x], 45);
    const nearV = (x, r = 140) => VILLAGES.some((v) => Math.abs(x - v.x) < r) || CAVES.some((c) => Math.abs(x - c.x) < 30) || SHAFTS.some((s) => Math.abs(x - s) < 14) || KEEPS.some(([k]) => Math.abs(x - k) < 45);
    // 3) materiais por célula
    const fillCol = (x) => {
      const g = ground[x];
      for (let y = g; y < H; y++) {
        const d = y - g, b = pick(x, y);
        let m;
        if (b === 'oceano' || b === 'praia' || b === 'oceano_gelado') m = d < 7 ? E.MAT.SAND : d < 18 ? E.MAT.SANDSTONE : E.MAT.STONE;
        else if (b === 'deserto') m = d < 10 ? E.MAT.SAND : d < 34 ? E.MAT.SANDSTONE : E.MAT.STONE;
        else if (b === 'neve') m = d < 3 ? E.MAT.SNOW : d < 11 ? E.MAT.DIRT : E.MAT.STONE;
        else m = d < 8 + Math.round(n1(x * 0.1) * 4) ? E.MAT.DIRT : E.MAT.STONE;
        if (m === E.MAT.STONE && E.hash2(x >> 3, y >> 2) < 0.08) m = E.MAT.MOSS;
        w.set('main', x, y, m);
        if (d > 1) w.set('back', x, y, b === 'deserto' && d < 40 ? E.MAT.SANDSTONE : E.MAT.ROCK);
      }
    };
    for (let x = 0; x < W; x++) {
      if (inChunk(x)) continue;
      fillCol(x);
      const g = ground[x], m = mixAt(x);
      const wOf = (id) => (m.a === id ? 1 - m.t : 0) + (m.b === id ? m.t : 0);
      if (wOf('oceano') + wOf('oceano_gelado') + wOf('praia') > 0 && g > SEA) for (let y = SEA; y < g; y++) w.set('main', x, y, E.MAT.WATER);
      if (wOf('oceano_gelado') > 0.5 && g > SEA && E.hash2(x, 3) < wOf('oceano_gelado')) w.set('main', x, SEA, E.MAT.ICE);
      const fw = wOf('floresta') + wOf('floresta_grande') + wOf('castelo');
      if (fw > 0 && E.hash2(x, 17) < fw * 1.2 && g <= SEA) {
        const tall = Math.max(1, Math.round((3 + n2(x * 0.05) * 8 + E.hash2(x, 1) * 3) * Math.min(1, fw * 1.4)));
        for (let k = 1; k <= tall; k++) {
          const c = E.matColor(E.MAT.GRASS, x, g - k).map((v) => Math.min(255, v * (0.75 + (k / tall) * 0.5)));
          w.set(k <= 2 && E.hash2(x, k) < 0.55 ? 'front' : 'main', x, g - k, E.MAT.GRASS, c);
        }
        if (w.get('main', x, g) === E.MAT.DIRT) w.set('main', x, g, E.MAT.MOSS);
        if (E.hash2(x, 91) < 0.03 * fw) w.set('main', x, g - tall - 1, E.MAT.FLOWER);
      }
      if (wOf('deserto') > 0.2 && fw > 0.15 && E.hash2(x, 23) < 0.25) w.set('main', x, g - 1, E.MAT.GRASS, [150, 140, 70]);
      const sw = wOf('neve');
      if (sw > 0 && sw < 1 && E.hash2(x, 41) < sw) w.set('main', x, g, E.MAT.SNOW);
    }
    // lago congelado
    for (let x = lake; x < lake + 90; x++) {
      const dep = Math.round(Math.sin(((x - lake) / 90) * Math.PI) * 12), top = ground[lake];
      for (let y = top - 6; y < top; y++) w.set('main', x, y, 0);
      for (let y = top; y < top + dep; y++) w.set('main', x, y, y === top ? E.MAT.ICE : E.MAT.WATER);
      ground[x] = top;
    }
    // cavernas subterrâneas: túneis longos + salões enormes
    const carveC = (cx, cy, rx, ry) => {
      for (let yy = -ry; yy <= ry; yy++)
        for (let xx = -rx; xx <= rx; xx++) {
          const X = Math.round(cx + xx), Y = Math.round(cy + yy);
          if (X < 2 || X >= W - 2 || Y >= H - 5) continue;
          if ((xx / rx) ** 2 + (yy / ry) ** 2 + (E.hash2(X, Y) - 0.5) * 0.22 >= 1) continue;
          if (Y > ground[X] + 16) w.set('main', X, Y, 0);
        }
    };
    const okUnder = (x) => !(x > OX - 60 && x < OX + chunk.W + 60) && !mixAt(Math.round(x)).a.startsWith('oceano');
    for (let k = 0; k < 46; k++) {
      let x = 60 + rnd() * (W - 120), y = SEA + 45 + rnd() * (H - SEA - 75), ang = rnd() * 6.28;
      if (!okUnder(x)) continue;
      for (let s = 0; s < 260; s++) {
        ang += (rnd() - 0.5) * 0.45;
        x += Math.cos(ang) * 2;
        const gx = Math.round(Math.max(0, Math.min(W - 1, x)));
        y = Math.max(ground[gx] + 26, Math.min(H - 16, y + Math.sin(ang) * 0.7));
        if (!okUnder(x)) break;
        const r = 9 + n2(s * 0.05 + k) * 8;
        carveC(x, y, r * 1.5, r * 0.75 + 3);
        if (s % 60 === 30) {
          w.fillEllipse('main', x, y + r * 0.75 + 3, 2.5, 1.5, E.MAT.CRYSTAL);
          w.lights.push(Object.assign({ x, y: y + r * 0.75, type: 'cristal' }, E.LIGHTS.cristal));
        }
      }
    }
    const halls = [];
    const hall = (x, y, rx, ry) => {
      carveC(x, y, rx, ry);
      halls.push({ x, y, rx, ry });
    };
    for (let k = 0; k < 34; k++) {
      const x = 90 + rnd() * (W - 180), y = SEA + 62 + rnd() * (H - SEA - 100);
      if (!okUnder(x)) continue;
      hall(x, y, 45 + rnd() * 55, 15 + rnd() * 14);
    }
    // poços de mina levam do chão aos salões
    for (const sx of SHAFTS) {
      const end = E.Struct.mineShaft(w, sx, ground[sx], 44);
      hall(end.x - 10, end.y - 14, 70, 18);
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
    for (let x = 6520; x < 8900; x += 14 + Math.floor(rnd() * 20)) {
      if ((x > lake - 10 && x < lake + 100) || nearV(x)) continue;
      const sw = wAt(x, 'neve');
      if (sw > 0.5 || rnd() < sw * 1.6) E.Struct.snowPine(w, x, ground[x], rnd);
      else if (rnd() < 0.5) E.Struct.tree(w, x, ground[x], rnd, 0.9);
    }
    for (const v of VILLAGES) E.Struct.village(w, v.x, ground[v.x], rnd, v.kind, ground);
    // entradas das masmorras (cada uma leva a um mapa com chefe)
    for (const c of CAVES) {
      const end = E.Struct.caveEntrance(w, c.x, ground[c.x], rnd, 70);
      const dx = end.x + 30;
      let dy = end.y - 12;
      while (dy < H - 2 && !w.solid(dx, dy + 1)) dy++;
      for (let xx = dx - 3; xx <= dx + 3; xx++) for (let yy = dy - 20; yy <= dy; yy++) w.set('main', xx, yy, 0);
      w.entities.push({ id: 'masmorra_' + c.dest, prefab: 'porta', x: dx, y: dy + 1, facing: 1, props: { destino: c.dest } });
      E.Struct.torch(w, dx - 6, dy - 4);
      E.Struct.torch(w, dx + 6, dy - 4);
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
      while (fy < H - 2 && !w.solid(Math.round(h.x), fy + 1)) fy++;
      if (k % 3 === 0 && fy < H - 3) w.entities.push({ id: 'bauH' + k, prefab: 'bau', x: Math.round(h.x), y: fy + 1, facing: 1, props: { loot: treasure[k % treasure.length] } });
      if (k % 2 === 0) {
        w.fillEllipse('main', h.x + h.rx * 0.4, fy + 1, 3, 1.5, E.MAT.CRYSTAL);
        w.lights.push(Object.assign({ x: h.x + h.rx * 0.4, y: fy - 2, type: 'cristal' }, E.LIGHTS.cristal));
      } else E.Struct.mushrooms(w, Math.round(h.x - h.rx * 0.3), fy + 1, rnd);
    });
    for (const x of [700, 1650, 2130 - 40, 4150, 5300, 5850, 6750, 8250, 8800]) w.entities.push({ id: 'fogoW' + x, prefab: 'fogueira', x, y: ground[x], facing: 1, props: {} });
    w.entities.push({ id: 'merc' + (OX + 75), prefab: 'mercador', x: OX + 75, y: ground[OX + 75], facing: -1, props: { stock: ['pocao', 'pao', 'maca', 'antidoto', 'tocha_mao', 'faca_arremesso', 'lanca', 'machado', 'botas_couro', 'capa_floresta'] } });
    for (let x = 60; x < W - 60; x += 70 + Math.floor(rnd() * 60)) {
      if (inChunk(x) || nearV(x)) continue;
      const y = ground[x] - 1;
      if (w.cellType(x, y) !== E.CT.NONE) continue;
      w.entities.push({ id: 'itW' + x, prefab: '__item', x, y, props: { item: rnd() < 0.7 ? 'moeda' : ['pocao', 'regen', 'maca', 'pao', 'faca_arremesso'][Math.floor(rnd() * 5)], qty: 1 + Math.floor(rnd() * 3) } });
    }
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
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        w.set('main', x, y, E.hash2(x >> 3, y >> 2) < TH.accK ? ACC : WALL);
        w.set('back', x, y, theme === 'areia' && E.hash2(x >> 4, y >> 3) < 0.5 ? E.MAT.SANDSTONE : E.MAT.ROCK);
      }
    const carve = (cx, cy, rx, ry) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (E.hash2(x, y) - 0.5) * 0.25;
          if (d < 1 && y > 2 && y < H - 3 && x > 2 && x < W - 3) w.set('main', x, y, 0);
        }
    };
    // salão do chefe no fim
    const AX = W - 125;
    // corredor principal ondulado até o salão
    let y = H * 0.45;
    for (let x = 6; x < AX; x += 2) {
      y += (n1(x * 0.02) - 0.5) * 2.2;
      y = Math.max(50, Math.min(H - 70, y));
      carve(x, y, 15, 15 + n1(x * 0.05) * 10);
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

'use strict';
// Núcleo: modelo de dados, cores, charsets e renderizador de células ASCII.
(function () {
  const AF = (window.AF = window.AF || {});

  AF.uid = () => Math.random().toString(36).slice(2, 10);
  AF.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  AF.deepClone = (o) => JSON.parse(JSON.stringify(o));

  // ---------------- cores ----------------
  const rgbCache = new Map();
  AF.hexToRgb = (h) => {
    let r = rgbCache.get(h);
    if (r) return r;
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s, 16);
    r = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(h, r);
    return r;
  };
  AF.rgbToHex = (r, g, b) =>
    '#' +
    ((1 << 24) | (AF.clamp(Math.round(r), 0, 255) << 16) | (AF.clamp(Math.round(g), 0, 255) << 8) | AF.clamp(Math.round(b), 0, 255))
      .toString(16)
      .slice(1);
  AF.lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  AF.PALETTES = {
    'Sweetie 16': ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
    'PICO-8': ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    'CGA / Terminal': ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'],
    'Game Boy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    'Fósforo verde': ['#001a00', '#004d00', '#00a000', '#33ff33', '#b3ffb3'],
    'Âmbar': ['#1a0f00', '#663d00', '#b36b00', '#ffb000', '#ffd27f'],
    'Forge (starter)': ['#0a0a0f', '#1c1e26', '#2a2a35', '#555a6e', '#9aa0b0', '#e8e8f0', '#ff5a4f', '#ffd9b3', '#4f8cff', '#2a1a0e', '#7a4a26', '#c8964b', '#5fd35f', '#2f8f3f', '#5fb0ff', '#0b2a4a', '#ff8c1a', '#ffd23f', '#ff3b1a', '#8a2be2', '#73eff7'],
  };

  // ---------------- charsets ----------------
  let ascii = '';
  for (let i = 33; i < 127; i++) ascii += String.fromCharCode(i);
  let braille = '';
  for (let i = 0x2801; i <= 0x28ff; i += 7) braille += String.fromCharCode(i);
  AF.CHARSETS = {
    ASCII: ascii,
    Blocos: '█▓▒░▀▄▌▐▖▗▘▝▚▞▙▛▜▟▁▂▃▅▆▇▔▕▏',
    Linhas: '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╯╰╱╲╳',
    Símbolos: '·•°∙○●◘◙◦☼♥♦♣♠♪♫★☆↑↓←→↖↗↘↙▲▼◄►◆◇■□▪▫≈≡±×÷√∞≤≥¤§¶†‡Ω',
    Braille: braille,
  };

  // ---------------- espelhamento de glifos ----------------
  const pairs = (s) => {
    const m = {};
    for (let i = 0; i < s.length; i += 2) {
      m[s[i]] = s[i + 1];
      m[s[i + 1]] = s[i];
    }
    return m;
  };
  const MIRROR_H = pairs('/\\()[]{}<>bdpq▌▐▖▗▘▝▙▟▛▜▚▞┌┐└┘├┤╔╗╚╝╠╣╭╮╰╯╱╲◄►←→↖↗↙↘▏▕');
  const MIRROR_V = pairs("/\\^vnuMW▀▄▘▖▝▗▛▙▜▟▚▞┌└┐┘┬┴╔╚╗╝╦╩╭╰╮╯╱╲▲▼↑↓',bpdq▔▁");
  const braillePerm = (code, perm) => {
    const bits = code - 0x2800;
    let out = 0;
    for (let i = 0; i < 8; i++) if (bits & (1 << i)) out |= 1 << perm[i];
    return String.fromCharCode(0x2800 + out);
  };
  // bits: 0=(0,0) 1=(0,1) 2=(0,2) 3=(1,0) 4=(1,1) 5=(1,2) 6=(0,3) 7=(1,3)
  const BR_H = [3, 4, 5, 0, 1, 2, 7, 6];
  const BR_V = [6, 2, 1, 7, 5, 4, 0, 3];
  AF.mirrorChar = (c, axis) => {
    if (c == null) return c;
    const code = c.codePointAt(0);
    if (code >= 0x2800 && code <= 0x28ff) return braillePerm(code, axis === 'h' ? BR_H : BR_V);
    const m = axis === 'h' ? MIRROR_H : MIRROR_V;
    return m[c] || c;
  };

  // ---------------- grid ----------------
  // célula: {c: char|null, f: '#hex', b: '#hex'|null}; c===null => transparente
  AF.Grid = {
    create(w, h) {
      return { w, h, cells: Array.from({ length: w * h }, () => ({ c: null, f: '#ffffff', b: null })) };
    },
    clone(g) {
      return { w: g.w, h: g.h, cells: g.cells.map((x) => ({ c: x.c, f: x.f, b: x.b })) };
    },
    get(g, x, y) {
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) return null;
      return g.cells[y * g.w + x];
    },
    set(g, x, y, cell) {
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
      g.cells[y * g.w + x] = { c: cell.c, f: cell.f, b: cell.b };
    },
    isEmpty(cell) {
      return !cell || ((cell.c == null || cell.c === ' ') && !cell.b);
    },
    resize(g, w, h, ax = 0, ay = 0) {
      // ax/ay: 0 = ancorar em cima/esquerda, 0.5 = centro, 1 = baixo/direita
      const n = AF.Grid.create(w, h);
      const ox = Math.round((w - g.w) * ax), oy = Math.round((h - g.h) * ay);
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) AF.Grid.set(n, x + ox, y + oy, g.cells[y * g.w + x]);
      return n;
    },
    flip(g, axis) {
      const n = AF.Grid.create(g.w, g.h);
      for (let y = 0; y < g.h; y++)
        for (let x = 0; x < g.w; x++) {
          const s = g.cells[y * g.w + x];
          const tx = axis === 'h' ? g.w - 1 - x : x, ty = axis === 'v' ? g.h - 1 - y : y;
          AF.Grid.set(n, tx, ty, { c: AF.mirrorChar(s.c, axis), f: s.f, b: s.b });
        }
      return n;
    },
    shift(g, dx, dy, wrap = true) {
      const n = AF.Grid.create(g.w, g.h);
      for (let y = 0; y < g.h; y++)
        for (let x = 0; x < g.w; x++) {
          let tx = x + dx, ty = y + dy;
          if (wrap) {
            tx = (tx + g.w) % g.w;
            ty = (ty + g.h) % g.h;
          }
          AF.Grid.set(n, tx, ty, g.cells[y * g.w + x]);
        }
      return n;
    },
    // monta um grid a partir de linhas de texto + linhas de chaves de cor + legenda
    // legenda: { K: '#fg' | {f:'#fg', b:'#bg'} }; espaço com chave ' ' = transparente
    fromRows(rows, colorRows, legend, defaultFg = '#ffffff') {
      const h = rows.length, w = Math.max(...rows.map((r) => [...r].length));
      const g = AF.Grid.create(w, h);
      for (let y = 0; y < h; y++) {
        const chars = [...rows[y]];
        const keys = colorRows ? [...(colorRows[y] || '')] : [];
        for (let x = 0; x < w; x++) {
          const c = chars[x] ?? ' ';
          const k = keys[x] ?? ' ';
          const L = legend && legend[k];
          const f = L ? (typeof L === 'string' ? L : L.f || defaultFg) : defaultFg;
          const b = L && typeof L === 'object' ? L.b || null : null;
          if (c === ' ' && !b) continue;
          g.cells[y * w + x] = { c, f, b };
        }
      }
      return g;
    },
    toText(g) {
      const lines = [];
      for (let y = 0; y < g.h; y++) {
        let s = '';
        for (let x = 0; x < g.w; x++) s += g.cells[y * g.w + x].c ?? ' ';
        lines.push(s.replace(/\s+$/, ''));
      }
      return lines.join('\n');
    },
  };

  // ---------------- asset helpers ----------------
  AF.newAsset = (kind, name, w, h) => ({
    id: AF.uid(),
    name,
    kind, // 'sprite' | 'tile' | 'fx'
    w,
    h,
    solid: kind === 'tile',
    emissive: false,
    anims: [{ name: 'idle', fps: 6, loop: true, frames: [AF.Grid.create(w, h)] }],
  });
  AF.frameAt = (anim, t) => {
    const n = anim.frames.length;
    if (n <= 1) return anim.frames[0];
    let i = Math.floor(t * (anim.fps || 6));
    i = anim.loop === false ? Math.min(i, n - 1) : i % n;
    return anim.frames[i];
  };

  // ---------------- renderizador ----------------
  AF.view = {
    family: "'Cascadia Mono','Consolas','DejaVu Sans Mono','Menlo','Courier New',monospace",
    lineHeight: 1.2,
  };
  const mCache = new Map();
  const measureCtx = document.createElement('canvas').getContext('2d');
  AF.metrics = (size) => {
    const key = size + '|' + AF.view.family + '|' + AF.view.lineHeight;
    let m = mCache.get(key);
    if (m) return m;
    measureCtx.font = `${size}px ${AF.view.family}`;
    const w = measureCtx.measureText('M').width;
    m = { size, cw: Math.max(1, Math.round(w)), ch: Math.max(1, Math.round(size * AF.view.lineHeight)) };
    mCache.set(key, m);
    return m;
  };
  AF.resetMetrics = () => mCache.clear();
  AF.prepCtx = (ctx, size) => {
    ctx.font = `${size}px ${AF.view.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  };

  // quadrantes: UL=1 UR=2 LL=4 LR=8
  AF.QUAD_CHARS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
  const QUAD_MASK = {};
  AF.QUAD_CHARS.forEach((c, i) => (QUAD_MASK[c] = i));

  function drawBlock(ctx, code, c, fg, bg, x, y, cw, ch) {
    ctx.fillStyle = fg;
    const q = QUAD_MASK[c];
    if (q !== undefined && q > 0) {
      const hw = Math.round(cw / 2), hh = Math.round(ch / 2);
      if (q & 1) ctx.fillRect(x, y, hw, hh);
      if (q & 2) ctx.fillRect(x + hw, y, cw - hw, hh);
      if (q & 4) ctx.fillRect(x, y + hh, hw, ch - hh);
      if (q & 8) ctx.fillRect(x + hw, y + hh, cw - hw, ch - hh);
      return;
    }
    if (code >= 0x2581 && code <= 0x2587) {
      const hh = Math.round((ch * (code - 0x2580)) / 8);
      ctx.fillRect(x, y + ch - hh, cw, hh);
      return;
    }
    if (code >= 0x2589 && code <= 0x258f) {
      const ww = Math.round((cw * (0x2590 - code)) / 8);
      ctx.fillRect(x, y, ww, ch);
      return;
    }
    if (code === 0x2594) return ctx.fillRect(x, y, cw, Math.max(1, Math.round(ch / 8)));
    if (code === 0x2595) {
      const ww = Math.max(1, Math.round(cw / 8));
      return ctx.fillRect(x + cw - ww, y, ww, ch);
    }
    if (code >= 0x2591 && code <= 0x2593) {
      const s = Math.max(1, Math.round(cw / 5));
      const lvl = code - 0x2590; // 1,2,3
      for (let iy = 0, py = 0; py < ch; iy++, py += s)
        for (let ix = 0, px = 0; px < cw; ix++, px += s) {
          const on = lvl === 1 ? ix % 2 === 0 && iy % 2 === 0 : lvl === 2 ? (ix + iy) % 2 === 0 : !(ix % 2 === 1 && iy % 2 === 1);
          if (on) ctx.fillRect(x + px, y + py, Math.min(s, cw - px), Math.min(s, ch - py));
        }
    }
  }

  function drawBraille(ctx, code, fg, x, y, cw, ch) {
    const bits = code - 0x2800;
    if (!bits) return;
    ctx.fillStyle = fg;
    const r = Math.max(0.8, Math.min(cw / 2, ch / 4) * 0.32);
    const pos = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      if (!(bits & (1 << i))) continue;
      const px = x + cw * (pos[i][0] === 0 ? 0.28 : 0.72);
      const py = y + ch * (0.125 + 0.25 * pos[i][1]);
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // ctx precisa ter passado por AF.prepCtx
  AF.drawGlyph = (ctx, c, fg, bg, x, y, cw, ch) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, cw, ch);
    }
    if (c == null || c === ' ') return;
    const code = c.codePointAt(0);
    if (code >= 0x2580 && code <= 0x259f) return drawBlock(ctx, code, c, fg, bg, x, y, cw, ch);
    if (code >= 0x2800 && code <= 0x28ff) return drawBraille(ctx, code, fg, x, y, cw, ch);
    ctx.fillStyle = fg;
    ctx.fillText(c, x + cw / 2, y + ch / 2 + 1);
  };

  AF.drawGrid = (ctx, g, ox, oy, m, opts = {}) => {
    const { cw, ch } = m;
    const flip = opts.flip;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const cell = g.cells[y * g.w + x];
        if (cell.c == null && !cell.b) continue;
        const dx = flip ? g.w - 1 - x : x;
        const c = flip ? AF.mirrorChar(cell.c, 'h') : cell.c;
        AF.drawGlyph(ctx, c, cell.f, cell.b, ox + dx * cw, oy + y * ch, cw, ch);
      }
  };

  AF.renderGridCanvas = (g, size, canvas) => {
    const m = AF.metrics(size);
    canvas = canvas || document.createElement('canvas');
    canvas.width = Math.max(1, g.w * m.cw);
    canvas.height = Math.max(1, g.h * m.ch);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    AF.prepCtx(ctx, size);
    AF.drawGrid(ctx, g, 0, 0, m);
    return canvas;
  };

  // cobertura de cada glifo em uma grade gx*gy (0..1), usada pelo conversor e pela luz
  const covCache = new Map();
  AF.glyphCoverage = (chars, gx, gy) => {
    const key = chars + '|' + gx + 'x' + gy + '|' + AF.view.family;
    if (covCache.has(key)) return covCache.get(key);
    const size = 48;
    const m = AF.metrics(size);
    const cv = document.createElement('canvas');
    cv.width = m.cw;
    cv.height = m.ch;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const out = new Map();
    for (const c of new Set([...chars])) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, m.cw, m.ch);
      AF.prepCtx(ctx, size);
      AF.drawGlyph(ctx, c, '#fff', null, 0, 0, m.cw, m.ch);
      const d = ctx.getImageData(0, 0, m.cw, m.ch).data;
      const v = new Float32Array(gx * gy), cnt = new Float32Array(gx * gy);
      for (let y = 0; y < m.ch; y++)
        for (let x = 0; x < m.cw; x++) {
          const i = Math.min(gy - 1, Math.floor((y * gy) / m.ch)) * gx + Math.min(gx - 1, Math.floor((x * gx) / m.cw));
          v[i] += d[(y * m.cw + x) * 4] / 255;
          cnt[i]++;
        }
      for (let i = 0; i < v.length; i++) v[i] /= cnt[i] || 1;
      out.set(c, v);
    }
    covCache.set(key, out);
    return out;
  };
  AF.glyphDensity = (c) => {
    const all = AF.glyphCoverage(c, 1, 1);
    return all.get(c)[0];
  };
})();

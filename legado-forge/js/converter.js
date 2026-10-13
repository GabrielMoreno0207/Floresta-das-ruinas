'use strict';
// Conversor imagem -> ASCII. Cada modo reimplementa a técnica de uma ferramenta conhecida:
//  ramp    -> jp2a / ascii-image-converter: luminância média da célula indexa uma rampa de caracteres
//  glyph   -> libcaca / "shape vectors": compara a cobertura sub-célula com o bitmap de cada glifo
//  edge    -> shader ASCII do Acerola: DoG + Sobel, ângulo do gradiente vira | - _ / \
//  braille -> drawille / ascii-image-converter --braille: 2x4 pontos por célula com limiar + dither
//  half    -> timg / chafa (half-blocks): ▀ com fg = pixel de cima e bg = pixel de baixo
//  quad    -> chafa (quadrantes): melhor partição 2x2 em duas cores
(function () {
  const AF = window.AF;

  AF.RAMPS = {
    'Padrão (10)': ' .:-=+*#%@',
    jp2a: "   ...',;:clodxkO0KXNWM",
    'Paul Bourke (70)': " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    Acerola: ' .;coPO?@█',
    Blocos: ' ░▒▓█',
    Mínimo: ' .oO@',
    Pontos: ' ·∙•●',
  };

  AF.CONVERT_DEFAULTS = {
    mode: 'ramp',
    cols: 40,
    rows: 0, // 0 = automático pela proporção
    ramp: AF.RAMPS['Padrão (10)'],
    invert: false,
    brightness: 0,
    contrast: 1,
    gamma: 1,
    saturation: 1,
    dither: 'none', // none | fs | bayer
    colorMode: 'color', // mono | color | palette
    monoColor: '#e8e8f0',
    palette: 'Sweetie 16',
    normalizeColor: true,
    bgMode: 'none', // none | dim | full
    bgDim: 0.25,
    alphaThreshold: 0.5,
    chroma: false,
    chromaColor: '#00ff00',
    chromaTol: 0.25,
    edgeThreshold: 0.35,
    edgeMin: 5,
    brailleThreshold: 0.5,
    glyphSet: 'ASCII',
    glyphSharpen: 1,
    autoLevels: false,
    measuredRamp: false,
  };

  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  function sample(src, cols, rows, sx, sy) {
    const W = cols * sx, H = rows * sy;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, W, H);
    return { W, H, data: ctx.getImageData(0, 0, W, H).data };
  }

  function preprocess(s, o) {
    const n = s.W * s.H;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), L = new Float32Array(n), A = new Uint8Array(n);
    const ck = o.chroma ? AF.hexToRgb(o.chromaColor) : null;
    for (let i = 0; i < n; i++) {
      let r = s.data[i * 4] / 255, g = s.data[i * 4 + 1] / 255, b = s.data[i * 4 + 2] / 255;
      const a = s.data[i * 4 + 3] / 255;
      let opaque = a >= o.alphaThreshold;
      if (opaque && ck) {
        const d = Math.hypot(r - ck[0] / 255, g - ck[1] / 255, b - ck[2] / 255) / Math.sqrt(3);
        if (d < o.chromaTol) opaque = false;
      }
      A[i] = opaque ? 1 : 0;
      if (o.saturation !== 1) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = l + (r - l) * o.saturation;
        g = l + (g - l) * o.saturation;
        b = l + (b - l) * o.saturation;
      }
      const adj = (v) => {
        v = (v - 0.5) * o.contrast + 0.5 + o.brightness;
        v = AF.clamp(v, 0, 1);
        return o.gamma !== 1 ? Math.pow(v, 1 / o.gamma) : v;
      };
      r = adj(r);
      g = adj(g);
      b = adj(b);
      R[i] = r;
      G[i] = g;
      B[i] = b;
      let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (o.invert) l = 1 - l;
      L[i] = l;
    }
    return { W: s.W, H: s.H, R, G, B, L, A };
  }

  // média de cor/luminância numa região de pixels opacos
  function regionAvg(p, x0, y0, sx, sy, filter) {
    let r = 0, g = 0, b = 0, l = 0, n = 0, total = 0;
    for (let y = y0; y < y0 + sy; y++)
      for (let x = x0; x < x0 + sx; x++) {
        const i = y * p.W + x;
        total++;
        if (!p.A[i] || (filter && !filter(i))) continue;
        r += p.R[i];
        g += p.G[i];
        b += p.B[i];
        l += p.L[i];
        n++;
      }
    if (!n) return { n: 0, total, r: 0, g: 0, b: 0, l: 0 };
    return { n, total, r: r / n, g: g / n, b: b / n, l: l / n };
  }

  function makeColorizer(o) {
    const pal = o.colorMode === 'palette' ? (AF.PALETTES[o.palette] || AF.PALETTES['Sweetie 16']).map(AF.hexToRgb) : null;
    const nearest = (r, g, b) => {
      let best = pal[0], bd = Infinity;
      for (const c of pal) {
        const dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
        const d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      return best;
    };
    return {
      fg(avg, normalize) {
        if (o.colorMode === 'mono') return o.monoColor;
        let r = avg.r * 255, g = avg.g * 255, b = avg.b * 255;
        if (normalize && o.normalizeColor) {
          const mx = Math.max(r, g, b, 1);
          const k = Math.min(255 / mx, 4);
          r *= k;
          g *= k;
          b *= k;
        }
        if (pal) [r, g, b] = nearest(r, g, b);
        return AF.rgbToHex(r, g, b);
      },
      raw(avg) {
        if (o.colorMode === 'mono') return o.monoColor;
        let r = avg.r * 255, g = avg.g * 255, b = avg.b * 255;
        if (pal) [r, g, b] = nearest(r, g, b);
        return AF.rgbToHex(r, g, b);
      },
      bg(avg) {
        if (o.bgMode === 'none' || !avg.n) return null;
        const k = o.bgMode === 'dim' ? o.bgDim : 1;
        let r = avg.r * 255 * k, g = avg.g * 255 * k, b = avg.b * 255 * k;
        if (pal && o.bgMode === 'full') [r, g, b] = nearest(r, g, b);
        return AF.rgbToHex(r, g, b);
      },
    };
  }

  // dither em uma grade de valores 0..1 quantizados em `levels` níveis
  function ditherGrid(vals, w, h, levels, mode, mask) {
    const out = new Float32Array(vals);
    if (mode === 'none' || levels < 2) return out;
    const q = levels - 1;
    if (mode === 'bayer') {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          out[i] = AF.clamp(out[i] + (BAYER4[(y % 4) * 4 + (x % 4)] - 0.5) / q, 0, 1);
        }
      return out;
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask && !mask[i]) continue;
        const old = out[i];
        const nv = Math.round(AF.clamp(old, 0, 1) * q) / q;
        out[i] = nv;
        const e = old - nv;
        if (x + 1 < w) out[i + 1] += (e * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) out[i + w - 1] += (e * 3) / 16;
          out[i + w] += (e * 5) / 16;
          if (x + 1 < w) out[i + w + 1] += e / 16;
        }
      }
    return out;
  }

  function rampChar(ramp, v) {
    const chars = [...ramp];
    return chars[AF.clamp(Math.round(v * (chars.length - 1)), 0, chars.length - 1)];
  }

  // técnica do aalib.js (aafont): mede o brilho real de cada char na fonte atual, normaliza min..max
  // e escolhe o char de brilho mais próximo — em vez de supor que a rampa é uniformemente espaçada
  const measuredCache = new Map();
  function measuredTable(ramp) {
    const key = ramp + '|' + AF.view.family;
    if (measuredCache.has(key)) return measuredCache.get(key);
    const chars = [...new Set([...ramp])];
    const d = chars.map((c) => [c, AF.glyphDensity(c)]);
    const mn = Math.min(...d.map((x) => x[1])), mx = Math.max(...d.map((x) => x[1]));
    const t = d.map(([c, v]) => [c, (v - mn) / (mx - mn || 1)]).sort((a, b) => a[1] - b[1]);
    measuredCache.set(key, t);
    return t;
  }
  function pickChar(o, v) {
    if (!o.measuredRamp) return rampChar(o.ramp, v);
    const t = measuredTable(o.ramp);
    let best = t[0][0], bd = Infinity;
    for (const [c, b] of t) {
      const e = Math.abs(b - v);
      if (e < bd) {
        bd = e;
        best = c;
      }
    }
    return best;
  }
  // técnica do aalib.js (normalizeGrayscale): estica a faixa min..max de luminância das células para 0..1
  function autoLevels(lum, mask) {
    let mn = 1, mx = 0;
    for (let i = 0; i < lum.length; i++) {
      if (mask && !mask[i]) continue;
      if (lum[i] < mn) mn = lum[i];
      if (lum[i] > mx) mx = lum[i];
    }
    const r = mx - mn;
    if (r < 1e-3) return;
    for (let i = 0; i < lum.length; i++) lum[i] = (lum[i] - mn) / r;
  }

  // ---------- modos ----------
  function modeRamp(src, cols, rows, o) {
    const sx = 2, sy = 2;
    const p = preprocess(sample(src, cols, rows, sx, sy), o);
    const col = makeColorizer(o);
    const g = AF.Grid.create(cols, rows);
    const lum = new Float32Array(cols * rows), avgs = [];
    const mask = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const a = regionAvg(p, x * sx, y * sy, sx, sy);
        avgs.push(a);
        lum[y * cols + x] = a.l;
        mask[y * cols + x] = a.n * 2 >= a.total ? 1 : 0;
      }
    if (o.autoLevels) autoLevels(lum, mask);
    const n = [...o.ramp].length;
    const d = ditherGrid(lum, cols, rows, n, o.dither, mask);
    for (let i = 0; i < cols * rows; i++) {
      if (!mask[i]) continue;
      const c = pickChar(o, d[i]);
      const bg = col.bg(avgs[i]);
      if (c === ' ' && !bg) continue;
      g.cells[i] = { c, f: col.fg(avgs[i], true), b: bg };
    }
    return g;
  }

  function modeGlyph(src, cols, rows, o) {
    const gx = 4, gy = 8;
    const chars = ' ' + (AF.CHARSETS[o.glyphSet] || AF.CHARSETS.ASCII);
    const cov = AF.glyphCoverage(chars, gx, gy);
    // escala: o glifo mais denso (em média) corresponde a luminância 1
    let maxMean = 0;
    for (const v of cov.values()) maxMean = Math.max(maxMean, v.reduce((s, x) => s + x, 0) / v.length);
    // cada glifo vira (tom médio, forma sem média)
    const glyphs = [...cov.entries()].map(([c, v]) => {
      const sv = v.map((x) => x / (maxMean || 1));
      const mean = sv.reduce((s, x) => s + x, 0) / sv.length;
      return [c, mean, sv.map((x) => x - mean)];
    });
    const N = gx * gy;
    const p = preprocess(sample(src, cols, rows, gx, gy), o);
    const col = makeColorizer(o);
    const g = AF.Grid.create(cols, rows);
    const vec = new Float32Array(gx * gy);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let opaque = 0, mx = 0;
        for (let j = 0; j < gy; j++)
          for (let i = 0; i < gx; i++) {
            const pi = (y * gy + j) * p.W + x * gx + i;
            const v = p.A[pi] ? p.L[pi] : 0;
            opaque += p.A[pi];
            vec[j * gx + i] = v;
            if (v > mx) mx = v;
          }
        if (opaque * 2 < gx * gy) continue;
        let mi = 0;
        for (let k = 0; k < N; k++) mi += vec[k];
        mi /= N;
        // distância = erro de tom + peso * erro de forma ("Realce de forma" aumenta o peso da forma)
        const wShape = 0.25 * o.glyphSharpen;
        let best = ' ', bd = Infinity;
        for (const [c, gm, gs] of glyphs) {
          let d = N * (mi - gm) * (mi - gm);
          for (let k = 0; k < N; k++) {
            const e = vec[k] - mi - gs[k];
            d += wShape * e * e;
          }
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        const a = regionAvg(p, x * gx, y * gy, gx, gy);
        const bg = col.bg(a);
        if (best === ' ' && !bg) continue;
        g.cells[y * cols + x] = { c: best, f: col.fg(a, true), b: bg };
      }
    return g;
  }

  function blur(src, w, h, sigma) {
    const r = Math.max(1, Math.ceil(sigma * 2.5));
    const k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      k.push(v);
      sum += v;
    }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++) s += src[y * w + AF.clamp(x + i, 0, w - 1)] * k[i + r];
        tmp[y * w + x] = s;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++) s += tmp[AF.clamp(y + i, 0, h - 1) * w + x] * k[i + r];
        out[y * w + x] = s;
      }
    return out;
  }

  function modeEdge(src, cols, rows, o) {
    const sx = 4, sy = 8;
    const p = preprocess(sample(src, cols, rows, sx, sy), o);
    const W = p.W, H = p.H;
    // Difference of Gaussians (como no shader) para isolar contornos
    const g1 = blur(p.L, W, H, 1.0), g2 = blur(p.L, W, H, 1.6);
    const dog = new Float32Array(W * H);
    for (let i = 0; i < dog.length; i++) dog[i] = AF.clamp((g1[i] - 0.98 * g2[i]) * 8 + 0.5, 0, 1);
    const col = makeColorizer(o);
    const g = AF.Grid.create(cols, rows);
    const at = (x, y) => g1[AF.clamp(y, 0, H - 1) * W + AF.clamp(x, 0, W - 1)];
    const lum = new Float32Array(cols * rows), avgs = [], mask = new Uint8Array(cols * rows);
    const edges = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const hist = [0, 0, 0, 0]; // | - / \
        let yMean = 0;
        for (let j = 0; j < sy; j++)
          for (let i = 0; i < sx; i++) {
            const px = x * sx + i, py = y * sy + j;
            const gxv = -at(px - 1, py - 1) - 2 * at(px - 1, py) - at(px - 1, py + 1) + at(px + 1, py - 1) + 2 * at(px + 1, py) + at(px + 1, py + 1);
            const gyv = -at(px - 1, py - 1) - 2 * at(px, py - 1) - at(px + 1, py - 1) + at(px - 1, py + 1) + 2 * at(px, py + 1) + at(px + 1, py + 1);
            const mag = Math.hypot(gxv, gyv);
            if (mag < o.edgeThreshold || Math.abs(dog[py * W + px] - 0.5) < 0.04) continue;
            const ang = Math.atan2(gyv, gxv);
            const a = Math.abs(ang) / Math.PI; // 0..1
            let dir;
            if (a < 0.125 || a > 0.875) dir = 0;
            else if (a > 0.375 && a < 0.625) dir = 1;
            else dir = gxv * gyv > 0 ? 2 : 3;
            hist[dir]++;
            if (dir === 1) yMean += j / sy;
          }
        let best = 0;
        for (let k = 1; k < 4; k++) if (hist[k] > hist[best]) best = k;
        let ech = null;
        if (hist[best] >= o.edgeMin) ech = best === 0 ? '|' : best === 1 ? (yMean / hist[1] > 0.6 ? '_' : '-') : best === 2 ? '/' : '\\';
        edges.push(ech);
        const a = regionAvg(p, x * sx, y * sy, sx, sy);
        avgs.push(a);
        lum[y * cols + x] = a.l;
        mask[y * cols + x] = a.n * 2 >= a.total ? 1 : 0;
      }
    if (o.autoLevels) autoLevels(lum, mask);
    const d = ditherGrid(lum, cols, rows, [...o.ramp].length, o.dither, mask);
    for (let i = 0; i < cols * rows; i++) {
      if (!mask[i]) continue;
      const c = edges[i] || pickChar(o, d[i]);
      const bg = col.bg(avgs[i]);
      if (c === ' ' && !bg) continue;
      g.cells[i] = { c, f: col.fg(avgs[i], true), b: bg };
    }
    return g;
  }

  function modeBraille(src, cols, rows, o) {
    const sx = 2, sy = 4;
    const p = preprocess(sample(src, cols, rows, sx, sy), o);
    const v = ditherGrid(p.L, p.W, p.H, 2, o.dither, p.A);
    const col = makeColorizer(o);
    const g = AF.Grid.create(cols, rows);
    const bitOf = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let bits = 0;
        const on = new Set();
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 2; i++) {
            const pi = (y * sy + j) * p.W + x * sx + i;
            if (!p.A[pi]) continue;
            if (o.dither === 'none' ? p.L[pi] >= o.brailleThreshold : v[pi] >= 0.5) {
              bits |= bitOf[j][i];
              on.add(pi);
            }
          }
        if (!bits) continue;
        const a = regionAvg(p, x * sx, y * sy, sx, sy, (i) => on.has(i));
        g.cells[y * cols + x] = { c: String.fromCharCode(0x2800 + bits), f: col.fg(a, true), b: null };
      }
    return g;
  }

  function modeHalf(src, cols, rows, o) {
    const p = preprocess(sample(src, cols, rows, 1, 2), o);
    const col = makeColorizer(o);
    const g = AF.Grid.create(cols, rows);
    const px = (i) => ({ n: 1, r: p.R[i], g: p.G[i], b: p.B[i] });
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const t = y * 2 * p.W + x, b = (y * 2 + 1) * p.W + x;
        const ta = p.A[t], ba = p.A[b];
        if (!ta && !ba) continue;
        if (ta && ba) g.cells[y * cols + x] = { c: '▀', f: col.raw(px(t)), b: col.raw(px(b)) };
        else if (ta) g.cells[y * cols + x] = { c: '▀', f: col.raw(px(t)), b: null };
        else g.cells[y * cols + x] = { c: '▄', f: col.raw(px(b)), b: null };
      }
    return g;
  }

  function modeQuad(src, cols, rows, o) {
    const p = preprocess(sample(src, cols, rows, 2, 2), o);
    const col = makeColorizer(o);
    const g = AF.Grid.create(cols, rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const idx = [(y * 2) * p.W + x * 2, (y * 2) * p.W + x * 2 + 1, (y * 2 + 1) * p.W + x * 2, (y * 2 + 1) * p.W + x * 2 + 1];
        let opaqueMask = 0;
        idx.forEach((pi, k) => p.A[pi] && (opaqueMask |= 1 << k));
        if (!opaqueMask) continue;
        const mean = (mask) => {
          let r = 0, gg = 0, b = 0, n = 0;
          idx.forEach((pi, k) => {
            if (mask & (1 << k)) {
              r += p.R[pi];
              gg += p.G[pi];
              b += p.B[pi];
              n++;
            }
          });
          return n ? { n, r: r / n, g: gg / n, b: b / n } : null;
        };
        let bestMask = opaqueMask, fgA = mean(opaqueMask), bgA = null;
        if (opaqueMask === 15) {
          let bestErr = Infinity;
          for (let m = 1; m < 16; m++) {
            const f = mean(m), bb = m === 15 ? null : mean(15 & ~m);
            let err = 0;
            idx.forEach((pi, k) => {
              const c = m & (1 << k) ? f : bb;
              err += (p.R[pi] - c.r) ** 2 + (p.G[pi] - c.g) ** 2 + (p.B[pi] - c.b) ** 2;
            });
            if (err < bestErr - 1e-6) {
              bestErr = err;
              bestMask = m;
              fgA = f;
              bgA = bb;
            }
          }
        }
        g.cells[y * cols + x] = { c: AF.QUAD_CHARS[bestMask], f: col.raw(fgA), b: bgA ? col.raw(bgA) : null };
      }
    return g;
  }

  const MODES = { ramp: modeRamp, glyph: modeGlyph, edge: modeEdge, braille: modeBraille, half: modeHalf, quad: modeQuad };
  AF.CONVERT_MODES = {
    ramp: 'Rampa de luminância (jp2a)',
    glyph: 'Casamento de forma (glyph matching)',
    edge: 'Contornos (shader do Acerola)',
    braille: 'Braille 2×4 (drawille)',
    half: 'Meio-bloco ▀ (timg/chafa)',
    quad: 'Quadrantes ▚ (chafa)',
  };

  AF.autoRows = (srcW, srcH, cols) => {
    const m = AF.metrics(32);
    return Math.max(1, Math.round(cols * (srcH / srcW) * (m.cw / m.ch)));
  };

  AF.convert = (src, opts) => {
    const o = Object.assign({}, AF.CONVERT_DEFAULTS, opts);
    const w = src.width || src.naturalWidth || src.displayWidth, h = src.height || src.naturalHeight || src.displayHeight;
    const cols = Math.max(1, o.cols | 0);
    const rows = o.rows > 0 ? o.rows | 0 : AF.autoRows(w, h, cols);
    return MODES[o.mode](src, cols, rows, o);
  };

  // recorta uma spritesheet em quadros (canvas)
  AF.sliceSheet = (img, cols, rows, count) => {
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    const fw = Math.floor(w / cols), fh = Math.floor(h / rows);
    const out = [];
    const total = count > 0 ? Math.min(count, cols * rows) : cols * rows;
    for (let i = 0; i < total; i++) {
      const cv = document.createElement('canvas');
      cv.width = fw;
      cv.height = fh;
      cv.getContext('2d').drawImage(img, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh, 0, 0, fw, fh);
      out.push(cv);
    }
    return out;
  };

  // decodifica GIF/APNG/WebP animado em quadros usando ImageDecoder (Chrome/Edge)
  AF.decodeAnimated = async (file) => {
    if (!('ImageDecoder' in window)) return null;
    try {
      const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
      await dec.tracks.ready;
      const n = dec.tracks.selectedTrack.frameCount;
      if (n <= 1) return null;
      const frames = [];
      let durSum = 0;
      for (let i = 0; i < Math.min(n, 120); i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const cv = document.createElement('canvas');
        cv.width = image.displayWidth;
        cv.height = image.displayHeight;
        cv.getContext('2d').drawImage(image, 0, 0);
        durSum += image.duration || 100000;
        image.close();
        frames.push(cv);
      }
      return { frames, fps: Math.round(1e6 / (durSum / frames.length)) || 10 };
    } catch (e) {
      console.warn('ImageDecoder falhou', e);
      return null;
    }
  };
})();

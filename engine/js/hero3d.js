'use strict';
// Herói em 3D ASCII para o inventário: um boneco montado por partes (cabeça, tronco, braços, pernas, capa, arma),
// vestido com o equipamento atual, girado em volta do eixo vertical e projetado numa grade de caracteres com
// profundidade (z-buffer) e luz fixa. O caractere e a cor de cada célula vêm da iluminação da superfície.
(function () {
  const E = window.ENG;

  const C = {
    skin: [245, 196, 156], hair: [150, 96, 52], tunic: [86, 146, 214], pants: [150, 112, 82], boot: [128, 86, 54], belt: [170, 112, 60],
    metal: { ferro: [200, 206, 220], ouro: [246, 204, 92] },
    cape: { rubra: [220, 64, 64], gelo: [140, 200, 245], verde: [96, 178, 92], sombra: [140, 96, 190] },
    boots: { couro: [168, 112, 64], ferro: [196, 202, 216], aladas: [236, 240, 250] },
    hood: [128, 84, 168], wood: [190, 128, 66], steel: [220, 230, 245], hilt: [160, 108, 56], guard: [230, 186, 80], eye: [40, 30, 30], plume: [220, 50, 50],
  };
  const RAMP = ' .,:;-=+*#%@';
  const STEP = 0.24; // espaçamento dos pontos da superfície (pequeno para não abrir buracos na grade)

  // ---------- montagem do modelo (pontos com normal e cor) ----------
  const build = (look, wpn, wave) => {
    const P = []; // [x, y, z, nx, ny, nz, r, g, b, glow]
    const add = (x, y, z, nx, ny, nz, c, glow = 0) => P.push([x, y, z, nx, ny, nz, c[0], c[1], c[2], glow]);
    const norm = (x, y, z) => {
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    // elipsoide: cor por função do ponto (permite cabelo, rosto, elmo)
    const ellipsoid = (cx, cy, cz, rx, ry, rz, colorAt) => {
      const n = Math.ceil((Math.PI * Math.max(rx, ry, rz)) / STEP);
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
        const m = Math.max(1, Math.ceil((2 * Math.PI * Math.max(rx, rz) * st) / STEP));
        for (let j = 0; j < m; j++) {
          const ph = (j / m) * 2 * Math.PI, ux = st * Math.cos(ph), uy = ct, uz = st * Math.sin(ph);
          const c = colorAt(ux, uy, uz);
          if (!c) continue;
          const [nx, ny, nz] = norm(ux / rx, uy / ry, uz / rz);
          add(cx + ux * rx, cy + uy * ry, cz + uz * rz, nx, ny, nz, c, c.glow || 0);
        }
      }
    };
    // caixa
    const box = (cx, cy, cz, sx, sy, sz, colorAt) => {
      const face = (ax, nx, ny, nz) => {
        const [u, v] = ax;
        for (let a = -u / 2; a <= u / 2 + 1e-6; a += STEP)
          for (let b = -v / 2; b <= v / 2 + 1e-6; b += STEP) {
            let x, y, z;
            if (nx) (x = (nx * sx) / 2), (y = a), (z = b);
            else if (ny) (x = a), (y = (ny * sy) / 2), (z = b);
            else (x = a), (y = b), (z = (nz * sz) / 2);
            const c = colorAt(cx + x, cy + y, cz + z);
            if (c) add(cx + x, cy + y, cz + z, nx, ny, nz, c);
          }
      };
      face([sy, sz], 1, 0, 0), face([sy, sz], -1, 0, 0);
      face([sx, sz], 0, 1, 0), face([sx, sz], 0, -1, 0);
      face([sx, sy], 0, 0, 1), face([sx, sy], 0, 0, -1);
    };
    // cápsula entre dois pontos
    const capsule = (a, b, r, colorAt) => {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1, u = d.map((v) => v / L);
      const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let p = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
      const pl = Math.hypot(...p);
      p = p.map((v) => v / pl);
      const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
      const m = Math.max(6, Math.ceil((2 * Math.PI * r) / STEP));
      for (let s = 0; s <= L + 1e-6; s += STEP)
        for (let j = 0; j < m; j++) {
          const ang = (j / m) * 2 * Math.PI, cs = Math.cos(ang), sn = Math.sin(ang);
          const n = [p[0] * cs + q[0] * sn, p[1] * cs + q[1] * sn, p[2] * cs + q[2] * sn];
          const x = a[0] + u[0] * s + n[0] * r, y = a[1] + u[1] * s + n[1] * r, z = a[2] + u[2] * s + n[2] * r;
          const c = colorAt(x, y, z, s / L);
          if (c) add(x, y, z, n[0], n[1], n[2], c);
        }
      ellipsoid(a[0], a[1], a[2], r, r, r, (ux, uy, uz) => colorAt(a[0] + ux * r, a[1] + uy * r, a[2] + uz * r, 0));
      ellipsoid(b[0], b[1], b[2], r, r, r, (ux, uy, uz) => colorAt(b[0] + ux * r, b[1] + uy * r, b[2] + uz * r, 1));
    };
    const L = look || {}, metal = C.metal[L.chest] || C.metal.ferro, hm = C.metal[L.helmet] || C.metal.ferro;
    const shirt = L.chest ? metal : C.tunic;
    // pernas (calça e botas)
    for (const sx of [-1.5, 1.5]) {
      const bootC = C.boots[L.boots] || C.boot;
      capsule([sx, 15.2, 0], [sx * 1.05, 9, 0.2], 1.35, (x, y) => (y < 5 ? bootC : C.pants));
      capsule([sx * 1.05, 9, 0.2], [sx * 1.05, 2.2, 0], 1.25, (x, y) => (y < 5.2 ? bootC : C.pants));
      box(sx * 1.05, 1.1, 0.7, 2.4, 1.6, 3.6, () => bootC);
      if (L.boots === 'aladas') for (const s of [-1, 1]) box(sx * 1.05 + s * 1.5, 4.2, -0.6, 0.3, 1.6, 2.2, () => [255, 255, 255]);
    }
    // tronco, cinto e ombreiras
    box(0, 19.6, 0, 6.6, 8.4, 3.6, (x, y) => (y < 16.2 ? (L.chest ? metal.map((v) => v * 0.75) : C.belt) : shirt));
    if (!L.chest) box(0, 16, 1.85, 1.2, 0.9, 0.2, () => C.guard); // fivela
    if (L.chest) for (const s of [-1, 1]) ellipsoid(s * 3.6, 23.4, 0, 1.7, 1.2, 1.9, () => metal.map((v) => Math.min(255, v * 1.08)));
    capsule([0, 23.6, 0], [0, 25, 0], 0.9, () => C.skin); // pescoço
    // braços (mangas e mãos), mão direita (x > 0) segura a arma
    const handR = [4.3, 14.6, 0.9], handL = [-4.3, 14.6, 0.6];
    for (const [s, hand] of [[1, handR], [-1, handL]]) {
      const sh = [s * 3.9, 22.9, 0], el = [s * 4.5, 18.4, 0.4];
      capsule(sh, el, 1.05, () => shirt);
      capsule(el, hand, 0.95, (x, y, z, t) => (t > 0.8 ? (L.chest ? metal : C.skin) : shirt));
      ellipsoid(hand[0], hand[1] - 0.3, hand[2], 1, 1.1, 1, () => (L.chest ? metal : C.skin));
    }
    // cabeça: rosto, olhos, cabelo / elmo / capuz
    ellipsoid(0, 27.6, 0, 2.6, 3, 2.6, (ux, uy, uz) => {
      const face = uz > 0.4 && uy < 0.34 && uy > -0.8 && Math.abs(ux) < 0.62;
      if (L.helmet) {
        if (!face) return hm; // topo, nuca e laterais de metal
        if (Math.abs(ux) < 0.1 && uy > -0.25) return hm; // protetor de nariz
      }
      if (uz > 0.82 && Math.abs(Math.abs(ux) - 0.33) < 0.09 && Math.abs(uy - 0.12) < 0.1) return C.eye; // olhos
      if (L.helmet) return C.skin;
      if (L.hood) return uz > 0.45 && uy < 0.55 ? C.skin.map((v) => v * 0.78) : C.hood;
      return uy > 0.35 || (uz < -0.2 && uy > -0.35) ? C.hair : C.skin;
    });
    if (L.helmet === 'ferro') for (let z = -2.2; z <= 1.2; z += STEP) for (let y = 30.4; y <= 32 - Math.abs(z) * 0.4; y += STEP) add(0, y, z, 0, 0.3, z < 0 ? -1 : 1, C.plume), add(0, y, z, 1, 0, 0, C.plume), add(0, y, z, -1, 0, 0, C.plume);
    if (L.helmet === 'ouro') for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 2 * Math.PI;
      capsule([Math.cos(a) * 2.3, 29.9, Math.sin(a) * 2.3], [Math.cos(a) * 2.2, 31.4, Math.sin(a) * 2.2], 0.32, () => hm);
    }
    if (L.hood) box(0, 25.4, -2.2, 3.4, 4, 0.6, () => C.hood);
    // capa: presa nos ombros, cai atrás até a canela e balança
    if (L.cloak) {
      const cc = C.cape[L.cloak] || C.cape.rubra;
      for (let y = 23.4; y >= 5; y -= STEP) {
        const t = (23.4 - y) / 18.4, hw = 3.4 + t * 1.6;
        for (let x = -hw; x <= hw; x += STEP) {
          const z = -2.05 - t * 1.4 - Math.sin(x * 0.7 + wave) * 0.35 * t;
          const sh = 0.82 + 0.18 * Math.cos(x * 0.9 + wave);
          add(x, y, z, 0, 0.15, -1, cc.map((v) => v * sh));
          add(x, y, z + 0.12, 0, 0, 1, cc.map((v) => v * sh * 0.7));
        }
      }
    }
    // arma
    const shape = wpn && wpn.shape, wc = ((wpn && wpn.color) || [0.85, 0.9, 1]).map((v) => v * 255);
    if (shape === 'arco') {
      // arco na mão esquerda, aljava nas costas
      for (let t = -1; t <= 1; t += STEP / 7) {
        const y = handL[1] + t * 7, z = handL[2] + 1.8 * (1 - t * t);
        capsule([handL[0], y, z], [handL[0], y + STEP, z], 0.28, () => C.wood);
      }
      for (let y = handL[1] - 7; y <= handL[1] + 7; y += STEP) add(handL[0], y, handL[2] - 0.05, 0, 0, 1, [235, 230, 215]), add(handL[0], y, handL[2] - 0.05, 0, 0, -1, [235, 230, 215]);
      box(1.6, 20.5, -2.4, 1.8, 6.5, 1.6, () => [130, 86, 44]);
      for (const ox of [-0.4, 0.3, 1]) capsule([1.6 + ox, 23.6, -2.4], [1.6 + ox, 25.2, -2.4], 0.25, () => [200, 70, 60]);
    } else if (shape === 'cajado') {
      capsule([handR[0], 2, handR[2]], [handR[0], 28.5, handR[2]], 0.38, () => C.wood);
      ellipsoid(handR[0], 29.6, handR[2], 0.95, 1.2, 0.95, () => Object.assign(wc.slice(), { glow: 1 }));
    } else if (!(wpn && wpn.unarmed)) {
      // espada (ou outra arma corpo a corpo) apontada para baixo e à frente
      const tip = [handR[0] + 0.2, 2.6, handR[2] + 3.4], len = shape === 'adaga' ? 0.45 : shape === 'lanca' ? 1.35 : 1;
      const end = [handR[0] + (tip[0] - handR[0]) * len, handR[1] + (tip[1] - handR[1]) * len, handR[2] + (tip[2] - handR[2]) * len];
      box(handR[0], handR[1] + 1.5, handR[2] - 0.4, 0.5, 2, 0.5, () => C.hilt);
      box(handR[0], handR[1] - 1, handR[2] + 0.3, 0.5, 0.5, 2.6, () => C.guard);
      capsule([handR[0], handR[1] - 1.2, handR[2] + 0.4], end, shape === 'machado' || shape === 'martelo' ? 0.3 : 0.24, () => (shape === 'machado' || shape === 'martelo' ? C.hilt : C.steel.map((v, i) => v + (wc[i] - v) * ((wpn && wpn.tint) ?? 0.35))));
      if (shape === 'machado') box(end[0], end[1] + 1, end[2], 0.4, 2.6, 2.2, () => C.steel);
      if (shape === 'martelo') box(end[0], end[1], end[2], 2, 1.8, 2, () => C.steel);
    }
    return P;
  };

  // ---------- herói 3D feito do próprio pixel art: cada pixel do quadro parado vira uma coluna de voxels ----------
  // A profundidade vem da parte do corpo: tronco e cabeça arredondados no centro, braço/perna da frente para perto,
  // os de trás para longe, capa como lâmina larga atrás e a arma na frente. Cores = as do herói no jogo.
  const DEPTH = { 3: [0, 2.6, 1], 7: [0, 2.1, 1], 14: [0, 0.5], 6: [2.7, 0.95], 1: [-2.7, 0.95], 4: [1.25, 1.05], 2: [-1.25, 1.05], 8: [3.7, 0.45], 9: [3.7, 0.3], 13: [3.7, 0.3], 10: [-1.5, 0.9], 11: [0, 2.75, 1], 12: [0, 3.3] };
  const ZS = 19, Z0 = -4.5, DZ = 0.5, S = 1.22; // fatias de profundidade e escala do modelo
  const fromSprite = (look, wpn, t) => {
    const img = E.Project && E.Project.player && E.Project.player.image;
    if (!img || !img.parts || !img.meta || !E.heroPixels) return null;
    const A = (wpn && img.variants && img.variants[wpn.shape]) || img.anims;
    const seq = String(A.idle).split(',').map(Number), f = seq[Math.floor(t * 2.5) % seq.length];
    const cv = E.heroPixels(img, f, { look, weapon: wpn, cape: 'idle', wave: Math.floor(t * 6) % 12 });
    if (!cv || !cv.pmap) return null;
    const key = 'spr|' + f + '|' + JSON.stringify(look || {}) + '|' + ((wpn && wpn.shape) || '') + (wpn && wpn.color) + '|' + (Math.floor(t * 6) % 12);
    let P = cache.get(key);
    if (P) return P;
    const FW = img.fw, FH = img.fh, pm = cv.pmap, px = cv.rgba;
    // extensão por linha das partes arredondadas e centro horizontal do tronco
    const ext = {};
    let tx = 0, tn = 0, yBot = 0;
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const id = pm[y * FW + x];
        if (!id || !DEPTH[id]) continue;
        yBot = Math.max(yBot, y);
        if (id === 3) (tx += x), tn++;
        if (DEPTH[id][2]) {
          const k = id + ':' + y, e = ext[k] || (ext[k] = [x, x]);
          e[0] = Math.min(e[0], x), (e[1] = Math.max(e[1], x));
        }
      }
    const cx = tn ? tx / tn : FW / 2;
    const occ = new Uint8Array(FW * FH * ZS), own = new Int32Array(FW * FH * ZS).fill(-1);
    const O = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= FW || y >= FH || z >= ZS ? 0 : occ[(y * FW + x) * ZS + z]);
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const i = y * FW + x, d = DEPTH[pm[i]];
        if (!d || !px[i * 4 + 3]) continue;
        let hz = d[1];
        if (d[2]) {
          const e = ext[pm[i] + ':' + y], hw = (e[1] - e[0]) / 2 + 0.6, c = (e[0] + e[1]) / 2;
          hz *= Math.sqrt(Math.max(0.25, 1 - ((x - c) / hw) ** 2));
        }
        for (let z = 0; z < ZS; z++)
          if (Math.abs(Z0 + z * DZ - d[0]) <= hz) {
            const v = i * ZS + z;
            if (own[v] < 0 || d[0] > 3) (occ[v] = 1), (own[v] = i);
          }
      }
    P = [];
    const SUB = [-0.3, 0, 0.3];
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++)
        for (let z = 0; z < ZS; z++) {
          if (!O(x, y, z)) continue;
          if (O(x + 1, y, z) && O(x - 1, y, z) && O(x, y + 1, z) && O(x, y - 1, z) && O(x, y, z + 1) && O(x, y, z - 1)) continue;
          // normal suave: aponta para onde há vazio em volta
          let nx = 0, ny = 0, nz = 0;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (!O(x + a, y + b, z + c)) (nx += a), (ny += b), (nz += c * DZ * 2);
          const nl = Math.hypot(nx, ny, nz) || 1;
          const i = own[(y * FW + x) * ZS + z], r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
          // coordenadas do modelo: frente do herói (+x do quadro) vira +z (para a câmera); altura para cima
          const MX = -(Z0 + z * DZ) * S, MY = (yBot - y) * S + 1, MZ = (x - cx) * S;
          for (const ox of SUB) for (const oy of [-0.3, 0.3]) P.push([MX + ox * S * DZ * 2, MY + oy * S, MZ + ox * S, -(nz / nl), -(ny / nl), nx / nl, r, g, b, 0]);
        }
    if (cache.size > 40) cache.clear();
    cache.set(key, P);
    return P;
  };

  const cache = new Map();
  E.Hero3D = {
    // linhas HTML (com cores) do herói girado `yaw` radianos, numa grade cols×rows
    lines(cols, rows, yaw, look, wpn, t = 0) {
      const wave = Math.round(t * 2) % 12;
      const key = JSON.stringify(look || {}) + '|' + ((wpn && wpn.shape) || '') + (wpn && wpn.color) + '|' + wave;
      // o 3D é o próprio herói do jogo (pixel art em voxels); sem folha de partes, usa o boneco montado por formas
      let P = fromSprite(look, wpn, t) || cache.get(key);
      if (!P) {
        if (cache.size > 30) cache.clear();
        P = build(look, wpn, wave * 0.52);
        cache.set(key, P);
      }
      const cy = Math.cos(yaw), sy = Math.sin(yaw), tilt = 0.18, ct = Math.cos(tilt), stl = Math.sin(tilt);
      const H = 33, sc = (rows - 1) / H, sx = sc * 2.05; // célula ~2× mais alta que larga
      const N = cols * rows, zb = new Float32Array(N).fill(-1e9), col = new Array(N), lum = new Float32Array(N);
      const light = [-0.45, 0.55, 0.7], ll = Math.hypot(...light), lx = light[0] / ll, ly = light[1] / ll, lz = light[2] / ll;
      for (const p of P) {
        // gira em torno de y (yaw) e inclina um pouco para mostrar o topo
        let x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy, y = p[1] - 16;
        const y2 = y * ct - z * stl, z2 = y * stl + z * ct;
        let nx = p[3] * cy + p[5] * sy, nz = -p[3] * sy + p[5] * cy, ny = p[4];
        const ny2 = ny * ct - nz * stl, nz2 = ny * stl + nz * ct;
        if (nz2 < -0.15) continue; // face de costas para a câmera
        const gx = Math.round(cols / 2 + x * sx), gy = Math.round(rows / 2 - y2 * sc);
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
        const i = gy * cols + gx;
        if (z2 <= zb[i]) continue;
        zb[i] = z2;
        const dif = Math.max(0, nx * lx + ny2 * ly + nz2 * lz), rim = Math.pow(1 - Math.max(0, nz2), 3) * 0.25;
        const k = p[9] ? 1.25 : 0.28 + 0.78 * dif + rim;
        lum[i] = Math.min(1, k * (0.55 + (0.45 * (p[6] * 0.3 + p[7] * 0.59 + p[8] * 0.11)) / 255));
        col[i] = [p[6] * k, p[7] * k, p[8] * k];
      }
      const esc = (s) => (s === '<' ? '&lt;' : s === '&' ? '&amp;' : s);
      const out = [];
      for (let y = 0; y < rows; y++) {
        let s = '';
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x, c = col[i];
          if (!c) {
            s += ' ';
            continue;
          }
          const g = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(lum[i] * (RAMP.length - 1))))];
          s += `<span style="color:rgb(${Math.min(255, c[0]) | 0},${Math.min(255, c[1]) | 0},${Math.min(255, c[2]) | 0})">${esc(g)}</span>`;
        }
        out.push(s);
      }
      return out;
    },
  };
})();

'use strict';
// Tela de menu inicial: cavaleiro com a espada de fogo diante do castelo em ruínas, toda em glifos ASCII animados.
(function () {
  const E = window.ENG;
  const CH = [...E.ATLAS_CHARS];
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise1 = (seed) => (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
  };
  const vn2 = (x, y, seed = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi + seed * 131), b = hash(xi + 1, yi + seed * 131), c = hash(xi, yi + 1 + seed * 131), d = hash(xi + 1, yi + 1 + seed * 131);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
  };
  const fbm = (x, y, seed) => vn2(x, y, seed) * 0.55 + vn2(x * 2.1, y * 2.1, seed + 1) * 0.3 + vn2(x * 4.3, y * 4.3, seed + 2) * 0.15;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const RAMP = ' .,:;-=+*#%@'; // rampa de luminância (do mais vazio ao mais cheio)
  const ramp = (v) => RAMP[clamp(Math.floor(v * RAMP.length), 0, RAMP.length - 1)];

  const T = (E.TitleArt = {
    on: false,
    parts: [],
    // ---------- liga/desliga ----------
    show() {
      if (!this.cv) {
        this.cv = document.createElement('canvas');
        this.cv.id = 'titleArt';
        document.body.appendChild(this.cv);
        window.addEventListener('resize', () => this.on && this.layout());
      }
      if (this.on) return;
      this.on = true;
      this.cv.style.display = 'block';
      this.layout();
      this.t0 = performance.now();
      const loop = (now) => {
        if (!this.on) return;
        if (!this.last || now - this.last > 32) {
          this.frame(Math.min(0.05, (now - (this.last || now)) / 1000), (now - this.t0) / 1000);
          this.last = now;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    hide() {
      this.on = false;
      this.last = 0;
      if (this.cv) this.cv.style.display = 'none';
    },

    // ---------- grade e cenário fixo ----------
    layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth, H = window.innerHeight;
      this.cv.width = Math.round(W * dpr);
      this.cv.height = Math.round(H * dpr);
      this.cv.style.width = W + 'px';
      this.cv.style.height = H + 'px';
      const ctx = this.cv.getContext('2d');
      // glifos pequenos = grade mais fina = cena mais detalhada
      this.fs = clamp(Math.round(H / 112), 6, 12) * dpr;
      ctx.font = `${this.fs}px "Cascadia Mono", Consolas, monospace`;
      this.cw = ctx.measureText('M').width;
      this.chh = this.fs * 1.12;
      this.cols = Math.ceil(this.cv.width / this.cw);
      this.rows = Math.ceil(this.cv.height / this.chh);
      this.ar = this.chh / this.cw; // altura da célula em larguras
      this.buildStatic();
      this.parts = [];
      this.bats = Array.from({ length: 5 }, (_, k) => ({ x: hash(k, 61) * this.cols, y: this.rows * (0.12 + hash(k, 62) * 0.22), v: 4 + hash(k, 63) * 5, ph: hash(k, 64) * 9 }));
      this.meteor = null;
      this.nextMeteor = 2;
    },
    buildStatic() {
      const C = this.cols, R = this.rows, N = C * R;
      const ch = new Array(N).fill(' '), col = new Float32Array(N * 3);
      this.bgCh = ch;
      this.bgCol = col;
      const put = (x, y, c, rgb) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= C || y >= R) return;
        const i = y * C + x;
        ch[i] = c;
        col[i * 3] = rgb[0];
        col[i * 3 + 1] = rgb[1];
        col[i * 3 + 2] = rgb[2];
      };
      this.put = put;
      const horizon = (this.horizon = R * 0.6);
      const mx = C * 0.41, my = R * 0.15, mr = R * 0.085;
      this.moon = { x: mx, y: my, r: mr };
      // fundo em degradê (desenhado por baixo dos glifos), com o halo da lua e o brilho no horizonte
      const bg = document.createElement('canvas');
      bg.width = this.cv.width;
      bg.height = this.cv.height;
      const g = bg.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, bg.height);
      gr.addColorStop(0, '#03040d');
      gr.addColorStop(0.4, '#0c0b24');
      gr.addColorStop(0.58, '#2c1530');
      gr.addColorStop(0.66, '#1a0f1e');
      gr.addColorStop(0.8, '#08080f');
      gr.addColorStop(1, '#020203');
      g.fillStyle = gr;
      g.fillRect(0, 0, bg.width, bg.height);
      const mpx = mx * this.cw, mpy = my * this.chh, mrp = mr * this.chh;
      const halo = g.createRadialGradient(mpx, mpy, mrp * 0.9, mpx, mpy, mrp * 6);
      halo.addColorStop(0, 'rgba(120,120,190,0.32)');
      halo.addColorStop(0.35, 'rgba(70,60,140,0.12)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, bg.width, bg.height);
      const hz = g.createRadialGradient(bg.width * 0.5, horizon * this.chh, 0, bg.width * 0.5, horizon * this.chh, bg.width * 0.55);
      hz.addColorStop(0, 'rgba(150,60,70,0.22)');
      hz.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hz;
      g.fillRect(0, 0, bg.width, bg.height);
      this.bg = bg;

      // céu: via láctea em faixa diagonal + poeira de estrelas
      for (let y = 0; y < horizon; y++)
        for (let x = 0; x < C; x++) {
          const h = hash(x, y);
          // distância à faixa (linha que desce da esquerda-alto para a direita)
          const u = x / C, v = y / R;
          const band = Math.exp(-(((v - (0.05 + u * 0.42)) / 0.09) ** 2)) * (0.45 + fbm(x / 18, y / 6, 3) * 0.9);
          const fade = clamp((horizon - y) / (R * 0.12), 0, 1);
          const p = (0.02 + band * 0.22) * fade;
          if (h < p) {
            const b = 0.4 + hash(y, x) * 0.6;
            const tint = mix([60, 62, 120], [130, 80, 140], fbm(x / 30, y / 10, 8));
            put(x, y, h < p * 0.15 ? '+' : h < p * 0.45 ? ':' : h < p * 0.8 ? '·' : '.', scale(tint, b * (0.8 + band)));
          } else if (band > 0.55 && hash(x + 7, y) < 0.06 * fade) put(x, y, '.', scale([90, 70, 130], band * 0.6));
        }
      this.buildMoon();

      // montanhas: duas camadas (distante azulada e próxima com neve), cristas desenhadas pela inclinação
      const ridge = (seedA, seedB, base, amp, ampS, colFar, colNear, snowLine, depth) => {
        const n1 = noise1(seedA), n2 = noise1(seedB), n3 = noise1(seedB + 5);
        const hm = [];
        for (let x = -1; x <= C + 1; x++) hm.push(base - n1(x / 30) * amp - n2(x / 9) * ampS - n3(x / 3) * ampS * 0.25);
        for (let x = 0; x < C; x++) {
          const h1 = hm[x + 1], sl = hm[x + 2] - hm[x];
          for (let y = Math.floor(h1); y < horizon + 4; y++) {
            const d = y - h1, top = d < 1;
            const snow = snowLine && h1 < snowLine && d < 1.5 + (snowLine - h1) * 0.7 + hash(x, 3) * 2;
            const lit = sl > 0 ? 1.2 : 0.75; // encosta voltada para a lua
            const strata = Math.sin(x * 0.15 + y * (sl > 0 ? 0.9 : -0.9)) > 0.6; // ravinas que descem a encosta
            let c;
            if (top) c = Math.abs(sl) < 0.3 ? '_' : sl < 0 ? '/' : '\\';
            else if (snow) c = hash(x, y) < 0.4 ? '*' : strata ? (sl > 0 ? '\\' : '/') : ':';
            else c = strata ? (sl > 0 ? '\\' : '/') : hash(x, y) < 0.35 ? ':' : hash(x, y) < 0.6 ? '.' : ' ';
            const rock = mix(scale(colNear, lit), colFar, clamp(d / depth, 0, 1));
            put(x, y, c, snow ? scale([180, 186, 220], lit * (1 - clamp(d / 18, 0, 0.5))) : rock);
          }
        }
      };
      ridge(13, 29, horizon - R * 0.1, R * 0.15, R * 0.03, [24, 22, 46], [62, 60, 112], 0, 10);
      ridge(11, 23, horizon - R * 0.03, R * 0.15, R * 0.035, [30, 26, 48], [78, 68, 118], horizon - R * 0.13, 14);

      // fileira de pinheiros distantes, azulados, no pé das montanhas
      for (let x = 0; x < C; x++) {
        const h = 1 + Math.floor(hash(x >> 1, 41) * 4 + noise1(43)(x / 12) * 4);
        for (let j = 0; j < h; j++) put(x, horizon + 2 - j, j === h - 1 ? '^' : hash(x, j) < 0.5 ? 'A' : '^', [40, 50, 82]);
      }

      // colina do castelo, com relva iluminada no topo
      const cx = C * 0.53, cy = horizon - R * 0.015;
      this.castle = { x: cx, y: cy };
      const n2 = noise1(23);
      for (let x = Math.floor(cx - C * 0.24); x < cx + C * 0.24; x++) {
        const t = (x - cx) / (C * 0.24);
        const top = cy - Math.cos(t * Math.PI * 0.5) * R * 0.05 + n2(x / 5) * 1.2;
        for (let y = Math.floor(top); y < R * 0.78; y++) {
          const d = y - top;
          put(x, y, d < 1 ? (hash(x, 3) < 0.5 ? '"' : ',') : d < 2 ? "'" : hash(x, y) < 0.5 ? ';' : ':', d < 1 ? [80, 112, 66] : d < 2 ? [52, 70, 48] : mix([40, 44, 40], [22, 26, 24], clamp(d / 10, 0, 1)));
        }
      }
      this.buildCastle(cx, cy);

      // floresta: pinheiros em duas profundidades, borda esquerda clareada pela lua
      const n3 = noise1(37);
      const pine = (x, base, h, shade, far) => {
        const half0 = h * 0.3 * this.ar * 0.5;
        for (let j = 0; j < h; j++) {
          const y = base - j, tier = (j % 4) / 4; // camadas de galhos
          const half = ((h - j) / h) * half0 * (1.15 - tier * 0.35) + 0.4;
          for (let xx = Math.floor(x - half); xx <= x + half; xx++) {
            const edgeL = xx < x - half + 1, edgeR = xx > x + half - 1;
            const lit = edgeL ? 1.6 : edgeR ? 0.7 : 1;
            const c = edgeL ? '/' : edgeR ? '\\' : j % 4 === 0 ? '_' : hash(xx, y) < 0.3 ? 'A' : hash(xx, y) < 0.6 ? '^' : '*';
            put(xx, y, c, far ? scale([38, 62, 78], shade * lit) : scale([30, 84, 58], shade * lit));
          }
        }
        put(x, base - h, '^', far ? [40, 60, 70] : [50, 90, 70]);
        for (let j = 1; j <= 2; j++) put(x, base + j, '|', [44, 32, 26]);
      };
      for (let k = 0; k < C / 4; k++) {
        const x = hash(k, 191) * C;
        pine(x, R * 0.7 + hash(k, 105) * R * 0.03, R * (0.04 + hash(k, 107) * 0.05), 0.7 + hash(k, 109) * 0.4, true);
      }
      for (let k = 0; k < C / 3.2; k++) {
        const x = hash(k, 91) * C;
        pine(x, R * 0.75 + hash(k, 5) * R * 0.05, R * (0.07 + hash(k, 7) * 0.09) * (1 + n3(x / 30) * 0.5), 0.6 + hash(k, 9) * 0.5, false);
      }
      // chão escuro da floresta, com pedrinhas e touceiras
      for (let x = 0; x < C; x++)
        for (let y = Math.floor(R * 0.79); y < R; y++) {
          const h = hash(x, y);
          put(x, y, h < 0.04 ? 'o' : h < 0.1 ? ',' : h < 0.55 ? ';' : ':', h < 0.04 ? [50, 50, 56] : mix([22, 30, 26], [12, 14, 14], (y - R * 0.79) / (R * 0.21)));
        }
      // rochedo do cavaleiro (frente, à esquerda): fendas, musgo e face clareada pela lua
      const rx = C * 0.23, rTop = R * 0.82;
      this.rock = { x: rx, y: rTop };
      const n4 = noise1(51);
      const tops = [];
      for (let x = 0; x < C * 0.46; x++) {
        const t = (x - rx) / (C * 0.22);
        const top = rTop + Math.max(0, Math.abs(t) - 0.35) ** 1.6 * R * 0.35 + n4(x / 3) * 1.6 - 1;
        tops[x] = top;
        for (let y = Math.floor(top); y < R; y++) {
          const d = y - top;
          const face = fbm(x / 7, y / 3, 17);
          const crack = Math.abs(vn2(x / 5, y / 9, 19) - 0.5) < 0.035;
          const L = clamp(1 - d / (R * 0.22), 0.22, 1) * (0.7 + face * 0.55) * (x < rx ? 1.15 : 0.9);
          let c, rgb;
          if (d < 1) (c = hash(x, 1) < 0.3 ? '\\' : hash(x, 2) < 0.5 ? '|' : '/'), (rgb = [84, 150, 72]);
          else if (d < 2.5 && hash(x, y) < 0.6) (c = hash(x, y) < 0.3 ? '"' : ';'), (rgb = [48, 96, 52]);
          else if (crack) (c = hash(x, y) < 0.5 ? '/' : '\\'), (rgb = [24, 20, 28]);
          else (c = '.:oO0Q@'[clamp(Math.floor((face * 0.8 + hash(x, y) * 0.35) * 7), 0, 6)]), (rgb = [100 * L, 92 * L, 108 * L]);
          put(x, y, c, rgb);
        }
      }
      this.rockTops = tops;
      // título em letras de bloco no canto superior direito
      this.buildTitle();
    },
    buildMoon() {
      const put = this.put, { x: mx, y: my, r: mr } = this.moon;
      const craters = [[-0.35, -0.25, 0.22], [0.3, 0.35, 0.16], [0.15, -0.45, 0.12], [-0.1, 0.5, 0.1], [0.5, -0.1, 0.13]];
      for (let y = Math.floor(my - mr * 1.2); y <= my + mr * 1.2; y++)
        for (let x = Math.floor(mx - mr * 1.2 * this.ar); x <= mx + mr * 1.2 * this.ar; x++) {
          const dx = (x - mx) / this.ar / mr, dy = (y - my) / mr, d = Math.hypot(dx, dy);
          if (d >= 1) continue;
          // mares escuros + crateras com borda clara
          const maria = fbm(dx * 2.2 + 3, dy * 2.2 + 3, 27);
          let L = 1 - d * d * 0.35 - (maria > 0.55 ? (maria - 0.55) * 1.6 : 0);
          let rim = false;
          for (const [cxr, cyr, rr] of craters) {
            const cd = Math.hypot(dx - cxr, dy - cyr) / rr;
            if (cd < 1) L -= 0.18 * (1 - cd);
            else if (cd < 1.3 && dx - cxr < 0) rim = true;
          }
          if (rim) L += 0.15;
          if (d > 0.9) L *= 0.85;
          L = clamp(L, 0.25, 1);
          put(x, y, d > 0.92 ? (dy < 0 ? (dx < 0 ? '/' : '\\') : dx < 0 ? '\\' : '/') : ramp(0.35 + L * 0.65), [238 * L, 232 * L, 200 * L]);
        }
    },
    buildCastle(cx, gy) {
      const put = this.put, R = this.rows, U = R / 82; // escala
      const stone = (x, y, face) => {
        const L = face * (0.85 + hash(Math.round(x) >> 2, Math.round(y)) * 0.3);
        const mortar = Math.round(y) % 3 === 2, joint = (Math.round(x) + (Math.floor(Math.round(y) / 3) % 2) * 3) % 6 === 0;
        const moss = Math.round(y) > gy - 4 && hash(Math.round(x), Math.round(y) + 9) < 0.35;
        if (moss) return put(x, y, hash(Math.round(x), 4) < 0.5 ? ';' : '"', [44 * face, 84 * face, 50 * face]);
        put(x, y, mortar ? '_' : joint ? '|' : hash(Math.round(x), Math.round(y)) < 0.5 ? '#' : '=', [128 * L, 130 * L, 158 * L]);
      };
      // rachaduras: caminho em zigue-zague que desce pela pedra
      const crack = (x, y, len) => {
        for (let j = 0; j < len; j++) {
          x += hash(Math.round(x), Math.round(y) + j) < 0.5 ? -0.6 : 0.6;
          put(x, y + j, x % 2 < 1 ? '/' : '\\', [30, 28, 40]);
        }
      };
      const block = (x0, x1, y0, y1, lit = 1) => {
        for (let y = Math.floor(y0); y < y1; y++)
          for (let x = Math.floor(x0); x < x1; x++) {
            const edge = x < x0 + 1 || x >= x1 - 1;
            if (edge) put(x, y, '|', x < (x0 + x1) / 2 ? [185, 188, 215] : [64, 66, 86]);
            else stone(x, y, (x > (x0 + x1) / 2 ? 0.68 : 1.08) * lit);
          }
      };
      const crenel = (x0, x1, y, broken) => {
        for (let x = Math.floor(x0); x < x1; x++) {
          if (Math.floor((x - x0) / 2) % 2) continue;
          if (broken && hash(x, 7) < 0.45) continue;
          put(x, y, '▄', [118, 120, 140]);
          put(x, y + 1, '▀', [70, 72, 88]);
        }
      };
      const roof = (x0, x1, y, h) => {
        const mid = (x0 + x1) / 2;
        for (let j = 0; j < h; j++) {
          const half = ((h - j) / h) * (x1 - x0) * 0.55;
          for (let x = Math.floor(mid - half); x <= mid + half; x++) {
            const shingle = (x + j) % 3 === 0 ? 'v' : j % 2 ? '=' : '-';
            put(x, y - j, Math.abs(x - mid) > half - 1 ? (x < mid ? '/' : '\\') : shingle, x < mid ? [160, 54, 46] : [100, 32, 30]);
          }
        }
        put(mid, y - h, '|', [60, 50, 40]);
        this.flags.push({ x: mid, y: y - h - 1 });
      };
      this.flags = [];
      this.windows = [];
      this.torches = [];
      const win = (x, y) => this.windows.push({ x: Math.round(x), y: Math.round(y), s: hash(Math.round(x), Math.round(y)) * 9 });
      const slit = (x, y) => {
        put(x, y, '¦', [20, 18, 26]);
        put(x, y + 1, '¦', [20, 18, 26]);
      };
      const s = (v) => v * U;
      const wl = cx - s(30) * this.ar * 0.5, wr = cx + s(30) * this.ar * 0.5;
      // muralha com ameias quebradas
      block(wl, wr, gy - s(14), gy);
      crenel(wl, wr, gy - s(14) - 1, true);
      for (let x = wl + 3; x < wr - 3; x += s(5)) if (Math.abs(x - cx) > s(6)) slit(x, gy - s(11));
      // torres (a da direita está em ruínas: topo partido, sem telhado)
      const tower = (x, w, h, roofH, ruined) => {
        const x0 = x - (w * this.ar) / 4, x1 = x + (w * this.ar) / 4;
        if (ruined) {
          // topo irregular: cada coluna termina numa altura diferente
          const n = noise1(13);
          for (let xx = Math.floor(x0); xx < x1; xx++) {
            const top = Math.floor(gy - h + n((xx - x0) / 1.7) * s(7) + Math.abs(xx - x0 - (x1 - x0) * 0.3) * 0.5);
            for (let y = top; y < gy; y++) {
              if (xx < x0 + 1 || xx >= x1 - 1) put(xx, y, '|', xx < x ? [185, 188, 215] : [64, 66, 86]);
              else stone(xx, y, xx > x ? 0.68 : 1.08);
            }
            put(xx, top, xx < x ? '/' : '\\', [150, 150, 175]);
            if (hash(xx, 14) < 0.4) put(xx, top - 1, hash(xx, 15) < 0.5 ? '.' : ',', [100, 100, 120]);
          }
          crack(x, gy - h + s(8), s(9));
          // pedras caídas no pé da torre
          for (let k = 0; k < 8; k++) put(x1 + hash(k, 15) * s(5), gy - hash(k, 16) * 2, hash(k, 17) < 0.5 ? 'o' : '°', [110, 110, 130]);
        } else {
          block(x0, x1, gy - h, gy);
          crenel(x0 - 1, x1 + 1, gy - h - 2, false);
          roof(x0 - 0.5, x1 + 0.5, gy - h - 2, roofH);
        }
        for (let y = gy - h + s(5); y < gy - s(6); y += s(7)) win(x, y);
      };
      tower(wl, s(9), s(26), s(8));
      tower(wr, s(9), s(24), s(8), true);
      tower(cx - s(13), s(8), s(20), s(7));
      tower(cx + s(13), s(8), s(20), s(7));
      tower(cx, s(12), s(31), s(10)); // torre de menagem
      // portão em arco com grade levadiça
      const gw = s(3.4), gh = s(8);
      for (let y = Math.floor(gy - gh - 1); y < gy; y++)
        for (let x = Math.floor(cx - gw - 1); x <= cx + gw + 1; x++) {
          const ax = (x - cx) / (gw + 1), ay = (gy - gh * 0.55 - y) / (gh * 0.45 + 1);
          const inArch = y > gy - gh * 0.55 || ax * ax + ay * ay < 1;
          if (!inArch) continue;
          const inner = Math.abs(x - cx) < gw && (y > gy - gh * 0.55 || ax * ax * 1.3 + ay * ay * 1.3 < 1);
          if (inner) put(x, y, (x - Math.round(cx)) % 2 === 0 ? '|' : y % 2 ? '+' : '-', [96, 78, 58]);
          else put(x, y, y < gy - gh * 0.5 ? (x < cx ? '/' : '\\') : '|', [170, 168, 190]);
        }
      this.torches.push({ x: Math.round(cx - gw - 3), y: Math.round(gy - s(6)) }, { x: Math.round(cx + gw + 3), y: Math.round(gy - s(6)) });
      // estandartes pendurados na torre de menagem
      for (const sx of [-1, 1]) {
        const bx = Math.round(cx + sx * s(2.4)), by = Math.round(gy - s(24));
        for (let j = 0; j < s(7); j++) {
          put(bx, by + j, j === 0 ? '=' : '█', j % 4 === 2 ? [230, 190, 80] : [150, 30, 34]);
          put(bx + 1, by + j, j === 0 ? '=' : '█', j % 4 === 2 ? [180, 140, 50] : [110, 22, 26]);
        }
        put(bx, by + s(7), '\\', [120, 24, 28]);
        put(bx + 1, by + s(7), '/', [90, 18, 22]);
      }
      crack(cx - s(10), gy - s(17), s(6));
      crack(wl + s(5), gy - s(12), s(5));
      for (let x = wl + 4; x < wr - 4; x += s(7)) if (Math.abs(x - cx) > s(10)) win(x, gy - s(8));
      // trepadeiras subindo pela muralha
      for (let k = 0; k < 10; k++) {
        let x = wl + hash(k, 21) * (wr - wl);
        if (Math.abs(x - cx) < s(5)) continue;
        const h = s(3 + hash(k, 22) * 8);
        for (let j = 0; j < h; j++) {
          x += Math.sin(j * 1.3 + k) * 0.5;
          put(x, gy - 1 - j, j % 2 ? '}' : '{', [40, 96, 46]);
        }
      }
      // caminho de pedras até o portão
      for (let y = Math.floor(gy); y < R * 0.77; y++) {
        const t = (y - gy) / (R * 0.77 - gy);
        const px = cx + Math.sin(t * 3.2) * s(9) - t * s(6), w = 1 + t * 3;
        for (let k = -w; k <= w; k++) put(px + k, y, Math.abs(k) > w - 1 ? '.' : hash(Math.round(px + k), y) < 0.4 ? 'o' : '.', [130 - Math.abs(k) * 6, 108 - Math.abs(k) * 5, 76]);
      }
    },
    buildTitle() {
      const FONT = E.BIG_FONT;
      if (!FONT) return;
      const words = ['FLORESTA', 'DAS RUINAS'];
      const C = this.cols, R = this.rows;
      // cada glifo de bloco (▀▄█) vira um mapa de meias-linhas, que dá para ampliar sem perder o desenho
      const half = (c) => [c === '█' || c === '▀', c === '█' || c === '▄'];
      const bmp = words.map((w) => {
        const rows = Array.from({ length: 10 }, () => []);
        for (const c of w) {
          const g = FONT[c] || FONT[' '];
          for (let r = 0; r < 5; r++)
            for (const k of g[r] + ' ') {
              const [a, b] = half(k);
              rows[r * 2].push(a);
              rows[r * 2 + 1].push(b);
            }
        }
        return rows;
      });
      const maxW = Math.max(...bmp.map((b) => b[0].length));
      const sx = maxW * 3 < C * 0.4 && R > 80 ? 3 : maxW * 2 < C * 0.4 ? 2 : 1;
      const big = sx === 3; // letras altas: uma linha por meia-linha do glifo
      const lineH = big ? 10 : 5;
      const x0 = Math.round(C * 0.79 - (maxW * sx) / 2), y0 = Math.round(R * 0.06);
      const cells = [];
      bmp.forEach((rows, li) => {
        const off = Math.round(((maxW - rows[0].length) * sx) / 2);
        const at = (r, i) => (rows[r] && rows[r][i]) || false;
        for (let r = 0; r < lineH; r++)
          for (let i = 0; i < rows[0].length; i++) {
            let c;
            if (big) c = at(r, i) ? '█' : null;
            else {
              const a = at(r * 2, i), b = at(r * 2 + 1, i);
              c = a && b ? '█' : a ? '▀' : b ? '▄' : null;
            }
            if (!c) continue;
            const hr = big ? r : r * 2, top = !at(hr - 1, i), bottom = !at(hr + (big ? 1 : 2), i);
            for (let k = 0; k < sx; k++) {
              const x = x0 + off + i * sx + k, y = y0 + li * (lineH + 2) + r;
              // pedra gasta: falhas e fendas que lembram as ruínas
              const worn = c === '█' && !top && hash(x, y) < 0.09 ? '▓' : c;
              cells.push({ x, y, c: worn, r: r / (lineH - 1), li, top, bottom });
            }
          }
      });
      this.title = { cells, y0, x0, w: maxW * sx, h: lineH * 2 + 2 };
    },

    // ---------- quadro animado ----------
    frame(dt, t) {
      const C = this.cols, R = this.rows, N = C * R;
      const ch = (this.ch ||= []);
      ch.length = N;
      for (let i = 0; i < N; i++) ch[i] = this.bgCh[i];
      const col = this.col && this.col.length === N * 3 ? this.col : (this.col = new Float32Array(N * 3));
      col.set(this.bgCol);
      const put = (x, y, c, rgb, add) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= C || y >= R) return;
        const i = y * C + x;
        if (c) ch[i] = c;
        if (add) {
          col[i * 3] += rgb[0];
          col[i * 3 + 1] += rgb[1];
          col[i * 3 + 2] += rgb[2];
        } else {
          col[i * 3] = rgb[0];
          col[i * 3 + 1] = rgb[1];
          col[i * 3 + 2] = rgb[2];
        }
      };
      const glow = (gx, gy, rad, rgb) => {
        for (let y = Math.floor(gy - rad); y < gy + rad; y++)
          for (let x = Math.floor(gx - rad * this.ar); x < gx + rad * this.ar; x++) {
            const d = Math.hypot((x - gx) / this.ar, y - gy) / rad;
            if (d < 1) put(x, y, null, scale(rgb, (1 - d) ** 2), true);
          }
      };
      // estrelas que piscam (algumas com cruz de brilho)
      for (let k = 0; k < C * 0.45; k++) {
        const x = Math.floor(hash(k, 1) * C), y = Math.floor(hash(k, 2) * R * 0.5);
        if (Math.hypot((x - this.moon.x) / this.ar, y - this.moon.y) < this.moon.r * 1.6) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(k, 3) * 3) + k);
        const rgb = hash(k, 4) < 0.15 ? [255 * tw, 200 * tw, 150 * tw] : hash(k, 4) < 0.3 ? [160 * tw, 190 * tw, 255 * tw] : [210 * tw + 40, 210 * tw + 40, 235 * tw + 20];
        put(x, y, tw > 0.85 ? '*' : tw > 0.4 ? '+' : '.', rgb);
        if (k % 9 === 0 && tw > 0.8) {
          put(x - 1, y, '-', scale(rgb, 0.5));
          put(x + 1, y, '-', scale(rgb, 0.5));
          put(x, y - 1, '|', scale(rgb, 0.4));
          put(x, y + 1, '|', scale(rgb, 0.4));
        }
      }
      // estrela cadente de vez em quando
      this.nextMeteor -= dt;
      if (!this.meteor && this.nextMeteor <= 0) {
        this.meteor = { x: C * (0.5 + Math.random() * 0.4), y: R * (0.03 + Math.random() * 0.15), life: 0 };
        this.nextMeteor = 4 + Math.random() * 6;
      }
      if (this.meteor) {
        const m = this.meteor;
        m.life += dt;
        const hx = m.x - m.life * 70, hy = m.y + m.life * 22;
        for (let k = 0; k < 14; k++) {
          const f = 1 - k / 14;
          put(hx + k * 2.2, hy - k * 0.7, k === 0 ? '*' : k < 4 ? '-' : '.', [255 * f, 240 * f, 200 * f]);
        }
        if (m.life > 0.9) this.meteor = null;
      }
      // nuvens em bancos que passam devagar, com a borda prateada perto da lua
      for (let y = Math.floor(R * 0.04); y < R * 0.44; y++) {
        const env = Math.sin(((y - R * 0.04) / (R * 0.4)) * Math.PI);
        for (let x = 0; x < C; x++) {
          const v = vn2((x + t * 1.6) / 26, y / 4.5, 4) * 0.65 + vn2((x + t * 2.4) / 9, y / 2.4, 9) * 0.25 + vn2((x + t * 3) / 3.5, y / 1.5, 12) * 0.1;
          const k = (v - 0.64) * env * 3.2;
          if (k <= 0) continue;
          const near = 1 - clamp(Math.hypot((x - this.moon.x) / this.ar, y - this.moon.y) / (this.moon.r * 5), 0, 1);
          const edge = k < 0.1 ? 1 + near * 2 : 1;
          put(x, y, k > 0.42 ? '%' : k > 0.25 ? '=' : k > 0.12 ? '~' : '-', [(60 + k * 70 + near * 90) * edge, (58 + k * 60 + near * 80) * edge, (95 + k * 70 + near * 70) * Math.min(edge, 1.6)]);
        }
      }
      // morcegos cruzando o céu
      for (const b of this.bats) {
        b.x += b.v * dt;
        if (b.x > C + 4) (b.x = -4), (b.y = R * (0.12 + Math.random() * 0.22));
        const y = b.y + Math.sin(t * 2 + b.ph) * 1.5, up = Math.sin(t * 14 + b.ph) > 0;
        put(b.x - 1, y, up ? '\\' : '/', [30, 26, 40]);
        put(b.x, y, 'v', [20, 16, 28]);
        put(b.x + 1, y, up ? '/' : '\\', [30, 26, 40]);
      }
      // janelas acesas com chama tremulante
      for (const w of this.windows) {
        const f = 0.75 + 0.25 * Math.sin(t * 7 + w.s) * Math.sin(t * 3.1 + w.s * 2);
        put(w.x, w.y, '▓', [255 * f, 170 * f, 60 * f]);
        put(w.x, w.y + 1, '▓', [230 * f, 130 * f, 40 * f]);
        for (let k = -2; k <= 2; k++) for (let j = -1; j <= 2; j++) if (k || j) put(w.x + k, w.y + j, null, [30 * f, 14 * f, 0], true);
      }
      // tochas no portão
      for (const tc of this.torches) {
        const f = 0.8 + Math.sin(t * 11 + tc.x) * 0.12 + Math.sin(t * 17 + tc.x) * 0.08;
        put(tc.x, tc.y + 1, '|', [90, 60, 40]);
        put(tc.x, tc.y, Math.sin(t * 9 + tc.x) > 0 ? '*' : '^', [255, 200 * f, 70]);
        put(tc.x, tc.y - 1, Math.sin(t * 13 + tc.x) > 0.3 ? "'" : null, [255, 120, 30]);
        glow(tc.x, tc.y, 4, [70 * f, 34 * f, 6]);
      }
      // bandeiras tremulando
      for (const f of this.flags) {
        for (let k = 1; k <= 6; k++) {
          const dy = Math.round(Math.sin(t * 5 - k * 0.9) * 0.6 * (k / 3));
          put(f.x + k, f.y + dy, k === 6 ? '>' : '~', k % 2 ? [220, 50, 44] : [180, 36, 32]);
          put(f.x + k, f.y + dy + 1, k === 6 ? '>' : '~', [150, 28, 26]);
        }
        put(f.x, f.y, '|', [90, 80, 70]);
        put(f.x, f.y + 1, '|', [90, 80, 70]);
      }
      // névoa rolando sobre a floresta
      const nf = noise1(83);
      for (let y = Math.floor(R * 0.65); y < R * 0.81; y++)
        for (let x = 0; x < C; x++) {
          const v = (nf((x + t * 4) / 18 + y * 0.7) * 0.7 + nf((x - t * 2.5) / 7 + y * 1.3) * 0.3) * (1 - Math.abs(y - R * 0.73) / (R * 0.08));
          if (v > 0.33) put(x, y, v > 0.55 ? '~' : v > 0.45 ? '-' : null, [42 * v, 42 * v, 64 * v], true);
        }
      // vaga-lumes
      for (let k = 0; k < Math.round(C / 9); k++) {
        const x = hash(k, 31) * C + Math.sin(t * 0.7 + k) * 6, y = R * (0.66 + hash(k, 33) * 0.14) + Math.sin(t * 1.3 + k * 2) * 2;
        const b = 0.5 + 0.5 * Math.sin(t * 3 + k);
        if (b > 0.3) {
          put(x, y, b > 0.8 ? '•' : '·', [190 * b, 255 * b, 90 * b]);
          if (b > 0.8) glow(x, y, 1.6, [20, 40, 8]);
        }
      }
      // capim no topo do rochedo balançando ao vento
      const tops = this.rockTops;
      for (let x = 0; x < tops.length; x += 2) {
        if (hash(x, 71) < 0.45) continue;
        const sw = Math.sin(t * 2.2 + x * 0.35);
        put(x, tops[x] - 1, sw > 0.3 ? '/' : sw < -0.3 ? '\\' : '|', [70, 140, 62]);
        if (hash(x, 72) < 0.12) put(x, tops[x] - 2, '*', hash(x, 73) < 0.5 ? [220, 200, 120] : [190, 120, 200]);
      }
      this.knight(put, t, dt, glow);
      this.drawTitle(put, t, glow);
      this.paint(ch, col);
    },
    // cavaleiro em arte de linha (o mesmo desenho do herói), com a espada de fogo erguida
    knight(put, t, dt, glow) {
      const R = this.rows;
      const kr = Math.round(R * 0.5), kc = kr * 2;
      const px = 6, W = kc * px, H = Math.round(kr * px * this.ar);
      const ink = (this._ink ||= document.createElement('canvas')), fill = (this._fill ||= document.createElement('canvas'));
      for (const c of [ink, fill])
        if (c.width !== W || c.height !== H) {
          c.width = W;
          c.height = H;
        }
      const ic = ink.getContext('2d', { willReadFrequently: true }), fc = fill.getContext('2d', { willReadFrequently: true });
      ic.clearRect(0, 0, W, H);
      fc.clearRect(0, 0, W, H);
      const br = Math.sin(t * 1.8);
      const pose = { lean: -0.04, drop: 0.01 + br * 0.004, legF: 0.38, kneeF: 0.22, legB: -0.32, kneeB: 0.16, arm: 2.55 + br * 0.03, elbow: 0.32, armB: -0.35, elbowB: 0.45, sword: 3.05 + br * 0.03, hem: Math.sin(t * 2.4) * 0.4, back: 0.7, head: 0.08 };
      // capa ao vento (pontos no espaço do desenho)
      const nk = this._neck || [W / 2, H * 0.35];
      const cape = [];
      for (let i = 1; i <= 6; i++) {
        const k = i / 6;
        cape.push([nk[0] - k * W * 0.2 - Math.sin(t * 2.6 + i * 0.8) * W * 0.02 * k, nk[1] + k * H * 0.5 + Math.cos(t * 2.1 + i) * H * 0.02 * k]);
      }
      const r = E.drawHeroLine(ic, fc, W, H, { unit: W / 22 / 2.2, state: 'idle', t, phase: 0, facing: 1, vx: 0, vy: 0, pose, weaponColor: [1, 0.6, 0.2], weaponShape: 'espada', gear: { helmet: 'ferro', chest: 'ferro', cloak: 'rubra' }, cape, detail: 1 });
      this._neck = r.neck;
      const cells = E.canvasToLineCells(ink, fill, kc, kr);
      const ox = Math.round(this.rock.x - kc / 2), oy = Math.round(this.rock.y - kr + 1);
      const tip = [ox + (r.tip[0] / W) * kc, oy + (r.tip[1] / H) * kr], hand = [ox + (r.hand[0] / W) * kc, oy + (r.hand[1] / H) * kr];
      // apaga o cenário por dentro da silhueta (o cavaleiro fica nítido na frente das montanhas)
      const fd = fc.getImageData(0, 0, W, H).data, id = ic.getImageData(0, 0, W, H).data;
      for (let j = 0; j < kr; j++)
        for (let i = 0; i < kc; i++) {
          const p = (Math.floor((j + 0.5) * (H / kr)) * W + Math.floor((i + 0.5) * (W / kc))) * 4;
          if (fd[p + 3] > 40 || id[p + 3] > 40) put(ox + i, oy + j, ' ', [0, 0, 0]);
        }
      const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
      for (let j = 0; j < kr; j++)
        for (let i = 0; i < kc; i++) {
          const c = cells.cells[j * kc + i];
          if (!c) continue;
          const g = CH[c[3]] || '#';
          // luz do fogo vinda de cima (laranja) e luar frio pela esquerda
          const x = ox + i, y = oy + j;
          const fire = clamp(1 - Math.hypot((x - hand[0]) / this.ar, y - hand[1]) / (kr * 0.6), 0, 1) * flick;
          const moon = i < kc * 0.47 ? 0.12 : 0;
          put(x, y, g === ' ' ? '.' : g, [Math.min(255, c[0] * 1.2 + fire * 110 + moon * 60), Math.min(255, c[1] * 1.2 + fire * 50 + moon * 70), Math.min(255, c[2] * 1.2 + fire * 5 + moon * 110)]);
        }
      // espada de fogo: chamas pela lâmina, brilho e brasas
      const L = Math.hypot(tip[0] - hand[0], (tip[1] - hand[1]) * this.ar);
      for (let s = 0; s <= 1; s += 1 / Math.max(4, L)) {
        const x = hand[0] + (tip[0] - hand[0]) * s, y = hand[1] + (tip[1] - hand[1]) * s;
        put(x, y, s > 0.15 ? (hash(Math.floor(t * 20), Math.floor(s * 50)) < 0.5 ? '|' : '!') : null, [255, 235 - s * 50, 160 - s * 90]);
        // labaredas dos dois lados da lâmina
        if (s > 0.18) {
          const fl = vn2(s * 9, t * 6, 5);
          const w = Math.round(fl * 1.8 * s);
          for (let k = 1; k <= w; k++) {
            const heat = 1 - k / (w + 1);
            const gch = k === w ? (hash(k, Math.floor(t * 15 + s * 30)) < 0.5 ? '(' : ')') : '^';
            put(x - k, y - (k > 1 ? 1 : 0), gch, [255, 90 + 140 * heat, 20 + 60 * heat]);
            put(x + k, y - (k > 1 ? 1 : 0), gch === '(' ? ')' : '(', [255, 90 + 140 * heat, 20 + 60 * heat]);
          }
        }
        if (s > 0.15 && Math.random() < dt * 22) this.parts.push({ x: x + (Math.random() - 0.5) * 1.5, y, vx: (Math.random() - 0.5) * 3 - 1, vy: -3 - Math.random() * 6, life: 0.2 + Math.random() * 0.45, max: 0.65, ember: Math.random() < 0.08 });
      }
      // pluma de fogo acima da ponta
      for (let j = 1; j < kr * 0.12; j++) {
        const k = j / (kr * 0.12);
        const sway = Math.sin(t * 6 + j * 0.7) * k * 2;
        const w = (1 - k) * 2.2 * (0.7 + vn2(j * 0.5, t * 5, 7) * 0.6);
        for (let dx = -Math.round(w); dx <= Math.round(w); dx++) {
          const heat = 1 - Math.abs(dx) / (w + 1) - k * 0.6;
          if (heat <= 0) continue;
          put(tip[0] + dx + sway, tip[1] - j, heat > 0.6 ? '#' : heat > 0.35 ? '*' : '^', [255, 70 + 180 * heat, 10 + 120 * heat * heat]);
        }
      }
      // fumaça subindo da ponta
      if (Math.random() < dt * 6) this.parts.push({ x: tip[0], y: tip[1] - kr * 0.12, vx: 2 + Math.random() * 2, vy: -2 - Math.random() * 1.5, life: 2.5, max: 2.5, smoke: true });
      // brilho quente ao redor da espada e sobre o rochedo
      glow((tip[0] + hand[0]) / 2, (tip[1] + hand[1]) / 2, kr * 0.55, [120 * flick, 50 * flick, 8]);
      glow(hand[0], hand[1] + kr * 0.4, kr * 0.75, [36 * flick, 14 * flick, 2]);
      // brasas do vento atravessando a cena
      if (Math.random() < dt * 5) this.parts.push({ x: tip[0], y: tip[1], vx: 5 + Math.random() * 8, vy: -1 - Math.random() * 2.5, life: 2 + Math.random() * 2, max: 4, ember: true });
      for (const p of this.parts) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx += Math.sin(t * 3 + p.y) * dt * 4;
        const k = clamp(p.life / p.max, 0, 1);
        if (p.smoke) put(p.x, p.y, k > 0.6 ? '@' : k > 0.3 ? 'o' : '.', [70 * k, 62 * k, 66 * k]);
        else if (p.ember) put(p.x, p.y, k > 0.5 ? '*' : '.', [255, 120 + 80 * k, 30]);
        else put(p.x, p.y, k > 0.66 ? '^' : k > 0.33 ? '*' : "'", [255, 90 + 160 * k, 20 + 60 * k]);
      }
      this.parts = this.parts.filter((p) => p.life > 0);
    },
    drawTitle(put, t, glow) {
      const T = this.title;
      if (!T) return;
      // brilho morno por trás das letras
      for (const c of T.cells) if (hash(c.x, c.y) < 0.08) glow(c.x, c.y, 3, [14, 5, 0]);
      for (const c of T.cells) {
        const sh = 0.5 + 0.5 * Math.sin(t * 2 - (c.x - T.x0) * 0.08); // brilho correndo pelas letras
        let base = c.li ? mix([255, 205, 95], [200, 70, 25], c.r) : mix([255, 230, 130], [225, 100, 35], c.r);
        if (c.top) base = mix(base, [255, 250, 220], 0.45); // aresta de cima iluminada
        if (c.bottom) base = scale(base, 0.75);
        if (c.c === '▓') base = scale(base, 0.7);
        put(c.x + 1, c.y + 1, c.c, [46, 16, 6]); // sombra
        put(c.x, c.y, c.c, base.map((v) => Math.min(255, v + sh * 50)));
      }
      // ornamento e subtítulo
      const cx = T.x0 + T.w / 2, oy = T.y0 + T.h + 1;
      const orn = '<══════════════ ✦ ══════════════>';
      [...orn].forEach((c, i) => put(Math.round(cx - orn.length / 2) + i, oy, c, c === '✦' ? [255, 220, 120] : [150, 100, 60]));
      // o subtítulo sai em fonte maior, por cima da grade (ver paint)
      this.sub = { text: '~ uma lenda em ASCII ~', x: cx, y: oy + 1.6, a: 0.85 + 0.15 * Math.sin(t * 1.5) };
    },
    // desenha a grade: um fillStyle por cor quantizada
    paint(ch, col) {
      const ctx = this.cv.getContext('2d');
      ctx.drawImage(this.bg, 0, 0);
      ctx.font = `${this.fs}px "Cascadia Mono", Consolas, monospace`;
      ctx.textBaseline = 'top';
      const C = this.cols, N = ch.length, groups = new Map();
      for (let i = 0; i < N; i++) {
        const c = ch[i];
        if (c === ' ') continue;
        const r = Math.min(255, col[i * 3]) >> 3, g = Math.min(255, col[i * 3 + 1]) >> 3, b = Math.min(255, col[i * 3 + 2]) >> 3;
        if (r + g + b < 3) continue;
        const key = (r << 10) | (g << 5) | b;
        let a = groups.get(key);
        if (!a) groups.set(key, (a = []));
        a.push(i);
      }
      for (const [key, a] of groups) {
        ctx.fillStyle = `rgb(${((key >> 10) & 31) << 3},${((key >> 5) & 31) << 3},${(key & 31) << 3})`;
        for (const i of a) ctx.fillText(ch[i], (i % C) * this.cw, Math.floor(i / C) * this.chh);
      }
      if (this.sub) {
        const S = this.sub;
        ctx.font = `${Math.round(this.fs * 1.8)}px "Cascadia Mono", Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(40,14,6,0.9)';
        ctx.fillText(S.text, S.x * this.cw + 2, S.y * this.chh + 2);
        ctx.fillStyle = `rgba(225,192,135,${S.a})`;
        ctx.fillText(S.text, S.x * this.cw, S.y * this.chh);
        ctx.textAlign = 'left';
      }
    },
  });
})();

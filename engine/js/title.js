'use strict';
// Tela de menu inicial: cavaleiro com a espada de fogo diante do castelo, toda em glifos ASCII animados.
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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
      this.fs = clamp(Math.round(H / 88), 8, 14) * dpr;
      ctx.font = `${this.fs}px "Cascadia Mono", Consolas, monospace`;
      this.cw = ctx.measureText('M').width;
      this.chh = this.fs * 1.12;
      this.cols = Math.ceil(this.cv.width / this.cw);
      this.rows = Math.ceil(this.cv.height / this.chh);
      this.ar = this.chh / this.cw; // altura da célula em larguras
      this.buildStatic();
      this.parts = [];
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
      const horizon = R * 0.6;
      // fundo em degradê (desenhado por baixo dos glifos)
      const bg = document.createElement('canvas');
      bg.width = this.cv.width;
      bg.height = this.cv.height;
      const g = bg.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, bg.height);
      gr.addColorStop(0, '#04050f');
      gr.addColorStop(0.45, '#0d0b22');
      gr.addColorStop(0.62, '#2a1626');
      gr.addColorStop(0.75, '#0b0a12');
      gr.addColorStop(1, '#030305');
      g.fillStyle = gr;
      g.fillRect(0, 0, bg.width, bg.height);
      this.bg = bg;
      // céu: poeira de estrelas fraca
      for (let y = 0; y < horizon; y++)
        for (let x = 0; x < C; x++) {
          const h = hash(x, y);
          if (h < 0.035) put(x, y, h < 0.012 ? ':' : '.', mix([40, 44, 90], [90, 50, 80], y / horizon));
        }
      // lua
      const mx = C * 0.3, my = R * 0.17, mr = R * 0.075;
      this.moon = { x: mx, y: my, r: mr };
      for (let y = Math.floor(my - mr * 1.9); y <= my + mr * 1.9; y++)
        for (let x = Math.floor(mx - mr * 1.9 * this.ar); x <= mx + mr * 1.9 * this.ar; x++) {
          const d = Math.hypot((x - mx) / this.ar, y - my) / mr;
          if (d < 1) {
            const cr = hash(Math.floor(x / 3), Math.floor(y / 2)) < 0.22;
            const L = 1 - d * 0.35;
            put(x, y, cr ? 'o' : d > 0.85 ? 'O' : hash(x, y) < 0.5 ? '@' : '8', [235 * L, 228 * L, cr ? 170 * L : 195 * L]);
          } else if (d < 1.9 && hash(x, y + 77) < 0.28 * (1.9 - d)) put(x, y, '.', [120, 115, 150]);
        }
      // montanhas distantes: cumes com encostas / \ e neve no alto
      const n1 = noise1(11), n2 = noise1(23);
      const hm = [];
      for (let x = -1; x <= C; x++) hm.push(horizon - R * 0.06 - n1(x / 26) * R * 0.17 - n2(x / 8) * R * 0.035);
      for (let x = 0; x < C; x++) {
        const h1 = hm[x + 1], sl = hm[x + 2] - hm[x];
        for (let y = Math.floor(h1); y < horizon + 4; y++) {
          const d = y - h1, top = d < 1;
          const snow = h1 < horizon - R * 0.15 && d < 2 + (horizon - R * 0.15 - h1) * 0.6;
          const lit = sl > 0 ? 1.15 : 0.8; // encosta voltada para a lua
          let c;
          if (top) c = Math.abs(sl) < 0.35 ? '_' : sl < 0 ? '/' : '\\';
          else c = snow ? (hash(x, y) < 0.5 ? '*' : ':') : hash(x, y) < 0.3 ? '/' : hash(x, y) < 0.55 ? ':' : '.';
          put(x, y, c, snow ? [175 * lit, 180 * lit, 215 * lit] : mix([70 * lit, 62 * lit, 110 * lit], [32, 28, 52], clamp(d / 14, 0, 1)));
        }
      }
      // colina do castelo
      const cx = C * 0.53, cy = horizon - R * 0.02;
      this.castle = { x: cx, y: cy };
      for (let x = Math.floor(cx - C * 0.22); x < cx + C * 0.22; x++) {
        const t = (x - cx) / (C * 0.22);
        const top = cy - Math.cos(t * Math.PI * 0.5) * R * 0.05 + n2(x / 5) * 1.2;
        for (let y = Math.floor(top); y < R * 0.78; y++) put(x, y, y - top < 1 ? (hash(x, 3) < 0.5 ? '"' : ',') : hash(x, y) < 0.5 ? ';' : ':', y - top < 1 ? [70, 95, 60] : [32, 38, 34]);
      }
      this.buildCastle(cx, cy);
      // floresta de pinheiros na frente da colina
      const n3 = noise1(37);
      for (let k = 0; k < C / 3.2; k++) {
        const x = hash(k, 91) * C;
        const base = R * 0.74 + hash(k, 5) * R * 0.05;
        const h = R * (0.07 + hash(k, 7) * 0.09) * (1 + n3(x / 30) * 0.5);
        const shade = 0.6 + hash(k, 9) * 0.5;
        for (let j = 0; j < h; j++) {
          const y = base - j, half = ((h - j) / h) * h * 0.32 * this.ar * 0.5 + 0.4;
          for (let xx = Math.floor(x - half); xx <= x + half; xx++) {
            const edge = Math.abs(xx - x) > half - 1;
            put(xx, y, edge ? (xx < x ? '/' : '\\') : j % 3 === 0 ? 'A' : '^', [20 * shade, 52 * shade, 42 * shade]);
          }
        }
        for (let j = 0; j < 2; j++) put(x, base + j, '|', [40, 30, 24]);
      }
      // chão escuro da floresta
      for (let x = 0; x < C; x++) for (let y = Math.floor(R * 0.78); y < R; y++) put(x, y, hash(x, y) < 0.5 ? ';' : ':', [18, 24, 22]);
      // rochedo do cavaleiro (frente, à esquerda)
      const rx = C * 0.24, rTop = R * 0.82;
      this.rock = { x: rx, y: rTop };
      const n4 = noise1(51);
      for (let x = 0; x < C * 0.46; x++) {
        const t = (x - rx) / (C * 0.22);
        const top = rTop + Math.max(0, Math.abs(t) - 0.35) ** 1.6 * R * 0.35 + n4(x / 3) * 1.6 - 1;
        for (let y = Math.floor(top); y < R; y++) {
          const d = y - top;
          const L = clamp(1 - d / (R * 0.2), 0.25, 1) * (0.8 + hash(x >> 1, y) * 0.3);
          put(x, y, d < 1 ? (hash(x, 1) < 0.3 ? '\\' : hash(x, 2) < 0.5 ? '|' : '/') : ['0', 'Q', '@', '%', 'O'][Math.floor(hash(x, y) * 5)], d < 1 ? [80, 140, 70] : [92 * L, 84 * L, 96 * L]);
        }
      }
      // título em letras de bloco no canto superior direito
      this.buildTitle();
    },
    buildCastle(cx, gy) {
      const put = this.put, R = this.rows, U = R / 82; // escala
      const stone = (x, y, face) => {
        const L = face;
        const mortar = Math.round(y) % 3 === 2, joint = (Math.round(x) + (Math.floor(Math.round(y) / 3) % 2) * 3) % 6 === 0;
        put(x, y, mortar ? '_' : joint ? '|' : hash(Math.round(x), Math.round(y)) < 0.5 ? '#' : '=', [128 * L, 130 * L, 158 * L]);
      };
      const block = (x0, x1, y0, y1, lit = 1) => {
        for (let y = Math.floor(y0); y < y1; y++)
          for (let x = Math.floor(x0); x < x1; x++) {
            const edge = x < x0 + 1 || x >= x1 - 1;
            if (edge) put(x, y, '|', x < (x0 + x1) / 2 ? [175, 178, 205] : [70, 72, 92]);
            else stone(x, y, (x > (x0 + x1) / 2 ? 0.7 : 1.05) * lit);
          }
      };
      const crenel = (x0, x1, y) => {
        for (let x = Math.floor(x0); x < x1; x++) if (Math.floor((x - x0) / 2) % 2 === 0) put(x, y, '▄', [110, 112, 130]);
      };
      const roof = (x0, x1, y, h) => {
        const mid = (x0 + x1) / 2;
        for (let j = 0; j < h; j++) {
          const half = ((h - j) / h) * (x1 - x0) * 0.5;
          for (let x = Math.floor(mid - half); x <= mid + half; x++) put(x, y - j, Math.abs(x - mid) > half - 1 ? (x < mid ? '/' : '\\') : '=', x < mid ? [150, 50, 44] : [100, 34, 30]);
        }
        put(mid, y - h, '|', [60, 50, 40]);
        this.flags.push({ x: mid, y: y - h - 1 });
      };
      this.flags = [];
      this.windows = [];
      const win = (x, y) => this.windows.push({ x: Math.round(x), y: Math.round(y), s: hash(Math.round(x), Math.round(y)) * 9 });
      const s = (v) => v * U;
      const wl = cx - s(30) * this.ar * 0.5, wr = cx + s(30) * this.ar * 0.5;
      // muralha
      block(wl, wr, gy - s(14), gy);
      crenel(wl, wr, gy - s(14) - 1);
      // portão
      for (let y = Math.floor(gy - s(7)); y < gy; y++) for (let x = Math.floor(cx - s(3)); x <= cx + s(3); x++) put(x, y, y === Math.floor(gy - s(7)) ? '_' : (x + y) % 2 ? '#' : '+', [40, 30, 26]);
      // torres
      const tower = (x, w, h, roofH) => {
        const x0 = x - (w * this.ar) / 4, x1 = x + (w * this.ar) / 4;
        block(x0, x1, gy - h, gy);
        crenel(x0 - 1, x1 + 1, gy - h - 1);
        roof(x0, x1, gy - h - 1, roofH);
        for (let y = gy - h + s(4); y < gy - s(6); y += s(7)) win(x, y);
      };
      tower(wl, s(9), s(26), s(8));
      tower(wr, s(9), s(26), s(8));
      tower(cx - s(13), s(8), s(20), s(7));
      tower(cx + s(13), s(8), s(20), s(7));
      tower(cx, s(12), s(31), s(9)); // torre de menagem
      for (let x = wl + 4; x < wr - 4; x += s(7)) if (Math.abs(x - cx) > s(10)) win(x, gy - s(8));
      // caminho até o portão
      for (let y = Math.floor(gy); y < R * 0.76; y++) {
        const t = (y - gy) / (R * 0.76 - gy);
        const px = cx + Math.sin(t * 3.2) * s(9) - t * s(6);
        for (let k = -1; k <= 1; k++) put(px + k + t * k * 2, y, '.', [120, 100, 70]);
      }
    },
    buildTitle() {
      const FONT = E.BIG_FONT;
      if (!FONT) return;
      const words = ['FLORESTA', 'DAS RUINAS'];
      const cells = [];
      let maxW = 0;
      const lines = words.map((w) => {
        const rows = ['', '', '', '', ''];
        for (const c of w) {
          const g = FONT[c] || FONT[' '];
          for (let r = 0; r < 5; r++) rows[r] += g[r] + ' ';
        }
        maxW = Math.max(maxW, rows[0].length);
        return rows;
      });
      const C = this.cols, R = this.rows;
      // escala 2× na horizontal quando cabe (letras mais encorpadas)
      const sx = maxW * 2 < C * 0.4 ? 2 : 1;
      const x0 = Math.round(C * 0.79 - (maxW * sx) / 2), y0 = Math.round(R * 0.08);
      lines.forEach((rows, li) =>
        rows.forEach((row, r) => [...row].forEach((c, i) => {
          if (c !== ' ') for (let k = 0; k < sx; k++) cells.push({ x: x0 + i * sx + k + (li ? Math.round(((maxW - rows[0].length) * sx) / 2) : 0), y: y0 + li * 6 + r, c, r, li });
        })),
      );
      this.title = { cells, y0, x0, w: maxW * sx };
    },

    // ---------- quadro animado ----------
    frame(dt, t) {
      const C = this.cols, R = this.rows, N = C * R;
      const ch = (this.ch ||= []);
      ch.length = N;
      for (let i = 0; i < N; i++) ch[i] = this.bgCh[i];
      const col = (this.col && this.col.length === N * 3 ? this.col : (this.col = new Float32Array(N * 3)));
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
      // estrelas que piscam
      for (let k = 0; k < C * 0.5; k++) {
        const x = Math.floor(hash(k, 1) * C), y = Math.floor(hash(k, 2) * R * 0.5);
        if (Math.hypot((x - this.moon.x) / this.ar, y - this.moon.y) < this.moon.r * 2.2) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(k, 3) * 3) + k);
        put(x, y, tw > 0.85 ? '*' : tw > 0.4 ? '+' : '.', [200 * tw + 40, 200 * tw + 40, 230 * tw + 25]);
      }
      // nuvens em bancos que passam devagar, iluminadas pela lua
      for (let y = Math.floor(R * 0.06); y < R * 0.42; y++) {
        const env = Math.sin(((y - R * 0.06) / (R * 0.36)) * Math.PI);
        for (let x = 0; x < C; x++) {
          const v = vn2((x + t * 1.6) / 22, y / 3.2, 4) * 0.7 + vn2((x + t * 2.4) / 7, y / 1.6, 9) * 0.3;
          const k = (v - 0.66) * env * 3.2;
          if (k <= 0) continue;
          const near = 1 - clamp(Math.hypot((x - this.moon.x) / this.ar, y - this.moon.y) / (this.moon.r * 5), 0, 1);
          put(x, y, k > 0.42 ? '%' : k > 0.25 ? '=' : k > 0.12 ? '~' : '-', [60 + k * 70 + near * 90, 58 + k * 60 + near * 80, 95 + k * 70 + near * 70]);
        }
      }
      // janelas acesas com chama tremulante
      for (const w of this.windows) {
        const f = 0.75 + 0.25 * Math.sin(t * 7 + w.s) * Math.sin(t * 3.1 + w.s * 2);
        put(w.x, w.y, '▓', [255 * f, 170 * f, 60 * f]);
        put(w.x, w.y + 1, '▓', [230 * f, 130 * f, 40 * f]);
        for (let k = -2; k <= 2; k++) for (let j = -1; j <= 2; j++) if (k || j) put(w.x + k, w.y + j, null, [30 * f, 14 * f, 0], true);
      }
      // bandeiras tremulando
      for (const f of this.flags) {
        for (let k = 1; k <= 5; k++) {
          const dy = Math.round(Math.sin(t * 5 - k * 0.9) * 0.6);
          put(f.x + k, f.y + dy, k === 5 ? '>' : '~', k % 2 ? [220, 50, 44] : [180, 36, 32]);
          put(f.x + k, f.y + dy + 1, k === 5 ? '>' : '~', [150, 28, 26]);
        }
        put(f.x, f.y, '|', [90, 80, 70]);
        put(f.x, f.y + 1, '|', [90, 80, 70]);
      }
      // névoa rolando sobre a floresta
      const nf = noise1(83);
      for (let y = Math.floor(R * 0.66); y < R * 0.8; y++)
        for (let x = 0; x < C; x++) {
          const v = nf((x + t * 4) / 18 + y * 0.7) * (1 - Math.abs(y - R * 0.73) / (R * 0.07));
          if (v > 0.35) put(x, y, v > 0.55 ? '~' : null, [40 * v, 40 * v, 60 * v], true);
        }
      // vaga-lumes
      for (let k = 0; k < 26; k++) {
        const x = hash(k, 31) * C + Math.sin(t * 0.7 + k) * 6, y = R * (0.66 + hash(k, 33) * 0.12) + Math.sin(t * 1.3 + k * 2) * 2;
        const b = 0.5 + 0.5 * Math.sin(t * 3 + k);
        if (b > 0.3) put(x, y, '•', [190 * b, 255 * b, 90 * b]);
      }
      this.knight(put, t, dt);
      this.drawTitle(put, t);
      this.paint(ch, col);
    },
    // cavaleiro em arte de linha (o mesmo desenho do herói), com a espada de fogo erguida
    knight(put, t, dt) {
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
      // apaga o cenário por dentro da silhueta (o cavaleiro fica nítido na frente das montanhas)
      const fd = fc.getImageData(0, 0, W, H).data, id = ic.getImageData(0, 0, W, H).data;
      for (let j = 0; j < kr; j++)
        for (let i = 0; i < kc; i++) {
          const p = (Math.floor((j + 0.5) * (H / kr)) * W + Math.floor((i + 0.5) * (W / kc))) * 4;
          if (fd[p + 3] > 40 || id[p + 3] > 40) put(ox + i, oy + j, ' ', [0, 0, 0]);
        }
      for (let j = 0; j < kr; j++)
        for (let i = 0; i < kc; i++) {
          const c = cells.cells[j * kc + i];
          if (!c) continue;
          const g = CH[c[3]] || '#';
          put(ox + i, oy + j, g === ' ' ? '.' : g, [Math.min(255, c[0] * 1.2), Math.min(255, c[1] * 1.2), Math.min(255, c[2] * 1.2)]);
        }
      // espada de fogo: chamas pela lâmina, brilho e brasas
      const tip = [ox + (r.tip[0] / W) * kc, oy + (r.tip[1] / H) * kr], hand = [ox + (r.hand[0] / W) * kc, oy + (r.hand[1] / H) * kr];
      const L = Math.hypot(tip[0] - hand[0], (tip[1] - hand[1]) * this.ar);
      for (let s = 0; s <= 1; s += 1 / Math.max(4, L)) {
        const x = hand[0] + (tip[0] - hand[0]) * s, y = hand[1] + (tip[1] - hand[1]) * s;
        put(x, y, s > 0.15 ? (hash(Math.floor(t * 20), Math.floor(s * 50)) < 0.5 ? '|' : '!') : null, [255, 220 - s * 60, 120 - s * 80]);
        if (s > 0.15 && Math.random() < dt * 22) this.parts.push({ x: x + (Math.random() - 0.5) * 1.5, y, vx: (Math.random() - 0.5) * 3 - 1, vy: -3 - Math.random() * 6, life: 0.2 + Math.random() * 0.45, max: 0.65, ember: Math.random() < 0.08 });
      }
      // brilho quente ao redor da espada (soma cor nas células vizinhas)
      const gx = (tip[0] + hand[0]) / 2, gy = (tip[1] + hand[1]) / 2, gr = kr * 0.55;
      const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
      for (let y = Math.floor(gy - gr); y < gy + gr; y++)
        for (let x = Math.floor(gx - gr * this.ar); x < gx + gr * this.ar; x++) {
          const d = Math.hypot((x - gx) / this.ar, y - gy) / gr;
          if (d < 1) put(x, y, null, [120 * (1 - d) ** 2 * flick, 50 * (1 - d) ** 2 * flick, 8 * (1 - d) ** 2], true);
        }
      // brasas do vento atravessando a cena
      if (Math.random() < dt * 5) this.parts.push({ x: tip[0], y: tip[1], vx: 5 + Math.random() * 8, vy: -1 - Math.random() * 2.5, life: 2 + Math.random() * 2, max: 4, ember: true });
      for (const p of this.parts) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx += Math.sin(t * 3 + p.y) * dt * 4;
        const k = clamp(p.life / p.max, 0, 1);
        if (p.ember) put(p.x, p.y, k > 0.5 ? '*' : '.', [255, 120 + 80 * k, 30]);
        else put(p.x, p.y, k > 0.66 ? '^' : k > 0.33 ? '*' : "'", [255, 90 + 160 * k, 20 + 60 * k]);
      }
      this.parts = this.parts.filter((p) => p.life > 0);
    },
    drawTitle(put, t) {
      const T = this.title;
      if (!T) return;
      for (const c of T.cells) {
        const sh = 0.5 + 0.5 * Math.sin(t * 2 - (c.x - T.x0) * 0.08); // brilho correndo pelas letras
        const top = c.r / 4;
        const base = c.li ? mix([255, 200, 90], [210, 80, 30], top) : mix([255, 225, 120], [230, 110, 40], top);
        put(c.x + 1, c.y + 1, c.c, [40, 14, 6]); // sombra
        put(c.x, c.y, c.c, base.map((v) => Math.min(255, v + sh * 50)));
      }
      const sub = '~ uma lenda em ASCII ~';
      const sx = Math.round(T.x0 + T.w / 2 - sub.length / 2), sy = T.y0 + 12;
      [...sub].forEach((c, i) => put(sx + i, sy, c, [200, 170, 120]));
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
    },
  });
})();

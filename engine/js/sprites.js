'use strict';
// Sprites: arte em Canvas 2D (procedural ou PNG importado) amostrada para células de "tinta".
// Células parcialmente cobertas viram glifos de contorno (/ \ ( ) _ ") para silhuetas nítidas.
(function () {
  const E = window.ENG;
  const GI = (c) => E.glyphIndex(c);
  const EDGE = { up: GI('_'), down: GI('-'), left: GI('|'), right: GI('|'), d1: GI('/'), d2: GI('\\'), dot: GI('.'), colon: GI(':') };

  // canvas -> {w,h,cells:[[r,g,b,glyph]|null]}; glyph = -1 → o shader escolhe pela luminância
  E.canvasToCells = (cv, cols, rows, alphaMin = 0.22, edges = true) => {
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const cells = new Array(cols * rows).fill(null);
    const cw = cv.width / cols, ch = cv.height / rows;
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        const q = [0, 0, 0, 0];
        const x0 = Math.floor(cx * cw), x1 = Math.floor((cx + 1) * cw), y0 = Math.floor(cy * ch), y1 = Math.floor((cy + 1) * ch);
        const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const i = (y * cv.width + x) * 4, al = d[i + 3] / 255;
            if (!al) {
              n++;
              continue;
            }
            r += d[i] * al;
            g += d[i + 1] * al;
            b += d[i + 2] * al;
            a += al;
            n++;
            q[(y >= ym ? 2 : 0) + (x >= xm ? 1 : 0)] += al;
          }
        const cov = n ? a / n : 0;
        if (cov < alphaMin) continue;
        let gl = -1;
        if (edges && cov < 0.82) {
          const qn = n / 4;
          const [tl, tr, bl, br] = q.map((v) => v / qn);
          const gx = tr + br - (tl + bl), gy = bl + br - (tl + tr);
          const mag = Math.hypot(gx, gy);
          if (mag > 0.55) {
            if (Math.abs(gy) > Math.abs(gx) * 1.8) gl = gy > 0 ? EDGE.up : EDGE.down;
            else if (Math.abs(gx) > Math.abs(gy) * 1.8) gl = gx > 0 ? EDGE.right : EDGE.left;
            else gl = gx * gy > 0 ? EDGE.d1 : EDGE.d2;
          } else if (cov < 0.4) gl = EDGE.dot;
        }
        cells[cy * cols + cx] = [r / a, g / a, b / a, gl];
      }
    return { w: cols, h: rows, cells };
  };

  E.imageToStamp = (img, cols, aspect) => {
    const rows = Math.max(1, Math.round((cols * img.height) / img.width / aspect));
    const cv = document.createElement('canvas');
    cv.width = cols * 4;
    cv.height = rows * 4;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return E.canvasToCells(cv, cols, rows, 0.5, false);
  };

  // ---------- helpers de desenho ----------
  // marca: fixa um caractere exato numa célula do sprite (olho, fivela, barba, coroa...).
  // x,y em pixels do canvas, antes do espelhamento; sem cor, usa a cor que a célula já tem
  const mark = (ctx, x, y, ch, col) => (ctx.canvas.marks ||= []).push([x, y, ch, col]);
  const MIRROR = { '/': '\\', '\\': '/', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const applyMarks = (c, cv, flip) => {
    const cw = cv.width / c.w, chh = cv.height / c.h;
    for (const [mx, my, ch, col] of cv.marks || []) {
      const X = Math.floor((flip ? cv.width - mx : mx) / cw), Y = Math.floor(my / chh);
      if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) continue;
      const i = Y * c.w + X, old = c.cells[i];
      const rgb = col ? (typeof col === 'string' ? hexRgb(col) : col) : old;
      if (!rgb) continue;
      c.cells[i] = [rgb[0], rgb[1], rgb[2], E.glyphIndex(flip ? MIRROR[ch] || ch : ch)];
    }
  };
  const limb = (ctx, pts, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  const joint = (x, y, len, ang) => [x + Math.sin(ang) * len, y + Math.cos(ang) * len]; // ang 0 = para baixo, + = para frente

  // ---------- herói: andarilho encapuzado esguio (capuz pontudo, capa longa, espada fina) ----------
  // ângulos locais: 0 = para baixo, +π/2 = para frente, π = para cima (antes do espelhamento)
  E.HERO = { cols: 40, rows: 20, px: 8 }; // largo o bastante para a espada estendida não ser cortada
  E.heroPose = (st) => {
    const ph = st.phase, s = st.state;
    const P = { lean: 0, drop: 0, legF: 0.05, kneeF: 0.08, legB: -0.05, kneeB: 0.08, arm: 0.3, elbow: 0.35, armB: -0.12, elbowB: 0.3, sword: null, hem: 0, back: 0.1, head: 0 };
    const br = Math.sin(st.t * 2.2);
    if (s === 'idle') {
      P.drop = br * 0.006;
      P.arm = 0.28 + br * 0.03;
      P.armB = -0.1 - br * 0.02;
      P.head = br * 0.03;
    } else if (s === 'run') {
      const sn = Math.sin(ph);
      P.lean = 0.17 + Math.sin(ph * 2) * 0.03;
      P.drop = -Math.abs(Math.cos(ph)) * 0.03 + 0.02;
      // coxa balança moderado; o joelho dobra forte na fase de recuperação (perna indo para trás/para cima)
      P.legF = 0.12 + 0.6 * sn;
      P.kneeF = 0.2 + Math.max(0, -Math.sin(ph - 0.5)) * 1.7;
      P.legB = 0.12 - 0.6 * sn;
      P.kneeB = 0.2 + Math.max(0, Math.sin(ph - 0.5)) * 1.7;
      P.arm = 0.35 - 0.65 * sn;
      P.elbow = 1.05 + 0.2 * sn;
      P.armB = 0.25 + 0.65 * sn;
      P.elbowB = 1.0 - 0.2 * sn;
      P.hem = Math.sin(ph * 2) * 0.5;
      P.back = 0.8;
      P.head = -0.05;
    } else if (s === 'jump') {
      P.lean = 0.05;
      P.legF = 1.0;
      P.kneeF = 1.6;
      P.legB = 0.2;
      P.kneeB = 1.0;
      P.arm = 2.0;
      P.elbow = 0.5;
      P.armB = 2.5;
      P.elbowB = 0.4;
      P.back = 0.9;
      P.hem = -0.6;
    } else if (s === 'fall') {
      P.legF = 0.35;
      P.kneeF = 0.5;
      P.legB = -0.25;
      P.kneeB = 0.55;
      P.arm = 1.7;
      P.elbow = 0.7;
      P.armB = 2.1;
      P.elbowB = 0.6;
      P.back = 1.2;
      P.hem = 0.9;
    } else if (s === 'land' || s === 'crouch') {
      P.drop = s === 'crouch' ? 0.2 : 0.11;
      P.lean = 0.3;
      P.legF = 1.3;
      P.kneeF = 2.3;
      P.legB = 0.6;
      P.kneeB = 2.0;
      P.arm = 0.8;
      P.elbow = 0.9;
      P.armB = 0.3;
      P.elbowB = 0.8;
    } else if (s === 'dash') {
      P.lean = 0.6;
      P.legF = 1.0;
      P.kneeF = 1.3;
      P.legB = -0.9;
      P.kneeB = 0.6;
      P.arm = -0.4;
      P.elbow = 0.2;
      P.armB = -0.7;
      P.elbowB = 0.2;
      P.back = 1.6;
    } else if (s === 'wall') {
      P.lean = -0.12;
      P.legF = 0.8;
      P.kneeF = 1.3;
      P.legB = 0.3;
      P.kneeB = 1.0;
      P.arm = 2.3;
      P.elbow = 0.3;
      P.armB = 1.8;
      P.elbowB = 0.5;
    } else if (s === 'climb') {
      const k = Math.sin(ph);
      P.legF = 0.6 + k * 0.5;
      P.kneeF = 1.3;
      P.legB = 0.6 - k * 0.5;
      P.kneeB = 1.3;
      P.arm = 2.7 + k * 0.35;
      P.elbow = 0.5;
      P.armB = 2.7 - k * 0.35;
      P.elbowB = 0.5;
    } else if (s === 'hurt') {
      P.lean = -0.35;
      P.arm = 2.0;
      P.elbow = 0.6;
      P.armB = 2.4;
      P.elbowB = 0.5;
      P.legF = 0.4;
      P.kneeF = 0.6;
      P.back = 1.0;
      P.head = 0.15;
    } else if (s === 'swim') {
      P.lean = 0.9;
      P.arm = 1.6 + Math.sin(ph) * 1.0;
      P.elbow = 0.4;
      P.armB = 1.6 - Math.sin(ph) * 1.0;
      P.legF = Math.sin(ph) * 0.4;
      P.legB = -Math.sin(ph) * 0.4;
      P.back = 1.2;
    }
    if (s === 'attack') {
      const n = st.atk.n, t = Math.min(1, st.atk.t), aim = st.atk.local ?? Math.PI / 2;
      const e = t < 0.18 ? -0.15 * (t / 0.18) : 1 - Math.pow(1 - (t - 0.18) / 0.82, 3); // antecipação + golpe
      const [a0, a1] = n === 1 ? [aim - 1.7, aim + 1.3] : n === 2 ? [aim + 1.3, aim - 1.7] : [aim - 2.5, aim + 1.5];
      P.lean = (n === 3 ? 0.3 : 0.16) * Math.cos(aim - Math.PI / 2);
      P.legF = 0.55;
      P.kneeF = 0.4;
      P.legB = -0.45;
      P.kneeB = 0.35;
      P.arm = a0 + (a1 - a0) * e;
      P.elbow = 0.12;
      P.sword = P.arm + P.elbow;
      P.armB = -0.5;
      P.elbowB = 0.7;
      P.smear = t > 0.18 ? { from: P.arm - (a1 - a0) * Math.min(0.45, e), to: P.arm } : null;
      P.back = 0.7;
    }
    if (P.sword == null) P.sword = P.arm + P.elbow + (s === 'idle' ? 0.25 : 0.5);
    return P;
  };
  // mistura suave entre a pose atual e a pose-alvo (movimento fluido)
  E.blendPose = (cur, target, dt, fast) => {
    if (!cur) return Object.assign({}, target);
    const k = 1 - Math.exp(-dt * 16), kf = 1 - Math.exp(-dt * 45);
    for (const key in target) {
      const v = target[key];
      if (typeof v !== 'number') {
        cur[key] = v;
        continue;
      }
      const kk = fast && (key === 'arm' || key === 'sword' || key === 'elbow') ? kf : k;
      cur[key] = (cur[key] ?? v) + (v - (cur[key] ?? v)) * kk;
    }
    return cur;
  };

  // segmento de membro com volume: cápsula afinando de w0 para w1, sombreada na transversal
  const seg = (ctx, a, b, w0, w1, dark, light) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const g = ctx.createLinearGradient(a[0] + nx * w0, a[1] + ny * w0, a[0] - nx * w0, a[1] - ny * w0);
    g.addColorStop(0, dark);
    g.addColorStop(0.65, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a[0] + (nx * w0) / 2, a[1] + (ny * w0) / 2);
    ctx.lineTo(b[0] + (nx * w1) / 2, b[1] + (ny * w1) / 2);
    ctx.lineTo(b[0] - (nx * w1) / 2, b[1] - (ny * w1) / 2);
    ctx.lineTo(a[0] - (nx * w0) / 2, a[1] - (ny * w0) / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(a[0], a[1], w0 / 2, 0, Math.PI * 2);
    ctx.arc(b[0], b[1], w1 / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  E.drawHero = (ctx, W, H, st) => {
    const P = st.pose || E.heroPose(st);
    const gear = st.gear || {};
    const S = (st.unit || W / E.HERO.cols) * 1.55;
    const CLOAK = gear.cloak === 'rubra' ? ['#4a1210', '#9a2a22', '#e8645a', '#b8443a', '#3a0e0c', '#7a2420'] : ['#3c4152', '#8d95aa', '#e2e7f1', '#9fa7ba', '#2a2d38', '#666d82'];
    const FH = H * 0.93;
    const cx = W / 2, feet = H - 1;
    ctx.save();
    if (st.facing < 0) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    const hipY = feet - FH * (0.43 - P.drop);
    const hip = [cx - Math.sin(P.lean) * FH * 0.02, hipY];
    const torso = FH * 0.3;
    const neck = [hip[0] + Math.sin(P.lean) * torso, hip[1] - Math.cos(P.lean) * torso];
    const head = [neck[0] + Math.sin(P.lean + P.head) * FH * 0.05, neck[1] - FH * 0.075];
    const thigh = FH * 0.22, shin = FH * 0.22;
    const leg = (a, k, side) => {
      const h0 = [hip[0] + side * S * 0.35, hip[1]];
      const kn = joint(h0[0], h0[1], thigh, a);
      return [h0, kn, joint(kn[0], kn[1], shin, a - k)];
    };
    const LB = leg(P.legB, P.kneeB, -1), LF = leg(P.legF, P.kneeF, 1);
    const upper = FH * 0.15, fore = FH * 0.15;
    const arm = (a, el, sh) => {
      const e = joint(sh[0], sh[1], upper, a);
      return [sh, e, joint(e[0], e[1], fore, a + el)];
    };
    const shF = [neck[0] + S * 0.75, neck[1] + S * 0.9], shB = [neck[0] - S * 0.55, neck[1] + S * 0.9];
    const AF = arm(P.arm, P.elbow, shF), AB = arm(P.armB, P.elbowB, shB);
    const drawLeg = (L, d, l) => {
      seg(ctx, L[0], L[1], S * 1.35, S * 1.05, d, l); // coxa
      seg(ctx, L[1], L[2], S * 1.05, S * 0.75, d, l); // canela
      // bota: cano, peito do pé e sola
      const a = L[2];
      ctx.fillStyle = gear.boots === 'couro' ? '#6a4628' : '#2b2522';
      ctx.beginPath();
      ctx.moveTo(a[0] - S * 0.55, a[1] - S * 1.1);
      ctx.lineTo(a[0] + S * 0.5, a[1] - S * 1.1);
      ctx.lineTo(a[0] + S * 0.7, a[1] - S * 0.35);
      ctx.quadraticCurveTo(a[0] + S * 1.6, a[1] - S * 0.25, a[0] + S * 1.65, a[1] + S * 0.25);
      ctx.lineTo(a[0] - S * 0.6, a[1] + S * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = gear.boots === 'couro' ? '#a87a4a' : '#5a4532';
      ctx.fillRect(a[0] - S * 0.6, a[1] - S * (gear.boots === 'couro' ? 1.5 : 1.2), S * 1.15, S * (gear.boots === 'couro' ? 0.5 : 0.3));
      ctx.fillStyle = '#141215';
      ctx.fillRect(a[0] - S * 0.6, a[1] + S * 0.1, S * 2.25, S * 0.22);
    };
    const drawArm = (A, sleeveD, sleeveL, bracer) => {
      seg(ctx, A[0], A[1], S * 1.15, S * 0.9, sleeveD, sleeveL); // manga
      seg(ctx, A[1], A[2], S * 0.85, S * 0.68, '#3e2e20', bracer); // braçadeira de couro
      ctx.fillStyle = '#26232a'; // luva
      ctx.beginPath();
      ctx.arc(A[2][0], A[2][1], S * 0.5, 0, Math.PI * 2);
      ctx.fill();
    };
    // capa de trás (física)
    if (st.cape) {
      const g = ctx.createLinearGradient(neck[0] - S * 6, 0, neck[0] + S, 0);
      g.addColorStop(0, CLOAK[4]);
      g.addColorStop(1, CLOAK[5]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(neck[0] - S * 0.2, neck[1] + S * 0.3);
      for (const p of st.cape) ctx.lineTo(p[0], p[1]);
      const last = st.cape[st.cape.length - 1];
      ctx.lineTo(last[0] + S * 1.8, last[1] + S * 0.4);
      ctx.lineTo(hip[0] - S * 1.2, feet - FH * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    // membros de trás
    drawArm(AB, '#454b5c', '#6d7488', '#5a4632');
    drawLeg(LB, '#262934', '#3e4252');
    // corpo da capa: ombros estreitos, barra larga no tornozelo, com dobras
    const hemY = feet - FH * 0.15 + P.hem * S * 0.4;
    const sway = P.hem * S * 0.6 - P.back * S * 0.6;
    const cg = ctx.createLinearGradient(hip[0] - S * 3, 0, hip[0] + S * 3, 0);
    cg.addColorStop(0, CLOAK[0]);
    cg.addColorStop(0.4, CLOAK[1]);
    cg.addColorStop(0.75, CLOAK[2]);
    cg.addColorStop(1, CLOAK[3]);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(neck[0] - S * 1.3, neck[1] + S * 0.2);
    ctx.lineTo(neck[0] + S * 1.4, neck[1] + S * 0.2);
    ctx.quadraticCurveTo(hip[0] + S * 2.0, hip[1] - S, hip[0] + S * 2.2 + sway * 0.3, hemY);
    for (let k = 0; k <= 6; k++) ctx.lineTo(hip[0] + S * 2.2 - (k / 6) * S * 4.8 + sway * (0.3 + k / 6), hemY + Math.sin(st.t * 4 + k * 1.7) * S * 0.25 + (k % 2) * S * 0.35);
    ctx.quadraticCurveTo(hip[0] - S * 2.0, hip[1] - S, neck[0] - S * 1.3, neck[1] + S * 0.2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,44,58,0.55)';
    ctx.lineWidth = S * 0.35;
    for (const f of [-1.1, 0.1, 1.2]) {
      ctx.beginPath();
      ctx.moveTo(neck[0] + f * S * 0.6, neck[1] + S * 2);
      ctx.lineTo(hip[0] + f * S * 1.5 + sway * 0.5, hemY - S * 0.3);
      ctx.stroke();
    }
    // cinto com fivela
    ctx.strokeStyle = '#5e4128';
    ctx.lineWidth = S * 0.55;
    ctx.beginPath();
    ctx.moveTo(hip[0] - S * 1.6, hip[1] - S * 0.6);
    ctx.lineTo(hip[0] + S * 1.7, hip[1] - S * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#d8b25a';
    ctx.fillRect(hip[0] + S * 0.3, hip[1] - S * 0.95, S * 0.6, S * 0.7);
    if (gear.chest) {
      const mg = ctx.createLinearGradient(hip[0] - S * 2, 0, hip[0] + S * 2, 0);
      mg.addColorStop(0, '#4a4e5a');
      mg.addColorStop(0.55, '#c9ced8');
      mg.addColorStop(0.8, '#ffffff');
      mg.addColorStop(1, '#8a909c');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.moveTo(neck[0] - S * 1.25, neck[1] + S * 0.9);
      ctx.lineTo(neck[0] + S * 1.45, neck[1] + S * 0.9);
      ctx.lineTo(hip[0] + S * 1.55, hip[1] - S * 0.4);
      ctx.lineTo(hip[0] - S * 1.4, hip[1] - S * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,32,40,0.7)';
      ctx.lineWidth = S * 0.3;
      for (let k = 1; k <= 3; k++) {
        const yy = neck[1] + S * 0.9 + ((hip[1] - neck[1] - S * 1.3) * k) / 4;
        ctx.beginPath();
        ctx.moveTo(neck[0] - S * 1.2 + (hip[0] - neck[0]) * (k / 4), yy);
        ctx.lineTo(neck[0] + S * 1.4 + (hip[0] - neck[0]) * (k / 4), yy);
        ctx.stroke();
      }
    }
    // perna da frente aparece abaixo da capa
    drawLeg(LF, '#3c4050', '#6b7186');
    // gola em sombra separando capuz e capa
    ctx.fillStyle = '#1c1e26';
    ctx.beginPath();
    ctx.ellipse(neck[0] + S * 0.2, neck[1] + S * 0.5, S * 1.6, S * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    if (gear.helmet) {
      // elmo de ferro com viseira e penacho
      const pl = joint(head[0] - S * 0.2, head[1] - FH * 0.07, FH * 0.12, Math.PI * 0.85 - P.back * 0.15);
      limb(ctx, [[head[0] - S * 0.1, head[1] - FH * 0.07], [pl[0] - S * 1.5, pl[1] + S * 0.5]], S * 0.9, '#d63a2c');
      limb(ctx, [[head[0] - S * 0.5, head[1] - FH * 0.075], [pl[0] - S * 2.2, pl[1] + S * 1.6]], S * 0.7, '#a02822');
      const hm = ctx.createLinearGradient(head[0] - S * 2, 0, head[0] + S * 2, 0);
      hm.addColorStop(0, '#3e424e');
      hm.addColorStop(0.6, '#d8dde8');
      hm.addColorStop(1, '#ffffff');
      ctx.fillStyle = hm;
      ctx.beginPath();
      ctx.ellipse(head[0], head[1] - FH * 0.012, S * 1.55, FH * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(head[0] - S * 1.45, head[1] - FH * 0.01, S * 2.9, FH * 0.06);
      ctx.fillStyle = '#101116';
      ctx.fillRect(head[0] + S * 0.1, head[1] - FH * 0.004, S * 1.4, S * 0.35);
      if (Math.sin(st.t * 1.3) < 0.985) {
        ctx.fillStyle = '#ffe8a0';
        ctx.fillRect(head[0] + S * 0.75, head[1] - FH * 0.004, S * 0.3, S * 0.3);
      }
    } else {
    // capuz pontudo
    const hg = ctx.createLinearGradient(head[0] - S * 2, 0, head[0] + S * 2, 0);
    hg.addColorStop(0, '#3e4352');
    hg.addColorStop(0.55, '#dfe4ee');
    hg.addColorStop(1, '#ffffff');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(neck[0] - S * 1.5, neck[1] + S * 0.6);
    ctx.quadraticCurveTo(head[0] - S * 2.0, head[1] - FH * 0.02, head[0] - S * 0.3, head[1] - FH * 0.11 - P.back * S * 0.2);
    ctx.quadraticCurveTo(head[0] + S * 1.9, head[1] - FH * 0.05, head[0] + S * 1.6, head[1] + FH * 0.03);
    ctx.lineTo(neck[0] + S * 1.4, neck[1] + S * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#121318';
    ctx.beginPath();
    ctx.ellipse(head[0] + S * 0.45, head[1] + FH * 0.008, S * 0.55, FH * 0.03, 0.15, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(st.t * 1.3) < 0.985) {
      ctx.fillStyle = st.state === 'hurt' ? '#ff6a50' : '#ffe8a0';
      ctx.fillRect(head[0] + S * 0.6, head[1] - FH * 0.004, S * 0.38, S * 0.38);
    }
    }
    // ombreira
    ctx.fillStyle = gear.chest ? '#d0d5e0' : '#8c94a6';
    ctx.beginPath();
    ctx.ellipse(shF[0], shF[1], S * (gear.chest ? 1.3 : 0.95), S * (gear.chest ? 0.85 : 0.65), -0.3, 0, Math.PI * 2);
    ctx.fill();
    // espada (rastro + lâmina) e braço da frente
    const wc = st.weaponColor || [0.85, 0.92, 1];
    const wcs = `rgb(${wc.map((v) => Math.round(v * 255)).join(',')})`;
    const hand = AF[2];
    const bl = FH * (st.state === 'attack' ? 0.4 : 0.32);
    if (P.smear) {
      ctx.fillStyle = `rgba(${wc.map((v) => Math.round(v * 255)).join(',')},0.32)`;
      ctx.beginPath();
      const R = upper + fore + bl;
      for (let i = 0; i <= 12; i++) {
        const a = P.smear.from + ((P.smear.to - P.smear.from) * i) / 12;
        const pt = joint(shF[0], shF[1], R, a);
        i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
      }
      for (let i = 12; i >= 0; i--) {
        const a = P.smear.from + ((P.smear.to - P.smear.from) * i) / 12;
        const pt = joint(shF[0], shF[1], R * 0.82, a);
        ctx.lineTo(pt[0], pt[1]);
      }
      ctx.fill();
    }
    const tip = joint(hand[0], hand[1], bl, P.sword);
    seg(ctx, hand, tip, S * 0.55, S * 0.2, '#8a92a4', wcs);
    limb(ctx, [joint(hand[0], hand[1], -S * 0.75, P.sword), hand], S * 0.55, '#5e4128');
    limb(ctx, [joint(hand[0], hand[1], S * 0.4, P.sword + Math.PI / 2), joint(hand[0], hand[1], S * 0.4, P.sword - Math.PI / 2)], S * 0.45, '#d8b25a');
    drawArm(AF, '#7a8296', '#c8cfdd', '#7a5c40');
    ctx.restore();
    return { neck, hip };
  };

  // ---------- herói em ARTE DE LINHA (estilo ASCII clássico) ----------
  // Desenha o mesmo esqueleto/pose em duas camadas: `fill` (silhueta, só para tapar o fundo) e `ink` (traços).
  // canvasToLineCells escolhe o glifo de cada célula pela orientação do traço que passa nela.
  E.drawHeroLine = (ink, fill, W, H, st) => {
    const P = st.pose || E.heroPose(st);
    const gear = st.gear || {};
    const U = st.unit || W / E.HERO.cols; // px por célula
    const S = U * 1.55;
    const FH = H * 0.93;
    const cx = W / 2, feet = H - 1;
    const LW = Math.max(1.5, U * 0.36);
    const hi = st.detail !== 0;
    for (const c of [ink, fill]) {
      c.save();
      if (st.facing < 0) {
        c.translate(W, 0);
        c.scale(-1, 1);
      }
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    // esqueleto: quadril → cintura → peito → ombros → pescoço → cabeça
    const hipY = feet - FH * (0.43 - P.drop);
    const hip = [cx - Math.sin(P.lean) * FH * 0.02, hipY];
    const torso = FH * 0.27;
    const neck = [hip[0] + Math.sin(P.lean) * torso, hip[1] - Math.cos(P.lean) * torso];
    const at = (t, dx) => [hip[0] + (neck[0] - hip[0]) * t + dx, hip[1] + (neck[1] - hip[1]) * t]; // ponto no tronco
    const headR = S * 1.25;
    const head = [neck[0] + Math.sin(P.lean + P.head) * FH * 0.05, neck[1] - FH * 0.03 - headR * 1.15];
    const thigh = FH * 0.22, shin = FH * 0.22, upper = FH * 0.15, fore = FH * 0.15;
    const leg = (a, k, side) => {
      const h0 = [hip[0] + side * S * 0.6, hip[1]];
      const kn = joint(h0[0], h0[1], thigh, a);
      return [h0, kn, joint(kn[0], kn[1], shin, a - k)];
    };
    const LB = leg(P.legB, P.kneeB, -1), LF = leg(P.legF, P.kneeF, 1);
    const shF = at(0.97, S * 1.95), shB = at(0.97, -S * 1.75);
    const arm = (a, el, sh) => {
      const e = joint(sh[0], sh[1], upper, a);
      return [sh, e, joint(e[0], e[1], fore, a + el)];
    };
    const AF = arm(P.arm, P.elbow, shF), AB = arm(P.armB, P.elbowB, shB);
    // paletas das capas [traço, capa, peito, saia, capuz] e dos metais [traço, peito, sombra]
    const CL = { rubra: ['#e0584c', '#c8443a', '#7a2c24', '#4e1c18', '#6a2620'], gelo: ['#a8e0ff', '#6ab4e4', '#2c5a7a', '#1c3a50', '#2a5a78'], verde: ['#86d872', '#52a048', '#2c5a26', '#1c3a18', '#2e5e2a'], sombra: ['#b48ae8', '#7a52b0', '#3e2a5e', '#28183e', '#3a2658'] }[gear.cloak];
    const MET = { ferro: ['#e2e8f2', '#7c8496', '#6a7284'], ouro: ['#ffe08a', '#a8842c', '#8a6a20'] };
    const chM = MET[gear.chest], heM = MET[gear.helmet];
    const red = !!CL;
    const COL = {
      steel: '#e2e8f2', dark: '#8a92a6', cloth: CL ? CL[0] : '#bcc5d8', cape: CL ? CL[1] : '#8e98ae',
      leather: gear.boots === 'couro' ? '#c08a52' : '#9a7a5a', gold: '#e8c060', plume: '#e0483c',
      blade: st.weaponColor ? `rgb(${st.weaponColor.map((v) => Math.round(v * 255)).join(',')})` : '#e8f0ff',
    };
    // cores de preenchimento por região (dão "volume" no ASCII: cada parte tem um tom)
    const FILL = { back: '#22252f', chest: chM ? chM[1] : CL ? CL[2] : '#5c6580', skirt: CL ? CL[3] : '#363c4e', hood: gear.hood === 'sombra' ? '#3a2658' : CL ? CL[4] : '#4a5168', face: '#121016', neck: '#2a2430', boot: '#2a2420', belt: '#4a3420' };
    let fillCol = FILL.back;
    const stroke = (pts, col, w = LW, close = false) => {
      ink.strokeStyle = col;
      ink.lineWidth = w;
      ink.beginPath();
      ink.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ink.lineTo(pts[i][0], pts[i][1]);
      if (close) ink.closePath();
      ink.stroke();
    };
    const solid = (pts) => {
      // a peça da frente apaga os traços que ficaram atrás dela
      ink.save();
      ink.globalCompositeOperation = 'destination-out';
      ink.beginPath();
      ink.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ink.lineTo(pts[i][0], pts[i][1]);
      ink.closePath();
      ink.fill();
      ink.restore();
      fill.fillStyle = fillCol;
      fill.beginPath();
      fill.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) fill.lineTo(pts[i][0], pts[i][1]);
      fill.closePath();
      fill.fill();
    };
    const ellipse = (c0, rx, ry, col, fc) => {
      fillCol = fc;
      const pts = [];
      for (let i = 0; i < 16; i++) pts.push([c0[0] + Math.cos((i / 16) * Math.PI * 2) * rx, c0[1] + Math.sin((i / 16) * Math.PI * 2) * ry]);
      solid(pts);
      if (col) stroke(pts, col, LW, true);
      return pts;
    };
    const limbOutline = (a, b, w0, w1, col) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const p1 = [a[0] + (nx * w0) / 2, a[1] + (ny * w0) / 2], p2 = [b[0] + (nx * w1) / 2, b[1] + (ny * w1) / 2];
      const p3 = [b[0] - (nx * w1) / 2, b[1] - (ny * w1) / 2], p4 = [a[0] - (nx * w0) / 2, a[1] - (ny * w0) / 2];
      solid([p1, p2, p3, p4]);
      if (hi || w0 > S * 1.9) {
        stroke([p1, p2], col);
        stroke([p4, p3], col);
      } else stroke([a, b], col, LW * 1.1);
    };
    const boot = (L) => {
      const a = L[2];
      const pts = [[a[0] - S * 0.7, a[1] - S * 1.4], [a[0] + S * 0.6, a[1] - S * 1.4], [a[0] + S * 0.8, a[1] - S * 0.5], [a[0] + S * 2.0, a[1] - S * 0.1], [a[0] + S * 2.0, a[1] + S * 0.3], [a[0] - S * 0.8, a[1] + S * 0.3]];
      fillCol = FILL.boot;
      solid(pts);
      stroke(pts, COL.leather, LW, true);
    };
    // capa atrás
    if (st.cape) {
      const back = [[shB[0], shB[1] - S * 0.3], ...st.cape];
      const front = st.cape.map((p, i) => [p[0] + S * (1.5 + i * 0.25), p[1] + S * 0.3]).reverse();
      fillCol = FILL.back;
      solid([...back, ...front, [neck[0] + S * 0.4, neck[1] + S * 1.5]]);
      stroke(back, COL.cape);
      if (hi) for (let i = 1; i < st.cape.length - 1; i += 2) stroke([[shB[0] + S * 0.4, shB[1] + S * 1.5], st.cape[i]], COL.cape, LW * 0.7);
    }
    // membros de trás
    fillCol = FILL.back;
    limbOutline(AB[0], AB[1], S * 1.1, S * 0.95, COL.dark);
    limbOutline(AB[1], AB[2], S * 0.95, S * 0.8, COL.dark);
    if (hi) limbOutline(LB[0], LB[1], S * 1.35, S * 1.1, COL.dark);
    limbOutline(LB[1], LB[2], S * 1.1, S * 0.9, COL.dark);
    boot(LB);
    // QUADRIL + saia (abre de novo abaixo da cintura)
    const sway = P.hem * S * 0.5 - P.back * S * 0.4;
    const hemY = hip[1] + FH * 0.12;
    const skirt = [at(0.12, -S * 1.25), at(0.12, S * 1.35), [hip[0] + S * 1.95 + sway, hemY]];
    for (let k = 1; k <= 4; k++) skirt.push([hip[0] + S * 1.95 - (k / 4) * S * 3.9 + sway * (1 - k / 4), hemY + (k % 2 ? S * 0.6 : 0)]);
    fillCol = FILL.skirt;
    solid(skirt);
    stroke(skirt, COL.cloth, LW, true);
    // PEITO em V: ombros largos → cintura estreita
    const chest = [at(1, -S * 2.3), at(1, S * 2.45), at(0.62, S * 2.05), at(0.18, S * 1.2), at(0.18, -S * 1.1), at(0.62, -S * 1.85)];
    fillCol = FILL.chest;
    solid(chest);
    stroke(chest, chM ? chM[0] : COL.cloth, LW, true);
    if (hi) {
      // tabardo e emblema
      stroke([at(0.92, S * 0.15), at(0.22, S * 0.15)], COL.cloth, LW * 0.7);
      stroke([at(0.68, -S * 0.5), at(0.68, S * 0.8)], COL.gold, LW * 0.7);
      stroke([at(0.82, S * 0.15), at(0.5, S * 0.15)], COL.gold, LW * 0.7);
    }
    if (chM) for (const t of [0.78, 0.55]) stroke([at(t, -S * 1.6), at(t, S * 1.8)], chM[0], LW * 0.8);
    // cinto marcando a cintura
    fillCol = FILL.belt;
    const belt = [at(0.2, -S * 1.15), at(0.2, S * 1.25), at(0.1, S * 1.3), at(0.1, -S * 1.2)];
    solid(belt);
    stroke([at(0.15, -S * 1.2), at(0.15, S * 1.3)], COL.leather, LW * 1.2);
    stroke([at(0.15, S * 0.25), at(0.15, S * 0.85)], COL.gold, LW * 1.2);
    // perna da frente
    fillCol = FILL.skirt;
    if (hi) limbOutline(LF[0], LF[1], S * 1.35, S * 1.1, COL.steel);
    limbOutline(LF[1], LF[2], S * 1.1, S * 0.9, COL.steel);
    boot(LF);
    // PESCOÇO estreito (separa cabeça e tronco)
    fillCol = FILL.neck;
    const nk = [[neck[0] - S * 0.55, neck[1] + S * 0.4], [neck[0] + S * 0.6, neck[1] + S * 0.4], [head[0] + S * 0.55, head[1] + headR * 0.9], [head[0] - S * 0.5, head[1] + headR * 0.9]];
    solid(nk);
    if (hi) {
      stroke([nk[0], nk[3]], COL.dark, LW * 0.7);
      stroke([nk[1], nk[2]], COL.dark, LW * 0.7);
    }
    // CABEÇA oval separada
    if (heM) {
      ellipse(head, headR * 1.05, headR * 1.15, heM[0], heM[2]);
      stroke([[head[0] - S * 0.1, head[1] + S * 0.1], [head[0] + headR * 1.05, head[1] + S * 0.1]], heM[0], LW * 0.9); // viseira
      stroke([[head[0] + S * 0.2, head[1] - headR * 1.1], [head[0] - S * 1.2, head[1] - headR * 1.8 - P.back * S * 0.3], [head[0] - S * 2.8, head[1] - headR * 1.0 - P.back * S * 0.5]], COL.plume, LW * 1.2);
    } else {
      // capuz: oval da cabeça + ponta para trás
      fillCol = FILL.hood;
      const hood = [[head[0] - headR * 1.05, head[1] + headR * 0.7], [head[0] - headR * 1.2, head[1] - headR * 0.3], [head[0] - headR * 0.6, head[1] - headR * 1.25], [head[0] - headR * 0.3, head[1] - headR * 1.9 - P.back * S * 0.25], [head[0] + headR * 0.5, head[1] - headR * 1.1], [head[0] + headR * 1.1, head[1] - headR * 0.2], [head[0] + headR * 1.05, head[1] + headR * 0.8], [head[0], head[1] + headR * 1.05]];
      solid(hood);
      stroke(hood, gear.hood === 'sombra' ? '#b48ae8' : COL.cloth, LW, true);
      ellipse([head[0] + headR * 0.35, head[1] + headR * 0.1], headR * 0.55, headR * 0.6, hi ? COL.dark : null, FILL.face); // rosto em sombra
    }
    if (Math.sin(st.t * 1.3) < 0.985) {
      ink.fillStyle = st.state === 'hurt' ? '#ff6a50' : '#ffe8a0';
      ink.fillRect(head[0] + headR * 0.45, head[1] - S * 0.1, S * 0.5, S * 0.5);
    }
    // ombreiras dos dois lados (marcam a largura dos ombros)
    for (const [sh, col, k] of [[shB, COL.dark, 0.8], [shF, chM ? chM[0] : COL.cloth, 1.0]]) {
      const pa = [];
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI * 1.05 + (i / 6) * Math.PI * 0.9;
        pa.push([sh[0] + Math.cos(a) * S * 1.25 * k, sh[1] + Math.sin(a) * S * 0.85 * k + S * 0.3]);
      }
      stroke(pa, col, LW * 1.1);
    }
    // arma: o formato vem de weapon.shape
    const hand = AF[2];
    const shape = st.weaponShape || 'espada';
    const ang = P.sword;
    const bl = FH * (st.state === 'attack' ? 0.46 : 0.38) * ({ adaga: 0.6, lanca: 1.45, machado: 0.95, martelo: 1, cajado: 1.12, arco: 0.5 }[shape] || 1);
    let tip = joint(hand[0], hand[1], bl, ang);
    const nx = Math.cos(ang), ny = -Math.sin(ang);
    const ux = (tip[0] - hand[0]) / bl, uy = (tip[1] - hand[1]) / bl;
    const at2 = (k, o) => [hand[0] + ux * k + nx * o, hand[1] + uy * k + ny * o];
    const shaft = (k0, k1) => stroke([at2(k0, 0), at2(k1, 0)], COL.leather, LW);
    fillCol = '#1c2028';
    if (shape === 'lanca') {
      shaft(-S * 1.8, bl - S * 1.6);
      const h = [at2(bl - S * 1.9, S * 0.6), tip, at2(bl - S * 1.9, -S * 0.6)];
      solid(h);
      stroke(h, COL.blade, LW * 0.8, true);
    } else if (shape === 'machado') {
      shaft(-S * 0.9, bl);
      const h = [at2(bl - S * 0.3, 0), at2(bl + S * 0.2, S * 1.9), at2(bl - S * 2.6, S * 2.2), at2(bl - S * 2.0, 0)];
      solid(h);
      stroke(h, COL.blade, LW * 0.9, true);
    } else if (shape === 'martelo') {
      shaft(-S * 0.9, bl - S * 1.4);
      fillCol = '#3a3e48';
      const h = [at2(bl - S * 1.6, -S * 1.4), at2(bl, -S * 1.4), at2(bl, S * 1.4), at2(bl - S * 1.6, S * 1.4)];
      solid(h);
      stroke(h, COL.blade, LW, true);
    } else if (shape === 'cajado') {
      shaft(-S * 1.2, bl - S * 0.8);
      ellipse(tip, S * 0.95, S * 0.95, COL.blade, '#4a2a70');
    } else if (shape === 'arco') {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = -1 + i / 4;
        pts.push(at2(S * 1.5 * (1 - t * t), t * S * 3.4));
      }
      stroke(pts, COL.leather, LW * 1.1);
      stroke([pts[0], pts[8]], '#e8e0c8', LW * 0.5);
      tip = at2(S * 1.5, 0);
    } else if (shape !== 'mao') {
      const base = at2(S * 0.9, 0);
      const bw = S * (shape === 'adaga' ? 0.35 : 0.45);
      const e1 = [base[0] + nx * bw, base[1] + ny * bw], e2 = [base[0] - nx * bw, base[1] - ny * bw];
      solid([e1, tip, e2]);
      stroke([e1, tip, e2], COL.blade, LW * 0.8);
      stroke([at2(0, S * 0.6), at2(0, -S * 0.6)], COL.gold, LW);
      stroke([hand, at2(-S * 0.9, 0)], COL.leather, LW);
    }
    // braço da frente
    fillCol = FILL.chest;
    limbOutline(AF[0], AF[1], S * 1.15, S * 0.95, COL.steel);
    limbOutline(AF[1], AF[2], S * 0.95, S * 0.8, COL.steel);
    ink.strokeStyle = COL.leather;
    ink.lineWidth = LW;
    ink.beginPath();
    ink.arc(hand[0], hand[1], S * 0.55, 0, Math.PI * 2);
    ink.stroke();
    ink.restore();
    fill.restore();
    const mx = (p) => [st.facing < 0 ? W - p[0] : p[0], p[1]];
    return { neck, hip, tip: mx(tip), hand: mx(hand) };
  };

  // células a partir das camadas de traço + silhueta: glifo pela orientação do traço (momentos de 2ª ordem)
  const LG = {};
  for (const c of "-_|/\\()'`.,:o#~\" ") LG[c] = E.glyphIndex(c);
  E.canvasToLineCells = (inkCv, fillCv, cols, rows) => {
    const W = inkCv.width, H = inkCv.height;
    const d = inkCv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const f = fillCv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const cw = W / cols, ch = H / rows;
    const cells = new Array(cols * rows).fill(null);
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        const x0 = Math.floor(cx * cw), x1 = Math.floor((cx + 1) * cw), y0 = Math.floor(cy * ch), y1 = Math.floor((cy + 1) * ch);
        let m = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, r = 0, g = 0, b = 0, n = 0, fillA = 0, fr = 0, fg = 0, fb = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            n++;
            fillA += f[i + 3];
            fr += f[i];
            fg += f[i + 1];
            fb += f[i + 2];
            const a = d[i + 3] / 255;
            if (a < 0.25) continue;
            const px = (x - x0) / (x1 - x0), py = ((y - y0) / (y1 - y0)) * (ch / cw); // y em unidades físicas
            m += a;
            sx += a * px;
            sy += a * py;
            sxx += a * px * px;
            syy += a * py * py;
            sxy += a * px * py;
            r += d[i] * a;
            g += d[i + 1] * a;
            b += d[i + 2] * a;
          }
        const cov = m / n;
        if (cov < 0.05) {
          if (fillA / n > 120) {
            // interior: tapa o fundo com uma textura leve na cor da peça
            const k = (cx * 7 + cy * 13) % 5, L = (fr + fg + fb) / (3 * n * 255);
            const gl = L > 0.3 ? (k % 2 ? LG[':'] : LG['.']) : L > 0.17 ? (k === 0 ? LG[':'] : k === 2 ? LG['.'] : LG[' ']) : LG[' '];
            cells[cy * cols + cx] = [Math.min(255, (fr / n) * 1.25), Math.min(255, (fg / n) * 1.25), Math.min(255, (fb / n) * 1.25), gl];
          }
          continue;
        }
        const mx = sx / m, my = sy / m, aspect = ch / cw;
        const mu20 = sxx / m - mx * mx, mu02 = syy / m - my * my, mu11 = sxy / m - mx * my;
        const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02); // eixo principal (y para baixo)
        const elong = Math.sqrt((mu20 - mu02) ** 2 + 4 * mu11 * mu11) / (mu20 + mu02 + 1e-6);
        const yN = my / aspect; // 0 topo … 1 base
        let gl;
        if (cov > 0.72) gl = LG['#'];
        else if (elong < 0.3) gl = cov > 0.22 ? LG['o'] : yN > 0.62 ? LG['.'] : yN < 0.35 ? LG["'"] : LG[':'];
        else {
          const deg = (theta * 180) / Math.PI;
          if (Math.abs(deg) < 24) gl = yN > 0.62 ? LG['_'] : yN < 0.3 ? LG['`'] : LG['-'];
          else if (Math.abs(deg) > 66) gl = elong < 0.6 ? (mx < 0.4 ? LG['('] : mx > 0.6 ? LG[')'] : LG['|']) : LG['|'];
          else gl = deg > 0 ? LG['\\'] : LG['/'];
        }
        cells[cy * cols + cx] = [r / m, g / m, b / m, gl];
      }
    return { w: cols, h: rows, cells };
  };

  // ---------- criaturas ----------
  const SPR = (E.SPRITE_DRAW = {});
  SPR.spider = (ctx, W, H, t, anim) => {
    const ph = t * Math.PI * 2 * 1.5, cx = W * 0.5, cy = H * 0.45;
    for (let k = 0; k < 4; k++)
      for (const s of [-1, 1]) {
        const a = Math.sin(ph + k * 1.7 + (s > 0 ? 0 : Math.PI)) * 0.25;
        const kx = cx + s * W * (0.18 + k * 0.06), ky = cy - H * 0.35 + Math.sin(a) * H * 0.1;
        limb(ctx, [[cx + s * W * 0.06, cy], [kx, ky], [kx + s * W * 0.12, H - 1 - Math.max(0, Math.sin(ph + k)) * H * 0.15]], W / 38, '#7a5642');
      }
    const g = ctx.createRadialGradient(cx - W * 0.08, cy - H * 0.2, 1, cx, cy, W * 0.2);
    g.addColorStop(0, '#d8b08a');
    g.addColorStop(1, '#4a2e22');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx - W * 0.1, cy, W * 0.16, H * 0.32, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + W * 0.1, cy + H * 0.05, W * 0.08, H * 0.22, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ff3020';
    ctx.fillRect(cx + W * 0.13, cy - H * 0.05, W * 0.05, H * 0.14);
  };
  SPR.slime = (ctx, W, H, t, anim, e) => {
    const air = e && !e.onGround;
    const sq = air ? -0.15 : Math.sin(t * 5) * 0.06;
    const cx = W / 2, h = H * (0.75 + sq), w = W * (0.42 - sq * 0.8);
    const g = ctx.createRadialGradient(cx - w * 0.3, H - h * 0.8, 1, cx, H - h / 2, w);
    g.addColorStop(0, '#d8ffc0');
    g.addColorStop(0.4, '#6ee05a');
    g.addColorStop(1, '#1f6a2a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, H - h / 2, w, h / 2, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx + w * 0.15, H - h * 0.65, W * 0.08, H * 0.16);
    ctx.fillRect(cx + w * 0.5, H - h * 0.65, W * 0.08, H * 0.16);
  };
  SPR.bat = (ctx, W, H, t) => {
    const f = Math.sin(t * 22), cx = W / 2, cy = H * 0.45;
    ctx.fillStyle = '#5a3a6a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + s * W * 0.25, cy - H * 0.45 * f);
      ctx.lineTo(cx + s * W * 0.48, cy - H * 0.2 * f + H * 0.1);
      ctx.lineTo(cx + s * W * 0.3, cy + H * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#7a5a8a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, W * 0.09, H * 0.32, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(cx + W * 0.02, cy - H * 0.12, W * 0.04, H * 0.16);
  };
  SPR.skeleton = (ctx, W, H, t, anim, e) => {
    const walk = e && Math.abs(e.vx) > 1, ph = t * 7, cx = W / 2, FH = H * 0.92, feet = H - 1;
    const hip = [cx, feet - FH * 0.47], neck = [cx + FH * 0.02, feet - FH * 0.77];
    const bone = '#d8d4c4', dark = '#8a8676';
    const sw = walk ? Math.sin(ph) * 0.6 : 0.1;
    for (const [s, col] of [[-1, dark], [1, bone]]) {
      const k = joint(hip[0], hip[1], FH * 0.24, sw * s);
      limb(ctx, [hip, k, joint(k[0], k[1], FH * 0.24, sw * s - 0.2)], W * 0.07, col);
    }
    limb(ctx, [hip, neck], W * 0.08, bone);
    for (let i = 0; i < 4; i++) limb(ctx, [[neck[0] - W * 0.14, neck[1] + FH * (0.04 + i * 0.05)], [neck[0] + W * 0.14, neck[1] + FH * (0.04 + i * 0.05)]], W * 0.04, bone);
    const atk = anim === 'ataque' && e && e.animT < 0.4;
    limb(ctx, [[neck[0], neck[1] + FH * 0.03], joint(neck[0], neck[1] + FH * 0.03, FH * 0.16, atk ? -2.4 : 0.3), joint(neck[0], neck[1] + FH * 0.2, FH * 0.15, atk ? -2.6 : 0.1)], W * 0.06, bone);
    ctx.fillStyle = '#efeadb';
    ctx.beginPath();
    ctx.ellipse(neck[0] + W * 0.04, neck[1] - FH * 0.09, W * 0.2, FH * 0.08, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(neck[0] + W * 0.08, neck[1] - FH * 0.1, W * 0.1, FH * 0.04);
    ctx.fillStyle = '#ff5a30';
    ctx.fillRect(neck[0] + W * 0.11, neck[1] - FH * 0.095, W * 0.05, FH * 0.025);
  };
  SPR.skeleton2 = (ctx, W, H, t, anim, e) => {
    SPR.skeleton(ctx, W, H, t, 'idle', e);
    const atk = anim === 'ataque' && e && e.animT < 0.45;
    const FH = H * 0.92, feet = H - 1, sx = W * 0.62, sy = feet - FH * 0.62;
    const a = atk ? -2.6 + Math.min(1, (e.animT || 0) / 0.3) * 3.6 : 0.5;
    limb(ctx, [[sx, sy], joint(sx, sy, FH * 0.42, a)], W * 0.06, '#c8ccd6');
    ctx.fillStyle = '#5a3a26';
    ctx.beginPath();
    ctx.ellipse(W * 0.36, feet - FH * 0.55, W * 0.12, FH * 0.12, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#a08050';
    ctx.lineWidth = W * 0.03;
    ctx.stroke();
  };
  SPR.torch = (ctx, W, H, t) => {
    limb(ctx, [[W * 0.5, H - 1], [W * 0.5, H * 0.45]], W * 0.16, '#5a3a22');
    ctx.fillStyle = '#8a8f9a';
    ctx.fillRect(W * 0.3, H * 0.4, W * 0.4, H * 0.08);
    for (let k = 0; k < 3; k++) {
      const h = H * (0.32 + 0.1 * Math.sin(t * 11 + k * 2.1));
      const x = W * (0.38 + k * 0.12) + Math.sin(t * 7 + k) * W * 0.05;
      const g = ctx.createLinearGradient(0, H * 0.42 - h, 0, H * 0.42);
      g.addColorStop(0, 'rgba(255,240,170,0.15)');
      g.addColorStop(0.35, '#ffd040');
      g.addColorStop(1, '#ff4a10');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - W * 0.14, H * 0.42);
      ctx.quadraticCurveTo(x - W * 0.08, H * 0.42 - h * 0.6, x, H * 0.42 - h);
      ctx.quadraticCurveTo(x + W * 0.08, H * 0.42 - h * 0.6, x + W * 0.14, H * 0.42);
      ctx.fill();
    }
  };
  SPR.knight = (ctx, W, H, t, anim, e) => {
    const atk = anim === 'ataque' && e && e.animT < 0.45;
    const moving = e && Math.abs(e.vx) > 2;
    const st = { unit: W / 24, state: atk ? 'attack' : moving ? 'run' : 'idle', t, phase: t * 9, facing: 1, vx: e ? e.vx : 0, vy: 0, atk: { n: 1, t: atk ? e.animT / 0.45 : 0, local: Math.PI / 2 }, weaponColor: [0.8, 0.82, 0.9], gear: { helmet: 'ferro', chest: 'ferro', cloak: 'rubra' }, cape: null };
    E.drawHero(ctx, W, H, st);
  };
  SPR.wisp = (ctx, W, H, t) => {
    const cx = W * 0.55, cy = H * 0.5;
    for (let k = 0; k < 6; k++) {
      const x = cx - k * W * 0.08, y = cy + Math.sin(t * 6 + k) * H * 0.12;
      const r = W * (0.16 - k * 0.022);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, k ? 'rgba(190,140,255,0.9)' : '#ffffff');
      g.addColorStop(1, 'rgba(110,60,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
    }
  };
  SPR.npc = (ctx, W, H, t) => {
    const cx = W / 2, FH = H * 0.9, feet = H - 1, sway = Math.sin(t * 1.5) * W * 0.01;
    limb(ctx, [[cx + W * 0.28, feet], [cx + W * 0.3, feet - FH * 0.95]], W * 0.05, '#7a5a3a'); // cajado
    ctx.fillStyle = '#ffd27f';
    ctx.fillRect(cx + W * 0.25, feet - FH * 0.98, W * 0.1, FH * 0.05);
    const g = ctx.createLinearGradient(cx - W * 0.3, 0, cx + W * 0.3, 0);
    g.addColorStop(0, '#3e2a1e');
    g.addColorStop(1, '#8a6a4a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.12 + sway, feet - FH * 0.78);
    ctx.lineTo(cx + W * 0.14 + sway, feet - FH * 0.78);
    ctx.lineTo(cx + W * 0.3, feet);
    ctx.lineTo(cx - W * 0.3, feet);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6a4a32';
    ctx.beginPath();
    ctx.ellipse(cx + sway, feet - FH * 0.85, W * 0.16, FH * 0.09, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e8e8e0'; // barba
    ctx.beginPath();
    ctx.moveTo(cx + sway, feet - FH * 0.82);
    ctx.lineTo(cx + W * 0.13 + sway, feet - FH * 0.82);
    ctx.lineTo(cx + W * 0.06 + sway, feet - FH * 0.62);
    ctx.fill();
    ctx.fillStyle = '#ffeaa0';
    ctx.fillRect(cx + W * 0.06 + sway, feet - FH * 0.87, W * 0.05, FH * 0.025);
  };
  SPR.chest = (ctx, W, H, t, anim) => {
    const open = anim === 'aberto';
    ctx.fillStyle = '#7a4a26';
    ctx.fillRect(W * 0.08, H * 0.45, W * 0.84, H * 0.55);
    if (open) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(W * 0.14, H * 0.35, W * 0.72, H * 0.15);
      ctx.fillStyle = '#5a361c';
      ctx.fillRect(W * 0.08, 0, W * 0.84, H * 0.2);
    } else {
      ctx.fillStyle = '#9a6234';
      ctx.fillRect(W * 0.08, H * 0.15, W * 0.84, H * 0.32);
    }
    ctx.fillStyle = '#e8c060';
    ctx.fillRect(W * 0.08, H * 0.45, W * 0.84, H * 0.08);
    ctx.fillRect(W * 0.45, H * 0.4, W * 0.1, H * 0.25);
  };
  SPR.bonfire = (ctx, W, H, t) => {
    limb(ctx, [[W * 0.15, H - 2], [W * 0.85, H * 0.82]], W * 0.08, '#5a3a22');
    limb(ctx, [[W * 0.15, H * 0.82], [W * 0.85, H - 2]], W * 0.08, '#6a4a2a');
    for (let k = 0; k < 3; k++) {
      const x = W * (0.35 + k * 0.15), h = H * (0.55 + 0.2 * Math.sin(t * 9 + k * 2));
      const g = ctx.createLinearGradient(0, H - h, 0, H * 0.85);
      g.addColorStop(0, 'rgba(255,240,180,0.1)');
      g.addColorStop(0.3, '#ffcc40');
      g.addColorStop(1, '#ff4a10');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - W * 0.12, H * 0.85);
      ctx.quadraticCurveTo(x - W * 0.06, H - h * 0.6, x + Math.sin(t * 7 + k) * W * 0.05, H - h);
      ctx.quadraticCurveTo(x + W * 0.08, H - h * 0.6, x + W * 0.12, H * 0.85);
      ctx.fill();
    }
  };

  SPR.door = (ctx, W, H, t, anim) => {
    const open = anim === 'aberta';
    if (open) {
      ctx.fillStyle = '#5a361c';
      ctx.fillRect(0, 0, W * 0.25, H);
      ctx.fillStyle = '#c0c6d0';
      ctx.fillRect(W * 0.05, H * 0.15, W * 0.15, H * 0.05);
      ctx.fillRect(W * 0.05, H * 0.8, W * 0.15, H * 0.05);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#6a4224');
    g.addColorStop(0.5, '#9a6436');
    g.addColorStop(1, '#5a361c');
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.1, 0, W * 0.8, H);
    ctx.fillStyle = '#3a2412';
    for (let k = 1; k < 3; k++) ctx.fillRect(W * (0.1 + k * 0.27), 0, W * 0.04, H);
    ctx.fillStyle = '#8a8f9a';
    ctx.fillRect(W * 0.1, H * 0.15, W * 0.8, H * 0.04);
    ctx.fillRect(W * 0.1, H * 0.8, W * 0.8, H * 0.04);
    ctx.fillStyle = '#e8c060';
    ctx.beginPath();
    ctx.arc(W * 0.72, H * 0.52, W * 0.08, 0, 7);
    ctx.fill();
  };

  // ---------- spritesheet importado ----------
  const imgCache = new Map();
  const getImage = (src) => {
    let im = imgCache.get(src);
    if (!im) {
      im = new Image();
      im.src = src;
      imgCache.set(src, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  };
  const parseRange = (s, n) => {
    if (!s) return [...Array(n).keys()];
    const out = [];
    for (const part of String(s).split(',')) {
      const [a, b] = part.split('-').map((v) => parseInt(v, 10));
      if (isNaN(a)) continue;
      for (let i = a; i <= (isNaN(b) ? a : b); i++) out.push(i);
    }
    return out.length ? out : [0];
  };

  // ---------- herói em pixel art: veste o manequim e colore a arma em tempo real ----------
  // A folha `parts` diz a parte de cada pixel (R/20); `meta` traz mãos, pescoço, cabeça e a flecha encaixada.
  // O resultado é um quadro pequeno em pixels, que depois vira ASCII como qualquer imagem do jogo.
  const sheetData = new Map();
  const sheetPixels = (src) => {
    let d = sheetData.get(src);
    if (d) return d;
    const im = getImage(src);
    if (!im) return null;
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth;
    cv.height = im.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, 0);
    d = { w: cv.width, data: cx.getImageData(0, 0, cv.width, cv.height).data };
    sheetData.set(src, d);
    return d;
  };
  const heroFrames = new Map();
  const HP = {
    // tons claros de propósito: no ASCII o brilho decide a densidade do caractere (escuro vira ':' ralo)
    skin: [245, 196, 156], hair: [150, 96, 52], tunic: [86, 146, 214], pants: [150, 112, 82], boot: [128, 86, 54], belt: [170, 112, 60],
    metal: { ferro: [200, 206, 220], ouro: [246, 204, 92] },
    cape: { rubra: [220, 64, 64], gelo: [140, 200, 245], verde: [96, 178, 92], sombra: [140, 96, 190] },
    boots: { couro: [168, 112, 64], ferro: [196, 202, 216], aladas: [236, 240, 250] },
    hood: [128, 84, 168], wood: [190, 128, 66], staff: [170, 116, 64], hilt: [160, 108, 56], guard: [230, 186, 80], steel: [220, 230, 245],
    string: [225, 220, 205], fletch: [200, 70, 60], strap: [130, 86, 44],
  };
  const REF = { 1: 129, 2: 161, 3: 223, 4: 223, 6: 255, 7: 231 };
  // o: { look (aparência das armaduras), weapon (definição da arma), cape ('idle' | 'run' | 'air'), wave (fase da capa) }
  E.heroPixels = (img, f, o = {}) => {
    const L = o.look || {}, wpn = o.weapon || {};
    const key = f + '|' + JSON.stringify(L) + '|' + (wpn.shape || '') + (wpn.color || '') + (wpn.tint || '') + (wpn.unarmed ? 'u' : '') + (wpn.elem || '') + '|' + (o.cape || '') + '|' + (o.wave || 0) + '|' + (o.pose || '') + (o.step || 0) + '|' + (o.legsF ?? '');
    let cv = heroFrames.get(key);
    if (cv) return cv;
    const C = sheetPixels(img.src), P = sheetPixels(img.parts);
    let M = img.meta && img.meta[f];
    if (!C || !P || !M) return null;
    const FW = img.fw, FH = img.fh;
    const N = FW * FH, part = new Uint8Array(N), gray = new Uint8Array(N), out = new Uint8ClampedArray(N * 4);
    const pm = new Uint8Array(N); // partes do quadro pintado (inclui 12 capa, 13 flecha, 14 detalhes) — usado pelo herói 3D
    // lê partes e tons de cinza de um quadro da folha
    const load = (fi, pa, gr) => {
      const ox = (fi % img.cols) * FW, oy = Math.floor(fi / img.cols) * FH;
      for (let y = 0; y < FH; y++)
        for (let x = 0; x < FW; x++) {
          const si = ((oy + y) * C.w + ox + x) * 4;
          if (!C.data[si + 3]) continue;
          pa[y * FW + x] = Math.round(P.data[si] / 20) || 3;
          gr[y * FW + x] = C.data[si];
        }
    };
    // ao tirar o braço da frente, o tronco que ele cobria fica furado: preenche com o tronco da mesma linha
    const patchTorso = (removed) => {
      for (const i of removed) {
        const y = (i / FW) | 0, x = i % FW;
        let l = -1, r = -1;
        for (let k = 1; k < 6 && (l < 0 || r < 0); k++) {
          if (l < 0 && x - k >= 0 && part[y * FW + x - k] === 3) l = y * FW + x - k;
          if (r < 0 && x + k < FW && part[y * FW + x + k] === 3) r = y * FW + x + k;
        }
        if (l >= 0 && r >= 0) (part[i] = 3), (gray[i] = (gray[l] + gray[r]) >> 1);
      }
    };
    let HF = M.h, HB = M.b; // mãos da frente e de trás (para pintar a pele)
    const ARMS = [1, 6, 8, 9];
    if (o.legsF != null && img.meta[o.legsF]) {
      // mirando andando/pulando: o corpo inteiro (cabeça, tronco e pernas) vem do quadro de movimento e só
      // braços, arco e corda vêm do quadro de mira, presos no ombro (deslocados pelo pescoço) — nada se separa
      const ML = img.meta[o.legsF], ap = new Uint8Array(N), ag = new Uint8Array(N);
      load(o.legsF, part, gray);
      load(f, ap, ag);
      const dx = ML.n[0] - M.n[0], dy = ML.n[1] - M.n[1], removed = [];
      for (let i = 0; i < N; i++) if (ARMS.includes(part[i])) (part[i] === 6 && removed.push(i)), (part[i] = 0);
      patchTorso(removed);
      for (const layer of [1, 3]) // braço de trás só atrás do corpo; depois braço da frente, arco e corda por cima
        for (let i = 0; i < N; i++) {
          const pp = ap[i];
          if (!ARMS.includes(pp) || (layer === 1) !== (pp === 1)) continue;
          const X = (i % FW) + dx, Y = ((i / FW) | 0) + dy;
          if (X < 0 || Y < 0 || X >= FW || Y >= FH) continue;
          const j = Y * FW + X;
          if (part[j] === 7 || (pp === 1 && part[j])) continue;
          part[j] = pp;
          gray[j] = ag[i];
        }
      HF = [M.h[0] + dx, M.h[1] + dy];
      HB = [M.b[0] + dx, M.b[1] + dy];
      M = Object.assign({}, ML, { h: HF, b: HB, arrow: M.arrow ? [M.arrow[0] + dx, M.arrow[1] + dx, M.arrow[2] + dy] : null });
    } else load(f, part, gray);
    // escalada: braços redesenhados como membros grossos do ombro até a mão no degrau (um alto, outro mais baixo),
    // perna do lado do braço alto sobe um degrau; os lados alternam. A arma não aparece
    if (o.pose === 'climb') {
      const s = (o.step || 0) % 4;
      // mão relativa ao ombro (x para a frente, y para baixo): alto, médio
      const HIGH = [1, -10], MID = [3, -6], LOW = [3, 1];
      const target = [[HIGH, LOW], [MID, MID], [LOW, HIGH], [MID, MID]][s], lift = [[3, 0], [1, 1], [0, 3], [1, 1]][s];
      const src = part.slice(), sg = gray.slice(), removed = [], tone = { 6: 0, 1: 0 }, cnt = { 6: 0, 1: 0 };
      for (let i = 0; i < N; i++) if (src[i] === 6 || src[i] === 1) (tone[src[i]] += sg[i]), cnt[src[i]]++;
      for (let i = 0; i < N; i++) if ([1, 2, 4, 6, 8, 9].includes(src[i])) (src[i] === 6 && removed.push(i)), (part[i] = 0);
      patchTorso(removed);
      for (let i = 0; i < N; i++) {
        const pp = src[i];
        if (pp !== 2 && pp !== 4) continue;
        const Y = ((i / FW) | 0) - lift[pp === 4 ? 0 : 1], j = Y * FW + (i % FW);
        if (Y >= 0 && !part[j]) (part[j] = pp), (gray[j] = sg[i]);
      }
      // ombros logo abaixo do pescoço; o de trás um pixel mais para trás
      const sh = { 6: [M.n[0] + 1, M.n[1] + 2], 1: [M.n[0] - 1, M.n[1] + 2] };
      const limb = (pp, t) => {
        const [sx, sy] = sh[pp], hx = sx + t[0], hy = sy + t[1], g = cnt[pp] ? Math.round(tone[pp] / cnt[pp]) : 150;
        // cotovelo dobrado para fora (para trás) dá forma de braço, não de vara
        const ex = sx + t[0] * 0.5 - 1.5, ey = sy + t[1] * 0.5;
        const seg = (ax, ay, bx, by) => {
          const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2) + 1;
          for (let k = 0; k <= n; k++) {
            const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
            for (const [ox, oy] of [[0, 0], [1, 0]]) {
              const X = x + ox, Y = y + oy;
              if (X < 0 || Y < 0 || X >= FW || Y >= FH) continue;
              const j = Y * FW + X;
              if (part[j] === 7 || (pp === 1 && part[j])) continue;
              part[j] = pp;
              gray[j] = g;
            }
          }
        };
        seg(sx, sy, ex, ey);
        seg(ex, ey, hx, hy);
        return [hx + 0.5, hy];
      };
      HB = limb(1, target[1]);
      HF = limb(6, target[0]);
    }
    let wy0 = 99, wy1 = -1;
    for (let i = 0; i < N; i++) if (part[i] === 8) (wy0 = Math.min(wy0, (i / FW) | 0)), (wy1 = Math.max(wy1, (i / FW) | 0));
    // desarmado: some a arma (os golpes viram socos)
    if (wpn.unarmed) for (let i = 0; i < N; i++) if (part[i] === 8 || part[i] === 5) part[i] = 0; // arma e rastro da lâmina
    const put = (i, c, a = 255) => {
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      out[i * 4 + 3] = a;
    };
    const k = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
    const mixc = (a, b, t) => a.map((v, j) => v + (b[j] - v) * t);
    const wc = (wpn.color || [0.8, 0.85, 0.95]).map((v) => v * 255);
    const metal = HP.metal[L.chest] || HP.metal.ferro, hm = HP.metal[L.helmet] || HP.metal.ferro;
    const [hx0, hy0, hx1] = M.hd, d2 = (x, y, q) => (x - q[0]) ** 2 + (y - q[1]) ** 2;
    // capa: atrás do corpo (só onde não há pixel), presa no pescoço e solta conforme o movimento
    if (L.cloak) {
      const cc = HP.cape[L.cloak] || HP.cape.rubra, trail = o.cape === 'run' ? 7 : o.cape === 'air' ? 4 : 1.5;
      const top = M.n[1] + 1, bot = Math.min(FH - 3, M.hip + (o.cape === 'air' ? 4 : 8));
      for (let y = top; y <= bot; y++) {
        const t = (y - top) / Math.max(1, bot - top), cx = M.n[0] - 1 - trail * t * t - Math.sin(t * 5 + (o.wave || 0)) * 0.9 * t, hw = 0.8 + 2.4 * t;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          if (x < 0 || x >= FW) continue;
          const i = y * FW + x;
          if (!part[i]) put(i, k(cc, 0.7 + 0.3 * ((x - (cx - hw)) / (2 * hw)))), (pm[i] = 12);
        }
      }
    }
    for (let i = 0; i < N; i++) {
      const p = part[i];
      if (!p) continue;
      const x = i % FW, y = (i / FW) | 0, sh = Math.max(0.55, Math.min(1.2, gray[i] / (REF[p] || gray[i] || 1)));
      let c;
      if (p === 7) {
        // cabeça: cabelo, elmo ou capuz por cima; olho na frente (o herói olha para a direita)
        const rel = y - hy0, back = x <= hx0;
        if (L.helmet) c = rel <= 1 || x <= hx0 + 1 ? hm : x === hx1 && rel === 2 ? [45, 30, 30] : HP.skin;
        else if (L.hood) c = rel <= 1 || back ? HP.hood : k(HP.skin, 0.8);
        else c = rel === 0 || (back && rel <= 2) ? HP.hair : rel === 2 && x === hx1 ? [45, 30, 30] : HP.skin;
      } else if (p === 3) c = k(y >= M.hip - 1 ? (L.chest ? k(metal, 0.7) : HP.belt) : L.chest ? metal : HP.tunic, sh);
      else if (p === 6 || p === 1) {
        const hand = d2(x, y, p === 6 ? HF : HB) <= 2.3;
        c = hand ? (L.chest ? metal : HP.skin) : L.chest && y <= M.n[1] + 2 ? k(metal, 1.1) : L.chest ? k(metal, 0.9) : k(HP.tunic, 0.9);
        if (p === 1) c = k(c, 0.72);
      } else if (p === 4 || p === 2) {
        c = y >= FH - 4 ? HP.boots[L.boots] || HP.boot : HP.pants;
        if (p === 2) c = k(c, 0.72);
      } else if (p === 5) {
        // rastro do golpe desenhado no sprite: recebe a paleta do elemento da arma (fio claro na borda, cor da lâmina dentro)
        const pal = E.FX.pal(wpn.elem || (wpn.shape ? null : 'aco'), wpn.color || [0.8, 0.85, 0.95]);
        let open = 0;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (part[(y + ddy) * FW + x + ddx] !== 5) open++;
        c = (open >= 2 ? pal[0] : pal[1]).map((v) => Math.round(v * 255));
      }
      else if (p === 8) {
        // a arma desenhada no arquivo (silhueta preta), colorida conforme o tipo
        if (wpn.shape === 'arco') c = y === wy0 || y === wy1 ? k(HP.wood, 1.3) : HP.wood;
        else if (wpn.shape === 'cajado') c = y <= wy0 + 1 ? wc : HP.staff;
        else if (d2(x, y, M.h) <= 4 || d2(x, y, M.b) <= 4) c = wpn.elem === 'luz' ? HP.guard : HP.hilt;
        else {
          // lâmina: aço tingido pela cor da arma (encantadas bem mais fortes); o fio de cima fica mais claro
          const edge = !part[(y - 1) * FW + x] || part[(y - 1) * FW + x] !== 8;
          c = mixc(HP.steel, wc, wpn.tint ?? 0.35);
          if (edge) c = mixc(c, [255, 255, 255], 0.3);
        }
      } else if (p === 9) c = HP.string;
      else if (p === 10) c = HP.fletch;
      else if (p === 11) c = HP.strap;
      else c = [gray[i], gray[i], gray[i]];
      put(i, c);
    }
    // detalhes: penacho do elmo de ferro, pontas da coroa de ouro, cauda do capuz, gola da capa
    for (let i = 0; i < N; i++) if (part[i]) pm[i] = part[i];
    const dot = (x, y, c, id = 14) => x >= 0 && y >= 0 && x < FW && y < FH && (put(y * FW + x, c), (pm[y * FW + x] = id));
    if (L.helmet === 'ferro') dot(hx0, hy0 - 1, [200, 40, 40]), dot(hx0 - 1, hy0, [200, 40, 40]), dot(hx0 + 1, hy0 - 1, [220, 60, 50]);
    else if (L.helmet === 'ouro') dot(hx0, hy0 - 1, hm), dot((hx0 + hx1) >> 1, hy0 - 1, hm), dot(hx1, hy0 - 1, hm);
    if (L.hood) for (let j = 1; j <= 3; j++) if (!part[(hy0 + j) * FW + hx0 - 1]) dot(hx0 - 1, hy0 + j, HP.hood);
    if (L.cloak) for (let x = M.n[0] - 1; x <= M.n[0] + 1; x++) dot(x, M.n[1], HP.cape[L.cloak] || HP.cape.rubra);
    // flecha encaixada enquanto o arco é puxado
    if (M.arrow && wpn.shape === 'arco') {
      const [ax0, ax1, ay] = M.arrow;
      for (let x = ax0; x <= ax1; x++) dot(x, ay, x >= ax1 - 1 ? HP.steel : x <= ax0 + 1 ? HP.fletch : [170, 128, 72], 13);
    }
    cv = document.createElement('canvas');
    cv.width = FW;
    cv.height = FH;
    // na CPU (willReadFrequently): é copiado para o canvas do herói, que é lido a cada quadro
    cv.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(out, FW, FH), 0, 0);
    cv.pmap = pm;
    cv.rgba = out;
    if (heroFrames.size > 800) heroFrames.clear();
    heroFrames.set(key, cv);
    return cv;
  };

  // prog (0..1) toca a animação uma vez sincronizada com uma ação (ex.: o golpe); sem ele, repete pelo tempo.
  // img.fit preserva a proporção do pixel e apoia os pés na base do quadro
  const drawImageFrame = (ctx, W, H, img, def, anim, t, prog, set, hero) => {
    const im = getImage(img.src);
    if (!im) return;
    const A = set || img.anims || {};
    const cols = img.cols || 1, rows = img.rows || 1, n = cols * rows;
    const seq = parseRange(A[anim] || A.idle, n);
    // cada animação tem sua velocidade (img.fpsBy); as de `img.once` tocam uma vez e seguram o último quadro
    const fi = Math.floor(t * ((img.fpsBy && img.fpsBy[anim]) || img.fps || 8));
    const f = prog != null ? seq[Math.min(seq.length - 1, Math.floor(prog * seq.length))] : img.once && img.once.includes(anim) ? seq[Math.min(seq.length - 1, fi)] : seq[fi % seq.length];
    const fw = im.naturalWidth / cols, fh = im.naturalHeight / rows;
    ctx.imageSmoothingEnabled = !img.pixel;
    // herói vestido em tempo real (folha de partes)
    const pc = hero && img.parts ? E.heroPixels(img, f, hero) : null;
    if (pc) {
      const k = Math.min(W / pc.width, H / pc.height), dw = pc.width * k, dh = pc.height * k;
      ctx.drawImage(pc, 0, 0, pc.width, pc.height, (W - dw) / 2, H - dh, dw, dh);
      return { pc, x: (W - dw) / 2, y: H - dh, k };
    }
    if (img.fit) {
      const k = Math.min(W / fw, H / fh), dw = fw * k, dh = fh * k;
      ctx.drawImage(im, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, (W - dw) / 2, H - dh, dw, dh);
    } else ctx.drawImage(im, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, 0, 0, W, H);
  };

  // herói com spritesheet próprio: desenha o quadro da animação `anim` (fallback: idle)
  // o: { variant (tipo da arma: usa img.variants[variant] se existir), prog (0..1 para tocar uma vez),
  //      look e weapon (veste o herói e colore a arma, se a imagem tiver folha de partes) }
  E.drawImageHero = (ctx, W, H, img, anim, t, facing, o = {}) => {
    if (facing < 0) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    const A = (o.variant && img.variants && img.variants[o.variant]) || img.anims || {};
    const a = A[anim] ? anim : anim === 'attack' && A.attack1 ? 'attack1' : anim.startsWith('attack') && A.attack1 ? 'attack1' : anim === 'fall' && A.jump ? 'jump' : 'idle';
    const cape = /run|dash|swim/.test(a) ? 'run' : /jump|fall|wall/.test(a) ? 'air' : 'idle';
    // o.legs = { anim, prog }: pernas de outra animação (andar/pular enquanto mira); o.pose/o.step: pose sintetizada (escalada)
    let legsF = null;
    if (o.legs && A[o.legs.anim]) {
      const seq = parseRange(A[o.legs.anim], (img.cols || 1) * (img.rows || 1));
      legsF = seq[Math.min(seq.length - 1, Math.floor((o.legs.prog % 1) * seq.length))];
    }
    const info = drawImageFrame(ctx, W, H, img, null, a, t, o.prog, A, { look: o.look, weapon: o.weapon, cape: o.legs ? (o.legs.anim === 'run' ? 'run' : 'air') : cape, wave: Math.floor(t * 6) % 12, pose: o.pose, step: o.step, legsF });
    if (facing < 0) ctx.restore();
    return info;
  };

  // quadro em células de uma entidade (cache por pose discreta)
  const cache = new Map();
  // ---------- pessoas dos vilarejos (def.look define roupa, chapéu e ferramenta) ----------
  const poly = (ctx, pts, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  const oval = (ctx, x, y, rx, ry, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, 7);
    ctx.fill();
  };
  const crown = (ctx, cx, y, w, h, col = '#ffd23f') => {
    poly(ctx, [[cx - w / 2, y], [cx - w / 2, y - h], [cx - w / 4, y - h * 0.45], [cx, y - h * 1.1], [cx + w / 4, y - h * 0.45], [cx + w / 2, y - h], [cx + w / 2, y]], col);
    ctx.fillStyle = '#ff3a48';
    ctx.fillRect(cx - w * 0.06, y - h * 0.45, w * 0.12, h * 0.3);
  };
  // ---------- pessoas (NPCs): corpo em camadas guiado por `look` ----------
  // look: robe/robe2 (roupa clara/escura), skin, pants, boots, gloves, belt, buckle, apron, sash, cape,
  //   dress, armor (peitoral de metal), pauldron (ombreiras), hair + hairStyle (curto|longo|rabo|careca|trança|tonsura),
  //   beard + beardStyle (cheia|longa|cavanhaque|bigode), hat (capuz|capuzFundo|chapeu|pontudo|elmo|elmoNobre|lenco|
  //   coroa|capacete|tricornio|boina|faixa), hatc, gem, pouch, bag, amulet, tool (martelo|lanca|cajado|vara|frasco|cesta|
  //   picareta|arco|livro|lanterna|ervas|espada|corda|rosario), shield, quiver, work (anima o trabalho), age
  SPR.person = (ctx, W, H, t, anim, e) => {
    const L = (e && e.def && e.def.look) || {};
    const walk = e && Math.abs(e.vx) > 1, ph = t * 8;
    const talking = e && e.sayT > 0;
    const cx = W / 2, FH = H * 0.92, feet = H - 1;
    const old = L.age === 'velho';
    // respiração: período de 2 s (o cache de quadros repete a cada 4 s)
    const breath = Math.sin(t * Math.PI) * FH * 0.006;
    const bob = walk ? Math.abs(Math.sin(ph)) * FH * 0.015 : breath;
    const stoop = old ? W * 0.05 : 0;
    const hip = [cx, feet - FH * 0.45 - bob], neck = [cx + W * 0.02 + stoop, feet - FH * (old ? 0.74 : 0.77) - bob];
    const robe = L.robe || '#6a5a48', robe2 = L.robe2 || '#3e342a', skin = L.skin || '#d8a880';
    const dark = (h, k = 0.6) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    const boots = L.boots || '#2e2218', pants = L.pants || '#3e3228';
    // capa atrás de tudo: balança com o vento e com a caminhada
    if (L.cape) {
      const sw = Math.sin(t * Math.PI) * W * 0.02 + (walk ? -W * 0.06 : 0);
      poly(ctx, [[neck[0] - W * 0.14, neck[1] + FH * 0.03], [neck[0] + W * 0.06, neck[1] + FH * 0.03], [cx - W * 0.08 + sw, feet - FH * 0.08], [cx - W * 0.34 + sw, feet - FH * 0.04]], dark(L.cape, 0.8));
      poly(ctx, [[cx - W * 0.34 + sw, feet - FH * 0.04], [cx - W * 0.27 + sw, feet - FH * 0.1], [cx - W * 0.2 + sw, feet - FH * 0.03]], dark(L.cape, 0.55));
    }
    // aljava nas costas
    if (L.quiver) {
      poly(ctx, [[neck[0] - W * 0.2, neck[1] + FH * 0.02], [neck[0] - W * 0.12, neck[1] - FH * 0.02], [cx - W * 0.06, hip[1] - FH * 0.02], [cx - W * 0.14, hip[1] + FH * 0.01]], '#6a4424');
      for (let k = 0; k < 3; k++) limb(ctx, [[neck[0] - W * (0.17 - k * 0.03), neck[1] + FH * 0.01], [neck[0] - W * (0.2 - k * 0.03), neck[1] - FH * 0.07]], W * 0.025, k === 1 ? '#c84a3a' : '#e8e0c8');
    }
    // pernas e botas (a de trás mais escura)
    const legW = W * (L.dress ? 0.08 : 0.1);
    for (const s of [-1, 1]) {
      const a = walk ? Math.sin(ph) * 0.55 * s : 0.06 * s;
      const k = joint(hip[0], hip[1], FH * 0.22, a);
      const f = joint(k[0], k[1], FH * 0.22, a - 0.12);
      limb(ctx, [hip, k, f], legW, s < 0 ? dark(pants, 0.65) : pants);
      // cano da bota e pé
      limb(ctx, [joint(k[0], k[1], FH * 0.12, a - 0.12), f], legW * 1.15, s < 0 ? dark(boots, 0.7) : boots);
      oval(ctx, f[0] + W * 0.04, f[1] - FH * 0.012, W * 0.09, FH * 0.028, s < 0 ? dark(boots, 0.7) : boots);
    }
    // braço de trás
    const shB = [neck[0] - W * 0.1, neck[1] + FH * 0.05];
    const elB = joint(shB[0], shB[1], FH * 0.17, walk ? -Math.sin(ph) * 0.5 : -0.15);
    const handB = joint(elB[0], elB[1], FH * 0.15, walk ? -Math.sin(ph) * 0.3 : 0);
    limb(ctx, [shB, elB, handB], W * 0.09, dark(robe2, 0.85));
    oval(ctx, handB[0], handB[1], W * 0.04, FH * 0.018, L.gloves ? dark(L.gloves, 0.8) : dark(skin, 0.8));
    // escudo no braço de trás
    if (L.shield) {
      oval(ctx, handB[0] - W * 0.02, handB[1] - FH * 0.04, W * 0.17, FH * 0.11, L.shield);
      oval(ctx, handB[0] - W * 0.02, handB[1] - FH * 0.04, W * 0.12, FH * 0.08, dark(L.shield, 0.75));
      oval(ctx, handB[0] - W * 0.02, handB[1] - FH * 0.04, W * 0.04, FH * 0.022, '#d8c070');
      mark(ctx, handB[0] - W * 0.02, handB[1] - FH * 0.04, '+', '#ffe08a');
    }
    // corpo: túnica (ou vestido) com borda e sombra lateral
    const hem = L.dress ? feet - FH * 0.06 : hip[1] + FH * 0.11, hw = L.dress ? W * 0.28 : W * 0.2;
    const g = ctx.createLinearGradient(cx - W * 0.25, 0, cx + W * 0.25, 0);
    g.addColorStop(0, robe2);
    g.addColorStop(1, robe);
    const torso = [[neck[0] - W * 0.17, neck[1] + FH * 0.02], [neck[0] + W * 0.17, neck[1] + FH * 0.02], [cx + W * 0.15, hip[1]], [cx + hw, hem], [cx - hw, hem], [cx - W * 0.15, hip[1]]];
    poly(ctx, torso, g);
    // barra da roupa: faixa escura com dobras
    poly(ctx, [[cx + hw, hem], [cx - hw, hem], [cx - hw * 0.97, hem - FH * 0.03], [cx + hw * 0.97, hem - FH * 0.03]], dark(robe2, 0.75));
    if (L.dress) for (const k of [-0.5, 0, 0.5]) limb(ctx, [[cx + hw * k * 0.6, hip[1] + FH * 0.05], [cx + hw * k, hem - FH * 0.03]], W * 0.02, dark(robe, 0.75));
    if (L.armor) {
      // peitoral de metal com rebites
      poly(ctx, [[neck[0] - W * 0.15, neck[1] + FH * 0.04], [neck[0] + W * 0.16, neck[1] + FH * 0.04], [cx + W * 0.14, hip[1] - FH * 0.02], [cx - W * 0.14, hip[1] - FH * 0.02]], L.armor);
      poly(ctx, [[neck[0] - W * 0.02, neck[1] + FH * 0.04], [neck[0] + W * 0.16, neck[1] + FH * 0.04], [cx + W * 0.14, hip[1] - FH * 0.02], [cx + W * 0.02, hip[1] - FH * 0.02]], dark(L.armor, 1.25));
      mark(ctx, cx - W * 0.1, neck[1] + FH * 0.1, 'o');
      mark(ctx, cx + W * 0.12, neck[1] + FH * 0.1, 'o');
      if (L.crest) mark(ctx, cx + W * 0.02, neck[1] + FH * 0.15, L.crest, '#ffd23f');
    }
    if (L.apron) {
      poly(ctx, [[cx - W * 0.03, neck[1] + FH * 0.08], [cx + W * 0.17, neck[1] + FH * 0.08], [cx + W * 0.2, hem - FH * 0.01], [cx - W * 0.06, hem - FH * 0.01]], L.apron);
      // fuligem no avental
      for (const [ox, oy] of [[0.04, 0.2], [0.1, 0.32]]) oval(ctx, cx + W * ox, neck[1] + FH * oy, W * 0.03, FH * 0.012, dark(L.apron, 0.6));
    }
    if (L.sash) poly(ctx, [[neck[0] + W * 0.14, neck[1] + FH * 0.03], [neck[0] + W * 0.17, neck[1] + FH * 0.07], [cx - W * 0.13, hip[1] - FH * 0.01], [cx - W * 0.15, hip[1] - FH * 0.05]], L.sash);
    // cinto, fivela e bolsas
    ctx.fillStyle = L.belt || '#3a2616';
    ctx.fillRect(cx - W * 0.16, hip[1] - FH * 0.028, W * 0.34, FH * 0.04);
    mark(ctx, cx + W * 0.03, hip[1] - FH * 0.008, '=', L.buckle || '#d8b050');
    if (L.pouch) {
      oval(ctx, cx - W * 0.1, hip[1] + FH * 0.03, W * 0.06, FH * 0.03, L.pouch);
      mark(ctx, cx - W * 0.1, hip[1] + FH * 0.03, 'o', dark(L.pouch, 1.3));
    }
    if (L.bag) {
      limb(ctx, [[neck[0] + W * 0.12, neck[1] + FH * 0.03], [cx - W * 0.16, hip[1] + FH * 0.02]], W * 0.035, '#5a3a20');
      oval(ctx, cx - W * 0.2, hip[1] + FH * 0.05, W * 0.11, FH * 0.06, L.bag);
      mark(ctx, cx - W * 0.2, hip[1] + FH * 0.04, '$', '#ffd23f');
    }
    if (L.amulet) mark(ctx, neck[0] + W * 0.02, neck[1] + FH * 0.07, L.amulet === true ? '♦' : L.amulet, L.gem || '#ffd23f');
    // ombreiras
    if (L.pauldron) for (const ox of [-0.12, 0.13]) oval(ctx, neck[0] + W * ox, neck[1] + FH * 0.045, W * 0.09, FH * 0.035, L.pauldron);
    // braço da frente + ferramenta
    const shF = [neck[0] + W * 0.12, neck[1] + FH * 0.05];
    let a = walk ? Math.sin(ph) * 0.5 : 0.25;
    const tool = L.tool;
    // trabalho: o ferreiro martela num ritmo de 1 s; o alquimista agita o frasco
    const working = L.work !== false && !walk && !talking && (tool === 'martelo' || tool === 'picareta');
    const swing = working ? Math.max(0, Math.sin(t * Math.PI * 2)) : 0;
    if (working) a = 0.5 + swing * 2.0;
    if (tool === 'lanca' || tool === 'cajado' || tool === 'lanterna') a = 0.9;
    if (tool === 'frasco' && !walk) a = 1.1 + Math.sin(t * Math.PI * 2) * 0.25;
    if (tool === 'livro' && !walk) a = 1.25;
    // gesto ao conversar: mão para cima e para baixo
    if (talking && tool !== 'lanca' && tool !== 'cajado') a = 1.4 + Math.sin(t * Math.PI * 4) * 0.35;
    const el = joint(shF[0], shF[1], FH * 0.16, a);
    const hand = joint(el[0], el[1], FH * 0.15, a + (working ? 0.4 : -0.25));
    if (tool === 'lanca') {
      limb(ctx, [[hand[0], feet], [hand[0], feet - FH * 1.02]], W * 0.045, '#7a5a3a');
      poly(ctx, [[hand[0] - W * 0.05, feet - FH * 0.98], [hand[0], feet - FH * 1.1], [hand[0] + W * 0.05, feet - FH * 0.98]], '#d8dce6');
      mark(ctx, hand[0], feet - FH * 1.04, '^', '#e8ecf4');
    } else if (tool === 'cajado') {
      limb(ctx, [[hand[0], feet], [hand[0], feet - FH * 0.95]], W * 0.05, '#7a5a3a');
      // gema que pulsa (magos)
      const pulse = 0.8 + 0.2 * Math.sin(t * Math.PI * 2);
      oval(ctx, hand[0], feet - FH * 0.97, W * 0.07 * pulse, FH * 0.035 * pulse, L.gem || '#9a6aff');
      mark(ctx, hand[0], feet - FH * 0.97, '*', L.gem || '#c8a0ff');
    } else if (tool === 'vara') {
      limb(ctx, [hand, [hand[0] + W * 0.42, hand[1] - FH * 0.55]], W * 0.03, '#a07a4a');
      ctx.strokeStyle = '#d8d8d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hand[0] + W * 0.42, hand[1] - FH * 0.55);
      ctx.lineTo(hand[0] + W * 0.44, hand[1] + FH * 0.1 + Math.sin(t * 2) * FH * 0.02);
      ctx.stroke();
    } else if (tool === 'martelo') {
      const tip = joint(hand[0], hand[1], FH * 0.16, a + 1.6);
      limb(ctx, [hand, tip], W * 0.04, '#6a4a2a');
      oval(ctx, tip[0], tip[1], W * 0.09, FH * 0.04, '#8a8f9a');
      // faísca no fim da batida
      if (working && swing < 0.15) mark(ctx, tip[0] + W * 0.06, tip[1] + FH * 0.04, '*', '#ffd060');
    } else if (tool === 'picareta') {
      const tip = joint(hand[0], hand[1], FH * 0.18, a + 1.6);
      limb(ctx, [hand, tip], W * 0.04, '#6a4a2a');
      const p1 = joint(tip[0], tip[1], FH * 0.08, a + 3.1), p2 = joint(tip[0], tip[1], FH * 0.08, a + 0.1);
      limb(ctx, [p1, tip, p2], W * 0.035, '#9aa0aa');
    } else if (tool === 'frasco') {
      oval(ctx, hand[0], hand[1] - FH * 0.02, W * 0.07, FH * 0.035, L.gem || '#6aff9a');
      ctx.fillStyle = '#e8e8e0';
      ctx.fillRect(hand[0] - W * 0.015, hand[1] - FH * 0.075, W * 0.03, FH * 0.025);
      mark(ctx, hand[0], hand[1] - FH * 0.02, 'o', L.gem || '#8affb0');
    } else if (tool === 'cesta' || tool === 'ervas') {
      poly(ctx, [[hand[0] - W * 0.1, hand[1]], [hand[0] + W * 0.1, hand[1]], [hand[0] + W * 0.07, hand[1] + FH * 0.07], [hand[0] - W * 0.07, hand[1] + FH * 0.07]], '#a8783a');
      mark(ctx, hand[0], hand[1] + FH * 0.035, '#', '#7a5428');
      if (tool === 'ervas') for (const ox of [-0.05, 0, 0.05]) limb(ctx, [[hand[0] + W * ox, hand[1]], [hand[0] + W * ox * 1.6, hand[1] - FH * 0.05]], W * 0.025, '#5ab04a');
      else {
        oval(ctx, hand[0] - W * 0.03, hand[1] - FH * 0.005, W * 0.035, FH * 0.018, '#e84a3a');
        oval(ctx, hand[0] + W * 0.04, hand[1] - FH * 0.005, W * 0.035, FH * 0.018, '#7ad04a');
      }
    } else if (tool === 'livro') {
      poly(ctx, [[hand[0] - W * 0.09, hand[1] - FH * 0.02], [hand[0] + W * 0.09, hand[1] - FH * 0.02], [hand[0] + W * 0.09, hand[1] + FH * 0.035], [hand[0] - W * 0.09, hand[1] + FH * 0.035]], '#7a2a2a');
      mark(ctx, hand[0], hand[1], '≡', '#e8dcb0');
    } else if (tool === 'lanterna') {
      limb(ctx, [hand, [hand[0], hand[1] + FH * 0.05]], W * 0.02, '#4a4a50');
      oval(ctx, hand[0], hand[1] + FH * 0.08, W * 0.06, FH * 0.035, '#ffcc60');
      mark(ctx, hand[0], hand[1] + FH * 0.08, 'o', '#ffe7a0');
    } else if (tool === 'espada') {
      const tip = joint(hand[0], hand[1], FH * 0.3, a + 0.6);
      limb(ctx, [hand, tip], W * 0.04, '#d8dce6');
      limb(ctx, [joint(hand[0], hand[1], W * 0.08, a - 1), joint(hand[0], hand[1], W * 0.08, a + 2.2)], W * 0.035, '#c8a040');
    } else if (tool === 'arco') {
      ctx.strokeStyle = '#8a5a2a';
      ctx.lineWidth = W * 0.04;
      ctx.beginPath();
      ctx.ellipse(hand[0], hand[1], W * 0.07, FH * 0.2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      limb(ctx, [[hand[0], hand[1] - FH * 0.2], [hand[0], hand[1] + FH * 0.2]], 1, '#e8e0c8');
    } else if (tool === 'corda') {
      ctx.strokeStyle = '#c8a870';
      ctx.lineWidth = W * 0.03;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.ellipse(hand[0], hand[1] + FH * 0.04, W * (0.08 - k * 0.025), FH * (0.04 - k * 0.012), 0, 0, 7);
        ctx.stroke();
      }
    } else if (tool === 'rosario') {
      for (let k = 0; k < 4; k++) mark(ctx, hand[0], hand[1] + FH * (0.02 + k * 0.035), k === 3 ? '+' : '·', '#d8c890');
    }
    limb(ctx, [shF, el, hand], W * 0.09, robe);
    // manga com punho mais escuro
    limb(ctx, [joint(el[0], el[1], FH * 0.1, a + (working ? 0.4 : -0.25)), joint(el[0], el[1], FH * 0.12, a + (working ? 0.4 : -0.25))], W * 0.1, dark(robe, 0.7));
    oval(ctx, hand[0], hand[1], W * 0.045, FH * 0.02, L.gloves || skin);
    // cabeça
    const hc = [neck[0] + W * 0.02, neck[1] - FH * 0.075];
    const hairC = L.hair, hs = L.hairStyle || (L.dress ? 'longo' : 'curto');
    // cabelo comprido / trança fica atrás da cabeça
    if (hairC && (hs === 'longo' || hs === 'trança')) {
      poly(ctx, [[hc[0] - W * 0.15, hc[1] - FH * 0.02], [hc[0] - W * 0.02, hc[1] - FH * 0.02], [hc[0] - W * 0.06, hc[1] + FH * (hs === 'trança' ? 0.2 : 0.13)], [hc[0] - W * 0.17, hc[1] + FH * 0.11]], hairC);
      if (hs === 'trança') for (let k = 0; k < 3; k++) mark(ctx, hc[0] - W * 0.1, hc[1] + FH * (0.06 + k * 0.045), '8', dark(hairC, 1.25));
    }
    oval(ctx, hc[0], hc[1], W * 0.14, FH * 0.08, skin);
    // nariz e orelha dão perfil
    oval(ctx, hc[0] + W * 0.135, hc[1] + FH * 0.008, W * 0.03, FH * 0.015, dark(skin, 0.9));
    oval(ctx, hc[0] - W * 0.03, hc[1] + FH * 0.005, W * 0.025, FH * 0.018, dark(skin, 0.8));
    if (hairC) {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      if (hs === 'careca' || hs === 'tonsura') {
        // só a coroa de cabelo em volta
        ctx.ellipse(hc[0] - W * 0.03, hc[1] - FH * 0.005, W * 0.13, FH * 0.03, 0, Math.PI * 0.9, Math.PI * 1.6);
      } else ctx.ellipse(hc[0] - W * 0.01, hc[1] - FH * 0.02, W * 0.15, FH * 0.07, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      if (hs === 'rabo') limb(ctx, [[hc[0] - W * 0.13, hc[1] - FH * 0.02], [hc[0] - W * 0.2, hc[1] + FH * 0.06]], W * 0.05, hairC);
      if (hs === 'curto' || hs === 'rabo') mark(ctx, hc[0] - W * 0.02, hc[1] - FH * 0.06, '~', dark(hairC, 1.3));
    }
    // barba, bigode, cavanhaque
    if (L.beard) {
      const bs = L.beardStyle || 'cheia';
      if (bs === 'cheia' || bs === 'longa') {
        const len = bs === 'longa' ? 0.24 : 0.15;
        poly(ctx, [[hc[0] - W * 0.04, hc[1] + FH * 0.025], [hc[0] + W * 0.15, hc[1] + FH * 0.025], [hc[0] + W * 0.1, hc[1] + FH * (len * 0.6)], [hc[0] + W * 0.04, hc[1] + FH * len]], L.beard);
        mark(ctx, hc[0] + W * 0.06, hc[1] + FH * (len * 0.55), bs === 'longa' ? 'V' : 'w', dark(L.beard, 1.2));
      } else if (bs === 'cavanhaque') poly(ctx, [[hc[0] + W * 0.06, hc[1] + FH * 0.045], [hc[0] + W * 0.14, hc[1] + FH * 0.045], [hc[0] + W * 0.1, hc[1] + FH * 0.1]], L.beard);
      if (bs === 'bigode' || bs === 'cavanhaque' || bs === 'cheia') limb(ctx, [[hc[0] + W * 0.05, hc[1] + FH * 0.028], [hc[0] + W * 0.16, hc[1] + FH * 0.03]], W * 0.035, dark(L.beard, 0.9));
    }
    // chapéus e capacetes
    const hatc = L.hatc || robe;
    const hat = L.hat;
    if (hat === 'capuz' || hat === 'capuzFundo') {
      ctx.fillStyle = hatc;
      ctx.beginPath();
      ctx.ellipse(hc[0] - W * 0.02, hc[1] - FH * 0.01, W * 0.19, FH * 0.105, 0, Math.PI * 0.75, Math.PI * 2.1);
      ctx.fill();
      // ponta do capuz caída atrás
      poly(ctx, [[hc[0] - W * 0.15, hc[1] - FH * 0.06], [hc[0] - W * 0.27, hc[1] + FH * 0.04], [hc[0] - W * 0.14, hc[1] + FH * 0.03]], dark(hatc, 0.8));
      if (hat === 'capuzFundo') {
        // rosto na sombra: só os olhos brilham
        oval(ctx, hc[0] + W * 0.06, hc[1] + FH * 0.01, W * 0.1, FH * 0.06, '#0e0a10');
        mark(ctx, hc[0] + W * 0.09, hc[1], '·', L.eyes || '#9affd8');
      }
    } else if (hat === 'chapeu') {
      oval(ctx, hc[0], hc[1] - FH * 0.06, W * 0.3, FH * 0.022, hatc);
      oval(ctx, hc[0], hc[1] - FH * 0.09, W * 0.14, FH * 0.045, hatc);
      ctx.fillStyle = dark(hatc, 0.6);
      ctx.fillRect(hc[0] - W * 0.14, hc[1] - FH * 0.075, W * 0.28, FH * 0.012);
    } else if (hat === 'tricornio') {
      oval(ctx, hc[0], hc[1] - FH * 0.075, W * 0.15, FH * 0.05, hatc);
      poly(ctx, [[hc[0] - W * 0.26, hc[1] - FH * 0.05], [hc[0] - W * 0.1, hc[1] - FH * 0.13], [hc[0], hc[1] - FH * 0.07], [hc[0] + W * 0.12, hc[1] - FH * 0.13], [hc[0] + W * 0.26, hc[1] - FH * 0.05]], hatc);
      mark(ctx, hc[0], hc[1] - FH * 0.1, '▲', dark(hatc, 0.7));
    } else if (hat === 'boina') {
      oval(ctx, hc[0] - W * 0.03, hc[1] - FH * 0.065, W * 0.18, FH * 0.04, hatc);
      oval(ctx, hc[0] + W * 0.05, hc[1] - FH * 0.1, W * 0.03, FH * 0.02, L.gem || '#e8d8a0');
    } else if (hat === 'pontudo') {
      oval(ctx, hc[0], hc[1] - FH * 0.06, W * 0.26, FH * 0.02, hatc);
      poly(ctx, [[hc[0] - W * 0.15, hc[1] - FH * 0.06], [hc[0] - W * 0.12, hc[1] - FH * 0.3], [hc[0] + W * 0.14, hc[1] - FH * 0.06]], hatc);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(hc[0] - W * 0.06, hc[1] - FH * 0.15, W * 0.05, FH * 0.025);
      mark(ctx, hc[0] - W * 0.05, hc[1] - FH * 0.16, '*', '#ffe07a');
    } else if (hat === 'elmo' || hat === 'elmoNobre') {
      ctx.fillStyle = '#c8ccd6';
      ctx.beginPath();
      ctx.ellipse(hc[0], hc[1] - FH * 0.005, W * 0.16, FH * 0.09, 0, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.fillRect(hc[0] - W * 0.16, hc[1] - FH * 0.01, W * 0.32, FH * 0.02);
      // protetor de nariz
      ctx.fillRect(hc[0] + W * 0.09, hc[1] - FH * 0.01, W * 0.03, FH * 0.045);
      mark(ctx, hc[0], hc[1] - FH * 0.06, hat === 'elmoNobre' ? '♠' : '^', hat === 'elmoNobre' ? '#d83a3a' : '#e8ecf4');
      if (hat === 'elmoNobre') poly(ctx, [[hc[0] - W * 0.04, hc[1] - FH * 0.08], [hc[0] - W * 0.22, hc[1] - FH * 0.12], [hc[0] - W * 0.2, hc[1] - FH * 0.03]], '#c83a3a');
    } else if (hat === 'capacete') {
      // capacete de mineiro com lamparina
      ctx.fillStyle = hatc || '#b08a3a';
      ctx.beginPath();
      ctx.ellipse(hc[0], hc[1] - FH * 0.01, W * 0.16, FH * 0.08, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hc[0] - W * 0.18, hc[1] - FH * 0.015, W * 0.36, FH * 0.018);
      oval(ctx, hc[0] + W * 0.1, hc[1] - FH * 0.05, W * 0.045, FH * 0.022, '#ffe7a0');
      mark(ctx, hc[0] + W * 0.11, hc[1] - FH * 0.05, 'o', '#fff0b0');
    } else if (hat === 'lenco') {
      ctx.fillStyle = hatc;
      ctx.beginPath();
      ctx.ellipse(hc[0] - W * 0.01, hc[1] - FH * 0.025, W * 0.155, FH * 0.07, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      poly(ctx, [[hc[0] - W * 0.14, hc[1] - FH * 0.02], [hc[0] - W * 0.23, hc[1] + FH * 0.05], [hc[0] - W * 0.12, hc[1] + FH * 0.02]], hatc);
    } else if (hat === 'faixa') {
      ctx.fillStyle = hatc;
      ctx.fillRect(hc[0] - W * 0.15, hc[1] - FH * 0.045, W * 0.3, FH * 0.022);
    } else if (hat === 'coroa' || hat === 'diadema') {
      crown(ctx, hc[0] - W * 0.01, hc[1] - FH * 0.045, W * (hat === 'coroa' ? 0.26 : 0.2), FH * (hat === 'coroa' ? 0.07 : 0.035), '#ffd23f');
      mark(ctx, hc[0], hc[1] - FH * 0.1, hat === 'coroa' ? 'W' : '^', '#ffe07a');
    }
    // olho (e sobrancelha) — no capuz fundo o rosto está na sombra
    if (hat !== 'capuzFundo') {
      ctx.fillStyle = '#1a1210';
      ctx.fillRect(hc[0] + W * 0.07, hc[1] - FH * 0.012, W * 0.04, FH * 0.02);
      ctx.fillStyle = L.hair && !old ? dark(L.hair, 0.8) : old ? '#d8d8d0' : '#3a2a20';
      ctx.fillRect(hc[0] + W * 0.055, hc[1] - FH * 0.03, W * 0.07, FH * 0.008);
      // boca abre e fecha falando
      if (talking && Math.sin(t * Math.PI * 8) > 0) {
        ctx.fillStyle = '#5a2020';
        ctx.fillRect(hc[0] + W * 0.08, hc[1] + FH * 0.04, W * 0.04, FH * 0.015);
      }
    }
  };

  // ---------- chefes ----------
  SPR.spiderQueen = (ctx, W, H, t, anim, e) => {
    SPR.spider(ctx, W, H, t, anim, e);
    crown(ctx, W * 0.42, H * 0.2, W * 0.12, H * 0.22);
    ctx.fillStyle = '#ff2a6a';
    for (const k of [0, 1, 2]) ctx.fillRect(W * (0.6 + k * 0.025), H * (0.38 - k * 0.03), W * 0.018, H * 0.07);
  };
  SPR.skeletonKing = (ctx, W, H, t, anim, e) => {
    const FH = H * 0.92, feet = H - 1, cx = W / 2, neck = [cx + FH * 0.02, feet - FH * 0.77];
    // manto roxo atrás
    const sway = Math.sin(t * 2) * W * 0.03;
    poly(ctx, [[neck[0] - W * 0.16, neck[1]], [neck[0] + W * 0.1, neck[1]], [cx - W * 0.05 + sway, feet - FH * 0.05], [cx - W * 0.4 + sway, feet - FH * 0.02]], '#5a2a7a');
    SPR.skeleton2(ctx, W, H, t, anim, e);
    crown(ctx, neck[0] + W * 0.04, neck[1] - FH * 0.15, W * 0.3, FH * 0.08);
    ctx.fillStyle = '#b48ae8';
    ctx.fillRect(neck[0] - W * 0.14, neck[1] + FH * 0.02, W * 0.3, FH * 0.025);
  };
  SPR.golem = (ctx, W, H, t, anim, e) => {
    const atk = anim === 'ataque' && e && e.animT < 0.6;
    const walk = e && Math.abs(e.vx) > 1, ph = t * 4;
    const cx = W / 2, feet = H - 1, FH = H * 0.95;
    const rock = '#6a86a8', light = '#a8d0f0', dark = '#3a4a62';
    // pernas curtas
    for (const s of [-1, 1]) {
      const dx = walk ? Math.sin(ph) * W * 0.04 * s : 0;
      poly(ctx, [[cx + s * W * 0.08 - W * 0.07 + dx, feet - FH * 0.3], [cx + s * W * 0.08 + W * 0.07 + dx, feet - FH * 0.3], [cx + s * W * 0.1 + W * 0.08 + dx, feet], [cx + s * W * 0.1 - W * 0.08 + dx, feet]], s < 0 ? dark : rock);
    }
    // tronco
    const ty = feet - FH * 0.3, top = feet - FH * 0.82;
    const g = ctx.createLinearGradient(cx - W * 0.3, 0, cx + W * 0.3, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.6, rock);
    g.addColorStop(1, light);
    poly(ctx, [[cx - W * 0.22, ty], [cx - W * 0.28, top + FH * 0.12], [cx - W * 0.12, top], [cx + W * 0.16, top], [cx + W * 0.3, top + FH * 0.14], [cx + W * 0.22, ty]], g);
    // núcleo de gelo brilhando
    oval(ctx, cx + W * 0.02, top + FH * 0.24, W * 0.07, FH * 0.07, '#dff6ff');
    oval(ctx, cx + W * 0.02, top + FH * 0.24, W * 0.04, FH * 0.04, '#5fd8ff');
    // cristais nos ombros
    for (const [x, h] of [[-0.2, 0.14], [-0.12, 0.2], [0.18, 0.16], [0.25, 0.1]]) poly(ctx, [[cx + W * (x - 0.03), top + FH * 0.04], [cx + W * x, top - FH * h], [cx + W * (x + 0.03), top + FH * 0.04]], '#bfefff');
    // cabeça pequena
    oval(ctx, cx + W * 0.05, top + FH * 0.02, W * 0.09, FH * 0.07, rock);
    ctx.fillStyle = '#7fe8ff';
    ctx.fillRect(cx + W * 0.07, top + FH * 0.005, W * 0.05, FH * 0.025);
    // braços enormes
    for (const s of [-1, 1]) {
      const sh = [cx + s * W * 0.24, top + FH * 0.12];
      const up = atk ? -2.6 : walk ? Math.sin(ph + (s > 0 ? 0 : 3)) * 0.3 : 0.1 * s;
      const el = joint(sh[0], sh[1], FH * 0.24, up);
      const fist = joint(el[0], el[1], FH * 0.22, up * 0.8);
      limb(ctx, [sh, el, fist], W * 0.13, s < 0 ? dark : rock);
      oval(ctx, fist[0], fist[1], W * 0.1, FH * 0.07, s < 0 ? dark : light);
    }
  };
  SPR.slimeKing = (ctx, W, H, t, anim, e) => {
    SPR.slime(ctx, W, H, t, anim, e);
    const sq = e && !e.onGround ? 0.1 : Math.sin(t * 5) * 0.04;
    crown(ctx, W * 0.5, H * (0.3 + sq), W * 0.26, H * 0.24);
  };

  E.entityFrame = (e) => {
    const def = e.def;
    const sw = def.sw || def.w, sh = def.sh || def.h;
    const key = (def.tint ? def.tint.join(',') : '') + e.prefab + '|' + (def.image ? def.image.src.length : def.sprite) + '|' + e.anim + '|' + Math.floor(e.t * 10) % 40 + '|' + e.facing + '|' + (e.onGround ? 1 : 0) + '|' + sw + 'x' + sh + '|' + (def._v || 0);
    let c = cache.get(key);
    if (c) return c;
    const px = 8;
    const cv = document.createElement('canvas');
    cv.width = sw * px;
    cv.height = Math.round(sh * px * E.aspect);
    const ctx = cv.getContext('2d');
    if (e.facing < 0) {
      ctx.translate(cv.width, 0);
      ctx.scale(-1, 1);
    }
    const tq = Math.floor(e.t * 10) / 10;
    if (def.image && def.image.src) drawImageFrame(ctx, cv.width, cv.height, def.image, def, e.anim, tq);
    else (SPR[def.sprite] || SPR.slime)(ctx, cv.width, cv.height, tq, e.anim, e);
    c = E.canvasToCells(cv, sw, sh);
    applyMarks(c, cv, e.facing < 0);
    if (def.tint) for (const cell of c.cells) if (cell) for (let k = 0; k < 3; k++) cell[k] = Math.min(255, cell[k] * def.tint[k]);
    if (cache.size > 3000) cache.clear();
    cache.set(key, c);
    return c;
  };
  E.clearSpriteCache = () => cache.clear();
  E.previewPrefab = (def, canvas, anim = 'idle', t = 0) => {
    const fake = { def, prefab: '__preview', anim, t, facing: 1, onGround: true, vx: 3 };
    def._v = (def._v || 0) + 1;
    const fr = E.entityFrame(fake);
    return fr;
  };
})();

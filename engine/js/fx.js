'use strict';
// Efeitos de partículas reutilizáveis (itens, scripts, combate). Partícula = glifo com cor, física simples e luz opcional.
(function () {
  const E = window.ENG;
  const R = Math.random;
  const push = (o) => E.Game.parts.push(Object.assign({ life: 1, max: 1, g: 0, em: 1, drag: 1 }, o));
  const ring = (x, y, n, sp, base) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.3, s = sp * (0.4 + R() * 0.8);
      push(Object.assign({ x, y, vx: Math.cos(a) * s, vy: (Math.sin(a) * s) / 2 }, base(i)));
    }
  };

  E.FX = {
    list: {
      explosao: (x, y, k = 1) => {
        ring(x, y, 40 * k, 50 * k, (i) => ({ life: 0.4 + R() * 0.6, max: 1, ch: '*#%@+'[i % 5], c: [1, 0.45 + R() * 0.4, 0.1], drag: 0.05, g: 15, light: i === 0 ? 40 * k : 0 }));
        ring(x, y, 20, 12, () => ({ life: 1 + R(), max: 2, ch: 'o', c: [0.35, 0.33, 0.35], em: 0, drag: 0.3, g: -6 }));
        E.Game.shake(6 * k);
      },
      cura: (x, y) => {
        for (let i = 0; i < 18; i++) push({ x: x + (R() - 0.5) * 8, y: y - R() * 6, vx: (R() - 0.5) * 3, vy: -6 - R() * 8, life: 0.8 + R() * 0.6, max: 1.4, ch: '+', c: [0.4, 1, 0.5], drag: 0.5, light: i === 0 ? 18 : 0 });
      },
      fogo: (x, y) => {
        for (let i = 0; i < 8; i++) push({ x: x + (R() - 0.5) * 3, y: y - R() * 2, vx: (R() - 0.5) * 6, vy: -8 - R() * 10, life: 0.4 + R() * 0.4, max: 0.8, ch: "^*'"[i % 3], c: [1, 0.4 + R() * 0.4, 0.1], drag: 0.4, wob: 1, light: i === 0 ? 12 : 0 });
      },
      magia: (x, y) => {
        E.Audio.at('magia', x, y, { gap: 0.1 });
        ring(x, y, 24, 22, (i) => ({ life: 0.6 + R() * 0.4, max: 1, ch: '*·+'[i % 3], c: [0.7, 0.45, 1], drag: 0.1, light: i === 0 ? 22 : 0 }));
      },
      faisca: (x, y) => {
        ring(x, y, 10, 35, (i) => ({ life: 0.2 + R() * 0.3, max: 0.5, ch: '*+.'[i % 3], c: [1, 0.85, 0.5], drag: 0.05, g: 30, light: i === 0 ? 10 : 0 }));
      },
      poeira: (x, y, n = 6) => {
        for (let i = 0; i < n; i++) push({ x: x + (R() - 0.5) * 4, y: y - 0.5, vx: (R() - 0.5) * 22, vy: -R() * 10, g: 30, life: 0.5 + R() * 0.4, max: 0.9, ch: R() < 0.5 ? '.' : ',', c: [0.55, 0.45, 0.35], em: 0, drag: 0.1 });
      },
      sangue: (x, y) => {
        ring(x, y, 14, 25, (i) => ({ life: 0.5 + R() * 0.5, max: 1, ch: ".,'"[i % 3], c: [0.75, 0.08, 0.1], em: 0.3, drag: 0.2, g: 60 }));
      },
      gosma: (x, y) => {
        ring(x, y, 16, 25, (i) => ({ life: 0.5 + R() * 0.5, max: 1, ch: 'o.,'[i % 3], c: [0.4, 0.9, 0.35], em: 0.4, drag: 0.2, g: 60 }));
      },
      fumaca: (x, y) => {
        for (let i = 0; i < 10; i++) push({ x: x + (R() - 0.5) * 6, y, vx: (R() - 0.5) * 4, vy: -4 - R() * 4, life: 1.5 + R(), max: 2.5, ch: 'oO.'[i % 3], c: [0.4, 0.4, 0.45], em: 0, drag: 0.6, wob: 1 });
      },
      raio: (x, y) => {
        let cx = x;
        for (let yy = y - 60; yy < y; yy += 1) {
          cx += (R() - 0.5) * 3;
          push({ x: cx, y: yy, vx: 0, vy: 0, life: 0.25, max: 0.3, ch: R() < 0.5 ? '/' : '\\', c: [0.8, 0.9, 1], light: yy === y - 1 ? 60 : 0 });
        }
        E.Game.shake(8);
        E.Game.flash = 0.25;
      },
      // faíscas que saem na direção do golpe
      impacto: (x, y, ang = 0, col = [1, 0.9, 0.6]) => {
        const asp = E.Renderer.cw / E.Renderer.ch;
        for (let i = 0; i < 14; i++) {
          const a = ang + (Math.random() - 0.5) * 1.3, s = 25 + Math.random() * 45;
          const vx = Math.cos(a) * s, vy = Math.sin(a) * s * asp;
          let t = ((Math.atan2(vy / asp, vx) % Math.PI) + Math.PI) % Math.PI;
          push({ x, y, vx, vy, life: 0.15 + Math.random() * 0.25, max: 0.4, ch: i < 4 ? '*' : t < 0.39 || t > 2.75 ? '-' : t < 1.18 ? '\\' : t < 1.96 ? '|' : '/', c: i % 3 ? col : [1, 1, 0.85], drag: 0.03, g: 20, light: i === 0 ? 16 : 0 });
        }
      },
      moedas: (x, y) => {
        ring(x, y, 8, 20, () => ({ life: 0.6, max: 0.8, ch: 'o', c: [1, 0.85, 0.3], drag: 0.2, g: 40 }));
      },
      // arco de golpe centrado no ângulo de tela `ang` (radianos, y para baixo)
      // o: { layers (faixas da lua crescente), spread (abertura), elem ('fogo' | 'gelo' | 'luz' | 'veneno'; sem = aço) }
      corte: (x, y, ang = 0, size = 1, col = [0.75, 0.9, 1], reverse = false, o = {}) => {
        const asp = E.Renderer.cw / E.Renderer.ch, sp = o.spread || 1.3, pal = E.FX.pal(o.elem, col);
        const layers = o.layers || 2, rad0 = 10 * size, GL = ['▓', '▒', '░', '░'];
        for (let L = 0; L < layers; L++) {
          // lua crescente de blocos: fio cheio por fora, camadas mais ralas e escuras por dentro; afina nas pontas
          const rad = rad0 - L * 0.9, n = Math.ceil((2 * sp * rad) / 0.55), c = pal[Math.min(L, 2)], cut = L * 0.09;
          for (let k = 0; k < n; k++) {
            const t = k / (n - 1);
            if (t < cut || t > 1 - cut * 0.5) continue;
            const a = ang + (reverse ? sp - 2 * sp * t : -sp + 2 * sp * t);
            // a ponta final do arco vive mais: o rastro "corre" na direção do golpe
            push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad * asp, vx: Math.cos(ang) * 22, vy: Math.sin(ang) * 22 * asp, life: 0.06 + t * 0.17 - L * 0.015, max: 0.23, ch: t > 0.92 && !L ? '█' : GL[L], c, drag: 0.02, hot: L < 2, light: L === 0 && k % 9 === 4 ? 16 * size : 0 });
            if (L || R() > 0.3) continue;
            const ex = x + Math.cos(a) * rad, ey = y + Math.sin(a) * rad * asp;
            if (o.elem === 'fogo') push({ x: ex, y: ey, vx: (R() - 0.5) * 8 + Math.cos(ang) * 10, vy: -10 - R() * 14, life: 0.35 + R() * 0.4, max: 0.75, ch: "^*'"[k % 3], c: [1, 0.3 + R() * 0.5, 0.05], drag: 0.3, wob: 1, hot: 1 });
            else if (o.elem === 'gelo') push({ x: ex, y: ey, vx: (R() - 0.5) * 6, vy: 2 + R() * 6, g: 14, life: 0.45 + R() * 0.4, max: 0.85, ch: '·*◇'[k % 3], c: [0.55, 0.9, 1], drag: 0.2, hot: 1 });
            else if (o.elem === 'luz') push({ x: ex, y: ey, vx: (R() - 0.5) * 4, vy: -3 - R() * 4, life: 0.35 + R() * 0.3, max: 0.65, ch: '+', c: [1, 0.85, 0.3], drag: 0.3, hot: 1 });
            else if (o.elem === 'veneno') push({ x: ex, y: ey, vx: (R() - 0.5) * 4, vy: 0, g: 40, life: 0.35 + R() * 0.3, max: 0.65, ch: '.,o'[k % 3], c: [0.35, 1, 0.25], drag: 0.3, hot: 1 });
          }
        }
      },
      // impacto universal do golpe: clarão, rasgo cruzando o alvo, raios em estrela, faíscas e anel de choque
      golpe: (x, y, ang = 0, col = [1, 0.9, 0.6], power = 1, elem) => {
        const asp = E.Renderer.cw / E.Renderer.ch, pal = E.FX.pal(elem, col);
        push({ x, y, vx: 0, vy: 0, life: 0.1, max: 0.1, ch: '@', c: [1, 1, 1], light: 34 * power, hot: 1 });
        push({ x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, ch: '*', c: pal[0], hot: 1 });
        // rasgo: traço longo e fino atravessando o alvo, perpendicular ao golpe (corte de anime)
        const tA = ang + Math.PI / 2 + (R() - 0.5) * 0.5, tg = ((tA % Math.PI) + Math.PI) % Math.PI;
        const tch = tg < 0.39 || tg > 2.75 ? '-' : tg < 1.18 ? '\\' : tg < 1.96 ? '|' : '/', len = 7 * power;
        for (let j = -len; j <= len; j += 0.7) {
          const f = 1 - Math.abs(j) / len;
          push({ x: x + Math.cos(tA) * j, y: y + Math.sin(tA) * j * asp, vx: Math.cos(ang) * 6, vy: Math.sin(ang) * 6 * asp, life: 0.05 + 0.13 * f, max: 0.18, ch: f > 0.6 ? (tch === '-' ? '=' : tch) : tch, c: f > 0.5 ? [1, 1, 1] : pal[1], drag: 0.01, hot: 1 });
        }
        // estrela de 8 raios que cresce e some
        const rays = [[1, 0, '-'], [-1, 0, '-'], [0, 1, '|'], [0, -1, '|'], [1, 1, '\\'], [-1, -1, '\\'], [1, -1, '/'], [-1, 1, '/']];
        for (const [dx, dy, ch] of rays) {
          const s = (dx && dy ? 34 : 46) * power;
          for (let j = 0; j < 2; j++) push({ x: x + dx * (1 + j), y: y + dy * (1 + j) * asp * 0.5, vx: dx * s, vy: dy * s * asp * 0.5, life: 0.11 + j * 0.03, max: 0.15, ch, c: pal[j], drag: 0.001, hot: 1 });
        }
        E.FX.list.impacto(x, y, ang, pal[1]);
        // anel de choque: pontos que se afastam em círculo
        ring(x, y, Math.round(14 * power), 42 * power, () => ({ life: 0.16 + R() * 0.1, max: 0.26, ch: '·', c: pal[2], drag: 0.002, hot: 1 }));
      },
      // explosão de chamas no alvo (golpe de arma de fogo)
      chama: (x, y, ang = 0) => {
        const asp = E.Renderer.cw / E.Renderer.ch;
        for (let i = 0; i < 22; i++) {
          const a = ang + (R() - 0.5) * 2.4, s = 15 + R() * 35;
          push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * asp - 12, life: 0.3 + R() * 0.5, max: 0.8, ch: '^*#%\''[i % 5], c: [1, 0.3 + R() * 0.6, 0.05 + R() * 0.15], drag: 0.08, g: -18, wob: 1, light: i === 0 ? 28 : 0, hot: 1 });
        }
        for (let i = 0; i < 6; i++) push({ x: x + (R() - 0.5) * 4, y: y - R() * 2, vx: (R() - 0.5) * 3, vy: -5 - R() * 4, life: 0.8 + R() * 0.6, max: 1.4, ch: 'o.', c: [0.32, 0.28, 0.27], em: 0, drag: 0.5, wob: 1 });
      },
      // estilhaços de gelo: cristais que caem, névoa fria e um brilho azul
      gelo: (x, y, ang = 0) => {
        E.Audio.at('gelo', x, y, { gap: 0.08 });
        const asp = E.Renderer.cw / E.Renderer.ch;
        for (let i = 0; i < 18; i++) {
          const a = ang + (R() - 0.5) * 3, s = 20 + R() * 40;
          push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * asp - 10, g: 70, life: 0.4 + R() * 0.5, max: 0.9, ch: '◆*◇'[i % 3], c: i % 2 ? [0.75, 0.95, 1] : [0.4, 0.75, 1], drag: 0.1, light: i === 0 ? 24 : 0, hot: 1 });
        }
        ring(x, y, 14, 10, () => ({ life: 0.8 + R() * 0.6, max: 1.4, ch: '°·'[(R() * 2) | 0], c: [0.8, 0.95, 1], em: 0.5, drag: 0.4, g: 4 }));
      },
      // cruz dourada de luz (lâminas sagradas / do cavaleiro)
      luz: (x, y) => {
        const asp = E.Renderer.cw / E.Renderer.ch;
        for (let j = 1; j <= 5; j++) {
          const life = 0.22 - j * 0.025, c = [1, 0.95 - j * 0.04, 0.6 - j * 0.06];
          for (const s of [-1, 1]) {
            push({ x: x + s * j * 1.6, y, vx: s * 20, vy: 0, life, max: 0.22, ch: '-', c, drag: 0.01, hot: 1 });
            push({ x, y: y + s * j * 0.8 * asp, vx: 0, vy: s * 10 * asp, life, max: 0.22, ch: '|', c, drag: 0.01, hot: 1 });
          }
        }
        push({ x, y, vx: 0, vy: 0, life: 0.2, max: 0.2, ch: '+', c: [1, 1, 0.85], light: 26, hot: 1 });
        ring(x, y, 10, 22, () => ({ life: 0.4 + R() * 0.3, max: 0.7, ch: '+·'[(R() * 2) | 0], c: [1, 0.85, 0.4], drag: 0.15, g: -6 }));
      },
      // respingos venenosos que pingam
      veneno: (x, y, ang = 0) => {
        const asp = E.Renderer.cw / E.Renderer.ch;
        for (let i = 0; i < 12; i++) {
          const a = ang + (R() - 0.5) * 2, s = 15 + R() * 25;
          push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * asp - 8, g: 70, life: 0.4 + R() * 0.4, max: 0.8, ch: 'o.,'[i % 3], c: [0.4 + R() * 0.2, 1, 0.3], em: 0.6, drag: 0.15, light: i === 0 ? 10 : 0, hot: 1 });
        }
        for (let i = 0; i < 4; i++) push({ x: x + (R() - 0.5) * 4, y, vx: (R() - 0.5) * 2, vy: -3 - R() * 3, life: 0.9, max: 0.9, ch: 'o', c: [0.35, 0.8, 0.3], em: 0.3, drag: 0.5, wob: 1 });
      },
      // onda de choque no chão (armas pesadas)
      tremor: (x, y, power = 1) => {
        for (const s of [-1, 1])
          for (let i = 0; i < 8 * power; i++) push({ x: x + s * i * 0.8, y: y - 0.3, vx: s * (25 + R() * 25), vy: -R() * 18, g: 60, life: 0.25 + R() * 0.35, max: 0.6, ch: '_.,~'[i % 4], c: [0.6, 0.52, 0.42], em: 0, drag: 0.1 });
        E.FX.list.poeira(x, y, 10);
      },
    },
    // paleta de 3 tons (fio, meio, fundo) por elemento; sem elemento usa a cor da arma, saturada
    PALS: {
      aco: [[1, 1, 1], [0.8, 0.85, 0.95], [0.52, 0.58, 0.7]],
      fogo: [[1, 0.82, 0.3], [1, 0.55, 0.08], [0.9, 0.18, 0.04]],
      gelo: [[0.55, 0.95, 1], [0.35, 0.85, 1], [0.15, 0.4, 1]],
      luz: [[1, 0.95, 0.5], [1, 0.82, 0.25], [1, 0.5, 0.05]],
      veneno: [[0.65, 1, 0.4], [0.35, 1, 0.25], [0.1, 0.65, 0.3]],
    },
    pal(elem, col = [0.75, 0.9, 1]) {
      if (this.PALS[elem]) return this.PALS[elem];
      const l = (col[0] + col[1] + col[2]) / 3, sat = col.map((v) => Math.max(0, Math.min(1, l + (v - l) * 2.2)));
      return [sat.map((v) => v * 0.6 + 0.4), sat, sat.map((v) => v * 0.6)];
    },
    spawn(name, x, y, ...args) {
      const f = this.list[name];
      if (f) f(x, y, ...args);
    },
    names() {
      return Object.keys(this.list);
    },
  };
})();

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
      corte: (x, y, ang = 0, size = 1, col = [0.75, 0.9, 1], reverse = false) => {
        const n = Math.round(18 * size), R = 7.5 * size, asp = E.Renderer.cw / E.Renderer.ch;
        for (let k = 0; k < n; k++) {
          const t = k / (n - 1), a = ang + (reverse ? 1.3 - 2.6 * t : -1.3 + 2.6 * t);
          let tg = (((a + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI;
          const ch = tg < 0.39 || tg > 2.75 ? '-' : tg < 1.18 ? '\\' : tg < 1.96 ? '|' : '/';
          push({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * R * asp, vx: Math.cos(ang) * 16, vy: Math.sin(ang) * 16 * asp, life: 0.1 + t * 0.09, max: 0.22, ch, c: col, drag: 0.02, light: k === n >> 1 ? 16 * size : 0 });
        }
      },
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

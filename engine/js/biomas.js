'use strict';
// Decoração dos biomas, do subsolo, das ruínas e das masmorras com os objetos ASCII de arquitetura.js.
// Só enfeita o que a geração do mundo já criou: não muda relevo, cavernas nem colisão.
(function () {
  const E = window.ENG;
  const D = (E.Deco = {});

  // objeto cabe numa área aberta: chão sólido embaixo de cada coluna, nada sólido, sem água e (opcional) fundo livre
  const fitsAir = (w, name, x, gy, backFree) => {
    const { w: pw, h } = E.propSize(name);
    for (let xx = x; xx < x + pw; xx++) {
      if (!w.solid(xx, gy)) return false;
      for (let y = gy - h; y < gy; y++) {
        const m = w.get('main', xx, y);
        if (w.solid(xx, y) || m === E.MAT.WATER || m === E.MAT.LAVA) return false;
        if (backFree && w.get('back', xx, y)) return false;
      }
    }
    return true;
  };
  // pendurado no teto: o espaço abaixo precisa estar livre
  const fitsHang = (w, name, x, y) => {
    const { w: pw, h } = E.propSize(name);
    for (let xx = x; xx < x + pw; xx++) {
      if (!w.solid(xx, y - 1)) return false;
      for (let yy = y; yy < y + h + 3; yy++) if (w.solid(xx, yy) || w.get('main', xx, yy) === E.MAT.WATER) return false;
    }
    return true;
  };
  D.fitsAir = fitsAir;

  // escolhe por peso: lista de [nome, peso]
  const choose = (list, r) => {
    let t = list.reduce((s, [, p]) => s + p, 0) * r;
    for (const [n, p] of list) if ((t -= p) <= 0) return n;
    return list[list.length - 1][0];
  };

  // ---------- superfície ----------
  // o: { ground, mix(x) -> {a, b, t} (biomas da coluna), skip(x), rnd }
  const SURF = {
    floresta: [['troncoCaido', 2], ['toco', 3], ['pedraMusgo', 3], ['cogumelos', 3], ['flores', 5], ['folhas', 4], ['planta', 3]],
    floresta_grande: [['troncoCaido', 3], ['toco', 3], ['pedraMusgo', 3], ['cogumelos', 3], ['cogumelosBrilho', 1], ['folhas', 5], ['planta', 2]],
    castelo: [['toco', 2], ['pedraMusgo', 4], ['colunaQuebrada', 2], ['folhas', 3], ['cranio', 1]],
    deserto: [['cactoAlto', 3], ['cactoBarril', 3], ['cactoPalma', 2], ['arbustoSeco', 4], ['capimSeco', 3], ['pedraVento', 2], ['cranio', 1], ['ossos', 1.5], ['colunaQuebrada', 0.6], ['estatua', 0.3]],
    praia: [['pedra', 2], ['capimSeco', 3], ['ossos', 0.5]],
    neve: [['arvoreSeca', 3], ['pedraNeve', 4], ['cristais', 1], ['toco', 1]],
  };
  const DENS = { floresta: 0.1, floresta_grande: 0.12, castelo: 0.08, deserto: 0.09, praia: 0.04, neve: 0.08 };
  // deserto: alguns objetos ficam meio enterrados na areia
  const BURY = { colunaQuebrada: 2, cranio: 1, estatua: 3 };
  D.surface = (w, o) => {
    const { ground, mix, skip, rnd } = o;
    for (let x = 8; x < w.W - 30; ) {
      if (skip(x)) {
        x += 6;
        continue;
      }
      const m = mix(x), b = m.t > 0.5 ? m.b : m.a, list = SURF[b];
      if (!list || rnd() > DENS[b]) {
        x += 3;
        continue;
      }
      const name = choose(list, rnd()), gy = ground[x];
      const bury = b === 'deserto' ? BURY[name] || 0 : 0;
      const sz = E.propSize(name);
      if (!fitsAir(w, name, x, gy, true) || skip(x + sz.w)) {
        x += 2;
        continue;
      }
      E.prop(w, name, x, gy + bury, { keep: true });
      if (name === 'cristais') w.lights.push(Object.assign({ x: x + 3, y: gy - 2, type: 'cristal' }, E.LIGHTS.cristal, { r: 14, i: 0.5 }));
      if (name === 'cogumelosBrilho') w.lights.push({ x: x + 3, y: gy - 2, type: 'cogumelo', c: [0.75, 0.55, 1], r: 12, i: 0.5, flicker: 0.05, pulse: true });
      x += sz.w + 4 + Math.floor(rnd() * 14);
    }
  };

  // ---------- subsolo do mundo: estalactites, estalagmites, raízes, cristais e veios de minério ----------
  // o: { ground, HU, mix, skip, rnd }
  const ORES = [[178, 120, 96], [196, 116, 62], [224, 186, 86], [150, 170, 196]];
  D.underground = (w, o) => {
    const { ground, HU, mix, skip, rnd } = o;
    for (let x = 6; x < w.W - 12; x += 4) {
      if (skip(x)) continue;
      const m = mix(x), b = m.t > 0.5 ? m.b : m.a;
      const cold = b === 'neve' || b === 'oceano_gelado', dry = b === 'deserto';
      for (let y = ground[x] + 10; y < HU - 3; y++) {
        const air = !w.solid(x, y);
        if (!air) continue;
        const depth = y - ground[x];
        // teto
        if (w.solid(x, y - 1) && rnd() < 0.07) {
          const name = depth < 34 && !dry && !cold && rnd() < 0.5 ? 'raizes' : cold ? 'pingente' : 'estalactite';
          if (fitsHang(w, name, x, y)) E.propHang(w, name, x, y);
        }
        // chão
        if (w.solid(x, y + 1) && rnd() < 0.06) {
          const r = rnd();
          const name = r < 0.45 ? 'estalagmite' : r < 0.6 ? (cold ? 'cristais' : dry ? 'cranio' : 'cogumelosBrilho') : r < 0.72 ? 'ossos' : r < 0.82 ? 'cristaisRoxo' : 'pedra';
          if (fitsAir(w, name, x, y + 1, false)) {
            E.prop(w, name, x, y + 1);
            if (name === 'cristais' || name === 'cristaisRoxo') w.lights.push(Object.assign({ x: x + 3, y: y - 1, type: 'cristal' }, E.LIGHTS.cristal, { r: 16, i: 0.6 }, name === 'cristaisRoxo' ? { c: [0.75, 0.5, 1] } : {}));
            if (name === 'cogumelosBrilho') w.lights.push({ x: x + 3, y: y - 1, type: 'cogumelo', c: [0.75, 0.55, 1], r: 12, i: 0.55, flicker: 0.05, pulse: true });
          }
        }
      }
    }
    // veios de minério: só a cor da pedra muda (mesmo material, nada muda na mineração)
    for (let k = 0; k < w.W / 18; k++) {
      const x = 10 + Math.floor(rnd() * (w.W - 20));
      if (skip(x)) continue;
      const y = ground[x] + 16 + Math.floor(rnd() * Math.max(1, HU - ground[x] - 20));
      const col = ORES[Math.floor(rnd() * ORES.length)], len = 4 + Math.floor(rnd() * 8);
      let vx = x, vy = y;
      for (let s = 0; s < len; s++) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]])
          if (w.get('main', vx + dx, vy + dy) === E.MAT.STONE) w.set('main', vx + dx, vy + dy, E.MAT.STONE, col.map((v) => v * (0.85 + E.hash2(vx + dx, vy + dy) * 0.3)));
        vx += rnd() < 0.5 ? 1 : 2;
        vy += Math.round((rnd() - 0.5) * 2);
      }
    }
  };

  // ---------- desgaste de ruínas: rachaduras, inscrições, entulho, vigas expostas e colunas quebradas ----------
  const STONY = () => [E.MAT.MASONRY, E.MAT.MOSS, E.MAT.COBBLE, E.MAT.SANDSTONE];
  D.ruinWear = (w, x0, x1, top, gy, rnd, o = {}) => {
    const stony = STONY();
    const isWall = (x, y) => stony.includes(w.get('back', x, y));
    // rachaduras: caminhos tortos de / \ | escuros sobre a alvenaria do fundo
    for (let k = 0; k < Math.max(2, (x1 - x0) / 14); k++) {
      let x = x0 + Math.floor(rnd() * (x1 - x0)), y = top + Math.floor(rnd() * (gy - top) * 0.6);
      for (let s = 0; s < 6 + rnd() * 10 && y < gy; s++) {
        const d = Math.floor(rnd() * 3) - 1;
        if (isWall(x, y)) E.stampArt(w, x, y, [d < 0 ? '/' : d > 0 ? '\\' : '|'], ['K'], { vary: 0.2 });
        x -= d;
        y++;
      }
    }
    // inscrições antigas e gastas
    if (o.runes !== false)
      for (let k = 0; k < 2; k++) {
        const x = x0 + 6 + Math.floor(rnd() * Math.max(1, x1 - x0 - 20)), y = top + 6 + Math.floor(rnd() * Math.max(1, (gy - top) * 0.4));
        const t = 'ʟΛШ≡♦ΛʟШ'.slice(0, 4 + Math.floor(rnd() * 4));
        if ([...t].every((_, i) => isWall(x + i * 2, y))) E.stampArt(w, x, y, [[...t].join(' ')], ['G'.repeat(t.length * 2)], { vary: 0.3 });
      }
    // entulho e colunas quebradas no chão
    for (let k = 0; k < Math.max(2, (x1 - x0) / 25); k++) {
      const x = x0 + 4 + Math.floor(rnd() * Math.max(1, x1 - x0 - 12));
      const name = choose([['pedra', 3], ['colunaQuebrada', 2], ['pedraMusgo', 2], ['cranio', o.bones ? 1 : 0.1]], rnd());
      if (fitsAir(w, name, x, gy, false)) E.prop(w, name, x, gy, { layer: 'back' });
    }
    // vigas apodrecidas saindo do alto das paredes
    for (let k = 0; k < 3; k++) {
      const x = x0 + Math.floor(rnd() * (x1 - x0));
      let y = top;
      while (y < gy && !w.get('back', x, y)) y++;
      if (y < gy - 6) E.stampArt(w, x - 2, y - 1, ['==/'], ['WWW'], { vary: 0.25 });
    }
  };

  // ---------- masmorras: objetos por tema nos pontos de chão livres ----------
  const CAVE = {
    areia: [['sarcofago', 3], ['lapide', 3], ['cranio', 3], ['ossos', 3], ['pilar', 2], ['estatua', 1], ['jarros', 2]],
    pedra: [['estalagmite', 4], ['ossos', 2], ['cranio', 1], ['pedra', 2], ['cristaisRoxo', 1], ['caixote', 1], ['barril', 1]],
    gelo: [['cristais', 4], ['pedraNeve', 3], ['estalagmite', 2], ['ossos', 1]],
    fungo: [['cogumelos', 3], ['cogumelosBrilho', 4], ['junco', 3], ['troncoCaido', 2], ['pedraMusgo', 2]],
  };
  D.cave = (w, theme, floors, rnd, maxX = Infinity) => {
    const list = CAVE[theme];
    if (!list) return;
    let lastX = -99;
    for (const f of floors) {
      if (f.x > maxX || f.x - lastX < 10 || rnd() > 0.16) continue;
      const name = choose(list, rnd());
      if (!fitsAir(w, name, f.x, f.y, false)) continue;
      E.prop(w, name, f.x, f.y);
      lastX = f.x;
      if (name === 'cristais' || name === 'cristaisRoxo' || name === 'cogumelosBrilho') w.lights.push(Object.assign({ x: f.x + 3, y: f.y - 3, type: 'cristal' }, E.LIGHTS.cristal, { r: 16, i: 0.6 }, theme === 'fungo' ? { c: [0.7, 0.55, 1] } : {}));
      // pântano subterrâneo: poças de lama ao redor dos juncos
      if (theme === 'fungo' && name === 'junco') for (let i = -3; i < 8; i++) if (w.solid(f.x + i, f.y) && !w.solid(f.x + i, f.y - 1)) w.set('main', f.x + i, f.y, E.MAT.MUD);
    }
    // tetos: estalactites, pingentes de gelo e raízes do pântano
    const hang = theme === 'gelo' ? 'pingente' : theme === 'fungo' ? 'raizes' : 'estalactite';
    for (const f of floors) {
      if (f.x > maxX || rnd() > 0.08) continue;
      let y = f.y - 2;
      while (y > 2 && !w.solid(f.x, y - 1)) y--;
      if (f.y - y > 14 && fitsHang(w, hang, f.x, y)) E.propHang(w, hang, f.x, y);
    }
  };
})();

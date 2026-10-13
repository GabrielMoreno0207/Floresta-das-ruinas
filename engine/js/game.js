'use strict';
// Loop do jogo: atualização, composição do buffer de células, luzes, câmera e troca de mapas.
(function () {
  const E = window.ENG;
  const R = () => E.Renderer;

  const G = (E.Game = {
    world: null,
    player: null,
    inv: null,
    parts: [],
    cam: { x: 0, y: 0 },
    keys: {},
    pressed: {},
    time: 0,
    dt: 0,
    fontSize: 6,
    name: 'Senje',
    paused: false,
    fps: 0,
    shakeAmt: 0,
    hitstop: 0,
    flash: 0,
    showColliders: false,
  });

  G.shake = (n) => E.Options.shake && (G.shakeAmt = Math.max(G.shakeAmt, n));

  G.hurtPlayer = (n, from, silent) => {
    const p = G.player;
    if (!n || p.invuln > 0 || (E.Editor && E.Editor.active)) return;
    if (E.Status.has(p, 'escudo')) return;
    const def = G.inv ? G.inv.defense() : 0;
    if (!silent && def && Math.random() < Math.min(0.7, def * 0.1)) {
      // armadura bloqueou o golpe
      p.invuln = 0.5;
      p.vx = Math.sign(p.x - (from ? from.x : p.x - p.facing) || 1) * 25;
      E.FX.spawn('faisca', p.x, p.y - p.h * 0.6);
      E.Audio.play('bloqueio');
      return;
    }
    p.hp -= n;
    p.invuln = silent ? 0.1 : 1.0;
    if (!silent) {
      p.hurtT = 0.4;
      p.vx = Math.sign(p.x - (from ? from.x : p.x - p.facing) || 1) * 42;
      p.vy = -32;
      p.attack = null;
      E.FX.spawn('sangue', p.x, p.y - p.h / 2);
      E.Audio.play('dano');
      G.shake(4);
      G.hitstop = 0.06;
    }
    E.UI.refresh();
    if (p.hp <= 0) G.killPlayer();
  };
  G.killPlayer = (msg) => {
    const p = G.player;
    E.FX.spawn('explosao', p.x, p.y - p.h / 2, 0.6);
    E.UI.message(msg || 'Você caiu... voltando ao último fogo.', 2.5);
    const s = G.world.spawn;
    G.player = E.Player.create(s.x, s.y);
    G.player.invuln = 1.5;
    E.UI.refresh();
  };
  G.throwItem = (id) => {
    const d = E.Project.items[id];
    const p = G.player;
    if (d.throw?.knife) {
      // faca: voa reta na direção do mouse
      const a = E.Player.aim(p), k = R().cw / R().ch;
      const f = E.Ents.projectile(Object.assign({}, p, { team: 'jogador', facing: Math.cos(a.ang) >= 0 ? 1 : -1 }), { dx: Math.cos(a.ang), dy: Math.sin(a.ang) * k, speed: 85, damage: d.throw.damage || 2, glyph: Math.abs(Math.cos(a.ang)) > 0.7 ? '-' : Math.cos(a.ang) * Math.sin(a.ang) > 0 ? '\\' : '/', color: d.color, life: 1.2 });
      f.g = 8;
      E.Audio.play('espada', { gap: 0.05 });
      return;
    }
    const pr = E.Ents.projectile(Object.assign({}, p, { team: 'jogador' }), { dx: p.facing * 0.8, dy: -0.55, speed: 50, damage: d.throw?.damage || 2, glyph: d.glyph, color: d.color, life: 1.4, explode: d.throw || { radius: 8, damage: 2 } });
    pr.g = 70;
  };

  // ---------- mapas ----------
  G.gotoMap = (id, x, y) => {
    if (!id || id === G.world.id) {
      const s = G.world.spawn;
      G.player.x = x ?? s.x;
      G.player.y = y ?? s.y;
      return;
    }
    const w = E.Project.worlds[id];
    if (!w) return E.UI.message('Mapa não encontrado: ' + id);
    G.enterWorld(w, x, y);
  };
  G.enterWorld = (world, x, y) => {
    G.world = world;
    E.Project.current = world.id;
    const s = world.spawn;
    const keep = G.player ? { hp: G.player.hp, status: G.player.status } : {};
    G.player = Object.assign(E.Player.create(x ?? s.x, y ?? s.y), keep);
    G.parts = [];
    E.Ents.load(world);
    G.cam.x = G.player.x - R().cols / 2;
    G.cam.y = G.player.y - R().rows * 0.64;
    E.applySky();
    E.Editor?.syncPanel?.();
    E.UI?.refresh?.();
  };
  E.applySky = () => {
    const s = G.world.settings;
    G.sky = E.SKIES[s.sky] || E.SKIES.Noite;
  };

  // ---------- partículas ambientes ----------
  function ambient(dt) {
    const W = G.world;
    for (const l of W.lights)
      if (l.embers && inView(l.x, l.y, 10) && Math.random() < dt * 6)
        G.parts.push({ x: l.x + (Math.random() - 0.5) * 3, y: l.y, vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 8, life: 1.2 + Math.random(), max: 2, g: 0, drag: 1, ch: Math.random() < 0.5 ? '.' : "'", c: [1, 0.55, 0.2], em: 1, wob: 1 });
    let flies = 0;
    for (const q of G.parts) if (q.fly) flies++;
    if (flies < 22 && Math.random() < dt * 8) {
      const x = G.cam.x + Math.random() * R().cols, y = G.cam.y + R().rows * (0.3 + Math.random() * 0.6);
      if (W.cellType(Math.floor(x), Math.floor(y)) === E.CT.NONE && W.skyAt(Math.floor(x), Math.floor(y)) > 100)
        G.parts.push({ x, y, vx: 0, vy: 0, life: 6 + Math.random() * 6, max: 12, g: 0, drag: 1, ch: '*', c: [0.8, 1, 0.45], em: 1, fly: true, seed: Math.random() * 100, light: Math.random() < 0.35 ? 8 : 0 });
    }
    for (const q of G.parts) {
      q.life -= dt;
      if (q.fly) {
        q.vx = Math.sin(G.time * 0.9 + q.seed) * 6;
        q.vy = Math.cos(G.time * 0.7 + q.seed * 1.3) * 2.5;
      }
      if (q.wob) q.vx += Math.sin(G.time * 5 + q.y) * dt * 10;
      q.vy += (q.g || 0) * dt;
      q.vx *= Math.pow(q.drag ?? 1, dt);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    G.parts = G.parts.filter((q) => q.life > 0);
    if (G.parts.length > 900) G.parts.splice(0, G.parts.length - 900);
  }
  const inView = (x, y, m = 0) => x > G.cam.x - m && x < G.cam.x + R().cols + m && y > G.cam.y - m && y < G.cam.y + R().rows + m;
  G.inView = inView;

  // ---------- composição ----------
  function compose() {
    const W = G.world, r = R();
    const cols = r.cols, rows = r.rows, alb = r.alb, aux = r.aux;
    const ccx = Math.floor(G.cam.x), ccy = Math.floor(G.cam.y);
    alb.fill(0);
    aux.fill(0);
    for (let o = 3; o < aux.length; o += 4) aux[o] = 255;
    const main = W.main, back = W.back, front = W.front, mc = W.mainCol, bc = W.backCol, fc = W.frontCol, colL = W.col;
    for (let y = 0; y < rows; y++) {
      const wy = ccy + y;
      if (wy < 0 || wy >= W.H) continue;
      for (let x = 0; x < cols; x++) {
        const wx = ccx + x;
        if (wx < 0 || wx >= W.W) continue;
        const i = wy * W.W + wx, o = (y * cols + x) * 4;
        aux[o + 3] = W.skyAt(wx, wy);
        const m = main[i];
        const solid = colL[i] ? colL[i] === 1 : m && E.MAT_BY_ID[m].solid;
        if (m) {
          alb[o] = mc[i * 3];
          alb[o + 1] = mc[i * 3 + 1];
          alb[o + 2] = mc[i * 3 + 2];
          alb[o + 3] = m;
          aux[o + 2] = solid ? 1 : 0;
        } else if (back[i]) {
          alb[o] = bc[i * 3] * 0.78;
          alb[o + 1] = bc[i * 3 + 1] * 0.78;
          alb[o + 2] = bc[i * 3 + 2] * 0.82;
          alb[o + 3] = back[i];
          aux[o + 2] = 2 | (solid ? 1 : 0);
        } else if (solid) aux[o + 2] = 1;
      }
    }
    const put = (wx, wy, rgb, glyph, em, mat = E.MAT.INK) => {
      const x = Math.floor(wx) - ccx, y = Math.floor(wy) - ccy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const o = (y * cols + x) * 4;
      alb[o] = Math.min(255, rgb[0]);
      alb[o + 1] = Math.min(255, rgb[1]);
      alb[o + 2] = Math.min(255, rgb[2]);
      alb[o + 3] = mat;
      aux[o] = glyph != null && glyph >= 0 ? glyph + 1 : 0;
      aux[o + 1] = em || 0;
      aux[o + 2] = 4;
      aux[o + 3] = W.skyAt(Math.floor(wx), Math.floor(wy));
    };
    G.put = put;
    const drawCells = (spr, x, y, o = {}) => {
      const x0 = Math.round(x - spr.w / 2), y0 = Math.round(y - spr.h);
      for (let j = 0; j < spr.h; j++)
        for (let i = 0; i < spr.w; i++) {
          const c = spr.cells[j * spr.w + i];
          if (!c) continue;
          let rgb = c;
          if (o.tint) rgb = [c[0] * (1 - o.k) + o.tint[0] * 255 * o.k, c[1] * (1 - o.k) + o.tint[1] * 255 * o.k, c[2] * (1 - o.k) + o.tint[2] * 255 * o.k];
          if (o.mul != null) rgb = [rgb[0] * o.mul, rgb[1] * o.mul, rgb[2] * o.mul];
          put(x0 + i, y0 + j, rgb, c[3], o.em || 0);
        }
    };
    const text = (s, x, y, rgb, em = 220) => {
      const ch = [...s];
      ch.forEach((c, k) => put(x - ch.length / 2 + k, y, rgb, E.glyphIndex(c), em));
    };
    // entidades
    for (const e of E.Ents.list) {
      if (!inView(e.x, e.y, 30)) continue;
      if (e.kind === 'item') {
        const d = E.Project.items[e.item];
        if (!d) continue;
        const bob = Math.round(Math.sin(e.t * 3) * 0.6);
        const ic = d.icon;
        if (ic) {
          const x0 = Math.round(e.x - ic.w / 2), y0 = Math.round(e.y - ic.h) + bob;
          for (let j = 0; j < ic.h; j++)
            for (let i = 0; i < ic.w; i++) {
              const c = ic.cells[j * ic.w + i];
              if (c) put(x0 + i, y0 + j, E.hexRgb(c[1]).map((v) => v * 255), E.glyphIndex(c[0]), 170);
            }
          if (e.qty > 1) put(x0 + ic.w, y0 + ic.h - 1, [230, 230, 230], E.glyphIndex(String(Math.min(9, e.qty))), 160);
        } else put(e.x, e.y - 1 + bob, d.color.map((v) => v * 255), E.glyphIndex(d.glyph), 230);
        continue;
      }
      if (e.kind === 'proj') {
        put(e.x, e.y, e.color.map((v) => v * 255), E.glyphIndex(e.glyph), 255);
        continue;
      }
      if (e.animT != null) {
        e.animT += G.dt;
        if (e.animRevert && e.animT > e.animRevert) {
          e.anim = 'idle';
          e.animRevert = 0;
        }
      }
      const fr = E.entityFrame(e);
      const burning = E.Status.has(e, 'queimando');
      drawCells(fr, e.x, e.y + 0.5, { tint: e.flash > 0 ? [1, 1, 1] : burning ? [1, 0.45, 0.15] : null, k: e.flash > 0 ? 0.8 : 0.35, em: e.def.emissive ? 255 : e.flash > 0 ? 200 : 0 });
      if (e === G.hover) {
        // contorno: células vazias encostadas na silhueta
        const col = e.team === 'inimigo' ? [255, 80, 70] : [255, 210, 63];
        const x0 = Math.round(e.x - fr.w / 2), y0 = Math.round(e.y + 0.5 - fr.h);
        const on = (i, j) => i >= 0 && j >= 0 && i < fr.w && j < fr.h && fr.cells[j * fr.w + i] && fr.cells[j * fr.w + i][3] !== 0;
        for (let j = -1; j <= fr.h; j++)
          for (let i = -1; i <= fr.w; i++) {
            if (on(i, j)) continue;
            const L = on(i - 1, j), R = on(i + 1, j), U = on(i, j - 1), D = on(i, j + 1);
            if (!(L || R || U || D)) continue;
            put(x0 + i, y0 + j, col, E.glyphIndex(L || R ? (U || D ? '+' : '|') : '-'), 255);
          }
      }
      if (e.maxHp && e.hp < e.maxHp && e.hp > 0) {
        const n = 8, f = Math.round((e.hp / e.maxHp) * n);
        for (let k = 0; k < n; k++) put(e.x - n / 2 + k, e.y - (e.def.sh || e.h) - 1, k < f ? [230, 60, 50] : [60, 30, 30], E.glyphIndex('▄'), 160);
      }

    }
    // rastro do dash
    const p = G.player;
    for (const g of p.ghosts) if (g.cells) drawCells(g.cells, g.x, g.y + 0.5, { tint: [0.4, 0.7, 1], k: 0.7, mul: g.life / 0.22, em: 120 });
    // herói
    const cells = E.Player.render(p, G.dt);
    const blink = p.invuln > 0 && p.hurtT <= 0 && p.dashT <= 0 && Math.floor(G.time * 16) % 2;
    if (!blink) drawCells(cells, p.x, p.y + 0.5, { tint: p.hurtT > 0.25 ? [1, 0.3, 0.2] : null, k: 0.5 });
    // camada da frente
    for (let y = 0; y < rows; y++) {
      const wy = ccy + y;
      if (wy < 0 || wy >= W.H) continue;
      for (let x = 0; x < cols; x++) {
        const wx = ccx + x;
        if (wx < 0 || wx >= W.W) continue;
        const i = wy * W.W + wx, f = front[i];
        if (!f) continue;
        const o = (y * cols + x) * 4;
        alb[o] = fc[i * 3];
        alb[o + 1] = fc[i * 3 + 1];
        alb[o + 2] = fc[i * 3 + 2];
        alb[o + 3] = f;
        aux[o] = 0;
        aux[o + 1] = 0;
        aux[o + 2] = 0;
      }
    }
    // partículas
    for (const q of G.parts) {
      const a = Math.min(1, q.life / (q.max * 0.4));
      const blinkF = q.fly ? 0.5 + 0.5 * Math.sin(G.time * 4 + q.seed) : 1;
      put(q.x, q.y, q.c.map((v) => v * 255 * a * blinkF), E.glyphIndex(q.ch), q.em ? Math.round(255 * Math.min(1, q.em)) : 0);
    }
    // nome e prompt de interação
    if (G.name) text(G.name, p.x, p.y - p.h - 3, [235, 235, 245], 200);
    const it = !(E.Editor && E.Editor.active) && E.Ents.interactable();
    if (it) text('[E]', it.x, it.y - (it.def.sh || it.h) - 2, [255, 210, 63], 255);
    return { ccx, ccy };
  }

  function gatherLights(ccx, ccy) {
    const W = G.world, out = [];
    const t = G.time;
    const add = (x, y, rad, inten, c) => {
      const vx = x - ccx, vy = y - ccy;
      if (vx < -rad || vy < -rad / 2 || vx > R().cols + rad || vy > R().rows + rad / 2) return;
      out.push({ x: vx, y: vy, r: rad, i: inten, c, score: inten * rad });
    };
    const flick = (l, seed) => (l.pulse ? 1 + (l.flicker || 0) * Math.sin(t * 2.5 + seed) : 1 + (l.flicker || 0) * (Math.sin(t * 13 + seed) * 0.5 + Math.sin(t * 7.3 + seed * 2) * 0.5));
    for (const l of W.lights) {
      const seed = (l.seed ??= Math.random() * 100);
      add(l.x, l.y, l.r, l.i * flick(l, seed), l.c);
    }
    for (const e of E.Ents.list) {
      if (e.kind === 'creature' && e.light) add(e.x, e.y - e.h / 2, e.light.r, e.light.i * flick(e.light, e.uid), e.light.c);
      else if (e.kind === 'item') add(e.x, e.y - 1, 6, 0.5, E.Project.items[e.item]?.color || [1, 1, 1]);
      else if (e.kind === 'proj' && e.light) add(e.x, e.y, e.light, 1, e.color);
    }
    const p = G.player;
    const lantern = G.inv.light && E.Project.items[G.inv.light]?.light;
    if (lantern) add(p.x + p.facing * 2, p.y - p.h * 0.6, lantern.r, lantern.i * (1 + Math.sin(t * 9) * 0.04), lantern.c);
    else add(p.x, p.y - p.h * 0.6, 24, 0.5, [1, 0.85, 0.65]);
    const wd = G.inv.weaponDef();
    if (wd.light) add(p.x + p.facing * 4, p.y - p.h * 0.5, 14, 0.8, wd.light);
    for (const s in p.status || {}) if (E.STATUS[s]?.light) add(p.x, p.y - p.h / 2, E.STATUS[s].light.r, E.STATUS[s].light.i, E.STATUS[s].light.c);
    for (const q of G.parts) if (q.light) add(q.x, q.y, q.light, (q.fly ? 0.55 : 1) * Math.min(1, q.life / (q.max * 0.4)), q.c);
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 32);
  }

  function updateCamera(dt) {
    const r = R(), W = G.world;
    if (!(E.Editor && E.Editor.active)) {
      const p = G.player;
      G.look = (G.look || 0) + (p.facing * 10 + p.vx * 0.2 - (G.look || 0)) * Math.min(1, dt * 2.5);
      const tx = p.x - r.cols / 2 + G.look, ty = p.y - r.rows * 0.64;
      const k = 1 - Math.pow(0.003, dt);
      G.cam.x += (tx - G.cam.x) * k;
      G.cam.y += (ty - G.cam.y) * k * (p.onGround || p.vy > 40 || p.climbing ? 1 : 0.4);
    }
    G.cam.x = Math.max(0, Math.min(W.W - r.cols + 2, G.cam.x));
    G.cam.y = Math.max(-10, Math.min(W.H - r.rows + 2, G.cam.y));
  }

  let last = 0, frames = 0, fpsT = 0;
  G.frame = (now) => {
    requestAnimationFrame(G.frame);
    let dt = Math.min(0.033, (now - (last || now)) / 1000);
    last = now;
    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      G.fps = Math.round(frames / fpsT);
      frames = 0;
      fpsT = 0;
    }
    const editing = E.Editor && E.Editor.active;
    if (G.mouseScreen) G.mouse = { x: G.cam.x + G.mouseScreen.x / R().cw, y: G.cam.y + G.mouseScreen.y / R().ch };
    G.hover = null;
    if (G.mouse && !editing)
      for (const e of E.Ents.list) {
        if (e.kind !== 'creature' || e.dead) continue;
        const sw = e.def.sw || e.w, sh = e.def.sh || e.h;
        if (Math.abs(G.mouse.x - e.x) < sw / 2 && G.mouse.y > e.y - sh && G.mouse.y < e.y + 1) G.hover = e;
      }
    if (G.pressed.KeyI && !editing) E.UI.toggleInventory();
    if (G.pressed.KeyM && !editing && !E.UI.menuOpen) E.UI.toggleMap();
    const paused = G.paused || E.UI.invOpen || E.UI.menuOpen || E.UI.mapOpen || E.UI.shopOpen;
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      dt *= 0.05;
    }
    G.dt = dt;
    if (!paused) G.time += dt;
    if (!editing && !paused) {
      E.Player.update(G.player, dt);
      E.Ents.update(dt);
    }
    if (editing) E.Editor.update(dt);
    if (!paused) ambient(dt);
    updateCamera(dt);
    G.pressed = {};
    const shx = G.shakeAmt > 0 ? (Math.random() - 0.5) * G.shakeAmt : 0, shy = G.shakeAmt > 0 ? (Math.random() - 0.5) * G.shakeAmt * 0.5 : 0;
    G.shakeAmt = Math.max(0, G.shakeAmt - dt * 25);
    const saveCam = { x: G.cam.x, y: G.cam.y };
    G.cam.x += shx;
    G.cam.y += shy;
    const s = G.world.settings;
    // relógio do mundo (só em mapas com ciclo ativo)
    let day = null;
    if (s.dayNight && s.sky !== 'Caverna') {
      if (!paused && !editing) s.hour = ((s.hour ?? 21) + (24 / ((s.cycle || 8) * 60)) * dt) % 24;
      day = E.dayState(s.hour ?? 21);
      G.isDay = day.isDay;
    } else G.isDay = false;
    G.day = day;
    // bioma onde o herói está
    let biome = null;
    if (G.world.biomes) {
      const px = G.player.x;
      biome = G.world.biomes.find((b) => px >= b.x0 && px < b.x1);
      if (biome && biome.id !== G.biomeId) {
        if (G.biomeId) E.UI.message('— ' + (E.BIOME_NAMES[biome.id] || biome.id) + ' —', 2.2);
        G.biomeId = biome.id;
      }
    }
    const bId = biome ? biome.id : '';
    const CODE = { floresta: 0, deserto: 1, neve: 2, oceano: 3, praia: 3, oceano_gelado: 3, floresta_grande: 4, castelo: 5 };
    // fundo: bioma atual + vizinho, misturados perto da fronteira (faixa de 160 células)
    let biomeA = CODE[bId] ?? 0, biomeB = biomeA, biomeMix = 0, nbId = bId;
    if (biome) {
      const bs = G.world.biomes, i = bs.indexOf(biome), px = G.player.x, TB = 160;
      const sm = (t) => t * t * (3 - 2 * t);
      if (i > 0 && px - biome.x0 < TB) {
        nbId = bs[i - 1].id;
        biomeMix = 0.5 * sm(1 - (px - biome.x0) / TB);
      } else if (i < bs.length - 1 && biome.x1 - px < TB) {
        nbId = bs[i + 1].id;
        biomeMix = 0.5 * sm(1 - (biome.x1 - px) / TB);
      }
      biomeB = CODE[nbId] ?? 0;
    }
    const wOf = (id) => (bId === id ? 1 - biomeMix : 0) + (nbId === id ? biomeMix : 0);
    const snow = wOf('neve') * 0.8 + wOf('oceano_gelado') * 0.45;
    // céu mais quente no deserto e mais frio na neve
    if (day) {
      const dw = wOf('deserto'), sw = wOf('neve') + wOf('oceano_gelado');
      day = Object.assign({}, day, {
        top: day.top.map((v, k) => v * (1 + dw * [0.12, 0.02, -0.15][k] + sw * [-0.08, 0, 0.1][k])),
        bot: day.bot.map((v, k) => v * (1 + dw * [0.25, 0.08, -0.25][k] + sw * [-0.05, 0.03, 0.12][k])),
      });
    }
    const { ccx, ccy } = compose();
    const r = R();
    r.draw({
      camCell: [ccx, ccy],
      off: [(G.cam.x - ccx) * r.cw, (G.cam.y - ccy) * r.ch],
      lights: gatherLights(ccx, ccy),
      amb: (day ? day.amb.map((v) => v * (s.ambK ?? 1)) : s.amb).map((v) => v + (G.flash > 0 ? G.flash * 3 : 0)),
      time: G.time,
      glow: s.glow,
      rain: s.rain * (1 - wOf('deserto') - wOf('neve')),
      fog: day ? s.fog * (1 - day.k * 0.6) : s.fog,
      horizon: s.horizon,
      shadows: s.shadows,
      sky: day ? { top: day.top, bot: day.bot, moon: day.cel[2] ? [1, 0.92, 0.7] : G.sky.moon, fog: day.fog } : G.sky,
      cel: day ? day.cel : [0.76, 0.17, 0, 1],
      stars: day ? day.stars : 1,
      dayK: day ? day.k : 0,
      biomeA,
      biomeB,
      biomeMix,
      snow,
      pushers: [G.player, ...E.Ents.list.filter((e) => e.kind === 'creature')].filter((o) => inView(o.x, o.y, 5)).slice(0, 4).map((o) => ({ x: o.x, y: o.y, vx: o.vx })),
    });
    E.Overlay.draw(ccx, ccy);
    G.cam.x = saveCam.x;
    G.cam.y = saveCam.y;
    if (G.flash > 0) G.flash -= dt;
    E.UI.tick(dt);
    E.Audio.tick(dt);
    E.hud && E.hud(r);
  };

  window.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input,select,textarea')) return;
    if (!G.keys[e.code]) G.pressed[e.code] = true;
    G.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => (G.keys[e.code] = false));
  // mouse: posição no mundo (para mirar) e clique esquerdo = atacar
  window.addEventListener('mousemove', (e) => {
    const r = E.Renderer;
    if (!r || !r.canvas) return;
    const rect = r.canvas.getBoundingClientRect();
    G.mouseScreen = { x: (e.clientX - rect.left) * (r.canvas.width / rect.width), y: (e.clientY - rect.top) * (r.canvas.height / rect.height) };
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (E.Editor && E.Editor.active) || E.UI.invOpen || E.UI.menuOpen || E.UI.shopOpen) return;
    if (e.target && e.target.closest && e.target.closest('#uiHot,#uiInv,#menu,#panel')) return;
    G.pressed.Mouse0 = true;
  });
  window.addEventListener('blur', () => (G.keys = {}));
})();

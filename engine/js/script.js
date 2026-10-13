'use strict';
// Scripts em JavaScript para criaturas, objetos, itens e gatilhos.
// Um script declara funções de evento: onSpawn(self, api), onUpdate(self, dt, api), onHit(self, dano, api),
// onDeath(self, api), onTouch(self, player, api), onInteract(self, player, api)
// Gatilhos: onEnter(api), onStay(api, dt), onExit(api). Itens: onUse(api, item) (retorne false para cancelar).
(function () {
  const E = window.ENG;
  const HOOKS = ['onSpawn', 'onUpdate', 'onHit', 'onDeath', 'onTouch', 'onInteract', 'onEnter', 'onStay', 'onExit', 'onUse'];
  const cache = new Map();

  E.Script = {
    errors: [],
    compile(src, label = 'script') {
      if (!src || !src.trim()) return {};
      if (cache.has(src)) return cache.get(src);
      let out = {};
      try {
        const body = `"use strict";\n${src}\n;return {${HOOKS.map((h) => `${h}: typeof ${h} === 'function' ? ${h} : null`).join(',')}};`;
        out = new Function(body)();
      } catch (err) {
        this.report(label, err);
        out = {};
      }
      cache.set(src, out);
      return out;
    },
    compileFn(src, hook, label) {
      return this.compile(src, label)[hook] || null;
    },
    safe(fn, label) {
      try {
        return fn();
      } catch (err) {
        this.report(label, err);
      }
    },
    report(label, err) {
      const msg = `[${label}] ${err && err.message ? err.message : err}`;
      if (this.errors[0] !== msg) this.errors.unshift(msg);
      this.errors.length = Math.min(this.errors.length, 30);
      console.warn(msg);
      E.Editor?.showErrors?.();
    },
    clearCache() {
      cache.clear();
    },
  };

  // ---------- API exposta aos scripts ----------
  const G = () => E.Game;
  E.API = {
    get player() {
      return G().player;
    },
    get time() {
      return G().time;
    },
    vars: {},
    log: (...a) => console.log('[script]', ...a),
    random: (a = 0, b = 1) => a + Math.random() * (b - a),
    chance: (p) => Math.random() < p,
    dist: (a, b = G().player) => Math.hypot(b.x - a.x, (b.y - a.y) * 2),
    dx: (a, b = G().player) => b.x - a.x,
    dy: (a, b = G().player) => b.y - a.y,
    // timer por entidade: true a cada `secs` segundos
    every(self, key, secs) {
      self.timers ||= {};
      self.timers[key] = (self.timers[key] ?? Math.random() * secs) + G().dt;
      if (self.timers[key] >= secs) {
        self.timers[key] = 0;
        return true;
      }
      return false;
    },
    move(self, dir, speed = self.def?.speed || 10) {
      self.vx = dir * speed * E.Status.speed(self);
      if (dir) self.facing = Math.sign(dir);
    },
    fly(self, tx, ty, speed = self.def?.speed || 10) {
      const dx = tx - self.x, dy = (ty - self.y) * 2, d = Math.hypot(dx, dy) || 1;
      self.vx = (dx / d) * speed;
      self.vy = ((dy / d) * speed) / 2;
      if (Math.abs(dx) > 1) self.facing = Math.sign(dx);
    },
    stop(self) {
      self.vx = 0;
    },
    jump(self, power = 40) {
      if (self.onGround) {
        self.vy = -power;
        return true;
      }
      return false;
    },
    onGround: (self) => !!self.onGround,
    wallAhead: (self) => E.Phys.solidBox(G().world, self.x + self.facing * 1.2, self.y - 1, self.w, self.h - 2),
    gapAhead(self) {
      const w = G().world, x = Math.floor(self.x + self.facing * (self.w / 2 + 1));
      for (let k = 0; k < 4; k++) if (w.cellType(x, Math.floor(self.y) + k) !== E.CT.NONE) return false;
      return true;
    },
    face(self, dir) {
      self.facing = dir < 0 ? -1 : 1;
    },
    facePlayer(self) {
      self.facing = G().player.x < self.x ? -1 : 1;
    },
    // troca a animação; com `secs`, volta para 'idle' depois desse tempo
    anim(self, name, secs = 0) {
      if (name === 'ataque' && self.def && self.def.sounds && self.def.sounds.melee) E.Audio.at(self.def.sounds.melee, self.x, self.y);
      self.anim = name;
      self.animT = 0;
      self.animRevert = secs;
    },
    teleport(self, x, y) {
      self.x = x;
      self.y = y;
    },
    shoot: (self, o = {}) => E.Ents.projectile(self, o),
    spawn: (prefab, x, y, props) => E.Ents.spawn(prefab, x, y, props),
    fx: (name, x, y, ...a) => E.FX.spawn(name, x, y, ...a),
    say(self, text, secs = 3) {
      self.say = String(text);
      self.sayT = secs;
      const v = self.def && self.def.sounds && self.def.sounds.voice;
      if (v) for (let i = 0; i < Math.min(7, Math.ceil(self.say.length / 6)); i++) setTimeout(() => E.Audio.at(v, self.x, self.y, { gap: 0 }), i * 85);
    },
    message: (text, secs = 3.5) => E.UI.message(text, secs),
    damage: (target, n, from) => (target === G().player ? G().hurtPlayer(n, from) : E.Ents.damage(target, n, from)),
    heal(target, n) {
      target.hp = Math.min(target.maxHp || target.hp + n, target.hp + n);
    },
    status: (target, name, secs = 5) => E.Status.add(target, name, secs),
    kill: (self) => E.Ents.damage(self, 9999),
    shop: (self) => E.UI.openShop(self),
    forge: (self) => E.UI.openForge(self),
    entities: () => E.Ents.list,
    give: (id, qty = 1) => (G().inv.add(id, qty) ? (E.UI.pickup(id, qty), true) : false),
    has: (id, qty = 1) => G().inv.count(id) >= qty,
    take: (id, qty = 1) => G().inv.take(id, qty),
    drop: (id, x, y, qty = 1) => E.Ents.dropItem(id, x, y, qty),
    goto: (mapId, x, y) => G().gotoMap(mapId, x, y),
    setSpawn(x, y) {
      G().world.spawn = { x, y };
    },
    weather(o = {}) {
      const s = G().world.settings;
      for (const k of ['rain', 'fog', 'glow']) if (o[k] != null) s[k] = o[k];
      if (o.sky) {
        s.sky = o.sky;
        s.amb = E.SKIES[o.sky].amb.map((v) => v * (s.ambK || 1));
        E.applySky();
      }
    },
    shake: (n = 4) => G().shake(n),
    saveGame: () => E.Save.save(),
    sound: (name, self) => (self ? E.Audio.at(name, self.x, self.y) : E.Audio.play(name)),
    achievement(name) {
      if (window.desktop && window.desktop.steam) window.desktop.steam.unlock(name);
      E.UI.message('Conquista: ' + name, 2.5);
    },
    setCollider(x, y, w, h, type = 1) {
      const wd = G().world;
      for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) if (wd.idx(xx, yy) >= 0) wd.col[wd.idx(xx, yy)] = type;
      wd.computeSurface(Math.floor(x) - 1, Math.ceil(x + w) + 1);
    },
    light(self, o) {
      self.light = o ? Object.assign({ c: [1, 0.8, 0.5], r: 20, i: 1 }, o) : null;
    },
  };

  E.SCRIPT_TEMPLATES = {
    '(nenhum)': '',
    Patrulha: `// anda de um lado para o outro e vira em paredes e buracos
function onUpdate(self, dt, api) {
  if (api.wallAhead(self) || api.gapAhead(self)) self.facing *= -1;
  api.move(self, self.facing);
}`,
    Perseguidor: `// patrulha e persegue o jogador quando ele chega perto
function onUpdate(self, dt, api) {
  const d = api.dist(self);
  if (d < 60) {
    api.facePlayer(self);
    api.move(self, self.facing, self.def.speed * 1.8);
    if (api.wallAhead(self)) api.jump(self, 35);
  } else {
    if (api.wallAhead(self) || api.gapAhead(self)) self.facing *= -1;
    api.move(self, self.facing);
  }
}`,
    Saltador: `// pula na direção do jogador de tempos em tempos
function onUpdate(self, dt, api) {
  if (self.onGround) {
    self.vx *= 0.8;
    if (api.every(self, 'pulo', 1.4)) {
      if (api.dist(self) < 80) api.facePlayer(self);
      self.vx = self.facing * self.def.speed * 2;
      api.jump(self, 30 + api.random(0, 15));
    }
  }
}
function onDeath(self, api) { api.fx('gosma', self.x, self.y - 2); }`,
    Guerreiro: `// patrulha; ao ver o jogador avança, ergue a espada e dá um bote
function onUpdate(self, dt, api) {
  const d = api.dist(self);
  if (self.vars.bote > 0) { self.vars.bote -= dt; return; }
  if (d < 70) {
    api.facePlayer(self);
    if (d < 16 && api.every(self, 'golpe', 1.4)) {
      api.anim(self, 'ataque', 0.45);
      self.vx = self.facing * 45;
      if (self.onGround) self.vy = -12;
      self.vars.bote = 0.35;
      api.fx('faisca', self.x + self.facing * 5, self.y - 6);
    } else api.move(self, self.facing, self.def.speed * 1.4);
    if (api.wallAhead(self)) api.jump(self, 38);
  } else {
    if (api.wallAhead(self) || api.gapAhead(self)) self.facing *= -1;
    api.move(self, self.facing, self.def.speed * 0.6);
  }
}
function onHit(self, dano, api) { if (api.chance(0.3)) api.say(self, '*clac*', 0.6); }
function onDeath(self, api) { api.fx('faisca', self.x, self.y - 6); api.fx('poeira', self.x, self.y, 12); }`,
    Voador: `// voa em ondas e mergulha no jogador
function onUpdate(self, dt, api) {
  self.vars.t = (self.vars.t || api.random(0, 9)) + dt;
  const p = api.player;
  if (api.dist(self) < 90) api.fly(self, p.x, p.y - 8 + Math.sin(self.vars.t * 3) * 10, self.def.speed);
  else api.fly(self, self.spawnX + Math.sin(self.vars.t) * 20, self.spawnY + Math.sin(self.vars.t * 2) * 5, self.def.speed * 0.5);
}`,
    Atirador: `// mantém distância e atira ossos em arco
function onUpdate(self, dt, api) {
  const d = api.dist(self);
  api.facePlayer(self);
  if (d < 30) api.move(self, -self.facing, self.def.speed);
  else if (d > 80) api.move(self, self.facing, self.def.speed * 0.6);
  else api.stop(self);
  if (d < 110 && api.every(self, 'tiro', 2.2)) {
    api.anim(self, 'ataque', 0.5);
    api.shoot(self, { speed: 38, arc: true, damage: 1, glyph: 'x', color: [0.9, 0.9, 0.8] });
  }
}`,
    Espírito: `// flutua, some e reaparece, lança orbes mágicos
function onSpawn(self, api) { api.light(self, { c: [0.6, 0.4, 1], r: 26, i: 1.1 }); }
function onUpdate(self, dt, api) {
  self.vars.t = (self.vars.t || 0) + dt;
  const p = api.player;
  api.fly(self, p.x + Math.cos(self.vars.t) * 30, p.y - 20 + Math.sin(self.vars.t * 1.7) * 6, self.def.speed);
  if (api.every(self, 'orbe', 1.8)) api.shoot(self, { speed: 30, damage: 1, glyph: '●', color: [0.7, 0.5, 1], light: 10, homing: 0.6, status: 'lento' });
  if (api.every(self, 'teleporte', 7)) { api.fx('magia', self.x, self.y - 3); api.teleport(self, p.x + api.random(-40, 40), p.y - 25); api.fx('magia', self.x, self.y - 3); }
}
function onDeath(self, api) { api.fx('magia', self.x, self.y - 3); api.drop('regen', self.x, self.y); }`,
    NPC: `// fala as linhas de props.fala (separe com |) quando o jogador aperta E
function onInteract(self, player, api) {
  const falas = String(self.props.fala || 'Olá, viajante.').split('|');
  self.vars.i = ((self.vars.i ?? -1) + 1) % falas.length;
  api.say(self, falas[self.vars.i], 4);
}
function onUpdate(self, dt, api) { api.facePlayer(self); }`,
    Aldeão: `// passeia perto de casa e conversa (props.fala: frases separadas por |)
function onSpawn(self, api) { self.vars.home = self.x; self.vars.dir = 0; }
function onUpdate(self, dt, api) {
  if (self.sayT > 0 || api.dist(self) < 14) { api.stop(self); api.facePlayer(self); return; }
  if (api.every(self, 'passeio', 3)) {
    const h = self.vars.home;
    self.vars.dir = api.chance(0.4) ? 0 : self.x > h + 25 ? -1 : self.x < h - 25 ? 1 : api.chance(0.5) ? -1 : 1;
  }
  if (self.vars.dir && (api.wallAhead(self) || api.gapAhead(self))) self.vars.dir = -self.vars.dir;
  api.move(self, self.vars.dir, self.def.speed);
}
function onInteract(self, player, api) {
  const falas = String(self.props.fala || 'Bom dia, viajante!').split('|');
  self.vars.i = ((self.vars.i ?? -1) + 1) % falas.length;
  api.say(self, falas[self.vars.i], 4);
}`,
    Ferreiro: `// martela na bigorna; E abre a forja para melhorar arma e armaduras
function onUpdate(self, dt, api) {
  if (api.dist(self) < 30) api.facePlayer(self);
  if (api.every(self, 'bigorna', 1.95) && api.dist(self) < 120) { api.sound('metal', self); api.fx('faisca', self.x + self.facing * 5, self.y - 3); }
}
function onInteract(self, player, api) { api.say(self, 'Traga ferro e moedas que eu deixo isso afiado!', 2.5); api.forge(self); }`,
    'Chefe: Rainha Aranha': `// salta, cospe teia (deixa lento) e chama filhotes; mais rápida com metade da vida
function onSpawn(self, api) { if (api.vars['chefe_' + self.prefab]) { self.dead = true; return; } api.light(self, { c: [0.8, 0.3, 1], r: 30, i: 0.8 }); }
function onUpdate(self, dt, api) {
  const d = api.dist(self);
  if (!self.vars.awake) {
    if (d < 100) { self.vars.awake = true; api.message('A RAINHA ARANHA desperta!', 2.5); api.shake(6); api.sound('aranha_sibilo', self); }
    return;
  }
  const fur = self.hp < self.maxHp / 2;
  api.facePlayer(self);
  if (self.onGround) api.move(self, self.facing, self.def.speed * (fur ? 1.7 : 1.15));
  if (api.wallAhead(self)) api.jump(self, 45);
  if (self.onGround && api.every(self, 'salto', fur ? 2.6 : 3.8)) { self.vx = self.facing * 75; api.jump(self, 55); api.sound('aranha_sibilo', self); }
  if (api.every(self, 'teia', fur ? 1.7 : 2.8)) api.shoot(self, { speed: 45, damage: 1, glyph: '*', color: [0.95, 0.95, 1], status: 'lento', arc: true });
  if (api.every(self, 'ninhada', fur ? 7 : 10)) {
    self.vars.kids = (self.vars.kids || []).filter((k) => k && !k.dead);
    if (self.vars.kids.length < 4) for (const s of [-1, 1]) { const k = api.spawn('aranha', self.x + s * 10, self.y); if (k) self.vars.kids.push(k); }
    api.fx('fumaca', self.x, self.y - 4);
  }
}
function onDeath(self, api) { api.vars['chefe_' + self.prefab] = true; api.shake(10); api.message('Você derrotou a RAINHA ARANHA!', 4); api.saveGame(); }`,
    'Chefe: Rei Esqueleto': `// golpeia de perto, atira ossos, salta e faz o chão tremer, invoca guerreiros
function onSpawn(self, api) { if (api.vars['chefe_' + self.prefab]) { self.dead = true; return; } api.light(self, { c: [0.7, 0.4, 1], r: 28, i: 0.9 }); }
function onUpdate(self, dt, api) {
  const d = api.dist(self), p = api.player;
  if (!self.vars.awake) {
    if (d < 100) { self.vars.awake = true; api.message('O REI ESQUELETO se levanta!', 2.5); api.shake(6); api.sound('ossos_morte', self); }
    return;
  }
  const fur = self.hp < self.maxHp / 2;
  if (self.vars.slam > 0) {
    self.vars.slam -= dt;
    if (self.onGround && self.vars.air && self.vy >= 0) {
      self.vars.air = false;
      api.shake(8);
      api.fx('poeira', self.x, self.y, 8);
      api.sound('explosao', self);
      for (const s of [-1, 1]) { const o = api.shoot(self, { dx: s, dy: 0, speed: 55, damage: 1, glyph: '≈', color: [0.95, 0.9, 0.75], life: 1.3 }); o.y = self.y - 1.5; o.x = self.x + s * 6; }
    }
    return;
  }
  api.facePlayer(self);
  if (d > 16) api.move(self, self.facing, self.def.speed * (fur ? 1.5 : 1)); else self.vx *= 0.8;
  if (d < 20 && api.every(self, 'golpe', 1.5)) { api.anim(self, 'ataque', 0.45); self.vx = self.facing * 40; }
  if (api.every(self, 'ossos', fur ? 2.2 : 3.2)) for (let k = -1; k <= 1; k++) api.shoot(self, { tx: p.x + k * 10, ty: p.y - 6, speed: 42, damage: 1, glyph: '=', color: [0.95, 0.92, 0.8], arc: true });
  if (self.onGround && api.every(self, 'salto', fur ? 4.5 : 6)) { api.jump(self, 62); self.vx = self.facing * 30; self.vars.air = true; self.vars.slam = 1.6; }
  if (api.every(self, 'exercito', 11)) {
    self.vars.kids = (self.vars.kids || []).filter((k) => k && !k.dead);
    if (self.vars.kids.length < 3) { const k = api.spawn(api.chance(0.5) ? 'esqueleto' : 'esqueleto_guerreiro', self.x - self.facing * 14, self.y); if (k) { self.vars.kids.push(k); api.fx('magia', k.x, k.y - 6); } }
  }
}
function onDeath(self, api) { api.vars['chefe_' + self.prefab] = true; api.shake(10); api.message('Você derrotou o REI ESQUELETO!', 4); api.saveGame(); }`,
    'Chefe: Golem de Gelo': `// lento e pesado: arremessa blocos de gelo, soca o chão (estilhaços) e chama slimes
function onSpawn(self, api) { if (api.vars['chefe_' + self.prefab]) { self.dead = true; return; } }
function onUpdate(self, dt, api) {
  const d = api.dist(self), p = api.player;
  if (!self.vars.awake) {
    if (d < 100) { self.vars.awake = true; api.message('O GOLEM DE GELO acorda!', 2.5); api.shake(8); api.sound('golpe_pesado', self); }
    return;
  }
  const fur = self.hp < self.maxHp / 2;
  if (self.vars.soco > 0) { self.vars.soco -= dt; self.vx = 0; return; }
  api.facePlayer(self);
  api.move(self, self.facing, self.def.speed * (fur ? 1.6 : 1));
  if (api.wallAhead(self)) api.jump(self, 40);
  if (api.every(self, 'bloco', fur ? 2.4 : 3.4)) api.shoot(self, { speed: 46, damage: 2, glyph: '●', color: [0.7, 0.92, 1], arc: true, light: 10, explode: { radius: 9, damage: 2, fx: 'magia', status: 'lento', dig: false } });
  if (d < 40 && api.every(self, 'soco', fur ? 3.5 : 5)) {
    api.anim(self, 'ataque', 0.6);
    self.vars.soco = 0.7;
    api.shake(9);
    api.sound('explosao', self);
    for (let k = 0; k < 7; k++) { const o = api.shoot(self, { dx: (k - 3) * 0.28, dy: -1, speed: 48, damage: 1, glyph: '^', color: [0.75, 0.95, 1], status: 'lento', life: 2 }); o.g = 70; o.y = self.y - 2; }
  }
  if (api.every(self, 'slimes', 12)) {
    self.vars.kids = (self.vars.kids || []).filter((k) => k && !k.dead);
    if (self.vars.kids.length < 3) { const k = api.spawn('slime_gelo', self.x - self.facing * 16, self.y); if (k) self.vars.kids.push(k); }
  }
}
function onDeath(self, api) { api.vars['chefe_' + self.prefab] = true; api.shake(12); api.message('Você derrotou o GOLEM DE GELO!', 4); api.saveGame(); }`,
    'Chefe: Slime Rei': `// pulos enormes que fazem ondas no chão; ao apanhar solta slimes
function onSpawn(self, api) { if (api.vars['chefe_' + self.prefab]) { self.dead = true; return; } }
function onUpdate(self, dt, api) {
  const d = api.dist(self);
  if (!self.vars.awake) {
    if (d < 100) { self.vars.awake = true; api.message('O SLIME REI quer brincar!', 2.5); api.shake(6); api.sound('slime_plaft', self); }
    return;
  }
  const fur = self.hp < self.maxHp / 2;
  if (self.onGround) {
    if (self.vars.air) {
      self.vars.air = false;
      api.shake(6);
      api.fx('gosma', self.x, self.y - 2);
      for (const s of [-1, 1]) { const o = api.shoot(self, { dx: s, dy: 0, speed: 50, damage: 1, glyph: '~', color: [0.45, 1, 0.4], life: 1.1 }); o.y = self.y - 1.5; o.x = self.x + s * 12; }
    }
    self.vx *= 0.8;
    if (api.every(self, 'pulo', fur ? 1.3 : 1.9)) { api.facePlayer(self); self.vx = self.facing * self.def.speed * 3.2; api.jump(self, fur ? 78 : 68); self.vars.air = true; }
  }
}
function onHit(self, dano, api) {
  self.vars.kids = (self.vars.kids || []).filter((k) => k && !k.dead);
  if (self.vars.kids.length < 5 && api.chance(0.3)) { const k = api.spawn('slime', self.x, self.y - 4); if (k) self.vars.kids.push(k); }
}
function onDeath(self, api) { for (let i = 0; i < 4; i++) api.spawn('slime', self.x - 12 + i * 8, self.y - 2); api.vars['chefe_' + self.prefab] = true; api.shake(8); api.message('Você derrotou o SLIME REI!', 4); api.saveGame(); }`,
    Mercador: `// abre a loja; props.stock = lista de ids à venda (vazio = estoque padrão)
function onInteract(self, player, api) { api.say(self, 'Dê uma olhada, viajante!', 2); api.shop(self); }
function onUpdate(self, dt, api) { api.facePlayer(self); }`,
    Baú: `// abre uma vez e solta os itens de props.loot
function onInteract(self, player, api) {
  if (self.vars.aberto) return api.say(self, '(vazio)', 1.5);
  self.vars.aberto = true;
  api.sound('bau', self);
  api.anim(self, 'aberto');
  api.fx('moedas', self.x, self.y - 3);
  (self.props.loot || ['moeda']).forEach((id, i) => api.drop(id, self.x - 3 + i * 3, self.y - 4));
}`,
    Fogueira: `// checkpoint: salva o ponto de renascimento e cura
function onSpawn(self, api) { api.light(self, { c: [1, 0.55, 0.2], r: 36, i: 1.3, flicker: 0.3 }); }
function onUpdate(self, dt, api) { if (Math.random() < dt * 10) api.fx('fogo', self.x, self.y - 2); }
function onInteract(self, player, api) {
  api.setSpawn(self.x, self.y);
  api.heal(player, 99);
  api.fx('cura', player.x, player.y - 6);
  api.saveGame();
  api.sound('fogo');
  api.message('Você descansa junto ao fogo. Jogo salvo.');
}`,
    Porta: `// porta de madeira: E abre/fecha. props: {"trancada":true} pede chave; {"destino":"caverna","x":30,"y":80} leva a outro mapa
function onSpawn(self, api) {
  self.vars.aberta = false;
  if (!self.props.destino) api.setCollider(Math.round(self.x) - 1, Math.round(self.y) - 19, 3, 19, 1);
}
function onInteract(self, player, api) {
  if (self.props.trancada && !self.vars.destrancada) {
    if (!api.has('chave')) return api.say(self, 'Trancada. Precisa de uma chave.', 2);
    api.take('chave', 1);
    self.vars.destrancada = true;
    api.message('Você destrancou a porta.');
  }
  if (self.props.destino) {
    api.fx('poeira', self.x, self.y);
    return api.goto(self.props.destino, self.props.x, self.props.y);
  }
  self.vars.aberta = !self.vars.aberta;
  api.sound('porta', self);
  api.anim(self, self.vars.aberta ? 'aberta' : 'idle');
  api.setCollider(Math.round(self.x) - 1, Math.round(self.y) - 19, 3, 19, self.vars.aberta ? 0 : 1);
  api.fx('poeira', self.x, self.y);
}`,
    Tocha: `// tocha: luz que tremula e solta brasas
function onSpawn(self, api) { api.light(self, { c: [1, 0.58, 0.22], r: 36, i: 1.35, flicker: 0.3 }); }
function onUpdate(self, dt, api) { if (Math.random() < dt * 6) api.fx('fogo', self.x, self.y - 6); }`,
    'Gatilho: mensagem': `function onEnter(api) {
  api.message('Você sente que está sendo observado...');
}`,
    'Gatilho: emboscada': `// cria 3 aranhas ao entrar (uma vez)
function onEnter(api) {
  const p = api.player;
  for (let i = 0; i < 3; i++) api.spawn('aranha', p.x + 40 + i * 12, p.y - 10);
  api.message('Emboscada!');
  api.shake(5);
}`,
    'Gatilho: porta para outro mapa': `// leva o jogador para outro mapa (troque o id e a posição)
function onEnter(api) {
  if (!api.has('chave')) return api.message('A porta está trancada. Precisa de uma chave.');
  api.goto('fase1', 40, 100);
}`,
    'Gatilho: tempestade': `function onEnter(api) { api.weather({ rain: 0.9, fog: 1, sky: 'Névoa' }); api.fx('raio', api.player.x + 30, api.player.y); }
function onExit(api) { api.weather({ rain: 0, fog: 0.5, sky: 'Noite' }); }`,
    'Item: teleporte': `// exemplo de onUse para um item: volta ao checkpoint
function onUse(api, item) {
  const s = api.player;
  api.fx('magia', s.x, s.y - 6);
  api.goto(null);
}`,
  };
})();

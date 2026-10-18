'use strict';
// Entidades: criaturas/objetos (prefabs + scripts), projéteis, itens no chão, spawners e gatilhos.
(function () {
  const E = window.ENG;
  const G = () => E.Game;
  const T = () => E.SCRIPT_TEMPLATES;

  E.defaultPrefabs = () => ({
    aranha: { sounds: { idle: 'aranha_sibilo', move: 'aranha_passos', hit: 'aranha_dor', die: 'aranha_morte' }, name: 'Aranha', sprite: 'spider', sw: 22, sh: 8, w: 14, h: 6, hp: 3, damage: 1, speed: 9, gravity: true, team: 'inimigo', deathFx: 'sangue', loot: [{ item: 'moeda', chance: 0.7, min: 1, max: 3 }, { item: 'presa_aranha', chance: 0.45 }, { item: 'antidoto', chance: 0.06 }], script: T().Perseguidor },
    slime: { sounds: { move: 'slime_pulo', land: 'slime_plaft', hit: 'slime_dor', die: 'gosma' }, name: 'Slime', sprite: 'slime', sw: 13, sh: 8, w: 10, h: 6, hp: 2, damage: 1, speed: 10, gravity: true, team: 'inimigo', deathFx: 'gosma', loot: [{ item: 'moeda', chance: 0.5, min: 1, max: 2 }, { item: 'regen', chance: 0.15 }, { item: 'gosma', chance: 0.55 }, { item: 'maca', chance: 0.12 }], script: T().Saltador },
    morcego: { sounds: { idle: 'morcego_guincho', move: 'morcego_asas', hit: 'morcego_guincho', die: 'morcego_morte' }, name: 'Morcego', sprite: 'bat', sw: 18, sh: 6, w: 8, h: 4, hp: 1, damage: 1, speed: 22, gravity: false, team: 'inimigo', deathFx: 'sangue', loot: [{ item: 'moeda', chance: 0.4 }, { item: 'cogumelo_brilho', chance: 0.1 }], script: T().Voador },
    esqueleto: { sounds: { idle: 'ossos_chacoalhar', attack: 'arco', hit: 'ossos', die: 'ossos_morte' }, name: 'Esqueleto arqueiro', sprite: 'skeleton', sw: 20, sh: 25, w: 6, h: 17, hp: 4, damage: 1, speed: 8, gravity: true, team: 'inimigo', deathFx: 'faisca', loot: [{ item: 'chave', chance: 0.35 }, { item: 'moeda', chance: 0.8, min: 2, max: 5 }, { item: 'osso', chance: 0.6, min: 1, max: 2 }, { item: 'faca_arremesso', chance: 0.25, min: 2, max: 4 }, { item: 'arco_curto', chance: 0.03 }], script: T().Atirador },
    esqueleto_guerreiro: { sounds: { idle: 'ossos_chacoalhar', melee: 'golpe_pesado', hit: 'metal', die: 'ossos_morte', move: 'ossos_chacoalhar' }, name: 'Esqueleto guerreiro', sprite: 'skeleton2', sw: 25, sh: 25, w: 6, h: 17, hp: 5, damage: 1, speed: 9, gravity: true, team: 'inimigo', deathFx: 'faisca', loot: [{ item: 'moeda', chance: 0.9, min: 2, max: 6 }, { item: 'pocao', chance: 0.2 }, { item: 'chave', chance: 0.15 }, { item: 'elmo_ferro', chance: 0.05 }, { item: 'osso', chance: 0.6 }, { item: 'lingote_ferro', chance: 0.2 }, { item: 'machado', chance: 0.04 }], script: T().Guerreiro },
    escorpiao: { name: 'Escorpião do deserto', sprite: 'spider', tint: [1.25, 0.95, 0.55], sounds: { idle: 'aranha_sibilo', move: 'aranha_passos', hit: 'aranha_dor', die: 'aranha_morte' }, sw: 20, sh: 7, w: 13, h: 6, hp: 3, damage: 1, speed: 13, gravity: true, team: 'inimigo', deathFx: 'poeira', loot: [{ item: 'moeda', chance: 0.8, min: 1, max: 4 }, { item: 'elixir', chance: 0.08 }, { item: 'ferrao', chance: 0.5 }, { item: 'gema_rubi', chance: 0.03 }, { item: 'adaga_veneno', chance: 0.02 }], script: T().Perseguidor },
    slime_gelo: { name: 'Slime de gelo', sprite: 'slime', tint: [0.6, 0.85, 1.35], sounds: { move: 'slime_pulo', land: 'slime_plaft', hit: 'slime_dor', die: 'gosma' }, sw: 13, sh: 8, w: 10, h: 6, hp: 3, damage: 1, speed: 9, gravity: true, team: 'inimigo', deathFx: 'faisca', loot: [{ item: 'moeda', chance: 0.6, min: 1, max: 3 }, { item: 'regen', chance: 0.12 }, { item: 'gosma', chance: 0.5 }, { item: 'gema_safira', chance: 0.03 }, { item: 'bomba_gelo', chance: 0.06 }], script: T().Saltador + "\nfunction onTouch(self, player, api) { api.status(player, 'lento', 2); }" },
    cavaleiro: { name: 'Cavaleiro das ruínas', sprite: 'knight', sounds: { melee: 'golpe_pesado', hit: 'metal', die: 'morte', move: 'ossos_chacoalhar' }, sw: 32, sh: 28, w: 6, h: 17, hp: 6, damage: 1, speed: 10, gravity: true, team: 'inimigo', deathFx: 'faisca', loot: [{ item: 'moeda', chance: 1, min: 3, max: 7 }, { item: 'pocao', chance: 0.3 }, { item: 'elmo_ferro', chance: 0.08 }, { item: 'peitoral_ferro', chance: 0.05 }, { item: 'lingote_ferro', chance: 0.45 }, { item: 'pao', chance: 0.3 }, { item: 'espada_cavaleiro', chance: 0.05 }, { item: 'botas_ferro', chance: 0.05 }, { item: 'lanca', chance: 0.05 }], script: T().Guerreiro },
    espirito: { name: 'Espírito errante', sounds: { idle: 'espirito_sussurro', attack: 'orbe', hit: 'espirito_dor', die: 'espirito_morte' }, name: 'Espírito errante', sprite: 'wisp', sw: 14, sh: 9, w: 6, h: 6, hp: 6, damage: 1, speed: 16, gravity: false, emissive: true, team: 'inimigo', deathFx: 'magia', loot: [{ item: 'elixir', chance: 0.5 }, { item: 'essencia', chance: 0.7, min: 1, max: 2 }, { item: 'capa_sombria', chance: 0.03 }], script: T()['Espírito'] },
    // pessoas: sprite 'person' em camadas (veja SPR.person); sw/sh na escala do herói (~1,4× o antigo)
    npc: { sounds: { voice: 'voz_velho' }, name: 'Velho eremita', sprite: 'person', look: { robe: '#8a6e4c', robe2: '#5a4432', hat: 'capuz', hatc: '#6e5640', beard: '#e8e8e0', beardStyle: 'longa', age: 'velho', tool: 'cajado', gem: '#ffd27f', pouch: '#5a3a20', boots: '#3a2a1e' }, sw: 20, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().NPC },
    mercador: { sounds: { voice: 'voz_velho' }, name: 'Mercador', sprite: 'person', look: { robe: '#9a7a3a', robe2: '#6a5020', hat: 'boina', hatc: '#8a2a2a', gem: '#ffd23f', hair: '#4a3a2a', beard: '#4a3a2a', beardStyle: 'bigode', sash: '#c8a040', bag: '#7a5a2a', pouch: '#6a4a24', tool: 'cesta' }, sw: 20, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().Mercador },
    ferreiro: { sounds: { voice: 'voz_velho' }, name: 'Ferreiro', sprite: 'person', look: { robe: '#a0785a', robe2: '#5e4836', apron: '#4a3c32', skin: '#c88a68', hair: '#2a1e18', hairStyle: 'careca', beard: '#3a2a20', gloves: '#4a3a2a', boots: '#2a2018', tool: 'martelo' }, sw: 22, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().Ferreiro },
    alquimista: { sounds: { voice: 'voz_velho' }, name: 'Alquimista', sprite: 'person', look: { robe: '#6a44a0', robe2: '#3e2468', hat: 'pontudo', hatc: '#4a2a80', beard: '#d8d8d0', beardStyle: 'longa', age: 'velho', dress: true, tool: 'frasco', gem: '#6aff9a', amulet: '☼', pouch: '#4a6a3a', sash: '#c8a040' }, sw: 22, sh: 28, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', light: { c: [0.5, 1, 0.6], r: 12, i: 0.6 }, script: T().Mercador },
    armeiro: { sounds: { voice: 'voz_velho' }, name: 'Armeiro', sprite: 'person', look: { robe: '#7a8090', robe2: '#4a505e', hair: '#5a3a20', hairStyle: 'rabo', beard: '#5a3a20', armor: '#9aa0ae', pauldron: '#8a909e', apron: '#5a3a20', belt: '#5a3a1a', gloves: '#3a2a1e', tool: 'espada' }, sw: 22, sh: 28, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().Mercador },
    pescador: { sounds: { voice: 'voz_velho' }, name: 'Pescador', sprite: 'person', look: { robe: '#3a6a8a', robe2: '#244a64', hat: 'chapeu', hatc: '#c8a860', beard: '#9a9a90', age: 'velho', pants: '#4a4234', boots: '#3a4a5a', pouch: '#6a5a3a', tool: 'vara' }, sw: 25, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().Mercador },
    aldeao: { sounds: { voice: 'voz_velho' }, name: 'Aldeão', sprite: 'person', look: { robe: '#6a8a4a', robe2: '#465e30', hat: 'chapeu', hatc: '#c8a860', hair: '#4a3020', beard: '#4a3020', beardStyle: 'cavanhaque', pouch: '#6a4a24', pants: '#5a4a34' }, sw: 20, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 7, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    aldea: { sounds: { voice: 'voz_velho' }, name: 'Aldeã', sprite: 'person', look: { robe: '#b0604a', robe2: '#7a3a30', dress: true, hair: '#8a5a2a', hairStyle: 'trança', hat: 'lenco', hatc: '#e8d8b0', apron: '#e0d6bc', tool: 'cesta' }, sw: 20, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 6, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    guarda: { sounds: { voice: 'voz_velho' }, name: 'Guarda', sprite: 'person', look: { robe: '#3a5a9a', robe2: '#24407a', hat: 'elmo', armor: '#a8aebc', pauldron: '#8a909e', crest: '♦', shield: '#3a5a9a', cape: '#24407a', tool: 'lanca', belt: '#4a3a2a', boots: '#3a3a42', gloves: '#5a5a66' }, sw: 22, sh: 28, w: 6, h: 17, hp: 0, damage: 0, speed: 5, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    curandeira: { sounds: { voice: 'voz_velho' }, name: 'Curandeira', sprite: 'person', look: { robe: '#d8d0bc', robe2: '#9a9078', dress: true, sash: '#5ab04a', hat: 'lenco', hatc: '#5a8a4a', hair: '#6a4020', hairStyle: 'longo', tool: 'ervas', pouch: '#6a8a3a', amulet: '+', gem: '#7ae08a' }, sw: 20, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().NPC },
    mago: { sounds: { voice: 'voz_velho' }, name: 'Mago errante', sprite: 'person', look: { robe: '#2a3a8a', robe2: '#16205a', dress: true, hat: 'pontudo', hatc: '#1e2a6e', beard: '#c8c8d0', beardStyle: 'longa', age: 'velho', tool: 'cajado', gem: '#6ad0ff', cape: '#3a1e6a', amulet: '☼', sash: '#c8a040' }, sw: 22, sh: 30, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', light: { c: [0.4, 0.8, 1], r: 14, i: 0.6 }, script: T().NPC },
    nobre: { sounds: { voice: 'voz_velho' }, name: 'Nobre', sprite: 'person', look: { robe: '#8a1e3a', robe2: '#4a0e22', cape: '#5a1a6a', sash: '#e8c050', hat: 'diadema', hair: '#c8a060', hairStyle: 'rabo', beard: '#c8a060', beardStyle: 'cavanhaque', amulet: true, gem: '#ff5a7a', belt: '#c8a040', buckle: '#ffe07a', gloves: '#e8e0d0', boots: '#4a2a1a' }, sw: 22, sh: 26, w: 6, h: 17, hp: 0, damage: 0, speed: 4, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    cacador: { sounds: { voice: 'voz_velho' }, name: 'Caçador', sprite: 'person', look: { robe: '#5a6a32', robe2: '#2e3a18', cape: '#3a4a22', hat: 'capuz', hatc: '#3e4a22', hair: '#5a3a1a', beard: '#5a3a1a', beardStyle: 'cavanhaque', quiver: true, tool: 'arco', pouch: '#6a4a24', boots: '#3a2a1a', pants: '#4a3a24' }, sw: 22, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 6, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    mineiro: { sounds: { voice: 'voz_velho' }, name: 'Mineiro', sprite: 'person', look: { robe: '#6a5a4a', robe2: '#3e3428', pants: '#4a3a2a', hat: 'capacete', hatc: '#b08a3a', beard: '#4a3020', gloves: '#5a4a3a', pouch: '#5a4a34', boots: '#2a2018', tool: 'picareta' }, sw: 22, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', light: { c: [1, 0.85, 0.55], r: 12, i: 0.5 }, script: T().NPC },
    monge: { sounds: { voice: 'voz_velho' }, name: 'Monge', sprite: 'person', look: { robe: '#8a6a3a', robe2: '#5a4220', dress: true, hair: '#3a2a1a', hairStyle: 'tonsura', belt: '#d8c890', buckle: '#d8c890', tool: 'rosario', amulet: '+', gem: '#e8d8a0', boots: '#5a4220' }, sw: 20, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 3, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    misterioso: { sounds: { voice: 'voz_velho' }, name: 'Andarilho misterioso', sprite: 'person', look: { robe: '#2a2230', robe2: '#16121c', dress: true, hat: 'capuzFundo', hatc: '#2a2230', cape: '#1a141e', eyes: '#9affd8', tool: 'lanterna', boots: '#141018' }, sw: 22, sh: 26, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', light: { c: [0.55, 1, 0.85], r: 12, i: 0.55 }, script: T().NPC },
    marinheiro: { sounds: { voice: 'voz_velho' }, name: 'Marinheiro', sprite: 'person', look: { robe: '#d8d8cc', robe2: '#3a5a8a', pants: '#2a3a5a', hat: 'tricornio', hatc: '#2a2a3a', beard: '#6a4a2a', sash: '#c83a3a', tool: 'corda', boots: '#2a2018', pouch: '#5a4a34' }, sw: 22, sh: 25, w: 6, h: 17, hp: 0, damage: 0, speed: 6, gravity: true, team: 'neutro', script: T()['Aldeão'] },
    paladino: { sounds: { voice: 'voz_velho' }, name: 'Paladino', sprite: 'person', look: { robe: '#8a1a2a', robe2: '#5a0e1a', hat: 'elmoNobre', armor: '#c8ccd6', pauldron: '#e0c060', crest: '♦', shield: '#8a1a2a', cape: '#8a1a2a', tool: 'espada', belt: '#c8a040', boots: '#5a5a66', gloves: '#9aa0ae' }, sw: 24, sh: 28, w: 6, h: 17, hp: 0, damage: 0, speed: 0, gravity: true, team: 'neutro', script: T().NPC },
    rainha_aranha: { name: 'Rainha Aranha', boss: true, sprite: 'spiderQueen', tint: [1.0, 0.6, 1.25], sounds: { idle: 'aranha_sibilo', move: 'aranha_passos', hit: 'aranha_dor', die: 'aranha_morte' }, sw: 66, sh: 24, w: 30, h: 14, hp: 70, damage: 2, speed: 14, gravity: true, team: 'inimigo', deathFx: 'explosao', loot: [{ item: 'lamina_aracnidea', chance: 1 }, { item: 'coracao_vital', chance: 1 }, { item: 'presa_aranha', chance: 1, min: 3, max: 6 }, { item: 'moeda', chance: 1, min: 30, max: 50 }], script: T()['Chefe: Rainha Aranha'] },
    rei_esqueleto: { name: 'Rei Esqueleto', boss: true, sprite: 'skeletonKing', sounds: { idle: 'ossos_chacoalhar', melee: 'golpe_pesado', attack: 'arco', hit: 'metal', die: 'ossos_morte', move: 'ossos_chacoalhar' }, sw: 36, sh: 38, w: 10, h: 34, hp: 90, damage: 2, speed: 9, gravity: true, team: 'inimigo', deathFx: 'explosao', loot: [{ item: 'coroa_rei', chance: 1 }, { item: 'coracao_vital', chance: 1 }, { item: 'gema_rubi', chance: 1, min: 2, max: 4 }, { item: 'moeda', chance: 1, min: 40, max: 60 }], script: T()['Chefe: Rei Esqueleto'] },
    golem_gelo: { name: 'Golem de Gelo', boss: true, sprite: 'golem', sounds: { melee: 'golpe_pesado', hit: 'metal', die: 'explosao', move: 'golpe_pesado' }, sw: 40, sh: 34, w: 16, h: 30, hp: 110, damage: 2, speed: 6, gravity: true, team: 'inimigo', deathFx: 'explosao', light: { c: [0.4, 0.85, 1], r: 30, i: 0.9 }, loot: [{ item: 'martelo_glacial', chance: 1 }, { item: 'coracao_vital', chance: 1 }, { item: 'gema_safira', chance: 1, min: 2, max: 4 }, { item: 'moeda', chance: 1, min: 40, max: 60 }], script: T()['Chefe: Golem de Gelo'] },
    slime_rei: { name: 'Slime Rei', boss: true, sprite: 'slimeKing', sounds: { move: 'slime_pulo', land: 'slime_plaft', hit: 'slime_dor', die: 'gosma' }, sw: 42, sh: 26, w: 28, h: 18, hp: 60, damage: 2, speed: 12, gravity: true, team: 'inimigo', deathFx: 'gosma', loot: [{ item: 'geleia_real', chance: 1 }, { item: 'coracao_vital', chance: 1 }, { item: 'gosma', chance: 1, min: 6, max: 10 }, { item: 'moeda', chance: 1, min: 25, max: 45 }], script: T()['Chefe: Slime Rei'] },
    bau: { name: 'Baú', sprite: 'chest', sw: 13, sh: 7, w: 10, h: 6, hp: 0, damage: 0, speed: 0, gravity: true, team: 'objeto', script: T()['Baú'] },
    porta: { name: 'Porta de madeira', sprite: 'door', sw: 8, sh: 26, w: 3, h: 26, hp: 0, damage: 0, speed: 0, gravity: false, team: 'objeto', script: T().Porta },
    tocha: { name: 'Tocha', sprite: 'torch', sw: 5, sh: 8, w: 3, h: 7, hp: 0, damage: 0, speed: 0, gravity: false, team: 'objeto', emissive: true, script: T().Tocha },
    fogueira: { name: 'Fogueira (checkpoint)', sprite: 'bonfire', sw: 13, sh: 9, w: 10, h: 4, hp: 0, damage: 0, speed: 0, gravity: true, team: 'objeto', emissive: true, script: T().Fogueira },
  });

  // criaturas que andam de dia ao ar livre; as outras só à noite (ou em lugares fechados)
  E.DAY_MOBS = new Set(['slime', 'slime_gelo', 'cavaleiro']);
  const outdoors = (w, x, y) => w.skyAt(Math.floor(x), Math.floor(y)) > 120;
  let uid = 1;
  const Ents = (E.Ents = {
    list: [],

    make(prefabId, x, y, props = {}, extra = {}) {
      const def = E.Project.prefabs[prefabId];
      if (!def) return null;
      const e = {
        uid: uid++,
        kind: 'creature',
        prefab: prefabId,
        def,
        x,
        y,
        vx: 0,
        vy: 0,
        w: def.w,
        h: def.h,
        hp: def.hp,
        maxHp: def.hp,
        facing: extra.facing || 1,
        team: def.team,
        props: Object.assign({}, props),
        vars: {},
        t: Math.random(),
        anim: 'idle',
        flash: 0,
        spawnX: x,
        spawnY: y,
        light: def.light ? Object.assign({}, def.light) : null,
      };
      Object.assign(e, extra);
      e.ownScript = !!extra.script;
      e.hooks = E.Script.compile(extra.script || def.script, 'prefab ' + prefabId);
      this.list.push(e);
      if (e.hooks.onSpawn) E.Script.safe(() => e.hooks.onSpawn(e, E.API), 'onSpawn ' + prefabId);
      return e;
    },
    spawn(prefabId, x, y, props) {
      return this.make(prefabId, x, y, props);
    },

    dropItem(id, x, y, qty = 1) {
      const it = { uid: uid++, kind: 'item', item: id, qty, x, y, vx: (Math.random() - 0.5) * 20, vy: -25, w: 3, h: 2, t: Math.random() * 6, age: 0 };
      this.list.push(it);
      return it;
    },

    projectile(from, o = {}) {
      const p = G().player;
      const sx = from.x + from.facing * 2, sy = from.y - from.h * 0.6;
      let vx, vy;
      const sp = o.speed || 30;
      if (o.dx != null) {
        vx = o.dx * sp;
        vy = (o.dy || 0) * sp;
      } else {
        const tx = o.tx ?? p.x, ty = o.ty ?? p.y - p.h / 2;
        const dx = tx - sx, dy = (ty - sy) * 2, d = Math.hypot(dx, dy) || 1;
        vx = (dx / d) * sp;
        vy = ((dy / d) * sp) / 2;
        if (o.arc) vy -= Math.min(30, Math.abs(dx) * 0.35);
      }
      const pr = { uid: uid++, kind: 'proj', x: sx, y: sy, vx, vy, w: 1, h: 1, team: from.team || 'inimigo', damage: o.damage ?? 1, glyph: o.glyph || '*', color: o.color || [1, 0.8, 0.4], g: o.arc ? 45 : 0, life: o.life || 4, homing: o.homing || 0, status: o.status, light: o.light || 0, explode: o.explode, onHit: o.onHit, owner: from };
      this.list.push(pr);
      if (pr.team !== 'jogador') E.Audio.at((from.def && from.def.sounds && from.def.sounds.attack) || 'tiro', sx, sy, { vol: 0.8 });
      return pr;
    },

    damage(e, n, from) {
      if (!e || e.kind !== 'creature' || !e.maxHp || e.hp <= 0 || e.dead) return;
      if (E.Status.has(e, 'escudo')) n = 0;
      e.hp -= n;
      e.flash = 0.15;
      if (from && !e.def.boss) {
        e.vx = Math.sign(e.x - from.x || 1) * 28;
        if (e.def.gravity !== false) e.vy = -18;
      }
      if (e.hooks.onHit) E.Script.safe(() => e.hooks.onHit(e, n, E.API), 'onHit ' + e.prefab);
      E.FX.spawn('faisca', e.x, e.y - e.h / 2);
      if (e.hp > 0) {
        E.Audio.at('acerto', e.x, e.y, { vol: 0.5 });
        if (e.def.sounds && e.def.sounds.hit) E.Audio.at(e.def.sounds.hit, e.x, e.y, { gap: 0.08 });
      }
      if (e.hp <= 0) this.kill(e);
    },
    kill(e) {
      e.dead = true;
      if (e.hooks.onDeath) E.Script.safe(() => e.hooks.onDeath(e, E.API), 'onDeath ' + e.prefab);
      E.FX.spawn(e.def.deathFx || 'faisca', e.x, e.y - e.h / 2);
      E.Audio.at((e.def.sounds && e.def.sounds.die) || 'morte', e.x, e.y);
      for (const l of e.def.loot || [])
        if (Math.random() < (l.chance ?? 1)) {
          const q = (l.min || 1) + Math.floor(Math.random() * ((l.max || l.min || 1) - (l.min || 1) + 1));
          this.dropItem(l.item, e.x, e.y - 2, q);
        }
      if (e.spawner) e.spawner.alive--;
    },

    // ---------- carregar o mapa ----------
    load(world) {
      this.list = [];
      for (const d of world.entities) {
        if (d.prefab === '__item') this.dropItem(d.props.item, d.x, d.y, d.props.qty || 1).vy = 0;
        else this.make(d.prefab, d.x, d.y, d.props, { facing: d.facing || 1, script: d.script || undefined, srcId: d.id });
      }
      this.spawners = world.spawners.map((s) => ({ def: s, alive: 0, timer: 0 }));
      for (const s of this.spawners) for (let k = 0; k < (s.def.initial ?? 0); k++) this.spawnFrom(s);
      this.triggers = world.triggers.map((t) => ({ def: t, inside: false, done: false, hooks: E.Script.compile(t.script, 'gatilho ' + t.id) }));
    },
    spawnFrom(s) {
      const d = s.def, w = G().world;
      const def = E.Project.prefabs[d.prefab];
      if (!def) return;
      let x = d.x + Math.random() * d.w, y = d.y + Math.random() * d.h;
      if (def.gravity !== false) {
        // procura chão dentro (ou logo abaixo) da área
        let yy = Math.floor(d.y);
        while (yy < d.y + d.h + 20 && !E.Phys.solidBox(w, x, yy + 1, def.w, 1) && w.cellType(Math.floor(x), yy + 1) !== E.CT.ONEWAY) yy++;
        y = yy + 1;
        if (E.Phys.solidBox(w, x, y, def.w, def.h)) return;
      }
      const e = this.make(d.prefab, x, y, {});
      if (e) {
        e.spawner = s;
        s.alive++;
        E.FX.spawn('fumaca', x, y - 1);
      }
    },

    // ---------- atualização ----------
    update(dt) {
      const p = G().player, w = G().world;
      for (const e of this.list) {
        if (e.dead) continue;
        e.t += dt;
        if (e.kind === 'item') {
          e.age += dt;
          e.vy = Math.min(60, e.vy + 90 * dt);
          E.Phys.move(e, dt, w);
          if (e.onGround) e.vx *= 0.85;
          const dx = p.x - e.x, dy = p.y - p.h / 2 - e.y;
          if (e.age > 0.4 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            e.vx += Math.sign(dx) * 200 * dt;
            e.vy += Math.sign(dy) * 120 * dt;
          }
          if (e.age > 0.4 && Math.abs(dx) < 3 && Math.abs(dy) < 6 && G().inv.add(e.item, e.qty)) {
            e.dead = true;
            E.Audio.play(e.item === 'moeda' ? 'moeda' : 'item', { gap: 0.05 });
            E.UI.pickup(e.item, e.qty);
            E.FX.spawn(e.item === 'moeda' ? 'moedas' : 'faisca', e.x, e.y);
          }
          continue;
        }
        if (e.kind === 'proj') {
          e.life -= dt;
          if (e.homing && e.team === 'jogador') {
            // orbe do jogador persegue o inimigo mais próximo
            let tg = null, bd = 70;
            for (const t of this.list)
              if (t.kind === 'creature' && t.team === 'inimigo' && !t.dead) {
                const dd = Math.hypot(t.x - e.x, (t.y - t.h / 2 - e.y) * 2);
                if (dd < bd) (bd = dd), (tg = t);
              }
            if (tg) {
              const dx = tg.x - e.x, dy = tg.y - tg.h / 2 - e.y, d = Math.hypot(dx, dy * 2) || 1, sp = Math.hypot(e.vx, e.vy * 2);
              e.vx += ((dx / d) * sp - e.vx) * e.homing * 4 * dt;
              e.vy += (((dy * 2) / d) * sp * 0.5 - e.vy) * e.homing * 4 * dt;
            }
          } else if (e.homing) {
            const dx = p.x - e.x, dy = p.y - p.h / 2 - e.y, d = Math.hypot(dx, dy * 2) || 1, sp = Math.hypot(e.vx, e.vy * 2);
            e.vx += ((dx / d) * sp - e.vx) * e.homing * dt;
            e.vy += (((dy * 2) / d) * sp * 0.5 - e.vy) * e.homing * dt;
          }
          e.vy += e.g * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.arrow) {
            // a flecha gira com a trajetória
            const an = ((Math.atan2(e.vy * 2, e.vx) % Math.PI) + Math.PI) % Math.PI;
            e.glyph = an < 0.39 || an > 2.75 ? '-' : an < 1.18 ? '\\' : an < 1.96 ? '|' : '/';
          }
          let hit = w.solid(Math.floor(e.x), Math.floor(e.y)) || e.life <= 0;
          if (e.team !== 'jogador') {
            if (Math.abs(p.x - e.x) < p.w / 2 + 0.5 && e.y > p.y - p.h && e.y < p.y + 0.5) {
              G().hurtPlayer(e.damage, e);
              if (e.status) E.Status.add(p, e.status, 3);
              hit = true;
            }
          } else
            for (const t of this.list)
              if (t.kind === 'creature' && t.team === 'inimigo' && !t.dead && Math.abs(t.x - e.x) < t.w / 2 + 0.5 && e.y > t.y - t.h && e.y < t.y + 0.5) {
                hit = true;
                if (!e.explode) {
                  this.damage(t, e.damage, e);
                  if (e.status) E.Status.add(t, e.status, 3);
                  t.vx += Math.sign(e.vx) * 15;
                  E.Audio.play('acerto', { gap: 0.04 });
                }
                break;
              }
          if (hit) {
            e.dead = true;
            if (e.explode) this.explode(e.x, e.y, e.explode);
            else E.FX.spawn('faisca', e.x, e.y);
          }
          continue;
        }
        // criaturas
        const def = e.def;
        // ao amanhecer, bichos noturnos fora da tela desaparecem
        if (G().isDay && e.spawner && e.team === 'inimigo' && !E.DAY_MOBS.has(e.prefab) && !G().inView(e.x, e.y, 15) && outdoors(w, e.x, e.y - 2)) {
          e.dead = true;
          e.spawner.alive--;
          continue;
        }
        if (e.flash > 0) e.flash -= dt;
        if (e.sayT > 0) e.sayT -= dt;
        E.Status.update(e, dt, (n) => this.damage(e, n), (n) => (e.hp = Math.min(e.maxHp, e.hp + n)));
        if (e.hooks.onUpdate && !(e.stun > 0)) E.Script.safe(() => e.hooks.onUpdate(e, dt, E.API), 'onUpdate ' + e.prefab);
        if (e.stun > 0) e.stun -= dt;
        if (def.gravity !== false) e.vy = Math.min(70, e.vy + 120 * dt);
        // nasceu encravada no terreno (corpo largo em chão irregular): sobe até ficar livre
        if (E.Phys.solidBox(w, e.x, e.y, e.w, e.h))
          for (let k = 1; k <= 12; k++)
            if (!E.Phys.solidBox(w, e.x, e.y - k, e.w, e.h)) {
              e.y -= k;
              break;
            }
        const wasG = e.onGround;
        // corpos largos (chefes) sobem degraus maiores do terreno
        E.Phys.move(e, dt, w, { step: Math.max(2, Math.ceil(e.w / 7)) });
        // sons da criatura: parado (aleatório), movimento (ritmado), pulo/aterrissagem
        const S = def.sounds;
        if (S && G().inView(e.x, e.y, 20)) {
          if (S.idle && Math.random() < dt * 0.22) E.Audio.at(S.idle, e.x, e.y, { gap: 0.4 });
          if (S.move) {
            const moving = def.gravity === false ? Math.hypot(e.vx, e.vy) > 3 : e.onGround && Math.abs(e.vx) > 2;
            e.moveT = (e.moveT || 0) + dt;
            if (S.move === 'slime_pulo') {
              if (wasG && !e.onGround && e.vy < -5) E.Audio.at('slime_pulo', e.x, e.y);
            } else if (moving && e.moveT > (S.move === 'morcego_asas' ? 0.12 : S.move === 'aranha_passos' ? 0.16 : 0.45)) {
              e.moveT = 0;
              E.Audio.at(S.move, e.x, e.y, { vol: 0.6, gap: 0.05 });
            }
          }
          if (S.land && !wasG && e.onGround) E.Audio.at(S.land, e.x, e.y);
        }
        if (def.gravity === false) {
          e.vx *= Math.pow(0.4, dt);
          e.vy *= Math.pow(0.4, dt);
        }
        if (e.inHazard && def.gravity !== false && e.maxHp) this.damage(e, 1);
        if (e.y > w.H + 30) e.dead = true;
        // contato com o jogador
        const dx = p.x - e.x, dy = p.y - e.y;
        const touching = Math.abs(dx) < (e.w + p.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y;
        if (touching) {
          if (def.damage > 0 && e.team === 'inimigo') G().hurtPlayer(def.damage, e);
          if (e.hooks.onTouch) E.Script.safe(() => e.hooks.onTouch(e, p, E.API), 'onTouch ' + e.prefab);
        }
      }
      this.list = this.list.filter((e) => !e.dead);
      // spawners
      for (const s of this.spawners || []) {
        const d = s.def;
        if (!d.active) continue;
        const near = !d.range || Math.abs(p.x - (d.x + d.w / 2)) < d.range;
        if ((d.period === 'noite' && G().isDay) || (d.period === 'dia' && !G().isDay)) continue;
        if (G().isDay && !E.DAY_MOBS.has(d.prefab) && E.Project.prefabs[d.prefab]?.team === 'inimigo' && outdoors(w, d.x + d.w / 2, d.y + d.h / 2)) continue;
        if (!near || s.alive >= d.max) continue;
        s.timer += dt;
        if (s.timer >= d.interval) {
          s.timer = 0;
          this.spawnFrom(s);
        }
      }
      // gatilhos
      for (const t of this.triggers || []) {
        if (t.done) continue;
        const d = t.def;
        const inside = p.x > d.x && p.x < d.x + d.w && p.y > d.y && p.y - p.h < d.y + d.h;
        if (inside && !t.inside && t.hooks.onEnter) E.Script.safe(() => t.hooks.onEnter(E.API), 'gatilho ' + d.id);
        if (inside && t.hooks.onStay) E.Script.safe(() => t.hooks.onStay(E.API, dt), 'gatilho ' + d.id);
        if (!inside && t.inside) {
          if (t.hooks.onExit) E.Script.safe(() => t.hooks.onExit(E.API), 'gatilho ' + d.id);
          if (d.once) t.done = true;
        }
        t.inside = inside;
      }
    },

    explode(x, y, o) {
      E.FX.spawn(o.fx || 'explosao', x, y);
      E.Audio.at('explosao', x, y, { range: 300 });
      const r = o.radius || 10;
      for (const e of this.list)
        if (e.kind === 'creature' && Math.hypot(e.x - x, (e.y - e.h / 2 - y) * 2) < r) {
          this.damage(e, o.damage || 2, { x, y });
          if (o.status && e.maxHp) E.Status.add(e, o.status, 4);
        }
      const p = G().player;
      if (Math.hypot(p.x - x, (p.y - p.h / 2 - y) * 2) < r * 0.7) G().hurtPlayer(1, { x, y });
      // destrói terreno fraco (terra, folhas, madeira)
      const w = G().world;
      if (o.dig === false) return;
      for (let yy = -r / 2; yy <= r / 2; yy++)
        for (let xx = -r; xx <= r; xx++) {
          if (xx * xx + yy * yy * 4 > r * r * 0.5) continue;
          const cx = Math.round(x + xx), cy = Math.round(y + yy);
          const m = w.get('main', cx, cy);
          if (m === E.MAT.DIRT || m === E.MAT.LEAVES || m === E.MAT.WOOD || m === E.MAT.GRASS || m === E.MAT.MOSS) w.set('main', cx, cy, 0);
        }
      w.computeSurface(Math.floor(x - r), Math.ceil(x + r));
    },

    // entidade interativa mais próxima do jogador (para a tecla E)
    interactable() {
      const p = G().player;
      let best = null, bd = 12;
      for (const e of this.list) {
        if (e.kind !== 'creature' || !e.hooks.onInteract) continue;
        const d = Math.hypot(e.x - p.x, (e.y - p.y) * 2);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    },
  });
})();

'use strict';
// Projeto: mapas + prefabs (criaturas/objetos) + itens + ajuste do jogador. Salva/abre tudo em um JSON.
(function () {
  const E = window.ENG;
  const KEY = 'asciiengine.project.v15';

  E.Project = { name: 'Meu jogo', prefabs: {}, items: {}, player: {}, worlds: {}, startMap: 'fase1', current: 'fase1' };

  E.ProjectIO = {
    createDefault() {
      const P = E.Project;
      P.name = 'Floresta das Ruínas';
      P.prefabs = E.defaultPrefabs();
      P.items = JSON.parse(JSON.stringify(E.DEFAULT_ITEMS));
      P.player = Object.assign({}, E.DEFAULT_PLAYER);
      // um mapa só: as masmorras ficam no subsolo profundo do próprio mundo
      P.worlds = { fase1: E.generateWorld(1) };
      P.startMap = P.current = 'fase1';
    },
    // liga a porta do mundo que leva à masmorra com a porta de saída dela (ida e volta)
    linkCave(w, c) {
      const door = w.entities.find((e) => e.prefab === 'porta' && e.props && e.props.destino === c.id);
      if (door) Object.assign(door.props, { x: c.spawn.x, y: c.spawn.y });
      const exit = c.entities.find((e) => e.id === 'saida');
      if (exit && door) Object.assign(exit.props, { destino: w.id || 'fase1', x: door.x + 8, y: door.y });
    },
    toJSON() {
      const P = E.Project;
      const maps = {};
      for (const [id, w] of Object.entries(P.worlds)) maps[id] = w.toJSON();
      const prefabs = {};
      for (const [id, d] of Object.entries(P.prefabs)) {
        const { _v, ...rest } = d;
        prefabs[id] = rest;
      }
      return { format: 'asciiengine-project@2', name: P.name, startMap: P.startMap, player: P.player, prefabsV: 2, prefabs, items: P.items, maps };
    },
    fromJSON(o) {
      if (o.format === 'asciiforge-world@1' || o.format === 'asciiforge-world@2') {
        // mapa avulso: adiciona ao projeto atual
        const w = E.World.fromJSON(o);
        let id = w.id || 'mapa';
        while (E.Project.worlds[id]) id += '_';
        w.id = id;
        E.Project.worlds[id] = w;
        return w;
      }
      if (o.format !== 'asciiengine-project@2') throw new Error('formato desconhecido');
      const P = E.Project;
      P.name = o.name;
      P.startMap = o.startMap;
      P.player = Object.assign({}, E.DEFAULT_PLAYER, o.player);
      // projetos antigos: herói mais rápido (velocidade e aceleração antigas viram as novas, se não foram mudadas)
      if ((o.player && o.player.v) !== E.DEFAULT_PLAYER.v) {
        if (P.player.speed === 38) P.player.speed = E.DEFAULT_PLAYER.speed;
        if (P.player.accel === 380) P.player.accel = E.DEFAULT_PLAYER.accel;
        if (P.player.airAccel === 250) P.player.airAccel = E.DEFAULT_PLAYER.airAccel;
        P.player.v = E.DEFAULT_PLAYER.v;
      }
      // criaturas e itens novos da engine entram em projetos antigos sem sobrescrever os do usuário
      P.prefabs = Object.assign(E.defaultPrefabs(), o.prefabs);
      // prefabs da engine em projetos antigos: pessoas e humanoides na escala do herói, visual novo e porta mais alta
      if ((o.prefabsV || 0) < 2) {
        const D = E.defaultPrefabs();
        for (const [id, d] of Object.entries(D)) {
          const p = o.prefabs && o.prefabs[id] && P.prefabs[id];
          if (!p || !(d.sprite === 'person' || ['esqueleto', 'esqueleto_guerreiro', 'cavaleiro', 'porta'].includes(id))) continue;
          Object.assign(p, { sw: d.sw, sh: d.sh, h: d.h, sprite: d.sprite });
          if (d.look) p.look = d.look;
          if (d.light) p.light = d.light;
          if (id === 'porta' && p.script) p.script = p.script.replace(/- 19, 3, 19,/g, '- self.def.h, 3, self.def.h,');
        }
      }
      P.items = Object.assign(JSON.parse(JSON.stringify(E.DEFAULT_ITEMS)), o.items);
      // armas da engine em projetos antigos: ganham o visual novo (rastro, aura, efeito de acerto) sem perder o resto
      const OLD_FX = { magia: 'gelo', fogo: 'chama' };
      for (const [id, d] of Object.entries(E.DEFAULT_ITEMS)) {
        const w = P.items[id] && P.items[id].weapon, dw = d.weapon;
        if (!w || !dw || w === dw || !dw.elem && !dw.size && !dw.tint) continue;
        if (w.elem === undefined) {
          for (const k of ['elem', 'aura', 'tint', 'layers', 'size']) if (dw[k] !== undefined) w[k] = dw[k];
          if (dw.fx && (!w.fx || OLD_FX[w.fx] === dw.fx)) w.fx = dw.fx;
          if (id === 'espada_cavaleiro') Object.assign(P.items[id], { color: d.color, desc: d.desc, icon: d.icon }), (w.color = dw.color);
        }
      }
      P.worlds = {};
      for (const [id, m] of Object.entries(o.maps)) {
        P.worlds[id] = E.World.fromJSON(m);
        P.worlds[id].id = id;
        // chefes só existem no salão de cada masmorra (remove os que o criativo deixou salvos)
        P.worlds[id].entities = P.worlds[id].entities.filter((e) => !(P.prefabs[e.prefab] && P.prefabs[e.prefab].boss && !String(e.id).startsWith('chefe')));
      }
      E.Script.clearCache();
      E.clearSpriteCache();
      return P.worlds[P.startMap] || Object.values(P.worlds)[0];
    },
    saveLocal() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.toJSON()));
        return true;
      } catch (e) {
        return false;
      }
    },
    loadLocal() {
      try {
        const s = localStorage.getItem(KEY);
        return s ? this.fromJSON(JSON.parse(s)) : null;
      } catch (e) {
        console.warn('projeto local inválido', e);
        return null;
      }
    },
    clearLocal() {
      try {
        localStorage.removeItem(KEY);
      } catch (e) {}
    },
  };
})();

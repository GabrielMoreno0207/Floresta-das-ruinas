'use strict';
// Projeto: mapas + prefabs (criaturas/objetos) + itens + ajuste do jogador. Salva/abre tudo em um JSON.
(function () {
  const E = window.ENG;
  const KEY = 'asciiengine.project.v9';

  E.Project = { name: 'Meu jogo', prefabs: {}, items: {}, player: {}, worlds: {}, startMap: 'fase1', current: 'fase1' };

  E.ProjectIO = {
    createDefault() {
      const P = E.Project;
      P.name = 'Floresta das Ruínas';
      P.prefabs = E.defaultPrefabs();
      P.items = JSON.parse(JSON.stringify(E.DEFAULT_ITEMS));
      P.player = Object.assign({}, E.DEFAULT_PLAYER);
      const w = E.generateWorld(1);
      P.worlds = { fase1: w };
      const caves = { caverna: [7, 'pedra'], catacumbas: [11, 'areia'], covil: [17, 'fungo'], gruta_gelada: [13, 'gelo'] };
      for (const [id, [seed, theme]] of Object.entries(caves)) {
        const c = E.generateCave(seed, { theme });
        c.id = id;
        P.worlds[id] = c;
        E.ProjectIO.linkCave(w, c);
      }
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
      return { format: 'asciiengine-project@2', name: P.name, startMap: P.startMap, player: P.player, prefabs, items: P.items, maps };
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
      // criaturas e itens novos da engine entram em projetos antigos sem sobrescrever os do usuário
      P.prefabs = Object.assign(E.defaultPrefabs(), o.prefabs);
      P.items = Object.assign(JSON.parse(JSON.stringify(E.DEFAULT_ITEMS)), o.items);
      P.worlds = {};
      for (const [id, m] of Object.entries(o.maps)) {
        P.worlds[id] = E.World.fromJSON(m);
        P.worlds[id].id = id;
        // chefes só existem no salão de cada masmorra (remove os que o criativo deixou salvos)
        P.worlds[id].entities = P.worlds[id].entities.filter((e) => !(P.prefabs[e.prefab] && P.prefabs[e.prefab].boss && e.id !== 'chefe'));
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

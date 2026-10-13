'use strict';
// Modo criativo (tecla C, durante o jogo): coloca criaturas, tochas e objetos onde clicar. Fica salvo no mapa.
(function () {
  const E = window.ENG;
  const G = () => E.Game;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ORDER = ['aranha', 'esqueleto_guerreiro', 'esqueleto', 'slime', 'morcego', 'espirito', 'escorpiao', 'slime_gelo', 'cavaleiro', 'mercador', 'ferreiro', 'alquimista', 'armeiro', 'pescador', 'aldeao', 'aldea', 'guarda', 'rainha_aranha', 'rei_esqueleto', 'golem_gelo', 'slime_rei', 'tocha', 'fogueira', 'bau', 'porta', 'npc'];

  const C = (E.Creative = {
    active: false,
    sel: 0,
    list() {
      const P = E.Project.prefabs;
      return [...ORDER.filter((k) => P[k]), ...Object.keys(P).filter((k) => !ORDER.includes(k))];
    },
    toggle(on = !this.active) {
      if (on && !E.Options.creative) return E.UI.message('Ative o modo criativo em Opções.');
      this.active = on;
      $('#creative').classList.toggle('open', on);
      document.body.classList.toggle('creative', on);
      E.Audio.play(on ? 'ok' : 'menu');
      this.render();
    },
    render() {
      if (!this.active) return;
      const P = E.Project.prefabs, list = this.list();
      const L = list.map((k, i) => {
        const on = i === this.sel;
        const key = i < 9 ? String(i + 1) : i === 9 ? '0' : ' ';
        return `<span data-ci="${i}" class="mi">${on ? '<span class="acc">▶</span>' : ' '} <span class="fr">${key}</span> <span class="${on ? 'acc' : ''}">${esc(P[k].name)}</span></span>`;
      });
      L.push('---', '<span class="fr">clique</span>   colocar', '<span class="fr">direito</span>  remover', '<span class="fr">roda/1-0</span> escolher', '<span class="fr">C/Esc</span>    sair');
      $('#creative').innerHTML = `<pre class="ascii">${E.asciiBox('CRIATIVO', L, 26, 'single')}</pre>`;
    },
    // posição de colocação: criaturas com gravidade descem até o chão; tochas ficam onde o mouse está
    target() {
      const m = G().mouse;
      if (!m) return null;
      const def = E.Project.prefabs[this.list()[this.sel]];
      let x = Math.round(m.x), y = Math.round(m.y);
      if (def.gravity !== false) {
        const w = G().world;
        let yy = Math.floor(m.y);
        while (yy < w.H - 1 && !w.solid(x, yy + 1) && w.cellType(x, yy + 1) !== E.CT.ONEWAY) yy++;
        y = yy + 1;
        // corpos largos: sobe até a caixa inteira caber sem tocar o terreno
        for (let k = 0; k < 14 && E.Phys.solidBox(w, x, y, def.w, def.h); k++) y--;
      } else y += Math.round((def.sh || def.h) / 2);
      return { x, y, def };
    },
    place() {
      const t = this.target();
      if (!t) return;
      const id = this.list()[this.sel];
      const w = G().world;
      const d = { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 99), prefab: id, x: t.x, y: t.y, facing: G().player.x > t.x ? 1 : -1, props: {} };
      // chefes do criativo são só para testar: não ficam salvos no mapa
      const boss = E.Project.prefabs[id] && E.Project.prefabs[id].boss;
      if (!boss) w.entities.push(d);
      const e = E.Ents.make(id, d.x, d.y, d.props, { facing: d.facing, srcId: boss ? undefined : d.id });
      // no criativo o chefe aparece mesmo que já tenha sido derrotado no seu progresso
      if (e && e.def.boss && e.dead) e.dead = false;
      E.FX.spawn('fumaca', t.x, t.y - 2);
      E.Audio.at('colocar', t.x, t.y);
    },
    remove() {
      const m = G().mouse;
      if (!m) return;
      let best = null, bd = 10;
      for (const e of E.Ents.list) {
        if (e.kind !== 'creature') continue;
        const d = Math.hypot(e.x - m.x, (e.y - (e.def.sh || e.h) / 2 - m.y) * 2);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) return;
      best.dead = true;
      if (best.spawner) best.spawner.alive--;
      const w = G().world;
      if (best.srcId) w.entities = w.entities.filter((d) => d.id !== best.srcId);
      E.FX.spawn('fumaca', best.x, best.y - 2);
      E.Audio.at('menu', best.x, best.y);
    },
    init() {
      window.addEventListener('keydown', (e) => {
        if (e.target.matches && e.target.matches('input,select,textarea')) return;
        if ((E.Editor && E.Editor.active) || E.UI.menuOpen || E.UI.invOpen) return;
        if (e.code === 'KeyC') this.toggle();
        if (!this.active) return;
        const m = e.code.match(/^Digit(\d)$/);
        if (m) {
          const n = m[1] === '0' ? 9 : +m[1] - 1;
          if (n < this.list().length) {
            this.sel = n;
            E.Audio.play('menu');
            this.render();
          }
        }
      });
      window.addEventListener('wheel', (e) => {
        if (!this.active || (E.Editor && E.Editor.active)) return;
        const n = this.list().length;
        this.sel = (this.sel + (e.deltaY > 0 ? 1 : -1) + n) % n;
        E.Audio.play('menu', { gap: 0.03 });
        this.render();
      });
      window.addEventListener('mousedown', (e) => {
        if (!this.active || (E.Editor && E.Editor.active) || E.UI.menuOpen) return;
        if (e.target.closest && e.target.closest('#creative,#uiHot,#uiInv,#menu')) {
          const it = e.target.closest('[data-ci]');
          if (it) {
            this.sel = +it.dataset.ci;
            this.render();
          }
          return;
        }
        if (e.button === 0) this.place();
        if (e.button === 2) this.remove();
      });
      window.addEventListener('contextmenu', (e) => this.active && e.preventDefault());
    },
  });
})();

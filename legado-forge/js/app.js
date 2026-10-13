'use strict';
// Aplicação: projeto, barra lateral de assets, abas, zoom, persistência.
(function () {
  const AF = window.AF;
  const $ = (s, r = document) => r.querySelector(s);
  const STORE = 'asciiforge.project.v1';

  AF.project = null;
  AF.assetIndex = (p) => {
    const o = {};
    for (const a of p.assets) o[a.id] = a;
    return o;
  };
  AF.currentAsset = () => AF.project.assets.find((a) => a.id === AF.project.sel) || null;
  AF.currentMap = () => AF.project.maps.find((m) => m.id === AF.project.mapSel) || AF.project.maps[0] || null;

  AF.toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  };
  // botão que pede um segundo clique para confirmar (sem diálogos do navegador)
  AF.confirmBtn = (btn, fn) => {
    const label = btn.textContent;
    btn.onclick = () => {
      if (btn.dataset.armed) {
        delete btn.dataset.armed;
        btn.textContent = label;
        fn();
        return;
      }
      btn.dataset.armed = '1';
      btn.textContent = 'confirmar?';
      setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = label;
      }, 2500);
    };
  };
  AF.thumbHTML = (a, size = 6) => {
    const g = a.anims[0].frames[0];
    const s = Math.max(2, Math.min(size, Math.floor(160 / Math.max(1, g.w)), Math.floor(60 / Math.max(1, g.h))));
    return `<img src="${AF.renderGridCanvas(g, s).toDataURL()}" alt="">`;
  };

  let saveTimer = 0;
  AF.markDirty = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify(AF.project));
        $('#saveState').textContent = 'salvo localmente';
      } catch (e) {
        $('#saveState').textContent = 'não foi possível salvar (use Exportar)';
      }
    }, 600);
    $('#saveState').textContent = '…';
  };

  function freshProject(withStarter) {
    const p = { version: 1, name: 'Meu jogo ASCII', assets: [], maps: [], sel: null, mapSel: null, font: { family: AF.view.family, lineHeight: AF.view.lineHeight, zoom: 18 } };
    if (withStarter) {
      const A = AF.starterPack();
      p.assets = Object.values(A);
      const M = AF.demoMap(A);
      p.maps = [M];
      p.sel = A.hero.id;
      p.mapSel = M.id;
    } else {
      const M = AF.newMap();
      p.maps = [M];
      p.mapSel = M.id;
    }
    return p;
  }

  const KINDS = [
    ['sprite', 'Sprites', 5, 5],
    ['tile', 'Tiles', 6, 3],
    ['fx', 'Efeitos (FX)', 3, 3],
    ['prop', 'Decoração', 8, 6],
    ['bg', 'Fundos (parallax)', 120, 12],
  ];

  AF.App = {
    view: 'map',
    zoom: () => AF.project.font.zoom,

    init() {
      let p = null;
      try {
        p = JSON.parse(localStorage.getItem(STORE) || 'null');
      } catch (e) {
        p = null;
      }
      AF.project = p && p.assets ? p : freshProject(true);
      this.applyFont();
      AF.Editor.init($('#view-editor'));
      AF.Convert.init($('#view-convert'));
      AF.Map.init($('#view-map'));
      AF.Export.init($('#view-export'));
      AF.Generator.init();

      $('#tabs').onclick = (e) => {
        const b = e.target.closest('[data-view]');
        if (b) this.show(b.dataset.view);
      };
      $('#zoom').value = AF.project.font.zoom;
      $('#zoom').oninput = (e) => {
        AF.project.font.zoom = +e.target.value;
        $('#zoomVal').textContent = e.target.value + 'px';
        AF.Convert.lastRes = null;
        AF.markDirty();
      };
      $('#zoomVal').textContent = AF.project.font.zoom + 'px';
      $('#fontSel').value = AF.project.font.family;
      if ($('#fontSel').value !== AF.project.font.family) $('#fontSel').selectedIndex = 0;
      $('#fontSel').onchange = (e) => {
        AF.project.font.family = e.target.value;
        this.applyFont();
        AF.markDirty();
        this.refreshAll();
      };
      $('#lhSel').value = String(AF.project.font.lineHeight);
      $('#lhSel').onchange = (e) => {
        AF.project.font.lineHeight = +e.target.value;
        this.applyFont();
        AF.markDirty();
        this.refreshAll();
      };
      $('#projName').value = AF.project.name;
      $('#projName').onchange = (e) => {
        AF.project.name = e.target.value || 'Meu jogo ASCII';
        AF.markDirty();
      };
      AF.confirmBtn($('#btnNew'), () => {
        AF.project = freshProject(false);
        this.afterLoad();
      });
      $('#btnStarter').onclick = () => {
        const A = AF.starterPack();
        AF.project.assets.push(...Object.values(A));
        const M = AF.demoMap(A);
        AF.project.maps.push(M);
        AF.project.mapSel = M.id;
        AF.markDirty();
        this.refreshAll();
        AF.toast('Starter pack + mapa demo adicionados');
      };

      // barra lateral
      $('#assetList').onclick = (e) => {
        const add = e.target.closest('[data-add]');
        if (add) {
          const [kind, , w, h] = KINDS.find((k) => k[0] === add.dataset.add);
          const a = AF.newAsset(kind, 'novo ' + kind, w, h);
          AF.project.assets.push(a);
          this.select(a.id);
          AF.markDirty();
          return;
        }
        const it = e.target.closest('[data-id]');
        if (it) {
          this.select(it.dataset.id);
          if (this.view === 'map' || this.view === 'export') return this.view === 'export' && AF.Export.refresh();
          this.show('editor');
        }
      };
      $('#assetList').ondblclick = (e) => {
        if (e.target.closest('[data-id]')) this.show('editor');
      };
      $('#btnGen').onclick = () => AF.Generator.open();
      $('#btnDupAsset').onclick = () => {
        const a = AF.currentAsset();
        if (!a) return;
        const c = AF.deepClone(a);
        c.id = AF.uid();
        c.name += ' copia';
        AF.project.assets.push(c);
        this.select(c.id);
        AF.markDirty();
      };
      AF.confirmBtn($('#btnDelAsset'), () => {
        const a = AF.currentAsset();
        if (!a) return;
        AF.project.assets = AF.project.assets.filter((x) => x !== a);
        for (const M of AF.project.maps) {
          M.tiles = M.tiles.map((id) => (id === a.id ? null : id));
          M.entities = M.entities.filter((e) => e.assetId !== a.id);
          M.layers = M.layers.filter((l) => l.assetId !== a.id);
        }
        AF.project.sel = AF.project.assets[0]?.id || null;
        AF.markDirty();
        this.refreshAll();
      });
      $('#mapList').onclick = (e) => {
        if (e.target.closest('#btnAddMap')) {
          const M = AF.newMap('Fase ' + (AF.project.maps.length + 1));
          AF.project.maps.push(M);
          AF.project.mapSel = M.id;
        } else if (e.target.closest('#btnDelMap')) {
          if (AF.project.maps.length <= 1) return AF.toast('O projeto precisa de ao menos um mapa');
          if (!e.target.dataset.armed) {
            e.target.dataset.armed = 1;
            e.target.textContent = 'confirmar?';
            setTimeout(() => {
              delete e.target.dataset.armed;
              e.target.textContent = '✕';
            }, 2500);
            return;
          }
          AF.project.maps = AF.project.maps.filter((m) => m.id !== AF.project.mapSel);
          AF.project.mapSel = AF.project.maps[0].id;
        } else {
          const it = e.target.closest('[data-map]');
          if (!it) return;
          AF.project.mapSel = it.dataset.map;
          this.show('map');
        }
        AF.markDirty();
        this.refreshAll();
      };
      this.afterLoad();
      this.show(this.view);
    },

    applyFont() {
      AF.view.family = AF.project.font.family || AF.view.family;
      AF.view.lineHeight = AF.project.font.lineHeight || 1.2;
      AF.resetMetrics();
    },

    afterLoad() {
      this.applyFont();
      $('#projName').value = AF.project.name;
      $('#zoom').value = AF.project.font.zoom;
      $('#zoomVal').textContent = AF.project.font.zoom + 'px';
      AF.markDirty();
      this.refreshAll();
    },

    importJSON(o) {
      if (o.format === 'asciiforge-asset@1') {
        const a = AF.decodeAsset(o);
        AF.project.assets.push(a);
        this.select(a.id);
      } else if (o.format === 'asciiforge-pack@1') {
        o.assets.forEach((x) => AF.project.assets.push(AF.decodeAsset(x)));
      } else if (o.assets && o.maps) {
        AF.project = o;
        AF.project.font ||= { family: AF.view.family, lineHeight: 1.2, zoom: 18 };
        return this.afterLoad(), AF.toast('Projeto aberto');
      } else throw new Error('formato desconhecido');
      AF.markDirty();
      this.refreshAll();
      AF.toast('Importado');
    },

    select(id) {
      if (AF.project.sel !== id) {
        AF.edState.anim = 0;
        AF.edState.frame = 0;
      }
      AF.project.sel = id;
      this.refreshAll();
    },

    show(v) {
      this.view = v;
      document.querySelectorAll('#tabs [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
      document.querySelectorAll('.view').forEach((el) => el.classList.toggle('on', el.id === 'view-' + v));
      if (v === 'editor') AF.Editor.refresh();
      if (v === 'map') AF.Map.refresh();
      if (v === 'export') AF.Export.refresh();
    },

    refreshAll() {
      this.refreshAssets();
      AF.Editor.refresh();
      AF.Map.refresh();
    },

    refreshAssets() {
      const P = AF.project;
      $('#assetList').innerHTML = KINDS.map(([kind, label]) => {
        const items = P.assets.filter((a) => a.kind === kind);
        return `<div class="grp"><div class="grp-h"><span>${label}</span><button data-add="${kind}" title="novo">+</button></div>
          ${items
            .map(
              (a) => `<div class="asset ${a.id === P.sel ? 'on' : ''}" data-id="${a.id}">${AF.thumbHTML(a)}<div><b>${a.name}</b><small>${a.w}×${a.h} · ${a.anims.length} anim · ${a.anims.reduce((s, x) => s + x.frames.length, 0)} q${a.emissive ? ' · ☼' : ''}${a.solid ? ' · ▦' : ''}${a.foliage ? ' · ≀' : ''}</small></div></div>`
            )
            .join('')}</div>`;
      }).join('');
      $('#mapList').innerHTML =
        `<div class="grp-h"><span>Mapas</span><span><button id="btnDelMap" title="apagar mapa atual">✕</button><button id="btnAddMap" title="novo mapa">+</button></span></div>` +
        P.maps.map((m) => `<div class="asset ${m.id === AF.currentMap()?.id ? 'on' : ''}" data-map="${m.id}"><div><b>${m.name}</b><small>${m.w}×${m.h} tiles · ${m.lights.length} luzes</small></div></div>`).join('');
    },
  };

  window.addEventListener('DOMContentLoaded', () => AF.App.init());
})();

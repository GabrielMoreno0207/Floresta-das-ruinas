'use strict';
// Exportação: projeto, assets em JSON compacto para engine, TXT, PNG spritesheet e mapa.
(function () {
  const AF = window.AF;
  const $ = (s, r = document) => r.querySelector(s);

  const CODES = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~';

  AF.download = (name, data, type = 'application/json') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').toLowerCase();

  // formato "asciiforge-asset@1": linhas de texto + linhas de índices de paleta ('.' = sem cor)
  AF.encodeAsset = (a) => {
    // 1ª passada: paleta; com mais de 89 cores cada célula usa 2 caracteres ("codeWidth": 2)
    const pal = [], idx = new Map();
    const add = (hex) => hex && !idx.has(hex) && (idx.set(hex, pal.length), pal.push(hex));
    for (const an of a.anims) for (const g of an.frames) for (const c of g.cells) {
      if (c.c != null && c.c !== ' ') add(c.f);
      add(c.b);
    }
    const W = pal.length <= CODES.length ? 1 : 2, N = CODES.length;
    const none = '.'.repeat(W);
    const code = (hex) => {
      if (!hex) return none;
      const i = idx.get(hex);
      return W === 1 ? CODES[i] : CODES[Math.floor(i / N)] + CODES[i % N];
    };
    const anims = {};
    for (const an of a.anims) {
      anims[an.name] = {
        fps: an.fps,
        loop: an.loop !== false,
        frames: an.frames.map((g) => {
          const chars = [], fg = [], bg = [];
          for (let y = 0; y < g.h; y++) {
            let c = '', f = '', b = '';
            for (let x = 0; x < g.w; x++) {
              const cell = g.cells[y * g.w + x];
              const empty = cell.c == null || cell.c === ' ';
              c += empty ? ' ' : cell.c;
              f += empty ? none : code(cell.f);
              b += code(cell.b);
            }
            chars.push(c);
            fg.push(f);
            bg.push(b);
          }
          return { chars, fg, bg };
        }),
      };
    }
    const out = { format: 'asciiforge-asset@1', name: a.name, kind: a.kind, w: a.w, h: a.h, solid: !!a.solid, emissive: !!a.emissive, codeWidth: W, codes: CODES, palette: pal, anims };
    if (a.foliage) out.foliage = true;
    return out;
  };

  AF.decodeAsset = (o) => {
    const W = o.codeWidth || 1, codes = o.codes || CODES, N = codes.length;
    const idxAt = (row, x) => {
      const s = (row || '').substr(x * W, W);
      if (s.length < W || s[0] === '.') return -1;
      return W === 1 ? codes.indexOf(s) : codes.indexOf(s[0]) * N + codes.indexOf(s[1]);
    };
    const a = { id: AF.uid(), name: o.name, kind: o.kind || 'sprite', w: o.w, h: o.h, solid: !!o.solid, emissive: !!o.emissive, foliage: !!o.foliage, anims: [] };
    for (const [name, an] of Object.entries(o.anims)) {
      a.anims.push({
        name,
        fps: an.fps || 6,
        loop: an.loop !== false,
        frames: an.frames.map((fr) => {
          const g = AF.Grid.create(o.w, o.h);
          for (let y = 0; y < o.h; y++) {
            const cs = [...(fr.chars[y] || '')];
            for (let x = 0; x < o.w; x++) {
              const c = cs[x] ?? ' ', fi = idxAt(fr.fg[y], x), bi = idxAt(fr.bg[y], x);
              const b = bi >= 0 ? o.palette[bi] : null;
              if (c === ' ' && !b) continue;
              g.cells[y * o.w + x] = { c, f: fi >= 0 ? o.palette[fi] : '#ffffff', b };
            }
          }
          return g;
        }),
      });
    }
    return a;
  };

  AF.encodeMap = (M) => {
    const byId = AF.assetIndex(AF.project);
    const names = [...new Set(M.tiles.filter(Boolean))];
    const key = {};
    names.forEach((id, i) => (key[id] = CODES[i + 1] || '?'));
    const rows = [];
    for (let y = 0; y < M.h; y++) rows.push(M.tiles.slice(y * M.w, (y + 1) * M.w).map((id) => (id ? key[id] : '.')).join(''));
    return {
      format: 'asciiforge-map@1',
      name: M.name,
      w: M.w,
      h: M.h,
      tileW: M.tileW,
      tileH: M.tileH,
      legend: Object.fromEntries(names.map((id) => [key[id], byId[id]?.name])),
      tiles: rows,
      entities: M.entities.map((e) => ({ asset: byId[e.assetId]?.name, anim: e.anim, x: e.x, y: e.y, flip: !!e.flip, player: !!e.player })),
      lights: M.lights.map(({ x, y, color, radius, intensity, flicker, mode }) => ({ x, y, color, radius, intensity, flicker, mode })),
      layers: M.layers.map((L) => ({ asset: byId[L.assetId]?.name, parallax: L.parallax, y: L.y || 0 })),
      background: M.bgColor,
      ambient: M.ambient,
      fx: M.fx,
    };
  };

  // spritesheet: cada animação numa linha, quadros lado a lado
  AF.spriteSheet = (a, size) => {
    const m = AF.metrics(size);
    const fw = a.w * m.cw, fh = a.h * m.ch;
    const cols = Math.max(...a.anims.map((x) => x.frames.length));
    const cv = document.createElement('canvas');
    cv.width = fw * cols;
    cv.height = fh * a.anims.length;
    const ctx = cv.getContext('2d');
    AF.prepCtx(ctx, size);
    const meta = { image: slug(a.name) + '.png', frameW: fw, frameH: fh, cell: { w: m.cw, h: m.ch, font: AF.view.family, size }, anims: {} };
    a.anims.forEach((an, row) => {
      meta.anims[an.name] = { fps: an.fps, loop: an.loop !== false, frames: [] };
      an.frames.forEach((g, i) => {
        AF.drawGrid(ctx, g, i * fw, row * fh, m);
        meta.anims[an.name].frames.push({ x: i * fw, y: row * fh, w: fw, h: fh });
      });
    });
    return { canvas: cv, meta };
  };

  const toBlob = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));

  AF.Export = {
    init(root) {
      root.innerHTML = `
      <div class="exp panel">
        <h3>Projeto</h3>
        <p class="hint">Arquivo completo para reabrir no ASCII Forge.</p>
        <button id="exProj" class="primary">Baixar projeto (.forge.json)</button>
        <label class="btnlike">Abrir projeto / importar asset<input type="file" id="exOpen" accept=".json" hidden></label>
      </div>
      <div class="exp panel">
        <h3>Asset atual</h3>
        <p class="hint">JSON compacto para engine: linhas de texto + índices de paleta. Veja o README para o formato.</p>
        <label>Tamanho da fonte do PNG <input type="number" id="exSize" value="24" min="6" max="96"></label>
        <div class="btn-col">
          <button id="exAsset">JSON do asset</button>
          <button id="exSheet">PNG spritesheet + metadados</button>
          <button id="exTxt">TXT (todos os quadros)</button>
          <button id="exAll">JSON de todos os assets</button>
        </div>
      </div>
      <div class="exp panel">
        <h3>Mapa atual</h3>
        <p class="hint">Tiles por legenda, entidades, luzes, camadas de parallax e configuração de iluminação.</p>
        <div class="btn-col">
          <button id="exMap">JSON do mapa</button>
          <button id="exShot">PNG do mapa iluminado (quadro atual)</button>
        </div>
      </div>
      <div class="exp panel wide">
        <h3>Prévia do JSON</h3>
        <pre id="exPrev" class="mono"></pre>
      </div>`;
      const size = () => AF.clamp(+$('#exSize').value || 24, 6, 96);
      $('#exProj').onclick = () => AF.download(slug(AF.project.name) + '.forge.json', JSON.stringify(AF.project));
      $('#exOpen').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          AF.App.importJSON(JSON.parse(await f.text()));
        } catch (err) {
          AF.toast('Arquivo inválido: ' + err.message);
        }
        e.target.value = '';
      };
      const need = () => {
        const a = AF.currentAsset();
        if (!a) AF.toast('Selecione um asset');
        return a;
      };
      $('#exAsset').onclick = () => {
        const a = need();
        if (a) AF.download(slug(a.name) + '.asset.json', JSON.stringify(AF.encodeAsset(a), null, 1));
      };
      $('#exAll').onclick = () => AF.download(slug(AF.project.name) + '.assets.json', JSON.stringify({ format: 'asciiforge-pack@1', assets: AF.project.assets.map(AF.encodeAsset) }, null, 1));
      $('#exTxt').onclick = () => {
        const a = need();
        if (!a) return;
        const txt = a.anims.map((an) => `## ${an.name} (${an.fps} fps)\n` + an.frames.map((g, i) => `-- quadro ${i + 1}\n${AF.Grid.toText(g)}`).join('\n')).join('\n\n');
        AF.download(slug(a.name) + '.txt', txt, 'text/plain');
      };
      $('#exSheet').onclick = async () => {
        const a = need();
        if (!a) return;
        const { canvas, meta } = AF.spriteSheet(a, size());
        AF.download(slug(a.name) + '.png', await toBlob(canvas));
        AF.download(slug(a.name) + '.sheet.json', JSON.stringify(meta, null, 1));
      };
      $('#exMap').onclick = () => {
        const M = AF.currentMap();
        AF.download(slug(M.name) + '.map.json', JSON.stringify(AF.encodeMap(M), null, 1));
      };
      $('#exShot').onclick = async () => {
        const M = AF.currentMap();
        const m = AF.metrics(size());
        const W = M.w * M.tileW;
        const buf = AF.composeMap(M, AF.project, (performance.now() - AF.mapState.t0) / 1000, 0, W);
        const cv = document.createElement('canvas');
        cv.width = W * m.cw;
        cv.height = buf.VH * m.ch;
        AF.drawComposed(cv.getContext('2d'), buf, m, M.bgColor);
        AF.download(slug(M.name) + '.png', await toBlob(cv));
      };
    },
    refresh() {
      const a = AF.currentAsset();
      $('#exPrev').textContent = a ? JSON.stringify(AF.encodeAsset(a), null, 1).slice(0, 4000) : '(nenhum asset selecionado)';
    },
  };
})();

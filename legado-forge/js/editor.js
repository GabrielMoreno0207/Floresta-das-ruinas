'use strict';
// Editor de sprites / tiles / FX com animação, onion skin, ferramentas de pintura e transformações.
(function () {
  const AF = window.AF;
  const $ = (s, r = document) => r.querySelector(s);

  const S = (AF.edState = {
    tool: 'pencil',
    char: '#',
    fg: '#e8e8f0',
    bg: '#1c1e26',
    useBg: false,
    apply: { c: true, f: true, b: true },
    anim: 0,
    frame: 0,
    onion: true,
    grid: true,
    playing: false,
    scale: 2,
    allFrames: false,
    charset: 'ASCII',
    palette: 'Forge (starter)',
    hover: null,
    drag: null,
    cursor: null,
    undo: [],
    redo: [],
  });

  const asset = () => AF.currentAsset();
  const anim = () => {
    const a = asset();
    if (!a) return null;
    S.anim = AF.clamp(S.anim, 0, a.anims.length - 1);
    return a.anims[S.anim];
  };
  const frame = () => {
    const an = anim();
    if (!an) return null;
    S.frame = AF.clamp(S.frame, 0, an.frames.length - 1);
    return an.frames[S.frame];
  };

  function snapshot() {
    const a = asset();
    if (!a) return;
    S.undo.push({ id: a.id, data: JSON.stringify(a) });
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
  }
  function restore(from, to) {
    const snap = from.pop();
    if (!snap) return;
    const i = AF.project.assets.findIndex((x) => x.id === snap.id);
    if (i < 0) return;
    to.push({ id: snap.id, data: JSON.stringify(AF.project.assets[i]) });
    AF.project.assets[i] = JSON.parse(snap.data);
    AF.markDirty();
    AF.Editor.refresh();
  }

  function paintCell(g, x, y, erase) {
    const cur = AF.Grid.get(g, x, y);
    if (!cur) return;
    if (erase) return AF.Grid.set(g, x, y, { c: null, f: cur.f, b: null });
    AF.Grid.set(g, x, y, {
      c: S.apply.c ? S.char : cur.c ?? (S.apply.b && S.useBg ? ' ' : null),
      f: S.apply.f ? S.fg : cur.f,
      b: S.apply.b ? (S.useBg ? S.bg : null) : cur.b,
    });
  }

  function linePts(x0, y0, x1, y1) {
    const pts = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      pts.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return pts;
  }
  function rectPts(x0, y0, x1, y1, fill) {
    const pts = [];
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (fill || x === ax || x === bx || y === ay || y === by) pts.push([x, y]);
    return pts;
  }
  // retângulo com moldura de caixa (┌─┐) quando o caractere atual é de linha
  function boxChar(x, y, ax, ay, bx, by) {
    const dbl = '═║╔╗╚╝'.includes(S.char);
    const H = dbl ? '═' : '─', V = dbl ? '║' : '│';
    const tl = dbl ? '╔' : '┌', tr = dbl ? '╗' : '┐', bl = dbl ? '╚' : '└', br = dbl ? '╝' : '┘';
    if (x === ax && y === ay) return tl;
    if (x === bx && y === ay) return tr;
    if (x === ax && y === by) return bl;
    if (x === bx && y === by) return br;
    return y === ay || y === by ? H : V;
  }

  function flood(g, x, y) {
    const t = AF.Grid.get(g, x, y);
    if (!t) return;
    const same = (c) => c.c === t.c && c.f === t.f && c.b === t.b;
    const target = { c: S.apply.c ? S.char : t.c, f: S.apply.f ? S.fg : t.f, b: S.apply.b ? (S.useBg ? S.bg : null) : t.b };
    if (same(target)) return;
    const st = [[x, y]];
    const seen = new Uint8Array(g.w * g.h);
    while (st.length) {
      const [cx, cy] = st.pop();
      if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) continue;
      const i = cy * g.w + cx;
      if (seen[i] || !same(g.cells[i])) continue;
      seen[i] = 1;
      paintCell(g, cx, cy, false);
      st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  function html() {
    const tools = [
      ['pencil', '✎', 'Lápis (B)'],
      ['eraser', '⌫', 'Borracha (E)'],
      ['fill', '◧', 'Balde (G)'],
      ['line', '╱', 'Linha (L)'],
      ['rect', '▭', 'Retângulo (R) — com char de caixa vira moldura'],
      ['rectf', '■', 'Retângulo cheio (Shift+R)'],
      ['picker', '⌖', 'Conta-gotas (I)'],
      ['text', 'T', 'Texto (T): clique e digite'],
      ['spray', '⁂', 'Spray de textura (S): espalha chars do conjunto'],
    ];
    return `
    <div class="ed-tools panel">${tools.map(([k, i, t]) => `<button data-tool="${k}" title="${t}">${i}</button>`).join('')}
      <hr><button id="edUndo" title="Desfazer (Ctrl+Z)">↶</button><button id="edRedo" title="Refazer (Ctrl+Y)">↷</button>
    </div>
    <div class="ed-center">
      <div class="ed-bar">
        <b id="edTitle"></b>
        <label><input type="checkbox" id="edGrid" checked> grade</label>
        <label><input type="checkbox" id="edOnion" checked> onion skin</label>
        <label>ampliação <select id="edScale"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label>
        <span class="hint" id="edPos"></span>
      </div>
      <div class="canvas-wrap checker" id="edWrap"><canvas id="edCanvas" tabindex="0"></canvas></div>
      <div class="timeline panel">
        <div class="tl-row">
          <select id="edAnim"></select>
          <button id="anAdd" title="nova animação">+ anim</button>
          <button id="anDup" title="duplicar animação">⧉</button>
          <input id="anName" placeholder="nome" style="width:90px">
          <label>fps <input type="number" id="anFps" min="1" max="60" style="width:50px"></label>
          <label><input type="checkbox" id="anLoop"> loop</label>
          <button id="anDel" class="danger" title="apagar animação">✕ anim</button>
          <span class="sep"></span>
          <button id="frPlay" class="primary">▶</button>
          <button id="frAdd" title="quadro vazio">+ quadro</button>
          <button id="frDup" title="duplicar quadro">⧉ quadro</button>
          <button id="frLeft" title="mover p/ esquerda">◀</button>
          <button id="frRight" title="mover p/ direita">▶</button>
          <button id="frDel" class="danger">✕ quadro</button>
        </div>
        <div class="frames" id="edFrames"></div>
      </div>
    </div>
    <div class="ed-right panel">
      <h4>Caractere</h4>
      <div class="cur-char"><span id="edCharBig"></span><input id="edCharIn" maxlength="2" title="digite qualquer caractere"></div>
      <select id="edCharset"></select>
      <div id="edChars" class="charpad"></div>
      <h4>Cores <small>(clique = frente, direito = fundo)</small></h4>
      <div class="row2">
        <label>Frente <input type="color" id="edFg"></label>
        <label>Fundo <input type="color" id="edBg"></label>
      </div>
      <label><input type="checkbox" id="edUseBg"> pintar cor de fundo</label>
      <div class="apply">Aplicar: <label><input type="checkbox" id="apC" checked>char</label><label><input type="checkbox" id="apF" checked>frente</label><label><input type="checkbox" id="apB" checked>fundo</label></div>
      <select id="edPal"></select>
      <div id="edSwatches" class="swatches"></div>
      <h4>Asset</h4>
      <label>Nome <input id="asName"></label>
      <label>Tipo <select id="asKind"><option value="sprite">sprite (personagem/objeto)</option><option value="tile">tile</option><option value="fx">efeito (FX)</option><option value="bg">fundo (parallax)</option></select></label>
      <div class="row2"><label>L <input type="number" id="asW" min="1" max="400"></label><label>A <input type="number" id="asH" min="1" max="200"></label></div>
      <label>Âncora ao redimensionar <select id="asAnchor"><option value="0,1">baixo-esq</option><option value="0.5,1" selected>baixo-centro</option><option value="0,0">cima-esq</option><option value="0.5,0.5">centro</option></select></label>
      <label><input type="checkbox" id="asSolid"> sólido (colisão/sombra)</label>
      <label><input type="checkbox" id="asEm"> emissivo (ignora escuridão)</label>
      <label><input type="checkbox" id="asFol"> folhagem (balança com vento/jogador)</label>
      <h4>Transformar</h4>
      <label><input type="checkbox" id="trAll"> aplicar em todos os quadros</label>
      <div class="btn-grid">
        <button data-tr="fh">⇋ espelhar H</button><button data-tr="fv">⇵ espelhar V</button>
        <button data-tr="l">← mover</button><button data-tr="r">→ mover</button>
        <button data-tr="u">↑ mover</button><button data-tr="d">↓ mover</button>
        <button data-tr="recolor">recolorir</button><button data-tr="clear" class="danger">limpar</button>
      </div>
      <div class="hint">"recolorir" troca a cor de frente sob o cursor pela cor atual em todo o quadro.</div>
    </div>`;
  }

  AF.Editor = {
    init(root) {
      root.innerHTML = html();
      $('.ed-tools').onclick = (e) => {
        const b = e.target.closest('[data-tool]');
        if (b) this.setTool(b.dataset.tool);
      };
      $('#edUndo').onclick = () => restore(S.undo, S.redo);
      $('#edRedo').onclick = () => restore(S.redo, S.undo);
      $('#edGrid').onchange = (e) => (S.grid = e.target.checked);
      $('#edOnion').onchange = (e) => (S.onion = e.target.checked);
      $('#edScale').value = S.scale;
      $('#edScale').onchange = (e) => (S.scale = +e.target.value);
      $('#edCharset').innerHTML = Object.keys(AF.CHARSETS).map((k) => `<option>${k}</option>`).join('');
      $('#edCharset').onchange = (e) => {
        S.charset = e.target.value;
        this.renderChars();
      };
      $('#edChars').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) this.setChar(b.dataset.c);
      };
      $('#edCharIn').oninput = (e) => {
        const v = [...e.target.value];
        if (v.length) this.setChar(v[v.length - 1]);
        e.target.value = '';
      };
      $('#edPal').innerHTML = Object.keys(AF.PALETTES).map((k) => `<option>${k}</option>`).join('');
      $('#edPal').value = S.palette;
      $('#edPal').onchange = (e) => {
        S.palette = e.target.value;
        this.renderSwatches();
      };
      $('#edSwatches').onclick = (e) => {
        const b = e.target.closest('[data-c]');
        if (b) {
          S.fg = b.dataset.c;
          this.syncColors();
        }
      };
      $('#edSwatches').oncontextmenu = (e) => {
        e.preventDefault();
        const b = e.target.closest('[data-c]');
        if (b) {
          S.bg = b.dataset.c;
          S.useBg = true;
          this.syncColors();
        }
      };
      $('#edFg').oninput = (e) => (S.fg = e.target.value);
      $('#edBg').oninput = (e) => {
        S.bg = e.target.value;
        S.useBg = true;
        $('#edUseBg').checked = true;
      };
      $('#edUseBg').onchange = (e) => (S.useBg = e.target.checked);
      $('#apC').onchange = (e) => (S.apply.c = e.target.checked);
      $('#apF').onchange = (e) => (S.apply.f = e.target.checked);
      $('#apB').onchange = (e) => (S.apply.b = e.target.checked);
      $('#trAll').onchange = (e) => (S.allFrames = e.target.checked);
      document.querySelector('.ed-right .btn-grid').onclick = (e) => {
        const b = e.target.closest('[data-tr]');
        if (b) this.transform(b.dataset.tr);
      };

      // propriedades do asset
      $('#asName').onchange = (e) => this.mutate((a) => (a.name = e.target.value.trim() || a.name));
      $('#asKind').onchange = (e) => this.mutate((a) => (a.kind = e.target.value));
      const resize = () =>
        this.mutate((a) => {
          const w = AF.clamp(+$('#asW').value || a.w, 1, 400), h = AF.clamp(+$('#asH').value || a.h, 1, 200);
          const [ax, ay] = $('#asAnchor').value.split(',').map(Number);
          a.anims.forEach((an) => (an.frames = an.frames.map((g) => AF.Grid.resize(g, w, h, ax, ay))));
          a.w = w;
          a.h = h;
        });
      $('#asW').onchange = resize;
      $('#asH').onchange = resize;
      $('#asSolid').onchange = (e) => this.mutate((a) => (a.solid = e.target.checked));
      $('#asEm').onchange = (e) => this.mutate((a) => (a.emissive = e.target.checked));
      $('#asFol').onchange = (e) => this.mutate((a) => (a.foliage = e.target.checked));

      // animações
      $('#edAnim').onchange = (e) => {
        S.anim = +e.target.value;
        S.frame = 0;
        this.refresh();
      };
      $('#anAdd').onclick = () =>
        this.mutate((a) => {
          a.anims.push({ name: 'anim' + (a.anims.length + 1), fps: 8, loop: true, frames: [AF.Grid.create(a.w, a.h)] });
          S.anim = a.anims.length - 1;
          S.frame = 0;
        });
      $('#anDup').onclick = () =>
        this.mutate((a) => {
          const c = AF.deepClone(anim());
          c.name += '_copia';
          a.anims.push(c);
          S.anim = a.anims.length - 1;
        });
      $('#anName').onchange = (e) => this.mutate(() => (anim().name = e.target.value.trim() || anim().name));
      $('#anFps').onchange = (e) => this.mutate(() => (anim().fps = AF.clamp(+e.target.value || 6, 1, 60)));
      $('#anLoop').onchange = (e) => this.mutate(() => (anim().loop = e.target.checked));
      AF.confirmBtn($('#anDel'), () =>
        this.mutate((a) => {
          if (a.anims.length > 1) a.anims.splice(S.anim, 1);
          S.anim = 0;
        })
      );
      // quadros
      $('#frPlay').onclick = () => {
        S.playing = !S.playing;
        S.playT0 = performance.now();
        $('#frPlay').textContent = S.playing ? '■' : '▶';
      };
      $('#frAdd').onclick = () =>
        this.mutate((a) => {
          anim().frames.splice(S.frame + 1, 0, AF.Grid.create(a.w, a.h));
          S.frame++;
        });
      $('#frDup').onclick = () =>
        this.mutate(() => {
          anim().frames.splice(S.frame + 1, 0, AF.Grid.clone(frame()));
          S.frame++;
        });
      const move = (d) =>
        this.mutate(() => {
          const f = anim().frames, j = S.frame + d;
          if (j < 0 || j >= f.length) return;
          [f[S.frame], f[j]] = [f[j], f[S.frame]];
          S.frame = j;
        });
      $('#frLeft').onclick = () => move(-1);
      $('#frRight').onclick = () => move(1);
      $('#frDel').onclick = () =>
        this.mutate(() => {
          const f = anim().frames;
          if (f.length > 1) f.splice(S.frame, 1);
          S.frame = Math.min(S.frame, f.length - 1);
        });
      $('#edFrames').onclick = (e) => {
        const d = e.target.closest('[data-f]');
        if (d) {
          S.frame = +d.dataset.f;
          S.playing = false;
          $('#frPlay').textContent = '▶';
          this.refresh();
        }
      };

      const cv = $('#edCanvas');
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('pointerdown', (e) => this.down(e));
      cv.addEventListener('pointermove', (e) => this.move(e));
      window.addEventListener('pointerup', (e) => this.up(e));
      cv.addEventListener('pointerleave', () => {
        S.hover = null;
        $('#edPos').textContent = '';
      });
      window.addEventListener('keydown', (e) => this.key(e));

      this.renderChars();
      this.renderSwatches();
      this.syncColors();
      this.setTool('pencil');
      requestAnimationFrame(this.loop.bind(this));
    },

    mutate(fn) {
      const a = asset();
      if (!a) return;
      snapshot();
      fn(a);
      AF.markDirty();
      this.refresh();
      AF.App.refreshAssets();
    },

    setTool(t) {
      S.tool = t;
      S.cursor = null;
      document.querySelectorAll('.ed-tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    },
    setChar(c) {
      S.char = c;
      $('#edCharBig').textContent = c === ' ' ? '␠' : c;
      document.querySelectorAll('#edChars button').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
    },
    renderChars() {
      const set = [' ', ...AF.CHARSETS[S.charset]];
      $('#edChars').innerHTML = set.map((c) => `<button data-c="${c.replace(/"/g, '&quot;')}" class="${c === S.char ? 'on' : ''}">${c === ' ' ? '␠' : c.replace('<', '&lt;')}</button>`).join('');
      this.setChar(S.char);
    },
    renderSwatches() {
      $('#edSwatches').innerHTML = AF.PALETTES[S.palette].map((c) => `<button data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
    },
    syncColors() {
      $('#edFg').value = S.fg;
      $('#edBg').value = S.bg;
      $('#edUseBg').checked = S.useBg;
    },

    refresh() {
      const a = asset();
      const root = $('#view-editor');
      root.classList.toggle('empty', !a);
      if (!a) {
        $('#edTitle').textContent = 'Selecione ou crie um asset à esquerda';
        return;
      }
      const an = anim();
      frame();
      $('#edTitle').textContent = `${a.name} — ${a.w}×${a.h}`;
      $('#asName').value = a.name;
      $('#asKind').value = a.kind;
      $('#asW').value = a.w;
      $('#asH').value = a.h;
      $('#asSolid').checked = !!a.solid;
      $('#asEm').checked = !!a.emissive;
      $('#asFol').checked = !!a.foliage;
      $('#edAnim').innerHTML = a.anims.map((x, i) => `<option value="${i}">${x.name} (${x.frames.length})</option>`).join('');
      $('#edAnim').value = S.anim;
      $('#anName').value = an.name;
      $('#anFps').value = an.fps;
      $('#anLoop').checked = an.loop !== false;
      const sz = Math.max(5, Math.min(12, Math.floor(110 / Math.max(a.w, a.h * 2))));
      $('#edFrames').innerHTML = an.frames
        .map((g, i) => `<div data-f="${i}" class="fr ${i === S.frame ? 'on' : ''}"><img src="${AF.renderGridCanvas(g, sz).toDataURL()}"><span>${i + 1}</span></div>`)
        .join('');
    },

    cell(e) {
      const m = AF.metrics(AF.App.zoom() * S.scale);
      const r = e.target.getBoundingClientRect();
      const sx = e.target.width / r.width, sy = e.target.height / r.height;
      return { x: Math.floor(((e.clientX - r.left) * sx - PAD) / m.cw), y: Math.floor(((e.clientY - r.top) * sy - PAD) / m.ch) };
    },

    down(e) {
      const g = frame();
      if (!g) return;
      e.target.focus();
      const p = this.cell(e);
      const erase = e.button === 2;
      const t = erase && S.tool !== 'picker' ? 'eraser' : S.tool;
      if (t === 'picker') {
        const c = AF.Grid.get(g, p.x, p.y);
        if (c) {
          if (c.c != null) this.setChar(c.c);
          S.fg = c.f;
          if (c.b) {
            S.bg = c.b;
            S.useBg = true;
          }
          this.syncColors();
        }
        return;
      }
      if (t === 'text') {
        S.cursor = { x: AF.clamp(p.x, 0, g.w - 1), y: AF.clamp(p.y, 0, g.h - 1), x0: AF.clamp(p.x, 0, g.w - 1) };
        return;
      }
      snapshot();
      if (t === 'fill') {
        flood(g, p.x, p.y);
        this.after();
        return;
      }
      S.drag = { t, x0: p.x, y0: p.y, last: p };
      if (t === 'pencil' || t === 'eraser') paintCell(g, p.x, p.y, t === 'eraser');
      if (t === 'spray') this.spray(g, p);
      this.after(true);
    },
    spray(g, p) {
      const set = [...AF.CHARSETS[S.charset]];
      const pool = S.sprayPool || (S.char ? [S.char] : set);
      for (let i = 0; i < 3; i++) {
        const x = p.x + Math.round((Math.random() - 0.5) * 4), y = p.y + Math.round((Math.random() - 0.5) * 2);
        const keep = S.char;
        S.char = Math.random() < 0.5 ? pool[0] : set[Math.floor(Math.random() * Math.min(set.length, 12))];
        paintCell(g, x, y, false);
        S.char = keep;
      }
    },
    move(e) {
      const g = frame();
      if (!g) return;
      const p = this.cell(e);
      S.hover = p;
      const c = AF.Grid.get(g, p.x, p.y);
      $('#edPos').textContent = c ? `x${p.x} y${p.y}  ${c.c == null ? '(vazio)' : `'${c.c}' ${c.f}${c.b ? ' / ' + c.b : ''}`}` : '';
      const d = S.drag;
      if (!d) return;
      if (d.t === 'pencil' || d.t === 'eraser') {
        for (const [x, y] of linePts(d.last.x, d.last.y, p.x, p.y)) paintCell(g, x, y, d.t === 'eraser');
        this.after(true);
      } else if (d.t === 'spray') this.spray(g, p);
      d.last = p;
    },
    up() {
      const d = S.drag;
      if (!d) return;
      S.drag = null;
      const g = frame();
      const p = d.last;
      if (d.t === 'line') for (const [x, y] of linePts(d.x0, d.y0, p.x, p.y)) paintCell(g, x, y, false);
      if (d.t === 'rect' || d.t === 'rectf') {
        const ax = Math.min(d.x0, p.x), bx = Math.max(d.x0, p.x), ay = Math.min(d.y0, p.y), by = Math.max(d.y0, p.y);
        const box = d.t === 'rect' && '─│┌┐└┘═║╔╗╚╝'.includes(S.char);
        for (const [x, y] of rectPts(d.x0, d.y0, p.x, p.y, d.t === 'rectf')) {
          if (box) {
            const keep = S.char;
            S.char = boxChar(x, y, ax, ay, bx, by);
            paintCell(g, x, y, false);
            S.char = keep;
          } else paintCell(g, x, y, false);
        }
      }
      this.after();
    },
    after(light) {
      AF.markDirty();
      if (!light) {
        this.refresh();
        AF.App.refreshAssets();
      } else this.dirtyThumbs = true;
    },

    transform(k) {
      const an = anim();
      if (!an) return;
      const hov = S.hover && AF.Grid.get(frame(), S.hover.x, S.hover.y);
      this.mutate(() => {
        const idx = S.allFrames ? an.frames.map((_, i) => i) : [S.frame];
        for (const i of idx) {
          let g = an.frames[i];
          if (k === 'fh') g = AF.Grid.flip(g, 'h');
          if (k === 'fv') g = AF.Grid.flip(g, 'v');
          if (k === 'l') g = AF.Grid.shift(g, -1, 0);
          if (k === 'r') g = AF.Grid.shift(g, 1, 0);
          if (k === 'u') g = AF.Grid.shift(g, 0, -1);
          if (k === 'd') g = AF.Grid.shift(g, 0, 1);
          if (k === 'clear') g = AF.Grid.create(g.w, g.h);
          if (k === 'recolor' && hov) g.cells.forEach((c) => c.f === hov.f && (c.f = S.fg));
          an.frames[i] = g;
        }
      });
    },

    key(e) {
      if (AF.App.view !== 'editor') return;
      if (e.target.matches('input,textarea,select')) return;
      const g = frame();
      if (S.tool === 'text' && S.cursor && g) {
        if (e.key === 'Escape') {
          S.cursor = null;
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          snapshot();
          const keep = S.char;
          S.char = e.key;
          if (e.key === ' ') AF.Grid.set(g, S.cursor.x, S.cursor.y, { c: null, f: S.fg, b: S.useBg ? S.bg : null });
          else paintCell(g, S.cursor.x, S.cursor.y, false);
          S.char = keep;
          S.cursor.x = Math.min(g.w - 1, S.cursor.x + 1);
          this.after(true);
          return;
        }
        if (e.key === 'Enter') {
          S.cursor.x = S.cursor.x0;
          S.cursor.y = Math.min(g.h - 1, S.cursor.y + 1);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          snapshot();
          S.cursor.x = Math.max(0, S.cursor.x - 1);
          paintCell(g, S.cursor.x, S.cursor.y, true);
          this.after(true);
          return;
        }
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (mv) {
          e.preventDefault();
          S.cursor.x = AF.clamp(S.cursor.x + mv[0], 0, g.w - 1);
          S.cursor.y = AF.clamp(S.cursor.y + mv[1], 0, g.h - 1);
          return;
        }
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return restore(S.undo, S.redo);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return restore(S.redo, S.undo);
      }
      if (e.ctrlKey) return;
      const map = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', r: 'rect', i: 'picker', t: 'text', s: 'spray' };
      if (e.key === 'R') return this.setTool('rectf');
      if (map[e.key]) return this.setTool(map[e.key]);
      if (e.key === '[' || e.key === ',') {
        S.frame = Math.max(0, S.frame - 1);
        this.refresh();
      }
      if (e.key === ']' || e.key === '.') {
        S.frame = Math.min(anim().frames.length - 1, S.frame + 1);
        this.refresh();
      }
      if (e.key === ' ') {
        e.preventDefault();
        $('#frPlay').click();
      }
    },

    loop(now) {
      requestAnimationFrame(this.loop.bind(this));
      if (AF.App.view !== 'editor') return;
      const a = asset();
      const cv = $('#edCanvas');
      if (!a) {
        cv.width = cv.height = 1;
        return;
      }
      const an = anim();
      let g = frame();
      if (S.playing) g = AF.frameAt(an, (now - S.playT0) / 1000);
      const m = AF.metrics(AF.App.zoom() * S.scale);
      const W = a.w * m.cw + PAD * 2, H = a.h * m.ch + PAD * 2;
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(10,10,15,0.85)';
      ctx.fillRect(PAD, PAD, a.w * m.cw, a.h * m.ch);
      AF.prepCtx(ctx, m.size);
      if (S.onion && !S.playing && S.frame > 0) {
        ctx.globalAlpha = 0.22;
        AF.drawGrid(ctx, an.frames[S.frame - 1], PAD, PAD, m);
        ctx.globalAlpha = 1;
      }
      // prévia de linha/retângulo
      let preview = g;
      const d = S.drag;
      if (d && (d.t === 'line' || d.t === 'rect' || d.t === 'rectf')) {
        preview = AF.Grid.clone(g);
        const p = d.last;
        const ax = Math.min(d.x0, p.x), bx = Math.max(d.x0, p.x), ay = Math.min(d.y0, p.y), by = Math.max(d.y0, p.y);
        const box = d.t === 'rect' && '─│┌┐└┘═║╔╗╚╝'.includes(S.char);
        const pts = d.t === 'line' ? linePts(d.x0, d.y0, p.x, p.y) : rectPts(d.x0, d.y0, p.x, p.y, d.t === 'rectf');
        const keep = S.char;
        for (const [x, y] of pts) {
          if (box) S.char = boxChar(x, y, ax, ay, bx, by);
          paintCell(preview, x, y, false);
        }
        S.char = keep;
      }
      AF.drawGrid(ctx, preview, PAD, PAD, m);
      if (S.grid) {
        ctx.strokeStyle = 'rgba(140,160,190,0.13)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= a.w; x++) {
          ctx.moveTo(PAD + x * m.cw + 0.5, PAD);
          ctx.lineTo(PAD + x * m.cw + 0.5, PAD + a.h * m.ch);
        }
        for (let y = 0; y <= a.h; y++) {
          ctx.moveTo(PAD, PAD + y * m.ch + 0.5);
          ctx.lineTo(PAD + a.w * m.cw, PAD + y * m.ch + 0.5);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(200,210,230,0.35)';
      ctx.strokeRect(PAD - 0.5, PAD - 0.5, a.w * m.cw + 1, a.h * m.ch + 1);
      if (S.hover && !S.playing) {
        ctx.strokeStyle = '#ffd23f';
        ctx.strokeRect(PAD + S.hover.x * m.cw + 0.5, PAD + S.hover.y * m.ch + 0.5, m.cw - 1, m.ch - 1);
      }
      if (S.cursor && S.tool === 'text' && Math.floor(now / 400) % 2) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(PAD + S.cursor.x * m.cw, PAD + (S.cursor.y + 1) * m.ch - 2, m.cw, 2);
      }
      if (this.dirtyThumbs && !S.drag && now - (this.lastThumb || 0) > 400) {
        this.dirtyThumbs = false;
        this.lastThumb = now;
        this.refresh();
        AF.App.refreshAssets();
      }
    },
  };
  const PAD = 12;
})();

'use strict';
// Starter pack (assets desenhados à mão) + geradores procedurais de cenário.
(function () {
  const AF = window.AF;
  const R = (rows, colors, legend) => AF.Grid.fromRows(rows, colors, legend);

  // ---------- RNG determinístico ----------
  AF.rng = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  };
  const lerpHex = (a, b, t) => {
    const A = AF.hexToRgb(a), B = AF.hexToRgb(b);
    return AF.rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  const smoothNoise = (rnd, n) => {
    const pts = Array.from({ length: n + 2 }, rnd);
    return (x) => {
      const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
      return pts[i % pts.length] + (pts[(i + 1) % pts.length] - pts[i % pts.length]) * s;
    };
  };

  // ---------- geradores ----------
  AF.Gen = {
    THEMES: {
      Noite: { top: '#05061a', bottom: '#2a1d4a', far: '#1b1640', farEdge: '#5a4f9a', near: '#0d1f1a', nearEdge: '#2f6f4f', star: '#e8e8ff', moon: '#f4f1d0' },
      'Pôr do sol': { top: '#2b1050', bottom: '#ff8c5a', far: '#5d275d', farEdge: '#b13e53', near: '#2a1030', nearEdge: '#7e2553', star: '#ffe0b0', moon: '#ffd27f' },
      Floresta: { top: '#0f2a3a', bottom: '#5fa08a', far: '#24504a', farEdge: '#5fa08a', near: '#0f2a1a', nearEdge: '#38b764', star: '#d0ffe0', moon: '#f4f4f4' },
      Caverna: { top: '#050508', bottom: '#14121c', far: '#1c1a26', farEdge: '#3a3550', near: '#0e0c14', nearEdge: '#2a2638', star: '#73eff7', moon: '#73eff7' },
    },

    sky({ w = 200, h = 27, theme = 'Noite', stars = 0.05, moon = true, seed = 7 } = {}) {
      const T = AF.Gen.THEMES[theme], rnd = AF.rng(seed);
      const g = AF.Grid.create(w, h);
      for (let y = 0; y < h; y++) {
        const b = lerpHex(T.top, T.bottom, Math.pow(y / Math.max(1, h - 1), 1.3));
        for (let x = 0; x < w; x++) {
          const r = rnd();
          const starP = stars * (1 - y / h);
          let c = ' ', f = T.star;
          if (r < starP) {
            const k = rnd();
            c = k < 0.6 ? '.' : k < 0.85 ? '·' : k < 0.96 ? '+' : '*';
            f = lerpHex(b, T.star, 0.35 + rnd() * 0.65);
          }
          g.cells[y * w + x] = { c, f, b };
        }
      }
      if (moon) {
        // lua redonda com meio-blocos: cada célula = 2 "pixels" verticais (quase quadrados)
        const m = AF.metrics(32), ar = m.cw / (m.ch / 2);
        const cx = Math.floor(w * 0.68), cy = 6, R = 4.2;
        for (let y = 0; y < 5; y++)
          for (let x = -6; x <= 6; x++) {
            const inside = (sub) => {
              const px = x * ar, py = y * 2 + sub + 0.5 - cy;
              return px * px + py * py <= R * R;
            };
            const t = inside(0), b = inside(1);
            const cell = AF.Grid.get(g, cx + x, 1 + y);
            if (!cell || (!t && !b)) continue;
            const shade = rnd() < 0.18 ? lerpHex(T.moon, '#000000', 0.18) : T.moon;
            if (t && b) {
              cell.b = shade;
              cell.c = rnd() < 0.15 ? 'o' : ' ';
              cell.f = lerpHex(T.moon, '#000000', 0.3);
            } else {
              cell.c = t ? '▀' : '▄';
              cell.f = T.moon;
            }
          }
      }
      return g;
    },

    mountains({ w = 96, h = 12, theme = 'Noite', seed = 3, rough = 0.5 } = {}) {
      const T = AF.Gen.THEMES[theme], rnd = AF.rng(seed);
      const g = AF.Grid.create(w, h);
      // picos triangulares sobrepostos (inclinação 1 linha/coluna = diagonais limpas), periódicos em w
      const peaks = [];
      const n = Math.max(2, Math.round((w / 14) * (0.6 + rough)));
      for (let i = 0; i < n; i++) peaks.push({ x: rnd() * w, h: 3 + rnd() * (h - 3) });
      const hgt = [];
      for (let x = 0; x < w; x++) {
        let best = 1;
        for (const p of peaks) {
          const dx = Math.min(Math.abs(x - p.x), w - Math.abs(x - p.x));
          best = Math.max(best, p.h - dx);
        }
        hgt.push(Math.round(best));
      }
      const top = Math.max(...hgt);
      for (let x = 0; x < w; x++) {
        const H = hgt[x], l = hgt[(x - 1 + w) % w], r = hgt[(x + 1) % w];
        const ty = h - H;
        const c = l < H && r < H ? '^' : l < H ? '/' : r < H ? '\\' : l > H && r > H ? 'v' : r > H ? '/' : l > H ? '\\' : '_';
        const snowy = H >= top - 1 && H > h * 0.6;
        g.cells[ty * w + x] = { c, f: snowy ? '#f4f4ff' : T.farEdge, b: T.far };
        for (let y = ty + 1; y < h; y++) {
          const k = rnd(), depth = y - ty;
          const snow = snowy && depth <= 1;
          const ridge = depth === 1 && !snow;
          g.cells[y * w + x] = {
            c: snow ? (k < 0.6 ? '^' : '.') : ridge && k < 0.4 ? '.' : k < 0.05 ? ':' : k < 0.12 ? '.' : ' ',
            f: snow ? '#c8d0e8' : lerpHex(T.far, T.farEdge, 0.5),
            b: lerpHex(T.far, '#000000', Math.min(0.5, depth / (h * 2))),
          };
        }
      }
      return g;
    },

    forest({ w = 80, h = 10, theme = 'Noite', seed = 11, density = 0.55 } = {}) {
      const T = AF.Gen.THEMES[theme], rnd = AF.rng(seed);
      const g = AF.Grid.create(w, h);
      const put = (x, y, c, f, b) => {
        x = ((x % w) + w) % w;
        if (y >= 0 && y < h) g.cells[y * w + x] = { c, f, b };
      };
      // chão contínuo
      for (let x = 0; x < w; x++)
        for (let y = h - 2; y < h; y++) put(x, y, rnd() < 0.3 ? (rnd() < 0.5 ? '"' : ',') : ' ', T.nearEdge, T.near);
      let x = 0;
      while (x < w) {
        const th = 4 + Math.floor(rnd() * (h - 5));
        const top = h - 2 - th;
        for (let k = 0; k < th; k++) {
          const half = Math.floor(k / 1.6);
          for (let i = -half; i <= half; i++) {
            const edge = i === -half ? '/' : i === half ? '\\' : rnd() < 0.3 ? '^' : ' ';
            put(x + i, top + k, k === 0 ? '▲' : edge, k === 0 ? T.nearEdge : lerpHex(T.near, T.nearEdge, 0.6 + rnd() * 0.4), T.near);
          }
        }
        put(x, h - 2, '|', '#5a3a22', T.near);
        x += 2 + Math.floor(rnd() * (6 / Math.max(0.1, density)));
      }
      return g;
    },

    texture({ w = 6, h = 3, chars = '%#:.', fg1 = '#6b4426', fg2 = '#8a5a32', bg = '#3b2414', density = 0.7, seed = 5 } = {}) {
      const rnd = AF.rng(seed);
      const g = AF.Grid.create(w, h);
      const cs = [...chars];
      for (let i = 0; i < w * h; i++) {
        const on = rnd() < density;
        g.cells[i] = { c: on ? cs[Math.floor(rnd() * cs.length)] : ' ', f: rnd() < 0.5 ? fg1 : fg2, b: bg || null };
        if (!on && !bg) g.cells[i].c = null;
      }
      return g;
    },
  };

  // ---------- starter pack ----------
  const legend = {
    R: '#ff5a4f', K: '#ffd9b3', B: '#4f8cff', Y: '#ffd23f', M: '#c0c6d0', E: '#ffffff', w: '#7a4a26', L: '#a8adb8',
    G: '#7bd35a', g: '#3f8f3a', O: '#ff8c1a', F: '#ff3b1a', C: '#73eff7', c: '#2fa8c8', T: '#5a3a22', P: '#c8964b',
    s: '#d0ffb0',
    // com fundo
    '1': { f: '#5fbf4a', b: '#3b2414' }, '2': { f: '#6b4426', b: '#3b2414' }, '3': { f: '#8a5a32', b: '#3b2414' },
    '4': { f: '#9aa0b8', b: '#3a3e52' }, '5': { f: '#c8964b', b: '#7a4a26' }, '6': { f: '#555a6e' },
    '7': { f: '#9fd8ff', b: '#12416e' }, '8': { f: '#5fb0ff', b: '#0b2a4a' }, '9': { f: '#3b7fc4', b: '#0b2a4a' },
    a: { f: '#ffd23f', b: '#b0250a' }, b: { f: '#ff8c1a', b: '#7a1505' }, d: { f: '#ff3b1a', b: '#5a0f03' },
  };
  const asset = (kind, name, anims, extra = {}) => {
    const f0 = anims[0].frames[0];
    return Object.assign({ id: AF.uid(), name, kind, w: f0.w, h: f0.h, solid: kind === 'tile', emissive: false, anims }, extra);
  };
  const frames = (list, colors) => list.map((rows, i) => R(rows, Array.isArray(colors[0]) ? colors[i] : colors, legend));

  AF.starterPack = () => {
    const A = {};
    // HERÓI 5x5
    const heroC = ['  R  ', ' MEM ', 'KBYBK', ' wYw ', ' L L '];
    const heroCrun = ['  R  ', ' MEM ', 'KBYBK', ' wYw ', ' LLLL'];
    const hero = (r2, r4) => ['  ▄  ', ' [o] ', r2, ' |_| ', r4];
    A.hero = asset('sprite', 'heroi', [
      { name: 'idle', fps: 3, loop: true, frames: frames([hero('/[#]\\', ' / \\ '), hero('|[#]|', ' / \\ ')], heroC) },
      { name: 'run', fps: 10, loop: true, frames: frames([hero('-[#]\\', ' /  >'), hero(' [#]-', '  |\\ '), hero('/[#]-', ' <  \\'), hero(' [#]\\', '  /| ')], heroCrun) },
      { name: 'jump', fps: 6, loop: false, frames: frames([hero('\\[#]/', ' < > ')], heroC) },
      { name: 'fall', fps: 6, loop: false, frames: frames([hero('/[#]\\', ' | | ')], heroC) },
    ]);
    A.slime = asset('sprite', 'slime', [
      { name: 'idle', fps: 3, loop: true, frames: frames([[' .-. ', '(oGo)'], ['     ', '(-G-)']], [[' GGG ', 'GEGEG'], ['     ', 'GEGEG']]) },
    ]);
    A.slime.anims[0].frames.forEach((f) => f.cells.forEach((c) => c.c === 'G' && (c.c = '_')));

    // TILES 6x3
    A.grass = asset('tile', 'grama', [{ name: 'idle', fps: 1, loop: true, frames: [R(["|'v|,|", '▀▀▀▀▀▀', '.%:.%:'], ['GgGGgG', '111111', '232232'], legend)] }], { foliage: true });
    A.dirt = asset('tile', 'terra', [{ name: 'idle', fps: 1, loop: true, frames: [R(['%.:#.%', ':#.%:.', '.%:.#%'], ['232322', '322232', '232323'], legend)] }]);
    A.brick = asset('tile', 'tijolo', [{ name: 'idle', fps: 1, loop: true, frames: [R(['|__|__', '_|__|_', '|__|__'], ['444444', '444444', '444444'], legend)] }]);
    A.plat = asset('tile', 'plataforma', [{ name: 'idle', fps: 1, loop: true, frames: [R(['=#==#=', ' |  | ', '      '], ['555555', ' w  w ', '      '], legend)] }]);
    A.spikes = asset('tile', 'espinhos', [{ name: 'idle', fps: 1, loop: true, frames: [R(['      ', '/\\/\\/\\', '▀▀▀▀▀▀'], ['      ', 'MMMMMM', '666666'], legend)] }]);
    A.ladder = asset('tile', 'escada', [{ name: 'idle', fps: 1, loop: true, frames: [R(['|====|', '|    |', '|====|'], ['PPPPPP', 'P    P', 'PPPPPP'], legend)] }], { solid: false });
    const water0 = R(['~^~~^~', '≈~≈≈~≈', '~≈~~≈~'], ['777777', '888888', '999999'], legend);
    A.water = asset('tile', 'agua', [{ name: 'idle', fps: 4, loop: true, frames: [0, 1, 2, 3, 4, 5].map((i) => AF.Grid.shift(water0, i, 0)) }], { solid: false });
    const lava0 = R(['^~^~~^', '≈~≈~≈~', '~≈~≈~≈'], ['aaaaaa', 'bbbbbb', 'dddddd'], legend);
    A.lava = asset('tile', 'lava', [{ name: 'idle', fps: 3, loop: true, frames: [0, 1, 2, 3, 4, 5].map((i) => AF.Grid.shift(lava0, -i, 0)) }], { solid: false, emissive: true });

    // FX / PROPS
    A.torch = asset('fx', 'tocha', [
      {
        name: 'idle', fps: 8, loop: true,
        frames: frames(
          [[' ) ', '(*)', '{=}', ' | '], [' ( ', ')*(', '{=}', ' | '], [" ' ", '(o)', '{=}', ' | '], [' ) ', '(O)', '{=}', ' | ']],
          [[' Y ', 'OYO', 'MMM', ' T '], [' Y ', 'FYF', 'MMM', ' T '], [' O ', 'OYO', 'MMM', ' T '], [' Y ', 'FOF', 'MMM', ' T ']]
        ),
      },
    ], { emissive: true });
    A.coin = asset('fx', 'moeda', [{ name: 'idle', fps: 8, loop: true, frames: frames([['(o)'], [' 0 '], [' | '], [' 0 ']], ['YYY']) }], { emissive: true });
    A.crystal = asset('fx', 'cristal', [
      { name: 'idle', fps: 3, loop: true, frames: frames([[' ^ ', '<◆>', ' v '], [' ^ ', '<◇>', ' v ']], [[' C ', 'cCc', ' c '], [' c ', 'CcC', ' C ']]) },
    ], { emissive: true });
    A.dust = asset('fx', 'poeira', [{ name: 'idle', fps: 10, loop: true, frames: frames([['   '], [' . '], ['.o.'], ['o O'], ['. .'], ['   ']], ['LLL']) }]);
    A.tree = asset('prop', 'arvore', [
      {
        name: 'idle', fps: 1, loop: true,
        frames: [
          R(
            ['  ▄▓█▓▄  ', ' ▓█▓▒▓█▓ ', '▓█▒▓█▓▒█▓', ' ▀▓█▓█▀▀ ', '   ▐█▌   ', '   ▐█▌   ', '  ▄███▄  '],
            ['  gGgGg  ', ' gGggGGg ', 'gGggGgGGg', ' gggGggg ', '   TTT   ', '   TTT   ', '  TTTTT  '],
            legend
          ),
        ],
      },
    ]);
    A.bush = asset('tile', 'mato alto', [{ name: 'idle', fps: 1, loop: true, frames: [R(['      ', ' |/|\\ ', "\\|v|/|"], ['      ', ' GgGg ', 'gGsGgG'], legend)] }], { solid: false, foliage: true });

    // FUNDOS
    A.sky = asset('bg', 'ceu noturno', [{ name: 'idle', fps: 1, loop: true, frames: [AF.Gen.sky({ w: 200, h: 27 })] }], { emissive: true });
    A.mount = asset('bg', 'montanhas', [{ name: 'idle', fps: 1, loop: true, frames: [AF.Gen.mountains({ w: 96, h: 12 })] }], { emissive: true });
    A.forest = asset('bg', 'floresta', [{ name: 'idle', fps: 1, loop: true, frames: [AF.Gen.forest({ w: 80, h: 10 })] }]);
    for (const a of Object.values(A)) {
      a.w = a.anims[0].frames[0].w;
      a.h = a.anims[0].frames[0].h;
    }
    return A;
  };

  AF.demoMap = (A) => {
    const M = AF.newMap('Demo: floresta noturna', 30, 9, 6, 3);
    const rows = [
      '..............................',
      '..............................',
      '...........BBBBBB.............',
      '..PPPH.....B....B.......PPP...',
      '.....H.....B....B.............',
      '.....H..........B.........GGGG',
      'GGGGGG..GGGb....BGGG.....GDDDD',
      'DDDDDDWWDDDBBBBBBDDDVVVVVDDDDD',
      'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    ];
    const key = { G: A.grass, D: A.dirt, B: A.brick, P: A.plat, H: A.ladder, W: A.water, V: A.lava, S: A.spikes, b: A.bush };
    rows.forEach((r, y) => [...r].forEach((k, x) => (M.tiles[y * M.w + x] = key[k] ? key[k].id : null)));
    // mato alto em cima da grama
    [[1, 5], [3, 5], [9, 5], [18, 5], [27, 4]].forEach(([x, y]) => (M.tiles[y * M.w + x] = A.bush.id));
    const ent = (a, x, y, extra = {}) => M.entities.push(Object.assign({ id: AF.uid(), assetId: a.id, anim: a.anims[0].name, x, y, flip: false, phase: Math.random() }, extra));
    ent(A.tree, 48, 11);
    ent(A.tree, 104, 11);
    ent(A.torch, 80, 12);
    ent(A.torch, 150, 5);
    ent(A.coin, 13, 8);
    ent(A.coin, 18, 8);
    ent(A.coin, 23, 8);
    ent(A.crystal, 151, 12);
    ent(A.slime, 112, 16, { flip: true });
    ent(A.hero, 8, 13, { player: true });
    const L = (x, y, p, extra = {}) => M.lights.push(Object.assign({ id: AF.uid(), x, y }, AF.LIGHT_PRESETS[p], extra));
    L(81, 13, 'Tocha');
    L(151, 6, 'Tocha');
    L(135, 21, 'Lava', { radius: 20 });
    L(152, 13, 'Cristal');
    L(18, 8, 'Vela', { color: '#ffd23f', radius: 8 });
    M.layers = [
      { assetId: A.sky.id, parallax: 0.03, y: 0, repeat: true },
      { assetId: A.mount.id, parallax: 0.15, y: 6, repeat: true },
      { assetId: A.forest.id, parallax: 0.4, y: 9, repeat: true },
    ];
    M.ambient = { color: '#7a8ae0', level: 0.75 };
    return M;
  };

  // ---------- painel do gerador ----------
  AF.Generator = {
    open() {
      const dlg = document.getElementById('genDlg');
      dlg.classList.add('open');
      this.render();
    },
    close() {
      document.getElementById('genDlg').classList.remove('open');
    },
    params() {
      const v = (id) => document.getElementById(id).value;
      return { type: v('gType'), theme: v('gTheme'), w: +v('gW'), h: +v('gH'), seed: +v('gSeed'), density: +v('gDen') };
    },
    build() {
      const p = this.params();
      if (p.type === 'sky') return AF.Gen.sky({ w: p.w, h: p.h, theme: p.theme, seed: p.seed, stars: p.density * 0.1 });
      if (p.type === 'mountains') return AF.Gen.mountains({ w: p.w, h: p.h, theme: p.theme, seed: p.seed, rough: p.density });
      if (p.type === 'forest') return AF.Gen.forest({ w: p.w, h: p.h, theme: p.theme, seed: p.seed, density: p.density });
      const T = AF.Gen.THEMES[p.theme];
      return AF.Gen.texture({ w: p.w, h: p.h, seed: p.seed, density: p.density, chars: document.getElementById('gChars').value || '%#:.', fg1: T.farEdge, fg2: T.nearEdge, bg: T.near });
    },
    render() {
      const g = this.build();
      AF.renderGridCanvas(g, 10, document.getElementById('gPrev'));
    },
    create() {
      const p = this.params();
      const g = this.build();
      const kind = p.type === 'texture' ? 'tile' : 'bg';
      const names = { sky: 'ceu', mountains: 'montanhas', forest: 'floresta', texture: 'textura' };
      const a = { id: AF.uid(), name: `${names[p.type]} ${p.theme.toLowerCase()} ${p.seed}`, kind, w: g.w, h: g.h, solid: kind === 'tile', emissive: p.type !== 'forest' && kind === 'bg', anims: [{ name: 'idle', fps: 1, loop: true, frames: [g] }] };
      AF.project.assets.push(a);
      AF.App.select(a.id);
      AF.markDirty();
      this.close();
      AF.toast('Asset gerado: ' + a.name + (kind === 'bg' ? ' — adicione como camada no Mapa' : ''));
    },
    init() {
      const el = document.getElementById('genDlg');
      el.innerHTML = `<div class="dlg panel">
        <h3>✦ Gerador procedural</h3>
        <div class="row2">
          <label>Tipo <select id="gType"><option value="sky">Céu (gradiente + estrelas + lua)</option><option value="mountains">Montanhas distantes</option><option value="forest">Floresta de pinheiros</option><option value="texture">Textura de tile</option></select></label>
          <label>Tema <select id="gTheme">${Object.keys(AF.Gen.THEMES).map((k) => `<option>${k}</option>`).join('')}</select></label>
        </div>
        <div class="row4">
          <label>Largura <input type="number" id="gW" value="120" min="2" max="400"></label>
          <label>Altura <input type="number" id="gH" value="12" min="2" max="100"></label>
          <label>Semente <input type="number" id="gSeed" value="7"></label>
          <label>Densidade <input type="number" id="gDen" value="0.5" step="0.05" min="0" max="1"></label>
        </div>
        <label>Chars da textura <input id="gChars" value="%#:."></label>
        <div class="canvas-wrap small"><canvas id="gPrev"></canvas></div>
        <div class="row-end"><button id="gRand">🎲 semente</button><button id="gCancel">Cancelar</button><button id="gOk" class="primary">Criar asset</button></div>
      </div>`;
      el.addEventListener('input', () => this.render());
      el.querySelector('#gType').onchange = (e) => {
        const d = { sky: [200, 27], mountains: [96, 12], forest: [80, 10], texture: [6, 3] }[e.target.value];
        el.querySelector('#gW').value = d[0];
        el.querySelector('#gH').value = d[1];
        this.render();
      };
      el.querySelector('#gRand').onclick = () => {
        el.querySelector('#gSeed').value = Math.floor(Math.random() * 99999);
        this.render();
      };
      el.querySelector('#gCancel').onclick = () => this.close();
      el.querySelector('#gOk').onclick = () => this.create();
      el.addEventListener('click', (e) => e.target === el && this.close());
    },
  };
})();

'use strict';
// Interface do conversor imagem -> ASCII (imagem única, spritesheet, GIF animado ou várias imagens).
(function () {
  const AF = window.AF;
  const $ = (s, r = document) => r.querySelector(s);

  const S = { srcs: [], fps: 8, opts: Object.assign({}, AF.CONVERT_DEFAULTS), result: [], sheet: { on: false, cols: 4, rows: 1, count: 0 }, img: null, t0: performance.now() };

  const spec = [
    ['mode', 'Modo', 'select', AF.CONVERT_MODES],
    ['cols', 'Colunas', 'number', [1, 400, 1]],
    ['rows', 'Linhas (0 = auto)', 'number', [0, 200, 1]],
    ['ramp', 'Rampa de chars', 'ramp'],
    ['measuredRamp', 'Rampa medida na fonte (aalib)', 'check'],
    ['autoLevels', 'Auto-níveis min→max (aalib)', 'check'],
    ['glyphSet', 'Conjunto (casamento)', 'select', Object.fromEntries(Object.keys(AF.CHARSETS).map((k) => [k, k]))],
    ['glyphSharpen', 'Realce de forma', 'range', [1, 4, 0.1]],
    ['invert', 'Inverter luminância', 'check'],
    ['brightness', 'Brilho', 'range', [-0.5, 0.5, 0.01]],
    ['contrast', 'Contraste', 'range', [0.2, 3, 0.01]],
    ['gamma', 'Gama', 'range', [0.3, 3, 0.01]],
    ['saturation', 'Saturação', 'range', [0, 3, 0.01]],
    ['dither', 'Dither', 'select', { none: 'nenhum', fs: 'Floyd–Steinberg', bayer: 'Bayer 4×4' }],
    ['colorMode', 'Cor', 'select', { color: 'cor original', palette: 'quantizar na paleta', mono: 'monocromático' }],
    ['palette', 'Paleta', 'select', Object.fromEntries(Object.keys(AF.PALETTES).map((k) => [k, k]))],
    ['monoColor', 'Cor mono', 'color'],
    ['normalizeColor', 'Normalizar brilho da cor', 'check'],
    ['bgMode', 'Fundo da célula', 'select', { none: 'transparente', dim: 'cor escurecida', full: 'cor cheia' }],
    ['bgDim', 'Força do fundo', 'range', [0, 1, 0.01]],
    ['alphaThreshold', 'Limiar de alfa', 'range', [0, 1, 0.01]],
    ['chroma', 'Chroma key (remover cor)', 'check'],
    ['chromaColor', 'Cor do chroma', 'color'],
    ['chromaTol', 'Tolerância chroma', 'range', [0, 1, 0.01]],
    ['edgeThreshold', 'Limiar de contorno', 'range', [0.05, 2, 0.01]],
    ['edgeMin', 'Mín. pixels de contorno', 'range', [1, 20, 1]],
    ['brailleThreshold', 'Limiar braille', 'range', [0, 1, 0.01]],
  ];
  const showFor = {
    ramp: ['ramp', 'edge'],
    glyphSet: ['glyph'],
    measuredRamp: ['ramp', 'edge'],
    autoLevels: ['ramp', 'edge'],
    glyphSharpen: ['glyph'],
    edgeThreshold: ['edge'],
    edgeMin: ['edge'],
    brailleThreshold: ['braille'],
    dither: ['ramp', 'edge', 'braille'],
    invert: ['ramp', 'edge', 'glyph', 'braille'],
    bgMode: ['ramp', 'edge', 'glyph'],
    bgDim: ['ramp', 'edge', 'glyph'],
    normalizeColor: ['ramp', 'edge', 'glyph', 'braille'],
  };

  function field([k, label, type, arg]) {
    const v = S.opts[k];
    let input;
    if (type === 'select') input = `<select data-k="${k}">${Object.entries(arg).map(([val, l]) => `<option value="${val}" ${val == v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    else if (type === 'number') input = `<input type="number" data-k="${k}" min="${arg[0]}" max="${arg[1]}" step="${arg[2]}" value="${v}">`;
    else if (type === 'range') input = `<input type="range" data-k="${k}" min="${arg[0]}" max="${arg[1]}" step="${arg[2]}" value="${v}"><span>${v}</span>`;
    else if (type === 'check') return `<label class="chk" data-row="${k}"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
    else if (type === 'color') input = `<input type="color" data-k="${k}" value="${v}">`;
    else if (type === 'ramp')
      input = `<select id="cvRampPreset">${Object.entries(AF.RAMPS).map(([n, r]) => `<option value="${n}" ${r === v ? 'selected' : ''}>${n}</option>`).join('')}<option value="">personalizada</option></select><input data-k="ramp" value="${v.replace(/"/g, '&quot;')}" class="mono">`;
    return `<label data-row="${k}">${label} ${input}</label>`;
  }

  function html() {
    return `
    <div class="cv-left panel">
      <div id="cvDrop" class="drop">Solte imagens aqui, cole (Ctrl+V) ou <label class="linkish">escolha arquivos<input type="file" id="cvFile" accept="image/*" multiple hidden></label><br><small>PNG/JPG/WebP • GIF animado vira animação • várias imagens = quadros</small></div>
      <div class="canvas-wrap small checker"><canvas id="cvSrc"></canvas></div>
      <div id="cvInfo" class="hint"></div>
      <h4>Spritesheet</h4>
      <label class="chk"><input type="checkbox" id="shOn"> recortar como spritesheet</label>
      <div class="row4"><label>colunas <input type="number" id="shCols" min="1" value="4"></label><label>linhas <input type="number" id="shRows" min="1" value="1"></label><label>quadros <input type="number" id="shCount" min="0" value="0" title="0 = todos"></label><label>fps <input type="number" id="cvFps" min="1" max="60" value="8"></label></div>
      <button id="cvDemo">Usar imagem de exemplo</button>
    </div>
    <div class="cv-mid panel" id="cvParams"></div>
    <div class="cv-right">
      <div class="ed-bar"><b>Resultado</b> <span class="hint" id="cvStat"></span></div>
      <div class="canvas-wrap checker" id="cvOutWrap"><canvas id="cvOut"></canvas></div>
      <div class="cv-actions panel">
        <label>Tipo <select id="cvKind"><option value="sprite">sprite</option><option value="tile">tile</option><option value="fx">FX</option><option value="prop">decoração</option><option value="bg">fundo</option></select></label>
        <input id="cvName" placeholder="nome do asset" value="convertido">
        <button id="cvNew" class="primary">Criar novo asset</button>
        <button id="cvAppend" title="adiciona como nova animação no asset aberto no editor">+ como animação no asset atual</button>
        <button id="cvFit" title="usa largura/altura do asset atual">Ajustar ao asset atual</button>
        <button id="cvCopy">Copiar texto</button>
      </div>
    </div>`;
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 90);
  };

  function sources() {
    if (!S.srcs.length) return [];
    if (S.sheet.on && S.srcs.length === 1) return AF.sliceSheet(S.srcs[0], S.sheet.cols, S.sheet.rows, S.sheet.count);
    return S.srcs;
  }

  function run() {
    const src = sources();
    if (!src.length) return;
    const t = performance.now();
    S.result = src.map((c) => AF.convert(c, S.opts));
    const g = S.result[0];
    $('#cvStat').textContent = `${g.w}×${g.h} chars • ${S.result.length} quadro(s) • ${(performance.now() - t).toFixed(0)} ms`;
  }

  async function loadFiles(files) {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const out = [];
    if (files.length === 1) {
      const anim = await AF.decodeAnimated(files[0]);
      if (anim) {
        S.srcs = anim.frames;
        S.fps = anim.fps;
        $('#cvFps').value = S.fps;
        afterLoad(files[0].name + ` (GIF/animado: ${anim.frames.length} quadros)`);
        return;
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const f of files) out.push(await createImageBitmap(f));
    S.srcs = out.map((bmp) => {
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      return c;
    });
    afterLoad(files.map((f) => f.name).join(', '));
  }
  function afterLoad(name) {
    const s = S.srcs[0];
    $('#cvInfo').textContent = `${name} — ${s.width}×${s.height}px`;
    $('#cvName').value = (name.split(/[.,(]/)[0] || 'convertido').trim().slice(0, 24);
    const src = $('#cvSrc');
    const k = Math.min(1, 300 / s.width, 220 / s.height);
    src.width = Math.max(1, s.width * k);
    src.height = Math.max(1, s.height * k);
    const ctx = src.getContext('2d');
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(s, 0, 0, src.width, src.height);
    if (S.sheet.on && S.srcs.length === 1) {
      ctx.strokeStyle = '#ffd23f';
      for (let i = 1; i < S.sheet.cols; i++) {
        ctx.beginPath();
        ctx.moveTo((src.width * i) / S.sheet.cols, 0);
        ctx.lineTo((src.width * i) / S.sheet.cols, src.height);
        ctx.stroke();
      }
      for (let i = 1; i < S.sheet.rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (src.height * i) / S.sheet.rows);
        ctx.lineTo(src.width, (src.height * i) / S.sheet.rows);
        ctx.stroke();
      }
    }
    schedule();
  }

  // imagem de exemplo desenhada em canvas (esfera iluminada + personagem simples)
  function demoImage() {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, '#1d2b53');
    sky.addColorStop(1, '#ff77a8');
    x.fillStyle = sky;
    x.fillRect(0, 0, 320, 240);
    const sun = x.createRadialGradient(110, 90, 5, 130, 110, 70);
    sun.addColorStop(0, '#fff1e8');
    sun.addColorStop(0.5, '#ffa300');
    sun.addColorStop(1, '#ab5236');
    x.fillStyle = sun;
    x.beginPath();
    x.arc(130, 110, 60, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#1a1c2c';
    x.beginPath();
    x.moveTo(0, 240);
    for (let i = 0; i <= 320; i += 20) x.lineTo(i, 180 - Math.sin(i / 30) * 25 - (i % 40));
    x.lineTo(320, 240);
    x.fill();
    x.fillStyle = '#38b764';
    x.fillRect(0, 215, 320, 25);
    return c;
  }

  AF.Convert = {
    state: S,
    init(root) {
      root.innerHTML = html();
      this.renderParams();
      $('#cvFile').onchange = (e) => loadFiles(e.target.files);
      const drop = $('#cvDrop');
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add('over'))));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        loadFiles(e.dataTransfer.files);
      });
      window.addEventListener('paste', (e) => {
        if (AF.App.view !== 'convert') return;
        const files = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile());
        if (files.length) loadFiles(files);
      });
      const sheet = () => {
        S.sheet = { on: $('#shOn').checked, cols: Math.max(1, +$('#shCols').value), rows: Math.max(1, +$('#shRows').value), count: Math.max(0, +$('#shCount').value) };
        if (S.srcs.length) afterLoad($('#cvInfo').textContent.split(' — ')[0]);
      };
      ['#shOn', '#shCols', '#shRows', '#shCount'].forEach((s) => ($(s).onchange = sheet));
      $('#cvFps').onchange = (e) => (S.fps = AF.clamp(+e.target.value || 8, 1, 60));
      $('#cvDemo').onclick = () => {
        S.srcs = [demoImage()];
        afterLoad('exemplo');
      };
      $('#cvNew').onclick = () => this.commit(true);
      $('#cvAppend').onclick = () => this.commit(false);
      $('#cvFit').onclick = () => {
        const a = AF.currentAsset();
        if (!a) return AF.toast('Abra um asset no editor primeiro');
        S.opts.cols = a.w;
        S.opts.rows = a.h;
        this.renderParams();
        schedule();
      };
      $('#cvCopy').onclick = () => {
        if (!S.result.length) return;
        navigator.clipboard.writeText(AF.Grid.toText(S.result[0])).then(() => AF.toast('Texto copiado'));
      };
      requestAnimationFrame(this.loop.bind(this));
    },

    renderParams() {
      const el = $('#cvParams');
      el.innerHTML = '<h4>Parâmetros</h4>' + spec.map(field).join('') + '<div class="hint" id="cvModeHint"></div>';
      el.oninput = (e) => {
        const k = e.target.dataset.k;
        if (!k) return;
        let v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' || e.target.type === 'range' ? +e.target.value : e.target.value;
        S.opts[k] = v;
        if (e.target.type === 'range') e.target.nextElementSibling.textContent = v;
        if (k === 'ramp') $('#cvRampPreset').value = Object.keys(AF.RAMPS).find((n) => AF.RAMPS[n] === v) || '';
        if (k === 'mode') this.visibility();
        schedule();
      };
      $('#cvRampPreset').onchange = (e) => {
        if (!e.target.value) return;
        S.opts.ramp = AF.RAMPS[e.target.value];
        el.querySelector('[data-k="ramp"]').value = S.opts.ramp;
        schedule();
      };
      this.visibility();
    },

    visibility() {
      const mode = S.opts.mode;
      for (const [k, modes] of Object.entries(showFor)) {
        const row = document.querySelector(`#cvParams [data-row="${k}"]`);
        if (row) row.style.display = modes.includes(mode) ? '' : 'none';
      }
      const hints = {
        ramp: 'Média de luminância por célula → índice na rampa. Rápido, estilo clássico (jp2a / ascii-image-converter).',
        glyph: 'Compara a forma da célula (4×8 amostras) com o bitmap renderizado de cada glifo e escolhe o mais parecido. Preserva contornos.',
        edge: 'DoG + Sobel: onde há borda forte, o ângulo do gradiente escolhe | - _ / \\ ; o resto usa a rampa (shader do Acerola).',
        braille: '2×4 sub-pixels por célula = 256 padrões braille. Ótimo para detalhe fino em pouco espaço (drawille).',
        half: 'Cada célula = 2 pixels verticais com cor de frente e de fundo (▀). Fiel à imagem, visual "pixel art".',
        quad: 'Cada célula = 2×2 pixels; escolhe o quadrante e o par de cores com menor erro (chafa).',
      };
      $('#cvModeHint').textContent = hints[mode];
    },

    commit(asNew) {
      if (!S.result.length) return AF.toast('Carregue uma imagem primeiro');
      const g0 = S.result[0];
      const frames = S.result.map((g) => AF.Grid.clone(g));
      if (asNew) {
        const kind = $('#cvKind').value;
        const a = { id: AF.uid(), name: $('#cvName').value || 'convertido', kind, w: g0.w, h: g0.h, solid: kind === 'tile', emissive: false, anims: [{ name: 'idle', fps: S.fps, loop: true, frames }] };
        AF.project.assets.push(a);
        AF.App.select(a.id);
      } else {
        const a = AF.currentAsset();
        if (!a) return AF.toast('Nenhum asset aberto no editor');
        a.anims.push({ name: $('#cvName').value || 'convertido', fps: S.fps, loop: true, frames: frames.map((g) => AF.Grid.resize(g, a.w, a.h, 0.5, 1)) });
        AF.edState.anim = a.anims.length - 1;
        AF.edState.frame = 0;
      }
      AF.markDirty();
      AF.App.refreshAssets();
      AF.toast('Enviado ao editor');
      AF.App.show('editor');
    },

    loop(now) {
      requestAnimationFrame(this.loop.bind(this));
      if (AF.App.view !== 'convert' || !S.result.length) return;
      const i = Math.floor(((now - S.t0) / 1000) * S.fps) % S.result.length;
      if (i === this.lastI && this.lastRes === S.result) return;
      this.lastI = i;
      this.lastRes = S.result;
      AF.renderGridCanvas(S.result[i], AF.App.zoom(), $('#cvOut'));
    },
  };
})();

// Servidor local da ASCII Engine: serve a engine e gera a build do jogo quando o editor pede.
// Uso: node engine-server.js   (ou dois cliques em "ASCII Engine.bat")
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const ROOT = __dirname;
const SB = path.join(ROOT, 'steam-build');
const PORT = +process.env.PORT || 5173;
const URL = `http://127.0.0.1:${PORT}/engine/index.html?editor`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

const pkgPath = path.join(SB, 'package.json');
const pkg = () => JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const exePath = () => path.join(SB, 'dist', 'win-unpacked', pkg().productName + '.exe');
const job = { running: false, ok: null, log: [], started: 0, finished: 0, step: '' };
const say = (line) => {
  for (const l of String(line).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) if (l.trim()) job.log.push(l.trimEnd());
  if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
};
const run = (cmd, args) =>
  new Promise((resolve) => {
    say('> ' + cmd + ' ' + args.join(' '));
    const p = spawn(cmd, args, { cwd: SB, shell: true });
    p.stdout.on('data', say);
    p.stderr.on('data', say);
    p.on('close', resolve);
    p.on('error', (e) => (say('erro: ' + e.message), resolve(1)));
  });

async function build({ data, zip, version }) {
  Object.assign(job, { running: true, ok: null, log: [], started: Date.now(), finished: 0 });
  try {
    job.step = 'salvando o jogo';
    fs.writeFileSync(path.join(SB, 'game-data.js'), data);
    say(`game-data.js salvo (${Math.round(data.length / 1024)} KB)`);
    if (version && /^\d+\.\d+\.\d+$/.test(version)) {
      const p = pkg();
      p.version = version;
      fs.writeFileSync(pkgPath, JSON.stringify(p, null, 2) + '\n');
      say('versão ' + version);
    }
    if (!fs.existsSync(path.join(SB, 'node_modules', 'electron-builder'))) {
      job.step = 'instalando dependências (só na primeira vez)';
      if ((await run('npm', ['install'])) !== 0) throw new Error('npm install falhou');
    }
    // a build antiga aberta trava os arquivos da pasta: fecha antes de substituir
    job.step = 'fechando a build anterior';
    await new Promise((r) => exec(`taskkill /F /IM "${pkg().productName}.exe"`, (err) => (err || say('build anterior fechada'), setTimeout(r, err ? 0 : 1500))));
    job.step = 'empacotando o executável';
    const code = await run('npm', ['run', 'dist']);
    if (code !== 0 || !fs.existsSync(exePath())) throw new Error('o empacotador terminou com erro (código ' + code + ')');
    if (zip) {
      job.step = 'gerando o .zip';
      if ((await run('npm', ['run', 'dist:zip'])) !== 0) say('aviso: o .zip falhou, mas o executável foi gerado');
    }
    job.ok = true;
    job.step = 'pronto';
    say('✔ Build pronta: ' + exePath());
  } catch (e) {
    job.ok = false;
    job.step = 'falhou';
    if (job.log.some((l) => /Access is denied|EBUSY|EPERM/i.test(l))) say('Dica: algum arquivo da pasta dist está em uso. Feche o jogo ou a pasta aberta no Explorer e tente de novo.');
    say('✖ ' + e.message);
  }
  job.running = false;
  job.finished = Date.now();
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const body = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  const u = new globalThis.URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/ping') return send(res, 200, { ok: true, product: pkg().productName, version: pkg().version });
    if (u.pathname === '/api/status') {
      const exe = exePath(), has = fs.existsSync(exe);
      return send(res, 200, { running: job.running, ok: job.ok, step: job.step, log: job.log.slice(-80), started: job.started, finished: job.finished, exe, hasExe: has, built: has ? fs.statSync(exe).mtimeMs : 0, version: pkg().version, product: pkg().productName });
    }
    if (req.method === 'POST' && u.pathname === '/api/build') {
      if (job.running) return send(res, 409, { error: 'já existe uma build em andamento' });
      const o = JSON.parse(await body(req));
      if (!o.data || !String(o.data).startsWith('window.GAME_DATA')) return send(res, 400, { error: 'dados do jogo inválidos' });
      build(o);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/api/open') {
      exec(`explorer "${path.dirname(exePath())}"`);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/api/play') {
      if (!fs.existsSync(exePath())) return send(res, 404, { error: 'gere a build primeiro' });
      spawn(exePath(), [], { detached: true, stdio: 'ignore', cwd: path.dirname(exePath()) }).unref();
      return send(res, 200, { ok: true });
    }
    // arquivos estáticos da pasta do projeto
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT) || f.includes(path.sep + 'node_modules' + path.sep)) return send(res, 403, { error: 'proibido' });
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404);
        return res.end('não encontrado');
      }
      const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
      // pedidos parciais (Range): o navegador usa para repetir e voltar ao início das músicas
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
        if (a >= st.size || a > b) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          return res.end();
        }
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
        return fs.createReadStream(f, { start: a, end: b }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

const openBrowser = () => process.argv.includes('--no-open') || exec(`start "" "${URL}"`);
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('A engine já está aberta em ' + URL);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
  } else throw e;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('ASCII Engine rodando em ' + URL);
  console.log('Deixe esta janela aberta enquanto usa a engine. Feche para encerrar.');
  openBrowser();
});

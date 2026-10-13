'use strict';
// Copia a engine para ./app e inclui o game-data.js exportado pelo editor.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const engine = path.join(root, '..', 'engine');
const out = path.join(root, 'app');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'js'), { recursive: true });
fs.copyFileSync(path.join(engine, 'index.html'), path.join(out, 'index.html'));
for (const f of fs.readdirSync(path.join(engine, 'js'))) fs.copyFileSync(path.join(engine, 'js', f), path.join(out, 'js', f));

const data = path.join(root, 'game-data.js');
if (fs.existsSync(data)) {
  fs.copyFileSync(data, path.join(out, 'game-data.js'));
  console.log('✔ game-data.js incluído (' + Math.round(fs.statSync(data).size / 1024) + ' KB)');
} else {
  console.warn('⚠ game-data.js não encontrado: a build vai abrir o projeto padrão com o editor ligado.');
  console.warn('  Exporte pelo editor (Mundo → Exportar jogo) e salve em ' + root);
}
console.log('✔ engine copiada para ' + out);

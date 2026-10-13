'use strict';
// Gerar a build do jogo direto do editor (fala com o engine-server.js, que roda o empacotador).
(function () {
  const E = window.ENG;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const api = (p, o) => fetch(p, Object.assign({ cache: 'no-store' }, o)).then((r) => r.json());

  E.Build = {
    online: null,
    st: null,
    async ping() {
      if (location.protocol !== 'http:') return (this.online = false);
      try {
        this.st = await api('/api/status');
        this.online = true;
      } catch (e) {
        this.online = false;
      }
      return this.online;
    },
    // monta o painel dentro do editor; gameData() devolve o texto do game-data.js
    async mount(el, gameData) {
      this.el = el;
      this.gameData = gameData;
      el.innerHTML = '<div class="hint">Verificando…</div>';
      await this.ping();
      this.render();
      if (this.st && this.st.running) this.poll();
    },
    render() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      if (!this.online) {
        el.innerHTML = `<div class="hint">Para gerar a build aqui, abra a engine pelo arquivo <b>ASCII Engine.bat</b> (pasta ascii-forge). Ele liga o empacotador e abre esta página no navegador.</div>
          <div class="row"><button id="bRetry">Tentar de novo</button></div>`;
        el.querySelector('#bRetry').onclick = () => this.mount(el, this.gameData);
        return;
      }
      const s = this.st || {};
      const when = s.built ? new Date(s.built).toLocaleString() : '—';
      el.innerHTML = `<div class="hint">Gera o executável do jogo (<b>${esc(s.product || 'jogo')}.exe</b>) com o projeto atual. Na build o editor fica desligado e o jogo abre no menu inicial. A primeira vez demora mais.</div>
        <div class="row"><label>Versão <input id="bVer" value="${esc(s.version || '1.0.0')}" style="width:70px"></label><label><input type="checkbox" id="bZip"> também gerar .zip</label></div>
        <div class="row"><button id="bGo" class="primary" ${s.running ? 'disabled' : ''}>${s.running ? '⚙ Gerando…' : '⚙ Gerar build (.exe)'}</button>
          <button id="bPlay" ${s.hasExe && !s.running ? '' : 'disabled'}>▶ Jogar build</button><button id="bOpen" ${s.hasExe ? '' : 'disabled'}>Abrir pasta</button></div>
        <div class="hint">Última build: ${esc(when)}</div>
        <pre id="bLog" class="ascii" style="max-height:220px;overflow:auto;background:#05060b;border:1px solid #2a2f3e;padding:6px;font-size:11px;white-space:pre-wrap;${s.log && s.log.length ? '' : 'display:none'}"></pre>`;
      this.paintLog();
      el.querySelector('#bGo').onclick = () => this.start();
      el.querySelector('#bPlay').onclick = () => api('/api/play', { method: 'POST' }).then(() => E.toast('Abrindo a build…'));
      el.querySelector('#bOpen').onclick = () => api('/api/open', { method: 'POST' });
    },
    paintLog() {
      const pre = this.el && this.el.querySelector('#bLog');
      const s = this.st;
      if (!pre || !s) return;
      const secs = s.started ? Math.round(((s.running ? Date.now() : s.finished) - s.started) / 1000) : 0;
      const spin = '|/-\\'[Math.floor(Date.now() / 200) % 4];
      const head = s.running ? `${spin} ${s.step}… ${secs}s` : s.ok === true ? `✔ pronto em ${secs}s` : s.ok === false ? '✖ falhou (veja o log)' : '';
      pre.style.display = s.log && s.log.length ? '' : 'none';
      pre.innerHTML = (head ? `<span class="${s.ok === false ? 'hp' : 'acc'}">${esc(head)}</span>\n` : '') + esc((s.log || []).slice(-40).join('\n'));
      pre.scrollTop = pre.scrollHeight;
    },
    async start() {
      E.ProjectIO.saveLocal();
      const ver = (this.el.querySelector('#bVer').value || '').trim();
      const zip = this.el.querySelector('#bZip').checked;
      E.toast('Gerando a build…');
      try {
        const r = await api('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: this.gameData(), zip, version: ver }) });
        if (r.error) return E.toast(r.error);
      } catch (e) {
        this.online = false;
        return this.render();
      }
      await this.ping();
      this.render();
      this.poll();
    },
    poll() {
      clearTimeout(this._t);
      this._t = setTimeout(async () => {
        await this.ping();
        if (!this.st) return;
        if (this.st.running) {
          this.paintLog();
          this.poll();
        } else {
          this.render();
          if (this.st.ok) E.toast('Build pronta! Clique em ▶ Jogar build.');
          else if (this.st.ok === false) E.toast('A build falhou. Veja o log.');
        }
      }, 700);
    },
  };
})();

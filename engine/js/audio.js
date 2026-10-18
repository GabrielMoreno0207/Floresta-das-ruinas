'use strict';
// Áudio: efeitos e ambiente sintetizados (WebAudio) e música em arquivo (audio/musica.mp3 e audio/chefe.mp3,
// com troca suave quando um chefe desperta). Sem os arquivos, a música generativa toca no lugar.
(function () {
  const E = window.ENG;
  const OPT_KEY = 'asciiengine.options';

  E.Options = Object.assign(
    { master: 0.8, music: 0.5, sfx: 0.8, shake: true, fps: false, creative: true, outline: true, filter: 0, grade: 1 },
    (() => {
      try {
        return JSON.parse(localStorage.getItem(OPT_KEY) || '{}');
      } catch (e) {
        return {};
      }
    })()
  );
  E.saveOptions = () => {
    try {
      localStorage.setItem(OPT_KEY, JSON.stringify(E.Options));
    } catch (e) {}
    A.applyVolumes();
  };

  const A = (E.Audio = {
    ctx: null,
    ready: false,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.connect(this.master);
      this.sfxBus = c.createGain();
      this.sfxBus.connect(this.comp);
      this.musicBus = c.createGain();
      this.musicBus.connect(this.comp);
      this.ambBus = c.createGain();
      this.ambBus.connect(this.comp);
      // reverb gerado (resposta de impulso de ruído decaindo)
      this.reverb = c.createConvolver();
      const len = c.sampleRate * 2.8, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      this.reverb.buffer = ir;
      this.revGain = c.createGain();
      this.revGain.gain.value = 0.35;
      this.reverb.connect(this.revGain);
      this.revGain.connect(this.comp);
      // buffer de ruído reutilizável
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.ready = true;
      this.startAmbience();
      this.startMusic();
    },
    resume() {
      if (!this.ctx) this.init();
      else if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    applyVolumes() {
      this.trackVolumes();
      if (!this.ctx) return;
      const o = E.Options, t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(o.master, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(o.sfx, t, 0.05);
      this.musicBus.gain.setTargetAtTime(o.music * 0.55, t, 0.05);
      this.ambBus.gain.setTargetAtTime(o.sfx * 0.6, t, 0.05);
    },

    // ---------- blocos de síntese ----------
    out(pan = 0, vol = 1, rev = 0.15) {
      const c = this.ctx, g = c.createGain();
      g.gain.value = vol;
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.sfxBus);
      if (rev) {
        const r = c.createGain();
        r.gain.value = rev;
        p.connect(r);
        r.connect(this.reverb);
      }
      return g;
    },
    tone(dst, type, f0, f1, dur, vol = 0.3, delay = 0, attack = 0.005) {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(dst);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    },
    noise(dst, ftype, f0, f1, dur, vol = 0.3, delay = 0, q = 1, attack = 0.004) {
      const c = this.ctx, t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = ftype;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(dst);
      s.start(t, Math.random() * 1.5);
      s.stop(t + dur + 0.05);
    },

    // ---------- efeitos ----------
    SFX: {
      passo(a, o) {
        a.noise(o, 'bandpass', 900 + Math.random() * 900, 500, 0.07, 0.18, 0, 1.4);
        a.noise(o, 'lowpass', 300, 120, 0.06, 0.12);
      },
      pulo(a, o) {
        a.tone(o, 'triangle', 260, 520, 0.12, 0.16);
        a.noise(o, 'bandpass', 1500, 700, 0.12, 0.12, 0, 0.8);
      },
      pulo2(a, o) {
        a.tone(o, 'sine', 500, 1100, 0.18, 0.14);
        a.tone(o, 'sine', 750, 1500, 0.16, 0.08, 0.04);
      },
      aterrissar(a, o) {
        a.tone(o, 'sine', 130, 45, 0.16, 0.4);
        a.noise(o, 'lowpass', 600, 100, 0.14, 0.25);
      },
      dash(a, o) {
        a.noise(o, 'bandpass', 600, 3000, 0.2, 0.3, 0, 0.7, 0.02);
        a.tone(o, 'sine', 180, 90, 0.18, 0.15);
      },
      espada(a, o) {
        a.noise(o, 'bandpass', 3200, 700, 0.17, 0.32, 0, 1.6, 0.015);
      },
      acerto(a, o) {
        a.tone(o, 'square', 220, 70, 0.1, 0.22);
        a.noise(o, 'highpass', 2500, 1800, 0.06, 0.25);
        a.tone(o, 'triangle', 1400, 900, 0.07, 0.08, 0.01);
      },
      morte(a, o) {
        a.noise(o, 'lowpass', 1800, 120, 0.45, 0.35);
        [520, 390, 260].forEach((f, i) => a.tone(o, 'square', f, f * 0.9, 0.09, 0.07, i * 0.06));
      },
      ossos(a, o) {
        for (let i = 0; i < 6; i++) a.tone(o, 'square', 900 + Math.random() * 900, 600, 0.04, 0.08, i * 0.045);
      },
      dano(a, o) {
        a.tone(o, 'sawtooth', 240, 90, 0.25, 0.25);
        a.noise(o, 'lowpass', 1200, 300, 0.2, 0.25);
      },
      moeda(a, o) {
        a.tone(o, 'sine', 988, 988, 0.08, 0.16);
        a.tone(o, 'sine', 1319, 1319, 0.22, 0.16, 0.07);
      },
      item(a, o) {
        [523, 659, 784, 1047].forEach((f, i) => a.tone(o, 'triangle', f, f, 0.14, 0.11, i * 0.05));
      },
      porta(a, o) {
        const c = a.ctx, t = c.currentTime;
        const s = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
        s.type = 'sawtooth';
        s.frequency.value = 95;
        lfo.frequency.value = 23;
        lg.gain.value = 25;
        lfo.connect(lg);
        lg.connect(s.frequency);
        f.type = 'bandpass';
        f.frequency.setValueAtTime(700, t);
        f.frequency.linearRampToValueAtTime(1300, t + 0.45);
        f.Q.value = 6;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        s.connect(f);
        f.connect(g);
        g.connect(o);
        s.start(t);
        lfo.start(t);
        s.stop(t + 0.55);
        lfo.stop(t + 0.55);
        a.tone(o, 'sine', 110, 60, 0.12, 0.3, 0.45);
      },
      explosao(a, o) {
        a.noise(o, 'lowpass', 1600, 60, 1.2, 0.7, 0, 0.7);
        a.tone(o, 'sine', 90, 30, 0.6, 0.6);
      },
      magia(a, o) {
        [660, 880, 1100, 1320, 1760].forEach((f, i) => a.tone(o, 'sine', f, f * 1.01, 0.3, 0.06, i * 0.04));
      },
      gelo(a, o) {
        // cristal se partindo: estalo agudo + tilintar
        a.noise(o, 'highpass', 5000, 3000, 0.08, 0.22);
        [2100, 2800, 3500].forEach((f, i) => a.tone(o, 'sine', f, f * 0.98, 0.25, 0.05, i * 0.03));
      },
      tiro(a, o) {
        a.tone(o, 'triangle', 900, 300, 0.15, 0.13);
      },
      agua(a, o) {
        a.noise(o, 'bandpass', 1200, 400, 0.3, 0.25, 0, 2);
      },
      fogo(a, o) {
        [262, 330, 392, 523].forEach((f, i) => a.tone(o, 'triangle', f, f, 1.2, 0.07, i * 0.08, 0.05));
        a.noise(o, 'bandpass', 2500, 2500, 0.6, 0.06, 0, 3);
      },
      bau(a, o) {
        a.tone(o, 'sine', 140, 70, 0.15, 0.3);
        [784, 988, 1175, 1568].forEach((f, i) => a.tone(o, 'sine', f, f, 0.2, 0.09, 0.15 + i * 0.07));
      },
      menu(a, o) {
        a.tone(o, 'square', 660, 660, 0.04, 0.06);
      },
      ok(a, o) {
        a.tone(o, 'square', 660, 660, 0.05, 0.06);
        a.tone(o, 'square', 990, 990, 0.08, 0.06, 0.05);
      },
      colocar(a, o) {
        a.tone(o, 'triangle', 330, 660, 0.08, 0.12);
        a.noise(o, 'lowpass', 900, 200, 0.08, 0.15);
      },
      // ----- criaturas -----
      aranha_passos(a, o) {
        for (let i = 0; i < 4; i++) a.noise(o, 'bandpass', 4200 + Math.random() * 1500, 3000, 0.012, 0.14, i * 0.022, 6);
      },
      aranha_sibilo(a, o) {
        a.noise(o, 'highpass', 3500, 5500, 0.45, 0.16, 0, 1, 0.08);
        a.noise(o, 'bandpass', 6000, 4000, 0.3, 0.08, 0.05, 4);
      },
      aranha_dor(a, o) {
        for (let i = 0; i < 5; i++) a.tone(o, 'square', 1800 + Math.random() * 600, 1200, 0.025, 0.07, i * 0.03);
      },
      aranha_morte(a, o) {
        a.tone(o, 'sawtooth', 1400, 300, 0.35, 0.12);
        a.noise(o, 'lowpass', 1500, 200, 0.25, 0.3, 0.05);
      },
      slime_pulo(a, o) {
        a.tone(o, 'sine', 160, 420, 0.16, 0.28);
        a.noise(o, 'lowpass', 500, 900, 0.1, 0.12, 0, 6);
      },
      slime_plaft(a, o) {
        a.tone(o, 'sine', 220, 70, 0.14, 0.3);
        a.noise(o, 'lowpass', 900, 150, 0.12, 0.22, 0, 3);
      },
      slime_dor(a, o) {
        a.tone(o, 'sine', 500, 260, 0.12, 0.22);
        a.tone(o, 'sine', 380, 190, 0.12, 0.12, 0.05);
      },
      morcego_guincho(a, o) {
        const f = 5200 + Math.random() * 1600;
        a.tone(o, 'sine', f, f * 1.25, 0.05, 0.08);
        a.tone(o, 'sine', f * 1.1, f * 0.9, 0.04, 0.06, 0.07);
      },
      morcego_asas(a, o) {
        a.noise(o, 'bandpass', 700, 400, 0.06, 0.12, 0, 1.5);
      },
      morcego_morte(a, o) {
        a.tone(o, 'sine', 6000, 1800, 0.25, 0.1);
        a.noise(o, 'bandpass', 900, 300, 0.15, 0.15, 0.05);
      },
      ossos_chacoalhar(a, o) {
        for (let i = 0; i < 4; i++) a.tone(o, 'triangle', 700 + Math.random() * 500, 500, 0.03, 0.06, i * 0.06 + Math.random() * 0.02);
      },
      ossos_morte(a, o) {
        for (let i = 0; i < 12; i++) a.tone(o, 'triangle', 500 + Math.random() * 900, 350, 0.04, 0.09, i * 0.035 + Math.random() * 0.02);
        a.tone(o, 'sine', 120, 50, 0.3, 0.2, 0.35);
      },
      arco(a, o) {
        a.tone(o, 'triangle', 180, 120, 0.2, 0.22);
        a.noise(o, 'bandpass', 2400, 900, 0.12, 0.15, 0.01, 2);
      },
      golpe_pesado(a, o) {
        a.noise(o, 'bandpass', 1800, 500, 0.22, 0.3, 0, 1.2, 0.02);
        a.tone(o, 'square', 140, 60, 0.2, 0.18, 0.08);
      },
      metal(a, o) {
        [1650, 2470, 3300].forEach((f, i) => a.tone(o, 'sine', f, f * 0.995, 0.35 - i * 0.08, 0.08, 0));
        a.noise(o, 'highpass', 3000, 2500, 0.05, 0.2);
      },
      espirito_sussurro(a, o) {
        const c = a.ctx, t = c.currentTime;
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = a.noiseBuf;
        f.type = 'bandpass';
        f.Q.value = 9;
        f.frequency.setValueAtTime(600, t);
        f.frequency.linearRampToValueAtTime(1300, t + 0.5);
        f.frequency.linearRampToValueAtTime(800, t + 1.1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
        s.connect(f);
        f.connect(g);
        g.connect(o);
        s.start(t, Math.random());
        s.stop(t + 1.3);
        a.tone(o, 'sine', 1760, 1760, 0.8, 0.03, 0.2, 0.2);
      },
      orbe(a, o) {
        [440, 660, 990].forEach((f, i) => a.tone(o, 'sine', f, f * 2, 0.35, 0.07, i * 0.04));
      },
      espirito_dor(a, o) {
        a.tone(o, 'sine', 900, 500, 0.3, 0.12);
        a.tone(o, 'sine', 1350, 700, 0.3, 0.06);
      },
      espirito_morte(a, o) {
        [1320, 990, 740, 550, 410].forEach((f, i) => a.tone(o, 'sine', f, f * 0.98, 0.6, 0.07, i * 0.09));
        a.noise(o, 'bandpass', 1500, 300, 1, 0.08, 0, 4, 0.2);
      },
      voz_velho(a, o) {
        const f = 110 + Math.random() * 40;
        a.tone(o, 'sawtooth', f, f * (0.9 + Math.random() * 0.2), 0.08, 0.07);
      },
      equipar(a, o) {
        a.tone(o, 'triangle', 300, 300, 0.06, 0.12);
        [1200, 1800].forEach((f, i) => a.tone(o, 'sine', f, f, 0.2, 0.06, 0.05 + i * 0.03));
      },
      bloqueio(a, o) {
        [1500, 2250].forEach((f) => a.tone(o, 'sine', f, f, 0.3, 0.09));
        a.noise(o, 'highpass', 3000, 2000, 0.06, 0.25);
      },
      passaro(a, o) {
        const f = 2400 + Math.random() * 1600;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) a.tone(o, 'sine', f, f * (1.2 + Math.random() * 0.4), 0.07, 0.05, i * 0.11);
      },
      gosma(a, o) {
        a.tone(o, 'sine', 300, 120, 0.2, 0.25);
        a.noise(o, 'lowpass', 700, 200, 0.18, 0.2, 0, 4);
      },
    },
    play(name, opts = {}) {
      if (!this.ready || this.ctx.state !== 'running') return;
      const f = this.SFX[name];
      if (!f) return;
      // limita repetições do mesmo som no mesmo instante
      const now = this.ctx.currentTime;
      this.last ||= {};
      if (this.last[name] && now - this.last[name] < (opts.gap ?? 0.03)) return;
      this.last[name] = now;
      f(this, this.out(opts.pan || 0, opts.vol ?? 1, opts.rev ?? 0.15));
    },
    // som posicionado no mundo (volume/pan pela distância ao jogador)
    at(name, x, y, opts = {}) {
      const p = E.Game.player;
      if (!p) return this.play(name, opts);
      const dx = x - p.x, dy = (y - p.y) * 2, d = Math.hypot(dx, dy);
      const max = opts.range || 160;
      if (d > max) return;
      this.play(name, Object.assign({}, opts, { pan: dx / 90, vol: (opts.vol ?? 1) * Math.pow(1 - d / max, 1.5) }));
    },

    // ---------- ambiente ----------
    startAmbience() {
      const c = this.ctx;
      // vento: ruído filtrado com LFO lento
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.07;
      lg.gain.value = 300;
      lfo.connect(lg);
      lg.connect(f.frequency);
      this.windGain = c.createGain();
      this.windGain.gain.value = 0.05;
      s.connect(f);
      f.connect(this.windGain);
      this.windGain.connect(this.ambBus);
      s.start();
      lfo.start();
      // chuva
      const r = c.createBufferSource();
      r.buffer = this.noiseBuf;
      r.loop = true;
      const rf = c.createBiquadFilter();
      rf.type = 'highpass';
      rf.frequency.value = 1800;
      this.rainGain = c.createGain();
      this.rainGain.gain.value = 0;
      r.connect(rf);
      rf.connect(this.rainGain);
      this.rainGain.connect(this.ambBus);
      r.start();
      this.ambT = 0;
    },
    // chamado todo quadro pelo jogo
    tick(dt) {
      if (this.tracks) this.tickTracks(Math.min(0.1, dt || 0));
      if (!this.ready || this.ctx.state !== 'running') return;
      const G = E.Game, w = G.world, p = G.player;
      if (!w || !p) return;
      const cave = w.inCave(p.x, p.y - 4);
      const sky = w.skyAt(Math.floor(p.x), Math.floor(p.y - 4)) / 255;
      const t = this.ctx.currentTime;
      this.windGain.gain.setTargetAtTime(0.06 * sky + (cave ? 0.015 : 0), t, 0.5);
      this.rainGain.gain.setTargetAtTime((w.settings.rain || 0) * 0.12 * (0.3 + sky * 0.7), t, 0.5);
      this.ambT -= dt;
      if (this.ambT > 0) return;
      this.ambT = 0.08 + Math.random() * 0.25;
      const o = (pan, vol, rev) => this.out(pan, vol, rev);
      const night = !E.Game.isDay;
      if (!cave && sky > 0.5 && !night && Math.random() < 0.06) this.play('passaro', { pan: Math.random() * 2 - 1, vol: 0.5 * sky, gap: 0.5 });
      if (!cave && sky > 0.5 && night && Math.random() < 0.35) {
        // grilos
        const f = 3800 + Math.random() * 900, pan = Math.random() * 2 - 1;
        for (let i = 0; i < 3; i++) this.tone(o(pan, 0.05 * sky, 0.3), 'sine', f, f, 0.03, 1, i * 0.05);
      }
      if ((cave || sky < 0.3) && Math.random() < 0.18) {
        // gotas de caverna com eco
        const f = 900 + Math.random() * 1400;
        this.tone(o(Math.random() * 2 - 1, 0.12, 0.9), 'sine', f * 1.6, f, 0.12, 0.6);
      }
      // crepitar perto de fogo
      let nearFire = 0;
      for (const l of w.lights) if (l.embers) nearFire = Math.max(nearFire, 1 - Math.hypot(l.x - p.x, (l.y - p.y) * 2) / 60);
      for (const e of E.Ents.list) if (e.prefab === 'tocha' || e.prefab === 'fogueira') nearFire = Math.max(nearFire, 1 - Math.hypot(e.x - p.x, (e.y - p.y) * 2) / 60);
      if (nearFire > 0 && Math.random() < 0.8) this.noise(o(Math.random() - 0.5, nearFire * 0.3, 0.05), 'highpass', 2000 + Math.random() * 3000, 1500, 0.02 + Math.random() * 0.03, 1);
    },

    // ---------- música em arquivo: faixa padrão e faixa de chefe, com troca suave ----------
    // (elemento <audio> com volume controlado aqui: funciona no navegador e na build, inclusive em file://)
    tracks: null,
    startTracks() {
      if (this.tracks) return;
      const mk = (src) => {
        const a = new window.Audio();
        a.src = src;
        a.loop = true;
        a.preload = 'auto';
        a.volume = 0;
        a.addEventListener('error', () => (a.failed = true));
        return a;
      };
      this.tracks = { normal: mk('audio/musica.mp3'), chefe: mk('audio/chefe.mp3'), mix: 0, vol: { normal: 0, chefe: 0 } };
      this.tracks.normal.play().catch(() => {});
    },
    // volume real de cada faixa = geral × música × posição da troca (mix: 0 = padrão, 1 = chefe)
    trackVolumes() {
      const T = this.tracks;
      if (!T) return;
      const o = E.Options, base = Math.max(0, Math.min(1, o.master * o.music * 1.2));
      const set = (a, k, v) => {
        T.vol[k] = v;
        a.volume = Math.max(0, Math.min(1, base * v));
      };
      set(T.normal, 'normal', 1 - T.mix);
      set(T.chefe, 'chefe', T.mix);
    },
    tickTracks(dt) {
      const T = this.tracks;
      if (!T) return;
      // chefe acordado (como a barra de vida do chefe) = toca a música de chefe
      const boss = E.Ents && E.Ents.list && E.Ents.list.some((e) => e.kind === 'creature' && e.def && e.def.boss && e.vars && e.vars.awake && !e.dead);
      const want = boss && !T.chefe.failed ? 1 : 0;
      if (want && T.mix === 0) {
        T.chefe.currentTime = 0; // a luta começa do início da faixa
        T.chefe.play().catch(() => {});
      }
      if (!want && T.mix === 1 && !T.normal.failed) T.normal.play().catch(() => {});
      if (want > T.mix) T.mix = Math.min(1, T.mix + dt / 1.2); // entra em ~1,2 s
      else if (want < T.mix) T.mix = Math.max(0, T.mix - dt / 2); // volta em ~2 s
      if (T.mix >= 1 && !T.normal.paused) T.normal.pause();
      if (T.mix <= 0 && !T.chefe.paused) T.chefe.pause();
      if (T.mix < 1 && T.normal.paused && !T.normal.failed) T.normal.play().catch(() => {});
      this.trackVolumes();
    },
    // as faixas tocam se ao menos a padrão carregou; senão fica a música generativa
    get useTracks() {
      return !!(this.tracks && !this.tracks.normal.failed);
    },

    // ---------- música generativa (reserva, sem os arquivos de música) ----------
    startMusic() {
      this.startTracks();
      const c = this.ctx;
      this.musicFilter = c.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 1400;
      this.musicFilter.connect(this.musicBus);
      const mr = c.createGain();
      mr.gain.value = 0.7;
      this.musicFilter.connect(mr);
      mr.connect(this.reverb);
      this.chord = 0;
      this.nextChord = c.currentTime + 0.5;
      this.nextNote = c.currentTime + 2;
      setInterval(() => this.musicStep(), 200);
    },
    musicStep() {
      if (!this.ready || this.ctx.state !== 'running' || this.useTracks) return;
      const c = this.ctx, t = c.currentTime;
      const cave = E.Game.world && E.Game.player && E.Game.world.inCave(E.Game.player.x, E.Game.player.y - 4);
      // progressão menor e lenta; na caverna, mais grave e escura
      const prog = cave ? [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]] : [[57, 64, 69, 72], [53, 60, 65, 69], [48, 55, 60, 64], [55, 62, 67, 71]];
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      this.musicFilter.frequency.setTargetAtTime(cave ? 700 : 1500, t, 2);
      if (t >= this.nextChord) {
        const ch = prog[this.chord++ % prog.length];
        const dur = 8;
        for (const m of ch)
          for (const det of [-6, 6]) {
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'triangle';
            o.frequency.value = mtof(m - 12);
            o.detune.value = det;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.025, t + 2.5);
            g.gain.linearRampToValueAtTime(0.02, t + dur - 2);
            g.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
            o.connect(g);
            g.connect(this.musicFilter);
            o.start(t);
            o.stop(t + dur + 1.2);
          }
        this.curChord = ch;
        this.nextChord = t + dur;
      }
      if (t >= this.nextNote && this.curChord) {
        // dedilhado esparso na escala pentatônica
        const scale = [0, 3, 5, 7, 10];
        const root = this.curChord[0] + 12;
        const m = root + scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.value = mtof(m);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(g);
        g.connect(this.musicFilter);
        o.start(t);
        o.stop(t + 2.3);
        this.nextNote = t + 0.6 + Math.random() * 2.4;
      }
    },
  });

  // navegadores só liberam áudio após uma interação
  const unlock = () => A.resume();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
})();

'use strict';
// Camada 2D sobre o WebGL: gizmos do editor (colisores, spawners, gatilhos, objetos, luzes, pincel) e depuração.
(function () {
  const E = window.ENG;
  const G = () => E.Game;

  E.Overlay = {
    init() {
      this.cv = document.getElementById('overlay');
      this.ctx = this.cv.getContext('2d');
    },
    draw() {
      const r = E.Renderer, cv = this.cv, ctx = this.ctx;
      const ed = E.Editor && E.Editor.active;
      if (cv.width !== r.canvas.width || cv.height !== r.canvas.height) {
        cv.width = r.canvas.width;
        cv.height = r.canvas.height;
      }
      ctx.clearRect(0, 0, cv.width, cv.height);
      // trajetória da flecha enquanto o arco é puxado: caracteres ASCII na grade do jogo, tracejados, com o traço
      // virado para a direção da curva (- \ | /); desenhados por cima, sem esconder o cenário
      const pl = G().player;
      if (pl && pl.bow && pl.aimPath && pl.aimPath.length && !(E.Editor && E.Editor.active)) {
        const rr = E.Renderer, cx0 = G().cam.x, cy0 = G().cam.y, asp = rr.ch / rr.cw;
        ctx.save();
        ctx.font = `bold ${Math.round(rr.ch * 0.95)}px 'Cascadia Mono','Consolas','DejaVu Sans Mono',monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255,200,110,0.85)';
        ctx.shadowBlur = rr.cw * 0.9;
        const path = pl.aimPath;
        let lastCell = '', n = 0;
        for (let i = 0; i < path.length; i++) {
          const q = path[i], cx = Math.floor(q.x), cy = Math.floor(q.y), key = cx + ',' + cy;
          if (key === lastCell) continue;
          lastCell = key;
          if (n++ % 3 === 2) continue; // tracejado: 2 traços, 1 vazio
          const nx = path[Math.min(path.length - 1, i + 1)], pv = path[Math.max(0, i - 1)];
          const an = ((Math.atan2((nx.y - pv.y) * asp, nx.x - pv.x) % Math.PI) + Math.PI) % Math.PI;
          const ch = an < 0.39 || an > 2.75 ? '-' : an < 1.18 ? '\\' : an < 1.96 ? '|' : '/';
          ctx.fillStyle = `rgb(${q.c.map((v) => Math.round(Math.min(255, v))).join(',')})`;
          ctx.fillText(ch, (cx + 0.5 - cx0) * rr.cw, (cy + 0.5 - cy0) * rr.ch);
        }
        // ponta: onde a flecha cai/acerta
        const end = path[path.length - 1];
        ctx.fillStyle = 'rgb(255,235,160)';
        ctx.fillText('x', (Math.floor(end.x) + 0.5 - cx0) * rr.cw, (Math.floor(end.y) + 0.5 - cy0) * rr.ch);
        ctx.restore();
      }
      const cre = E.Creative && E.Creative.active;
      if (!ed && !G().showColliders && !cre) return;
      const cw = r.cw, ch = r.ch;
      const camX = G().cam.x, camY = G().cam.y;
      const X = (wx) => (wx - camX) * cw, Y = (wy) => (wy - camY) * ch;
      const w = G().world;
      const Ed = E.Editor;
      const showCol = G().showColliders || (ed && Ed.tab === 'colisao');
      if (showCol) {
        const x0 = Math.floor(camX), y0 = Math.floor(camY);
        for (let y = y0; y < y0 + r.rows; y++)
          for (let x = x0; x < x0 + r.cols; x++) {
            const t = w.cellType(x, y);
            if (!t || t === 3) continue;
            const explicit = w.col[w.idx(x, y)];
            ctx.fillStyle = `rgba(${E.CT_INFO[t].color.join(',')},${explicit ? 0.45 : 0.16})`;
            ctx.fillRect(X(x), Y(y), cw, ch);
          }
        ctx.lineWidth = 1;
        for (const e of [G().player, ...E.Ents.list]) {
          if (!e.w) continue;
          ctx.strokeStyle = e === G().player ? '#5f5' : e.kind === 'item' ? '#ff5' : '#f55';
          ctx.strokeRect(X(e.x - e.w / 2), Y(e.y - e.h), e.w * cw, e.h * ch);
        }
      }
      if (cre && !ed) {
        const t = E.Creative.target();
        if (t) {
          const bw = t.def.sw || t.def.w, bh = t.def.sh || t.def.h;
          ctx.strokeStyle = 'rgba(255,210,63,0.9)';
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(X(t.x - bw / 2), Y(t.y - bh), bw * cw, bh * ch);
          ctx.setLineDash([]);
          ctx.font = `${Math.max(12, ch * 1.4)}px Cascadia Mono, Consolas, monospace`;
          ctx.fillStyle = '#ffd23f';
          ctx.fillText('+ ' + t.def.name, X(t.x - bw / 2), Y(t.y - bh) - 4);
        }
      }
      if (!ed) return;
      ctx.font = `${Math.max(11, ch)}px system-ui`;
      const label = (s, x, y, col) => {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const tw = ctx.measureText(s).width;
        ctx.fillRect(x - 2, y - ch - 2, tw + 4, ch + 4);
        ctx.fillStyle = col;
        ctx.fillText(s, x, y);
      };
      const isSel = (o) => Ed.sel && Ed.sel.ref === o;
      for (const s of w.spawners) {
        ctx.strokeStyle = isSel(s) ? '#fff' : '#ff6a5a';
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(X(s.x), Y(s.y), s.w * cw, s.h * ch);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,90,70,0.07)';
        ctx.fillRect(X(s.x), Y(s.y), s.w * cw, s.h * ch);
        label(`⟳ ${E.Project.prefabs[s.prefab]?.name || s.prefab} · ${s.interval}s · máx ${s.max}${s.active ? '' : ' (off)'}`, X(s.x) + 2, Y(s.y) - 3, '#ffaa9a');
      }
      for (const t of w.triggers) {
        ctx.strokeStyle = isSel(t) ? '#fff' : '#5ac8ff';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(X(t.x), Y(t.y), t.w * cw, t.h * ch);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(90,200,255,0.07)';
        ctx.fillRect(X(t.x), Y(t.y), t.w * cw, t.h * ch);
        label(`⚡ ${t.id}${t.once ? ' (1x)' : ''}`, X(t.x) + 2, Y(t.y) - 3, '#9adcff');
      }
      for (const d of w.entities) {
        const def = d.prefab === '__item' ? null : E.Project.prefabs[d.prefab];
        const bw = def ? def.sw || def.w : 3, bh = def ? def.sh || def.h : 2;
        ctx.strokeStyle = isSel(d) ? '#fff' : def ? '#ffd23f' : '#9f9';
        ctx.strokeRect(X(d.x - bw / 2), Y(d.y - bh), bw * cw, bh * ch);
        if (def) {
          ctx.strokeStyle = 'rgba(255,80,80,0.8)';
          ctx.strokeRect(X(d.x - def.w / 2), Y(d.y - def.h), def.w * cw, def.h * ch);
        }
        if (isSel(d) || Ed.tab === 'objetos') label(def ? def.name : '◆ ' + (E.Project.items[d.props.item]?.name || d.props.item), X(d.x - bw / 2), Y(d.y - bh) - 3, def ? '#ffd23f' : '#9f9');
      }
      for (const l of w.lights) {
        ctx.strokeStyle = isSel(l) ? '#fff' : E.rgbHex(l.c);
        ctx.beginPath();
        ctx.arc(X(l.x), Y(l.y), 6, 0, 7);
        ctx.stroke();
        if (isSel(l)) {
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.ellipse(X(l.x), Y(l.y), l.r * cw, (l.r * cw) / 1, 0, 0, 7);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      label('▼ início', X(w.spawn.x) - 20, Y(w.spawn.y - 17), '#7f7');
      if (Ed.rect) {
        const { x0, y0, x1, y1 } = Ed.rect;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(X(Math.min(x0, x1)), Y(Math.min(y0, y1)), (Math.abs(x1 - x0) + 1) * cw, (Math.abs(y1 - y0) + 1) * ch);
      }
      const m = Ed.mouse;
      if (m && (Ed.tab === 'pintar' || Ed.tab === 'colisao') && Ed.tool === 'pincel') {
        ctx.strokeStyle = 'rgba(255,210,63,0.85)';
        ctx.beginPath();
        ctx.ellipse(X(Math.floor(m.x) + 0.5), Y(Math.floor(m.y) + 0.5), Ed.size * cw, Ed.size * cw, 0, 0, 7);
        ctx.stroke();
      }
      if (m && Ed.ghost) {
        const g = Ed.ghost;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(X(Math.floor(m.x) - g.w / 2), Y(Math.floor(m.y) - g.h + 1), g.w * cw, g.h * ch);
        ctx.setLineDash([]);
      }
    },
  };
})();

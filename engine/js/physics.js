'use strict';
// Física de corpos em células: X e Y separados em sub-passos, degraus, plataformas vazadas, escadas, água e perigo.
(function () {
  const E = window.ENG;
  const CT = E.CT;

  const P = (E.Phys = {
    // algum tipo de célula `type` sobreposto à caixa (x = centro, y = pés)
    overlaps(w, x, y, bw, bh, type) {
      const x0 = Math.floor(x - bw / 2), x1 = Math.floor(x + bw / 2 - 0.001);
      const y0 = Math.floor(y - bh), y1 = Math.floor(y - 0.001);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (w.cellType(xx, yy) === type) return true;
      return false;
    },
    solidBox(w, x, y, bw, bh) {
      return P.overlaps(w, x, y, bw, bh, CT.SOLID);
    },
    // linha de chão (somente plataforma vazada) logo abaixo dos pés
    oneWayRow(w, x, row, bw) {
      const x0 = Math.floor(x - bw / 2), x1 = Math.floor(x + bw / 2 - 0.001);
      for (let xx = x0; xx <= x1; xx++) if (w.cellType(xx, row) === CT.ONEWAY) return true;
      return false;
    },

    // b: {x, y, w, h, vx, vy, drop, noClip}; atualiza onGround, onWall, inWater, onLadder, inHazard
    move(b, dt, w, opts = {}) {
      b.hitWall = 0;
      if (b.noClip) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        return;
      }
      const dx = b.vx * dt;
      const nx = Math.ceil(Math.abs(dx) / 0.4) || 1;
      for (let s = 0; s < nx; s++) {
        const tx = b.x + dx / nx;
        if (!P.solidBox(w, tx, b.y, b.w, b.h)) {
          b.x = tx;
          continue;
        }
        let stepped = false;
        if (opts.step && b.onGround)
          for (let k = 1; k <= opts.step; k++)
            if (!P.solidBox(w, tx, b.y - k, b.w, b.h)) {
              b.x = tx;
              b.y -= k;
              stepped = true;
              break;
            }
        if (!stepped) {
          b.hitWall = Math.sign(dx);
          b.vx = 0;
          break;
        }
      }
      const dy = b.vy * dt;
      const ny = Math.ceil(Math.abs(dy) / 0.4) || 1;
      const was = b.onGround;
      b.onGround = false;
      for (let s = 0; s < ny; s++) {
        const ty = b.y + dy / ny;
        if (dy > 0 && !b.drop) {
          const r0 = Math.floor(b.y - 0.001), r1 = Math.floor(ty - 0.001);
          if (r1 > r0 && P.oneWayRow(w, b.x, r1, b.w)) {
            b.y = r1;
            b.vy = 0;
            b.onGround = true;
            break;
          }
        }
        if (!P.solidBox(w, b.x, ty, b.w, b.h)) {
          b.y = ty;
          continue;
        }
        if (dy > 0) {
          b.y = Math.floor(ty - 0.001) <= Math.floor(b.y) ? b.y : Math.floor(ty);
          b.onGround = true;
        } else b.hitCeil = true;
        b.vy = 0;
        break;
      }
      // continua no chão se está exatamente apoiado
      if (!b.onGround && b.vy >= 0) {
        if (P.solidBox(w, b.x, b.y + 0.05, b.w, b.h) || (!b.drop && Math.abs(b.y - Math.round(b.y)) < 0.02 && P.oneWayRow(w, b.x, Math.round(b.y), b.w))) b.onGround = true;
      }
      b.landed = !was && b.onGround;
      // sensores
      const mid = b.y - b.h / 2;
      b.onWall = P.solidBox(w, b.x + 0.35, b.y - 1, b.w, b.h - 2) ? 1 : P.solidBox(w, b.x - 0.35, b.y - 1, b.w, b.h - 2) ? -1 : 0;
      b.inWater = w.cellType(Math.floor(b.x), Math.floor(mid)) === CT.WATER;
      b.onLadder = P.overlaps(w, b.x, b.y, Math.min(2, b.w), b.h, CT.LADDER);
      b.inHazard = P.overlaps(w, b.x, b.y + 0.5, b.w, b.h, CT.HAZARD);
    },
  });
})();

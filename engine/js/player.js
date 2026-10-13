'use strict';
// Controlador do jogador + renderização do herói (com capa e cachecol em física verlet).
(function () {
  const E = window.ENG;
  const G = () => E.Game;

  E.DEFAULT_PLAYER = {
    maxHp: 6, speed: 38, accel: 380, airAccel: 250, jump: 68, gravity: 140, fallGravity: 195, maxFall: 100,
    dashSpeed: 105, dashTime: 0.14, dashCooldown: 0.45, wallSlide: 16, wallJumpX: 44, wallJumpY: 64,
    climbSpeed: 28, coyote: 0.1, buffer: 0.13, doubleJump: true, wallJump: true, dash: true,
  };

  const chain = (n, x, y) => Array.from({ length: n }, () => ({ x, y, px: x, py: y }));

  E.Player = {
    create(x, y) {
      const T = E.Project.player;
      return {
        x, y, vx: 0, vy: 0, w: 6, h: 17, facing: 1, state: 'idle', t: 0, phase: 0,
        hp: T.maxHp + ((G().inv && G().inv.bonusHp) || 0), maxHp: T.maxHp + ((G().inv && G().inv.bonusHp) || 0), coyote: 0, jumpBuf: 0, dashT: 0, dashCD: 0, airDash: true, airJumps: 1,
        wallLock: 0, attack: null, atkQueue: false, hurtT: 0, invuln: 0, landT: 0, onGround: false, drop: 0,
        cape: chain(6, x * 8, y * 16), scarf: chain(6, x * 8, y * 16), status: {}, ghosts: [],
      };
    },

    update(p, dt) {
      const T = E.Project.player, k = G().keys, pr = G().pressed, w = G().world;
      const left = k.ArrowLeft || k.KeyA, right = k.ArrowRight || k.KeyD, up = k.ArrowUp || k.KeyW, down = k.ArrowDown || k.KeyS;
      const jumpP = pr.Space || pr.KeyW || pr.ArrowUp;
      const jumpH = k.Space || k.KeyW || k.ArrowUp;
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      const spd = T.speed * E.Status.speed(p) * (G().inv ? G().inv.speedMul() : 1);
      p.t += dt;
      if (p.invuln > 0) p.invuln -= dt;
      if (p.hurtT > 0) p.hurtT -= dt;
      if (p.dashCD > 0) p.dashCD -= dt;
      if (p.wallLock > 0) p.wallLock -= dt;
      if (p.landT > 0) p.landT -= dt;
      if (p.drop > 0) p.drop -= dt;
      E.Status.update(p, dt, (n) => G().hurtPlayer(n, null, true), (n) => (p.hp = Math.min(p.maxHp, p.hp + n)));
      if (p.inHazard) G().hurtPlayer(1, { x: p.x, y: p.y + 3 });

      // pulo com buffer
      if (jumpP) p.jumpBuf = T.buffer;
      else p.jumpBuf -= dt;
      p.coyote = p.onGround ? T.coyote : p.coyote - dt;
      if (p.onGround) {
        p.airDash = true;
        p.airJumps = (T.doubleJump ? 1 : 0) + G().inv.jumps();
      }

      // escada
      if (p.onLadder && (up || down) && p.dashT <= 0) p.climbing = true;
      if (!p.onLadder || p.onGround && !up) p.climbing = p.onLadder && p.climbing && !p.onGround;

      // dash
      if ((pr.ShiftLeft || pr.ShiftRight || pr.KeyK || pr.KeyL) && T.dash && p.dashCD <= 0 && (p.onGround || p.airDash)) {
        p.dashT = T.dashTime;
        p.dashCD = T.dashCooldown;
        if (!p.onGround) p.airDash = false;
        p.vx = (dir || p.facing) * T.dashSpeed;
        p.vy = 0;
        p.invuln = Math.max(p.invuln, T.dashTime);
        E.FX.spawn('poeira', p.x, p.y, 8);
        E.Audio.play('dash');
      }

      const crouch = down && p.onGround && !p.climbing && p.dashT <= 0;
      const wantH = crouch ? 11 : 17;
      if (wantH > p.h && E.Phys.solidBox(w, p.x, p.y, p.w, wantH)) p.crouchStuck = true;
      else {
        p.h = wantH;
        p.crouchStuck = false;
      }

      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vy = 0;
        if (Math.random() < 0.6) p.ghosts.push({ x: p.x, y: p.y, cells: p.lastCells, life: 0.22 });
      } else if (p.climbing) {
        p.vx = dir * T.climbSpeed * 0.6;
        p.vy = (down ? 1 : 0) * T.climbSpeed - (up ? 1 : 0) * T.climbSpeed;
        p.phase += (Math.abs(p.vy) + Math.abs(p.vx)) * dt * 0.4;
        if (jumpP) {
          p.climbing = false;
          p.vy = -T.jump * 0.8;
          p.jumpBuf = 0;
        }
      } else {
        // horizontal
        const acc = p.onGround ? T.accel : T.airAccel;
        const maxV = (crouch ? 0.35 : 1) * (p.inWater ? 0.55 : 1) * spd;
        if (dir && p.wallLock <= 0 && !(p.attack && p.onGround)) {
          p.vx += dir * acc * dt;
          if (Math.abs(p.vx) > maxV) p.vx = Math.sign(p.vx) * Math.max(maxV, Math.abs(p.vx) - acc * 2 * dt);
          p.facing = dir;
        } else if (p.wallLock <= 0) {
          const fr = p.onGround ? 14 : 3;
          p.vx -= p.vx * Math.min(1, fr * dt);
          if (Math.abs(p.vx) < 0.5) p.vx = 0;
        }
        // parede
        const wallSlide = T.wallJump && !p.onGround && p.onWall && dir === p.onWall && p.vy > 0 && !p.inWater;
        p.wallSliding = wallSlide;
        // pulos
        if (p.jumpBuf > 0) {
          if (down && p.onGround && E.Phys.oneWayRow(w, p.x, Math.round(p.y), p.w) && !E.Phys.solidBox(w, p.x, p.y + 1, p.w, 1)) {
            p.drop = 0.25; // descer da plataforma vazada
            p.jumpBuf = 0;
          } else if (p.coyote > 0 || p.inWater) {
            p.vy = p.inWater ? -T.jump * 0.55 : -T.jump;
            p.coyote = 0;
            p.jumpBuf = 0;
            E.FX.spawn('poeira', p.x, p.y, 5);
            E.Audio.play(p.inWater ? 'agua' : 'pulo');
          } else if (wallSlide || (T.wallJump && p.onWall && !p.onGround)) {
            p.vy = -T.wallJumpY;
            p.vx = -p.onWall * T.wallJumpX;
            p.facing = -p.onWall;
            p.wallLock = 0.16;
            p.jumpBuf = 0;
            E.Audio.play('pulo');
            E.FX.spawn('poeira', p.x + p.onWall * 3, p.y - 6, 5);
          } else if (p.airJumps > 0) {
            p.airJumps--;
            p.vy = -T.jump * 0.85;
            p.jumpBuf = 0;
            E.Audio.play('pulo2');
            E.FX.spawn('magia', p.x, p.y, 0.5);
          }
        }
        // gravidade (mais forte caindo e ao soltar o pulo = pulo variável)
        let g = p.vy > 0 ? T.fallGravity : jumpH ? T.gravity : T.fallGravity * 1.4;
        if (p.inWater) g *= 0.3;
        p.vy = Math.min(p.inWater ? 18 : wallSlide ? T.wallSlide : T.maxFall, p.vy + g * dt);
      }

      p.drop = p.drop > 0 ? p.drop : 0;
      const body = p;
      body.drop = p.drop > 0 || p.climbing;
      const vyBefore = p.vy;
      E.Phys.move(body, dt, w, { step: p.onGround ? 2 : 0 });
      body.drop = p.drop;
      if (p.landed && vyBefore > 30) E.Audio.play('aterrissar', { vol: Math.min(1, vyBefore / 90) });
      if (p.inWater && !p.wasInWater) E.Audio.play('agua');
      p.wasInWater = p.inWater;
      if (p.landed && vyBefore > 45) {
        p.landT = 0.12;
        E.FX.spawn('poeira', p.x, p.y, Math.min(14, Math.round(vyBefore / 6)));
        if (vyBefore > 80) G().shake(2);
      }
      if (p.onGround && Math.abs(p.vx) > 20 && Math.random() < dt * 10) E.FX.spawn('poeira', p.x - p.facing * 2, p.y, 1);

      // ataque em combo (até 3 golpes)
      if ((pr.KeyJ || pr.KeyX || pr.Mouse0) && !(E.Creative && E.Creative.active && pr.Mouse0)) {
        if (!p.attack) this.startAttack(p, 1);
        else p.atkQueue = true;
      }
      if (p.attack) {
        const a = p.attack;
        a.t += dt / a.dur;
        if (!a.hit && a.t > 0.25) {
          a.hit = true;
          this.hit(p, a.n);
        }
        if (a.t >= 1) {
          if (p.atkQueue && a.n < 3) this.startAttack(p, a.n + 1);
          else p.attack = null;
          p.atkQueue = false;
        }
      }
      // interação, arremesso, hotbar e inventário
      if (pr.KeyE) {
        const it = E.Ents.interactable();
        if (it) E.Script.safe(() => it.hooks.onInteract(it, p, E.API), 'onInteract ' + it.prefab);
      }
      if (pr.KeyQ) {
        const i = G().inv.slots.findIndex((s) => s && E.Project.items[s.id]?.type === 'arremesso');
        if (i >= 0) G().inv.use(i, E.API);
      }
      for (let n = 1; n <= 5; n++) if (pr['Digit' + n] && !(E.Creative && E.Creative.active)) {
        G().inv.hot = n - 1;
        if (G().inv.use(n - 1, E.API)) E.UI.refresh();
      }

      // estado de animação
      const prev = p.state;
      p.state = p.hurtT > 0.25 ? 'hurt' : p.attack ? 'attack' : p.dashT > 0 ? 'dash' : p.climbing ? 'climb' : p.inWater && !p.onGround ? 'swim' : p.wallSliding ? 'wall' : !p.onGround ? (p.vy < 0 ? 'jump' : 'fall') : p.landT > 0 ? 'land' : crouch ? 'crouch' : Math.abs(p.vx) > 3 ? 'run' : 'idle';
      if (p.state === 'run') {
        const before = Math.floor(p.phase / Math.PI);
        p.phase += dt * Math.abs(p.vx) * 0.32;
        if (Math.floor(p.phase / Math.PI) !== before) E.Audio.play('passo', { vol: 0.7, gap: 0.08 });
      }
      if (p.state === 'climb' && Math.floor(p.phase * 2) !== p.lastClimb) {
        p.lastClimb = Math.floor(p.phase * 2);
        E.Audio.play('passo', { vol: 0.4 });
      }
      if (p.state === 'swim') p.phase += dt * 5;
      if (prev !== p.state && p.state === 'idle') p.phase = 0;
      if (p.y > w.H + 25) G().killPlayer('Caiu no abismo');
      for (const g of p.ghosts) g.life -= dt;
      p.ghosts = p.ghosts.filter((g) => g.life > 0);
    },

    // ângulo da mira (tela, y para baixo) do peito do herói até o mouse
    aim(p) {
      const r = E.Renderer, m = G().mouse;
      const cy = p.y - p.h * 0.62;
      if (!m) return { ang: p.facing > 0 ? 0 : Math.PI, dx: p.facing };
      const dxp = (m.x - p.x) * r.cw, dyp = (m.y - cy) * r.ch;
      return { ang: Math.atan2(dyp, dxp), dx: m.x - p.x, dxp, dyp };
    },
    startAttack(p, n) {
      const a = this.aim(p);
      if (Math.abs(a.dx) > 0.5) p.facing = Math.sign(a.dx);
      // ângulo local do braço: 0 = baixo, π/2 = frente, π = cima
      const local = Math.atan2(Math.cos(a.ang) * p.facing, Math.sin(a.ang));
      const wd = G().inv.weaponDef();
      p.attack = { n, t: 0, dur: (n === 3 ? 0.34 : 0.22) / (wd.speed || 1), hit: false, ang: a.ang, local: Math.max(0, local) };
      // armas de longo alcance (cajado, arco): disparam na direção do mouse
      if (wd.projectile) {
        const q = wd.projectile, k = E.Renderer.cw / E.Renderer.ch;
        const pr = E.Ents.projectile(Object.assign({}, p, { team: 'jogador', facing: Math.cos(a.ang) >= 0 ? 1 : -1 }), { dx: Math.cos(a.ang), dy: Math.sin(a.ang) * k, speed: q.speed || 60, damage: q.damage || 1, glyph: q.glyph || '*', color: q.color, light: q.light || 0, homing: q.homing || 0, status: wd.status, life: 2.2 });
        if (q.arc) pr.g = 22;
        if (Math.abs(Math.cos(a.ang)) < 0.4 && q.glyph === '>') pr.glyph = Math.sin(a.ang) < 0 ? '^' : 'v';
        else if (q.glyph === '>' && Math.cos(a.ang) < 0) pr.glyph = '<';
        E.Audio.play(wd.ranged ? 'arco' : 'orbe', { gap: 0.05 });
      }
      const fx = Math.cos(a.ang);
      if (p.onGround) p.vx += fx * (n === 3 ? 30 : 14);
      else if (p.vy > 0) p.vy *= 0.4; // flutua um pouco ao atacar no ar
      const asp = E.Renderer.cw / E.Renderer.ch;
      E.Audio.play('espada', { gap: 0.05 });
      p.lastTip = null;
    },
    hit(p, n) {
      const wd = G().inv.weaponDef(), r = E.Renderer;
      if (wd.ranged) return;
      const reach = 13 * (wd.range || 1) * (n === 3 ? 1.25 : 1);
      const ang = p.attack.ang, cy = p.y - p.h * 0.62;
      let pogo = false;
      for (const e of E.Ents.list) {
        if (e.kind !== 'creature' || e.dead || !e.maxHp || e.team === 'neutro' || e.team === 'objeto') continue;
        const dx = e.x - p.x, dy = (e.y - e.h / 2 - cy) * (r.ch / r.cw);
        const d = Math.hypot(dx, dy) - Math.max(e.w, e.h) * 0.5;
        let da = Math.abs(Math.atan2(dy, dx) - ang);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (d < reach && (da < 1.15 || d < 3)) {
          E.Ents.damage(e, (wd.damage || 1) + (n === 3 ? 1 : 0), p);
          e.vx = Math.cos(ang) * (n === 3 ? 50 : 30) * (wd.knock || 1) * (e.def.boss ? 0.1 : 1);
          if (wd.knock > 1.5 && e.def.gravity !== false && !e.def.boss) e.vy = -20 * wd.knock;
          if (wd.status) E.Status.add(e, wd.status, 3);
          if (wd.fx) E.FX.spawn(wd.fx, e.x, e.y - e.h / 2);
          E.FX.spawn('impacto', e.x - Math.cos(ang) * 2, e.y - e.h / 2, ang, wd.color);
          if (E.Options.shake) G().shake((n === 3 ? 3 : 1.5) + (wd.shake || 0));
          G().hitstop = 0.05;
          E.Audio.play('acerto');
          if (Math.sin(ang) > 0.6 && !p.onGround) pogo = true;
        }
      }
      if (pogo) {
        p.vy = -46; // quicar no inimigo ao golpear para baixo no ar
        p.airDash = true;
        p.airJumps = (E.Project.player.doubleJump ? 1 : 0) + G().inv.jumps();
      }
    },

    // simula capa/cachecol e renderiza o herói em células
    render(p, dt) {
      const spec = E.HERO, px = spec.px;
      const W = spec.cols * px, H = Math.round(spec.rows * px * E.aspect);
      const cv = (this._cv ||= document.createElement('canvas'));
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const ax = p.x * px, ay = (p.y + 0.5) * px * E.aspect; // pés no "mundo da arte"
      const toLocal = (q) => [W / 2 + (q.x - ax) * p.facing, H + (q.y - ay)];
      const anchors = this._anchors || { neck: [W / 2, H * 0.3] };
      const neckW = { x: ax + (anchors.neck[0] - W / 2) * p.facing, y: ay + (anchors.neck[1] - H) };
      const sim = (pts, seg, grav, attachDx, attachDy) => {
        pts[0].x = neckW.x + attachDx * p.facing;
        pts[0].y = neckW.y + attachDy;
        const wind = Math.sin(G().time * 2.3) * 0.25 - p.facing * 0.15;
        for (let i = 1; i < pts.length; i++) {
          const q = pts[i];
          const vx = (q.x - q.px) * 0.86, vy = (q.y - q.py) * 0.86;
          q.px = q.x;
          q.py = q.y;
          q.x += vx + wind - p.vx * dt * 0.6;
          q.y += vy + grav;
        }
        for (let it = 0; it < 4; it++)
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const k = (d - seg) / d;
            b.x -= dx * k;
            b.y -= dy * k;
          }
        // não atravessa o chão
        const floorY = ay + px * 0.5;
        for (const q of pts) if (q.y > floorY) q.y = floorY;
      };
      const S = px;
      sim(p.cape, S * 2.2, 1.6, -S * 0.6, S * 1.0);
      sim(p.scarf, S * 1.1, 0.9, S * 0.2, S * 0.2);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, W, H);
      const fcv = (this._fcv ||= document.createElement('canvas'));
      if (fcv.width !== W || fcv.height !== H) {
        fcv.width = W;
        fcv.height = H;
      }
      const fctx = fcv.getContext('2d', { willReadFrequently: true });
      fctx.clearRect(0, 0, W, H);
      const wd = G().inv.weaponDef();
      const img = E.Project.player.image;
      if (img && img.src) {
        E.drawImageHero(ctx, W, H, img, p.state, p.t, p.facing);
        const cellsI = E.canvasToCells(cv, spec.cols, spec.rows);
        p.lastCells = cellsI;
        return cellsI;
      }
      const st = {
        state: p.state, t: p.t, phase: p.phase, facing: p.facing, vx: p.vx, vy: p.vy,
        atk: p.attack || { n: 1, t: 0, local: Math.PI / 2 }, weaponColor: wd.color, weaponShape: wd.shape, gear: G().inv.look(),
        cape: p.cape.slice(1).map(toLocal), scarf: null, detail: 0,
      };
      if (p.facing !== p.lastFacing) p.poseS = null; // vira de lado sem "girar" o braço
      p.lastFacing = p.facing;
      p.poseS = E.blendPose(p.poseS, E.heroPose(st), dt, p.state === 'attack');
      st.pose = p.poseS;
      this._anchors = E.drawHeroLine(ctx, fctx, W, H, st);
      this.trail(p, W, H, px, wd);
      const cells = E.canvasToLineCells(cv, fcv, spec.cols, spec.rows);
      p.lastCells = cells;
      return cells;
    },

    // rastro do golpe: segue a ponta real da lâmina, com glifos alinhados à direção do corte
    trail(p, W, H, px, wd) {
      const a = this._anchors;
      if (!p.attack || !a || !a.tip || p.attack.t < 0.15) {
        p.lastTip = null;
        return;
      }
      const toW = (q) => ({ x: p.x + (q[0] - W / 2) / px, y: p.y + 0.5 + (q[1] - H) / (px * E.aspect) });
      const tip = toW(a.tip), hand = toW(a.hand);
      const last = p.lastTip;
      p.lastTip = { tip, hand };
      if (!last) return;
      const col = (wd && wd.color) || [0.75, 0.9, 1];
      const asp = E.aspect;
      const glyphFor = (dx, dy) => {
        let ang = Math.atan2(dy * asp, dx);
        ang = ((ang % Math.PI) + Math.PI) % Math.PI;
        return ang < 0.39 || ang > 2.75 ? '-' : ang < 1.18 ? '\\' : ang < 1.96 ? '|' : '/';
      };
      for (const k of [1, 0.78, 0.58]) {
        // três "faixas" ao longo da lâmina formam a lua crescente
        const p0 = { x: last.hand.x + (last.tip.x - last.hand.x) * k, y: last.hand.y + (last.tip.y - last.hand.y) * k };
        const p1 = { x: hand.x + (tip.x - hand.x) * k, y: hand.y + (tip.y - hand.y) * k };
        const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy * asp);
        const n = Math.max(1, Math.ceil(len / 0.7));
        const ch = glyphFor(dx, dy);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          G().parts.push({ x: p0.x + dx * t, y: p0.y + dy * t, vx: dx * 2, vy: dy * 2, life: 0.12 + 0.08 * k, max: 0.2, g: 0, drag: 0.02, ch, c: col.map((v) => Math.min(1, v * (0.7 + 0.5 * k))), em: 1, light: k === 1 && i === n - 1 ? 14 : 0 });
        }
      }
      return;
    },
  };
})();

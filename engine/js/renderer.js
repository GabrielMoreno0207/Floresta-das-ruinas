'use strict';
// Renderizador WebGL2 em duas passadas:
//  1) luz por célula (com sombras por raymarch) em um FBO do tamanho da grade
//  2) glifos por pixel: material -> glifo, céu procedural, reflexo na água, bloom, chuva, neblina
(function () {
  const E = window.ENG;

  const VS = `#version 300 es
  in vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`;

  const COMMON = `#version 300 es
  precision highp float; precision highp int;
  uniform sampler2D uAlb; uniform sampler2D uAux;
  uniform ivec2 uGrid;
  uniform float uAspect;
  uniform int uNL; uniform vec4 uLP[32]; uniform vec3 uLC[32];
  ivec2 cl(ivec2 c){ return clamp(c, ivec2(0), uGrid-1); }
  int flags(ivec2 c){ return int(texelFetch(uAux, cl(c), 0).b*255.+.5); }
  int matAt(ivec2 c){ return int(texelFetch(uAlb, cl(c), 0).a*255.+.5); }
  float hash(vec2 p){ p = fract(p*vec2(.1031,.1030)); p += dot(p, p.yx+33.33); return fract((p.x+p.y)*p.x); }
  float noise(float x){ float i=floor(x), f=fract(x); float s=f*f*(3.-2.*f); return mix(hash(vec2(i,7.1)), hash(vec2(i+1.,7.1)), s); }
  float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 s=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),s.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),s.x), s.y); }
  `;

  const LIGHT_FS = COMMON + `
  uniform vec3 uAmb; uniform int uShadows;
  out vec4 o;
  void main(){
    ivec2 c = ivec2(gl_FragCoord.xy);
    vec2 p = vec2(c) + .5;
    float skyv = texelFetch(uAux, cl(c), 0).a;
    vec3 L = uAmb * (.04 + .96*skyv);
    int f0 = flags(c);
    if ((f0 & 2) != 0) L *= 0.75; // camada de fundo recebe menos ambiente
    for (int i=0;i<32;i++){
      if (i>=uNL) break;
      vec4 lp = uLP[i];
      vec2 d = p - lp.xy; d.y *= uAspect;
      float dist = length(d);
      if (dist > lp.z) continue;
      float a = pow(1. - dist/lp.z, 1.6) * lp.w;
      if (uShadows==1 && a > .01){
        vec2 from = lp.xy, to = p;
        float n = min(ceil(max(abs(to.x-from.x), abs(to.y-from.y))), 64.);
        float occ = 0.;
        for (float s=1.; s<64.; s++){
          if (s >= n) break;
          ivec2 q = ivec2(floor(mix(from, to, s/n)));
          if ((flags(q) & 1) != 0){ occ += 1.; if (occ >= 3.) break; }
        }
        a *= occ >= 3. ? 0.04 : occ >= 2. ? 0.25 : occ >= 1. ? 0.6 : 1.;
      }
      L += uLC[i] * a;
    }
    o = vec4(min(L*.5, vec3(1.)), 1.);
  }`;

  const GLYPH_FS = COMMON + `
  uniform sampler2D uLight; uniform sampler2D uAtlas; uniform sampler2D uMat;
  uniform vec2 uCell; uniform vec2 uOff; uniform vec2 uCam; uniform vec2 uRes;
  uniform float uTime; uniform float uGlow; uniform float uRain; uniform float uFog;
  uniform vec3 uSkyTop; uniform vec3 uSkyBot; uniform vec3 uMoonCol; uniform vec3 uFogCol;
  uniform vec4 uPush[4];
  uniform int uAtlasCols;
  uniform float uHorizon;
  uniform vec4 uCel; uniform float uStarA; uniform float uDayK; uniform int uBiomeA; uniform int uBiomeB; uniform float uBiomeMix; uniform float uSnow;
  out vec4 o;

  float atlas(int g, vec2 uv){
    ivec2 cs = ivec2(uCell);
    ivec2 t = ivec2((g % uAtlasCols) * cs.x, (g / uAtlasCols) * cs.y) + ivec2(uv * vec2(cs));
    return texelFetch(uAtlas, t, 0).a;
  }
  int glyphOf(int m, int slot){
    vec4 t = texelFetch(uMat, ivec2(slot/4, m), 0);
    int k = slot - (slot/4)*4;
    float v = k==0? t.r : k==1? t.g : k==2? t.b : t.a;
    return int(v*255.+.5);
  }
  float sway(vec2 wc){
    float s = sin(uTime*1.7 + wc.x*.13 + wc.y*.05)*.55 + (noise(wc.x*.07 + uTime*.6)-.5)*.9;
    for (int i=0;i<4;i++){
      vec4 pu = uPush[i];
      if (pu.w < .5) continue;
      float dx = wc.x - pu.x, dy = wc.y - pu.y;
      if (abs(dx) < 5. && dy > -14. && dy < 2.) s += sign(dx + pu.z*.01) * (1. - abs(dx)/5.) * 2.2;
    }
    return s;
  }
  // ----- camadas distantes por bioma (várias profundidades com névoa atmosférica) -----
  // 0 floresta · 1 deserto · 2 neve · 3 oceano · 4 floresta grande · 5 castelo
  float mtnH(float x, float base, float amp, float sd){
    return base - (noise(x*.011 + sd)*.62 + noise(x*.047 + sd*2.)*.27 + noise(x*.16 + sd*3.)*.11)*amp;
  }
  // cordilheira: crista desenhada pela inclinação, textura de rocha, neve opcional, estratos (mesas)
  bool range(float x, float yy, float base, float amp, float sd, float hz, vec3 cNear, vec3 cDeep, float snow, bool mesa, vec3 skyc, inout vec4 res, inout vec3 bg){
    float h = mtnH(x, base, amp, sd);
    if (mesa){ float m = mtnH(x, base, amp, sd); h = base - floor((base - m)/(amp*.22))*(amp*.22); }
    if (yy < h) return false;
    float edge = yy - h;
    float sl = mtnH(x + 1., base, amp, sd) - mtnH(x - 1., base, amp, sd);
    vec3 col = mix(cNear, cDeep, clamp(edge/22., 0., 1.));
    if (mesa) col *= .82 + .22*step(.5, fract(yy*.5 + noise(x*.05)*.5));
    if (snow > 0. && edge < snow + noise(x*.13)*4.) col = mix(col, vec3(.92,.95,1.)*(.45 + .55*uDayK), .85);
    float hh = hash(vec2(x, yy)) + hz*.25; // mais longe = menos textura
    int gi = edge < 1. ? (mesa ? ${E.glyphIndex('_')} : abs(sl) < .25 ? ${E.glyphIndex('^')} : sl < 0. ? ${E.glyphIndex('/')} : ${E.glyphIndex('\\')}) : hh < .16 ? ${E.glyphIndex('.')} : hh < .22 ? ${E.glyphIndex(':')} : hh < .24 && !mesa ? ${E.glyphIndex('^')} : 0;
    col = mix(col, skyc, hz);
    bg = mix(col*.45, skyc*.8, hz*.6);
    res = vec4(col, float(gi));
    return true;
  }
  vec4 farLayer(int b, ivec2 c, vec2 frag, inout vec3 bg, out float hit){
    hit = 1.;
    vec2 g = vec2(uGrid);
    float yy = float(c.y), D = uDayK;
    float horizon = g.y*uHorizon + 6. - uCam.y*.25;
    vec3 skyc = mix(uSkyTop, uSkyBot, .85) * (.35 + .55*D);
    vec4 res = vec4(0.);
    float fx = float(c.x) + uCam.x*.42;
    // raios de sol entre as copas (floresta grande, de dia)
    float rays = b == 4 ? smoothstep(.75, 1., sin((frag.x + frag.y*.55)*.012 + uTime*.05)) * D : 0.;
    bg += vec3(1.,.95,.7) * rays * .06;
    // ===== camada próxima =====
    if (b == 1){
      float dh = horizon - 2. - (noise(fx*.025)*.7 + noise(fx*.008)*.3)*16.;
      if (yy > dh){
        float h = hash(vec2(fx + floor(uTime*3.), yy));
        bool crest = yy - dh < 1.;
        bg = mix(vec3(.06,.04,.02), vec3(.5,.36,.2), D) * (.85 + .15*hash(vec2(fx*.1, yy*.3)));
        return vec4(mix(vec3(.34,.24,.13), vec3(.95,.76,.46), D)*(crest ? 1.25 : .7+.3*h), float(crest ? ${E.glyphIndex('~')} : h < .2 ? ${E.glyphIndex('.')} : h < .23 ? ${E.glyphIndex(',')} : 0));
      }
    } else if (b == 3){
      if (yy > horizon - 3.){
        float row = yy - horizon;
        float h = hash(vec2(float(c.x) + floor(uTime*(1. + row*.15) + yy*.3), yy));
        bg = mix(vec3(.01,.03,.08), vec3(.12,.32,.55), D) * (1. - row*.004);
        vec3 wc = mix(vec3(.18,.28,.5), vec3(.55,.8,.98), D);
        float cx = uRes.x*uCel.x - uCam.x*uCell.x*.02;
        float refl = uCel.w * exp(-pow((frag.x - cx) / (uRes.x*.035 + row*1.5), 2.));
        if (refl > .25 && h < .55) return vec4(mix(wc, uMoonCol*1.3, refl), float(${E.glyphIndex('~')}));
        return vec4(wc*(.8 + .2*hash(vec2(row, 1.))), float(h < .16 ? ${E.glyphIndex('~')} : h < .21 ? ${E.glyphIndex('-')} : 0));
      }
      // navio no horizonte
      float sx = mod(uTime*1.2 + 200., g.x*2.5) - g.x*.5;
      float dx = float(c.x) - sx;
      if (abs(dx) < 7. && yy > horizon - 4. && yy < horizon - 2.){ bg = mix(bg, vec3(.05,.04,.04), .6); return vec4(vec3(.25,.18,.12)*(.4 + .6*D), float(yy > horizon - 3. ? ${E.glyphIndex('=')} : ${E.glyphIndex('_')})); }
      if (dx > -1. && dx < 5. && yy > horizon - 11. && yy < horizon - 4. && dx < (yy - (horizon - 11.))*.75){ return vec4(mix(vec3(.5,.48,.45), vec3(.95,.93,.88), D), float(${E.glyphIndex('|')})); }
    } else if (b == 4){
      for (int L = 0; L < 2; L++){
        float par = L == 0 ? .5 : .3, sp = L == 0 ? 44. : 30.;
        float lx0 = float(c.x) + uCam.x*par;
        float cell = floor(lx0/sp), lx = lx0 - cell*sp - sp*.5 + (hash(vec2(cell, 5. + float(L))) - .5)*10.;
        float ctop = horizon - (L == 0 ? 55. : 40.) - hash(vec2(cell, 2.))*16.;
        float hz = L == 0 ? 0. : .38;
        float dxy = (lx*lx)/(16.*16.) + pow((yy - ctop)/7., 2.) + (noise2(vec2(lx0*.2, yy*.4)) - .5)*.8;
        if (dxy < 1.){
          vec3 cc = mix(vec3(.06,.13,.08), vec3(.2,.4,.24), D) * (L == 0 ? .7 : 1.);
          float h = hash(vec2(lx0, yy));
          bg = mix(mix(vec3(.02,.05,.03), vec3(.12,.24,.15), D), skyc, hz);
          return vec4(mix(cc + rays*.3, skyc, hz), float(h < .3 ? ${E.glyphIndex('&')} : h < .45 ? ${E.glyphIndex('%')} : 0));
        }
        if (abs(lx) < (L == 0 ? 3.2 : 2.2) && yy > ctop){
          vec3 tc = mix(vec3(.12,.08,.05), vec3(.36,.26,.17), D) * (L == 0 ? .6 : 1.);
          bg = mix(tc*.4, skyc, hz);
          return vec4(mix(tc, skyc, hz), float(hash(vec2(lx0, yy)) < .5 ? ${E.glyphIndex('|')} : abs(lx) > (L == 0 ? 2.4 : 1.5) ? ${E.glyphIndex(')')} : 0));
        }
      }
    }
    if (b == 0 || b == 2 || b == 5){
      // pinheiros próximos (nevados na neve)
      float base = horizon + noise(fx*.02)*6.;
      float cell = floor(fx/11.), lx = fx - cell*11. - 5.5;
      float ht = 10. + hash(vec2(cell, 3.))*16.;
      if (yy > base - ht && abs(lx) < (yy - (base-ht))*.32 + .5){
        float h = hash(vec2(fx, yy));
        float tier = fract((yy - (base - ht))/4.);
        int gi = abs(lx) > (yy - (base-ht))*.32 - 1. ? (lx < 0. ? ${E.glyphIndex('/')} : ${E.glyphIndex('\\')}) : h < .25 ? ${E.glyphIndex('A')} : h < .4 ? ${E.glyphIndex('^')} : 0;
        vec3 pc = mix(vec3(.05,.11,.09), vec3(.16,.32,.24), D)*(.7+.3*hash(vec2(cell,1.)))*(.85 + .3*tier);
        if (b == 2) pc = mix(pc, vec3(.85,.9,.98)*(.35+.65*D), tier > .7 ? .8 : .3);
        bg = mix(bg, pc*.35, .7);
        return vec4(pc, float(gi));
      }
      if (yy > base){
        vec3 gc = b == 2 ? mix(vec3(.25,.27,.33), vec3(.85,.88,.95), D) : mix(vec3(.04,.08,.06), vec3(.14,.26,.16), D);
        bg = gc*.4;
        return vec4(gc, float(hash(vec2(fx,yy)) < .3 ? (b == 2 ? ${E.glyphIndex('*')} : ${E.glyphIndex('.')}) : 0));
      }
    }
    // ===== camada intermediária =====
    float mx2 = float(c.x) + uCam.x*.28;
    if (b == 0 || b == 2){
      // colinas com árvores redondas (ou nevadas) e torres em ruínas
      float hb = horizon - 6. - noise(mx2*.015)*9. - noise(mx2*.06)*3.;
      float tcell = floor(mx2/420.), tl = mx2 - tcell*420. - 210.;
      if (abs(tl) < 4. && yy > hb - 18. + abs(tl)*.0 + step(2., abs(tl))*hash(vec2(tcell, floor(yy)))*3.){
        vec3 tc = mix(vec3(.12,.12,.16), vec3(.42,.43,.5), D);
        return vec4(mix(tc, skyc, .35), float(hash(vec2(mx2, yy)) < .35 ? ${E.glyphIndex('#')} : yy < hb - 17. ? ${E.glyphIndex('^')} : 0));
      }
      float tb = floor(mx2/9.), tlx = mx2 - tb*9. - 4.5, th = hb - 4. - hash(vec2(tb, 9.))*4.;
      bool tree = (tlx*tlx)/16. + pow((yy - th)/2.2, 2.) < 1. && hash(vec2(tb, 4.)) < .7;
      if (yy > hb || tree){
        vec3 hc = b == 2 ? mix(vec3(.3,.32,.4), vec3(.86,.9,.97), D) : mix(vec3(.05,.1,.07), vec3(.22,.38,.25), D);
        if (tree && b == 2) hc = mix(hc, mix(vec3(.08,.14,.12), vec3(.25,.4,.32), D), .5);
        float h = hash(vec2(mx2, yy));
        bg = mix(hc*.4, skyc, .35);
        return vec4(mix(hc, skyc, .35), float(tree ? (h < .5 ? ${E.glyphIndex('&')} : ${E.glyphIndex('%')}) : yy - hb < 1. ? ${E.glyphIndex('~')} : h < .2 ? ${E.glyphIndex('.')} : 0));
      }
    } else if (b == 1){
      // dunas médias e pirâmides distantes
      float pcell = floor(mx2/700.), pl = mx2 - pcell*700. - 350.;
      float py = horizon - 8.;
      if (abs(pl) < 24. && yy > py - (24. - abs(pl))*.7 && yy < py + 4.){
        vec3 pc = mix(vec3(.22,.14,.08), vec3(.72,.52,.3), D) * (pl < 0. ? .78 : 1.0);
        bg = pc * .5;
        return vec4(mix(pc, skyc, .18), float(abs(abs(pl) - (py - yy)/.7 - 24.) < 1.2 ? (pl < 0. ? ${E.glyphIndex('/')} : ${E.glyphIndex('\\')}) : hash(vec2(mx2,yy)) < .15 ? ${E.glyphIndex('=')} : 0));
      }
      float dh = horizon - 5. - (noise(mx2*.02)*.7 + noise(mx2*.006)*.3)*14.;
      if (yy > dh){
        vec3 dc = mix(vec3(.3,.2,.1), vec3(.92,.72,.44), D);
        bg = mix(dc*.45, skyc, .3);
        return vec4(mix(dc, skyc, .3), float(yy - dh < 1. ? ${E.glyphIndex('~')} : hash(vec2(mx2,yy)) < .15 ? ${E.glyphIndex('.')} : 0));
      }
    } else if (b == 5){
      // castelo numa colina com bandeiras tremulando
      float hx = float(c.x) + uCam.x*.3;
      float hill = horizon - 4. - noise(hx*.01)*7.;
      float seg = mod(hx, 300.);
      if (seg < 170.){
        float top = hill - 16.;
        bool tower = seg < 14. || seg > 156. || abs(seg - 85.) < 7.;
        if (tower) top = hill - 30.;
        if (!tower && mod(seg, 5.) < 2.5) top -= 2.;
        float roof = tower ? top - (7. - abs(mod(seg + 7., 14.) - 7.)) : top;
        float tcx = seg < 14. ? 7. : seg > 156. ? 163. : 85.;
        float fdx = seg - tcx, flagY = top - 9. + sin(uTime*4. + fdx*.8)*.7;
        if (tower && fdx >= 0. && fdx < 6. && abs(yy - flagY) < .6) return vec4(vec3(.85,.2,.15)*(.5+.5*D), float(${E.glyphIndex('~')}));
        if (tower && abs(fdx) < .5 && yy > top - 10. && yy <= roof) return vec4(vec3(.5,.45,.4)*(.4+.6*D), float(${E.glyphIndex('|')}));
        if (yy > roof && yy < hill){
          bg = mix(mix(vec3(.03,.03,.05), vec3(.32,.33,.4), D), skyc, .2);
          if (yy > top + 3. && mod(yy, 6.) < 2. && mod(seg, 9.) < 2. && hash(vec2(floor(seg/9.), floor(yy/6.))) < .6)
            return vec4(mix(vec3(1.,.75,.35), vec3(.15,.15,.2), D), float(${E.glyphIndex('#')}));
          vec3 wc = mix(vec3(.12,.12,.16), vec3(.42,.44,.52), D);
          float r2 = mod(yy, 3.);
          return vec4(mix(wc, skyc, .2), float(yy <= top + .5 ? ${E.glyphIndex('^')} : r2 < 1. ? ${E.glyphIndex('_')} : mod(hx + floor(yy/3.)*3., 6.) < 1. ? ${E.glyphIndex('|')} : 0));
        }
      }
      if (yy >= hill){ bg = mix(vec3(.01,.025,.02), vec3(.1,.2,.13), D); return vec4(mix(vec3(.05,.1,.07), vec3(.2,.35,.25), D), float(hash(vec2(hx,yy)) < .25 ? ${E.glyphIndex('.')} : 0)); }
    } else if (b == 3){
      // ilhas com palmeiras
      float ix = float(c.x) + uCam.x*.12;
      float isl = horizon - 3. - max(0., noise(ix*.02) - .62) * 40.;
      if (yy > isl){ bg = mix(vec3(.03,.05,.06), vec3(.25,.38,.4), D); return vec4(mix(vec3(.08,.14,.12), vec3(.3,.5,.4), D), float(hash(vec2(ix,yy)) < .3 ? ${E.glyphIndex('^')} : 0)); }
    }
    // ===== cordilheiras distantes =====
    float m1 = float(c.x) + uCam.x*.14, m2 = float(c.x) + uCam.x*.06;
    float baseM = g.y*(uHorizon-.08) - uCam.y*.1;
    vec3 rockN = mix(vec3(.28,.3,.45), vec3(.52,.58,.72), D), rockD = mix(vec3(.13,.13,.22), vec3(.36,.42,.55), D);
    if (b == 1){ rockN = mix(vec3(.32,.19,.12), vec3(.85,.52,.33), D); rockD = mix(vec3(.16,.1,.08), vec3(.62,.38,.24), D); }
    if (b != 3){
      if (range(m1, yy, baseM, g.y*(b == 2 ? .3 : b == 1 ? .16 : .18), 0., b == 1 ? .3 : .42, rockN, rockD, b == 2 ? 10. : b == 0 || b == 5 ? 3. : 0., b == 1, skyc, res, bg)) return res;
    }
    if (range(m2, yy, baseM - g.y*.03, g.y*(b == 2 ? .36 : .24), 7., b == 3 ? .85 : .72, rockN, rockD, b == 1 ? 0. : 8., false, skyc, res, bg)) return res;
    hit = 0.;
    return vec4(0.);
  }

  // céu procedural: gradiente, aurora, camadas do bioma (com transição), nuvens, sol/lua e estrelas
  vec4 sky(ivec2 c, vec2 frag, out vec3 bg){
    float t = clamp(frag.y / uRes.y, 0., 1.);
    bg = mix(uSkyTop, uSkyBot, pow(t, 1.4)) * (.35 + .55 * uDayK);
    vec2 g = vec2(uGrid);
    float yy = float(c.y);
    // aurora boreal (neve, à noite)
    float auroraW = (uBiomeA == 2 ? 1. - uBiomeMix : 0.) + (uBiomeB == 2 ? uBiomeMix : 0.);
    if (auroraW > .01 && uDayK < .6 && t < .5){
      float ax = float(c.x) + uCam.x*.05;
      float band = g.y*.16 + sin(ax*.025 + uTime*.25 + sin(ax*.011 + uTime*.17)*2.)*6.;
      float d = abs(yy - band);
      float a = auroraW * (1. - uDayK/.6) * smoothstep(7., 0., d);
      if (a > .02){
        vec3 ac = mix(vec3(.2,1.,.55), vec3(.45,.6,1.), .5 + .5*sin(ax*.02 + uTime*.3));
        bg += ac * a * .22;
        if (hash(vec2(ax, yy + floor(uTime*3.))) < a*.5) return vec4(ac*a*1.4, float(d < 2. ? ${E.glyphIndex('|')} : ${E.glyphIndex(':')}));
      }
    }
    // camadas do bioma atual e do vizinho, misturadas com pontilhado na transição
    vec3 bgA = bg, bgB = bg;
    float hA, hB;
    vec4 la = farLayer(uBiomeA, c, frag, bgA, hA);
    vec4 lb = uBiomeMix > .001 ? farLayer(uBiomeB, c, frag, bgB, hB) : vec4(0.);
    if (uBiomeMix <= .001){ hB = 0.; bgB = bgA; }
    bool useB = hash(vec2(c) + 13.7) < uBiomeMix;
    bg = mix(bgA, bgB, uBiomeMix);
    if (useB ? hB > .5 : hA > .5) return useB ? lb : la;
    if (useB ? hA > .5 : hB > .5) { return useB ? la : lb; }
    // nuvens (mais visíveis de dia)
    float cxw = float(c.x) + uCam.x*.06 + uTime*1.2;
    float cl = noise2(vec2(cxw*.018, yy*.09)) * noise2(vec2(cxw*.05 + 7., yy*.2));
    if (t < .42 && cl > .4){
      float k = clamp((cl - .4) * 5., 0., 1.);
      vec3 ccol = mix(vec3(.2,.22,.32), vec3(.95,.96,1.), uDayK);
      bg = mix(bg, ccol * .55, k * .5);
      float h = hash(vec2(cxw, yy));
      if (h < k * .55) return vec4(ccol * (.85 + .3*k), float(k > .6 ? ${E.glyphIndex('~')} : ${E.glyphIndex('-')}));
    }
    // sol / lua
    vec2 mc = vec2(uRes.x*uCel.x, uRes.y*uCel.y) - uCam*uCell*.02;
    float R = uRes.y*.085;
    vec2 dm = (frag - mc) / R;
    float dl = length(dm);
    bg += uMoonCol * uCel.w * (uCel.z > .5 ? .5 : .12) * exp(-max(dl-1.,0.)*(uCel.z > .5 ? .9 : 1.6));
    if (dl < 1. && uCel.w > .5 && uCel.z > .5){
      int sr[5] = int[5](${['*', 'o', 'O', '0', '@'].map(E.glyphIndex).join(',')});
      float sh = 1. - dl*.6 + .1*sin(uTime*2. + dl*9.);
      return vec4(vec3(1.,.9,.6)*(1.1+.4*sh), float(sr[int(clamp(sh,0.,.999)*5.)]));
    }
    if (dl < 1. && uCel.w > .5){
      vec2 cc = (vec2(c) + .5) * uCell - uOff;
      vec2 dc = (cc - mc) / R;
      float z = sqrt(max(0., 1. - dot(dc,dc)));
      float sh = clamp(.35 + .65*dot(normalize(vec3(dc.x, dc.y, z)), normalize(vec3(-.4,-.5,.8))), 0., 1.);
      sh *= .75 + .25*noise2(dc*4.);
      sh *= 1. - .35*smoothstep(.55,.6, noise2(dc*2.5 + 3.));
      int ramp[7] = int[7](${['.', ':', 'o', 'O', '0', '@', 'Q'].map(E.glyphIndex).join(',')});
      return vec4(uMoonCol*(.55+.6*sh), float(ramp[int(clamp(sh,0.,.999)*7.)]));
    }
    // estrelas
    vec2 sc = floor(vec2(c) + uCam*.05);
    float hs = hash(sc + 71.3);
    if (hs > .988 && t < .7 && uStarA > .02){
      float tw = (.6 + .4*sin(uTime*3. + hs*90.)) * uStarA;
      int gi = hs > .998 ? ${E.glyphIndex('*')} : hs > .994 ? ${E.glyphIndex('+')} : ${E.glyphIndex('.')};
      return vec4(vec3(.85,.88,1.)*tw, float(gi));
    }
    return vec4(0.);
  }

  void main(){
    vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec2 p = frag + uOff;
    ivec2 c = ivec2(floor(p / uCell));
    vec2 uv = fract(p / uCell);
    vec4 alb = texelFetch(uAlb, cl(c), 0);
    vec4 aux = texelFetch(uAux, cl(c), 0);
    vec3 L = texelFetch(uLight, cl(c), 0).rgb * 2.;
    int m = int(alb.a*255.+.5);
    vec2 wc = vec2(c) + uCam;
    float h = hash(wc);
    int ov = int(aux.r*255.+.5);
    int fl = int(aux.b*255.+.5);
    vec3 bg = vec3(.008,.01,.022);
    vec3 col = vec3(0.);
    int g = 0;
    if (m == 0){
      vec4 s = sky(c, frag, bg);
      col = s.rgb; g = int(s.w);
    } else {
      vec4 info = texelFetch(uMat, ivec2(3, m), 0);
      int count = max(1, min(11, int(info.r*255.+.5)));
      int mode = int(info.g*255.+.5);
      float memit = info.b;
      vec3 a = alb.rgb;
      int slot = 0;
      if (mode == 0) slot = int(clamp(dot(a*L, vec3(.3,.59,.11))*1.3, 0., .999) * float(count));
      else if (mode == 1) slot = int(h * float(count));
      else if (mode == 2){
        float s = sway(wc);
        slot = s < -.35 ? 0 : s > .35 ? 2 : 1;
        if (h > .78) slot = min(count-1, 3 + int(fract(h*7.)*float(count-3)));
      }
      else if (mode == 3) slot = int(mod(floor(h*2. + uTime*1.6 + wc.x*.2 - wc.y*.6), float(count)));
      else if (mode == 4) slot = int(clamp(dot(a, vec3(.3,.59,.11)), 0., .999) * float(count));
      int special = -1;
      if (mode == 5){
        // alvenaria: fiadas de 3 linhas, juntas verticais desencontradas a cada fiada
        float course = floor(wc.y/3.), r = wc.y - course*3.;
        float bx = wc.x + mod(course, 2.)*3.;
        float col = mod(bx, 6.);
        float brick = hash(vec2(floor(bx/6.), course));
        if (r > 1.5) special = ${E.glyphIndex('_')};
        else if (col < .5) special = ${E.glyphIndex('|')};
        else slot = int(brick*float(count)*.999 + h*.6) % count;
        a *= .82 + .32*brick;
      } else if (mode == 6){
        // tábuas: emendas desencontradas e pregos
        float row = floor(wc.y), seam = mod(wc.x + row*3., 9.);
        if (seam < .5) special = ${E.glyphIndex('|')};
        else if (seam < 1.5 || seam > 7.5) special = ${E.glyphIndex('·')};
        else slot = int(mod(row, 2.));
        a *= .88 + .2*hash(vec2(floor((wc.x + row*3.)/9.), row));
      } else if (mode == 7){
        // camadas sedimentares onduladas + pedrinhas
        float band = floor((wc.y + noise(wc.x*.08)*3.)/2.);
        float bh = hash(vec2(band, 3.1));
        slot = int(bh*float(count)*.999);
        if (h > .965) special = ${E.glyphIndex('o')};
        a *= .85 + .3*bh;
      }
      g = special >= 0 ? special : glyphOf(m, slot);
      // borda superior exposta (topo do terreno) e sombra sob saliências
      if (mode != 2 && mode != 3 && mode != 4){
        int mu = matAt(c + ivec2(0,-1)), md = matAt(c + ivec2(0,1));
        bool openUp = mu != m && (flags(c + ivec2(0,-1)) & 1) == 0;
        if (openUp){
          int tg = glyphOf(m, 11);
          if (tg > 0) g = tg;
          a = min(a * 1.3 + .05, vec3(1.));
        } else if (md != m && (flags(c + ivec2(0,1)) & 1) == 0 && (int(info.a*255.+.5) & 1) != 0) a *= .65;
      }
      float e = max(memit, aux.g);
      col = a * mix(L, vec3(1.15), e);
      // água: reflete o que está acima da superfície, com ondulação
      if ((int(info.a*255.+.5) & 2) != 0 && mode == 3){
        int sy = c.y;
        for (int k=0;k<48;k++){ if (matAt(ivec2(c.x, sy-1)) != m) break; sy--; }
        float wob = sin(uTime*2. + float(c.y)*.9)*1.3;
        ivec2 mc = ivec2(c.x + int(wob), 2*sy - c.y - 1);
        int mm = matAt(mc);
        vec3 rc;
        if (mm == 0){ vec3 bb; vec2 mf = frag; mf.y = (float(mc.y)+.5)*uCell.y - uOff.y; vec4 s2 = sky(mc, mf, bb); rc = s2.rgb*(s2.w>0.?1.:0.) + bb*2.; }
        else rc = texelFetch(uAlb, cl(mc), 0).rgb * texelFetch(uLight, cl(mc), 0).rgb*2.;
        float depth = float(c.y - sy);
        col = mix(col, rc*1.1, .55*exp(-depth*.04));
        if (dot(rc, vec3(.33)) > .35 && h > .3) g = ${E.glyphIndex('~')};
      }
      if ((fl & 2) != 0) bg += a * L * .03;
    }
    if (ov > 0){ g = ov - 1; if (m == 0) col = vec3(1.); }
    float mask = g > 0 ? atlas(g, uv) : 0.;

    // bloom: halos suaves em espaço de pixel
    vec3 glow = vec3(0.);
    for (int i=0;i<32;i++){
      if (i>=uNL) break;
      vec4 lp = uLP[i];
      vec2 lpx = lp.xy * uCell;
      vec2 d = (p - lpx) / (lp.z * uCell.x);
      float dd = dot(d,d);
      glow += uLC[i] * lp.w * (exp(-dd*14.)*.55 + exp(-dd*3.)*.12);
    }
    vec3 outc = bg + glow*uGlow*.55 + mask * col * (1. + dot(glow, vec3(.33))*uGlow*.6);

    // chuva
    if (uRain > 0.){
      for (int k=0;k<2;k++){
        float sp = 38. + float(k)*14.;
        float colx = float(c.x) + floor(uCam.x) + float(k)*1000.;
        float yy = float(c.y) - uTime*sp + colx*7.3;
        float cellY = floor(yy/9.);
        float r = hash(vec2(colx, cellY));
        if (r < uRain*.08 && fract(yy/9.) < .22){
          float m2 = atlas(${E.glyphIndex('|')}, uv);
          outc += m2 * vec3(.45,.55,.75) * (.35 + .25*float(k));
        }
      }
    }
    // neve caindo
    if (uSnow > 0.){
      for (int k=0;k<3;k++){
        float sp = 7. + float(k)*4.;
        float colx = float(c.x) + floor(uCam.x) + float(k)*777.;
        float yy = float(c.y) + floor(uCam.y) - uTime*sp + colx*3.7;
        float cy = floor(yy/7.);
        float r = hash(vec2(colx + floor(sin(uTime*.6 + cy)*1.5), cy));
        if (r < uSnow*.06 && fract(yy/7.) < .16){
          float m2 = atlas(k == 0 ? ${E.glyphIndex('*')} : ${E.glyphIndex('.')}, uv);
          outc += m2 * vec3(.85,.9,1.) * (.45 + .2*float(k));
        }
      }
    }
    // neblina rasteira
    if (uFog > 0.){
      float fz = noise2(wc*vec2(.035,.09) + vec2(uTime*.08, 0.)) * smoothstep(.2, .9, frag.y/uRes.y);
      outc = mix(outc, uFogCol*(.25 + L*.25), clamp(fz*uFog*.55, 0., .7));
    }
    // vinheta
    vec2 q = frag/uRes - .5;
    outc *= 1. - dot(q,q)*.65;
    o = vec4(pow(outc, vec3(.95)), 1.);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n'));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  function tex(gl, w, h, data, filter = gl.NEAREST) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }

  E.Renderer = {
    init(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL2 não disponível neste navegador');
      this.gl = gl;
      this.canvas = canvas;
      this.light = program(gl, LIGHT_FS);
      this.glyph = program(gl, GLYPH_FS);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.matTex = tex(gl, 4, 256, E.buildMaterialTable());
      this.fbo = gl.createFramebuffer();
    },

    // atlas de glifos renderizado com a fonte escolhida, no tamanho exato da célula em pixels do dispositivo
    setFont(sizeCss, family) {
      const gl = this.gl;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.round(sizeCss * dpr);
      const m = document.createElement('canvas').getContext('2d');
      m.font = `${px}px ${family}`;
      const cw = Math.max(2, Math.round(m.measureText('M').width));
      const ch = Math.max(3, Math.round(px * 1.12));
      const chars = [...E.ATLAS_CHARS];
      const cols = 16, rows = Math.ceil(chars.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * cw;
      cv.height = rows * ch;
      const ctx = cv.getContext('2d');
      ctx.font = `${px}px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      chars.forEach((c, i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        if ('█▀▄'.includes(c)) {
          const hh = c === '█' ? ch : Math.round(ch / 2);
          ctx.fillRect(x, c === '▄' ? y + ch - hh : y, cw, hh);
        } else ctx.fillText(c, x + cw / 2, y + ch / 2 + 1);
      });
      if (this.atlasTex) gl.deleteTexture(this.atlasTex);
      this.atlasTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      this.cw = cw;
      this.ch = ch;
      this.dpr = dpr;
      this.atlasCols = cols;
      this.resize();
    },

    resize() {
      const dpr = this.dpr || 1;
      const W = Math.round(this.canvas.clientWidth * dpr), H = Math.round(this.canvas.clientHeight * dpr);
      this.canvas.width = W;
      this.canvas.height = H;
      this.cols = Math.ceil(W / this.cw) + 2;
      this.rows = Math.ceil(H / this.ch) + 2;
      const gl = this.gl;
      const n = this.cols * this.rows * 4;
      this.alb = new Uint8Array(n);
      this.aux = new Uint8Array(n);
      for (const k of ['albTex', 'auxTex', 'lightTex']) if (this[k]) gl.deleteTexture(this[k]);
      this.albTex = tex(gl, this.cols, this.rows, null);
      this.auxTex = tex(gl, this.cols, this.rows, null);
      this.lightTex = tex(gl, this.cols, this.rows, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lightTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    // f: { camCell:[x,y], off:[px,py], lights:[{x,y,r,i,c:[r,g,b]}] (em células da grade), amb, time, ... }
    draw(f) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.albTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, this.alb);
      gl.bindTexture(gl.TEXTURE_2D, this.auxTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, this.aux);

      const LP = new Float32Array(32 * 4), LC = new Float32Array(32 * 3);
      const n = Math.min(32, f.lights.length);
      for (let i = 0; i < n; i++) {
        const l = f.lights[i];
        LP.set([l.x, l.y, l.r, l.i], i * 4);
        LC.set(l.c, i * 3);
      }
      const common = (P) => {
        gl.uniform1i(P.u.uAlb, 0);
        gl.uniform1i(P.u.uAux, 1);
        gl.uniform2i(P.u.uGrid, this.cols, this.rows);
        gl.uniform1f(P.u.uAspect, this.ch / this.cw);
        gl.uniform1i(P.u.uNL, n);
        gl.uniform4fv(P.u.uLP, LP);
        gl.uniform3fv(P.u.uLC, LC);
      };
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.albTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.auxTex);

      // passada 1: luz
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.cols, this.rows);
      gl.useProgram(this.light.p);
      common(this.light);
      gl.uniform3fv(this.light.u.uAmb, f.amb);
      gl.uniform1i(this.light.u.uShadows, f.shadows ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // passada 2: glifos
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      const P = this.glyph;
      gl.useProgram(P.p);
      common(P);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.matTex);
      gl.uniform1i(P.u.uLight, 2);
      gl.uniform1i(P.u.uAtlas, 3);
      gl.uniform1i(P.u.uMat, 4);
      gl.uniform1i(P.u.uAtlasCols, this.atlasCols);
      gl.uniform2f(P.u.uCell, this.cw, this.ch);
      gl.uniform2f(P.u.uOff, f.off[0], f.off[1]);
      gl.uniform2f(P.u.uCam, f.camCell[0], f.camCell[1]);
      gl.uniform2f(P.u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1f(P.u.uTime, f.time);
      gl.uniform1f(P.u.uGlow, f.glow);
      gl.uniform1f(P.u.uRain, f.rain);
      gl.uniform1f(P.u.uFog, f.fog);
      gl.uniform1f(P.u.uHorizon, f.horizon ?? 0.62);
      gl.uniform4fv(P.u.uCel, f.cel || [0.76, 0.17, 0, 1]);
      gl.uniform1f(P.u.uStarA, f.stars ?? 1);
      gl.uniform1f(P.u.uDayK, f.dayK || 0);
      gl.uniform1i(P.u.uBiomeA, f.biomeA || 0);
      gl.uniform1i(P.u.uBiomeB, f.biomeB || 0);
      gl.uniform1f(P.u.uBiomeMix, f.biomeMix || 0);
      gl.uniform1f(P.u.uSnow, f.snow || 0);
      gl.uniform3fv(P.u.uSkyTop, f.sky.top);
      gl.uniform3fv(P.u.uSkyBot, f.sky.bot);
      gl.uniform3fv(P.u.uMoonCol, f.sky.moon);
      gl.uniform3fv(P.u.uFogCol, f.sky.fog);
      const PU = new Float32Array(16);
      (f.pushers || []).slice(0, 4).forEach((p, i) => PU.set([p.x, p.y, p.vx, 1], i * 4));
      gl.uniform4fv(P.u.uPush, PU);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
})();

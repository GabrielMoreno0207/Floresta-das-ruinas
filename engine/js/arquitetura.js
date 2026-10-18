'use strict';
// Arquitetura medieval: casas em corte (como em Terraria — vemos a parede do fundo por dentro), oficinas,
// barracas de mercado e uma biblioteca de móveis/objetos desenhados em ASCII. Tudo na escala do herói
// (~20 linhas de altura): porta com 26 linhas, pé-direito de 30.
(function () {
  const E = window.ENG;
  const M = () => E.MAT;

  // ---------- objetos (arte ASCII + chaves de cor de E.ART_PAL) ----------
  // a base de cada objeto fica na última linha (apoiada no chão em y = gy - 1)
  E.PROPS = {
    barril: { r: [' .----. ', '/======\\', '|| |  ||', '|======|', '|| |  ||', '\\======/'], k: [' WWWWWW ', 'WiiiiiiW', 'Wwwwwwww', 'wiiiiiiw', 'wwwwwwwW', 'WiiiiiiW'] },
    barrilAgua: { r: [' .----. ', '/~~~~~~\\', '|| |  ||', '|======|', '|| |  ||', '\\======/'], k: [' WWWWWW ', 'WZZZZZZW', 'Wwwwwwww', 'wiiiiiiw', 'wwwwwwwW', 'WiiiiiiW'] },
    caixote: { r: ['+--------+', '|\\      /|', '|  \\  /  |', '|  /  \\  |', '|/      \\|', '+--------+'], k: ['WWWWWWWWWW', 'WwwwwwwwwW', 'WwwwwwwwwW', 'WwwwwwwwwW', 'WwwwwwwwwW', 'WWWWWWWWWW'] },
    caixotes: { r: ['   +------+  ', '   |\\    /|  ', '+--+--++--+-+', '|\\    /|\\  /|', '|  ><  |  >< |', '|/    \\|/  \\|', '+------+----+'], k: ['   WWWWWWWW  ', '   WwwwwwwW  ', 'WWWWWWWWWWWWW', 'WwwwwwwWwwwwW', 'WwwwwwwWwwwwW', 'WwwwwwwWwwwwW', 'WWWWWWWWWWWWW'] },
    lenha: { r: ['   o@o@o    ', '  o@o@o@o   ', ' o@o@o@o@o  ', 'o@o@o@o@o@o '], k: ['   hWhWh    ', '  hWhWhWh   ', ' hWhWhWhWh  ', 'hWhWhWhWhWh '] },
    saco: { r: [' _/\\_ ', '(    )', '( $$ )', '(____)'], k: [' rrrr ', 'hhhhhh', 'hhGGhh', 'hhhhhh'] },
    sacos: { r: ['  _/\\_      ', ' (    ) _/\\_', ' (    )(    )', '(____)(_____)'], k: ['  rrrr      ', ' hhhhhh rrrr', ' hhhhhhhhhhhh', 'hhhhhhhhhhhhh'] },
    cesto: { r: [' o@o@o ', '\\#####/', ' \\###/ '], k: [' cecec ', 'ryyyyyr', ' ryyyr '] },
    cestoPeixe: { r: ['<><  ><>', '\\######/', ' \\####/ '], k: ['ZZZ  ZZZ', 'ryyyyyyr', ' ryyyyr '] },
    jarros: { r: [' _   _  ', '(o) (O) ', '|_| |_| '], k: [' t   t  ', 'ttt ttt ', 'ttt ttt '] },
    floreira: { r: ['*o*o*o*o*', '[=======]'], k: ['cecVcece', 'WwwwwwwwW'] },
    vaso: { r: ['\\|/', '(_)'], k: ['eee', 'ttt'] },
    lanternaParede: { r: ['-+', ' #', '[▒]', ' V '], k: ['ii', ' i', 'ilI', ' i '] },
    mesa: { r: [' u    @@   o  ', '==============', ' ||        || ', ' ||        || ', ' ||        || '], k: [' p    hh   t  ', 'WwwwwwwwwwwwwW', ' WW        WW ', ' WW        WW ', ' WW        WW '] },
    mesaLonga: { r: [' u  u   @@  u  o  u ', '====================', ' ||              || ', ' ||              || ', ' ||              || '], k: [' p  p   hh  p  t  p ', 'WwwwwwwwwwwwwwwwwwwW', ' WW              WW ', ' WW              WW ', ' WW              WW '] },
    banco: { r: ['====', '|  |', '|  |'], k: ['wwww', 'W  W', 'W  W'] },
    bancoLongo: { r: ['==========', '||      ||', '||      ||'], k: ['wwwwwwwwww', 'WW      WW', 'WW      WW'] },
    cama: { r: ['|\\                ', '| \\______________ ', '|@@)~~~~~~~~~~~~~|', '|================|', '||              ||'], k: ['W                 ', 'W WWWWWWWWWWWWWWW ', 'WppcccccccccccccW', 'WwwwwwwwwwwwwwwwW', 'WW              WW'] },
    estante: { r: ['+------------+', '|o O ||| o ‖ |', '|============|', '||‖| oO  ||‖ |', '|============|', '| O  ‖||  @o |', '|============|', '||          ||'], k: ['WWWWWWWWWWWWWW', 'WtZ cVC t C W', 'WwwwwwwwwwwwwW', 'WCcVW tZ  VCW W', 'WwwwwwwwwwwwwW', 'W Z  cCV  ht W', 'WwwwwwwwwwwwwW', 'WW          WW'] },
    lareira: { r: ['  ##########  ', ' #==========# ', ' #|        |# ', ' #|  ^  ^  |# ', ' #| ^*^*^^ |# ', ' #|*@*@*@* |# ', '##==========##'], k: ['  SSSSSSSSSS  ', ' SssssssssssS ', ' Ss        sS ', ' Ss  f  f  sS ', ' Ss FfFfFf sS ', ' SsfffffffFsS ', 'SSSSSSSSSSSSSS'] },
    bigorna: { r: [' .__________.', ' \\____  ____/', '      ||     ', '    _/__\\_   '], k: [' IIIIIIIIIIII', ' IiiiiiiiiiiI', '      II     ', '    WWWWWW   '] },
    cavaleteArmas: { r: ['  ^   P  ^  )  ', '  |   |  |  |  ', '==|===|==|==|==', '  |   |  |  |  ', '  |   |  |  |  ', '==+===+==+==+==', '||           ||'], k: ['  i   i  i  W  ', '  W   W  W  W  ', 'wwWwwwWwwWwwWww', '  W   W  W  W  ', '  W   W  W  W  ', 'wwiwwwiwwiwwiww', 'WW           WW'] },
    carvao: { r: ['   .%%.   ', ' .%&%&%%. ', '%&%&%%&%&%'], k: ['   kkkk   ', ' kKkKkKkk ', 'kKkKkkKkKk'] },
    bancada: { r: [' T  /  o ~ ', '===========', '|| #   # ||', '||_______||'], k: [' i  W  t i ', 'WwwwwwwwwwW', 'WW W   W WW', 'WWwwwwwwwWW'] },
    roda: { r: [' .-. ', '(-+-)', " '-' "], k: [' WWW ', 'WWiWW', ' WWW '] },
    carroca: { r: ['   ________   ', '  |########|_ ', '  |########| \\', ' .-.      .-. ', '(-+-)    (-+-)', " '-'      '-' "], k: ['   WWWWWWWW   ', '  WyyyyyyyyWW ', '  WyyyyyyyyW W', ' WWW      WWW ', 'WWiWW    WWiWW', ' WWW      WWW '] },
    tapete: { r: ['~=~=~=~=~=~=~=~'], k: ['cgcgcgcgcgcgcgc'] },
    poco: null,
    // túmulos, criptas e templos
    lapide: { r: [' ___ ', '/ + \\', '| ʟ |', '|___|'], k: [' SSS ', 'SsosS', 'SsSsS', 'SSSSS'] },
    cruzTumba: { r: [' | ', '-+-', ' | ', ' | '], k: [' W ', 'WWW', ' W ', ' W '] },
    sarcofago: { r: ['  ___________  ', ' / ʟΛШ ♦ ШΛʟ \\ ', '|=============|', '|  ||     ||  |', '|_____________|'], k: ['  SSSSSSSSSSS  ', ' SsGGGsgsGGGsS ', 'SsssssssssssssS', 'SS  SS     SS S', 'SSSSSSSSSSSSSSS'] },
    altar: { r: ['   *   *   ', '   |   |   ', ' _[=====]_ ', '|  ʟΛШΛʟ  |', '|_________|'], k: ['   F   F   ', '   p   p   ', ' SsGGgGGsS ', 'SsssGGGsssS', 'SSSSSSSSSSS'] },
    pilar: { r: ['[====]', ' |  | ', ' |  | ', ' |  | ', ' |  | ', ' |  | ', ' |  | ', ' |  | ', '[====]'], k: ['SSSSSS', ' sSsS ', ' sSsS ', ' sSsS ', ' sSsS ', ' sSsS ', ' sSsS ', ' sSsS ', 'SSSSSS'] },
    colunaQuebrada: { r: [' _/\\ ', ' |  |', ' |  |', ' |  |', '[====]'], k: [' SsS ', ' sSsS', ' sSsS', ' sSsS', 'SSSSSS'] },
    cranio: { r: [' .-. ', '(o o)', " |^| "], k: [' ooo ', 'oSoSo', ' ooo '] },
    ossos: { r: ['o-=-o  _ ', '  o-=-o( )'], k: ['ooooo  o ', '  oooooooo'] },
    estatua: { r: ['  .-.  ', ' (o.o) ', '  |=|  ', ' /| |\\ ', '  | |  ', ' _|_|_ ', '[=====]'], k: ['  sss  ', ' sSsSs ', '  sss  ', ' sssss ', '  s s  ', ' SsSsS ', 'SSSSSSS'] },
    // natureza
    toco: { r: [' .--. ', '(@@@@)', '|||||', "/'  '\\"], k: [' hhhh ', 'hWhWhh', 'bbbbb', 'bb  bb'] },
    troncoCaido: { r: ['  ___________________   ', ' (@)_________________)  ', '  \'   \'      v    \'    '], k: ['  bbbbbbbbbbbbbbbbbbb   ', ' hWhbbbbbbbbbbbbbbbbbb  ', '  e   m      j    e    '] },
    pedra: { r: ['  .--.  ', ' /    \\ ', '(______)'], k: ['  ssss  ', ' sSssSs ', 'SSSSSSSS'] },
    pedraMusgo: { r: [' ,"",.  ', ' /    \\ ', '(______)'], k: [' mjmjm  ', ' sSssSs ', 'SSSSSSSS'] },
    pedraNeve: { r: [' ▄▄▄▄   ', ' /    \\ ', '(______)'], k: [' nnnn   ', ' sSssSs ', 'SSSSSSSS'] },
    pedraVento: { r: ['   ___    ', '  /___\\_  ', ' |_____ \\ ', '/________\\'], k: ['   AAA    ', '  AaaaAA  ', ' AaaaaaAA ', 'AAAAAAAAAA'] },
    cogumelos: { r: [' .-.   ', '(___) n', '  |  (_)'], k: [' ccc   ', 'cpcpc t', '  p  ttt'] },
    cogumelosBrilho: { r: [' .-.  ', '(o o) n', '  |  (o)'], k: [' UUU  ', 'UUUUU U', '  p  UUU'] },
    flores: { r: ['* o * ', "\\|/|/ "], k: ['c y V ', 'eeeee '] },
    folhas: { r: [",'`,.'`,", "`.,'`.,'"], k: ['xGyxGyxG', 'GxyGxyGx'] },
    arbustoSeco: { r: [' \\|/ \\/ ', '\\\\|//|/ ', ' \\|||/  '], k: [' AAA AA ', 'AAAAAAA ', ' AAAAA  '] },
    capimSeco: { r: ['\\ | /', ' \\|/ '], k: ['AhAhA', ' AAA '] },
    cactoAlto: { r: ['    _    ', '   | |   ', ' _ | | _ ', '| || || |', ' \\_   _/ ', '   | |   ', '   | |   '], k: ['    j    ', '   jej   ', ' j jej j ', 'jejjejjej', ' jjjejjj ', '   jej   ', '   jej   '] },
    cactoBarril: { r: [' .*. ', '(|||)', '(|||)'], k: [' jcj ', 'jejej', 'jejej'] },
    cactoPalma: { r: [' () () ', '(  )() ', ' (  )  ', '  ||   '], k: [' jj jj ', 'jejjjj ', ' jejj  ', '  jj   '] },
    planta: { r: [' \\|/ ', '--+--'], k: [' eee ', 'eeEee'] },
    cristais: { r: ['  ^    ', ' /|\\ ^ ', '/◆|◆/|\\', '\\_◆_\\◆/'], k: ['  z    ', ' zZz z ', 'zZzZzZz', 'ZZZZZZZ'] },
    cristaisRoxo: { r: ['  ^   ', ' /◆\\^ ', '/◆◆◆◆\\'], k: ['  U   ', ' UuUU ', 'UuUuUU'] },
    estalagmite: { r: ['  .  ', ' /^\\ ', '/   \\'], k: ['  s  ', ' sSs ', 'SSSSS'] },
    estalactite: { r: ['\\   /', ' \\v/ ', '  v  ', '  .  '], k: ['SSSSS', ' sSs ', '  s  ', '  s  '] },
    pingente: { r: ['\\▼/', ' v ', ' . '], k: ['zZz', ' z ', ' z '] },
    raizes: { r: ['\\ | /  |', ' \\|/ \\ |', '  |   \\|', '  (    )'], k: ['bbbbb  b', ' bbb b b', '  b   bb', '  b    b'] },
    junco: { r: ['| , |', '|/| |', '|||/|'], k: ['jxjxj', 'jjjjj', 'jjjjj'] },
    arvoreSeca: { r: ['\\  |  /', ' \\ | / ', '  \\|/  ', '   |   ', '   |   ', '   |   ', '  /|\\  '], k: ['bbbbbbb', ' bbbbb ', '  bbb  ', '   b   ', '   b   ', '   b   ', '  bbb  '] },
  };

  // carimba um objeto apoiado no chão (gy = linha do chão; a última linha da arte fica em gy - 1)
  E.prop = (w, name, x, gy, o = {}) => {
    const P = E.PROPS[name];
    if (!P) return;
    E.stampArt(w, x, gy - P.r.length, P.r, P.k, o);
    return { w: Math.max(...P.r.map((r) => [...r].length)), h: P.r.length };
  };
  // pendura um objeto no teto (a primeira linha da arte fica em y)
  E.propHang = (w, name, x, y, o = {}) => {
    const P = E.PROPS[name];
    if (P) E.stampArt(w, x, y, P.r, P.k, o);
  };
  E.propSize = (name) => {
    const P = E.PROPS[name];
    return P ? { w: Math.max(...P.r.map((r) => [...r].length)), h: P.r.length } : { w: 0, h: 0 };
  };
  // área livre para um objeto (nada no fundo/meio e chão sólido embaixo)
  E.propFits = (w, name, x, gy) => {
    const { w: pw, h } = E.propSize(name);
    for (let xx = x; xx < x + pw; xx++) {
      if (!w.solid(xx, gy)) return false;
      for (let y = gy - h; y < gy; y++) if (w.get('back', xx, y) || w.get('main', xx, y)) return false;
    }
    return true;
  };

  // janela com moldura: lit = vidro aceso (luz de dentro), shutters = venezianas abertas dos lados
  E.windowArt = (w, x, y, ww, hh, o = {}) => {
    const rows = [], keys = [], glass = o.lit ? 'l' : 'q', gch = o.lit ? '▒' : '░', fr = o.frame || 'W';
    const sh = o.shutters;
    for (let j = 0; j < hh; j++) {
      let r = '', k = '';
      for (let i = 0; i < ww; i++) {
        const edgeX = i === 0 || i === ww - 1, edgeY = j === 0 || j === hh - 1, midX = i === ww >> 1, midY = j === hh >> 1;
        if (o.arch && j === 0) (r += edgeX ? ' ' : i === 1 ? '/' : i === ww - 2 ? '\\' : '-'), (k += fr);
        else if (edgeX && edgeY) (r += '+'), (k += fr);
        else if (edgeY) (r += j === hh - 1 ? '=' : '-'), (k += fr);
        else if (edgeX) (r += '|'), (k += fr);
        else if (midX && midY) (r += '+'), (k += fr);
        else if (midX) (r += '|'), (k += fr);
        else if (midY) (r += '-'), (k += fr);
        else (r += gch), (k += glass);
      }
      rows.push(r);
      keys.push(k);
    }
    E.stampArt(w, x, y, rows, keys, { layer: o.layer });
    if (sh) {
      const sr = [], sk = [];
      for (let j = 0; j < hh; j++) sr.push(j === 0 || j === hh - 1 ? '+' : '#'), sk.push(sh);
      E.stampArt(w, x - 1, y, sr, sk, { layer: o.layer });
      E.stampArt(w, x + ww, y, sr, sk, { layer: o.layer });
    }
    if (o.box) E.prop(w, 'floreira', x + ((ww - 9) >> 1), y + hh + 2, { layer: o.layer });
  };

  // placa pendurada num braço de ferro saindo da parede (dir = 1: para a direita)
  E.signArt = (w, x, y, text, dir = 1, o = {}) => {
    const t = String(text).toUpperCase(), bw = [...t].length + 4, armLen = bw + 2;
    const rows = ['+' + '-'.repeat(armLen - 2) + '+', '  |' + ' '.repeat(bw - 4) + '| ', ' [' + '='.repeat(bw - 2) + ']', ' | ' + t + ' |', ' [' + '='.repeat(bw - 2) + ']'];
    const keys = rows.map((r, j) => [...r].map((c) => (j === 0 ? 'I' : j === 1 ? 'i' : j === 3 && /[A-Z0-9$♦☼♥]/.test(c) ? o.ink || 'g' : 'W')).join(''));
    E.stampArt(w, dir > 0 ? x : x - armLen + 1, y, rows, keys, { layer: o.layer });
  };

  // ---------- casas em corte ----------
  // kind: 'palha' (cabana de tábuas, telhado de palha) | 'enxaimel' (vigas aparentes, reboco, 2º andar avançado)
  //       | 'pedra' (alvenaria, telhas, janelas em arco) | 'adobe' (arenito, terraço) | 'estalagem' (2 andares, placa)
  // o: { width, floors, door: -1 (esquerda) | 1 (direita), sign, props (da porta), role ('simples'|'comerciante'|'artesao'|'nobre'|'estalagem') }
  const FLOOR_H = 30, UP_H = 22, DOOR_H = 27;
  E.Struct.house = (w, x, gy, rnd, o = {}) => {
    const kind = o.kind || 'palha', MT = M();
    const floors = o.floors || (kind === 'estalagem' || kind === 'enxaimel' ? 2 : 1);
    const bw = o.width || { palha: 48, enxaimel: 58, pedra: 54, adobe: 52, estalagem: 76 }[kind] || 50;
    const x0 = x - (bw >> 1), x1 = x0 + bw - 1;
    const upTop = gy - FLOOR_H - (floors > 1 ? UP_H + 1 : 0), floorY = gy - FLOOR_H - 1;
    const jetty = kind === 'enxaimel' || kind === 'estalagem' ? 2 : 0; // andar de cima avança sobre a rua
    const doorSide = o.door || -1;
    const wallMat = { palha: MT.WOOD, enxaimel: MT.WOOD, pedra: MT.MASONRY, adobe: MT.SANDSTONE, estalagem: MT.WOOD }[kind];
    const roofMat = { palha: MT.THATCH, enxaimel: MT.SHINGLE, pedra: MT.SHINGLE, adobe: MT.SANDSTONE, estalagem: MT.SHINGLE }[kind];
    const P = E.ART_PAL;
    // 1) limpa e pinta a parede do fundo (o que vemos por dentro)
    for (let y = upTop - 36; y < gy; y++)
      for (let xx = x0 - jetty - 4; xx <= x1 + jetty + 4; xx++) {
        w.set('main', xx, y, 0);
        w.set('front', xx, y, 0);
        if (y < upTop || xx < x0 - (y < floorY ? jetty : 0) || xx > x1 + (y < floorY ? jetty : 0)) w.set('back', xx, y, 0);
      }
    const L0 = (y) => (y < floorY ? x0 - jetty : x0), L1 = (y) => (y < floorY ? x1 + jetty : x1);
    for (let y = upTop; y < gy; y++)
      for (let xx = L0(y); xx <= L1(y); xx++) {
        const lx = xx - x0, ly = gy - 1 - y;
        let m = MT.PLANK, c = null;
        if (kind === 'enxaimel' || kind === 'estalagem') {
          // reboco entre vigas: postes a cada 12 colunas, travessas nos andares, embasamento de pedra
          m = ly < 3 ? MT.COBBLE : MT.PLASTER;
          if (ly >= 3 && ((lx + 600) % 12 === 0 || y === floorY + 1 || y === upTop || ly === 3)) (m = MT.BARK), (c = P.b.map((v) => v * (0.9 + E.hash2(xx, y) * 0.2)));
        } else if (kind === 'pedra') m = ly < 2 ? MT.COBBLE : MT.MASONRY;
        else if (kind === 'adobe') {
          m = MT.SANDSTONE;
          c = [196 + E.hash2(xx, y) * 20, 160 + E.hash2(xx, y) * 14, 112];
        } else if ((lx + 600) % 6 === 0) m = MT.BARK;
        w.set('back', xx, y, m, c);
      }
    // mãos-francesas (diagonais) nos painéis do enxaimel
    if (kind === 'enxaimel' || kind === 'estalagem')
      for (let px = x0 + 12; px + 12 <= x1; px += 24)
        for (const [yb, yt] of floors > 1 ? [[gy - 4, floorY + 2], [floorY - 1, upTop + 1]] : [[gy - 4, floorY + 2]]) {
          const h = yb - yt;
          for (let k = 0; k <= h; k++) {
            const xs = Math.round((k / h) * 11);
            E.stampArt(w, px - 12 + xs, yb - k, ['/'], ['b'], { vary: 0.05 });
            E.stampArt(w, px + 12 - xs, yb - k, ['\\'], ['b'], { vary: 0.05 });
          }
        }
    // 2) chão e fundação
    w.fillRect('main', x0 - 1, gy, bw + 2, 1, kind === 'pedra' || kind === 'adobe' ? MT.COBBLE : MT.WOOD);
    for (let xx = x0 - 1; xx <= x1 + 1; xx++) for (let y = gy + 1; y < gy + 8; y++) if (!w.get('main', xx, y)) w.set('main', xx, y, kind === 'adobe' ? MT.SAND : MT.DIRT);
    // 3) paredes laterais (a da porta tem o vão) e verga da porta
    const side = (xa, door) => {
      for (let y = upTop; y < gy; y++) {
        if (door && y >= gy - DOOR_H) continue;
        const xw = y < floorY ? (xa < x ? xa - jetty : xa + jetty) : xa;
        for (let k = 0; k < 2; k++) w.set('main', xw + (xa < x ? k : -k), y, y < floorY && jetty ? MT.WOOD : wallMat);
      }
    };
    side(x0, true); // porta dos dois lados
    side(x1, true);
    for (const dx of [x0, x1 - 1]) E.stampArt(w, dx - 1, gy - DOOR_H - 2, ['[==]', ' ## '], ['WWWW', ' gg '], { layer: 'main', solid: true });
    // 4) andar de cima: piso vazado + escada
    if (floors > 1) {
      for (let xx = L0(floorY - 1); xx <= L1(floorY - 1); xx++) {
        w.set('main', xx, floorY, MT.WOOD);
        if (xx > x0 + 1 && xx < x1 - 1) w.col[w.idx(xx, floorY)] = E.CT.ONEWAY;
      }
      // vigas que seguram o balanço do 2º andar
      if (jetty) for (const xb of [x0 - jetty, x1 + jetty - 1]) E.stampArt(w, xb, floorY + 1, ['\\/'], ['bb'], { layer: 'back' });
      E.Struct.ladder(w, doorSide < 0 ? x0 + 6 : x1 - 9, floorY, gy - 1);
    }
    // 5) forro e telhado em corte: casca grossa com borda desenhada, sótão com tesoura de madeira atrás
    const ceil = upTop - 1;
    for (let xx = L0(ceil) - 1; xx <= L1(ceil) + 1; xx++) w.set('main', xx, ceil, MT.WOOD);
    const roofTop = (() => {
      if (kind === 'adobe') {
        // terraço com parapeito e calhas de madeira
        for (let xx = x0 - 2; xx <= x1 + 2; xx++) w.set('main', xx, ceil - 1, MT.SANDSTONE, [204, 168, 118]);
        for (let xx = x0 - 2; xx <= x1 + 2; xx += 1) if ((xx - x0 + 40) % 6 < 3) w.set('main', xx, ceil - 2, MT.SANDSTONE, [214, 178, 126]);
        for (const xx of [x0 + 4, x1 - 4]) E.stampArt(w, xx, ceil + 1, ['o'], ['W'], { layer: 'main', solid: true });
        return ceil - 2;
      }
      const over = 4, slope = kind === 'palha' ? 1.15 : 1.5, half0 = (L1(ceil) - L0(ceil)) / 2 + over;
      const mid = (L0(ceil) + L1(ceil)) / 2;
      let y = ceil - 1;
      for (let k = 0; ; k++, y--) {
        const half = half0 - k * slope;
        if (half < 1) break;
        const a = Math.round(mid - half), b = Math.round(mid + half);
        const thick = Math.ceil(slope) + 2;
        for (let xx = a; xx <= b; xx++) {
          const shell = xx - a < thick || b - xx < thick || k === 0;
          if (shell) w.set('main', xx, y, roofMat);
          else {
            // sótão: escuro, com tesoura
            const lx = xx - Math.round(mid);
            w.set('back', xx, y, Math.abs(lx) % 9 === 0 || k % 6 === 0 ? MT.BARK : MT.PLANK, Math.abs(lx) % 9 === 0 || k % 6 === 0 ? P.b : [70, 48, 30]);
          }
        }
        // borda do telhado desenhada e beiral
        E.stampArt(w, a, y, ['/'], [kind === 'palha' ? 'A' : 'R'], { layer: 'main', solid: true });
        E.stampArt(w, b, y, ['\\'], [kind === 'palha' ? 'A' : 'R'], { layer: 'main', solid: true });
      }
      E.stampArt(w, Math.round(mid) - 1, y, ['/^\\'], [kind === 'palha' ? 'AAA' : 'RRR'], { layer: 'main', solid: true });
      // telhado de palha: franja pendurada no beiral
      if (kind === 'palha') for (let xx = Math.round(mid - half0); xx <= Math.round(mid + half0); xx++) if (E.hash2(xx, 7) < 0.7) E.stampArt(w, xx, ceil, ["'"], ['y'], { layer: 'front' });
      return y;
    })();
    // 6) chaminé com fumaça (sobe do lado oposto à porta)
    if (o.chimney !== false && kind !== 'adobe') {
      const cx = doorSide < 0 ? x1 - 14 : x0 + 11;
      const top = Math.min(roofTop + 6, ceil - 8);
      for (let y = top; y < ceil; y++) for (let k = 0; k < 4; k++) w.set('main', cx + k, y, MT.COBBLE, P.S.map((v) => v * (0.8 + E.hash2(cx + k, y) * 0.3)));
      E.stampArt(w, cx - 1, top - 1, ['[====]'], ['SSSSSS'], { layer: 'main', solid: true });
      (w.smokes ||= []).push({ x: cx + 2, y: top - 2 });
    }
    // 7) janelas: térreo com vidro escuro, andar de cima aceso; caixas de flores
    const winY0 = gy - 22, wn = Math.max(1, Math.floor((bw - 22) / 18));
    for (let i = 0; i < wn; i++) {
      const wx = x0 + 12 + Math.round(((bw - 30) / Math.max(1, wn)) * (i + 0.5));
      if (Math.abs(wx - (doorSide < 0 ? x1 - 8 : x0 + 4)) < 8) continue;
      E.windowArt(w, wx, winY0, 9, 9, { arch: kind === 'pedra' || kind === 'adobe', shutters: kind === 'palha' || kind === 'enxaimel' ? 'v' : null });
    }
    if (floors > 1)
      for (let i = 0; i < wn + 1; i++) {
        const wx = x0 + 6 + Math.round(((bw - 18) / (wn + 1)) * (i + 0.5));
        E.windowArt(w, wx, upTop + 4, 9, 9, { lit: E.hash2(wx, gy) < 0.7, shutters: 'v', box: kind === 'enxaimel' && i % 2 === 0 });
      }
    // 8) móveis por função (térreo e andar de cima)
    const inner0 = x0 + 3, inner1 = x1 - 3;
    const place = (name, xx, yy = gy) => E.prop(w, name, xx, yy);
    const role = o.role || 'simples';
    const farSide = doorSide < 0 ? inner1 : inner0; // longe da porta
    const lareira = () => {
      const lx = doorSide < 0 ? x1 - 19 : x0 + 6;
      place('lareira', lx);
      w.lights.push(Object.assign({ x: lx + 7, y: gy - 3, type: 'lareira', embers: true }, E.LIGHTS.tocha, { r: 30, i: 1 }));
    };
    if (kind !== 'adobe' && o.chimney !== false) lareira();
    const mid = (inner0 + inner1) >> 1;
    if (role === 'estalagem') {
      place('mesaLonga', mid - 14);
      place('bancoLongo', mid - 24);
      place('bancoLongo', mid + 8);
      place('barril', doorSide < 0 ? inner1 - 26 : inner0 + 20);
      place('barril', doorSide < 0 ? inner1 - 26 : inner0 + 20, gy - 6);
      place('caixotes', doorSide < 0 ? inner0 + 10 : inner1 - 22);
    } else if (role === 'comerciante') {
      place('estante', doorSide < 0 ? inner1 - 32 : inner0 + 18, gy - 4);
      place('mesa', mid - 8);
      place('sacos', doorSide < 0 ? inner0 + 10 : inner1 - 22);
      place('tapete', mid - 9, gy);
    } else if (role === 'artesao') {
      place('bancada', mid - 6);
      place('jarros', doorSide < 0 ? inner0 + 10 : inner1 - 18);
      place('caixote', doorSide < 0 ? inner1 - 30 : inner0 + 20);
    } else if (role === 'nobre') {
      place('estante', mid - 18, gy - 4);
      place('mesa', mid + 2);
      place('tapete', mid - 10, gy);
      // estandarte da casa no fundo
      E.Struct.banner(w, mid - 3, gy - 28, 7, 16);
    } else {
      place('mesa', mid - 8);
      place('banco', mid - 13);
      place('barril', doorSide < 0 ? inner0 + 10 : inner1 - 18);
    }
    if (floors > 1) {
      // quartos em cima
      place('cama', doorSide < 0 ? inner0 + 2 : inner1 - 20, floorY);
      if (role === 'estalagem') place('cama', mid - 4, floorY);
      place('jarros', doorSide < 0 ? inner1 - 20 : inner0 + 12, floorY);
      E.propHang(w, 'lanternaParede', mid, upTop + 2);
      w.lights.push(Object.assign({ x: mid + 1, y: upTop + 4.5, type: 'lanterna' }, E.LIGHTS.lanterna, { r: 22, i: 0.75 }));
    }
    // 9) do lado de fora: placa, lanterna da porta, lenha, barris e caixotes
    if (o.sign) E.signArt(w, doorSide < 0 ? x0 - jetty - 2 : x1 + jetty + 2, gy - DOOR_H - 9, o.sign, doorSide, { ink: o.signInk });
    for (const sd of [-1, 1]) {
      E.propHang(w, 'lanternaParede', sd < 0 ? x0 - 3 : x1 + 2, gy - DOOR_H + 2, { mirror: sd > 0 });
      w.lights.push(Object.assign({ x: (sd < 0 ? x0 - 2 : x1 + 3) + 0.5, y: gy - DOOR_H + 4.5, type: 'lanterna' }, E.LIGHTS.lanterna, { r: 20, i: 0.7 }));
    }
    const back = doorSide < 0 ? x1 + 7 : x0 - 19;
    if (o.yard !== false) {
      if (role === 'estalagem' || role === 'comerciante') E.prop(w, 'barril', back, gy, { keep: true }), E.prop(w, 'caixote', back + (doorSide < 0 ? 9 : -11), gy, { keep: true });
      else E.prop(w, 'lenha', back, gy, { keep: true });
    }
    E.Struct.doorAt(w, x0 + 1, gy, doorSide < 0 ? o.props || {} : {});
    E.Struct.doorAt(w, x1, gy, doorSide > 0 ? o.props || {} : {});
    (w.buildings ||= []).push({ x0: x0 - jetty, x1: x1 + jetty, y0: roofTop, y1: gy });
    return { x0, x1, top: roofTop, floorY };
  };

  // ---------- oficina do ferreiro: galpão aberto com fornalha, chaminé, bigorna e suporte de armas ----------
  E.Struct.forge = (w, x, gy) => {
    const MT = M();
    const x0 = x - 30, x1 = x + 30, top = gy - 32;
    for (let y = top - 16; y < gy; y++)
      for (let xx = x0 - 4; xx <= x1 + 4; xx++) {
        w.set('main', xx, y, 0);
        w.set('back', xx, y, 0);
      }
    // fundo: parede de pedra com fuligem perto da fornalha
    for (let y = top; y < gy; y++)
      for (let xx = x0 + 1; xx < x1; xx++) {
        const soot = Math.max(0, 1 - Math.hypot((xx - (x0 + 12)) / 18, (y - (gy - 10)) / 14));
        w.set('back', xx, y, (gy - y) < 3 ? MT.COBBLE : MT.BRICK, E.matColor(MT.BRICK, xx, y).map((v) => v * (1 - soot * 0.65)));
      }
    // postes e telhado de telhas inclinado para trás (uma água)
    for (const px of [x0, x1 - 1]) w.fillRect('back', px, top, 2, gy - top, MT.BARK);
    for (let k = 0; k < 7; k++) {
      const y = top - 1 - k;
      w.fillRect('main', x0 - 4 + k * 2, y, x1 - x0 + 9 - k * 4, 1, MT.SHINGLE);
      E.stampArt(w, x0 - 4 + k * 2, y, ['/'], ['R'], { layer: 'main', solid: true });
      E.stampArt(w, x1 + 4 - k * 2, y, ['\\'], ['R'], { layer: 'main', solid: true });
    }
    w.fillRect('main', x0 - 4, top, x1 - x0 + 9, 1, MT.WOOD);
    // fornalha de tijolos com boca acesa e chaminé alta
    const fx = x0 + 3;
    for (let y = gy - 14; y < gy; y++) for (let xx = fx; xx < fx + 18; xx++) w.set('main', xx, y, MT.BRICK, E.matColor(MT.BRICK, xx, y).map((v) => v * 0.8));
    for (let y = gy - 8; y < gy - 2; y++)
      for (let xx = fx + 4; xx < fx + 14; xx++) {
        w.set('main', xx, y, 0);
        w.set('back', xx, y, y > gy - 5 ? MT.LAVA : MT.FLAME);
      }
    E.stampArt(w, fx + 3, gy - 9, ['/----------\\'], ['SSSSSSSSSSSS'], { layer: 'main', solid: true });
    for (let y = top - 22; y < gy - 14; y++) for (let xx = fx + 6; xx < fx + 12; xx++) w.set('main', xx, y, MT.BRICK, E.matColor(MT.BRICK, xx, y).map((v) => v * (0.75 + 0.15 * E.hash2(xx, y))));
    E.stampArt(w, fx + 5, top - 23, ['[======]'], ['SSSSSSSS'], { layer: 'main', solid: true });
    (w.smokes ||= []).push({ x: fx + 9, y: top - 24 });
    w.lights.push(Object.assign({ x: fx + 9, y: gy - 5, type: 'lava', embers: true }, E.LIGHTS.lava, { r: 34 }));
    // bigorna, tonel de têmpera, carvão, bancada e suporte de armas
    E.prop(w, 'bigorna', fx + 21, gy);
    E.prop(w, 'barrilAgua', fx + 35, gy);
    E.prop(w, 'carvao', fx + 1, gy - 14);
    E.prop(w, 'cavaleteArmas', x1 - 16, gy);
    E.prop(w, 'bancada', x1 - 16, gy - 12);
    E.propHang(w, 'lanternaParede', x0 + 26, top + 1);
    E.signArt(w, x1 + 1, top + 3, 'Ferreiro', 1);
    // chão de pedra batida
    w.fillRect('main', x0 - 1, gy, x1 - x0 + 3, 1, MT.COBBLE);
    (w.buildings ||= []).push({ x0, x1, y0: top - 8, y1: gy });
    return { x0, x1 };
  };

  // ---------- barraca de mercado: lona listrada com franja, balcão com mercadorias do tipo da loja ----------
  const GOODS = {
    pescador: { r: ['<>< ><> <><', '==========='], k: ['ZZZ ZZZ ZZZ', 'WwwwwwwwwwW'] },
    mercador: { r: ['o@o $ o@o @', '==========='], k: ['ceeGgcecehe', 'WwwwwwwwwwW'] },
    alquimista: { r: ['o O o 0 o O', '==========='], k: ['zVUljcVzUlj', 'WwwwwwwwwwW'] },
    armeiro: { r: ['/ ^ P / ^ )', '==========='], k: ['iiiWiiiiiiW', 'WwwwwwwwwwW'] },
    curandeira: { r: ['\\|/ o \\|/ o', '==========='], k: ['eee c eee j', 'WwwwwwwwwwW'] },
  };
  E.Struct.stall = (w, x, gy, col, kind = 'mercador') => {
    const MT = M(), x0 = x - 16, x1 = x + 16, top = gy - 24;
    for (let y = top - 3; y < gy; y++) for (let xx = x0 - 2; xx <= x1 + 2; xx++) w.set('back', xx, y, 0);
    for (const px of [x0, x1]) w.fillRect('back', px, top, 1, gy - top, MT.BARK);
    // lona listrada com caimento e franja recortada
    const cA = col, cB = [236, 226, 206];
    for (let k = 0; k < 4; k++) for (let xx = x0 - 3 + k; xx <= x1 + 3 - k; xx++) w.set('back', xx, top - 1 - k, MT.CLOTH, ((xx + 40) >> 2) % 2 ? cA : cB);
    const fr = [], fk = [];
    for (let xx = x0 - 3; xx <= x1 + 3; xx++) (fr.push((xx - x0) % 2 ? 'v' : 'V')), fk.push(((xx + 40) >> 2) % 2 ? 'c' : 'p');
    E.stampArt(w, x0 - 3, top, [fr.join('')], [fk.join('')], { pal: Object.assign({}, E.ART_PAL, { c: col }) });
    // balcão de madeira com mercadorias
    const G = GOODS[kind] || GOODS.mercador;
    E.stampArt(w, x - 5, gy - 9, G.r, G.k);
    E.stampArt(w, x - 7, gy - 7, ['[=============]', '|  ||     ||  |', '|  ||     ||  |', '|  ||     ||  |', '|  ||     ||  |', '|_____________|', '|=============|'], ['WWWWWWWWWWWWWWW', 'WwwWWwwwwwWWwwW', 'WwwWWwwwwwWWwwW', 'WwwWWwwwwwWWwwW', 'WwwWWwwwwwWWwwW', 'WWWWWWWWWWWWWWW', 'WWWWWWWWWWWWWWW']);
    // cestos e sacos de lado
    E.prop(w, kind === 'pescador' ? 'cestoPeixe' : 'cesto', x0 - 9, gy, { keep: true });
    E.prop(w, 'saco', x1 + 2, gy, { keep: true });
    E.propHang(w, 'lanternaParede', x1 - 2, top + 1);
  };

  // ---------- poço de pedra com telhadinho, sarilho e balde ----------
  E.Struct.well = (w, x, gy) => {
    const MT = M();
    E.stampArt(w, x - 9, gy - 22, ['    _/^^^^^^^^\\_    ', '   /============\\   ', '  /______________\\  '], ['    RRRRRRRRRRRR    ', '   RttttttttttttR   ', '  RRRRRRRRRRRRRRRR  '], { layer: 'main', solid: true });
    for (const px of [x - 6, x + 6]) w.fillRect('back', px, gy - 19, 1, 14, MT.BARK);
    E.stampArt(w, x - 6, gy - 14, ['o===========o', '      |      ', '      |      ', '     [_]     '], ['WWWWWWWWWWWWW', '      r      ', '      r      ', '     WiW     ']);
    w.fillRect('main', x - 8, gy - 5, 17, 5, MT.COBBLE);
    w.fillRect('main', x - 6, gy - 5, 13, 5, 0);
    w.fillRect('back', x - 6, gy - 2, 13, 2, MT.WATER);
    E.stampArt(w, x - 8, gy - 6, ['[===============]'], ['SSSSSSSSSSSSSSSSS'], { layer: 'main', solid: true });
  };

  // ---------- cerca de madeira com mourões e travessas ----------
  E.Struct.fence = (w, x, gy, len) => {
    const r0 = [], r1 = [], r2 = [], r3 = [];
    for (let k = 0; k < len; k++) {
      const post = k % 6 === 0;
      r0.push(post ? 'n' : ' ');
      r1.push(post ? '|' : '=');
      r2.push(post ? '|' : ' ');
      r3.push(post ? '|' : '=');
    }
    E.stampArt(w, x, gy - 6, [r0.join(''), r1.join(''), r2.join(''), r3.join(''), r2.join(''), r2.join('')], [r0.join('').replace(/\S/g, 'W'), r1.join('').replace(/\S/g, 'w'), r2.join('').replace(/\S/g, 'W'), r3.join('').replace(/\S/g, 'w'), r2.join('').replace(/\S/g, 'W'), r2.join('').replace(/\S/g, 'W')], { keep: true });
  };

  // poste de lanterna da rua (na altura certa para o herói passar embaixo)
  E.Struct.lampPost = (w, x, gy) => {
    const MT = M();
    w.fillRect('back', x, gy - 26, 1, 26, MT.WOOD);
    E.stampArt(w, x - 1, gy - 27, ['[=]---+'], ['WWWIIII'], {});
    E.stampArt(w, x + 4, gy - 26, [' # ', '[▒]', ' V '], [' i ', 'ilI', ' i ']);
    E.stampArt(w, x - 2, gy - 1, ['/|\\'], ['WWW'], { keep: true });
    w.lights.push(Object.assign({ x: x + 5.5, y: gy - 24.5, type: 'lanterna' }, E.LIGHTS.lanterna, { r: 26, i: 0.85 }));
  };
})();

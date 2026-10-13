'use strict';
// Itens, inventário e efeitos de status.
(function () {
  const E = window.ENG;

  // ícone ASCII: linhas de caracteres + linhas de chaves de cor + paleta → {w,h,cells:[[char,'#hex']|null]}
  E.makeIcon = (rows, keys, pal) => {
    const h = rows.length, w = Math.max(...rows.map((r) => [...r].length));
    const cells = [];
    for (let y = 0; y < h; y++) {
      const cs = [...rows[y]], ks = [...(keys[y] || '')];
      for (let x = 0; x < w; x++) {
        const c = cs[x] ?? ' ', k = ks[x] ?? ' ';
        cells.push(c === ' ' || !pal[k] ? null : [c, pal[k]]);
      }
    }
    return { w, h, cells };
  };
  const I = E.makeIcon;
  const PAL = { y: '#ffd23f', o: '#e8a23a', d: '#8a5a1a', r: '#ff4a50', R: '#a02028', w: '#f0f2f8', g: '#9aa3b8', G: '#5c6378', b: '#5fc8ff', B: '#2a6fa8', l: '#6fe07a', L: '#2f8a3a', f: '#ff8a2a', F: '#ffd060', m: '#7a5232', M: '#4a3220', s: '#c8ccd6', k: '#2a2a32', c: '#d63a2c', C: '#8a1e18' };

  // tipos: consumivel | arma | luz | chave | material | arremesso | armadura (slot: cabeca, corpo, pes)
  E.DEFAULT_ITEMS = {
    moeda: { name: 'Moeda', glyph: 'o', color: [1, 0.82, 0.3], type: 'material', stack: 999, desc: 'Brilha no escuro. Os mercadores das ruínas ainda a aceitam.',
      icon: I([' .--. ', '( ** )', ' `--` '], [' yyyy ', 'yoyyoy', ' dddd '], PAL) },
    pocao: { name: 'Poção de vida', glyph: '♥', color: [1, 0.3, 0.35], type: 'consumivel', stack: 9, effect: { heal: 3 }, fx: 'cura', desc: 'Recupera 3 de vida.',
      icon: I(['  []  ', '  ||  ', ' /  \\ ', '|♥♥♥♥|', ' \\__/ '], ['  mm  ', '  gg  ', ' gggg ', 'grrrrg', ' gggg '], PAL) },
    elixir: { name: 'Elixir veloz', glyph: '♦', color: [0.4, 0.9, 1], type: 'consumivel', stack: 5, effect: { status: 'velocidade', time: 10 }, fx: 'magia', desc: 'Corre 60% mais rápido por 10 s.',
      icon: I(['  ()  ', '  ||  ', ' /~~\\ ', '|♦~~♦|', ' \\__/ '], ['  mm  ', '  gg  ', ' gbbg ', 'gbBBbg', ' gggg '], PAL) },
    regen: { name: 'Erva curativa', glyph: '♣', color: [0.4, 1, 0.5], type: 'consumivel', stack: 9, effect: { status: 'regeneracao', time: 8 }, fx: 'cura', desc: 'Regenera vida aos poucos.',
      icon: I([' \\|/  ', '-♣♣♣- ', ' /|\\  ', '  |   '], [' lLl  ', 'lllll ', ' LlL  ', '  L   '], PAL) },
    espada: { name: 'Espada curta', glyph: '/', color: [0.85, 0.9, 1], type: 'arma', stack: 1, weapon: { damage: 1, range: 1, color: [0.75, 0.9, 1] }, desc: 'Confiável.',
      icon: I(['     /', '    / ', '   /  ', ' \\/   ', ' /\\   '], ['     w', '    s ', '   s  ', ' yy   ', ' m    '], PAL) },
    espada_fogo: { name: 'Espada de fogo', glyph: '/', color: [1, 0.5, 0.15], type: 'arma', stack: 1, weapon: { damage: 2, range: 1.25, color: [1, 0.55, 0.2], status: 'queimando', fx: 'fogo', light: [1, 0.5, 0.2] }, desc: 'Incendeia os inimigos.',
      icon: I(['   *^/', "  ' / ", '   /* ', ' \\/   ', ' /\\   '], ['   fFf', '  f f ', '   ff ', ' yy   ', ' m    '], PAL) },
    lanterna: { name: 'Lanterna', glyph: '☼', color: [1, 0.8, 0.4], type: 'luz', stack: 1, light: { c: [1, 0.78, 0.45], r: 46, i: 1.1 }, desc: 'Ilumina cavernas quando equipada.',
      icon: I(['  __  ', ' [==] ', ' |☼☼| ', ' |☼☼| ', ' [==] '], ['  gg  ', ' gggg ', ' gFFg ', ' gffg ', ' gggg '], PAL) },
    chave: { name: 'Chave antiga', glyph: '‖', color: [0.95, 0.8, 0.4], type: 'chave', stack: 9, desc: 'Abre portas trancadas.',
      icon: I([' ()   ', ' ||   ', ' |=   ', ' |=   '], [' yy   ', ' oo   ', ' oy   ', ' oy   '], PAL) },
    bomba: { name: 'Bomba', glyph: '●', color: [0.5, 0.5, 0.55], type: 'arremesso', stack: 9, throw: { damage: 4, radius: 12, fx: 'explosao' }, desc: 'Arremesse com Q. Abre caminho na terra.',
      icon: I(['    *,', '   /  ', ' .--. ', '(    )', ' `--` '], ['    Ff', '   m  ', ' GGGG ', 'GkkkkG', ' GGGG '], PAL) },
    elmo_ferro: { name: 'Elmo de ferro', glyph: '∩', color: [0.75, 0.78, 0.85], type: 'armadura', slot: 'cabeca', stack: 1, defense: 1, look: { helmet: 'ferro' }, desc: 'Elmo com penacho vermelho. +1 defesa.',
      icon: I(['  ,c, ', ' /==\\ ', '|-==-|', '|_||_|'], ['  cCc ', ' ssss ', 'sGssGs', 'ssggss'], PAL) },
    peitoral_ferro: { name: 'Peitoral de ferro', glyph: 'Ш', color: [0.7, 0.72, 0.8], type: 'armadura', slot: 'corpo', stack: 1, defense: 2, look: { chest: 'ferro' }, desc: 'Placas sobre a capa. +2 defesa.',
      icon: I(['/\\__/\\', '|=||=|', '|=||=|', ' \\__/ '], ['ssggss', 'sGssGs', 'sGssGs', ' ssss '], PAL) },
    capa_rubra: { name: 'Capa rubra', glyph: 'Λ', color: [0.85, 0.22, 0.2], type: 'armadura', slot: 'corpo', stack: 1, defense: 1, look: { cloak: 'rubra' }, desc: 'Tecida pelos guardiões das ruínas. +1 defesa.',
      icon: I(['  /\\  ', ' /  \\ ', '/ || \\', '\\_/\\_/'], ['  cc  ', ' cCCc ', 'cCyyCc', 'cCCCCc'], PAL) },
    botas_couro: { name: 'Botas de couro', glyph: 'ʟ', color: [0.55, 0.38, 0.22], type: 'armadura', slot: 'pes', stack: 1, defense: 0, speed: 1.08, look: { boots: 'couro' }, desc: 'Leves. Corre 8% mais rápido.',
      icon: I([' || ||', ' || ||', '_|L_|L'], [' mm mm', ' mm mm', 'MMMMMM'], PAL) },
  };

  // ---------- variedade extra ----------
  Object.assign(PAL, { p: '#b46cff', P: '#5a2a8a', i: '#a8e8ff', I: '#4aa8d8', n: '#e8e0c8', e: '#7be05a', h: '#c8603a', H: '#7a3018', q: '#d8a85a', Y: '#fff0a0', v: '#3fae5a' });
  Object.assign(E.DEFAULT_ITEMS, {
    // armas
    machado: { name: 'Machado de lenhador', glyph: 'P', color: [0.8, 0.82, 0.88], type: 'arma', stack: 1, price: 40, weapon: { damage: 2, range: 0.95, speed: 0.85, knock: 1.8, shape: 'machado', color: [0.85, 0.85, 0.9] }, desc: 'Golpes pesados que empurram longe.',
      icon: I(['  ,-. ', ' /|  )', "  |-' ", '  |   ', '  |   '], ['  ss  ', ' sm s ', '  mss ', '  m   ', '  M   '], PAL) },
    lanca: { name: 'Lança', glyph: '/', color: [0.85, 0.8, 0.7], type: 'arma', stack: 1, price: 35, weapon: { damage: 1, range: 1.65, speed: 1.05, shape: 'lanca', color: [0.9, 0.9, 0.8] }, desc: 'Alcance longo. Mantém os inimigos à distância.',
      icon: I(['     ^', '    / ', '   /  ', '  /   ', ' /    '], ['     w', '    m ', '   m  ', '  m   ', ' M    '], PAL) },
    adaga_veneno: { name: 'Adaga venenosa', glyph: '-', color: [0.45, 1, 0.4], type: 'arma', stack: 1, price: 55, weapon: { damage: 1, range: 0.75, speed: 1.6, status: 'veneno', shape: 'adaga', color: [0.5, 1, 0.45] }, desc: 'Muito rápida. Envenena a cada corte.',
      icon: I(['    ,/', '   // ', ' \\//  ', " /\\   ", "'     "], ['    ls', '   ss ', ' yy   ', ' m    ', 'l     '], PAL) },
    martelo_guerra: { name: 'Martelo de guerra', glyph: 'T', color: [0.6, 0.62, 0.7], type: 'arma', stack: 1, price: 90, weapon: { damage: 3, range: 1, speed: 0.65, knock: 2.4, shake: 5, shape: 'martelo', color: [0.75, 0.78, 0.85] }, desc: 'Lento e devastador. A terra treme.',
      icon: I(['[####]', '[####]', '  ||  ', '  ||  ', '  ##  '], ['gGGGGg', 'gGGGGg', '  mm  ', '  mm  ', '  MM  '], PAL) },
    espada_gelo: { name: 'Espada de gelo', glyph: '/', color: [0.55, 0.85, 1], type: 'arma', stack: 1, price: 110, weapon: { damage: 2, range: 1.2, status: 'lento', fx: 'magia', light: [0.4, 0.8, 1], color: [0.6, 0.9, 1] }, desc: 'Congela: inimigos atingidos ficam lentos.',
      icon: I(['   * /', '    / ', ' * /  ', ' \\/   ', ' /\\   '], ['   i w', '    i ', ' i I  ', ' II   ', ' m    '], PAL) },
    espada_cavaleiro: { name: 'Espada do cavaleiro', glyph: '/', color: [0.9, 0.9, 1], type: 'arma', stack: 1, price: 80, weapon: { damage: 2, range: 1.15, speed: 1, color: [0.85, 0.88, 1] }, desc: 'Lâmina larga e equilibrada.',
      icon: I(['     /', '    / ', '   /  ', ' -#-  ', ' /    '], ['     w', '    s ', '   s  ', ' yyy  ', ' m    '], PAL) },
    cajado_arcano: { name: 'Cajado arcano', glyph: '!', color: [0.75, 0.5, 1], type: 'arma', stack: 1, price: 140, weapon: { damage: 1, range: 0.8, shape: 'cajado', color: [0.75, 0.5, 1], light: [0.6, 0.4, 1], projectile: { speed: 55, damage: 2, glyph: '●', color: [0.8, 0.55, 1], light: 12, homing: 0.5 } }, desc: 'Cada golpe lança um orbe mágico que persegue o alvo.',
      icon: I([' (o)  ', '  |   ', '  |   ', '  |   ', '  |   '], [' pPp  ', '  m   ', '  m   ', '  m   ', '  M   '], PAL) },
    arco_curto: { name: 'Arco curto', glyph: ')', color: [0.75, 0.55, 0.3], type: 'arma', stack: 1, price: 70, weapon: { damage: 0, range: 0.5, ranged: true, speed: 1.1, shape: 'arco', color: [0.9, 0.85, 0.7], projectile: { speed: 75, damage: 2, glyph: '>', color: [0.95, 0.9, 0.75], arc: true } }, desc: 'Atira flechas na direção do mouse.',
      icon: I([' \\    ', ' |`.  ', ' |--> ', " |.'  ", ' /    '], [' m    ', ' mw   ', ' mssw ', ' mw   ', ' m    '], PAL) },
    // armaduras
    capuz_sombrio: { name: 'Capuz sombrio', glyph: 'A', color: [0.55, 0.35, 0.8], type: 'armadura', slot: 'cabeca', stack: 1, price: 45, defense: 1, look: { hood: 'sombra' }, desc: 'Tecido encantado. +1 defesa.',
      icon: I(['  /\\  ', ' /  \\ ', '|(..)|', ' \\  / '], ['  PP  ', ' PPPP ', 'PPkkPP', ' PPPP '], PAL) },
    elmo_ouro: { name: 'Elmo de ouro', glyph: '∩', color: [1, 0.82, 0.3], type: 'armadura', slot: 'cabeca', stack: 1, price: 160, defense: 2, look: { helmet: 'ouro' }, desc: 'Brilha como o sol. +2 defesa.',
      icon: I(['  ,c, ', ' /==\\ ', '|-==-|', '|_||_|'], ['  cCc ', ' yyyy ', 'yoyyoy', 'yyooyy'], PAL) },
    peitoral_ouro: { name: 'Peitoral de ouro', glyph: 'Ш', color: [1, 0.8, 0.3], type: 'armadura', slot: 'corpo', stack: 1, price: 220, defense: 3, look: { chest: 'ouro' }, desc: 'Digno de um rei. +3 defesa.',
      icon: I(['/\\__/\\', '|=||=|', '|=||=|', ' \\__/ '], ['yyooyy', 'yoyyoy', 'yoyyoy', ' yyyy '], PAL) },
    capa_gelida: { name: 'Capa gélida', glyph: 'Λ', color: [0.55, 0.8, 1], type: 'armadura', slot: 'corpo', stack: 1, price: 95, defense: 1, look: { cloak: 'gelo' }, immune: ['lento'], desc: '+1 defesa. Imune a lentidão.',
      icon: I(['  /\\  ', ' /  \\ ', '/ ** \\', '\\_/\\_/'], ['  ii  ', ' iIIi ', 'iIwwIi', 'iIIIIi'], PAL) },
    capa_floresta: { name: 'Capa da floresta', glyph: 'Λ', color: [0.35, 0.75, 0.35], type: 'armadura', slot: 'corpo', stack: 1, price: 60, defense: 1, speed: 1.05, look: { cloak: 'verde' }, desc: '+1 defesa e passos mais leves.',
      icon: I(['  /\\  ', ' /  \\ ', '/ ♣  \\', '\\_/\\_/'], ['  ll  ', ' lLLl ', 'lLvLLl', 'lLLLLl'], PAL) },
    capa_sombria: { name: 'Capa sombria', glyph: 'Λ', color: [0.5, 0.3, 0.7], type: 'armadura', slot: 'corpo', stack: 1, price: 130, defense: 2, look: { cloak: 'sombra' }, desc: 'Feita de essência espectral. +2 defesa.',
      icon: I(['  /\\  ', ' /  \\ ', '/ ·· \\', '\\_/\\_/'], ['  PP  ', ' PppP ', 'PpwwpP', 'PPPPPP'], PAL) },
    botas_aladas: { name: 'Botas aladas', glyph: 'ʟ', color: [0.9, 0.95, 1], type: 'armadura', slot: 'pes', stack: 1, price: 180, speed: 1.12, jumps: 1, look: { boots: 'couro' }, desc: '+1 pulo no ar e 12% mais rápido.',
      icon: I(['>| |< ', ' | |  ', '_|_|_ '], ['wm mw ', ' m m  ', 'MMMMM '], PAL) },
    botas_ferro: { name: 'Botas de ferro', glyph: 'ʟ', color: [0.7, 0.72, 0.8], type: 'armadura', slot: 'pes', stack: 1, price: 70, defense: 1, speed: 0.96, look: {}, desc: '+1 defesa, um pouco mais pesadas.',
      icon: I([' || ||', ' || ||', '_|L_|L'], [' ss ss', ' ss ss', 'GGGGGG'], PAL) },
    // consumíveis
    pocao_grande: { name: 'Poção grande', glyph: '♥', color: [1, 0.25, 0.3], type: 'consumivel', stack: 5, price: 45, effect: { heal: 6 }, fx: 'cura', desc: 'Recupera 6 de vida.',
      icon: I(['  []  ', ' /  \\ ', '|♥♥♥♥|', '|♥♥♥♥|', ' \\__/ '], ['  mm  ', ' gggg ', 'grrrrg', 'gRRRRg', ' gggg '], PAL) },
    pao: { name: 'Pão', glyph: 'o', color: [0.85, 0.65, 0.35], type: 'consumivel', stack: 20, price: 4, effect: { heal: 1 }, desc: 'Simples e honesto. +1 vida.',
      icon: I([' .--. ', '(::::)', " `--' "], [' qqqq ', 'qooooq', ' dddd '], PAL) },
    maca: { name: 'Maçã', glyph: '♥', color: [0.9, 0.2, 0.2], type: 'consumivel', stack: 20, price: 3, effect: { heal: 1, status: 'regeneracao', time: 3 }, desc: 'Crocante. +1 vida e um pouco de regeneração.',
      icon: I(['  ,   ', ' (♥)  ', '  `   '], ['  L   ', ' rRr  ', '  R   '], PAL) },
    carne_assada: { name: 'Carne assada', glyph: '%', color: [0.8, 0.4, 0.2], type: 'consumivel', stack: 10, price: 12, effect: { heal: 3 }, desc: 'Quentinha. +3 vida.',
      icon: I(['  __  ', ' (##)=', '  ``  '], ['  hh  ', ' hHHhn', '  HH  '], PAL) },
    antidoto: { name: 'Antídoto', glyph: '+', color: [0.5, 1, 0.6], type: 'consumivel', stack: 9, price: 15, effect: { cure: true }, fx: 'cura', desc: 'Remove veneno, fogo e lentidão.',
      icon: I(['  []  ', ' /  \\ ', '| ++ |', ' \\__/ '], ['  mm  ', ' gggg ', 'gelleg', ' gggg '], PAL) },
    pocao_escudo: { name: 'Poção de escudo', glyph: '◆', color: [0.6, 0.8, 1], type: 'consumivel', stack: 5, price: 60, effect: { status: 'escudo', time: 6 }, fx: 'magia', desc: 'Invulnerável por 6 segundos.',
      icon: I(['  []  ', ' /  \\ ', '| ◆◆ |', ' \\__/ '], ['  mm  ', ' gggg ', 'gbyybg', ' gggg '], PAL) },
    cogumelo_brilho: { name: 'Cogumelo brilhante', glyph: '♠', color: [0.45, 0.95, 0.85], type: 'consumivel', stack: 10, price: 10, effect: { status: 'brilho', time: 30 }, fx: 'magia', desc: 'Você brilha no escuro por 30 s.',
      icon: I([' .--. ', '(o..o)', '  ||  '], [' bbbb ', 'bwbbwb', '  nn  '], PAL) },
    // arremesso e luz
    faca_arremesso: { name: 'Faca de arremesso', glyph: '-', color: [0.85, 0.88, 0.95], type: 'arremesso', stack: 20, price: 3, throw: { knife: true, damage: 2 }, desc: 'Q arremessa em linha reta.',
      icon: I(['      ', '==--->', '      '], ['      ', 'mmssww', '      '], PAL) },
    bomba_gelo: { name: 'Bomba de gelo', glyph: '●', color: [0.55, 0.85, 1], type: 'arremesso', stack: 9, price: 25, throw: { damage: 2, radius: 14, fx: 'magia', status: 'lento', dig: false }, desc: 'Explode e deixa todos lentos.',
      icon: I(['    *,', '   /  ', ' .--. ', '( ** )', " `--' "], ['    ii', '   m  ', ' IIII ', 'IiwwiI', ' IIII '], PAL) },
    tocha_mao: { name: 'Tocha de mão', glyph: '^', color: [1, 0.6, 0.2], type: 'luz', stack: 1, price: 8, light: { c: [1, 0.6, 0.25], r: 34, i: 1.2 }, desc: 'Luz quente e tremulante.',
      icon: I(['  ^   ', ' (*)  ', '  |   ', '  |   '], ['  F   ', ' fFf  ', '  m   ', '  M   '], PAL) },
    cristal_luz: { name: 'Cristal de luz', glyph: '◆', color: [0.45, 0.9, 1], type: 'luz', stack: 1, price: 90, light: { c: [0.45, 0.9, 1], r: 56, i: 1.15 }, desc: 'Luz fria e forte. Ideal para cavernas.',
      icon: I([' * /\\ ', '  /◆◆\\', '  \\◆◆/', '   \\/ '], [' i bb ', '  bIIb', '  bIIb', '   bb '], PAL) },
    // materiais (vendáveis)
    gema_rubi: { name: 'Rubi', glyph: '◆', color: [1, 0.25, 0.3], type: 'material', stack: 99, price: 50, desc: 'Gema rara. Vale muito no mercador.',
      icon: I(['  __  ', ' /◆◆\\ ', ' \\◆◆/ ', '  \\/  '], ['  rr  ', ' rRRr ', ' rRRr ', '  rr  '], PAL) },
    gema_safira: { name: 'Safira', glyph: '◆', color: [0.3, 0.55, 1], type: 'material', stack: 99, price: 50, desc: 'Gema azul do fundo do mar.',
      icon: I(['  __  ', ' /◆◆\\ ', ' \\◆◆/ ', '  \\/  '], ['  bb  ', ' bBBb ', ' bBBb ', '  bb  '], { b: '#6fa8ff', B: '#2a5ad8' }) },
    osso: { name: 'Osso', glyph: '=', color: [0.9, 0.88, 0.8], type: 'material', stack: 99, price: 2, desc: 'Resto de esqueleto.',
      icon: I(['      ', 'o====o', '      '], ['      ', 'nnnnnn', '      '], PAL) },
    presa_aranha: { name: 'Presa de aranha', glyph: 'v', color: [0.85, 0.8, 0.7], type: 'material', stack: 99, price: 3, desc: 'Ainda pinga veneno.',
      icon: I([' \\  / ', '  \\/  ', '   ,  '], [' nn nn', '  nn  ', '   l  '], PAL) },
    gosma: { name: 'Gosma', glyph: 'o', color: [0.45, 0.95, 0.4], type: 'material', stack: 99, price: 1, desc: 'Grudenta.',
      icon: I([' .~~. ', '(oooo)', " `~~' "], [' eeee ', 'eLLLLe', ' eeee '], PAL) },
    ferrao: { name: 'Ferrão', glyph: 'J', color: [0.9, 0.7, 0.35], type: 'material', stack: 99, price: 4, desc: 'Ferrão de escorpião.',
      icon: I(['   _  ', '  ( > ', ' _/   '], ['   o  ', '  oyl ', ' oo   '], PAL) },
    lingote_ferro: { name: 'Lingote de ferro', glyph: '▬', color: [0.7, 0.72, 0.8], type: 'material', stack: 99, price: 12, desc: 'Metal das armaduras dos cavaleiros.',
      icon: I(['  ____', ' /___/', '|____|'], ['  ssss', ' sgggs', 'GGGGGG'], PAL) },
    essencia: { name: 'Essência espectral', glyph: '*', color: [0.75, 0.5, 1], type: 'material', stack: 99, price: 20, desc: 'Brilho de um espírito derrotado.',
      icon: I([' · *  ', '* ◆ ·', ' ·  * '], [' p p  ', 'p P p', ' p  p '], PAL) },
  });
  Object.assign(E.DEFAULT_ITEMS, {
    peixe_assado: { name: 'Peixe assado', glyph: '%', color: [0.85, 0.55, 0.35], type: 'consumivel', stack: 10, price: 6, effect: { heal: 2 }, desc: 'Fresquinho do porto. +2 vida.',
      icon: I(['  ,_  ', '><(o)>', "  `'  "], ['  hh  ', 'hhHwHh', '  hh  '], PAL) },
    coracao_vital: { name: 'Coração vital', glyph: '♥', color: [1, 0.25, 0.35], type: 'consumivel', stack: 9, price: 200, effect: { maxHp: 1 }, fx: 'cura', desc: 'Cai dos chefes. +1 coração de vida máxima, para sempre.',
      icon: I([' _  _ ', '( \\/ )', ' \\  / ', '  \\/  '], [' r  r ', 'rRrrRr', ' rRRr ', '  rr  '], PAL) },
    lamina_aracnidea: { name: 'Lâmina aracnídea', glyph: '-', color: [0.75, 0.45, 1], type: 'arma', stack: 1, price: 320, weapon: { damage: 3, range: 0.85, speed: 1.5, status: 'veneno', shape: 'adaga', color: [0.75, 0.45, 1], light: [0.55, 0.25, 0.85] }, desc: 'Presa da Rainha Aranha. Rapidíssima e venenosa.',
      icon: I(['    ,/', '   // ', ' \\//  ', ' /\\   ', "'     "], ['    pP', '   pp ', ' kk   ', ' P    ', 'l     '], PAL) },
    coroa_rei: { name: 'Coroa do Rei Esqueleto', glyph: '∩', color: [1, 0.85, 0.3], type: 'armadura', slot: 'cabeca', stack: 1, price: 420, defense: 3, immune: ['veneno'], look: { helmet: 'ouro' }, desc: '+3 defesa e imune a veneno.',
      icon: I([' ^ ^ ^', '|◆|◆||', '|____|'], [' y y y', 'yryryy', 'yyyyyy'], PAL) },
    martelo_glacial: { name: 'Martelo glacial', glyph: 'T', color: [0.6, 0.9, 1], type: 'arma', stack: 1, price: 460, weapon: { damage: 5, range: 1.05, speed: 0.7, knock: 2.6, shake: 6, status: 'lento', fx: 'magia', shape: 'martelo', color: [0.6, 0.9, 1], light: [0.4, 0.8, 1] }, desc: 'Arrancado do Golem de Gelo. Congela e esmaga.',
      icon: I(['[*##*]', '[####]', '  ||  ', '  ||  ', '  ##  '], ['IiIIiI', 'IIIIII', '  mm  ', '  mm  ', '  MM  '], PAL) },
    geleia_real: { name: 'Geleia real', glyph: 'o', color: [1, 0.85, 0.3], type: 'consumivel', stack: 5, price: 80, effect: { heal: 99, status: 'regeneracao', time: 20 }, fx: 'cura', desc: 'Do Slime Rei. Cura tudo e regenera por 20 s.',
      icon: I([' .~~. ', '(◆oo◆)', " `~~' "], [' yyyy ', 'yoFFoy', ' oooo '], PAL) },
  });
  for (const [id, pr] of Object.entries({ moeda: 1, pocao: 15, elixir: 30, regen: 12, espada: 20, espada_fogo: 150, lanterna: 50, chave: 25, bomba: 20, elmo_ferro: 60, peitoral_ferro: 90, capa_rubra: 70, botas_couro: 40 })) E.DEFAULT_ITEMS[id].price = pr;

  E.STATUS = {
    queimando: { dps: 1, tick: 0.6, fx: 'fogo', color: [1, 0.5, 0.2] },
    veneno: { dps: 1, tick: 1, color: [0.5, 1, 0.3] },
    velocidade: { speed: 1.6, color: [0.4, 0.9, 1] },
    regeneracao: { hps: 1, tick: 1.2, color: [0.4, 1, 0.5] },
    brilho: { light: { c: [1, 0.9, 0.6], r: 30, i: 0.9 } },
    escudo: { shield: true, color: [0.6, 0.8, 1] },
    lento: { speed: 0.5, color: [0.5, 0.5, 0.9] },
  };

  // ---------- status em qualquer ator (jogador ou entidade) ----------
  E.Status = {
    add(actor, name, time) {
      if (actor === E.Game?.player && E.Game.inv?.immune(name)) return;
      actor.status ||= {};
      actor.status[name] = Math.max(actor.status[name] || 0, time);
    },
    update(actor, dt, hurt, heal) {
      if (!actor.status) return;
      actor.statusTick ||= {};
      for (const [k, t] of Object.entries(actor.status)) {
        const S = E.STATUS[k];
        actor.status[k] = t - dt;
        if (actor.status[k] <= 0) {
          delete actor.status[k];
          continue;
        }
        if (!S) continue;
        actor.statusTick[k] = (actor.statusTick[k] || 0) + dt;
        if (S.tick && actor.statusTick[k] >= S.tick) {
          actor.statusTick[k] = 0;
          if (S.dps) hurt(S.dps);
          if (S.hps) heal(S.hps);
        }
        if (S.fx && Math.random() < dt * 8) E.FX.spawn(S.fx, actor.x, actor.y - actor.h * 0.5);
      }
    },
    speed(actor) {
      let k = 1;
      for (const s in actor.status || {}) if (E.STATUS[s]?.speed) k *= E.STATUS[s].speed;
      return k;
    },
    has(actor, name) {
      return !!(actor.status && actor.status[name] > 0);
    },
  };

  // ---------- inventário ----------
  E.Inventory = class {
    constructor(size = 20) {
      this.slots = Array(size).fill(null);
      this.weapon = 'espada';
      this.light = null;
      this.gear = { cabeca: null, corpo: null, pes: null };
      this.hot = 0;
      this.upg = {}; // nível de melhoria do ferreiro por item
      this.bonusHp = 0; // corações extras (coração vital)
    }
    // visual combinado das armaduras equipadas (lido pelo desenho do herói)
    look() {
      const L = {};
      for (const id of Object.values(this.gear || {})) if (id && this.def(id)?.look) Object.assign(L, this.def(id).look);
      return L;
    }
    defense() {
      return Object.values(this.gear || {}).reduce((s, id) => s + ((id && this.def(id)?.defense) || 0) + ((id && this.upg && this.upg[id]) || 0), 0);
    }
    level(id) {
      return (id && this.upg && this.upg[id]) || 0;
    }
    label(id) {
      const d = this.def(id);
      return d ? d.name + (this.level(id) ? ' +' + this.level(id) : '') : '—';
    }
    speedMul() {
      return Object.values(this.gear || {}).reduce((s, id) => s * ((id && this.def(id)?.speed) || 1), 1);
    }
    // pulos extras no ar e imunidades vindos das armaduras
    jumps() {
      return Object.values(this.gear || {}).reduce((s, id) => s + ((id && this.def(id)?.jumps) || 0), 0);
    }
    immune(name) {
      return Object.values(this.gear || {}).some((id) => id && (this.def(id)?.immune || []).includes(name));
    }
    unequip(slot) {
      const id = this.gear[slot];
      if (!id) return false;
      if (!this.add(id, 1)) return false;
      this.gear[slot] = null;
      return true;
    }
    def(id) {
      return E.Project.items[id];
    }
    count(id) {
      return this.slots.reduce((s, x) => s + (x && x.id === id ? x.qty : 0), 0) + (this.weapon === id ? 1 : 0) + Object.values(this.gear || {}).filter((g) => g === id).length;
    }
    add(id, qty = 1) {
      const d = this.def(id);
      if (!d) return false;
      for (const s of this.slots)
        if (s && s.id === id && s.qty < (d.stack || 1)) {
          const k = Math.min(qty, d.stack - s.qty);
          s.qty += k;
          qty -= k;
          if (!qty) return true;
        }
      while (qty > 0) {
        const i = this.slots.indexOf(null);
        if (i < 0) return false;
        const k = Math.min(qty, d.stack || 1);
        this.slots[i] = { id, qty: k };
        qty -= k;
      }
      return true;
    }
    take(id, qty = 1) {
      if (this.count(id) < qty) return false;
      for (let i = this.slots.length - 1; i >= 0 && qty > 0; i--) {
        const s = this.slots[i];
        if (!s || s.id !== id) continue;
        const k = Math.min(qty, s.qty);
        s.qty -= k;
        qty -= k;
        if (!s.qty) this.slots[i] = null;
      }
      return true;
    }
    // usa o item do espaço i; retorna true se algo aconteceu
    use(i, api) {
      const s = this.slots[i];
      if (!s) return false;
      const d = this.def(s.id);
      if (!d) return false;
      const p = E.Game.player;
      if (d.script) {
        const fn = E.Script.compileFn(d.script, 'onUse', 'item ' + s.id);
        if (fn) {
          const r = E.Script.safe(() => fn(api, d), 'item ' + s.id);
          if (r === false) return false;
        }
      }
      if (d.type === 'consumivel') {
        if (d.effect?.heal) p.hp = Math.min(p.maxHp, p.hp + d.effect.heal);
        if (d.effect?.status) E.Status.add(p, d.effect.status, d.effect.time || 5);
        if (d.effect?.maxHp) {
          this.bonusHp = (this.bonusHp || 0) + d.effect.maxHp;
          p.maxHp += d.effect.maxHp;
          p.hp = p.maxHp;
        }
        if (d.effect?.cure) for (const k of ['veneno', 'queimando', 'lento']) if (p.status) delete p.status[k];
        if (d.fx) E.FX.spawn(d.fx, p.x, p.y - p.h / 2);
        this.take(s.id, 1);
        E.toast('Usou ' + d.name);
        return true;
      }
      if (d.type === 'arma') {
        const old = this.weapon;
        this.slots[i] = old ? { id: old, qty: 1 } : null;
        this.weapon = s.id;
        E.toast('Equipou ' + d.name);
        return true;
      }
      if (d.type === 'armadura') {
        const slot = d.slot || 'corpo';
        this.gear ||= {};
        const old = this.gear[slot];
        this.slots[i] = old ? { id: old, qty: 1 } : null;
        this.gear[slot] = s.id;
        E.Audio.play('equipar');
        E.FX.spawn('faisca', p.x, p.y - p.h * 0.6);
        E.toast('Equipou ' + d.name);
        return true;
      }
      if (d.type === 'luz') {
        this.light = this.light === s.id ? null : s.id;
        E.toast(this.light ? d.name + ': acesa' : d.name + ': guardada');
        return true;
      }
      if (d.type === 'arremesso') {
        E.Game.throwItem(s.id);
        this.take(s.id, 1);
        return true;
      }
      return false;
    }
    weaponDef() {
      const base = (this.weapon && this.def(this.weapon)?.weapon) || { damage: 1, range: 1, color: [0.75, 0.9, 1] };
      const lv = this.level(this.weapon);
      if (!lv) return base;
      const o = Object.assign({}, base, { damage: (base.damage || 0) + (base.ranged ? 0 : lv) });
      if (base.projectile) o.projectile = Object.assign({}, base.projectile, { damage: (base.projectile.damage || 1) + lv });
      return o;
    }
  };
})();

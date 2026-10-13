'use strict';
// Materiais: cada célula do mundo é um material; o shader escolhe o glifo a partir dele.
// modos: 0 = rampa por luminância iluminada, 1 = textura aleatória estável, 2 = lâmina (balança),
//        3 = líquido animado, 4 = tinta (sprites: rampa pela luminância da própria cor),
//        5 = alvenaria (tijolos com juntas desencontradas), 6 = tábuas, 7 = camadas sedimentares
// `top`: glifo usado quando a célula está exposta por cima (borda superior do terreno)
(function () {
  const E = (window.ENG = window.ENG || {});

  E.ATLAS_CHARS =
    " .,:;'`\"^~-_=+*!|/\\()[]{}<>?#%&@$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz≈·•°◆◇░▒▓█▀▄■□▲▼◄►♦♣♠♥☼‖∩ШΛʟ≡●▬";
  E.glyphIndex = (c) => {
    const i = [...E.ATLAS_CHARS].indexOf(c);
    return i < 0 ? 0 : i;
  };

  const M = (id, key, name, color, glyphs, mode, opts = {}) => ({
    id, key, name, color, glyphs, mode,
    vary: opts.vary ?? 0.25,
    top: opts.top || null,
    hidden: !!opts.hidden,
    solid: !!opts.solid,
    emissive: opts.emissive || 0,
    liquid: !!opts.liquid,
  });

  E.MATERIALS = [
    M(1, 'GRASS', 'Grama', [0.38, 0.78, 0.3], "\\|/,'`\"", 2, { vary: 0.45 }),
    M(2, 'DIRT', 'Terra', [0.45, 0.29, 0.16], ':;%&#8', 7, { solid: true, vary: 0.3, top: '~' }),
    M(3, 'STONE', 'Pedra', [0.56, 0.58, 0.66], '0QO@8o', 1, { solid: true, vary: 0.25, top: '^' }),
    M(4, 'MOSS', 'Pedra musgo', [0.36, 0.52, 0.34], '0Q@%&o', 1, { solid: true, vary: 0.35, top: '"' }),
    M(5, 'BRICK', 'Tijolo', [0.62, 0.42, 0.34], '#8%', 5, { solid: true, vary: 0.12, top: '=' }),
    M(6, 'WOOD', 'Madeira', [0.62, 0.41, 0.22], '=-', 6, { solid: true, vary: 0.12, top: '=' }),
    M(7, 'BARK', 'Tronco', [0.36, 0.25, 0.16], '|][!l', 1, { vary: 0.25 }),
    M(8, 'LEAVES', 'Folhas', [0.2, 0.47, 0.24], '%&@*#8', 1, { vary: 0.45, top: '^' }),
    M(9, 'WATER', 'Água', [0.22, 0.42, 0.72], '~≈-=~', 3, { liquid: true, vary: 0.15 }),
    M(10, 'LAVA', 'Lava', [1.0, 0.42, 0.1], '~^≈*', 3, { emissive: 1, liquid: true, vary: 0.25 }),
    M(11, 'CRYSTAL', 'Cristal', [0.4, 0.9, 1.0], '◆*<>^', 1, { emissive: 0.85, solid: true, vary: 0.2 }),
    M(12, 'CLOTH', 'Estandarte', [0.78, 0.2, 0.17], 'Q0g@', 1, { vary: 0.15 }),
    M(13, 'IRON', 'Ferro', [0.52, 0.52, 0.58], '#|=I', 1, { solid: true, vary: 0.1 }),
    M(14, 'GOLD', 'Ouro/lanterna', [0.95, 0.76, 0.3], 'o0Q$', 1, { emissive: 0.35, vary: 0.15 }),
    M(15, 'FLAME', 'Chama', [1.0, 0.66, 0.25], "^*'\"", 3, { emissive: 1, vary: 0.2 }),
    M(16, 'ROCK', 'Parede de rocha', [0.27, 0.28, 0.35], ":.;'%", 1, { vary: 0.3 }),
    M(17, 'BUSH', 'Arbusto', [0.16, 0.38, 0.2], '&%@*', 1, { vary: 0.4 }),
    M(18, 'FLOWER', 'Flores', [0.9, 0.5, 0.75], "*o'.", 1, { vary: 0.5 }),
    M(19, 'VINE', 'Cipó', [0.25, 0.55, 0.3], '|){(', 1, { vary: 0.3 }),
    M(20, 'SAND', 'Areia', [0.86, 0.74, 0.48], '.:,;', 1, { solid: true, vary: 0.18, top: '~' }),
    M(21, 'WEB', 'Teia', [0.8, 0.82, 0.88], "/\\-|+", 1, { vary: 0.1 }),
    M(22, 'ROOF', 'Telhado', [0.48, 0.26, 0.22], '/\\^=', 1, { solid: true, vary: 0.15, top: '^' }),
    M(23, 'MUSHROOM', 'Cogumelo luminoso', [0.45, 0.95, 0.85], '♠♣Ωo', 1, { emissive: 0.75, vary: 0.3 }),
    M(24, 'PLANK', 'Tábuas (parede)', [0.48, 0.32, 0.18], '|‖|I', 1, { vary: 0.15 }),
    M(25, 'SNOW', 'Neve', [0.92, 0.95, 1.0], '*:.,', 1, { solid: true, vary: 0.06, top: '▀' }),
    M(26, 'ICE', 'Gelo', [0.62, 0.86, 1.0], '=-~#', 1, { solid: true, vary: 0.1, emissive: 0.08, top: '-' }),
    M(27, 'SANDSTONE', 'Arenito', [0.8, 0.62, 0.4], '=-:#%', 7, { solid: true, vary: 0.12, top: '=' }),
    M(28, 'CACTUS', 'Cacto', [0.36, 0.68, 0.32], '|+!', 1, { vary: 0.2 }),
    M(29, 'PINE', 'Pinheiro', [0.14, 0.36, 0.25], '^A*', 1, { vary: 0.3 }),
    M(30, 'CORAL', 'Coral', [1.0, 0.45, 0.55], '*Yy', 1, { vary: 0.4, emissive: 0.15 }),
    M(31, 'MASONRY', 'Alvenaria', [0.6, 0.62, 0.7], '0Q8O@', 5, { solid: true, vary: 0.14, top: '▄' }),
    M(250, 'INK', 'Tinta (sprite/imagem)', [1, 1, 1], '.-:=+*#%@', 4, { vary: 0, emissive: 0.55 }),
  ];
  E.MAT = {};
  E.MAT_BY_ID = [];
  for (const m of E.MATERIALS) {
    E.MAT[m.key] = m.id;
    E.MAT_BY_ID[m.id] = m;
  }

  // textura 4×256 RGBA8: texels 0..2 = 12 índices de glifo, texel 3 = (qtd, modo, emissivo, flags)
  E.buildMaterialTable = () => {
    const data = new Uint8Array(4 * 256 * 4);
    for (const m of E.MATERIALS) {
      const gl = [...m.glyphs].map(E.glyphIndex);
      for (let s = 0; s < 12; s++) data[(m.id * 4 + (s >> 2)) * 4 + (s & 3)] = gl[s % gl.length];
      data[(m.id * 4 + 2) * 4 + 3] = m.top ? E.glyphIndex(m.top) : 0; // slot 11: glifo de topo
      const o = (m.id * 4 + 3) * 4;
      data[o] = gl.length;
      data[o + 1] = m.mode;
      data[o + 2] = Math.round(m.emissive * 255);
      data[o + 3] = (m.solid ? 1 : 0) | (m.liquid ? 2 : 0);
    }
    return data;
  };

  // hash determinístico por célula (para variação de cor)
  E.hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  E.matColor = (id, x, y) => {
    const m = E.MAT_BY_ID[id];
    if (!m) return [0, 0, 0];
    const k = 1 + (E.hash2(x, y) - 0.5) * 2 * m.vary;
    const k2 = 1 + (E.hash2(x + 913, y - 71) - 0.5) * m.vary;
    return [AFc(m.color[0] * k * 255), AFc(m.color[1] * k2 * 255), AFc(m.color[2] * k * 255)];
  };
  const AFc = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
})();

// tipos de célula para física (camada de colisão)
window.ENG.CT = { NONE: 0, SOLID: 1, ONEWAY: 2, EMPTY: 3, HAZARD: 4, LADDER: 5, WATER: 6 };
window.ENG.CT_INFO = [
  { id: 0, name: 'Automático (pelo material)', color: null },
  { id: 1, name: 'Sólido', color: [255, 80, 80] },
  { id: 2, name: 'Plataforma vazada', color: [255, 200, 60] },
  { id: 3, name: 'Forçar vazio', color: [150, 150, 255] },
  { id: 4, name: 'Perigo (dano)', color: [255, 60, 220] },
  { id: 5, name: 'Escada', color: [90, 255, 140] },
  { id: 6, name: 'Água', color: [60, 160, 255] },
];

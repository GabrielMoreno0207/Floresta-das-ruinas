# Floresta das Ruínas — Engine

Engine dedicada ao jogo **Floresta das Ruínas** e à **Caverna Profunda**. Abra `index.html` (ou `engine/index.html`) no Chrome/Edge. O editor de assets antigo, que não pertence ao jogo, foi guardado em `legado-forge/`.

## ASCII Engine

Abra `engine/index.html` no Chrome/Edge (WebGL2). O projeto se salva sozinho no navegador; use **Editor → Mundo → Salvar projeto** para ter o arquivo `.project.json`.

### Controles
| Tecla | Ação |
|---|---|
| ←→ / A D | andar (aceleração/atrito) |
| Espaço / ↑ / W | pular — segurar = mais alto; coyote time + buffer; **pulo duplo**; **pulo na parede** |
| ↓ | agachar · ↓ + Espaço desce de plataforma vazada · ↑/↓ em escadas = escalar |
| Shift / K | dash (com rastro e invencibilidade curta) |
| Clique esquerdo / J | espada **na direção do mouse** — combo de 3 golpes; golpe para baixo no ar quica no inimigo. Com **arco**: segure para puxar a corda (mostra a trajetória tracejada em ASCII, com um x onde a flecha cai; mais carga = mais força e dano) e solte para atirar |
| E | interagir (portas, baús, NPCs, fogueiras) |
| Q | arremessar bomba · 1–9 e 0 usam a hotbar (10 espaços grandes, com o ícone inteiro) · I inventário (25 espaços) |
| C | **modo criativo**: coloca criaturas, tochas, fogueiras e baús onde clicar (botão direito remove) |
| Esc | pausa / **opções** (volumes, glifo, bloom, tremor, FPS, criativo, tela cheia) |
| F2 | mostrar colisores · Tab editor |

### Editor (Tab)
Abra a engine com dois cliques em **`ASCII Engine.bat`**. Ele liga o servidor local e abre o navegador já no editor. Na aba **Mundo → Gerar build do jogo**, o botão **⚙ Gerar build (.exe)** cria o executável com log ao vivo; depois use **▶ Jogar build** ou **Abrir pasta**. Também dá para abrir só `engine/index.html?editor`, mas sem o botão de build.
- **Pintar** — pincel/retângulo de 24 materiais em 3 camadas, conta-gotas, luzes e **Construir**: cabana com porta, porta de madeira, entrada de caverna, poço de mina, torre de vigia, ponte, escadaria, poço, cerca, árvores, lanternas, estandartes, tochas, teias, ruína, plataforma, escada, cogumelos luminosos, imagem PNG.
- **Colisão** — pinta o tipo de colisão por célula por cima do material: sólido, plataforma vazada, forçar vazio (passagens secretas), perigo, escada, água.
- **Objetos** — coloca criaturas, objetos (porta, baú, NPC, fogueira) e itens; seleciona/arrasta; propriedades JSON e script por instância.
- **Spawners** — arraste uma área; escolha criatura, **intervalo em segundos**, máximo vivo, quantidade inicial e raio de ativação.
- **Gatilhos** — áreas com script `onEnter/onStay/onExit` (mensagem, emboscada, porta para outro mapa, tempestade…).
- **Criaturas** — edita cada prefab: sprite procedural ou **spritesheet PNG** (quadros por animação), tamanho do sprite, **colisor**, vida, dano, velocidade, gravidade, time, brilho, efeito de morte, loot e **script**.
- **Itens** — consumíveis (cura/status), armas (dano, alcance, cor do golpe, status e efeito), luz (lanterna), arremesso (explosão), chave, material, script `onUse`.
- **Mundo** — vários mapas (floresta, caverna ou vazio), mapa inicial, gerar de novo por semente, salvar/abrir projeto, céu/luz/bloom/neblina/chuva/sombras e **todos os parâmetros de movimento do jogador**.
- Ctrl+Z / Ctrl+Y desfazem/refazem; WASD ou botão do meio movem a câmera; roda do mouse = tamanho do pincel.

### Mundo
Mundo único de **9.500×540 células**, estilo Terraria. Da esquerda para a direita: Oceano, Praia, Deserto (com pirâmide), **Floresta das Ruínas** (o mapa original), Floresta Grande (árvores gigantes), Castelo da Floresta, Terras Geladas e Oceano Gelado.

**Transições naturais**: cada fronteira tem largura própria e ondula com a profundidade, então nunca forma uma linha vertical. O relevo mistura as duas formas com curva suave, e os materiais se misturam em manchas orgânicas (ruído suave, sem quadriculado), mais fortes na fronteira e ausentes no interior de cada bioma. Entre deserto e floresta a grama seca e rareia, surgem tufos secos, arbustos resistentes à seca e solo misto de terra e areia, e as árvores vão ficando mais espaçadas (inclusive na borda da Floresta das Ruínas). Na fronteira fria aparecem neve e gelo em manchas, grama gelada, arbustos nevados e árvores mais espaçadas. Castelo e pirâmide ficam sobre platôs com rampas.

**Fundo por bioma**, trocado em transição gradual conforme o herói anda:

| Bioma | Fundo |
|---|---|
| Floresta | pinheiros e montanhas |
| Floresta Grande | troncos gigantes com copas ao longe |
| Castelo | castelo numa colina distante, com janelas acesas à noite |
| Deserto | mesas de topo plano e dunas, céu mais quente |
| Neve | montanhas de pico branco, pinheiros nevados, **aurora boreal** à noite |
| Oceano | horizonte com ondas, ilhas e o reflexo do sol ou da lua |

Cada fundo tem 3 a 4 camadas com névoa atmosférica, e as cristas de montanha são desenhadas pela inclinação. Detalhes por bioma: torres em ruínas, colinas com árvores, troncos gigantes em duas profundidades com raios de sol, castelo com bandeiras tremulando, pirâmides e mesas com estratos, navio no horizonte. Nuvens passam em todos. **M** abre o mapa ASCII.

**Subsolo**: a camada de terra (ou areia, no deserto e na costa) desce fundo e termina numa borda irregular, com bolsões de terra presos na rocha. A rocha tem estratos de cor ondulados e o tom do bioma de cima. As cavernas são temáticas: terra, musgo, raízes e cogumelos sob as florestas (raízes gigantes e cogumelos enormes sob a Floresta Grande), arenito, areia, ossos e cristais âmbar sob o deserto, gelo, neve, pingentes e cristais azuis nas Terras Geladas, areia e corais na costa, e ruínas de alvenaria com correntes sob o castelo. Os túneis são sinuosos, com gargalos, ramificações, fendas e salões de vários bolsões com pilares, poças, lava nos mais fundos e veios de ferro. Cinco **poços de mina com escada** levam aos salões. Longe do céu as cavernas ficam em penumbra, nunca em preto total (ajuste em Editor → Mundo → Luz nas cavernas).

**Vilarejos**: Porto da Areia, Oásis, Vila do Bosque e Vila Gelada. Cada um tem casas, barracas de feira, poço, lanternas, fogueira, aldeões que passeiam e conversam (`props.fala`) e guardas. Os comerciantes variam por vila:
- **pescador**: comida.
- **mercador**: itens gerais.
- **alquimista**: poções.
- **armeiro**: armas, armaduras e lingotes.

**Ferreiros** (Porto, Bosque e Gelada) trabalham numa forja com fogo aceso e melhoram a arma e cada armadura equipada até **+3**. Arma: +1 de dano por nível. Armadura: +1 de defesa por nível. Cada melhoria custa moedas e **lingotes de ferro**. Cada ponto de defesa dá 10% de chance de bloquear um golpe, até 70%.

**Masmorras perdidas**: ficam no subsolo profundo do próprio mundo (1.150×228 cada), e cada uma tem uma planta própria, pensada para o seu chefe:
- **Ninho da Rainha Aranha** (sob a mina da Floresta das Ruínas): câmaras de rocha ligadas por túneis, um abismo vertical com pontes e plataformas de teia, bolsões com ovos e casulos, um poço de lava e um ninho redondo como arena, com teias enormes e casulos pendurados.
- **Cripta do Rei Esqueleto** (deserto): túmulo de três níveis ligados por escadarias, galeria de nichos com ossos, ossuário com sarcófagos, criptas secretas por escadas de mão e a sala do trono como arena (estandartes, braseiros, trono dourado). Rachaduras, areia acumulada e teias mostram o abandono.
- **Covil do Slime Rei** (Floresta Grande): bolhas de musgo ligadas por tubos curtos, com rotas alternativas, chapéus de cogumelo como plataformas, poças de gosma verde, cipós e uma tigela enorme como arena.
- **Salão do Golem de Gelo** (Terras Geladas): rampa de geleira, lago congelado com colunas de gelo, fenda funda com ponte de gelo (o trecho rachado deixa descer ao fundo) e o salão do golem com cachoeira congelada e cristais.

As masmorras se mesclam à rocha do mundo (sem recorte retangular), têm paredes revestidas com materiais do tema e estruturas construídas: escoramento de mina tomado pelas aranhas, criptas desgastadas com desabamentos para cavernas naturais, ruínas de tijolo engolidas pelo fungo e o palácio de gelo com janelas em arco. Cada masmorra tem fogueira na entrada e outra antes da arena, cinco baús e criaturas próprias. Todo o caminho é transitável nos dois sentidos, com degraus baixos, saltos curtos, plataformas vazadas e escadas. A entrada na superfície é uma boca de caverna natural: um paredão de rocha com a abertura em arco, dentes de pedra (ou pingentes) na saliência, cipós, pedregulhos, cascalho, tocha e detalhes do tema (colunas de arenito quebradas com inscrições, gelo e cristais, ou cogumelos gigantes e musgo). De lá, uma descida longa com escada leva à masmorra.

| Masmorra | Entrada | Chefe | Recompensa única |
|---|---|---|---|
| Caverna Profunda | mina da Floresta das Ruínas | Rainha Aranha (salta, cospe teia, chama filhotes) | Lâmina aracnídea |
| Catacumbas | leste da pirâmide | Rei Esqueleto (ossos, salto que treme o chão, invoca guerreiros) | Coroa do Rei |
| Covil Fúngico | Floresta Grande | Slime Rei (pulos com ondas, se divide) | Geleia real |
| Gruta Gelada | Terras Geladas | Golem de Gelo (blocos de gelo, estilhaços, slimes de gelo) | Martelo glacial |

Os chefes ficam mais rápidos e agressivos com metade da vida, mostram uma barra de vida ASCII no topo da tela e soltam um **Coração vital** (+1 de vida máxima para sempre). Depois de derrotados não voltam (`api.vars.chefe_<id>`), e o jogo salva.

**Dia e noite das criaturas**: de dia, ao ar livre, só aparecem **slimes** e os **cavaleiros** que vivem nos **pequenos castelos em ruínas** espalhados pelo mundo. Aranhas, escorpiões, esqueletos, morcegos e espíritos saem à noite ou ficam em lugares fechados (cavernas, castelo).

**Tilesets**: terrenos têm borda superior própria (glifo e brilho de topo) e sombra sob saliências. Construções de pedra usam alvenaria com fiadas e juntas desencontradas, a madeira tem tábuas com emendas e pregos, e terra e arenito mostram camadas sedimentares com pedrinhas.

**Itens e falas**: o item largado no chão mostra o ícone ASCII completo. O inventário tem espaços grandes com o ícone inteiro. As falas dos NPCs aparecem em balões maiores, e passar o mouse sobre uma criatura ou NPC mostra contorno, nome e vida.

### Herói e espada
**Herói em pixel art**: o herói padrão vem do `Human Male Model.aseprite`, convertido para `engine/js/hero-sprite.js` (132 quadros de 32×31 px, com uma folha de cores, uma folha de partes do corpo e os marcos de cada quadro). O manequim cinza é vestido em tempo real conforme o equipamento: cabelo e túnica por padrão, elmo de ferro com penacho, elmo ou coroa de ouro, capuz sombrio, peitoral de ferro ou de ouro, capas (rubra, gélida, da floresta, sombria) que esvoaçam ao correr e pular, e botas de couro, ferro ou aladas. A arma do arquivo (espada, arco com corda e aljava, ou cajado com joia) é colorida conforme a arma equipada, e o arco mostra a flecha encaixada ao puxar. Com a mira para cima o herói golpeia por cima da cabeça, e no ar, mirando para baixo, golpeia para baixo (golpes gerados girando braço, espada e efeito a partir dos golpes do arquivo). O agachar é uma pose de um joelho no chão. O escudo do arquivo foi removido, e a pose de agachar é gerada a partir da pose parada. Cada animação tem sua velocidade e recomeça na troca de estado: o parado respira devagar, a corrida avança pela distância andada (os pés não deslizam), pulo, aterrissagem e dano tocam uma vez, e os golpes acompanham o tempo do ataque. Depois cada quadro vira ASCII colorido com sombra, como no modo colorido da extensão ASCII Art do Aseprite. Para voltar ao herói desenhado por linhas, use Editor → Jogador → "Voltar ao herói procedural".

O herói é desenhado em **arte de linha ASCII**, com cabeça oval separada por um pescoço, ombros largos com ombreiras, peito em V até o cinto, quadril e saia, e uma cor de preenchimento por região: o glifo de cada célula sai da orientação do traço (`/ \ | _ - ( ) ' .`). No jogo usa traços essenciais; no retrato do inventário aparece com detalhe completo. O golpe de espada deixa um **rastro em lua crescente que segue a ponta real da lâmina** na direção do mouse, com glifos alinhados ao corte e faíscas de impacto na direção do golpe.

### Itens e armaduras
- **Estúdio de itens** (Editor → Itens): canvas para desenhar o ícone ASCII de cada item (glifo + cor por célula; lápis, balde, borracha, conta-gotas; até 12×8), com prévia ao vivo na janela do inventário, na hotbar e no chão. Também cria, duplica e configura itens: consumível, arma, armadura, luz, arremesso, chave, material.
- **Armaduras** — Elmo de ferro, Peitoral de ferro, Capa rubra, Botas de couro. Mudam o visual do herói na hora (elmo com penacho, placas no peito, cor da capa, botas) e dão defesa: cada ponto dá 15% de chance de bloquear um golpe. As botas aceleram. Ficam nos baús e em alguns drops.
- **Mais de 45 itens**:
  - **Armas**, cada uma com seu formato desenhado na mão do herói (`weapon.shape`): espada, adaga venenosa (rápida), lança (longa), machado (empurra), martelo de guerra (lento, treme a tela), espada de gelo (deixa lento), espada do cavaleiro, cajado arcano (orbe teleguiado) e arco curto (flechas na direção do mouse).
  - **Armaduras de ouro**, **capas** gélida (imune a lentidão), da floresta e sombria, capuz sombrio, **botas aladas** (+1 pulo no ar) e botas de ferro.
  - **Comida e poções**: poção grande, pão, maçã, carne, antídoto, poção de escudo e cogumelo brilhante.
  - **Arremesso**: faca e bomba de gelo. **Luz**: tocha de mão e cristal de luz.
  - **Materiais** que caem de cada criatura, como gosma, osso, presa, ferrão, lingote, essência e gemas.
- **Comerciantes** (prefabs `mercador`, `alquimista`, `armeiro`, `pescador`): ficam nos vilarejos, cada um com um estoque diferente em `props.stock`. Loja em ASCII: compra pelo `price` do item e vende pela metade. O `ferreiro` abre a forja.
- **Inventário** (I): painel grande com o **herói em 3D ASCII**: o próprio pixel art do herói (mesmas cores, roupa, armaduras, capa e arma) transformado em voxels com profundidade por parte do corpo, na pose parada respirando. Ele gira sozinho; arraste com o mouse ou use [◄] [►] para girar (depois de um tempo volta a girar sozinho). Só as linhas do boneco são redesenhadas, então clicar nos itens funciona normalmente. Também tem espaços de Cabeça/Corpo/Pés/Arma/Luz (clique para desequipar), barra de defesa e o ícone do item selecionado.

### Dia e noite
A floresta tem um ciclo (padrão de 8 minutos reais por dia). O céu passa por noite, amanhecer, dia e entardecer, com o sol e a lua de glifos cruzando o céu. As estrelas somem de dia e a luz ambiente muda. Grilos tocam à noite e pássaros de dia; o relógio aparece no HUD. Spawners podem ser só de noite ou só de dia, e a caverna não tem ciclo. Ajuste em Editor → Mundo.

### Som
**Música**: `engine/audio/musica.mp3` é a música padrão (em loop) e `engine/audio/chefe.mp3` toca na luta com chefe. Quando um chefe desperta, a música troca em ~1,2 s e a do chefe começa do início; ao fim da luta volta à padrão em ~2 s. O volume segue Opções → Volume geral × Música. Para trocar as músicas, substitua os arquivos (mesmo nome). Sem os arquivos, toca a música generativa. A build copia a pasta `audio/` junto.
Os efeitos são sintetizados em tempo real (WebAudio, `engine/js/audio.js`), sem arquivos de áudio. Inclui efeitos (passos, pulos, espada, acertos, mortes, moedas, portas, baús, explosões, magia, menu), ambiente (vento, grilos, gotas na caverna, crepitar perto de fogo, chuva). **Cada criatura tem seus sons**: aranha (passos rápidos, sibilo, guincho), slime (pulo e “ploft”), morcego (guinchos e asas), esqueletos (ossos chacoalhando, arco, golpe pesado, escudo de metal), espírito (sussurro, orbe, lamento) e a voz do eremita. Dá para trocar e ouvir em Editor → Criaturas. Nos scripts, use `api.sound('nome', self)`.

### Scripts
Cada criatura, objeto, gatilho e item pode ter JavaScript com funções de evento:
`onSpawn(self, api)`, `onUpdate(self, dt, api)`, `onHit(self, dano, api)`, `onDeath(self, api)`, `onTouch(self, player, api)`, `onInteract(self, player, api)`; gatilhos `onEnter/onStay/onExit(api)`; itens `onUse(api, item)`.
A `api` tem movimento (`move`, `jump`, `fly`, `facePlayer`, `wallAhead`, `gapAhead`), timers (`every`), combate (`shoot`, `damage`, `status`, `kill`), mundo (`spawn`, `drop`, `fx`, `setCollider`, `weather`, `goto`, `setSpawn`), inventário (`give`, `has`, `take`) e diálogo (`say`, `message`). O botão **API** no editor mostra a referência completa. Modelos prontos: patrulha, perseguidor, saltador, voador, atirador, espírito, NPC, baú, fogueira, porta e gatilhos.

Exemplo — criatura que foge com pouca vida e solta fogo:
```js
function onUpdate(self, dt, api) {
  api.facePlayer(self);
  if (self.hp <= 1) api.move(self, -self.facing, self.def.speed * 2);
  else if (api.dist(self) < 50) api.move(self, self.facing);
  if (api.every(self, 'fogo', 2)) api.shoot(self, { glyph: '*', color: [1, .5, .1], light: 12, status: 'queimando' });
}
function onDeath(self, api) { api.fx('explosao', self.x, self.y); api.drop('pocao', self.x, self.y); }
```

### O projeto padrão
Um mapa só: o mundo com todos os biomas e, no subsolo profundo, as quatro masmorras. A **Floresta das Ruínas** tem cabana com porta, poço, cerca, torre, ruínas com esqueletos, lago com reflexo e escada, entrada de caverna inclinada com câmara de cristais, ponte sobre a lava, fogueiras-checkpoint, NPC, baús e itens. A mina dela desce até a **Caverna Profunda**.

### Publicar na Steam
Exporte o jogo pelo editor (**Mundo → Exportar jogo**) para `steam-build/game-data.js`. Depois rode `npm install` (só na primeira vez) e `npm run dist` em `steam-build/` para gerar `dist/win-unpacked/Floresta das Ruinas.exe`. Esse executável abre no menu inicial, sem editor, salva o progresso nas fogueiras e integra com o Steamworks (overlay e `api.achievement('ID')`). O passo a passo do envio está em `steam-build/README-STEAM.md`.

### Arquitetura (`engine/js`)
`materials` (materiais e tipos de colisão) · `renderer` (WebGL2: luz/sombra por célula + glifos, céu, reflexo, bloom) · `world` (camadas, colisão, construções, geradores) · `physics` · `player` (controlador + herói com capa/cachecol em verlet) · `sprites` (arte → células com glifos de contorno) · `entities` (prefabs, spawners, gatilhos, projéteis, drops) · `script` (scripts + API + modelos) · `items` (itens, inventário, status) · `fx` · `game` (loop e composição) · `ui` · `overlay` (gizmos) · `editor` · `project` (salvar/abrir).

---|---|
| ←→ / A D | andar |
| Espaço / ↑ / W | pular (segurar = mais alto; coyote time + buffer) |
| J / X | espada (derrota as aranhas) |
| Tab | liga/desliga o editor |
| arrastar um PNG para a tela | vira carimbo ASCII no editor |

**Como a imagem é formada** (`engine/js/renderer.js`):
1. A CPU compõe um buffer do tamanho da tela em células: material + cor + flags (sólido, fundo, tinta) + exposição ao céu, a partir de 3 camadas do mundo (fundo, principal, frente), sprites e partículas.
2. **Passada de luz** (por célula): ambiente × exposição ao céu (o subsolo escurece com a profundidade) + até 32 luzes pontuais com sombra por raymarch nas células sólidas.
3. **Passada de glifos** (por pixel): escolhe o glifo pelo modo do material — textura estável, rampa por luminância, lâmina que balança com vento e se curva ao redor do herói/inimigos, líquido animado, "tinta" para sprites. Céu procedural com estrelas, **lua feita de glifos**, montanhas e pinheiros em parallax. Água reflete o que está acima. Bloom suave das luzes, chuva, neblina rasteira, vinheta.

**Sprites** (`engine/js/sprites.js`): o herói e a aranha são desenhados com Canvas 2D (gradientes, capa e cachecol animados) e amostrados em células a cada pose; o glifo sai da luminância da cor. Qualquer PNG passa pelo mesmo caminho — desenhe seus personagens/objetos em pixel art ou pinte à mão e importe.

**Editor (Tab)**: pincel de materiais por camada (Fundo = sem colisão, Principal = colide se o material for sólido, Frente = na frente do herói), luzes (lanterna, tocha, cristal, lava, lua, magia, vagalume — cor/raio/intensidade/oscilação/brasas), carimbos (árvore, árvore grande, lanterna, poste com lanterna, estandarte, tocha, teia, ruína, plataforma, imagem importada), spawn, inimigos, conta-gotas. Gerar fase por semente, salvar/abrir `.world.json`, screenshot, céu (Noite, Crepúsculo, Névoa, Caverna), luz ambiente, bloom, neblina, chuva, sombras, tamanho do glifo, nome do herói.

**Para estender**: novos materiais em `engine/js/materials.js` (cor, glifos, modo, sólido, emissivo); novas estruturas em `E.Struct` (`world.js`); novos personagens como funções de desenho em `sprites.js`.

---

# ASCII Forge (editor de assets)

Ferramenta de criação de assets para jogos de plataforma 2D **em ASCII art**: sprites, animações, tilesets, cenários com parallax, efeitos de luz e um modo de teste jogável.

Sem build e sem dependências. **Abra o `index.html`** direto no Chrome ou no Edge (ou sirva a pasta com `python -m http.server`). O projeto é salvo sozinho no navegador (localStorage); use **Exportar → Baixar projeto** para ter uma cópia em arquivo.

## Abas

| Aba | O que faz |
|---|---|
| **✎ Editor** | Pinta células (caractere + cor de frente + cor de fundo). Ferramentas: lápis, borracha, balde, linha, retângulo (com um caractere de caixa vira moldura `┌─┐`), conta-gotas, texto, spray de textura. Também tem animações nomeadas (`idle`, `run`, `jump`, `fall`…), linha do tempo, onion skin, espelhamento que inverte os glifos (`/`↔`\`, `(`↔`)`, `▌`↔`▐`, braille…), mover, recolorir e desfazer/refazer. |
| **⇄ Imagem → ASCII** | Converte PNG/JPG/WebP, **GIF animado** (vira animação), várias imagens (viram quadros) ou **spritesheet** (recorte por grade) em asset ASCII. São 6 algoritmos (veja abaixo). |
| **▦ Mapa & Luz** | Pinta tiles, coloca entidades, luzes e camadas de fundo com parallax. A iluminação ASCII tem sombras por raycast, glifos que se apagam no escuro e névoa luminosa. **▶ Testar** deixa jogar com o herói (setas/WASD + espaço; tecla P marca qual entidade é o jogador). |
| **⇩ Exportar** | Projeto completo, JSON do asset para a engine, PNG spritesheet + metadados, TXT, JSON do mapa e PNG do mapa iluminado. |

**✦ Gerar cenário** (barra lateral) cria céu com gradiente, estrelas e lua, montanhas, floresta de pinheiros e texturas de tile. Tudo é procedural, com 4 temas (Noite, Pôr do sol, Floresta, Caverna) e uma semente.

### Atalhos do editor
`B` lápis · `E` borracha · `G` balde · `L` linha · `R`/`Shift+R` retângulo · `I` conta-gotas · `T` texto · `S` spray · `[` `]` quadro anterior/próximo · `Espaço` play · `Ctrl+Z`/`Ctrl+Y` · botão direito apaga.
No mapa: botão direito apaga · `Delete` remove a seleção · `F` espelha a entidade · `P` marca como jogador · `Esc` sai do teste.

### Flags dos assets
- **sólido**: colide e faz sombra.
- **emissivo**: ignora a escuridão. Um FX emissivo colocado no mapa ganha uma luz automaticamente.
- **folhagem**: os glifos `| / \ ' " , v w y`… balançam com o vento e se curvam quando um sprite passa. Foi inspirado no teste de "grass physics" do @ansenjeo. As folhas não colidem.

## Algoritmos do conversor (engenharia reversa)

Cada modo reimplementa a técnica de uma ferramenta conhecida (`js/converter.js`):

| Modo | Referência | Técnica |
|---|---|---|
| Rampa | jp2a / ascii-image-converter | média de luminância da célula → índice numa rampa de caracteres; dither Floyd–Steinberg ou Bayer opcional |
| Rampa medida + auto-níveis | **aalib.js** (analisado com o REA) | mede o brilho real de cada caractere *na fonte atual*, normaliza e ordena (`aafont`), e estica o min..max de luminância das células para 0..1 (`normalizeGrayscale`) |
| Casamento de forma | libcaca / "shape vectors" | amostra 4×8 por célula, compara o **tom** médio + a **forma** (vetor sem média) com o bitmap renderizado de cada glifo |
| Contornos | shader ASCII do Acerola | Difference of Gaussians + Sobel; o ângulo do gradiente vira `\| - _ / \`, o resto usa a rampa |
| Braille | drawille | 2×4 sub-pixels → 256 padrões U+2800 |
| Meio-bloco | timg / chafa | `▀` com fg = pixel de cima, bg = pixel de baixo |
| Quadrantes | chafa | melhor partição 2×2 em duas cores (16 máscaras) |

Comuns a todos os modos: brilho/contraste/gama/saturação, quantização em paleta (PICO-8, Sweetie 16, CGA, Game Boy…), remoção de fundo por alfa ou chroma key, e cor de fundo da célula.

### Sobre o REA (Reverse Engineer Anything)

O `rea` (morluto/rea, v6.4.0) já está instalado globalmente nesta máquina. Nesta sessão usei o **CLI** para fazer a análise estática do pacote `aalib.js`:

```
npm pack aalib.js && tar xzf aalib.js-*.tgz
rea analyze-javascript-application package/lib --artifact-format directory
```

O REA reconstruiu o grafo dos 19 módulos e apontou o núcleo (`aa.js`, `aafont.js`). As duas técnicas viraram as opções "Rampa medida na fonte" e "Auto-níveis".

Para o Claude usar o REA como **ferramenta MCP** em sessões futuras (incluindo sites e apps Electron), rode uma vez e reinicie o Claude Code:

```
npx rea-agents setup
```

Depois é só pedir algo como *"analise o conversor do site X com o REA e traga o efeito Y para o ASCII Forge"*. Comandos úteis: `analyze-web-bundle` (sites), `analyze-javascript-application` (apps JS/Electron), `export-web-scripts`.

## Formato de exportação do asset (`asciiforge-asset@1`)

```json
{
  "format": "asciiforge-asset@1", "name": "heroi", "kind": "sprite",
  "w": 5, "h": 5, "solid": false, "emissive": false,
  "codeWidth": 1, "codes": "0123…", "palette": ["#ff5a4f", "#c0c6d0"],
  "anims": { "run": { "fps": 10, "loop": true, "frames": [
    { "chars": ["  ▄  ", " [o] "], "fg": ["..0..", ".111."], "bg": [".....", "....."] }
  ]}}
}
```

- `chars`: uma string por linha.
- `fg`/`bg`: índices na `palette`, codificados com `codes` (`codeWidth` caracteres por célula; `.` = sem cor).
- Uma célula é transparente quando o caractere é espaço **e** o bg é `.`.
- O mapa (`asciiforge-map@1`) traz os tiles por legenda, as entidades, as luzes (`x, y` em células, `radius`, `intensity`, `flicker`, `mode`), as camadas e o ambiente.

Para desenhar na engine, `js/core.js` (`AF.drawGlyph` / `AF.drawGrid`) já é um renderizador em canvas pronto. Ele desenha os blocos `▀▄▌▐▖…` e o braille como retângulos e pontos, então nada fica com emenda, seja qual for a fonte.

## Estrutura

```
index.html
css/style.css
js/core.js        modelo (grid/célula), cores, charsets, espelhamento, renderizador
js/converter.js   algoritmos imagem → ASCII
js/convertui.js   interface do conversor
js/editor.js      editor de sprites/animação
js/map.js         mapa, composição, iluminação, folhagem, modo de teste
js/presets.js     starter pack + geradores procedurais
js/export.js      formatos de exportação/importação
js/app.js         app, barra lateral, persistência
```

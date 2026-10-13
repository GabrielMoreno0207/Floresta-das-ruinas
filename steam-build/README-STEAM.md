# Publicando na Steam

A engine roda no navegador. Para a Steam, ela é empacotada com **Electron** (o mesmo caminho de vários jogos HTML5 na loja). Esta pasta contém tudo: a janela do jogo, a integração com o Steamworks (overlay e conquistas, via `steamworks.js`) e o empacotador (`electron-builder`).

## 1. Gerar a build pela engine
Abra a engine com **`ASCII Engine.bat`** (na pasta `ascii-forge`) e vá em **Tab → Mundo → Gerar build do jogo**. Escolha a versão e, se quiser, marque o `.zip`. Clique em **⚙ Gerar build (.exe)**.

A engine salva o `game-data.js` aqui, instala as dependências na primeira vez, fecha a build anterior se estiver aberta e roda o empacotador, com o log ao vivo no painel. O resultado fica em `dist/win-unpacked/Floresta das Ruinas.exe` (botões **▶ Jogar build** e **Abrir pasta**).

O `game-data.js` leva o projeto inteiro. Na build o editor fica desligado e o jogo abre no menu inicial.

## 2. Pelo terminal (opcional)
```
cd steam-build
npm install          # só na primeira vez
npm start            # testa o jogo numa janela
npm run dist         # gera dist/win-unpacked/Floresta das Ruinas.exe
```
Linux e Mac: `npm run dist:linux` e `npm run dist:mac`, rodados no respectivo sistema. Ícone: `build/icon.png`. Nome e versão: `package.json`.

## 3. Steamworks
1. Crie a conta de parceiro em https://partner.steamgames.com, pague o Steam Direct e crie o app. Você recebe um **App ID** e um **Depot ID**.
2. Troque o `480` de `steam_appid.txt` pelo seu App ID. O 480 é o "Spacewar", app de teste da Valve, e serve para testar o overlay com a Steam aberta.
3. Conquistas: cadastre-as no painel do Steamworks e desbloqueie nos scripts com `api.achievement('NOME_DA_CONQUISTA')`.
4. Envio da build: baixe o Steamworks SDK, edite `steam/app_build.vdf` e `steam/depot_build.vdf` com seus IDs e rode:
```
steamcmd +login SEU_USUARIO +run_app_build "CAMINHO\steam-build\steam\app_build.vdf" +quit
```
5. No painel, coloque a build no branch `default`, configure as opções de lançamento (executável `Floresta das Ruinas.exe`), a página da loja e envie para revisão.

### Opções de lançamento sugeridas
| Executável | Argumentos | Descrição |
|---|---|---|
| `Floresta das Ruinas.exe` | (vazio) | Jogar |
| `Floresta das Ruinas.exe` | `--fullscreen` | Jogar em tela cheia |

### Notas
- Sem a Steam aberta, o jogo roda normalmente, só sem overlay e conquistas.
- O progresso salvo fica na pasta de dados do usuário do Electron (`%APPDATA%\Floresta das Ruinas`).
- Para Steam Deck/Linux, gere `dist:linux` numa máquina Linux. A Proton também roda a build de Windows.

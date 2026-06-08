# 🌿 Viagem pelos Biomas — VR Educational Game

Jogo educacional em realidade virtual sobre os biomas brasileiros.

## 🚀 Como rodar localmente no VS Code

1. Descompacte o arquivo `.zip`
2. Abra a pasta no VS Code
3. Instale a extensão **Live Server** (ritwickdey.LiveServer)
4. Clique com o botão direito em `index.html` → **Open with Live Server**
5. O jogo abrirá em `http://127.0.0.1:5500`

## 🌐 Deploy no Netlify

### Opção 1 — Arraste e solte (mais fácil)
1. Acesse [app.netlify.com](https://app.netlify.com)
2. Faça login ou crie uma conta gratuita
3. Na aba **Sites**, arraste a **pasta** `viagem-pelos-biomas` para a área de deploy
4. Aguarde o deploy — sua URL ficará disponível em segundos!

### Opção 2 — Via CLI
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir .
```

## 🎮 Controles do Jogo

| Tecla | Ação |
|-------|------|
| `W A S D` ou setas | Mover pelo bioma |
| Mouse | Olhar ao redor |
| `E` | Interagir com animais/plantas |
| `Q` | Abrir quiz educativo |
| `G` | Chamar o guia |
| `Esc` | Fechar painéis |
| Clique na tela | Ativar controle de câmera |

## 🥽 Modo VR
- Clique no botão **🥽 VR** no HUD
- Compatível com headsets WebXR (Meta Quest, HTC Vive, etc.)
- No celular, use com óculos de realidade aumentada simples

## 🌍 Biomas disponíveis
- 🌳 Amazônia
- 🌾 Cerrado
- 🌵 Caatinga
- 🐊 Pantanal
- 🌊 Mata Atlântica
- 🌬️ Pampa

## 📁 Estrutura do projeto
```
viagem-pelos-biomas/
├── index.html          # Página principal
├── netlify.toml        # Configuração Netlify
├── css/
│   └── style.css       # Estilos do jogo
└── js/
    └── game.js         # Engine 3D (Three.js)
```

## 🛠️ Tecnologias
- **Three.js r128** — Engine 3D WebGL
- **WebXR API** — Suporte a VR nativo no navegador
- **Web Audio API** — Sons ambientes gerados proceduralmente
- **CSS3** — Interface moderna sem frameworks

// =====================================================
//  VIAGEM PELOS BIOMAS - Motor do Jogo
// =====================================================
'use strict';

// ── Estado global ──────────────────────────────────
let scene, camera, renderer, clock;
let moveForward=false, moveBack=false, moveLeft=false, moveRight=false;
let yaw=0, pitch=0;
let isRightMouseDown=false, lastMouseX=0, lastMouseY=0;
let currentBiome=null, gameMode='pc';
let dayTime=0.3, guideIndex=0;
let discoveredSpecies=new Set();
let playerScore=0;
let interactables=[], animals=[];
let weatherParticles=null, animationFrameId=null;
let vrSession=null, audioCtx=null, audioNodes=[];

// ── Modo Desmatamento ─────────────────────────────
let deforestationMode = false;
let deforestationObjects = []; // objetos adicionados no modo desmatamento
let originalObjects = [];      // refs de objetos ocultados

// ── Camera bobbing ────────────────────────────────
let bobbingTime = 0;
let isMoving = false;
let bobbingBase = 1.7;

// ── Navegação entre telas ─────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
}

function showIntro()               { showScreen('screen-intro'); }
function showModeSelect()          { showScreen('screen-mode'); initParticles2(); }
function showBiomeSelect()         {
  stopGame();
  const lbl = document.getElementById('select-mode-label');
  if (lbl) lbl.innerHTML = gameMode==='vr'
    ? '<span style="color:#b39ddb">🥽 Modo VR selecionado</span>'
    : '<span style="color:#81c784">🖥️ Modo Computador selecionado</span>';
  showScreen('screen-select');
}
function selectMode(mode)          { gameMode=mode; showBiomeSelect(); }
function showModeSelectFromGame()  { stopGame(); showScreen('screen-mode'); }

function stopGame() {
  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId=null; }
  if (renderer)         { renderer.dispose(); renderer=null; }
  stopAudio();
  interactables=[]; animals=[]; weatherParticles=null;
  deforestationObjects=[]; originalObjects=[]; deforestationMode=false;
  scene=null; camera=null; clock=null;
  // Clean up deforest UI
  const dp = document.getElementById('deforest-panel'); if(dp) dp.remove();
  const db = document.getElementById('deforest-btn');   if(db) db.remove();
  const dbn= document.getElementById('deforest-banner');if(dbn)dbn.remove();
  document.getElementById('screen-game').classList.remove('deforest-active');
}

function startGame(biomeId) {
  currentBiome=biomeId;
  guideIndex=0;
  discoveredSpecies.clear();
  interactables=[]; animals=[];
  playerScore=0;

  const nameEl = document.getElementById('biome-name-hud');
  if (nameEl) nameEl.textContent = BIOMES[biomeId].name;

  const badge = document.getElementById('mode-badge-hud');
  if (badge) badge.textContent = gameMode==='vr'
    ? '🥽 Modo VR - clique em VR para entrar'
    : '🖥️ Botão direito do mouse = girar câmera';

  const hint = document.getElementById('controls-hint');
  if (hint) hint.innerHTML = gameMode==='vr'
    ? '<span>🥽 Headset para olhar</span><span>🕹️ Controles VR para mover</span><span class="deforest-key">F = Desmatamento</span>'
    : '<span>⌨️ WASD = Mover</span><span>🖱️ Btn Direito = Câmera</span><span>E = Interagir</span><span>Q = Quiz</span><span>G = Guia</span><span class="deforest-key">F = Desmatamento</span>';

  showScreen('screen-game');
  showLoadingScreen(biomeId, () => initGame(biomeId));
  if (gameMode==='vr') setTimeout(()=>enterVR(), 800);
  showGuide();
}

function hideImpact() { showBiomeSelect(); }

// ── Dados dos biomas ──────────────────────────────
const BIOMES = {
  amazonia: {
    name:'🌳 Amazônia',
    skyTop:0x0d2b1a, skyBot:0x1a5e2a,
    fogColor:0x1a4a2a, fogNear:30, fogFar:120,
    groundColor:0x1a3a0e,
    ambientColor:0x204030, ambientInt:0.8,
    sunColor:0xfff5d0, sunInt:1.5,
    hemiSky:0x1a5e2a, hemiGround:0x0a2e0f, hemiInt:0.6,
    weather:'rain', music:220,
    guide:[
      '🌿 Bem-vindo à Amazônia! É a maior floresta tropical do mundo, cobrindo ~5,5 milhões km². Abriga cerca de 10% de todas as espécies do planeta!',
      '🌧️ A Amazônia recebe mais de 2.500mm de chuva por ano. Essa umidade cria os "rios voadores", que carregam vapor d\'água para o resto do Brasil.',
      '⚠️ Já perdemos 20% da floresta original. Quando a Amazônia é derrubada, o clima de toda a América do Sul muda!',
      '🐍 Aqui vivem 40.000 espécies de plantas, 1.300 aves e 3.000 tipos de peixes. Uma árvore pode hospedar mais espécies que países inteiros!',
    ],
    quiz:[
      {q:'Qual o principal motivo do desmatamento na Amazônia?',opts:['Turismo','Pecuária e soja','Mineração','Pesca'],a:1,exp:'A pecuária e o cultivo de soja são as principais causas do desmatamento.'},
      {q:'Quantas espécies de árvores existem na Amazônia?',opts:['~1.000','~5.000','~16.000','~50.000'],a:2,exp:'Existem cerca de 16.000 espécies de árvores na Amazônia!'},
    ],
    animals:[
      {name:'Onça-pintada',emoji:'🐆',status:'ameacado',info:'A maior felina das Américas! Predador-ápice que regula populações. Ameaçada pelo desmatamento e caça ilegal.',pos:[10,0,-15]},
      {name:'Arara-azul',emoji:'🦜',status:'ameacado',info:'A maior arara do mundo! Sua plumagem azul é inconfundível. Depende de palmeiras específicas para se alimentar.',pos:[-8,3,-10]},
      {name:'Macaco-barrigudo',emoji:'🐒',status:'critico',info:'Um dos maiores primatas do Brasil. Fundamental para a dispersão de sementes na floresta.',pos:[5,6,-20]},
      {name:'Boto-cor-de-rosa',emoji:'🐬',status:'ameacado',info:'O golfinho de rio mais famoso do mundo! Habita os rios amazônicos.',pos:[0,0,-30]},
    ],
    plants:[
      {name:'Vitória-régia',emoji:'🌸',info:'A rainha das plantas aquáticas! Folhas de até 3m de diâmetro. Floresce apenas à noite.',pos:[15,0,-5]},
      {name:'Seringueira',emoji:'🌳',info:'Árvore do látex! Base do ciclo da borracha no século XIX.',pos:[-12,0,-8]},
    ],
  },
  cerrado:{
    name:'🌾 Cerrado',
    skyTop:0x1a1a0a, skyBot:0x6b5e1a,
    fogColor:0x8b7a30, fogNear:50, fogFar:200,
    groundColor:0x9e7c2a,
    ambientColor:0x403820, ambientInt:0.8,
    sunColor:0xffe090, sunInt:1.8,
    hemiSky:0xffe090, hemiGround:0x8b6914, hemiInt:0.8,
    weather:'none', music:180,
    guide:[
      '🌾 Bem-vindo ao Cerrado! É a savana mais biodiversa do mundo, cobrindo 2 milhões km². Chamado de "berço das águas" do Brasil.',
      '🌳 As árvores têm cascas grossas e raízes de até 20 metros! Isso as protege das queimadas e permite buscar água no subsolo.',
      '🔥 As queimadas naturais fazem parte do Cerrado, mas o fogo humano é destrutivo. Mais de 50% da cobertura original já foi perdida.',
      '💧 O Cerrado alimenta 8 das 12 bacias hidrográficas do Brasil. Destruí-lo significa secar rios como o São Francisco!',
    ],
    quiz:[
      {q:'Por que as árvores do Cerrado têm raízes tão profundas?',opts:['Para crescer mais','Para buscar água e resistir ao fogo','Para produzir frutos','Para comunicação'],a:1,exp:'Raízes profundas permitem acessar água e sobreviver a incêndios.'},
      {q:'Quanto do Cerrado original ainda existe?',opts:['80%','60%','menos de 50%','30%'],a:2,exp:'O Cerrado perdeu mais de 50% da cobertura original.'},
    ],
    animals:[
      {name:'Tamanduá-bandeira',emoji:'🦡',status:'ameacado',info:'Come até 35.000 formigas por dia! Seu focinho longo é uma adaptação única. Ameaçado pela perda de habitat.',pos:[8,0,-12]},
      {name:'Lobo-guará',emoji:'🦊',status:'ameacado',info:'O maior canídeo da América do Sul! Pernas longas para enxergar sobre as gramíneas.',pos:[-10,0,-18]},
      {name:'Ema',emoji:'🦅',status:'ok',info:'A maior ave do Brasil! Corre até 60km/h. O pai choca os ovos e cuida dos filhotes.',pos:[20,0,-8]},
    ],
    plants:[
      {name:'Ipê-amarelo',emoji:'🌼',info:'A flor nacional! Floresce quando está sem folhas, criando um espetáculo amarelo.',pos:[5,0,-25]},
      {name:'Buriti',emoji:'🌴',info:'"Árvore da vida" do Cerrado! Indica presença de água e alimenta dezenas de espécies.',pos:[-15,0,-5]},
    ],
  },
  caatinga:{
    name:'🌵 Caatinga',
    skyTop:0x0a0a1a, skyBot:0xa06010,
    fogColor:0xc8a050, fogNear:60, fogFar:280,
    groundColor:0xc8843a,
    ambientColor:0x503c10, ambientInt:0.9,
    sunColor:0xfff0a0, sunInt:2.0,
    hemiSky:0xffd060, hemiGround:0xb86820, hemiInt:1.0,
    weather:'none', music:160,
    guide:[
      '🌵 Bem-vindo à Caatinga! O único bioma exclusivamente brasileiro. "Caatinga" significa "mata branca" em tupi.',
      '☀️ A seca é o grande desafio. Plantas armazenam água no caule, perdem folhas na estiagem e florescem rapidamente com as chuvas.',
      '💧 A chuva é irregular e imprevisível. Pode chover muito num ano e quase nada no seguinte. A vida aqui aprendeu a sobreviver.',
      '⚠️ A desertificação ameaça a Caatinga. Mais de 15 milhões de pessoas dependem diretamente deste bioma para viver.',
    ],
    quiz:[
      {q:'O que significa "Caatinga" em tupi?',opts:['Terra quente','Mata branca','Solo seco','Água escassa'],a:1,exp:'"Caatinga" significa "mata branca", referindo-se ao aspecto das plantas na seca.'},
      {q:'Como as plantas da Caatinga sobrevivem à seca?',opts:['Raízes superficiais','Armazenam água e perdem folhas','Crescem só à noite','Mudam de cor'],a:1,exp:'Armazenam água no caule (cactos) e perdem folhas para reduzir a transpiração.'},
    ],
    animals:[
      {name:'Preá',emoji:'🐹',status:'ok',info:'Pequeno roedor parente da capivara. Obtém água dos alimentos que consome na seca.',pos:[6,0,-10]},
      {name:'Asa-branca',emoji:'🕊️',status:'ok',info:'A pomba símbolo do Nordeste! Migra em busca de água. Sua chegada anuncia as chuvas.',pos:[0,4,-15]},
      {name:'Onça-parda',emoji:'🦁',status:'ameacado',info:'A maior predadora da Caatinga. Extremamente adaptável, perseguida por fazendeiros.',pos:[-12,0,-20]},
    ],
    plants:[
      {name:'Mandacaru',emoji:'🌵',info:'O cacto símbolo da Caatinga! Armazena centenas de litros de água. Na seca, alimenta o gado.',pos:[15,0,-8]},
      {name:'Juazeiro',emoji:'🌳',info:'Árvore sagrada do Nordeste! Mantém folhas verdes mesmo na seca mais severa.',pos:[-8,0,-12]},
    ],
  },
  pantanal:{
    name:'🐊 Pantanal',
    skyTop:0x0a1520, skyBot:0x1565c0,
    fogColor:0x204060, fogNear:40, fogFar:160,
    groundColor:0x3d6b28,
    ambientColor:0x203040, ambientInt:0.7,
    sunColor:0xd0e8ff, sunInt:1.3,
    hemiSky:0x90c8e0, hemiGround:0x3a6b28, hemiInt:0.5,
    weather:'mist', music:200,
    guide:[
      '🌊 Bem-vindo ao Pantanal! A maior planície alagável do mundo, com ~150.000km². Fica na fronteira com Bolívia e Paraguai.',
      '🐊 O Pantanal tem a maior concentração de jacarés do mundo — 10 milhões de jacarés-do-pantanal! E a maior população de onças-pintadas.',
      '💧 Entre novembro e março, as águas sobem e inundam tudo. Esse ciclo fertiliza o solo e alimenta milhares de espécies.',
      '⚠️ Em 2020, o Pantanal sofreu o pior incêndio de sua história: 30% do bioma queimou em poucos meses.',
    ],
    quiz:[
      {q:'Qual animal tem maior concentração no Pantanal?',opts:['Capivara','Jacaré-do-pantanal','Onça-pintada','Tuiuiú'],a:1,exp:'O Pantanal tem ~10 milhões de jacarés-do-pantanal, a maior concentração do mundo.'},
      {q:'Quando ocorrem as cheias no Pantanal?',opts:['Jun-Set','Mar-Jun','Nov-Mar','Jul-Out'],a:2,exp:'As cheias são de novembro a março, fertilizando toda a planície.'},
    ],
    animals:[
      {name:'Jacaré-do-pantanal',emoji:'🐊',status:'ok',info:'O rei dos rios! Controla populações de peixes e mantém o equilíbrio. Pode viver 70 anos.',pos:[0,0,-20]},
      {name:'Capivara',emoji:'🦫',status:'ok',info:'O maior roedor do mundo! Semi-aquática, nada perfeitamente. Alimenta onças e jacarés.',pos:[8,0,-10]},
      {name:'Tuiuiú',emoji:'🦢',status:'ameacado',info:'Ave símbolo do Pantanal! Até 1,5m de altura. Essencial para a dispersão de sementes aquáticas.',pos:[-6,0,-15]},
    ],
    plants:[
      {name:'Camalote',emoji:'🌿',info:'Planta flutuante do Pantanal! Forma tapetes verdes sobre a água, berçário de peixes.',pos:[12,0,-8]},
      {name:'Acuri',emoji:'🌴',info:'A palmeira mais importante do Pantanal! Seus frutos alimentam araras e papagaios.',pos:[-10,0,-12]},
    ],
  },
  'mata-atlantica':{
    name:'🌊 Mata Atlântica',
    skyTop:0x0d1f0d, skyBot:0x2e7d32,
    fogColor:0x1a3d1a, fogNear:25, fogFar:100,
    groundColor:0x1f4a14,
    ambientColor:0x1a3020, ambientInt:0.7,
    sunColor:0xe8ffe8, sunInt:1.3,
    hemiSky:0x1a6e2a, hemiGround:0x0d3318, hemiInt:0.55,
    weather:'drizzle', music:240,
    guide:[
      '🌿 Bem-vindo à Mata Atlântica! Uma das florestas mais antigas do mundo — 70 milhões de anos! Restam menos de 12%.',
      '🌈 Apesar de reduzida, é um dos maiores hotspots de biodiversidade. Tem mais espécies de árvores por hectare que a Amazônia!',
      '🏙️ Mais de 70% da população brasileira vive na área original da Mata Atlântica. Ela fornece água e protege encostas.',
      '⚠️ 88% já foi desmatado. Mas onde há proteção, ela se recupera surpreendentemente rápido!',
    ],
    quiz:[
      {q:'Quanto da Mata Atlântica original ainda existe?',opts:['50%','30%','menos de 12%','20%'],a:2,exp:'Restam menos de 12%, tornando-a uma das florestas mais ameaçadas.'},
      {q:'O mico-leão-dourado é símbolo de qual bioma?',opts:['Amazônia','Pantanal','Mata Atlântica','Cerrado'],a:2,exp:'O mico-leão-dourado é símbolo da Mata Atlântica e um caso de sucesso conservacionista.'},
    ],
    animals:[
      {name:'Mico-leão-dourado',emoji:'🦁',status:'ameacado',info:'De 200 para 3.000 indivíduos! Caso de sucesso da conservação. Símbolo de esperança.',pos:[6,4,-12]},
      {name:'Jaguatirica',emoji:'🐱',status:'ameacado',info:'A menor das onças! Excelente escaladora. Seu belo pelage a tornou alvo de caçadores.',pos:[-8,0,-18]},
      {name:'Sabiá-laranjeira',emoji:'🐦',status:'ok',info:'Pássaro símbolo do Brasil! Seu canto inspirou Gonçalves Dias.',pos:[0,3,-8]},
    ],
    plants:[
      {name:'Bromélias',emoji:'🌺',info:'"Piscinas da floresta"! Hospedam girinos, insetos e sapos. Fundamentais para a cadeia alimentar.',pos:[10,0,-6]},
      {name:'Jequitibá',emoji:'🌲',info:'Pode viver 3.000 anos e ter 50m de altura! Um jequitibá hospeda centenas de espécies.',pos:[-12,0,-10]},
    ],
  },
  pampa:{
    name:'🌬️ Pampa',
    skyTop:0x080c18, skyBot:0x3a4a60,
    fogColor:0x506070, fogNear:80, fogFar:320,
    groundColor:0x6a8030,
    ambientColor:0x202830, ambientInt:0.7,
    sunColor:0xe0e8ff, sunInt:1.4,
    hemiSky:0xd0e0f0, hemiGround:0x6a8030, hemiInt:0.6,
    weather:'wind', music:150,
    guide:[
      '🌾 Bem-vindo ao Pampa! Os campos gaúchos cobrem o RS e se estendem ao Uruguai e Argentina. O único bioma transfronteiriço do Brasil.',
      '🌬️ Os ventos fortes são marca registrada. O Minuano derruba temperaturas em horas — por isso o chimarrão é tão importante!',
      '🐄 O Pampa tem a maior tradição pecuária do Brasil. Mas gado exótico e soja estão destruindo espécies únicas.',
      '⚠️ É o bioma menos protegido do Brasil: apenas 0,4% tem proteção legal. Urgente criar mais áreas de conservação!',
    ],
    quiz:[
      {q:'Em quais países o Pampa ocorre?',opts:['Só no Brasil','Brasil e Argentina','Brasil, Uruguai e Argentina','Brasil e Bolívia'],a:2,exp:'O Pampa ocorre no Brasil, Uruguai e Argentina — é transfronteiriço.'},
      {q:'Qual o principal vento frio do Pampa?',opts:['Aracuã','Minuano','Nordeste','Brisa'],a:1,exp:'O Minuano é o vento polar que derruba temperaturas rapidamente no Pampa.'},
    ],
    animals:[
      {name:'Ema',emoji:'🦅',status:'ok',info:'A maior ave do Brasil! Corre 60km/h. O pai incuba os ovos e cuida dos filhotes por quase 1 ano.',pos:[15,0,-10]},
      {name:'Graxaim-do-campo',emoji:'🦊',status:'ok',info:'Adaptado ao frio do Pampa. Caça roedores e aves com agilidade. Ativo ao anoitecer.',pos:[-10,0,-15]},
      {name:'Veado-campeiro',emoji:'🦌',status:'ameacado',info:'Único veado dos campos abertos. Seus grandes olhos detectam predadores de longe.',pos:[5,0,-20]},
    ],
    plants:[
      {name:'Erva-mate',emoji:'🌱',info:'Base do chimarrão! Rica em cafeína e antioxidantes. Uma das poucas culturas nativas da América do Sul.',pos:[8,0,-8]},
      {name:'Carqueja',emoji:'🌿',info:'Planta medicinal típica do Pampa! Usada na medicina popular gaúcha há séculos.',pos:[-6,0,-10]},
    ],
  },
};

// ── Partículas intro ──────────────────────────────
(function initParticles1(){
  const cv=document.getElementById('particles-canvas');
  if(!cv) return;
  const ctx=cv.getContext('2d');
  const pts=[];
  function resize(){ cv.width=innerWidth; cv.height=innerHeight; }
  resize(); addEventListener('resize',resize);
  for(let i=0;i<80;i++) pts.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,r:Math.random()*2+1,a:Math.random()});
  function loop(){
    if(!document.getElementById('screen-intro').classList.contains('active')) return;
    ctx.clearRect(0,0,cv.width,cv.height);
    pts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.a+=.005; if(p.x<0||p.x>cv.width)p.vx*=-1; if(p.y<0||p.y>cv.height)p.vy*=-1; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=`rgba(76,175,80,${(Math.sin(p.a)*.5+.5)*.6})`; ctx.fill(); });
    requestAnimationFrame(loop);
  }
  loop();
})();

function initParticles2(){
  const cv=document.getElementById('particles-canvas-2');
  if(!cv||cv.dataset.init) return;
  cv.dataset.init='1';
  const ctx=cv.getContext('2d');
  const pts=[];
  function resize(){ cv.width=innerWidth; cv.height=innerHeight; }
  resize(); addEventListener('resize',resize);
  for(let i=0;i<60;i++) pts.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,r:Math.random()*2+.5,a:Math.random(),hue:Math.random()>.5?120:260});
  function loop(){
    if(!document.getElementById('screen-mode').classList.contains('active')) return;
    ctx.clearRect(0,0,cv.width,cv.height);
    pts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.a+=.004; if(p.x<0||p.x>cv.width)p.vx*=-1; if(p.y<0||p.y>cv.height)p.vy*=-1; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=`hsla(${p.hue},70%,65%,${(Math.sin(p.a)*.5+.5)*.55})`; ctx.fill(); });
    requestAnimationFrame(loop);
  }
  loop();
}

// ── Tela de carregamento ─────────────────────────
function showLoadingScreen(biomeId, callback) {
  const b = BIOMES[biomeId];
  const existing = document.getElementById('loading-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-biome-icon">${b.name.split(' ')[0]}</div>
    <div class="loading-biome-name">${b.name.slice(2)}</div>
    <div class="loading-bar-wrap"><div class="loading-bar-fill" id="load-bar"></div></div>
    <div class="loading-tip" id="load-tip">Preparando o ambiente...</div>
  `;
  document.getElementById('screen-game').appendChild(overlay);

  const tips = [
    'Gerando vegetação característica...',
    'Posicionando animais no bioma...',
    'Configurando clima e atmosfera...',
    'Ajustando iluminação do ambiente...',
    'Quase lá! Finalizando o mundo...',
  ];
  let pct = 0;
  let tipIdx = 0;
  const bar = () => document.getElementById('load-bar');
  const tip = () => document.getElementById('load-tip');

  const interval = setInterval(() => {
    pct += 20;
    tipIdx = Math.min(tipIdx + 1, tips.length - 1);
    if (bar()) bar().style.width = pct + '%';
    if (tip()) tip().textContent = tips[tipIdx];
    if (pct >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s';
        setTimeout(() => { overlay.remove(); callback(); }, 500);
      }, 300);
    }
  }, 180);
}

// ── Motor Three.js ────────────────────────────────
function initGame(biomeId){
  const b=BIOMES[biomeId];
  const cv=document.getElementById('game-canvas');

  scene=new THREE.Scene();
  scene.fog=new THREE.Fog(b.fogColor,b.fogNear,b.fogFar);

  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,500);
  camera.position.set(0,1.7,0);

  renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.2;

  clock=new THREE.Clock();

  // Luzes base
  const ambient=new THREE.AmbientLight(b.ambientColor,b.ambientInt);
  scene.add(ambient); scene.userData.ambient=ambient;

  const sun=new THREE.DirectionalLight(b.sunColor,b.sunInt);
  sun.position.set(50,80,30);
  sun.castShadow=true;
  sun.shadow.mapSize.width=sun.shadow.mapSize.height=2048;
  sun.shadow.camera.left=-80; sun.shadow.camera.right=80;
  sun.shadow.camera.top=80;  sun.shadow.camera.bottom=-80;
  sun.shadow.camera.far=300;
  scene.add(sun); scene.userData.sun=sun;

  const hemi=new THREE.HemisphereLight(b.hemiSky,b.hemiGround,b.hemiInt);
  scene.add(hemi);

  const fill=new THREE.DirectionalLight(b.sunColor,.35);
  fill.position.set(-60,40,-50); scene.add(fill);

  // Construção do mundo
  buildSky(b);
  buildGround(biomeId);
  buildVegetation(biomeId);
  buildWater(biomeId);
  buildAnimals(biomeId);
  buildWeather(b.weather);
  buildSigns();
  buildAtmosphere(biomeId);

  startAmbientAudio(b.music,b.weather);
  buildDeforestButton();
  setupControls();
  addEventListener('resize',onResize);
  animate();
}

// ── Céu ───────────────────────────────────────────
function buildSky(b){
  const mat=new THREE.ShaderMaterial({
    uniforms:{ topColor:{value:new THREE.Color(b.skyTop)}, botColor:{value:new THREE.Color(b.skyBot)}, dayFactor:{value:.7} },
    vertexShader:`varying vec3 vW; void main(){vW=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 topColor,botColor; uniform float dayFactor; varying vec3 vW; void main(){ float h=normalize(vW+20.).y; gl_FragColor=vec4(mix(botColor,topColor,max(pow(max(h,0.),.5),0.))*dayFactor,1.); }`,
    side:THREE.BackSide,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(450,32,16),mat));
  scene.userData.skyMat=mat;
}

// ── Chão por bioma ────────────────────────────────
function buildGround(id){
  const colors={
    amazonia:0x1a3a0e, cerrado:0x9e7c2a, caatinga:0xc8843a,
    pantanal:0x3d6b28, 'mata-atlantica':0x1f4a14, pampa:0x6a8030,
  };
  const base=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshLambertMaterial({color:colors[id]||0x3a6e2a}));
  base.rotation.x=-Math.PI/2; base.receiveShadow=true; scene.add(base);

  if(id==='amazonia') {
    // Rio
    addPlane(14,160,0x1a4a8a,.85,-28,0.05,-20,0.15);
    // Raízes
    const rm=new THREE.MeshLambertMaterial({color:0x3d1e08});
    for(let i=0;i<20;i++){
      const a=Math.random()*Math.PI*2,d=4+Math.random()*35;
      const r=new THREE.Mesh(new THREE.BoxGeometry(.3,.35,2+Math.random()*3),rm);
      r.position.set(Math.cos(a)*d,.18,Math.sin(a)*d); r.rotation.y=a; scene.add(r);
    }
  }
  if(id==='cerrado') {
    // Chapada ao fundo
    const chap=new THREE.Mesh(new THREE.BoxGeometry(80,12,60),new THREE.MeshLambertMaterial({color:0x8b6914}));
    chap.position.set(-60,6,-80); scene.add(chap);
    // Pedras
    const pm=new THREE.MeshLambertMaterial({color:0x7a6030});
    for(let i=0;i<35;i++){
      const s=.5+Math.random()*2;
      const r=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),pm);
      r.position.set((Math.random()-.5)*120,s*.3,(Math.random()-.5)*120);
      r.rotation.set(Math.random(),Math.random(),Math.random()); scene.add(r);
    }
  }
  if(id==='caatinga') {
    // Rochas grandes (inselbergs)
    const rm=new THREE.MeshLambertMaterial({color:0x9a7050});
    [[0,0,-45],[22,0,-58],[-18,0,-62],[32,0,-32]].forEach(p=>{
      const h=8+Math.random()*14,r=6+Math.random()*9;
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(r,1),rm);
      rock.scale.y=h/r; rock.position.set(p[0],h*.4,p[2]); rock.castShadow=true; scene.add(rock);
    });
    // Pedrinhas
    const pm=new THREE.MeshLambertMaterial({color:0x8a6040});
    for(let i=0;i<50;i++){
      const s=.3+Math.random()*1.2;
      const p=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),pm);
      p.position.set((Math.random()-.5)*100,s*.3,(Math.random()-.5)*100);
      p.rotation.set(Math.random(),Math.random(),Math.random()); scene.add(p);
    }
  }
  if(id==='pantanal') {
    // Lagos
    addPlane(70,50,0x1a5a9e,.82,15,0.06,-35);
    addPlane(30,20,0x1a5a9e,.75,-22,0.06,10);
    addPlane(20,15,0x1a5a9e,.75,32,0.06,22);
    addPlane(18,12,0x1a5a9e,.75,-12,0.06,-18);
    // Juncos nas margens
    const jm=new THREE.MeshLambertMaterial({color:0x5a8a30});
    for(let i=0;i<60;i++){
      const h=.8+Math.random()*1.8;
      const j=new THREE.Mesh(new THREE.CylinderGeometry(.04,.07,h,4),jm);
      j.position.set(10+Math.cos(Math.random()*Math.PI*2)*(3+Math.random()*8),h/2,-35+Math.sin(Math.random()*Math.PI*2)*(3+Math.random()*8));
      j.rotation.z=(Math.random()-.5)*.25; scene.add(j);
    }
  }
  if(id==='mata-atlantica') {
    // Cachoeira
    const cliff=new THREE.Mesh(new THREE.BoxGeometry(20,25,15),new THREE.MeshLambertMaterial({color:0x3a3a3a}));
    cliff.position.set(-30,12.5,-50); cliff.castShadow=true; scene.add(cliff);
    const fall=new THREE.Mesh(new THREE.PlaneGeometry(8,20),new THREE.MeshLambertMaterial({color:0x88bbff,transparent:true,opacity:.7}));
    fall.position.set(-30,12,-43); scene.add(fall); scene.userData.waterfall=fall;
    addPlane(14,10,0x1a6aaa,.85,-30,.08,-38);
    addPlane(4,80,0x2255aa,.75,-18,.05,-10,.15);
    // Morros
    const hm=new THREE.MeshLambertMaterial({color:0x1e4810});
    [[50,0,-40],[-45,0,-30],[30,0,50],[-60,0,20],[0,0,-80]].forEach(p=>{
      const h=12+Math.random()*18,r=18+Math.random()*18;
      const hill=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),hm);
      hill.scale.y=h/r; hill.position.set(p[0],-r*.7+h*.3,p[2]); scene.add(hill);
    });
  }
  if(id==='pampa') {
    // Arroio
    addPlane(5,150,0x3a6aaa,.75,25,.05,0,.4);
    // Coxilhas
    const cm=new THREE.MeshLambertMaterial({color:0x7a9038});
    [[0,0,-60,90,5,120],[60,0,0,120,6,80],[-70,0,30,100,4,90]].forEach(p=>{
      const cox=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),cm);
      cox.scale.set(p[3],p[4],p[5]); cox.position.set(p[0],-p[4]*.7,p[2]); scene.add(cox);
    });
    // Cerca
    const pm=new THREE.MeshLambertMaterial({color:0x5a3a18});
    const wm=new THREE.MeshLambertMaterial({color:0x888888});
    for(let p=0;p<10;p++){
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,2.2,6),pm);
      post.position.set(-40+p*9,1.1,-15); scene.add(post);
      if(p<9){
        const wire=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,9,4),wm);
        wire.rotation.z=Math.PI/2; wire.position.set(-40+p*9+4.5,1.5,-15); scene.add(wire);
      }
    }
    // Basalto
    const bm=new THREE.MeshLambertMaterial({color:0x3a3a3a});
    for(let i=0;i<18;i++){
      const s=.5+Math.random()*2;
      const b=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),bm);
      b.position.set((Math.random()-.5)*80,s*.3,(Math.random()-.5)*80);
      b.rotation.set(Math.random(),Math.random(),Math.random()); scene.add(b);
    }
  }

  // Manchas de solo variado
  const patchColor={amazonia:0x2d5c18,cerrado:0xb8922a,caatinga:0xe8a04a,pantanal:0x5a4a1a,'mata-atlantica':0x224d14,pampa:0x7a9040};
  const pc=new THREE.MeshLambertMaterial({color:patchColor[id]||0x4a6e2a});
  for(let i=0;i<120;i++){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(1+Math.random()*4,1+Math.random()*4),pc);
    p.rotation.x=-Math.PI/2; p.rotation.z=Math.random()*Math.PI;
    p.position.set((Math.random()-.5)*150,.01,(Math.random()-.5)*150); scene.add(p);
  }
}

function addPlane(w,h,color,opacity,x,y,z,rz){
  const m=new THREE.MeshLambertMaterial({color,transparent:true,opacity});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);
  mesh.rotation.x=-Math.PI/2; if(rz) mesh.rotation.z=rz;
  mesh.position.set(x,y,z); scene.add(mesh);
}

// ── Vegetação por bioma ───────────────────────────
function buildVegetation(id){
  if(id==='amazonia')       buildAmazoniaVeg();
  else if(id==='cerrado')   buildCerradoVeg();
  else if(id==='caatinga')  buildCaatingaVeg();
  else if(id==='pantanal')  buildPantanalVeg();
  else if(id==='mata-atlantica') buildAtlanticaVeg();
  else if(id==='pampa')     buildPampaVeg();
}

function buildAmazoniaVeg(){
  for(let i=0;i<80;i++){
    const a=Math.random()*Math.PI*2,d=5+Math.random()*90;
    const s=.8+Math.random()*1.2,g=new THREE.Group();
    const h=(10+Math.random()*14)*s;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.25*s,.45*s,h,10),new THREE.MeshLambertMaterial({color:0x3d1e08}));
    trunk.position.y=h/2; trunk.castShadow=true; g.add(trunk);
    // Raízes tabulares
    for(let r=0;r<4;r++){
      const ra=r*(Math.PI/2)+Math.random()*.3;
      const root=new THREE.Mesh(new THREE.BoxGeometry(.2,h*.25,1.8*s),new THREE.MeshLambertMaterial({color:0x3d1e08}));
      root.position.set(Math.cos(ra)*.8*s,h*.12,Math.sin(ra)*.8*s); root.rotation.y=ra; g.add(root);
    }
    const cr=(4+Math.random()*3)*s;
    const cap=new THREE.Mesh(new THREE.SphereGeometry(cr,10,6),new THREE.MeshLambertMaterial({color:new THREE.Color(0x1a5e1a).lerp(new THREE.Color(0x0d3d0d),Math.random())}));
    cap.scale.y=.45; cap.position.y=h+cr*.2; cap.castShadow=true; g.add(cap);
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
  // Sub-bosque
  for(let i=0;i<50;i++){
    const a=Math.random()*Math.PI*2,d=3+Math.random()*45;
    const s=new THREE.Mesh(new THREE.SphereGeometry(.5+Math.random()*1,6,4),new THREE.MeshLambertMaterial({color:0x0f3a0f}));
    s.position.set(Math.cos(a)*d,.5+Math.random()*.4,Math.sin(a)*d); s.scale.y=.7; scene.add(s);
  }
}

function buildCerradoVeg(){
  for(let i=0;i<70;i++){
    const a=Math.random()*Math.PI*2,d=6+Math.random()*85;
    const s=.7+Math.random()*.9,g=new THREE.Group();
    const h=(1.8+Math.random()*3)*s;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12*s,.22*s,h,6),new THREE.MeshLambertMaterial({color:0x2e1404}));
    trunk.position.y=h/2; trunk.rotation.z=(Math.random()-.5)*.7; trunk.castShadow=true; g.add(trunk);
    // Copa aberta
    const isIpe=Math.random()>.85;
    const cap=new THREE.Mesh(new THREE.SphereGeometry((1.5+Math.random())*s,7,5),new THREE.MeshLambertMaterial({color:isIpe?0xffd700:0x4a6e14}));
    cap.scale.y=.55; cap.position.y=h+.8*s; g.add(cap);
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
  // Gramíneas amarelas — característica visual marcante
  for(let i=0;i<300;i++){
    const a=Math.random()*Math.PI*2,d=2+Math.random()*80;
    const h=.4+Math.random()*1.4;
    const gr=new THREE.Mesh(new THREE.CylinderGeometry(.03,.06,h,4),new THREE.MeshLambertMaterial({color:new THREE.Color(0xc8a030).lerp(new THREE.Color(0xe0c050),Math.random())}));
    gr.position.set(Math.cos(a)*d,h/2,Math.sin(a)*d); gr.rotation.z=(Math.random()-.5)*.4; scene.add(gr);
  }
  // Murundus (montes de cupim)
  for(let i=0;i<12;i++){
    const a=Math.random()*Math.PI*2,d=10+Math.random()*60;
    const m=new THREE.Mesh(new THREE.ConeGeometry(1.2+Math.random()*.8,1.5+Math.random(),8),new THREE.MeshLambertMaterial({color:0x6a4a10}));
    m.position.set(Math.cos(a)*d,0,Math.sin(a)*d); m.castShadow=true; scene.add(m);
  }
}

function buildCaatingaVeg(){
  // Mandacaru
  for(let i=0;i<50;i++){
    const a=Math.random()*Math.PI*2,d=4+Math.random()*80;
    const s=.8+Math.random()*1.4,g=new THREE.Group();
    const h=(3+Math.random()*5)*s;
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.3*s,.4*s,h,10),new THREE.MeshLambertMaterial({color:0x3a6820}));
    body.position.y=h/2; body.castShadow=true; g.add(body);
    const arms=1+Math.floor(Math.random()*3);
    for(let ar=0;ar<arms;ar++){
      const aa=(ar/arms)*Math.PI*2;
      const al=(1.5+Math.random()*2)*s;
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.22*s,al,8),new THREE.MeshLambertMaterial({color:0x3a6820}));
      arm.position.set(Math.cos(aa)*.35*s,h*.5+Math.random()*h*.2,Math.sin(aa)*.35*s);
      arm.rotation.z=Math.cos(aa)*(Math.PI/2.5); arm.rotation.x=Math.sin(aa)*(Math.PI/2.5); g.add(arm);
    }
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
  // Jurema (galhos secos)
  for(let i=0;i<30;i++){
    const a=Math.random()*Math.PI*2,d=5+Math.random()*70,g=new THREE.Group();
    const s=.6+Math.random()*.8;
    const h=(1.5+Math.random()*2)*s;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.1*s,.18*s,h,6),new THREE.MeshLambertMaterial({color:0x5a3010}));
    trunk.position.y=h/2; trunk.rotation.z=(Math.random()-.5)*.5; g.add(trunk);
    for(let b=0;b<4+Math.floor(Math.random()*4);b++){
      const ba=Math.random()*Math.PI*2,bl=(.5+Math.random()*1.2)*s;
      const br=new THREE.Mesh(new THREE.CylinderGeometry(.02,.05,bl,4),new THREE.MeshLambertMaterial({color:0x4a2808}));
      br.rotation.z=Math.PI/2*(.3+Math.random()*.7); br.rotation.y=ba;
      br.position.set(Math.cos(ba)*bl*.3,(1.2+Math.random())*s,Math.sin(ba)*bl*.3); g.add(br);
    }
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
}

function buildPantanalVeg(){
  // Buritis / Palmeiras
  for(let i=0;i<45;i++){
    const a=Math.random()*Math.PI*2,d=5+Math.random()*75;
    const s=.8+Math.random()*.9,g=new THREE.Group();
    const h=(6+Math.random()*8)*s;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2*s,.28*s,h,8),new THREE.MeshLambertMaterial({color:0x6a4520}));
    trunk.position.y=h/2; trunk.castShadow=true; g.add(trunk);
    for(let l=0;l<7+Math.floor(Math.random()*4);l++){
      const la=(l/10)*Math.PI*2,ll=(2.5+Math.random()*2)*s;
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(.3,.08,ll),new THREE.MeshLambertMaterial({color:0x2a7a1a}));
      leaf.position.set(Math.cos(la)*ll*.4,h+.2,Math.sin(la)*ll*.4);
      leaf.rotation.y=la; leaf.rotation.z=-(0.3+Math.random()*.4); g.add(leaf);
    }
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
  // Camalotes (folhas flutuantes)
  const lm=new THREE.MeshLambertMaterial({color:0x2a7a18});
  for(let i=0;i<25;i++){
    const l=new THREE.Mesh(new THREE.CylinderGeometry(.7+Math.random()*.6,.7+Math.random()*.6,.1,10),lm);
    l.position.set(10+Math.random()*30,.1,-25-Math.random()*20); scene.add(l);
  }
}

function buildAtlanticaVeg(){
  for(let i=0;i<90;i++){
    const a=Math.random()*Math.PI*2,d=5+Math.random()*85;
    const s=.7+Math.random()*1.1,g=new THREE.Group();
    const h=(5+Math.random()*12)*s;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2*s,.38*s,h,8),new THREE.MeshLambertMaterial({color:0x2a1206}));
    trunk.position.y=h/2; trunk.castShadow=true; g.add(trunk);
    const cr=(2+Math.random()*3)*s;
    const cap=new THREE.Mesh(new THREE.SphereGeometry(cr,9,7),new THREE.MeshLambertMaterial({color:new THREE.Color(0x1a5210).lerp(new THREE.Color(0x0a2a08),Math.random())}));
    cap.position.y=h+cr*.5; cap.castShadow=true; g.add(cap);
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
  // Bambus
  for(let i=0;i<25;i++){
    const a=Math.random()*Math.PI*2,d=5+Math.random()*50,g=new THREE.Group();
    for(let st=0;st<3+Math.floor(Math.random()*5);st++){
      const bh=4+Math.random()*6;
      const bam=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,bh,6),new THREE.MeshLambertMaterial({color:0x4a8a20}));
      bam.position.set((Math.random()-.5)*1.5,bh/2,(Math.random()-.5)*1.5);
      bam.rotation.z=(Math.random()-.5)*.2; g.add(bam);
    }
    g.position.set(Math.cos(a)*d,0,Math.sin(a)*d); scene.add(g);
  }
  // Bromélias
  for(let i=0;i<80;i++){
    const a=Math.random()*Math.PI*2,d=3+Math.random()*50;
    const br=new THREE.Mesh(new THREE.ConeGeometry(.5+Math.random()*.6,.8+Math.random(),6),new THREE.MeshLambertMaterial({color:0x3a7a10}));
    br.position.set(Math.cos(a)*d,.3,Math.sin(a)*d); br.rotation.z=Math.random()*.4; scene.add(br);
  }
}

function buildPampaVeg(){
  // Gramíneas baixas e densas — campo aberto
  for(let i=0;i<400;i++){
    const a=Math.random()*Math.PI*2,d=1+Math.random()*90;
    const h=.2+Math.random()*.7;
    const gr=new THREE.Mesh(new THREE.CylinderGeometry(.02,.05,h,4),new THREE.MeshLambertMaterial({color:new THREE.Color(0x7a9030).lerp(new THREE.Color(0x9aaa40),Math.random())}));
    gr.position.set(Math.cos(a)*d,h/2,Math.sin(a)*d); gr.rotation.z=(Math.random()-.5)*.5; scene.add(gr);
  }
  // Mata ciliar (única área com árvores)
  for(let i=0;i<20;i++){
    const g=new THREE.Group();
    const h=4+Math.random()*6;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.15,.25,h,7),new THREE.MeshLambertMaterial({color:0x3a1e08}));
    trunk.position.y=h/2; trunk.castShadow=true; g.add(trunk);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(2+Math.random()*1.5,8,6),new THREE.MeshLambertMaterial({color:0x2a5a10}));
    cap.position.y=h+1.5; g.add(cap);
    g.position.set(20+Math.random()*8,0,(Math.random()-.5)*60); scene.add(g);
  }
}

// ── Água extra ────────────────────────────────────
function buildWater(id){
  // Já construído dentro do buildGround — mantido por compatibilidade
}

// ── Animais interativos ───────────────────────────
function buildAnimals(biomeId){
  const b=BIOMES[biomeId];
  const entities=[...(b.animals||[]),...(b.plants||[])];
  entities.forEach(e=>{
    const mesh=createCreatureMesh(e);
    mesh.position.set(e.pos[0],e.pos[1]||0,e.pos[2]);
    scene.add(mesh);
    interactables.push({position:mesh.position.clone().add(new THREE.Vector3(0,2,0)),entity:e});
    animals.push({mesh,entity:e,baseY:e.pos[1]||0});
  });
}

function createCreatureMesh(e){
  const g=new THREE.Group();
  const sc={ameacado:0xff8c00,critico:0xff2020,ok:0x44cc44};
  const col=sc[e.status]||0x88aacc;
  const mat=()=>new THREE.MeshLambertMaterial({color:col});
  const n=e.name.toLowerCase();

  if(n.includes('onça')||n.includes('jaguatirica')||n.includes('parda')||n.includes('graxaim')||n.includes('lobo')){
    // Felino/canídeo
    const body=new THREE.Mesh(new THREE.SphereGeometry(.55,8,6),mat()); body.scale.set(1.6,.9,1); body.position.set(0,.7,0); body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6),mat()); head.position.set(.85,.95,0); g.add(head);
    [-.15,.15].forEach(z=>{const e=new THREE.Mesh(new THREE.ConeGeometry(.09,.2,4),mat());e.position.set(.88,1.26,z);g.add(e);});
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.04,.07,1.1,6),mat()); tail.rotation.z=Math.PI/3; tail.position.set(-.9,.9,0); g.add(tail);
    [[-.3,0,.25],[-.3,0,-.25],[.3,0,.25],[.3,0,-.25]].forEach(p=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,.5,6),mat());leg.position.set(p[0],.25,p[2]);g.add(leg);});
  } else if(n.includes('arara')||n.includes('sabiá')||n.includes('asa')||n.includes('tuiuiú')){
    // Ave
    const body=new THREE.Mesh(new THREE.SphereGeometry(.38,8,6),mat()); body.scale.set(1.3,1,1); body.position.set(0,1.6,0); body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.22,7,5),mat()); head.position.set(.44,1.94,0); g.add(head);
    const beak=new THREE.Mesh(new THREE.ConeGeometry(.06,.32,5),new THREE.MeshLambertMaterial({color:0xffcc00})); beak.rotation.z=-Math.PI/2; beak.position.set(.78,1.94,0); g.add(beak);
    [-.1,.1].forEach(z=>{const w=new THREE.Mesh(new THREE.BoxGeometry(.75,.07,.42),mat());w.position.set(0,1.63,z*.55);w.rotation.z=z*3;g.add(w);});
  } else if(n.includes('ema')){
    // Ema — grande, pescoço longo
    const body=new THREE.Mesh(new THREE.SphereGeometry(.7,8,6),mat()); body.scale.set(1,1.2,1); body.position.set(0,1.1,0); body.castShadow=true; g.add(body);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,1.2,6),mat()); neck.position.set(0,2.1,0); g.add(neck);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.22,7,5),mat()); head.position.set(0,2.8,.1); g.add(head);
    [.25,-.25].forEach(x=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.9,5),mat());leg.position.set(x,.45,0);g.add(leg);});
  } else if(n.includes('macaco')||n.includes('mico')){
    // Primata
    const body=new THREE.Mesh(new THREE.SphereGeometry(.42,8,6),mat()); body.position.set(0,1.6,0); body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.3,8,6),mat()); head.position.set(0,2.18,0); g.add(head);
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.04,.06,1.4,5),mat()); tail.rotation.z=Math.PI/4; tail.position.set(-.6,1.2,.3); g.add(tail);
    [1,-1].forEach(s=>{const arm=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,.9,5),mat());arm.rotation.z=s*Math.PI/2.2;arm.position.set(s*.55,1.65,0);g.add(arm);});
  } else if(n.includes('jacaré')){
    // Jacaré
    const body=new THREE.Mesh(new THREE.SphereGeometry(.55,8,6),mat()); body.scale.set(2.2,.55,.9); body.position.set(0,.35,0); body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.38,8,6),mat()); head.scale.set(1.8,.45,.95); head.position.set(1.3,.38,0); g.add(head);
    [.18,-.18].forEach(z=>{const eye=new THREE.Mesh(new THREE.SphereGeometry(.07,6,5),new THREE.MeshLambertMaterial({color:0xffff00}));eye.position.set(1.05,.55,z);g.add(eye);});
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.25,1.5,7),mat()); tail.rotation.z=Math.PI/2; tail.position.set(-1.5,.35,0); g.add(tail);
  } else if(n.includes('boto')){
    // Boto
    const body=new THREE.Mesh(new THREE.SphereGeometry(.55,10,8),mat()); body.scale.set(2.8,.75,.85); body.position.set(0,.6,0); body.castShadow=true; g.add(body);
    const snout=new THREE.Mesh(new THREE.ConeGeometry(.15,.8,8),mat()); snout.rotation.z=-Math.PI/2; snout.position.set(1.55,.62,0); g.add(snout);
    const dorsal=new THREE.Mesh(new THREE.ConeGeometry(.1,.55,5),mat()); dorsal.position.set(0,1.1,0); g.add(dorsal);
  } else if(n.includes('capivara')||n.includes('preá')){
    // Roedor
    const body=new THREE.Mesh(new THREE.SphereGeometry(.55,8,6),mat()); body.scale.set(1.5,1,1); body.position.set(0,.75,0); body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.32,8,6),mat()); head.position.set(.92,1.1,0); g.add(head);
    [[-.35,0,.28],[-.35,0,-.28],[.35,0,.28],[.35,0,-.28]].forEach(p=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,.55,6),mat());leg.position.set(p[0],.28,p[2]);g.add(leg);});
  } else if(n.includes('veado')){
    // Veado
    const body=new THREE.Mesh(new THREE.SphereGeometry(.55,8,6),mat()); body.scale.set(1.5,1,1); body.position.set(0,1.1,0); body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.3,8,6),mat()); head.position.set(1.05,2.15,0); g.add(head);
    [-.12,.12].forEach(z=>{const ant=new THREE.Mesh(new THREE.CylinderGeometry(.03,.05,.6,4),mat());ant.position.set(1.05,2.55,z);ant.rotation.z=z*3;g.add(ant);});
    [[-.35,0,.28],[-.35,0,-.28],[.35,0,.28],[.35,0,-.28]].forEach(p=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,1,6),mat());leg.position.set(p[0],.5,p[2]);g.add(leg);});
  } else {
    // Planta / genérico
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.07,.12,1.8,7),mat()); stem.position.y=.9; g.add(stem);
    const flower=new THREE.Mesh(new THREE.SphereGeometry(.38,8,6),mat()); flower.position.y=2.; flower.scale.y=.6; g.add(flower);
    for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;const p=new THREE.Mesh(new THREE.SphereGeometry(.18,6,4),new THREE.MeshLambertMaterial({color:new THREE.Color(col).lerp(new THREE.Color(0xffffff),.45)}));p.scale.set(.5,.3,1.2);p.position.set(Math.cos(a)*.42,2.,Math.sin(a)*.42);g.add(p);}
  }

  // Aura pulsante
  const aura=new THREE.Mesh(new THREE.RingGeometry(1.,1.3,20),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.3,side:THREE.DoubleSide}));
  aura.rotation.x=-Math.PI/2; aura.position.y=.05; g.add(aura); g.userData.aura=aura;
  // Label flutuante
  const lbl=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),new THREE.MeshBasicMaterial({color:col}));
  lbl.position.y=3.5; g.add(lbl); g.userData.label=lbl;
  return g;
}

// ── Clima ─────────────────────────────────────────
function buildWeather(type){
  if(weatherParticles){scene.remove(weatherParticles);weatherParticles=null;}
  if(type==='none'||type==='wind') return;
  const cfg={rain:{count:4000,color:0x88ccff,size:.07,op:.6},drizzle:{count:1500,color:0xaaddee,size:.05,op:.4},mist:{count:1200,color:0x99aabb,size:1.,op:.12}};
  const c=cfg[type]||cfg.drizzle;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(c.count*3);
  for(let i=0;i<c.count;i++){pos[i*3]=(Math.random()-.5)*100;pos[i*3+1]=Math.random()*35;pos[i*3+2]=(Math.random()-.5)*100;}
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  weatherParticles=new THREE.Points(geo,new THREE.PointsMaterial({color:c.color,size:c.size,transparent:true,opacity:c.op}));
  scene.add(weatherParticles);
}

// ── Placas educativas ─────────────────────────────
function buildSigns(){
  const signs=[
    {pos:[3,0,-8],   color:0x1a6e30,entity:{name:'📋 Placa Informativa',emoji:'📋',info:'Aproxime-se de animais e plantas para aprender sobre eles! Use o botão Interagir ou tecla E.'}},
    {pos:[-5,0,-12], color:0x1a4a8e,entity:{name:'🎯 Quiz Educativo',   emoji:'🎯',info:'Teste seus conhecimentos! Clique em Quiz ou pressione Q.'}},
    {pos:[8,0,-6],   color:0x6e3a1a,entity:{name:'🧑‍🌿 Guia do Bioma', emoji:'🧑‍🌿',info:'O guia tem curiosidades incríveis! Clique em Guia ou pressione G.'}},
  ];
  signs.forEach(s=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,2.8,7),new THREE.MeshLambertMaterial({color:0x5a3010}));
    pole.position.set(s.pos[0],1.4,s.pos[2]); pole.castShadow=true; scene.add(pole);
    const border=new THREE.Mesh(new THREE.BoxGeometry(2.95,1.35,.08),new THREE.MeshLambertMaterial({color:0xf0f0e8}));
    border.position.set(s.pos[0],3.,s.pos[2]); scene.add(border);
    const board=new THREE.Mesh(new THREE.BoxGeometry(2.75,1.15,.12),new THREE.MeshLambertMaterial({color:s.color}));
    board.position.set(s.pos[0],3.,.06+s.pos[2]); scene.add(board);
    const light=new THREE.PointLight(s.color,.8,8);
    light.position.set(s.pos[0],4.5,s.pos[2]); scene.add(light);
    interactables.push({position:new THREE.Vector3(s.pos[0],2.,s.pos[2]),entity:s.entity});
  });
}

// ── Atmosfera especial ────────────────────────────
function buildAtmosphere(id){
  if(id==='caatinga'){
    // Sol escaldante visível
    const sun=new THREE.Mesh(new THREE.CircleGeometry(6,24),new THREE.MeshBasicMaterial({color:0xffe040,transparent:true,opacity:.9}));
    sun.position.set(80,60,-200); sun.lookAt(0,0,0); scene.add(sun);
    const halo=new THREE.Mesh(new THREE.RingGeometry(6,12,24),new THREE.MeshBasicMaterial({color:0xffaa00,transparent:true,opacity:.25,side:THREE.DoubleSide}));
    halo.position.set(80,60,-200); halo.lookAt(0,0,0); scene.add(halo);
  }
  if(id==='amazonia'||id==='mata-atlantica'){
    // God rays (raios de sol entre árvores)
    const rm=new THREE.MeshBasicMaterial({color:0xc8ffb0,transparent:true,opacity:.05,side:THREE.DoubleSide});
    for(let i=0;i<8;i++){
      const a=Math.random()*Math.PI*2,d=5+Math.random()*20;
      const ray=new THREE.Mesh(new THREE.CylinderGeometry(.3,1.5,14,5,1,true),rm);
      ray.position.set(Math.cos(a)*d,7,Math.sin(a)*d); ray.rotation.y=a; scene.add(ray);
    }
  }
  if(id==='pampa'){
    // Nuvens volumétricas
    const cm=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.75});
    for(let i=0;i<12;i++){
      const cg=new THREE.Group();
      for(let b=0;b<3+Math.floor(Math.random()*4);b++){
        const r=4+Math.random()*6;
        const bl=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),cm);
        bl.position.set((Math.random()-.5)*12,(Math.random()-.5)*3,(Math.random()-.5)*8); cg.add(bl);
      }
      const a=Math.random()*Math.PI*2,d=40+Math.random()*120;
      cg.position.set(Math.cos(a)*d,25+Math.random()*20,Math.sin(a)*d); scene.add(cg);
    }
  }
  if(id==='pantanal'){
    // Névoa sobre a água
    const mm=new THREE.MeshBasicMaterial({color:0xc8e0f0,transparent:true,opacity:.1,side:THREE.DoubleSide});
    for(let i=0;i<6;i++){
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(25+Math.random()*20,12+Math.random()*10),mm);
      mist.rotation.x=-Math.PI/2; mist.position.set(10+Math.random()*20,.4+Math.random()*.6,-30-Math.random()*20); scene.add(mist);
    }
  }
}

// ── Áudio procedural ─────────────────────────────
function startAmbientAudio(freq,weather){
  stopAudio();
  try{
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const add=(f,v,t='sine')=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(audioCtx.destination);o.start();audioNodes.push(o,g);};
    add(freq*.25,.03); add(freq*.375,.01); add(freq*.5,.008);
    if(weather==='rain'||weather==='drizzle'){
      const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);
      const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*.3;
      const src=audioCtx.createBufferSource(),ng=audioCtx.createGain();
      src.buffer=buf; src.loop=true; ng.gain.value=weather==='rain'?.15:.07;
      src.connect(ng); ng.connect(audioCtx.destination); src.start(); audioNodes.push(src,ng);
    }
    if(weather==='wind'){
      const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);
      const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*.15;
      const src=audioCtx.createBufferSource(),wg=audioCtx.createGain();
      src.buffer=buf; src.loop=true; wg.gain.value=.12;
      src.connect(wg); wg.connect(audioCtx.destination); src.start(); audioNodes.push(src,wg);
    }
  }catch(e){console.warn('Audio error',e);}
}
function stopAudio(){
  audioNodes.forEach(n=>{try{n.stop&&n.stop();n.disconnect&&n.disconnect();}catch(e){}});
  audioNodes=[];
  if(audioCtx){try{audioCtx.close();}catch(e){} audioCtx=null;}
}

// ── Controles ─────────────────────────────────────
function setupControls(){
  document.addEventListener('keydown',onKeyDown);
  document.addEventListener('keyup',onKeyUp);
  const cv=document.getElementById('game-canvas');
  cv.addEventListener('mousedown',e=>{if(e.button===2){isRightMouseDown=true;lastMouseX=e.clientX;lastMouseY=e.clientY;cv.style.cursor='grabbing';}});
  document.addEventListener('mouseup',e=>{if(e.button===2){isRightMouseDown=false;document.getElementById('game-canvas').style.cursor='crosshair';}});
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('mousemove',onMouseMove);
  document.addEventListener('touchstart',onTouchStart,{passive:false});
  document.addEventListener('touchmove',onTouchMove,{passive:false});
  document.addEventListener('touchend',onTouchEnd,{passive:false});
}

function onKeyDown(e){
  if(!document.getElementById('screen-game').classList.contains('active')) return;
  switch(e.code){
    case'KeyW':case'ArrowUp':    moveForward=true; break;
    case'KeyS':case'ArrowDown':  moveBack=true;    break;
    case'KeyA':case'ArrowLeft':  moveLeft=true;    break;
    case'KeyD':case'ArrowRight': moveRight=true;   break;
    case'KeyE': interact();  break;
    case'KeyQ': showQuiz();  break;
    case'KeyG': showGuide(); break;
    case'Escape': closeAllPanels(); break;
    case'KeyF': toggleDeforestation(); break;
  }
}
function onKeyUp(e){
  switch(e.code){
    case'KeyW':case'ArrowUp':    moveForward=false; break;
    case'KeyS':case'ArrowDown':  moveBack=false;    break;
    case'KeyA':case'ArrowLeft':  moveLeft=false;    break;
    case'KeyD':case'ArrowRight': moveRight=false;   break;
  }
}
function onMouseMove(e){
  if(!isRightMouseDown||!camera) return;
  yaw  -=(e.clientX-lastMouseX)*.003;
  pitch =Math.max(-Math.PI/3,Math.min(Math.PI/3,pitch-(e.clientY-lastMouseY)*.003));
  lastMouseX=e.clientX; lastMouseY=e.clientY;
}

let tStart=null,tLook=null;
function onTouchStart(e){
  if(e.touches.length>=1) tStart={x:e.touches[0].clientX,y:e.touches[0].clientY,id:e.touches[0].identifier};
  if(e.touches.length>=2) tLook={x:e.touches[1].clientX,y:e.touches[1].clientY,id:e.touches[1].identifier};
}
function onTouchMove(e){
  e.preventDefault();
  for(const t of e.changedTouches){
    if(tStart&&t.identifier===tStart.id){
      const dx=t.clientX-tStart.x,dy=t.clientY-tStart.y,dead=12;
      moveForward=dy<-dead; moveBack=dy>dead; moveLeft=dx<-dead; moveRight=dx>dead;
    }
    if(tLook&&t.identifier===tLook.id){
      yaw-=(t.clientX-tLook.x)*.004;
      pitch=Math.max(-Math.PI/3,Math.min(Math.PI/3,pitch-(t.clientY-tLook.y)*.004));
      tLook={x:t.clientX,y:t.clientY,id:t.identifier};
    }
  }
}
function onTouchEnd(e){
  for(const t of e.changedTouches){
    if(tStart&&t.identifier===tStart.id){tStart=null;moveForward=moveBack=moveLeft=moveRight=false;}
    if(tLook&&t.identifier===tLook.id) tLook=null;
  }
}

// ── Loop de animação ──────────────────────────────
function animate(){
  animationFrameId=requestAnimationFrame(animate);
  if(!scene||!camera||!renderer||!clock) return;
  const delta=clock.getDelta(),elapsed=clock.getElapsedTime();

  // Movimento + Camera Bobbing
  isMoving = moveForward||moveBack||moveLeft||moveRight;
  if(isMoving){
    const spd=6;
    const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const rgt=new THREE.Vector3( Math.cos(yaw),0,-Math.sin(yaw));
    if(moveForward) camera.position.addScaledVector(fwd, spd*delta);
    if(moveBack)    camera.position.addScaledVector(fwd,-spd*delta);
    if(moveLeft)    camera.position.addScaledVector(rgt,-spd*delta);
    if(moveRight)   camera.position.addScaledVector(rgt, spd*delta);
    // Bobbing: balanço natural ao caminhar
    bobbingTime += delta * 9;
    const bobY = Math.sin(bobbingTime) * 0.055;
    const bobX = Math.sin(bobbingTime * 0.5) * 0.018;
    camera.position.y = bobbingBase + bobY;
    // Leve inclinação lateral ao andar
    camera.rotation.z = bobX;
  } else {
    // Volta suavemente à posição base
    bobbingTime *= 0.9;
    camera.position.y += (bobbingBase - camera.position.y) * 0.12;
    camera.rotation.z *= 0.85;
  }
  camera.rotation.order='YXZ';
  camera.rotation.y=yaw;
  camera.rotation.x=pitch;

  // Ciclo dia/noite
  dayTime=(dayTime+delta*.008)%1;
  const angle=dayTime*Math.PI*2;
  const sun=scene.userData.sun;
  if(sun){
    sun.position.set(Math.cos(angle)*100,Math.sin(angle)*80,30);
    sun.intensity=Math.max(0,Math.sin(angle))*1.8;
  }
  const sk=scene.userData.skyMat;
  if(sk) sk.uniforms.dayFactor.value=.3+Math.max(0,Math.sin(angle))*.7;
  if(scene.userData.ambient) scene.userData.ambient.intensity=.3+Math.max(0,Math.sin(angle))*.5;
  const fill=document.getElementById('time-fill');
  if(fill) fill.style.width=(dayTime*100)+'%';
  const icon=document.getElementById('time-icon');
  if(icon) icon.textContent=dayTime>.25&&dayTime<.75?'☀️':'🌙';

  // Animação dos animais
  animals.forEach((a,i)=>{
    if(!a.mesh) return;
    a.mesh.position.y=a.baseY+Math.sin(elapsed*1.2+i*1.3)*.1;
    a.mesh.rotation.y+=delta*.4;
    if(a.mesh.userData.aura) a.mesh.userData.aura.material.opacity=.2+Math.abs(Math.sin(elapsed*1.8+i))*.35;
    if(a.mesh.userData.label) a.mesh.userData.label.position.y=3.5+Math.sin(elapsed*2+i)*.2;
  });

  // Partículas de clima
  if(weatherParticles){
    const pos=weatherParticles.geometry.attributes.position.array;
    const spd=currentBiome==='pantanal'?.02:.18;
    for(let i=1;i<pos.length;i+=3){ pos[i]-=spd; if(pos[i]<-1) pos[i]=35; }
    weatherParticles.geometry.attributes.position.needsUpdate=true;
  }

  // Cachoeira
  if(scene.userData.waterfall){
    scene.userData.waterfall.material.opacity=.55+Math.sin(elapsed*3)*.15;
  }

  // Bússola
  const needle=document.getElementById('compass-needle');
  if(needle) needle.style.transform=`rotate(${-yaw*180/Math.PI}deg)`;

  // Fumaça do desmatamento — sobe e oscila
  if (deforestationMode) {
    deforestationObjects.forEach((obj, i) => {
      if (obj.userData && obj.userData.isSmoke) {
        obj.position.y += delta * 0.3;
        obj.material.opacity = Math.max(0, 0.18 - (obj.position.y - 8) * 0.008);
        if (obj.position.y > 30) obj.position.y = 8;
        obj.rotation.y += delta * 0.1;
      }
    });
  }

  // Proximidade
  checkProximity(elapsed);

  renderer.render(scene,camera);
}

function checkProximity(elapsed){
  if(!camera) return;
  let near=false;
  animals.forEach((a,i)=>{
    if(!a.mesh) return;
    const dist=camera.position.distanceTo(a.mesh.position);
    if(dist<5&&!discoveredSpecies.has(a.entity.name)){
      discoveredSpecies.add(a.entity.name);
      showDiscovery(a.entity);
    }
    if(dist<7) near=true;
  });
  const btns=document.getElementById('action-buttons');
  if(btns) btns.classList.toggle('near-entity',near);
  const cross=document.getElementById('crosshair');
  if(cross){cross.textContent=near?'◎':'+';cross.style.color=near?'#4caf50':'rgba(255,255,255,0.75)';}
}

function showDiscovery(entity){
  const pop=document.getElementById('discovery-popup');
  document.getElementById('discovery-emoji').textContent=entity.emoji;
  document.getElementById('discovery-text').textContent=`Você descobriu: ${entity.name}!`;
  pop.classList.remove('hidden');
  setTimeout(()=>pop.classList.add('hidden'),3000);
  playerScore+=10;
}

// ── Interação ─────────────────────────────────────
function interact(){
  if(!camera||!interactables.length) return;
  let closest=null,minD=9;
  interactables.forEach(item=>{
    const d=camera.position.distanceTo(item.position);
    if(d<minD){minD=d;closest=item;}
  });
  if(closest) showInfoPanel(closest.entity);
}

function showInfoPanel(entity){
  const p=document.getElementById('info-panel');
  document.getElementById('info-emoji').textContent=entity.emoji||'🌿';
  document.getElementById('info-title').textContent=entity.name;
  document.getElementById('info-text').textContent=entity.info;
  const st=document.getElementById('info-status');
  if(entity.status){
    const lbl={ok:'✅ Estável',ameacado:'⚠️ Ameaçado',critico:'🔴 Em perigo crítico'};
    st.textContent=lbl[entity.status]||'';
    st.className='status-'+entity.status;
    st.style.display='block';
  }else{st.style.display='none';}
  p.classList.remove('hidden');
}
function closePanel(){ document.getElementById('info-panel').classList.add('hidden'); }

// ── Quiz ──────────────────────────────────────────
let curQuiz=null;
function showQuiz(){
  const b=BIOMES[currentBiome];
  if(!b||!b.quiz||!b.quiz.length) return;
  curQuiz=b.quiz[Math.floor(Math.random()*b.quiz.length)];
  const p=document.getElementById('quiz-panel');
  document.getElementById('quiz-question').textContent=curQuiz.q;
  const opts=document.getElementById('quiz-options');
  opts.innerHTML='';
  document.getElementById('quiz-result').textContent='';
  curQuiz.opts.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.className='quiz-opt'; btn.textContent=opt;
    btn.onclick=()=>answerQuiz(i,btn); opts.appendChild(btn);
  });
  p.classList.remove('hidden');
  setTimeout(()=>p.classList.add('hidden'),25000);
}
function answerQuiz(idx,btn){
  document.querySelectorAll('.quiz-opt').forEach(o=>o.disabled=true);
  document.querySelectorAll('.quiz-opt')[curQuiz.a].classList.add('correct');
  if(idx!==curQuiz.a) btn.classList.add('wrong');
  const r=document.getElementById('quiz-result');
  r.textContent=idx===curQuiz.a?`🎉 Correto! ${curQuiz.exp}`:`❌ Errado. ${curQuiz.exp}`;
  r.style.color=idx===curQuiz.a?'#81c784':'#ef9a9a';
  if(idx===curQuiz.a) playerScore+=20;
  setTimeout(()=>document.getElementById('quiz-panel').classList.add('hidden'),6000);
}

// ── Guia ──────────────────────────────────────────
function showGuide(){
  const b=BIOMES[currentBiome];
  if(!b||!b.guide) return;
  const bubble=document.getElementById('guide-bubble');
  document.getElementById('guide-message').textContent=b.guide[guideIndex%b.guide.length];
  bubble.classList.remove('hidden');
}
function nextGuideMessage(){
  guideIndex++;
  const b=BIOMES[currentBiome];
  if(!b) return;
  if(guideIndex>=b.guide.length){
    document.getElementById('guide-bubble').classList.add('hidden');
    guideIndex=0;
    showImpact();
  } else {
    document.getElementById('guide-message').textContent=b.guide[guideIndex];
  }
}
function showImpact(){
  const msgs={
    amazonia:'Cada minuto, área equivalente a 3 campos de futebol é desmatada na Amazônia. Apoie organizações de conservação!',
    cerrado:'O Cerrado é responsável por 43% da água doce do Brasil. Protegê-lo é garantir o futuro da água potável.',
    caatinga:'A Caatinga é o único bioma exclusivo do Brasil. 15 milhões de pessoas dependem dela diretamente.',
    pantanal:'Em 2020, 30% do Pantanal queimou em meses. A recuperação leva décadas. A natureza precisa de nós!',
    'mata-atlantica':'Restam menos de 12% da Mata Atlântica. Plantar árvores nativas é uma das melhores ações que você pode tomar.',
    pampa:'O Pampa tem só 0,4% de proteção legal. É o bioma menos protegido do Brasil. Conhecer é o primeiro passo!',
  };
  document.getElementById('impact-text').textContent=msgs[currentBiome]||'Todos os biomas precisam de proteção!';
  showScreen('screen-impact');
}

function closeAllPanels(){
  ['info-panel','quiz-panel','guide-bubble'].forEach(id=>document.getElementById(id).classList.add('hidden'));
}

// ── VR ────────────────────────────────────────────
let vrReticle = null; // mira no centro para VR
let vrControllers = [];

async function enterVR(){
  if(!navigator.xr){
    showVRFallback();
    return;
  }
  try{
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    if(!ok){ showVRFallback(); return; }

    vrSession = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor','bounded-floor','hand-tracking']
    });

    renderer.xr.enabled = true;
    await renderer.xr.setSession(vrSession);

    // Reticle (mira VR no centro)
    buildVRReticle();

    // Controladores VR
    setupVRControllers();

    // Badge VR ativo
    const badge = document.createElement('div');
    badge.className = 'vr-active-badge';
    badge.id = 'vr-active-badge';
    badge.textContent = '🥽 Modo VR Ativo — Use os controles do headset para mover';
    document.body.appendChild(badge);

    const btn = document.getElementById('vr-btn');
    if(btn){ btn.textContent = '🥽 Sair VR'; btn.onclick = exitVR; }

    vrSession.addEventListener('end', exitVR);

    console.log('VR session started');
  } catch(e) {
    console.error('VR error:', e);
    showVRFallback(e.message);
  }
}

function showVRFallback(msg) {
  const m = msg || 'WebXR não disponível';
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.92);border:1px solid rgba(124,77,255,0.4);
    border-radius:20px;padding:36px 40px;text-align:center;
    color:#fff;font-family:'Outfit',sans-serif;z-index:500;max-width:440px;
  `;
  div.innerHTML = `
    <div style="font-size:3rem;margin-bottom:16px">🥽</div>
    <h3 style="font-size:1.3rem;margin-bottom:12px;color:#b39ddb">Modo VR</h3>
    <p style="color:rgba(255,255,255,0.65);font-size:0.9rem;line-height:1.7;margin-bottom:20px">
      Para usar o modo VR, abra este link <strong>diretamente no navegador do seu headset</strong>
      (Meta Browser, Firefox Reality, Wolvic) e clique em 🥽 VR.<br><br>
      <small style="color:rgba(255,255,255,0.4)">${m}</small>
    </p>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <button onclick="this.parentElement.parentElement.remove()" style="
        background:#4caf50;border:none;color:#fff;padding:10px 24px;
        border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;font-weight:600">
        Continuar no PC
      </button>
    </div>
  `;
  document.body.appendChild(div);
}

function buildVRReticle() {
  if(vrReticle){ scene.remove(vrReticle); }
  const geo = new THREE.RingGeometry(0.02, 0.04, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true, side: THREE.DoubleSide });
  vrReticle = new THREE.Mesh(geo, mat);
  vrReticle.position.set(0, 0, -2); // 2m à frente
  vrReticle.rotation.x = -Math.PI / 2;
  camera.add(vrReticle); // segue a câmera (olhar)
  scene.add(camera);
}

function setupVRControllers() {
  vrControllers = [];
  [0, 1].forEach(i => {
    const ctrl = renderer.xr.getController(i);
    ctrl.addEventListener('selectstart', onVRSelect);
    ctrl.addEventListener('squeezestart', onVRSqueeze);
    scene.add(ctrl);

    // Mão/ray visual
    const ray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.5, 8),
      new THREE.MeshBasicMaterial({ color: 0x4caf50, opacity: 0.6, transparent: true })
    );
    ray.rotation.x = Math.PI / 2;
    ray.position.z = -0.25;
    ctrl.add(ray);

    // Dot na ponta
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    dot.position.z = -0.5;
    ctrl.add(dot);

    vrControllers.push(ctrl);
  });
}

function onVRSelect() {
  // Trigger = interagir com o que estiver na mira
  interact();
}
function onVRSqueeze() {
  // Squeeze = abrir guia
  showGuide();
}

function exitVR(){
  if(vrSession){ try{ vrSession.end(); }catch(e){} vrSession = null; }
  if(renderer) renderer.xr.enabled = false;
  vrControllers.forEach(c => scene.remove(c));
  vrControllers = [];
  if(vrReticle){ camera.remove(vrReticle); vrReticle = null; }

  const badge = document.getElementById('vr-active-badge');
  if(badge) badge.remove();

  const btn = document.getElementById('vr-btn');
  if(btn){ btn.textContent = '🥽 VR'; btn.onclick = enterVR; }
}

// ── Modo Desmatamento ────────────────────────────
function toggleDeforestation() {
  deforestationMode = !deforestationMode;
  const btn = document.getElementById('deforest-btn');

  if (deforestationMode) {
    applyDeforestation();
    if (btn) {
      btn.textContent = '🌳 Restaurar Bioma';
      btn.style.background = 'rgba(76,175,80,0.3)';
      btn.style.borderColor = 'rgba(76,175,80,0.6)';
    }
    showDeforestPanel();
  } else {
    restoreBiome();
    if (btn) {
      btn.textContent = '⚠️ Ver Desmatamento';
      btn.style.background = 'rgba(244,67,54,0.2)';
      btn.style.borderColor = 'rgba(244,67,54,0.4)';
    }
    hideDeforestPanel();
  }
}

function applyDeforestation() {
  // 1. Esconde animais ameaçados e em perigo
  animals.forEach(a => {
    if (!a.mesh) return;
    if (a.entity.status === 'ameacado' || a.entity.status === 'critico') {
      a.mesh.visible = false;
      originalObjects.push({ mesh: a.mesh, type: 'animal' });
    }
  });

  // 2. Esconde 70% das árvores aleatoriamente
  scene.children.forEach(obj => {
    if (obj.isGroup && Math.random() < 0.7) {
      obj.visible = false;
      originalObjects.push({ mesh: obj, type: 'tree' });
    }
  });

  // 3. Muda cor do solo para marrom queimado
  scene.children.forEach(obj => {
    if (obj.isMesh && obj.geometry && obj.geometry.type === 'PlaneGeometry') {
      if (!obj.userData.origColor) {
        obj.userData.origColor = obj.material.color.getHex();
        obj.material = obj.material.clone();
        obj.material.color.setHex(0x6b3a1a);
      }
    }
  });

  // 4. Adiciona tocos de árvores cortadas
  const stumpMat = new THREE.MeshLambertMaterial({ color: 0x5a2e08 });
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 5 + Math.random() * 60;
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.4, 0.4 + Math.random() * 0.5, 8),
      stumpMat
    );
    stump.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
    stump.castShadow = true;
    scene.add(stump);
    deforestationObjects.push(stump);
  }

  // 5. Adiciona fumaça preta (queimada)
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 50;
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 5, 8, 6), smokeMat);
    smoke.position.set(Math.cos(a) * d, 8 + Math.random() * 12, Math.sin(a) * d);
    smoke.scale.y = 2.5;
    scene.add(smoke);
    deforestationObjects.push(smoke);
    smoke.userData.isSmoke = true;
  }

  // 6. Aumenta névoa (fumaça no ar)
  if (scene.fog) {
    scene.userData.origFogNear = scene.fog.near;
    scene.userData.origFogFar  = scene.fog.far;
    scene.userData.origFogColor = scene.fog.color.getHex();
    scene.fog.near  = 15;
    scene.fog.far   = 60;
    scene.fog.color.setHex(0x665533);
  }

  // 7. Muda céu para cinza fumacento
  if (scene.userData.skyMat) {
    scene.userData.skyMat.uniforms.dayFactor.value = 0.4;
    scene.userData.skyMat.uniforms.topColor.value.setHex(0x444433);
    scene.userData.skyMat.uniforms.botColor.value.setHex(0x886644);
  }
}

function restoreBiome() {
  // Remove objetos adicionados
  deforestationObjects.forEach(obj => scene.remove(obj));
  deforestationObjects = [];

  // Restaura visibilidade
  originalObjects.forEach(item => { item.mesh.visible = true; });
  originalObjects = [];

  // Restaura cores do solo
  scene.children.forEach(obj => {
    if (obj.isMesh && obj.userData.origColor !== undefined) {
      obj.material.color.setHex(obj.userData.origColor);
      delete obj.userData.origColor;
    }
  });

  // Restaura névoa
  if (scene.fog && scene.userData.origFogNear !== undefined) {
    scene.fog.near  = scene.userData.origFogNear;
    scene.fog.far   = scene.userData.origFogFar;
    scene.fog.color.setHex(scene.userData.origFogColor);
  }

  // Restaura céu
  const b = BIOMES[currentBiome];
  if (scene.userData.skyMat && b) {
    scene.userData.skyMat.uniforms.topColor.value.setHex(b.skyTop);
    scene.userData.skyMat.uniforms.botColor.value.setHex(b.skyBot);
    scene.userData.skyMat.uniforms.dayFactor.value = 0.7;
  }
}

function showDeforestPanel() {
  let panel = document.getElementById('deforest-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'deforest-panel';
    document.getElementById('screen-game').appendChild(panel);
  }

  const msgs = {
    amazonia:      { pct: '20%', animals: '40% das espécies desapareceram', soil: 'Solo exposto à erosão intensa', air: 'Emissões de CO₂ aumentaram 300%' },
    cerrado:       { pct: '53%', animals: 'Lobo-guará perdeu 60% do habitat', soil: 'Riachos e nascentes secaram', air: 'Temperatura local subiu 3°C' },
    caatinga:      { pct: '46%', animals: 'Onça-parda quase desapareceu', soil: 'Desertificação avança 2km/ano', air: 'Seca se intensificou' },
    pantanal:      { pct: '30%', animals: 'Jacarés migraram dos lagos secos', soil: 'Lagos reduziram 40% do volume', air: 'Fumaça cobriu 800km' },
    'mata-atlantica': { pct: '88%', animals: 'Mico-leão chegou a 200 indivíduos', soil: 'Deslizamentos se multiplicaram', air: 'Chuvas reduziram 25%' },
    pampa:         { pct: '54%', animals: 'Veado-campeiro perdeu 70% do habitat', soil: 'Erosão do solo avançou', air: 'Ventos se intensificaram' },
  };
  const m = msgs[currentBiome] || msgs.amazonia;

  panel.innerHTML = `
    <div class="df-header">
      <span class="df-icon">⚠️</span>
      <span>Impacto do Desmatamento</span>
    </div>
    <div class="df-stat"><span class="df-label">Área destruída</span><span class="df-val red">${m.pct} do bioma</span></div>
    <div class="df-stat"><span class="df-label">🐾 Fauna</span><span class="df-val">${m.animals}</span></div>
    <div class="df-stat"><span class="df-label">🌍 Solo</span><span class="df-val">${m.soil}</span></div>
    <div class="df-stat"><span class="df-label">💨 Clima</span><span class="df-val">${m.air}</span></div>
    <p class="df-cta">Clique em "Restaurar Bioma" para ver como seria com preservação.</p>
  `;
  panel.classList.remove('hidden');

  // Banner no topo
  let banner = document.getElementById('deforest-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'deforest-banner';
    document.getElementById('screen-game').appendChild(banner);
  }
  banner.textContent = '⚠️ Visualizando impacto do desmatamento — F para restaurar';
  banner.style.display = 'block';

  // Borda vermelha
  document.getElementById('screen-game').classList.add('deforest-active');
}

function hideDeforestPanel() {
  const panel = document.getElementById('deforest-panel');
  if (panel) panel.classList.add('hidden');
  const banner = document.getElementById('deforest-banner');
  if (banner) banner.style.display = 'none';
  document.getElementById('screen-game').classList.remove('deforest-active');
}

function buildDeforestButton() {
  // Remove existing if any
  const existing = document.getElementById('deforest-btn');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'deforest-btn';
  btn.className = 'action-btn deforest-action';
  btn.title = 'Ver o impacto do desmatamento (D)';
  btn.innerHTML = '<span class="action-icon">⚠️</span><span class="action-label">Ver Desmatamento</span>';
  btn.onclick = toggleDeforestation;
  btn.style.background = 'rgba(244,67,54,0.2)';
  btn.style.borderColor = 'rgba(244,67,54,0.4)';

  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) actionButtons.appendChild(btn);
}

function onResize(){
  if(!camera||!renderer) return;
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const s=document.getElementById(id);
  if(s) s.classList.add('active');
}
 
function init(){
  // Configurações iniciais
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.1,1000);
  renderer=new THREE.WebGLRenderer({canvas:document.getElementById('game-canvas'),antialias:true});
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  clock=new THREE.Clock();

  // Luz ambiente
  const ambient=new THREE.AmbientLight(0xffffff,0.5);
  scene.add(ambient);
  scene.userData.ambient=ambient;

  // Luz direcional (sol)
  const sun=new THREE.DirectionalLight(0xffffff,1.8);
  sun.position.set(100,80,30);
  sun.castShadow=true;
  sun.shadow.mapSize.width=1024;
  sun.shadow.mapSize.height=1024;
  sun.shadow.camera.near=0.5;
  sun.shadow.camera.far=200;
  sun.shadow.camera.left=-50;
  sun.shadow.camera.right=50;
  sun.shadow.camera.top=50;
  sun.shadow.camera.bottom=-50;
  scene.add(sun);
  scene.userData.sun=sun;

  // Fundo do céu
  const skyGeo=new THREE.SphereGeometry(500,32,15);
  const skyMat=new THREE.ShaderMaterial({
    uniforms:{
      topColor:{value:new THREE.Color(0x87ceeb)},
      botColor:{value:new THREE.Color(0xb0e0e6)},
      dayFactor:{value:0.7}
    },
    vertexShader:`
      varying vec3 vPos;
      void main(){
        vPos=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform vec3 topColor;
      uniform vec3 botColor;
      uniform float dayFactor;
      varying vec3 vPos;
      void main(){
        float h=(vPos.y+250.0)/500.0;
        vec3 col=mix(botColor,topColor,h)*dayFactor;
        gl_FragColor=vec4(col,1.0);
      }
    `,
    side:THREE.BackSide
  });
  const sky=new THREE.Mesh(skyGeo,skyMat);
  scene.add(sky);
  scene.userData.skyMat=skyMat;

  // Carrega o bioma inicial
  loadBiome(currentBiome);

  // Controles
  setupControls();

  // Botão de desmatamento
  buildDeforestButton();

  // Animação
  animate();

  // Responsividade
  window.addEventListener('resize',onResize);
} 

window.onloadstart=init;
function onLoadStart(){
  const loader=document.getElementById('loader');
  if(loader) loader.style.display='block';
}
function onLoadComplete(){
  const loader=document.getElementById('loader');
  if(loader) loader.style.display='none';
  showScreen('screen-game');
}
      
function onLoadProgress(progress){
  const loader=document.getElementById('loader');
  if(loader){
    const bar=loader.querySelector('.loader-bar');
    if(bar) bar.style.width=(progress*100)+'%';
  }
} 



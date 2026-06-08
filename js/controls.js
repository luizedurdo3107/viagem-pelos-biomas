// =====================================================
//  VIAGEM PELOS BIOMAS — Controles Completos
//  Touchpad / Teclado / Touch / VR
// =====================================================
'use strict';

// ── Touchpad: clique + arraste com 1 dedo = câmera ──
// Sem pointer lock. Funciona naturalmente com touchpad.
(function initTouchpadCamera() {
  let dragging = false;
  let lastX = 0, lastY = 0;

  // Detecta se é touchpad ou mouse
  // Touchpad envia eventos de mouse normais — tratamos igual
  const cv = () => document.getElementById('game-canvas');

  document.addEventListener('mousedown', e => {
    if (!inGame()) return;
    // Botão esquerdo OU direito iniciam rotação de câmera no canvas
    if ((e.button === 0 || e.button === 2) && e.target === cv()) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      if (cv()) cv().style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    if (cv()) cv().style.cursor = 'crosshair';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging || !inGame() || !camera) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw   -= dx * 0.004;
    pitch  = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch - dy * 0.004));
  });

  // Impede menu de contexto no canvas
  document.addEventListener('contextmenu', e => {
    if (e.target === cv()) e.preventDefault();
  });
})();

// ── Scroll do touchpad / roda do mouse = zoom (ajusta FOV) ──
(function initScrollZoom() {
  document.addEventListener('wheel', e => {
    if (!inGame() || !camera) return;
    e.preventDefault();
    camera.fov = Math.max(40, Math.min(90, camera.fov + e.deltaY * 0.05));
    camera.updateProjectionMatrix();
  }, { passive: false });
})();

// ── Joystick virtual mobile (2 dedos: mover + câmera) ──
(function initMobileJoystick() {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 700;
  if (!isMobile) return;

  const wrap = document.createElement('div');
  wrap.id = 'joystick-wrap';
  wrap.innerHTML = `
    <div id="joy-base"><div id="joy-knob"></div></div>
  `;
  document.body.appendChild(wrap);

  const style = document.createElement('style');
  style.textContent = `
    #joystick-wrap {
      position: fixed; bottom: 24px; left: 24px; z-index: 40;
      touch-action: none; display: none;
    }
    #joystick-wrap.show { display: block; }
    #joy-base {
      width: 100px; height: 100px; border-radius: 50%;
      background: rgba(0,0,0,0.45); border: 2px solid rgba(255,255,255,0.2);
      position: relative; backdrop-filter: blur(10px);
    }
    #joy-knob {
      width: 42px; height: 42px; border-radius: 50%;
      background: rgba(76,175,80,0.85); border: 2px solid rgba(255,255,255,0.4);
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none; transition: transform 0.05s;
    }
  `;
  document.head.appendChild(style);

  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  let activeId = null;
  const MAX_R = 32;

  document.addEventListener('touchstart', e => {
    if (!inGame()) return;
    const t = e.changedTouches[0];
    activeId = t.identifier;
    updateKnob(t.clientX, t.clientY);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!inGame()) return;
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) {
        updateKnob(t.clientX, t.clientY);
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) {
        activeId = null;
        knob.style.transform = 'translate(-50%, -50%)';
        moveForward = moveBack = moveLeft = moveRight = false;
      }
    }
  });

  function updateKnob(cx, cy) {
    const rect = base.getBoundingClientRect();
    const bx = rect.left + rect.width / 2;
    const by = rect.top + rect.height / 2;
    let dx = cx - bx, dy = cy - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, MAX_R);
    const angle = Math.atan2(dy, dx);
    dx = Math.cos(angle) * clamped;
    dy = Math.sin(angle) * clamped;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const dead = 10;
    moveForward = dy < -dead;
    moveBack    = dy >  dead;
    moveLeft    = dx < -dead;
    moveRight   = dx >  dead;
  }

  // Mostra joystick quando está no jogo
  const obs = new MutationObserver(() => {
    wrap.classList.toggle('show', inGame());
  });
  obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();

// ── HUD de pontuação ──────────────────────────────
(function initScoreHud() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const el = document.createElement('div');
  el.id = 'score-hud';
  el.style.cssText = `
    position:absolute; top:14px; right:90px;
    background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.14);
    backdrop-filter:blur(10px); padding:7px 16px; border-radius:100px;
    color:#f5c842; font-family:'Outfit',sans-serif; font-size:.88rem;
    font-weight:700; pointer-events:none;
  `;
  el.textContent = '⭐ 0 pts';
  hud.appendChild(el);
  setInterval(() => {
    if (typeof playerScore !== 'undefined') el.textContent = `⭐ ${playerScore} pts`;
  }, 500);
})();

// ── Minimapa ──────────────────────────────────────
(function initMinimap() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const cv = document.createElement('canvas');
  cv.id = 'minimap';
  cv.width = cv.height = 110;
  cv.style.cssText = `
    position:absolute; bottom:180px; right:18px;
    border-radius:50%; border:2px solid rgba(255,255,255,0.18);
    background:rgba(0,0,0,0.5); backdrop-filter:blur(10px);
    pointer-events:none; opacity:.85; z-index:20;
  `;
  hud.appendChild(cv);
  const ctx = cv.getContext('2d');

  setInterval(() => {
    if (!camera || typeof animals === 'undefined') return;
    ctx.clearRect(0, 0, 110, 110);
    // Fundo
    ctx.beginPath(); ctx.arc(55, 55, 53, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,30,15,0.88)'; ctx.fill();
    // Animais
    animals.forEach(a => {
      if (!a.mesh) return;
      const mx = 55 + (a.mesh.position.x - camera.position.x) * 0.7;
      const my = 55 + (a.mesh.position.z - camera.position.z) * 0.7;
      if (mx < 4 || mx > 106 || my < 4 || my > 106) return;
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fillStyle = { ok: '#44ff44', ameacado: '#ffaa00', critico: '#ff3333' }[a.entity.status] || '#fff';
      ctx.fill();
    });
    // Placas/interactables (azul)
    interactables.forEach(item => {
      if (!item.entity || item.entity.emoji === '📋' || item.entity.emoji === '🎯' || item.entity.emoji === '🧑‍🌿') {
        const mx = 55 + (item.position.x - camera.position.x) * 0.7;
        const my = 55 + (item.position.z - camera.position.z) * 0.7;
        if (mx < 4 || mx > 106 || my < 4 || my > 106) return;
        ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#44aaff'; ctx.fill();
      }
    });
    // Jogador
    ctx.beginPath(); ctx.arc(55, 55, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#4caf50'; ctx.fill();
    // Seta de direção
    ctx.save(); ctx.translate(55, 55); ctx.rotate(typeof yaw !== 'undefined' ? yaw : 0);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(-4, 0); ctx.lineTo(4, 0); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    // Borda
    ctx.beginPath(); ctx.arc(55, 55, 53, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(76,175,80,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  }, 120);
})();

// ── Contador de espécies ──────────────────────────
(function initSpeciesCounter() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const el = document.createElement('div');
  el.id = 'species-counter';
  el.style.cssText = `
    position:absolute; bottom:60px; left:18px;
    background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.12);
    backdrop-filter:blur(10px); padding:6px 14px; border-radius:100px;
    color:rgba(255,255,255,0.65); font-family:'Outfit',sans-serif;
    font-size:.76rem; pointer-events:none; z-index:20;
  `;
  el.textContent = '🔬 0 espécies descobertas';
  hud.appendChild(el);
  setInterval(() => {
    if (typeof discoveredSpecies !== 'undefined')
      el.textContent = `🔬 ${discoveredSpecies.size} espécies descobertas`;
  }, 600);
})();

// ── Destaque botões de ação por proximidade ────────
setInterval(() => {
  if (typeof camera === 'undefined' || !camera || typeof interactables === 'undefined') return;
  let near = false;
  interactables.forEach(item => {
    if (camera.position.distanceTo(item.position) < 7) near = true;
  });
  const btns = document.getElementById('action-buttons');
  if (btns) btns.classList.toggle('near-entity', near);
}, 250);

// ── Toast de boas-vindas ──────────────────────────
window.addEventListener('load', () => {
  setTimeout(showWelcomeToast, 1200);
});

function showWelcomeToast() {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const msg = isMobile
    ? '🌿 Toque e arraste para olhar ao redor • Use os botões para interagir'
    : '🌿 Clique e arraste no canvas para girar a câmera • WASD para mover';

  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; top:72px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.82); border:1px solid rgba(76,175,80,0.4);
    backdrop-filter:blur(20px); border-radius:14px; padding:14px 26px;
    color:#fff; font-family:'Outfit',sans-serif; font-size:.88rem;
    z-index:200; text-align:center; pointer-events:none;
    opacity:0; transition:opacity .4s;
    max-width:90vw;
  `;
  toast.innerHTML = msg + '<br><small style="opacity:.55;font-size:.75rem">Use os botões à direita para Interagir, Quiz e Guia</small>';
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 50);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 5000);
}

// ── Legenda de cores do minimapa ──────────────────
(function initMapLegend() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const leg = document.createElement('div');
  leg.id = 'map-legend';
  leg.style.cssText = `
    position:absolute; bottom:295px; right:18px;
    background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1);
    backdrop-filter:blur(10px); border-radius:10px; padding:7px 10px;
    font-family:'Outfit',sans-serif; font-size:.68rem; pointer-events:none;
    z-index:20; line-height:1.8; color:rgba(255,255,255,0.65);
  `;
  leg.innerHTML = `
    <span style="color:#44ff44">●</span> Seguro &nbsp;
    <span style="color:#ffaa00">●</span> Ameaçado &nbsp;
    <span style="color:#ff3333">●</span> Crítico<br>
    <span style="color:#44aaff">●</span> Placa &nbsp;
    <span style="color:#4caf50">●</span> Você
  `;
  hud.appendChild(leg);
})();

// ── Utilitário ────────────────────────────────────
function inGame() {
  const s = document.getElementById('screen-game');
  return s && s.classList.contains('active');
}
function toggleInGame(val) {
  const s = document.getElementById('screen-game');
  if (s) s.classList.toggle('active', val);
}
false && console.log('Controles carregados');

import * as THREE from 'three';
import { Track } from './track.js';
import { Dino, TUNING } from './dino.js';
import { Sfx } from './audio.js';
import { ZONES, zoneForS, zoneNumber } from './themes.js';

// ---------- Rendu
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const skyColor = new THREE.Color(ZONES[0].sky);     // horizon (= brouillard)
const skyTopColor = new THREE.Color(ZONES[0].skyTop);
const cloudColor = new THREE.Color(ZONES[0].cloud);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 70, 260);

// Ciel en dégradé : une sphère qui suit la caméra
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(380, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: skyTopColor }, bottom: { value: skyColor } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  }),
);
sky.renderOrder = -1;
scene.add(sky);

// Gros nuages cotonneux (grappes d'icosaèdres) autour du joueur
const cloudMat = new THREE.MeshLambertMaterial({ color: cloudColor, emissive: cloudColor, emissiveIntensity: 0.6, flatShading: true, fog: false });
const clouds = [];
{
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, cloudMat);
      const r = 5 + Math.random() * 7;
      m.scale.set(r * 1.3, r, r);
      m.position.set((k - n / 2) * 7 + Math.random() * 3, Math.random() * 3 - (k === 0 || k === n - 1) * 3, Math.random() * 4);
      g.add(m);
    }
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    clouds.push({ g, a, r: 170 + Math.random() * 110, y: 35 + Math.random() * 45 });
    scene.add(g);
  }
}

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xdfeaff, 0x9a8f80, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);  // soleil bas et chaud, ombres longues
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Monde
const track = new Track(scene);
const car = new Dino(scene); // (nommé `car` pour l'historique : c'est le dino)
const sfx = new Sfx();

// Le poursuivant : un curseur de souris géant
const cursor = (() => {
  const s = new THREE.Shape();
  [[0, 0], [0, -17], [4, -13], [7, -20], [10, -19], [7, -12], [12, -12]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }).translate(0, 0, -1);
  const g = new THREE.Group();
  const black = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
  const white = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  white.scale.set(1.12, 1.08, 0.9); white.position.set(-0.7, 0.8, 0);
  black.castShadow = true;
  g.add(white, black);
  g.scale.setScalar(0.42);
  const pivot = new THREE.Group(); pivot.add(g);
  g.rotation.x = -0.5; // pointe vers l'avant / le bas
  scene.add(pivot);
  return pivot;
})();

// ---------- Particules (pool)
const particles = [];
const pGeo = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 120; i++) {
  const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  m.visible = false; scene.add(m);
  particles.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
}
let pNext = 0;
function emit(x, y, z, color, n, spread, up, size = 0.3, life = 0.6) {
  for (let i = 0; i < n; i++) {
    const p = particles[pNext++ % particles.length];
    p.m.position.set(x, y, z); p.m.visible = true; p.floor = y - 0.3;
    p.m.material.color.setHex(color);
    p.m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    p.vx = (Math.random() - 0.5) * spread; p.vz = (Math.random() - 0.5) * spread; p.vy = Math.random() * up;
    p.life = p.max = life * (0.6 + Math.random() * 0.8);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vy -= 12 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(p.floor, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.material.opacity = p.life / p.max;
  }
}
const flying = []; // obstacles éjectés après un choc

// ---------- Entrées (QWERTY + AZERTY + tactile)
const keys = new Set();
const input = { steer: 0, drift: false, brake: false, jump: false };
let jumpQueued = false;
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (!e.repeat && ['Space', 'ArrowUp', 'KeyW', 'KeyZ'].includes(e.code) && state === 'playing') jumpQueued = true;
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) tryStart();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const touches = new Map();
let swipeY = new Map();
const onTouch = (e) => {
  e.preventDefault();
  touches.clear();
  for (const t of e.touches) touches.set(t.identifier, t.clientX < window.innerWidth / 2 ? 1 : -1);
  // glisser vers le haut = saut
  for (const t of e.changedTouches) {
    if (e.type === 'touchstart') swipeY.set(t.identifier, t.clientY);
    else if (swipeY.has(t.identifier) && swipeY.get(t.identifier) - t.clientY > 50) { jumpQueued = true; swipeY.delete(t.identifier); }
    if (e.type === 'touchend' || e.type === 'touchcancel') swipeY.delete(t.identifier);
  }
  if (e.type === 'touchstart') tryStart();
};
for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) window.addEventListener(ev, onTouch, { passive: false });
window.addEventListener('mousedown', () => tryStart());

function readInput(dt) {
  let target = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ')) target += 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) target -= 1;
  let drift = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC');
  if (touches.size) {
    const vals = [...touches.values()];
    target = vals[0];
    if (vals.length >= 2) { drift = true; target = vals[0]; }
  }
  input.steer += (target - input.steer) * Math.min(1, dt * 10);
  input.drift = drift;
  input.brake = keys.has('ArrowDown') || keys.has('KeyS');
  input.jump = jumpQueued; jumpQueued = false;
}

// ---------- HUD
const $ = (id) => document.getElementById(id);
const hud = {
  score: $('score'), coins: $('coins'), best: $('best'), speed: $('speed'),
  dangerTxt: $('dangerTxt'), dangerFill: $('dangerFill'), driftFill: $('driftFill'), driftLabel: $('driftLabel'),
  vignette: $('vignette'), flash: $('flash'), zone: $('zone'),
};
const loadBest = () => { try { return +localStorage.getItem('dino-escape-best') || 0; } catch { return 0; } };
const saveBest = (v) => { try { localStorage.setItem('dino-escape-best', String(v)); } catch { /* navigation privée */ } };
let best = loadBest();
hud.best.textContent = `${best}`;

let lastTitle = '';
const setTitle = (t) => { if (t !== lastTitle) { document.title = t; lastTitle = t; } };

function flash(opacity = 0.8) {
  hud.flash.style.transition = 'none'; hud.flash.style.opacity = opacity;
  requestAnimationFrame(() => { hud.flash.style.transition = 'opacity .35s'; hud.flash.style.opacity = 0; });
}
let zoneTimer = 0;
function showZone(text) {
  hud.zone.textContent = text; hud.zone.style.opacity = 1; zoneTimer = 2;
}

// ---------- État de jeu
const GAP_START = 45, GAP_MAX = 55;
let state = 'menu';
const MAX_LIVES = 3;
let lives = MAX_LIVES;
let sCar = 0, sChaser = 0, coins = 0, shake = 0, fallTimer = 0, overAt = 0, zoneIdx = 0, time = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const tmpColor = new THREE.Color();
const F = {};                         // repère de la route sous le dino
const fallVel = new THREE.Vector3();
const P = car.root.position;          // position monde du dino
let camSnap = true;

function resetWorld() {
  track.reset();
  car.reset();
  for (const f of flying) scene.remove(f.obj);
  flying.length = 0;
  lives = MAX_LIVES; renderLives(false);
  sCar = car.z; sChaser = sCar - GAP_START; coins = 0; shake = 0; fallTimer = 0; zoneIdx = 0;
  track.frame(car.z, F); car.Y = F.y; car.place(F);
  camSnap = true;
  skyColor.setHex(ZONES[0].sky); skyTopColor.setHex(ZONES[0].skyTop); cloudColor.setHex(ZONES[0].cloud);
  applyHudColor(ZONES[0]);
}

function renderLives(hit) {
  const el = $('lives');
  el.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => `<span class="${i < lives ? '' : 'lost'}">♥</span>`).join('');
  if (hit) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
}

// Perd une vie ; renvoie true si c'est la dernière
function loseLife() {
  lives = Math.max(0, lives - 1);
  renderLives(true);
  return lives <= 0;
}

function applyHudColor(zone) { document.getElementById('hud').style.color = zone.text; hud.zone.style.color = zone.text; }

function tryStart() {
  sfx.init();
  if (state === 'menu' || (state === 'over' && performance.now() - overAt > 700)) {
    if (state === 'over') resetWorld();
    state = 'playing';
    camSnap = true;
    $('start').classList.add('hidden');
    $('over').classList.add('hidden');
    showZone(`ZONE 1 — ${ZONES[0].name}`);
    sfx.zone();
  }
}

function gameOver(reason) {
  state = 'over';
  overAt = performance.now();
  const dist = Math.floor(sCar);
  const score = dist + coins * 25;
  const isBest = score > best;
  if (isBest) { best = score; saveBest(best); hud.best.textContent = `${best}`; }
  const TXT = {
    fall: ['ERR_404 — le dino est tombé hors de la page', 'Page introuvable.'],
    dead: ['ERR_TOO_MANY_HITS — plus de vies', 'Le dino a planté.'],
    caught: ['ERR_DINO_CAPTURED — le curseur a cliqué sur ✕', 'Onglet fermé.'],
  }[reason];
  $('overErr').textContent = TXT[0];
  $('overTitle').textContent = TXT[1];
  $('overScore').textContent = `${score} pts`;
  $('overBest').innerHTML = `${dist} m · ★ ${coins} × 25<br/>${isBest ? '🏆 NOUVEAU RECORD !' : `Record : ${best} pts`}`;
  $('over').classList.remove('hidden');
  setTitle('✕ Onglet fermé — Dino Escape');
  sfx.over();
  sfx.engine(0, false, false);
}

// Direction monde du dino
const worldDir = () => { const h = F.th + car.yaw; return [Math.sin(h), Math.cos(h)]; };

function hitObstacle(chunk, o) {
  const [fx, fz] = worldDir();
  const obj = o.obj;
  scene.attach(obj);
  flying.push({ obj, vx: fx * car.speed * 0.9 + (Math.random() - 0.5) * 10, vy: 12, vz: fz * car.speed * 0.9, life: 2 });
  chunk.obstacles.splice(chunk.obstacles.indexOf(o), 1);
  car.crash();
  shake = 1;
  flash(0.6);
  sfx.crash();
  emit(P.x, P.y + 1, P.z, ZONES[chunk.zoneIdx].edge, 12, 12, 9, 0.22, 0.7);
  if (loseLife()) gameOver('dead');
}

// Après une chute : on réapparaît au milieu de la route, un peu plus loin
function respawn() {
  car.z = Math.max(car.z, sCar) + 6;
  track.frame(car.z, F);
  car.x = 0; car.latV = 0; car.push = 0;
  car.Y = F.y; car.vy = 0; car.y = 0; car.grounded = true; car.prevRoadVy = 0;
  car.speed = car.cruise * 0.7; car.boost = 0; car.drifting = false; car.driftCharge = 0;
  car.invul = 2; car.stumble = 0;
  car.body.rotation.set(0, 0, 0);
  car.place(F);
  state = 'playing';
  camSnap = true;
  flash(0.5);
  sfx.zone();
}

function gameplay(dt) {
  const events = [];
  const progress = Math.min(1, sCar / 5000);
  car.cruise = TUNING.baseSpeed + (TUNING.maxBaseSpeed - TUNING.baseSpeed) * progress;

  track.frame(car.z, F);
  car.update(dt, input, events, { y: F.y, vy: F.slope * car.speed, slope: F.slope, k: F.k });
  track.frame(car.z, F);
  if (car.grounded) { car.Y = F.y; car.y = 0; }
  sCar = Math.max(sCar, car.z);
  car.place(F);

  // Changement de zone
  const zi = zoneForS(car.z);
  if (zi !== zoneIdx) {
    zoneIdx = zi;
    showZone(`ZONE ${zoneNumber(car.z) + 1} — ${ZONES[zoneIdx].name}`);
    applyHudColor(ZONES[zoneIdx]);
    sfx.zone();
  }

  // Sorti de la route → chute dans le vide
  if (car.grounded && Math.abs(car.x) > F.w / 2 + 0.4) {
    state = 'falling'; fallTimer = 0;
    fallVel.set(
      Math.sin(F.th) * car.speed + F.lx * (car.latV + car.push), car.vy,
      Math.cos(F.th) * car.speed + F.lz * (car.latV + car.push));
    sfx.tone(600, 0.8, 'sawtooth', 0.12, -500);
    return;
  }

  // Obstacles, favicons, pads (en coordonnées piste)
  for (const ch of track.near(car.z)) {
    for (const o of ch.obstacles) {
      if (state !== 'playing') break;
      if (car.invul <= 0 && car.y < o.h - 0.3 && Math.abs(car.z - o.s) < o.hz + 0.9 && Math.abs(car.x - o.d) < o.hx + 0.8) { hitObstacle(ch, o); break; }
    }
    for (let k = ch.coins.length - 1; k >= 0; k--) {
      const co = ch.coins[k];
      if (Math.abs(co.s - car.z) < 1.5 && Math.abs(co.d - car.x) < 1.7 && car.y < 3) {
        const q = co.obj.position;
        ch.group.remove(co.obj); ch.coins.splice(k, 1); coins++;
        sfx.coin(); emit(q.x, q.y + 1.2, q.z, 0xfbbc04, 6, 6, 6, 0.25, 0.4);
      }
    }
    for (const p of ch.pads) {
      if (!p.used && car.y < 0.5 && Math.abs(car.z - p.s) < p.hz + 0.5 && Math.abs(car.x - p.d) < p.hx + 0.5) {
        p.used = true; car.boost = Math.max(car.boost, 1.5); shake = 0.3; sfx.boost(true);
      }
    }
  }

  if (state !== 'playing') return; // plus de vies

  // Événements du dino
  for (const e of events) {
    if (e === 'boost' || e === 'boostBig') { sfx.boost(e === 'boostBig'); shake = 0.25; }
    else if (e === 'jump') sfx.jump();
    else if (e === 'land') { sfx.step(true); shake = Math.max(shake, 0.2); emit(P.x, P.y + 0.2, P.z, ZONES[zoneIdx].edge, 6, 6, 3, 0.25, 0.4); }
    else if (e === 'step') sfx.step(false);
  }
  const [fx, fz] = worldDir();
  if (car.drifting) {
    const col = car.driftCharge > 1 ? 0xff9800 : car.driftCharge > 0.35 ? 0x42a5f5 : 0xbbbbbb;
    for (const side of [-1, 1]) emit(P.x - fx * 0.5 + fz * side * 0.4, P.y + 0.2, P.z - fz * 0.5 - fx * side * 0.4, col, 1, 2, 2, 0.35, 0.4);
  }
  if (car.boost > 0) emit(P.x - fx * 1.5, P.y + 1 + Math.random() * 2.5, P.z - fz * 1.5, 0xffffff, 1, 1, 0, 0.18, 0.25);

  // Le curseur : légèrement plus lent que le dino, qui doit éviter les chocs pour rester devant
  const chaserSpeed = car.cruise * 0.93;
  sChaser = Math.max(sChaser + chaserSpeed * dt, sCar - GAP_MAX);
  const gap = sCar - sChaser;
  if (gap <= 0) { gameOver('caught'); sfx.click(); flash(1); return; }

  // HUD
  const danger = 1 - Math.min(1, gap / GAP_MAX);
  hud.dangerTxt.textContent = `CURSEUR : ${Math.ceil(gap)} m`;
  hud.dangerFill.style.width = `${danger * 100}%`;
  hud.vignette.style.boxShadow = `inset 0 0 160px 40px rgba(229,57,53,${Math.max(0, danger - 0.45) * 1.4})`;
  setTitle(gap < 18 ? '⚠️ LE CURSEUR ARRIVE' : '🦖 AIDEZ-MOI');

  track.update(car.z, time);
}

// ---------- Caméra
const camF = {}, lookF = {};
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3();
function updateCamera(dt) {
  const speed = Math.max(0, car.speed);
  if (state === 'menu') {
    const a = time * 0.3;
    car.phase += 0.05; car.animate(1 / 60, 0, 14, []); // petite course sur place au menu
    camera.position.set(P.x + Math.sin(a) * 10, P.y + 4.5, P.z + Math.cos(a) * 10);
    camera.lookAt(P.x, P.y + 2.2, P.z);
    return;
  }
  if (state === 'playing') {
    // Caméra accrochée à la route : derrière le dino, elle regarde la route devant
    // (on voit les montées, les descentes et les virages arriver)
    const back = 8 + speed * 0.04;
    track.frame(Math.max(0, car.z - back), camF);
    track.frame(car.z + 14, lookF);
    const bob = car.grounded ? Math.abs(Math.cos(car.phase)) * 0.07 : 0;
    camTarget.set(camF.x + camF.lx * car.x * 0.6, Math.max(camF.y, car.Y - 1) + 4.4 + bob, camF.z + camF.lz * car.x * 0.6);
    lookTarget.set(lookF.x + lookF.lx * car.x * 0.4, lookF.y * 0.5 + car.Y * 0.5 + 2.4, lookF.z + lookF.lz * car.x * 0.4);
    const k = camSnap ? 1 : Math.min(1, dt * 10);
    camPos.lerp(camTarget, k); camLook.lerp(lookTarget, k);
    camSnap = false;
    camera.position.copy(camPos);
  } else {
    camLook.lerp(tmpV.set(P.x, P.y + 1, P.z), 0.2); // chute / game over : on regarde le dino
    camera.position.lerp(camPos, 0.02);
  }
  shake = Math.max(0, shake - dt * 2.2);
  camera.position.x += (Math.random() - 0.5) * shake * 0.8;
  camera.position.y += (Math.random() - 0.5) * shake * 0.8;
  camera.lookAt(camLook);
  const targetFov = 66 + Math.max(0, speed - 30) * 0.45 + (car.boost > 0 ? 8 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}
const tmpV = new THREE.Vector3();
const curF = {};

function updateCursorVisual() {
  if (state === 'menu') {
    cursor.position.set(P.x + 5, P.y + 7 + Math.sin(time * 2) * 0.6, P.z - 4);
    cursor.rotation.set(0, time * 0.5, 0);
    return;
  }
  const gap = sCar - sChaser;
  track.frame(Math.max(0, sChaser + 18), curF);
  cursor.position.set(curF.x, curF.y + 3 + gap * 0.25 + Math.sin(time * 3) * 0.4, curF.z);
  cursor.rotation.set(0, curF.th + Math.PI, 0);
}

// ---------- Boucle
let last = performance.now();
resetWorld();
setTitle('Dino Escape');

function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  time += dt;
  readInput(dt);

  if (state === 'playing') gameplay(dt);
  else if (state === 'falling') {
    fallTimer += dt;
    fallVel.y -= 30 * dt;
    P.addScaledVector(fallVel, dt);
    car.body.rotation.x += dt * 2;
    car.blob.visible = false;
    sChaser += car.cruise * dt;
    if (fallTimer > 1.3) { if (loseLife()) gameOver('fall'); else respawn(); }
  }

  // Obstacles éjectés
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.life -= dt; f.vy -= 30 * dt;
    f.obj.position.x += f.vx * dt; f.obj.position.y += f.vy * dt; f.obj.position.z += f.vz * dt;
    f.obj.rotation.x += dt * 6; f.obj.rotation.z += dt * 4;
    if (f.life <= 0) { scene.remove(f.obj); flying.splice(i, 1); }
  }

  // Couleur du ciel / brouillard vers la zone courante
  const zk = Math.min(1, dt * 1.5), Z = ZONES[zoneIdx];
  skyColor.lerp(tmpColor.setHex(Z.sky), zk);
  skyTopColor.lerp(tmpColor.setHex(Z.skyTop), zk);
  cloudColor.lerp(tmpColor.setHex(Z.cloud), zk);
  sun.color.lerp(tmpColor.setHex(Z.sun), zk);
  scene.fog.color.copy(skyColor);
  sky.position.copy(camera.position);
  for (const c of clouds) {
    c.a += dt * 0.004;
    c.g.position.set(camera.position.x + Math.cos(c.a) * c.r, c.y, camera.position.z + Math.sin(c.a) * c.r);
    c.g.lookAt(camera.position.x, c.y, camera.position.z);
  }
  document.body.style.background = `#${skyColor.getHexString()}`;

  sun.position.set(P.x + 25, P.y + 22, P.z - 18);
  sun.target.position.copy(P);

  updateParticles(dt);
  updateCursorVisual();
  updateCamera(dt);

  // HUD commun
  const kmh = Math.round(Math.max(0, car.speed) * 3.6);
  hud.speed.innerHTML = `${kmh} <small>km/h</small>`;
  hud.score.textContent = `${Math.floor(sCar)} m`;
  hud.coins.textContent = `★ ${coins}`;
  const charge = Math.min(1, car.driftCharge / 1.5);
  hud.driftFill.style.width = `${car.boost > 0 ? 100 : charge * 100}%`;
  hud.driftFill.style.background = car.boost > 0 ? '#34a853' : car.driftCharge > 1 ? '#ff9800' : '#1a73e8';
  hud.driftLabel.textContent = car.boost > 0 ? 'SPRINT !' : car.drifting ? (car.driftCharge > 1 ? 'GLISSADE MAX' : 'GLISSADE…') : 'GLISSADE (SHIFT)';
  if (zoneTimer > 0) { zoneTimer -= dt; if (zoneTimer <= 0) hud.zone.style.opacity = 0; }

  sfx.engine(Math.max(0, car.speed) + (car.boost > 0 ? 15 : 0), state === 'playing', car.drifting && car.grounded);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès debug depuis la console
window.__game = { car, track, get state() { return state; } };

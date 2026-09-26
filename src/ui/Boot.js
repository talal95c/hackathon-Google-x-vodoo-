// Écran de lancement : la page « No internet » de Chrome. Le petit dino joue tout seul
// (il saute les cactus), puis fait un méga saut contre l'écran : la vitre se fissure,
// éclate en morceaux qui tombent… et on arrive sur le menu. Clic ou touche = on accélère.
const DINO_X = 24, SPEED = 380, GRAVITY = 2600, JUMP_V = 720;
const CACTI_AT = [0.35, 1.25, 2.05];
const MEGA_AT = 2.75, MEGA_MS = 520, CRACK_MS = 420, BOOM_MS = 900;
const SVG = 'http://www.w3.org/2000/svg';
const MAX_MS = 9000; // filet de sécurité si l'onglet est en arrière-plan (rAF en pause)
const easeIn = (k) => k * k * k;
const rand = (a, b) => a + Math.random() * (b - a);

// Éclats radiaux autour du point d'impact : triangles au centre, quadrilatères jusqu'aux bords
function shardShapes(cx, cy) {
  const n = 9, far = Math.hypot(innerWidth, innerHeight) * 1.2;
  const angles = Array.from({ length: n }, (_, i) => (i + rand(-0.3, 0.3)) / n * Math.PI * 2);
  const ring = angles.map((a) => { const r = rand(0.14, 0.26) * far; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const edge = angles.map((a) => [cx + Math.cos(a) * far, cy + Math.sin(a) * far]);
  const shapes = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    shapes.push({ pts: [[cx, cy], ring[i], ring[j]], inner: true });
    shapes.push({ pts: [ring[i], edge[i], edge[j], ring[j]], inner: false });
  }
  return { shapes, ring, edge };
}

export function boot(el = document.getElementById('boot')) {
  if (!el) return;
  const body = document.body;
  const $ = (s) => el.querySelector(s);
  const stage = $('.boot-stage'), dino = $('.boot-dino'), ground = $('.boot-ground'), score = $('.boot-score');
  const cactusTpl = $('.boot-cactus');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cacti = [];
  let t = 0, last = 0, y = 0, vy = 0, spawned = 0, phase = 'run', raf = 0, done = false;

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    el.remove();
    body.classList.remove('booting');
    body.classList.add('booted');
    window.removeEventListener('keydown', skip, true);
    window.removeEventListener('pointerdown', skip, true);
  };

  let impact = null;

  const crack = () => {
    if (phase === 'crack' || phase === 'boom') return;
    phase = 'crack';
    cancelAnimationFrame(raf);
    const d = dino.getBoundingClientRect();
    const cx = d.left + d.width / 2, cy = d.top + d.height * 0.35;
    impact = shardShapes(cx, cy);
    const svg = $('.boot-cracks');
    svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    const line = (pts, w, delay) => {
      const l = document.createElementNS(SVG, 'polyline');
      l.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
      l.setAttribute('stroke-width', w);
      l.style.animationDelay = `${delay}ms`;
      svg.append(l);
    };
    impact.ring.forEach((q, i) => line([[cx, cy], q, impact.edge[i]], 2.5, i * 12));
    line([...impact.ring, impact.ring[0]], 1.5, 120);
    el.classList.add('crack');
    setTimeout(boom, reduce ? 0 : CRACK_MS);
  };

  const boom = () => {
    if (phase === 'boom') return;
    if (!impact) return crack();
    phase = 'boom';
    const sheet = $('.boot-sheet');
    const cx = impact.shapes[0].pts[0][0], cy = impact.shapes[0].pts[0][1];
    for (const { pts, inner } of impact.shapes) {
      const shard = document.createElement('div');
      shard.className = 'boot-shard';
      shard.style.clipPath = `polygon(${pts.map(([x, y]) => `${x}px ${y}px`).join(',')})`;
      shard.append(sheet.cloneNode(true));
      el.append(shard);
      const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length - cx;
      const my = pts.reduce((a, q) => a + q[1], 0) / pts.length - cy;
      const push = inner ? 0.9 : 0.35, spin = rand(-40, 40), delay = inner ? 0 : rand(20, 90);
      shard.style.transformOrigin = `${cx + mx}px ${cy + my}px`;
      shard.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${mx * push * 0.3}px, ${my * push * 0.3}px) rotate(${spin * 0.2}deg)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${mx * push}px, ${my * push + innerHeight * 0.9}px) rotate(${spin}deg) scale(.9)`, opacity: 0 },
      ], { duration: BOOM_MS - 100, delay, easing: 'cubic-bezier(.4, 0, .9, .6)', fill: 'forwards' });
    }
    el.classList.add('boom');
    setTimeout(finish, reduce ? 200 : BOOM_MS);
  };

  const mega = () => {
    phase = 'mega';
    el.classList.add('mega');
    const d = dino.getBoundingClientRect();
    const dx = innerWidth / 2 - (d.left + d.width / 2), dy = innerHeight / 2 - (d.top + d.height / 2);
    const scale = Math.max(innerWidth, innerHeight) / d.height * 0.9;
    const t0 = performance.now();
    const fly = (now) => {
      const k = Math.min(1, (now - t0) / MEGA_MS), e = easeIn(k);
      const hop = Math.sin(k * Math.PI) * 90 * (1 - k);
      dino.style.transform = `translate(${dx * e}px, ${dy * e - hop}px) scale(${1 + (scale - 1) * e}) rotate(${-8 * Math.sin(k * Math.PI)}deg)`;
      if (k < 1 && phase === 'mega') raf = requestAnimationFrame(fly);
      else crack();
    };
    raf = requestAnimationFrame(fly);
  };

  const spawn = () => {
    const c = cactusTpl.cloneNode(true);
    c.classList.add('live');
    if (spawned === 1) c.classList.add('tall');
    stage.append(c);
    cacti.push({ el: c, x: stage.clientWidth + 10 });
    spawned++;
  };

  const step = (now) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
    last = now;
    t += dt;
    if (spawned < CACTI_AT.length && t >= CACTI_AT[spawned]) spawn();

    for (const c of cacti) {
      c.x -= SPEED * dt;
      c.el.style.transform = `translateX(${c.x}px)`;
      if (y === 0 && vy === 0 && c.x - DINO_X > 20 && c.x - DINO_X < 78) vy = JUMP_V;
    }
    if (vy !== 0 || y > 0) {
      vy -= GRAVITY * dt;
      y = Math.max(0, y + vy * dt);
      if (y === 0) { vy = 0; dino.classList.add('land'); setTimeout(() => dino.classList.remove('land'), 120); }
    }
    dino.classList.toggle('air', y > 0);
    dino.classList.toggle('step', y === 0 && Math.floor(t * 10) % 2 === 1);
    dino.style.transform = `translateY(${-y}px)`;
    ground.style.backgroundPositionX = `${-t * SPEED}px`;
    score.textContent = String(Math.floor(t * 40)).padStart(5, '0');

    if (t >= MEGA_AT && y === 0) return mega();
    raf = requestAnimationFrame(step);
  };

  function skip(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (phase === 'run') { cancelAnimationFrame(raf); mega(); }
    else if (phase === 'mega') crack();
    else if (phase === 'crack') boom();
  }

  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  if (reduce) { setTimeout(finish, 600); return; }
  setTimeout(finish, MAX_MS);
  el.classList.add('run');
  raf = requestAnimationFrame(step);
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Models, box, cube, lambert } from '../ModelRegistry.js';
import * as TX from '../textures.js';

// Modèles des entités : volumes arrondis low-poly (même rendu que le décor et le dino),
// textures dessinées au canvas. Remplacer un modèle : Models.register('<type>', ...) depuis un autre fichier.
// update(entity, dt, time, fx) : fx.pulse (0..1) suit les temps de la musique.

const lazy = (make) => { let v; return () => v ?? (v = make()); };
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// Matériaux propres à une instance : libérés quand l'entité disparaît (les matériaux en cache restent partagés).
let owned = null;
const own = (mat) => { owned?.push(mat); return mat; };
const register = (type, factory) => Models.register(type, (params) => {
  owned = [];
  const res = factory(params), mats = owned;
  owned = null;
  const model = res instanceof THREE.Object3D ? { object: res } : res;
  return { ...model, dispose() { model.dispose?.(); for (const m of mats) m.dispose(); } };
});

const rbox = (w, h, d, r = 0.14) => cached(`rb:${w}:${h}:${d}:${r}`,
  () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const std = (color, o = {}) => cached(`m:${color}:${JSON.stringify(o)}`,
  () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.04, flatShading: true, ...o }));
const glowMat = (color, intensity = 1.6) => own(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5, flatShading: true }));

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = shadow;
  parent.add(m);
  return m;
}

function extrude(shape, depth, bevel = 0.03) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  g.center();
  return g;
}

const plane = (w, h) => cached(`pl:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
const faceMat = (key, make) => cached(`face:${key}`, () => new THREE.MeshStandardMaterial({ map: make(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));

// --- Ombre de contact + halo
const shadowMat = lazy(() => new THREE.MeshBasicMaterial({ map: TX.shadowTex(), transparent: true, depthWrite: false }));
function contactShadow(parent, size) {
  const m = new THREE.Mesh(plane(1, 1), shadowMat());
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.scale.setScalar(size); m.renderOrder = 1;
  parent.add(m);
  return m;
}
const glowSpriteTex = lazy(() => TX.glowTex());
function halo(parent, color, size, opacity = 0.5) {
  const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowSpriteTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })));
  s.scale.setScalar(size);
  parent.add(s);
  return s;
}

// --- Formes 2D
const starShape = (outer, inner, n = 5) => {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const r = i % 2 ? inner : outer, a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
};
const chevronShape = () => {
  const s = new THREE.Shape();
  s.moveTo(-1, -0.2); s.lineTo(0, 0.5); s.lineTo(1, -0.2); s.lineTo(1, -0.62); s.lineTo(0, 0.08); s.lineTo(-1, -0.62); s.closePath();
  return s;
};
const shieldShape = (w, h) => {
  const s = new THREE.Shape();
  s.moveTo(-w, h); s.lineTo(w, h); s.lineTo(w, 0); s.quadraticCurveTo(w * 0.9, -h * 0.75, 0, -h * 1.15); s.quadraticCurveTo(-w * 0.9, -h * 0.75, -w, 0); s.closePath();
  return s;
};
const boltShape = () => {
  const s = new THREE.Shape();
  s.moveTo(0.12, 0.62); s.lineTo(-0.34, -0.05); s.lineTo(-0.02, -0.05); s.lineTo(-0.14, -0.62); s.lineTo(0.34, 0.08); s.lineTo(0.02, 0.08); s.closePath();
  return s;
};

const G = lazy(() => ({
  coinEdge: new THREE.CylinderGeometry(0.9, 0.9, 0.22, 28).rotateX(Math.PI / 2),
  coinFace: new THREE.CylinderGeometry(0.7, 0.7, 0.27, 28).rotateX(Math.PI / 2),
  star: extrude(starShape(0.44, 0.19), 0.05, 0.02),
  chevron: extrude(chevronShape(), 0.05, 0).rotateX(Math.PI / 2).scale(0.95, 1, 1.1),
  arrow: extrude(chevronShape(), 0.08, 0.02).scale(0.3, 0.45, 1),
  bubble: new THREE.IcosahedronGeometry(1.25, 2),
  orbit: new THREE.TorusGeometry(1.32, 0.045, 6, 40),
  ring: new THREE.RingGeometry(1.1, 1.32, 40).rotateX(-Math.PI / 2),
  shield: extrude(shieldShape(0.42, 0.34), 0.16, 0.04),
  shieldInner: extrude(shieldShape(0.26, 0.2), 0.08, 0.02),
  bolt: extrude(boltShape(), 0.16, 0.03),
  thin: new THREE.BoxGeometry(1, 1, 1),
}));

// --- Pièces : disque biseauté + étoile en relief, flottement en vague le long des rangées
const COIN = {
  coin: { edge: 0xe39b00, face: 0xfbbc04, star: 0xfff6d5, glow: 0x9a6400, size: 1 },
};
function coinDisc(parent, p) {
  const g = G(), disc = new THREE.Group();
  mesh(disc, g.coinEdge, std(p.edge, { metalness: 0.35, roughness: 0.35, emissive: p.glow, emissiveIntensity: 0.3 }));
  const faceM = std(p.face, { metalness: 0.3, roughness: 0.32, emissive: p.glow, emissiveIntensity: 0.45 });
  mesh(disc, g.coinFace, faceM);
  const starM = std(p.star, { roughness: 0.3, emissive: p.star, emissiveIntensity: 0.25 });
  for (const side of [1, -1]) { const s = mesh(disc, g.star, starM, 0, 0, side * 0.15); s.rotation.y = side < 0 ? Math.PI : 0; }
  parent.add(disc);
  return { disc, faceM };
}
const coin = (type) => () => {
  const p = COIN[type], root = new THREE.Group(), float = new THREE.Group();
  root.add(float);
  const shadow = contactShadow(root, 1.7 * p.size);
  const { disc, faceM } = coinDisc(float, p);
  float.scale.setScalar(p.size);
  return {
    object: root,
    update(e, dt, t, fx) {
      const ph = e.s * 0.45, pulse = fx?.pulse ?? 0;
      const bob = Math.sin(t * 3.2 + ph) * 0.14;
      float.position.y = 1.25 + bob;
      disc.rotation.y = t * 3 + ph;
      shadow.scale.setScalar((1.7 - bob * 0.9) * p.size);
      faceM.emissiveIntensity = 0.45 + pulse * 0.6;
    },
  };
};
register('coin', coin('coin'));

// --- Plaque d'accélération : chevrons qui s'allument en vague vers l'avant, s'éteint une fois utilisée
register('boostPad', () => {
  const g = G(), root = new THREE.Group();
  mesh(root, rbox(3.3, 0.22, 5.3, 0.1), std(0x193d47), 0, 0.11, 0);
  const plateM = own(new THREE.MeshStandardMaterial({ color: 0x1f9d57, emissive: 0x0f7a3f, emissiveIntensity: 0.5, roughness: 0.45, flatShading: true }));
  mesh(root, rbox(2.9, 0.08, 4.9, 0.04), plateM, 0, 0.24, 0);
  const railM = glowMat(0x3ddc84, 2);
  for (const x of [-1.52, 1.52]) { const r = mesh(root, g.thin, railM, x, 0.26, 0, false); r.scale.set(0.12, 0.08, 5.1); }
  const chevrons = [-1.45, 0, 1.45].map((z) => {
    const m = own(new THREE.MeshStandardMaterial({ color: 0xeafff1, emissive: 0xb6ffd3, emissiveIntensity: 0.3, roughness: 0.4, flatShading: true }));
    return mesh(root, g.chevron, m, 0, 0.3, z, false);
  });
  let usedAt = null;
  return {
    object: root,
    update(e, dt, t, fx) {
      if (e.used && usedAt === null) usedAt = t;
      const since = usedAt === null ? 0 : t - usedAt;
      const flash = usedAt === null ? 0 : Math.max(0, 1 - since * 3);
      const dim = usedAt === null ? 1 : Math.max(0.1, 1 - since * 1.6);
      const pulse = fx?.pulse ?? 0;
      chevrons.forEach((c, i) => {
        const wave = Math.max(0, Math.sin((t * 2.4 - i * 0.3) * Math.PI * 2)) ** 3;
        c.material.emissiveIntensity = (0.25 + wave * 2.2 + pulse * 0.5) * dim + flash * 3;
        c.position.y = 0.3 + wave * 0.04 * dim;
      });
      plateM.emissiveIntensity = (0.45 + pulse * 0.4) * dim + flash * 2.5;
      railM.emissiveIntensity = 2 * dim + flash * 2;
    },
  };
});

// --- Bonus : bulle translucide avec l'icône du bonus, anneau au sol qui pulse
export const PICKUP_COLORS = { laserPickup: 0xff3b4f, shieldPickup: 0x2f7bff, magnetPickup: 0xa24bff, doubleCoinsPickup: 0xffc400 };
const ICONS = {
  laserPickup(g) {
    mesh(g, G().bolt, std(0xffffff, { emissive: 0xff8a95, emissiveIntensity: 0.5 }));
  },
  shieldPickup(g) {
    mesh(g, G().shield, std(0x1f5fe0, { roughness: 0.4 }));
    mesh(g, G().shieldInner, std(0xffffff, { emissive: 0xbad2ff, emissiveIntensity: 0.4 }), 0, 0.03, 0.1);
  },
  magnetPickup(g) {
    const red = std(0xe53950, { roughness: 0.45 }), tip = std(0xf1f3f4, { roughness: 0.35, metalness: 0.3 });
    mesh(g, rbox(0.9, 0.24, 0.26, 0.08), red, 0, -0.34, 0);
    for (const x of [-0.33, 0.33]) { mesh(g, rbox(0.24, 0.5, 0.26, 0.08), red, x, 0.02, 0); mesh(g, rbox(0.25, 0.2, 0.27, 0.06), tip, x, 0.36, 0); }
  },
  doubleCoinsPickup(g) {
    for (const [x, y] of [[-0.18, -0.12], [0.2, 0.14]]) { const c = new THREE.Group(); c.position.set(x, y, x * 0.4); c.scale.setScalar(0.55); coinDisc(c, COIN.coin); g.add(c); }
  },
};
const pickup = (type) => () => {
  const g = G(), color = PICKUP_COLORS[type], root = new THREE.Group(), float = new THREE.Group();
  root.add(float);
  const shadow = contactShadow(root, 2.2);
  const ringM = own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
  const ring = mesh(root, g.ring, ringM, 0, 0.06, 0, false);
  const bubbleM = own(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, transparent: true, opacity: 0.24, roughness: 0.1, metalness: 0.1, depthWrite: false }));
  const bubble = mesh(float, g.bubble, bubbleM, 0, 0, 0, false);
  const orbit = mesh(float, g.orbit, glowMat(color, 1.4), 0, 0, 0, false);
  const icon = new THREE.Group(); float.add(icon);
  ICONS[type](icon);
  icon.traverse((m) => { m.castShadow = true; });
  halo(float, color, 3.6, 0.3);
  return {
    object: root,
    update(e, dt, t, fx) {
      const pulse = fx?.pulse ?? 0, bob = Math.sin(t * 2.6 + e.id) * 0.22;
      float.position.y = 1.9 + bob;
      icon.rotation.y = Math.sin(t * 1.8 + e.id) * 0.6;
      icon.scale.setScalar(1 + pulse * 0.12);
      bubble.scale.setScalar(1 + Math.sin(t * 4 + e.id) * 0.03 + pulse * 0.05);
      orbit.rotation.set(Math.PI / 2 + Math.sin(t * 1.1) * 0.5, t * 1.7, 0);
      const k = (t * 0.9 + e.id * 0.37) % 1;
      ring.scale.setScalar(0.8 + k * 0.6); ringM.opacity = 0.65 * (1 - k);
      shadow.scale.setScalar(2.2 - bob);
    },
  };
};
for (const type of Object.keys(PICKUP_COLORS)) register(type, pickup(type));

// --- Obstacles
const INK = 0x193d47, GREY = 0x535353;
const cookieGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.6, 18).rotateX(Math.PI / 2);
const hazardMat = lazy(() => { const map = TX.hazardTex(); map.repeat.set(5, 1); return new THREE.MeshStandardMaterial({ map, roughness: 0.7 }); });
const cross = (parent, mat, x, y, z, size = 0.36) => {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = mesh(g, G().thin, mat, 0, 0, 0, false); b.scale.set(size, size * 0.24, 0.06); b.rotation.z = a; }
  return g;
};
// Le côté +z du groupe "front" est tourné vers le dino.
const frontGroup = (root) => { const f = new THREE.Group(); f.rotation.y = Math.PI; root.add(f); return f; };

const TAB_LABELS = ['New tab', 'Untitled', 'Loading…', 'Error 404'];
register('tabWall', () => {
  const root = new THREE.Group(), f = frontGroup(root);
  const label = TAB_LABELS[Math.floor(Math.random() * TAB_LABELS.length)];
  mesh(f, rbox(5.2, 0.3, 0.7, 0.1), std(INK), 0, 0.15, 0);
  mesh(f, plane(5, 0.16), hazardMat(), 0, 0.15, 0.36, false);
  mesh(f, rbox(5, 1.22, 0.42, 0.2), std(0xf8f9fa, { roughness: 0.5 }), 0, 0.9, 0);
  mesh(f, plane(4.4, 1.1), faceMat(`tab:${label}`, () => TX.tabFaceTex(label)), -0.2, 0.9, 0.215, false);
  const xM = glowMat(0xea4335, 0.6);
  const x = cross(f, xM, 2.05, 0.92, 0.24);
  return {
    object: root,
    update(e, dt, t, fx) {
      const blink = (Math.sin(t * 5 + e.id) + 1) / 2;
      xM.emissiveIntensity = 0.4 + blink * 1.4 + (fx?.pulse ?? 0);
      x.scale.setScalar(1 + blink * 0.12);
    },
  };
});

register('cookieBanner', () => {
  const root = new THREE.Group(), f = frontGroup(root);
  for (const x of [-2.7, 2.7]) mesh(f, rbox(0.24, 0.4, 0.24, 0.06), std(INK), x, 0.2, 0);
  mesh(f, rbox(6.5, 1.34, 0.34, 0.16), std(0xfffbeb, { roughness: 0.55 }), 0, 0.95, 0);
  const band = mesh(f, G().thin, std(0xfbbc04, { emissive: 0xb07800, emissiveIntensity: 0.35 }), 0, 0.33, 0, false); band.scale.set(6.3, 0.1, 0.36);
  mesh(f, plane(5.1, 1.04), faceMat('cookie', TX.cookieFaceTex), -0.62, 0.98, 0.175, false);
  const btn = new THREE.Group(); btn.position.set(2.42, 0.98, 0.2); f.add(btn);
  mesh(btn, rbox(1.3, 0.5, 0.1, 0.05), std(0x1a73e8), 0, 0, 0, false);
  mesh(btn, plane(1.26, 0.47), faceMat('accept', TX.acceptTex), 0, 0, 0.055, false);
  return {
    object: root,
    update(e, dt, t, fx) { btn.scale.setScalar(1 + Math.max(0, Math.sin(t * 4 + e.id)) * 0.07 + (fx?.pulse ?? 0) * 0.06); },
  };
});

const popupModel = ({ bar, barAt, arrows }) => () => {
  const root = new THREE.Group(), f = frontGroup(root), win = new THREE.Group();
  f.add(win);
  const shadow = contactShadow(root, 3.6);
  shadow.scale.set(4.6, 1.6, 1);
  mesh(win, rbox(4, 2.6, 0.3, 0.14), std(0xffffff, { roughness: 0.5 }));
  mesh(win, rbox(3.98, 0.46, 0.33, 0.1), std(0x1a73e8), 0, 1.06, 0);
  mesh(win, plane(3.2, 0.4), faceMat('popupTitle', TX.popupTitleTex), -0.3, 1.06, 0.17, false);
  mesh(win, rbox(0.4, 0.32, 0.08, 0.06), std(0xea4335), 1.66, 1.06, 0.18, false);
  cross(win, std(0xffffff), 1.66, 1.06, 0.23, 0.22);
  mesh(win, plane(3.7, 1.85), faceMat('popup', TX.popupFaceTex), 0, -0.2, 0.155, false);
  let barM = null;
  const side = [];
  if (bar) {
    barM = glowMat(bar, 1.8);
    mesh(win, rbox(4.1, 0.14, 0.36, 0.06), barM, 0, barAt, 0, false);
  }
  if (arrows) for (const s of [-1, 1]) {
    const a = mesh(win, G().arrow, barM, s * 2.45, 0, 0, false);
    a.rotation.z = -s * Math.PI / 2;
    side.push(a);
  }
  return {
    object: root,
    update(e, dt, t, fx) {
      const bob = Math.sin(t * 2 + e.id) * 0.3;
      win.position.y = 1.8 + bob;
      win.rotation.z = Math.sin(t * 1.3 + e.id) * 0.035;
      if (barM) barM.emissiveIntensity = 1.4 + Math.sin(t * 8) * 0.6 + (fx?.pulse ?? 0);
      side.forEach((a, i) => { a.position.x = (i ? 1 : -1) * (2.45 + Math.max(0, Math.sin(t * 6 + i * Math.PI)) * 0.2); });
      root.rotation.x = e.charging ? -0.25 : 0;
    },
  };
};
register('popup', popupModel({}));
register('popupSlider', popupModel({ bar: 0xea4335, barAt: -1.42, arrows: true }));
register('popupCharger', popupModel({ bar: 0xff9100, barAt: 1.42 }));

// Cactus du jeu Chrome, en volumes arrondis gris
const CACTUS = 0x5f6368, CACTUS_LIGHT = 0x80868b;
const cactusArm = (g, x, h, y) => mesh(g, rbox(0.6, h, 0.6, 0.18), std(CACTUS), x, y, 0);
register('cactus', () => {
  const g = new THREE.Group();
  mesh(g, rbox(0.92, 2.15, 0.92, 0.26), std(CACTUS), 0, 1.07, 0);
  cactusArm(g, -0.9, 1.0, 1.35); cactusArm(g, -0.6, 0.42, 1.0);
  cactusArm(g, 0.9, 0.9, 1.55); cactusArm(g, 0.6, 0.42, 1.2);
  for (const [x, y, z] of [[0.47, 0.6, 0], [-0.47, 1.7, 0], [0, 1.9, 0.47], [0, 0.8, -0.47], [-1.2, 1.6, 0], [1.2, 1.8, 0]]) {
    const s = mesh(g, G().thin, std(CACTUS_LIGHT), x, y, z, false); s.scale.set(0.12, 0.12, 0.12);
  }
  return g;
});
register('cactusBig', () => {
  const g = new THREE.Group();
  for (let i = -1; i <= 1; i++) { const h = i === 0 ? 2.4 : 1.6; mesh(g, rbox(0.82, h, 0.82, 0.24), std(CACTUS), i * 1.2, h / 2, 0); }
  return g;
});

register('rollingCookie', () => {
  // disque de profil (axe = latéral) qui tourne sur lui-même en roulant vers le dino
  const g = new THREE.Group(), side = new THREE.Group(), wheel = new THREE.Group();
  side.position.y = 1.6; side.rotation.y = Math.PI / 2;
  g.add(side); side.add(wheel);
  const m = new THREE.Mesh(cookieGeo, lambert(0xc68642)); m.castShadow = true; wheel.add(m);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (const z of [0.32, -0.32]) cube(wheel, 0x3e2723, 0.35, 0.35, 0.2, Math.cos(a) * 0.9, Math.sin(a) * 0.9, z);
  }
  return { object: g, update(e, dt, t) { wheel.rotation.z = -t * 8; } };
});


register('laserBolt', () => {
  const m = new THREE.Mesh(box, own(new THREE.MeshBasicMaterial({ color: 0xff1744 })));
  m.scale.set(0.25, 0.25, 2.2);
  return m;
});

// Ptérodactyle pixel (jeu Chrome) : ailes qui battent
register('ptero', () => {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  cube(body, GREY, 0.6, 0.5, 2.2, 0, 0, 0);          // corps
  cube(body, GREY, 0.5, 0.45, 0.9, 0, 0.25, 1.3);     // tête
  cube(body, GREY, 0.3, 0.2, 0.9, 0, 0.15, 2.1);      // bec
  cube(body, GREY, 0.2, 0.3, 0.6, 0, 0.5, 0.9);       // crête
  const wings = [-1, 1].map((sd) => {
    const w = new THREE.Group(); w.position.set(sd * 0.3, 0.1, 0.1); body.add(w);
    cube(w, GREY, 1.8, 0.12, 1.0, sd * 0.9, 0, 0);
    cube(w, GREY, 1.0, 0.12, 0.6, sd * 2.1, 0, -0.2);
    return { w, sd };
  });
  g.rotation.y = Math.PI; // vole vers le dino
  return { object: g, update(e, dt, t) { for (const { w, sd } of wings) w.rotation.z = sd * Math.sin(t * 12 + e.id) * 0.6; body.position.y = Math.sin(t * 6) * 0.15; } };
});

// Roue de chargement qui roule vers le dino
register('spinner', () => {
  const g = new THREE.Group(), side = new THREE.Group(), wheel = new THREE.Group();
  side.position.y = 1.6; side.rotation.y = Math.PI / 2;
  g.add(side); side.add(wheel);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = cube(wheel, i < 2 ? 0x1a73e8 : 0xc8d3e0, 0.45, 0.45, 0.5, Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
    c.rotation.z = a;
  }
  return { object: g, update(e, dt, t) { wheel.rotation.z = e.charging ? -t * 9 : -t * 3; } };
});

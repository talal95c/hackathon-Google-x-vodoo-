import * as THREE from 'three';
import { Models, cube, lambert } from '../ModelRegistry.js';
import { entityType, siteKey } from '../../ai/SiteWorld.js';

// Modèles des obstacles générés : une forme par comportement, habillée de la texture générée.
// La texture démarre en "secours" (couleur + nom) et est remplacée dès que l'image arrive.
const textures = new Map(); // `${type}` ou `${key}:billboard:${i}` → CanvasTexture

function canvasTexture(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Dessine : image (si dispo) ou fond coloré, + bandeau avec le nom
function paintObstacle(tex, { color, label }, img) {
  const c = tex.image, g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`; g.fillRect(0, 0, W, H);
  if (img) g.drawImage(img, 0, 0, W, H);
  else { g.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 6; i++) g.fillRect(0, i * H / 6, W, H / 24); }
  g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(0, H * 0.78, W, H * 0.22);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 34; g.font = `bold ${size}px sans-serif`;
  while (g.measureText(label).width > W * 0.92 && size > 14) g.font = `bold ${--size}px sans-serif`;
  g.fillText(label, W / 2, H * 0.89);
  tex.needsUpdate = true;
}

function paintBillboard(tex, { text, edge, accent }, img) {
  const c = tex.image, g = c.getContext('2d'), W = c.width, H = c.height;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, `#${accent.toString(16).padStart(6, '0')}`); grad.addColorStop(1, `#${edge.toString(16).padStart(6, '0')}`);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (img) { const k = Math.max(W / img.width, H / img.height); g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H * 0.7, W, H * 0.3);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 64; g.font = `900 ${size}px sans-serif`;
  while (g.measureText(text).width > W * 0.92 && size > 20) g.font = `900 ${--size}px sans-serif`;
  g.fillText(text, W / 2, H * 0.85);
  tex.needsUpdate = true;
}

const loadImage = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// Enregistre les modèles d'un site (idempotent) et applique les textures déjà connues
export function registerSiteModels(spec) {
  const key = siteKey(spec);
  for (const o of spec.obstacles) {
    const type = entityType(spec, o);
    if (!textures.has(type)) { const t = canvasTexture(256, 256); paintObstacle(t, o, null); textures.set(type, t); }
    const tex = textures.get(type);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const side = lambert(o.color);
    const faced = [side, side, side, side, mat, mat];
    if (!Models.has(type)) Models.register(type, SHAPES[o.behavior](faced, mat, o));
    if (o.texture) setSiteImage(spec, o.id, o.texture);
  }
  for (let i = 0; i < Math.max(1, spec.billboards.length); i++) {
    const k = `${key}:billboard:${i}`;
    if (!textures.has(k)) { const t = canvasTexture(512, 288); paintBillboard(t, { text: spec.billboards[i] || spec.name, edge: spec.palette.edge, accent: spec.palette.accent }, null); textures.set(k, t); }
  }
  if (spec.billboardTexture) setSiteImage(spec, 'billboard', spec.billboardTexture);
}

// Une image générée arrive (ou vient du cache) → mise à jour en direct des textures
export async function setSiteImage(spec, id, dataURL) {
  const img = await loadImage(dataURL);
  if (!img) return;
  const key = siteKey(spec);
  if (id === 'billboard') {
    spec.billboards.forEach((text, i) => { const t = textures.get(`${key}:billboard:${i}`); if (t) paintBillboard(t, { text, edge: spec.palette.edge, accent: spec.palette.accent }, img); });
  } else {
    const o = spec.obstacles.find((x) => x.id === id), t = o && textures.get(entityType(spec, o));
    if (t) paintObstacle(t, o, img);
  }
}

export const billboardTexture = (spec, i) => textures.get(`${siteKey(spec)}:billboard:${i % Math.max(1, spec.billboards.length)}`);

// Formes par comportement
const discGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.4, 28).rotateX(Math.PI / 2);
const SHAPES = {
  // bas et large : on saute dessus
  jump: (faced) => () => { const g = new THREE.Group(); cube(g, faced, 3.6, 1.5, 0.8, 0, 0.75, 0); return g; },
  // grand panneau flottant : on l'esquive
  dodge: (faced, mat, o) => () => {
    const g = new THREE.Group();
    const p = cube(g, faced, 4, 3, 0.35, 0, 2.1, 0);
    cube(g, o.color, 0.25, 0.6, 0.25, -1.6, 0.3, 0); cube(g, o.color, 0.25, 0.6, 0.25, 1.6, 0.3, 0);
    return { object: g, update(e, dt, t) { p.position.y = 2.1 + Math.sin(t * 2 + e.id) * 0.2; } };
  },
  // disque face au joueur qui fonce en tournoyant
  charge: (faced, mat, o) => () => {
    const g = new THREE.Group(), disc = new THREE.Mesh(discGeo, [lambert(o.color), mat, mat]);
    disc.castShadow = true; disc.position.y = 1.7; g.add(disc);
    return { object: g, update(e, dt, t) { disc.rotation.z = e.charging ? -t * 6 : Math.sin(t * 2) * 0.2; g.rotation.x = e.charging ? -0.2 : 0; } };
  },
  // cube flottant qui tourne en zigzaguant
  zigzag: (faced, mat) => () => {
    const g = new THREE.Group(), c = cube(g, mat, 2.4, 2.4, 2.4, 0, 1.7, 0);
    return { object: g, update(e, dt, t) { c.rotation.y = t * 1.5; c.position.y = 1.7 + Math.sin(t * 3 + e.id) * 0.25; } };
  },
};

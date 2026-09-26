import * as THREE from 'three';
import { Models } from '../ModelRegistry.js';
import { entityType, siteKey } from '../../ai/SiteWorld.js';

// Obstacles générés en SPRITES DÉCOUPÉS (style "papier") : image détourée sur un plan, tranche
// sombre derrière pour le relief, ombre au sol, et une animation par comportement.
// En attendant l'image, une carte arrondie avec le nom. Tout se met à jour en direct quand elle arrive.
const sprites = new Map();   // type → { mat, back, aspect }
const posters = new Map();   // `${key}:billboard:${i}` → CanvasTexture

const loadImage = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const css = (n) => `#${n.toString(16).padStart(6, '0')}`;

function placeholderCard({ color, label }) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(8, 40, 240, 176, 36); g.fill();
  g.fillStyle = css(color); g.beginPath(); g.roundRect(20, 52, 216, 152, 28); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 40; g.font = `900 ${size}px sans-serif`;
  while (g.measureText(label).width > 200 && size > 14) g.font = `900 ${--size}px sans-serif`;
  g.fillText(label, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function spriteFor(spec, o) {
  const type = entityType(spec, o);
  if (!sprites.has(type)) {
    const map = placeholderCard(o);
    const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.35, side: THREE.DoubleSide });
    const back = new THREE.MeshBasicMaterial({ map, color: 0x2a2a2a, alphaTest: 0.35, side: THREE.DoubleSide });
    sprites.set(type, { mat, back, aspect: 1 });
  }
  return sprites.get(type);
}

const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // pivot en bas
const shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });

// Un sprite "carton" : face + tranche + ombre. height = hauteur en mètres
function standee(sp, height) {
  const root = new THREE.Group(), card = new THREE.Group();
  root.add(card);
  const face = new THREE.Mesh(plane, sp.mat);
  face.rotation.y = Math.PI; // face au dino qui arrive (sinon image en miroir)
  const back = new THREE.Mesh(plane, sp.back);
  back.rotation.y = Math.PI; back.position.z = 0.07;
  card.add(face, back);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.03;
  root.add(shadow);
  const fit = () => {
    const w = Math.min(4.2, height * sp.aspect);
    const h = w / sp.aspect;
    card.scale.set(w, h, 1);
    shadow.scale.set(w * 0.45, 1, 0.9);
  };
  fit();
  return { root, card, shadow, fit };
}

// Animations par comportement
const SHAPES = {
  // bas : on saute par-dessus. Se tortille sur place
  jump: (sp) => () => {
    const s = standee(sp, 1.7);
    return { object: s.root, update(e, dt, t) { s.fit(); s.card.rotation.z = Math.sin(t * 6 + e.id) * 0.08; s.card.scale.y *= 1 + Math.sin(t * 12 + e.id) * 0.04; } };
  },
  // grand et flottant : on l'esquive. Flotte et oscille
  dodge: (sp) => () => {
    const s = standee(sp, 3.4);
    return { object: s.root, update(e, dt, t) { s.fit(); s.card.position.y = 0.3 + Math.sin(t * 2.2 + e.id) * 0.25; s.card.rotation.z = Math.sin(t * 1.4 + e.id) * 0.06; } };
  },
  // fonce vers le dino en bondissant (écrasement / étirement)
  charge: (sp) => () => {
    const s = standee(sp, 2.8);
    return {
      object: s.root,
      update(e, dt, t) {
        s.fit();
        const hop = e.charging ? Math.abs(Math.sin(t * 9 + e.id)) : Math.abs(Math.sin(t * 3 + e.id)) * 0.3;
        s.card.position.y = hop * 0.9;
        const squash = e.charging && hop < 0.25 ? 0.85 : 1.05;
        s.card.scale.y *= squash; s.card.scale.x /= Math.sqrt(squash);
        s.card.rotation.x = e.charging ? -0.18 : 0;
        s.shadow.scale.multiplyScalar(1 - hop * 0.35);
      },
    };
  },
  // glisse de gauche à droite en se penchant dans ses virages
  zigzag: (sp) => () => {
    const s = standee(sp, 2.8);
    let lastD = null;
    return {
      object: s.root,
      update(e, dt, t) {
        s.fit();
        const v = lastD === null || dt === 0 ? 0 : (e.d - lastD) / dt;
        lastD = e.d;
        s.card.rotation.z += (-v * 0.12 - s.card.rotation.z) * Math.min(1, dt * 10);
        s.card.position.y = Math.abs(Math.sin(t * 7 + e.id)) * 0.3;
      },
    };
  },
};

// Enregistre les modèles d'un site (idempotent) et applique les images déjà connues
export function registerSiteModels(spec) {
  const key = siteKey(spec);
  for (const o of spec.obstacles) {
    const type = entityType(spec, o);
    const sp = spriteFor(spec, o);
    if (!Models.has(type)) Models.register(type, SHAPES[o.behavior](sp));
    if (!Models.has(`${type}:giant`)) Models.register(`${type}:giant`, () => { const s = standee(sp, 14); return { object: s.root, update() { s.fit(); } }; });
    if (o.texture) setSiteImage(spec, o.id);
  }
  for (let i = 0; i < Math.max(1, spec.billboards.length); i++) {
    const k = `${key}:billboard:${i}`;
    if (!posters.has(k)) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 288;
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      posters.set(k, t);
      paintPoster(t, spec.billboards[i] || spec.name, spec, null);
    }
  }
  if (spec.billboardTexture) setSiteImage(spec, 'billboard');
}

function paintPoster(tex, text, spec, img) {
  const c = tex.image, g = c.getContext('2d'), W = c.width, H = c.height;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, css(spec.palette.accent)); grad.addColorStop(1, css(spec.palette.edge));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (img) { const k = Math.max(W / img.width, H / img.height); g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H * 0.7, W, H * 0.3);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 64; g.font = `900 ${size}px sans-serif`;
  while (g.measureText(text).width > W * 0.92 && size > 20) g.font = `900 ${--size}px sans-serif`;
  g.fillText(text, W / 2, H * 0.85);
  tex.needsUpdate = true;
}

// Une image arrive (génération ou cache) → mise à jour en direct
export async function setSiteImage(spec, id) {
  const key = siteKey(spec);
  if (id === 'billboard') {
    const img = await loadImage(spec.billboardTexture);
    if (img) spec.billboards.forEach((text, i) => { const t = posters.get(`${key}:billboard:${i}`); if (t) paintPoster(t, text, spec, img); });
    return;
  }
  const o = spec.obstacles.find((x) => x.id === id);
  if (!o?.texture) return;
  const img = await loadImage(o.texture);
  if (!img) return;
  const sp = spriteFor(spec, o);
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
  sp.mat.map?.dispose();
  sp.mat.map = tex; sp.back.map = tex;
  sp.mat.needsUpdate = true; sp.back.needsUpdate = true;
  sp.aspect = o.aspect || img.width / img.height;
}

export const billboardTexture = (spec, i) => posters.get(`${siteKey(spec)}:billboard:${i % Math.max(1, spec.billboards.length)}`);

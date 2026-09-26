import * as THREE from 'three';
import { Models, box, lambert, cube } from '../ModelRegistry.js';
import * as TX from '../textures.js';

// Modèles par défaut des entités (cubes + textures dessinées au canvas).
// Remplacer un modèle : Models.register('<type>', ...) dans un autre fichier chargé après.

let T = null;
const tex = () => T || (T = {
  popup: new THREE.MeshLambertMaterial({ map: TX.popupTex() }),
  cookie: new THREE.MeshLambertMaterial({ map: TX.cookieTex() }),
  tabs: ['Nouvel onglet', 'Sans titre', 'Chargement…', '404'].map((l) => new THREE.MeshLambertMaterial({ map: TX.tabTex(l) })),
  loading: new THREE.MeshBasicMaterial({ map: TX.loadingTex() }),
  favicon: new THREE.MeshBasicMaterial({ map: TX.faviconTex(), transparent: true }),
});
const faced = (side, front) => [lambert(side), lambert(side), lambert(side), lambert(side), front, front];
const coinGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20).rotateX(Math.PI / 2);
const cookieGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.6, 18).rotateX(Math.PI / 2);
const pickupGeo = new THREE.OctahedronGeometry(0.9);
const GREY = 0x535353;

Models.register('cactus', () => {
  const g = new THREE.Group();
  cube(g, GREY, 0.9, 2.1, 0.9, 0, 1.05, 0);
  cube(g, GREY, 0.6, 1.0, 0.6, -0.9, 1.3, 0);
  cube(g, GREY, 0.6, 0.45, 0.6, -0.6, 1.0, 0);
  cube(g, GREY, 0.6, 0.9, 0.6, 0.9, 1.5, 0);
  cube(g, GREY, 0.6, 0.45, 0.6, 0.6, 1.2, 0);
  return g;
});

Models.register('cactusBig', () => {
  const g = new THREE.Group();
  for (let i = -1; i <= 1; i++) { const h = i === 0 ? 2.4 : 1.6; cube(g, GREY, 0.8, h, 0.8, i * 1.2, h / 2, 0); }
  return g;
});

const popup = () => {
  const g = new THREE.Group();
  const m = cube(g, faced(0xdddddd, tex().popup), 4, 2.5, 0.3, 0, 1.8, 0);
  return { object: g, update(e, dt, t) { m.position.y = 1.8 + Math.sin(t * 2 + e.id) * 0.3; } };
};
Models.register('popup', popup);
Models.register('popupSlider', () => {
  const p = popup();
  cube(p.object, 0xe53935, 4.1, 0.15, 0.35, 0, 0.3, 0, false); // liseré rouge = "celui-là bouge"
  return p;
});

Models.register('tabWall', () => {
  const g = new THREE.Group();
  const mat = tex().tabs[Math.floor(Math.random() * 4)];
  cube(g, faced(0xeeeeee, mat), 5, 1.25, 0.4, 0, 0.8, 0);
  return g;
});

Models.register('cookieBanner', () => {
  const g = new THREE.Group();
  cube(g, faced(0xfffbe8, tex().cookie), 6.5, 1.3, 0.3, 0, 0.9, 0);
  return g;
});

Models.register('rollingCookie', () => {
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

Models.register('coin', () => {
  const m = new THREE.Mesh(coinGeo, tex().favicon);
  m.position.y = 1.2;
  return { object: m, update(e, dt, t) { m.rotation.y = t * 3 + e.id; } };
});

Models.register('boostPad', () => {
  const m = new THREE.Mesh(box, tex().loading);
  m.scale.set(3, 0.06, 5); m.position.y = 0.05;
  return { object: m, update(e, dt, t) { m.material.map.offset.x = -t * 1.5; } };
});

// Bonus : cristal flottant de la couleur de l'effet
const pickup = (color, icon) => () => {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(pickupGeo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
  gem.position.y = 1.8; gem.castShadow = true; g.add(gem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring);
  return { object: g, update(e, dt, t) { gem.rotation.y = t * 2.5; gem.position.y = 1.8 + Math.sin(t * 3) * 0.25; } };
};
Models.register('laserPickup', pickup(0xff1744));
Models.register('shieldPickup', pickup(0x2979ff));
Models.register('magnetPickup', pickup(0xaa00ff));
Models.register('doubleCoinsPickup', pickup(0xffc400));

Models.register('laserBolt', () => {
  const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xff1744 }));
  m.scale.set(0.25, 0.25, 2.2);
  return m;
});

import * as THREE from 'three';
import { Models, lambert, cube } from '../ModelRegistry.js';
import * as TX from '../textures.js';

// Décor hors piste (purement visuel). Clé = zone.decor.
let T = null;
const tex = () => T || (T = {
  tabs: ['Nouvel onglet', 'Sans titre', 'Chargement…', '404'].map((l) => new THREE.MeshLambertMaterial({ map: TX.tabTex(l) })),
  ads: [0, 50, 120, 200, 280, 330].map((h, i) => new THREE.MeshBasicMaterial({ map: TX.adTex(h + i) })),
});
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

Models.register('decor:clouds', () => {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = rand(-3, 3), y = rand(0, 1.4);
    cube(g, 0xcfcfcf, rand(3, 5), 0.8, 1.2, x, y, 0, false);
    cube(g, 0xcfcfcf, rand(1.5, 2.5), 0.8, 1.2, x + rand(-1, 1), y + 0.8, 0, false);
  }
  g.scale.setScalar(rand(1, 2));
  return g;
});

Models.register('decor:windows', () => {
  const g = new THREE.Group();
  const w = rand(8, 16), h = rand(6, 12);
  cube(g, 0xffffff, w, h, 0.5, 0, 0, 0, false);
  cube(g, 0x1a73e8, w, 1, 0.6, 0, h / 2 - 0.5, 0, false);
  cube(g, pick(tex().tabs), Math.min(6, w * 0.4), 1.2, 0.6, -w / 4, h / 2 + 0.6, 0, false);
  return g;
});

Models.register('decor:ads', () => {
  const g = new THREE.Group();
  const s = rand(5, 11);
  cube(g, pick(tex().ads), s, s, 0.4, 0, 0, 0, false);
  return g;
});

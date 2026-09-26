import * as THREE from 'three';
import { Models, cube } from '../ModelRegistry.js';

// Modèles de la Course Royale : boîte « ? », onglet piège, laser de course.
function questionTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffb300'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(3, 3, 58, 58);
  x.fillStyle = '#fff'; x.font = 'bold 46px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('?', 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let qTex = null;

Models.register('itemBox', () => {
  qTex ??= questionTexture();
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshLambertMaterial({ map: qTex, emissive: 0x442200, transparent: true, opacity: 0.92 }));
  m.position.y = 1.6; m.castShadow = true; g.add(m);
  return { object: g, update(e, dt, t) { m.rotation.set(t * 0.9, t * 1.6, 0); m.position.y = 1.6 + Math.sin(t * 3 + e.z) * 0.2; } };
});

Models.register('trapTab', () => {
  const g = new THREE.Group();
  cube(g, 0xe53935, 2.2, 1.2, 0.3, 0, 0.8, 0);
  cube(g, 0xffffff, 2.0, 0.25, 0.32, 0, 1.25, 0);
  cube(g, 0x111111, 0.3, 0.3, 0.34, 0.8, 1.25, 0);
  return { object: g, update(e, dt, t) { g.rotation.z = Math.sin(t * 8) * 0.08; } };
});

Models.register('weapon:raceLaser', (p) => Models.create('weapon:laser', p));

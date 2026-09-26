import * as THREE from 'three';
import { Models, cube } from '../ModelRegistry.js';

// Visuels d'armes, attachés au dino par RunnerView (clé 'weapon:<id>').
// update(weapon, dt, time) reçoit l'instance d'arme du kernel (timeLeft, progress…).
Models.register('weapon:laser', () => {
  const g = new THREE.Group();
  cube(g, 0x222222, 0.35, 0.35, 1.2, 0.9, 2.6, 0.6);
  const tip = cube(g, new THREE.MeshBasicMaterial({ color: 0xff1744 }), 0.4, 0.4, 0.2, 0.9, 2.6, 1.25, false);
  return {
    object: g,
    update(w, dt, t) { tip.scale.setScalar(1 + Math.sin(t * 30) * 0.3); g.visible = w.progress > 0.25 || Math.floor(t * 10) % 2 === 0; },
  };
});

Models.register('weapon:shield', () => {
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6, 1),
    new THREE.MeshBasicMaterial({ color: 0x40c4ff, transparent: true, opacity: 0.25, wireframe: true }),
  );
  m.position.y = 2;
  return {
    object: m,
    update(w, dt, t) { m.rotation.y = t * 1.5; m.material.opacity = w.progress > 0.25 ? 0.3 : (Math.floor(t * 10) % 2) * 0.3; },
  };
});

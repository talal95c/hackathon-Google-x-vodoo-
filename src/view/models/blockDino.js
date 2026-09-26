import * as THREE from 'three';
import { Models, cube } from '../ModelRegistry.js';

// Dino en cubes façon pixel art Chrome. Sert aussi d'exemple de modèle de personnage :
//
//   factory(skinView) → { object, update(pose, dt, time), onEvent(type, payload) }
//
// pose (calculée par RunnerView à partir du kernel) :
//   { state: 'idle'|'run'|'jump'|'slide'|'stumble'|'fall', speed, gait, steer, grounded, vy, boost, driftCharge }
Models.register('blockDino', (view = {}) => {
  const color = view.color ?? 0x535353;
  const mat = new THREE.MeshLambertMaterial({ color, emissive: view.emissive ?? 0x000000 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: view.eye ?? 0xffffff });

  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  cube(body, mat, 1.4, 1.5, 1.9, 0, 2.0, 0);        // corps
  cube(body, mat, 1.0, 0.9, 0.9, 0, 2.8, 0.7);      // cou
  const head = new THREE.Group(); head.position.set(0, 3.35, 1.0); body.add(head);
  cube(head, mat, 1.2, 1.0, 1.7, 0, 0, 0.35);
  cube(head, mat, 1.2, 0.3, 0.9, 0, -0.55, 0.6);    // mâchoire
  for (const s of [1, -1]) {
    cube(head, eyeMat, 0.08, 0.28, 0.28, s * 0.61, 0.15, 0.25);
    cube(head, 0x111111, 0.1, 0.14, 0.14, s * 0.62, 0.15, 0.3);
  }
  const tail = new THREE.Group(); tail.position.set(0, 2.1, -0.9); body.add(tail);
  cube(tail, mat, 0.9, 0.9, 1.1, 0, 0, -0.5);
  cube(tail, mat, 0.55, 0.55, 1.0, 0, -0.15, -1.4);
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group(); a.position.set(s * 0.55, 2.2, 0.8); body.add(a);
    cube(a, mat, 0.28, 0.28, 0.6, 0, -0.1, 0.25);
    return a;
  });
  const legs = [-1, 1].map((s) => {
    const l = new THREE.Group(); l.position.set(s * 0.42, 1.35, -0.1); body.add(l);
    cube(l, mat, 0.5, 1.0, 0.65, 0, -0.5, 0);
    cube(l, mat, 0.5, 0.3, 0.9, 0, -1.1, 0.2);
    return l;
  });

  let squash = 0, steerVis = 0;
  const approach = (o, key, target, k) => { o[key] += (target - o[key]) * k; };

  return {
    object: root,
    head, // point d'attache (armes, chapeaux…)

    update(p, dt) {
      steerVis += (p.steer - steerVis) * Math.min(1, dt * 10);
      const run = Math.min(1.4, p.speed / 26);
      const s = Math.sin(p.gait);
      const k = Math.min(1, dt * 14);

      if (p.grounded) {
        legs[0].rotation.x = s * 0.95 * run;
        legs[1].rotation.x = -s * 0.95 * run;
        arms[0].rotation.x = -s * 0.6;
        arms[1].rotation.x = s * 0.6;
        body.position.y = Math.abs(Math.cos(p.gait)) * 0.22 * run;
        tail.rotation.y = s * 0.25;
        tail.rotation.x = 0.1;
      } else {
        for (const l of legs) approach(l.rotation, 'x', -0.8, k);
        for (const a of arms) approach(a.rotation, 'x', -1.2, k);
        body.position.y = 0;
        tail.rotation.x = -0.4;
      }
      if (p.state === 'slide') { legs[0].rotation.x = 0.8; legs[1].rotation.x = -0.4; }

      // écrasement à l'atterrissage, étirement en l'air
      squash = Math.max(0, squash - dt * 5);
      const st = p.grounded ? 1 - squash * 0.3 : 1 + Math.min(0.12, Math.abs(p.vy) * 0.008);
      body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));

      body.rotation.x = 0.12 * run + (p.boost ? 0.15 : 0) + (p.state === 'stumble' ? 0.4 : 0);
      body.rotation.z = -steerVis * (p.state === 'slide' ? 0.4 : 0.2);
      head.rotation.x = -0.1 * run + Math.sin(p.gait * 2) * 0.04;
      head.rotation.y = steerVis * 0.25;
    },

    onEvent(type, payload) {
      if (type === 'runner:land') squash = Math.min(1, payload.impact * 1.2);
    },
  };
});

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Models } from '../ModelRegistry.js';

// A small, articulated low-poly toy. All assets are built locally, with no downloads.
Models.register('reggaeDino', () => {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const geometries = new Set(), materials = new Set();
  const material = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, flatShading: true, ...extra });
    materials.add(m); return m;
  };
  const mint = material(0x24be9f), lightMint = material(0x64dfab);
  const cream = material(0xffe8a6), gold = material(0xffc637);
  const red = material(0xf15b50), green = material(0x289a61);
  const ink = material(0x193d47), lens = material(0x173044, { roughness: 0.25, metalness: 0.3 });
  const glow = material(0xffc637, { emissive: 0xffb52e, emissiveIntensity: 0.6 });
  const geo = (g) => { geometries.add(g); return g; };
  const facet = geo(new THREE.IcosahedronGeometry(1, 1));
  const rounded = geo(new RoundedBoxGeometry(1, 1, 1, 1, 0.16));
  const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 10));
  const spike = geo(new THREE.ConeGeometry(1, 1, 4));
  const sphere = geo(new THREE.IcosahedronGeometry(1, 0));
  function part(parent, geometry, mat, scale, position) {
    const m = new THREE.Mesh(geometry, mat);
    m.scale.set(...scale); m.position.set(...position);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  part(body, facet, mint, [0.89, 1.06, 1.03], [0, 1.9, -0.04]);
  part(body, facet, cream, [0.7, 0.82, 0.25], [0, 1.92, 0.82]);
  part(body, facet, lightMint, [0.56, 0.67, 0.57], [0, 2.68, 0.55]);

  const head = new THREE.Group(); head.position.set(0, 3.17, 0.78); body.add(head);
  part(head, facet, mint, [0.9, 0.74, 0.91], [0, 0.03, 0.13]);
  part(head, rounded, lightMint, [1.5, 0.65, 1.19], [0, -0.18, 0.76]);
  part(head, rounded, cream, [1.23, 0.2, 1.02], [0, -0.54, 0.76]);
  for (const s of [-1, 1]) {
    part(head, sphere, ink, [0.065, 0.035, 0.07], [s * 0.43, 0.13, 1.21]);
    const glasses = part(head, rounded, ink, [0.6, 0.4, 0.2], [s * 0.4, 0.24, 0.84]);
    glasses.rotation.y = s * 0.12;
    part(head, rounded, lens, [0.46, 0.27, 0.035], [s * 0.4, 0.26, 0.96]);
    part(head, rounded, cream, [0.23, 0.025, 0.018], [s * 0.4 - 0.04, 0.33, 0.983]).rotation.z = -0.23;
    part(head, rounded, gold, [0.07, 0.1, 0.75], [s * 0.75, 0.28, 0.45]);
    // Over-ear headphones remain visible from the chase camera.
    const cup = part(head, cylinder, gold, [0.27, 0.16, 0.27], [s * 0.83, 0.09, 0]);
    cup.rotation.z = Math.PI / 2;
    const pad = part(head, cylinder, ink, [0.19, 0.18, 0.19], [s * 0.94, 0.09, 0]);
    pad.rotation.z = Math.PI / 2;
  }
  part(head, rounded, gold, [0.3, 0.07, 0.11], [0, 0.3, 0.96]);
  const hat = new THREE.Group(); head.add(hat);
  hat.position.set(-0.04, 0.57, -0.06); hat.rotation.z = -0.12;
  part(hat, cylinder, green, [0.85, 0.17, 0.76], [0, 0, 0]);
  part(hat, cylinder, gold, [0.84, 0.15, 0.75], [0, 0.15, 0]);
  part(hat, cylinder, red, [0.77, 0.16, 0.69], [0, 0.3, 0]);
  part(hat, facet, green, [0.71, 0.36, 0.63], [0, 0.35, -0.05]);
  part(hat, sphere, gold, [0.18, 0.17, 0.18], [-0.08, 0.69, -0.1]);

  const tail = new THREE.Group(); tail.position.set(0, 1.96, -0.78); body.add(tail);
  part(tail, facet, mint, [0.48, 0.48, 0.8], [0, 0, -0.56]);
  part(tail, facet, lightMint, [0.3, 0.3, 0.7], [0, 0.04, -1.34]);
  part(tail, facet, mint, [0.15, 0.17, 0.53], [0, 0.16, -1.95]);
  for (let i = 0; i < 4; i++) {
    part(tail, spike, i % 2 ? red : gold, [0.2 - i * 0.025, 0.4 - i * 0.045, 0.25], [0, 0.42 - i * 0.045, -0.15 - i * 0.47]);
  }
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group(); a.position.set(s * 0.7, 2.24, 0.49); body.add(a);
    part(a, facet, mint, [0.23, 0.35, 0.27], [s * 0.06, -0.2, 0.11]);
    part(a, facet, lightMint, [0.24, 0.21, 0.24], [s * 0.08, -0.41, 0.27]);
    part(a, cylinder, gold, [0.23, 0.12, 0.23], [s * 0.08, -0.36, 0.25]);
    return a;
  });
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group(); leg.position.set(s * 0.48, 1.22, -0.1); body.add(leg);
    part(leg, facet, mint, [0.38, 0.55, 0.43], [0, -0.24, 0]);
    part(leg, rounded, red, [0.59, 0.36, 0.91], [0, -0.81, 0.22]);
    part(leg, rounded, cream, [0.62, 0.14, 0.96], [0, -1.01, 0.23]);
    for (let j = 0; j < 2; j++) part(leg, rounded, gold, [0.4, 0.035, 0.065], [0, -0.61, 0.3 + j * 0.13]);
    return leg;
  });
  // Mini sound-system backpack: readable even while running away from the camera.
  part(body, rounded, gold, [0.97, 1.25, 0.42], [0, 2.22, -0.91]);
  part(body, rounded, ink, [0.78, 1.04, 0.08], [0, 2.22, -1.16]);
  const speakers = [0, 1].map((i) => {
    const cone = part(body, cylinder, i ? glow : mint, [i ? 0.16 : 0.24, 0.04, i ? 0.16 : 0.24], [0, 2.03 + i * 0.49, -1.22]);
    cone.rotation.x = Math.PI / 2; return cone;
  });
  let squash = 0;
  return {
    object: root,
    rig: { body, head, arms, legs, tail },
    update(p, dt, time) {
      const beat = Math.sin(p.gait), energy = Math.min(1.3, p.speed / 26);
      const idle = p.state === 'idle';
      body.position.y = p.grounded ? Math.abs(Math.cos(p.gait)) * (idle ? 0.07 : 0.14) : 0;
      body.rotation.z = -p.steer * (p.state === 'slide' ? 0.32 : 0.15) + (idle ? Math.sin(time * 2.2) * 0.06 : 0);
      body.rotation.x = (p.state === 'stumble' ? 0.4 : 0.06) + (p.boost ? 0.15 : 0);
      legs.forEach((l, i) => { l.rotation.x = p.grounded ? beat * (i ? -1 : 1) * energy * (idle ? 0.14 : 0.78) : -0.65; });
      arms.forEach((a, i) => { a.rotation.x = p.grounded ? beat * (i ? 1 : -1) * 0.38 : -0.85; });
      if (p.state === 'slide') { legs[0].rotation.x = 0.8; legs[1].rotation.x = -0.35; }
      tail.rotation.y = beat * 0.21; tail.rotation.x = p.grounded ? -0.06 : -0.3;
      head.rotation.x = Math.cos(p.gait) * 0.065;
      head.rotation.y = p.steer * 0.2 + (idle ? Math.sin(time * 1.2) * 0.1 : 0);
      hat.rotation.z = -0.12 + beat * 0.025;
      speakers.forEach((s) => { s.scale.x = s.scale.z = (s === speakers[0] ? 0.24 : 0.16) * (1 + Math.max(0, beat) * 0.12); });
      squash = Math.max(0, squash - dt * 5);
      const stretch = p.grounded ? 1 - squash * 0.2 : 1.05;
      body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    },
    onEvent(type, payload) { if (type === 'runner:land') squash = Math.min(1, payload.impact); },
    dispose() { geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); },
  };
});

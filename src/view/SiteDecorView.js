import * as THREE from 'three';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { billboardTexture } from './models/site.js';

// Décor d'un monde généré : panneaux publicitaires parodiques (image + slogan générés)
// de part et d'autre de la route, et blocs de couleur du site à l'horizon.
const panelGeo = new THREE.BoxGeometry(11, 6.2, 0.3);
const postGeo = new THREE.BoxGeometry(0.35, 1, 0.35);
const blockGeo = new THREE.BoxGeometry(1, 1, 1);

export class SiteDecorView extends View {
  chunks = new Map();

  constructor(ctx) {
    super(ctx);
    this.listen('chunk:remove', (c) => this.#remove(c.index));
  }

  #build(chunk) {
    const zone = ZONES[chunk.zone];
    const group = new THREE.Group();
    this.chunks.set(chunk.index, group);
    if (!zone?.site) return;
    const spec = zone.site, t = this.track, f = {};
    const post = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const blocks = [spec.palette.edge, spec.palette.accent].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    let i = chunk.index * 2;
    for (let s = chunk.s0 + 20; s < chunk.s1; s += 45, i++) {
      t.frame(s, f);
      const side = i % 2 ? 1 : -1, d = side * (f.w / 2 + 9);
      const x = f.x + f.lx * d, z = f.z + f.lz * d;
      if (t.clearance(x, z, s) < f.w / 2 + 5) continue;
      const tex = billboardTexture(spec, i);
      const face = new THREE.MeshBasicMaterial({ map: tex });
      const sign = new THREE.Group();
      const panel = new THREE.Mesh(panelGeo, [post, post, post, post, face, face]);
      panel.position.y = 7.5;
      const p1 = new THREE.Mesh(postGeo, post); p1.scale.y = 4.5; p1.position.set(-3.5, 2.25, 0);
      const p2 = p1.clone(); p2.position.x = 3.5;
      sign.add(panel, p1, p2);
      sign.position.set(x, f.y, z);
      sign.rotation.y = f.th + Math.PI + side * 0.35; // tourné vers le joueur
      group.add(sign);
    }
    for (let k = 0; k < 8; k++) {
      const s = chunk.s0 + Math.random() * (chunk.s1 - chunk.s0);
      t.frame(s, f);
      const d = (Math.random() < 0.5 ? -1 : 1) * (f.w / 2 + 35 + Math.random() * 50);
      const x = f.x + f.lx * d, z = f.z + f.lz * d;
      if (t.clearance(x, z, s) < 25) continue;
      const m = new THREE.Mesh(blockGeo, blocks[k % 2]);
      const h = 8 + Math.random() * 30;
      m.scale.set(6 + Math.random() * 10, h, 6 + Math.random() * 10);
      m.position.set(x, f.y - 10 + h / 2, z);
      m.rotation.y = f.th;
      group.add(m);
    }
    this.scene.add(group);
  }

  #remove(index) {
    const g = this.chunks.get(index);
    if (!g) return;
    g.removeFromParent();
    this.chunks.delete(index);
  }

  update() {
    for (const c of this.track.chunks) if (!this.chunks.has(c.index) && c.s0 < this.game.runner.z + 320) this.#build(c);
  }
}

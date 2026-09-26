import * as THREE from 'three';
import { View } from './View.js';
import { Models } from './ModelRegistry.js';
import { ZONES } from '../content/zones.js';

// Maillage de la route (un par morceau de 120 m) + décor hors piste.
// Réagit à 'chunk:add' / 'chunk:remove'.
export class TrackView extends View {
  meshes = new Map();

  constructor(ctx) {
    super(ctx);
    this.listen('chunk:add', (c) => this.#build(c));
    this.listen('chunk:remove', (c) => this.#remove(c));
    for (const c of this.track.chunks) this.#build(c); // morceaux déjà générés
  }

  #build(chunk) {
    const t = this.track, zone = ZONES[chunk.zone], pal = zone.palette;
    const top = [], walls = [], edges = [], dashes = [];
    const pt = (i, d, dy = 0) => [t.X[i] + Math.cos(t.TH[i]) * d, t.Y[i] + dy, t.Z[i] - Math.sin(t.TH[i]) * d];
    const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...b, ...d, ...c);
    for (let i = chunk.i0; i < chunk.i1; i++) {
      const w0 = t.W[i] / 2, w1 = t.W[i + 1] / 2;
      quad(top, pt(i, w0), pt(i, -w0), pt(i + 1, w1), pt(i + 1, -w1));
      for (const s of [1, -1]) {
        quad(walls, pt(i, s * w0), pt(i, s * w0, -1.8), pt(i + 1, s * w1), pt(i + 1, s * w1, -1.8));
        quad(edges, pt(i, s * w0, 0.03), pt(i, s * (w0 - 0.45), 0.03), pt(i + 1, s * w1, 0.03), pt(i + 1, s * (w1 - 0.45), 0.03));
      }
      quad(walls, pt(i, w0, -1.8), pt(i, -w0, -1.8), pt(i + 1, w1, -1.8), pt(i + 1, -w1, -1.8));
      if (i % 4 < 2) quad(dashes, pt(i, 0.15, 0.03), pt(i, -0.15, 0.03), pt(i + 1, 0.15, 0.03), pt(i + 1, -0.15, 0.03));
    }
    const group = new THREE.Group();
    const add = (arr, mat, receive = false) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = receive;
      m.userData.trackSurface = true;
      group.add(m);
    };
    add(top, new THREE.MeshLambertMaterial({ color: pal.road, side: THREE.DoubleSide }), true);
    add(walls, new THREE.MeshLambertMaterial({ color: new THREE.Color(pal.road).multiplyScalar(0.72), side: THREE.DoubleSide }));
    const edgeMat = new THREE.MeshBasicMaterial({ color: pal.edge, side: THREE.DoubleSide });
    add(edges, edgeMat);
    this.ctx.beatMaterials?.add(edgeMat); // pulse sur les temps (BeatFx)
    group.userData.edgeMat = edgeMat;
    add(dashes, new THREE.MeshBasicMaterial({ color: pal.dash, side: THREE.DoubleSide }));
    this.#decorate(group, chunk, zone);
    this.scene.add(group);
    this.meshes.set(chunk.index, group);
  }

  #decorate(group, chunk, zone) {
    const t = this.track, f = {};
    for (let k = 0; k < 6; k++) {
      const s = chunk.s0 + Math.random() * (chunk.s1 - chunk.s0);
      t.frame(s, f);
      const d = (Math.random() < 0.5 ? -1 : 1) * (f.w / 2 + 14 + Math.random() * 36);
      const x = f.x + f.lx * d, z = f.z + f.lz * d;
      if (t.clearance(x, z, s) < f.w / 2 + 12) continue; // jamais sur la route (virages)
      const { object } = Models.create(`decor:${zone.decor}`);
      object.position.set(x, f.y - 8 + Math.random() * 22, z);
      object.rotation.y = f.th + (Math.random() - 0.5) * 0.8;
      group.add(object);
    }
  }

  #remove(chunk) {
    const g = this.meshes.get(chunk.index);
    if (!g) return;
    this.scene.remove(g);
    this.ctx.beatMaterials?.delete(g.userData.edgeMat);
    for (const child of g.children) {
      if (!child.userData.trackSurface) continue;
      child.geometry.dispose(); child.material.dispose();
    }
    this.meshes.delete(chunk.index);
  }
}

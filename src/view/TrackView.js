import * as THREE from 'three';
import { View } from './View.js';
import { TRACK } from '../kernel/config.js';
import { isWorldGap } from '../kernel/WorldJourney.js';
import { ZONES } from '../content/zones.js';
import { roadSurface } from './RoadSurface.js';
import { buildRoadArchitecture, disposeRoadArchitecture } from './RoadArchitecture.js';
import * as TX from './textures.js';

let CHEV = null;
const chevrons = () => CHEV || (CHEV = {
  left: new THREE.MeshBasicMaterial({ map: TX.chevronTex(true) }),
  right: new THREE.MeshBasicMaterial({ map: TX.chevronTex(false) }),
  post: new THREE.MeshLambertMaterial({ color: 0x333333 }),
});
const signGeo = new THREE.BoxGeometry(4.5, 1.6, 0.25);
const postGeo = new THREE.BoxGeometry(0.25, 2, 0.25);

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
    // A distant respawn / preview seek generates intermediate kernel chunks;
    // do not allocate GPU scenery that is already behind the player.
    if(chunk.s1<this.game.runner.z-TRACK.behindDistance)return;
    const t = this.track, zone = ZONES[chunk.zone], pal = zone.palette;
    const top = [], topUv = [], walls = [], edges = [];
    const pt = (i, d, dy = 0) => [t.X[i] + Math.cos(t.TH[i]) * d, t.Y[i] + dy, t.Z[i] - Math.sin(t.TH[i]) * d];
    const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...b, ...d, ...c);
    for (let i = chunk.i0; i < chunk.i1; i++) {
      if (isWorldGap((i + .5) * TRACK.step)) continue;
      const w0 = t.W[i] / 2, w1 = t.W[i + 1] / 2;
      quad(top, pt(i, w0), pt(i, -w0), pt(i + 1, w1), pt(i + 1, -w1));
      const s0=i*TRACK.step,s1=(i+1)*TRACK.step;
      topUv.push(w0,s0,-w0,s0,w1,s1,-w0,s0,-w1,s1,w1,s1);
      for (const s of [1, -1]) {
        quad(walls, pt(i, s * w0), pt(i, s * w0, -1.8), pt(i + 1, s * w1), pt(i + 1, s * w1, -1.8));
        quad(edges, pt(i, s * w0, 0.03), pt(i, s * (w0 - 0.45), 0.03), pt(i + 1, s * w1, 0.03), pt(i + 1, s * (w1 - 0.45), 0.03));
      }
      quad(walls, pt(i, w0, -1.8), pt(i, -w0, -1.8), pt(i + 1, w1, -1.8), pt(i + 1, -w1, -1.8));

    }
    const group = new THREE.Group();
    const add = (arr, mat, receive = false, uv = null) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = receive;
      m.userData.trackSurface = true;
      group.add(m);
    };
    add(top, roadSurface(chunk.zone), true, topUv);
    add(walls, new THREE.MeshLambertMaterial({ color: new THREE.Color(pal.road).multiplyScalar(0.72), side: THREE.DoubleSide }));
    const edgeMat = new THREE.MeshBasicMaterial({ color: pal.edge, side: THREE.DoubleSide });
    add(edges, edgeMat);
    this.ctx.beatMaterials?.add(edgeMat); // pulse sur les temps (BeatFx)
    group.userData.edgeMat = edgeMat;
    group.add(buildRoadArchitecture(t,chunk));
    this.#hardTurns(group, chunk);
    // Décors physiques propres à chaque monde : WorldDecorView.
    this.scene.add(group);
    this.meshes.set(chunk.index, group);
  }

  // Virages durs : chevrons sur l'extérieur avant et pendant le virage + vibreurs rouges/blancs
  #hardTurns(group, chunk) {
    const t = this.track, f = {};
    for (const turn of t.hardTurns) {
      if (turn.end < chunk.s0 || turn.s - 40 > chunk.s1) continue;
      const m = chevrons();
      // panneaux : 40 m avant, puis le long de l'extérieur du virage
      for (let s = turn.s - 40; s <= turn.end - 8; s += 12) {
        if (s < chunk.s0 || s >= chunk.s1 || isWorldGap(s)) continue;
        t.frame(s, f);
        const d = -turn.sign * (f.w / 2 + 1.5); // côté extérieur
        const sign = new THREE.Group();
        const panel = new THREE.Mesh(signGeo, [m.post, m.post, m.post, m.post, turn.sign > 0 ? m.left : m.right, turn.sign > 0 ? m.left : m.right]);
        panel.position.y = 2.2;
        const post = new THREE.Mesh(postGeo, m.post); post.position.y = 1;
        sign.add(panel, post);
        sign.position.set(f.x + f.lx * d, f.y, f.z + f.lz * d);
        sign.rotation.y = f.th + Math.PI; // face au dino qui arrive
        group.add(sign);
      }
      // vibreurs : bandes rouges / blanches sur les deux bords pendant le virage
      const i0 = Math.max(chunk.i0, Math.floor(turn.s / 2)), i1 = Math.min(chunk.i1, Math.ceil(turn.end / 2));
      if (i1 <= i0) continue;
      const red = [], white = [];
      for (let i = i0; i < i1; i++) {
        if (isWorldGap((i + .5) * TRACK.step)) continue;
        const arr = Math.floor(i / 1.5) % 2 ? red : white;
        const w0 = t.W[i] / 2, w1 = t.W[i + 1] / 2;
        for (const side of [1, -1]) {
          const p = (j, d) => [t.X[j] + Math.cos(t.TH[j]) * d, t.Y[j] + 0.05, t.Z[j] - Math.sin(t.TH[j]) * d];
          arr.push(...p(i, side * w0), ...p(i, side * (w0 - 1.2)), ...p(i + 1, side * w1),
            ...p(i, side * (w0 - 1.2)), ...p(i + 1, side * (w1 - 1.2)), ...p(i + 1, side * w1));
        }
      }
      for (const [arr, color] of [[red, 0xe53935], [white, 0xffffff]]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        mesh.userData.trackSurface = true;
        group.add(mesh);
      }
    }
  }

  #remove(chunk) {
    const g = this.meshes.get(chunk.index);
    if (!g) return;
    this.scene.remove(g);
    this.ctx.beatMaterials?.delete(g.userData.edgeMat);
    for (const child of g.children) {
      if(child.userData.routeArchitecture) {disposeRoadArchitecture(child);continue;}
      if (!child.userData.trackSurface) continue;
      child.geometry.dispose(); child.material.dispose();
    }
    this.meshes.delete(chunk.index);
  }
  dispose() {
    super.dispose();
    for(const index of [...this.meshes.keys()])this.#remove({index});
  }
}

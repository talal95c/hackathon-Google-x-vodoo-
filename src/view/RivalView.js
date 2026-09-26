import * as THREE from 'three';
import { View } from './View.js';
import { Models } from './ModelRegistry.js';
import { Skins } from '../kernel/Registry.js';
import { FightFx } from './fightFx.js';

// Dinos rivaux (autres joueurs ET PNJ) : leur skin, un anneau à leur couleur au sol et leur nom au-dessus.
// sources : objets exposant rivals() → [{ id, name, skin, color, view: { s, d, y, v, lat, st } }]. Purement visuel.
export class RivalView extends View {
  rivals = new Map(); // id → { root, model, tag, skin, gait }
  #f = {};

  constructor(ctx, sources) {
    super(ctx);
    this.sources = sources;
    this.listen('combat:impact', e => {
      const r = this.rivals.get(e.targetId);
      if (r && e.kind === 'shove') r.fx.hit(e.dir);
    });
    this.listen('game:start', () => { for (const id of [...this.rivals.keys()]) this.#remove(id); });
    this.ringGeo = new THREE.RingGeometry(1.2, 1.55, 28).rotateX(-Math.PI / 2);
  }

  #create(p) {
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const skin = Skins.has(p.skin) ? Skins.get(p.skin) : Skins.get('classic');
    const model = Models.create(skin.view.model, skin.view);
    const fx = new FightFx(root); fx.attachModel(model.object);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.y = 0.06;
    root.add(ring);
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = p.color; g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.name, 128, 33);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    tag.scale.set(2.4, 0.6, 1); tag.position.y = 5; tag.renderOrder = 10;
    root.add(tag);
    this.scene.add(root);
    const r = { root, model, tag, skin: p.skin, name: p.name, gait: 0, fx, ring, sh: 0, hit: 0 };
    this.rivals.set(p.id, r);
    return r;
  }

  #remove(id) {
    const r = this.rivals.get(id);
    if (!r) return;
    this.scene.remove(r.root);
    r.fx.dispose(); r.model.dispose?.();
    r.tag.material.map.dispose(); r.tag.material.dispose(); r.ring.material.dispose();
    this.rivals.delete(id);
  }

  dispose() {
    for (const id of [...this.rivals.keys()]) this.#remove(id);
    this.ringGeo.dispose(); super.dispose();
  }

  update(dt, time) {
    const peers = new Map();
    for (const src of this.sources) for (const p of src.rivals()) peers.set(p.id, p);
    for (const id of [...this.rivals.keys()]) if (!peers.has(id)) this.#remove(id);
    for (const p of peers.values()) {
      const v = p.view;
      if (!v || (v.st !== 'playing' && v.st !== 'falling')) { if (this.rivals.has(p.id)) this.rivals.get(p.id).root.visible = false; continue; }
      let r = this.rivals.get(p.id);
      if (r && (r.skin !== p.skin || r.name !== p.name)) { this.#remove(p.id); r = null; }
      r ??= this.#create(p);
      r.root.visible = true;
      const f = this.track.frame(v.s, this.#f);
      r.root.position.set(f.x + f.lx * v.d, f.y + v.y - (v.st === 'falling' ? 4 : 0), f.z + f.lz * v.d);
      r.root.rotation.y = f.th + Math.atan2(v.hit ? 0 : (v.lat || 0), Math.max(8, v.v || 8)) * 0.9;
      r.root.rotation.x = -Math.atan(f.slope) * 0.6;
      const grounded = v.y < 0.05;
      if (grounded) r.gait += dt * (v.v || 0) * 0.42;
      r.model.update?.({ state: v.hit ? 'stumble' : grounded ? (v.v > 1.5 ? 'run' : 'idle') : 'jump', speed: v.v || 0, gait: r.gait, steer: 0, grounded, vy: 0, boost: false, driftCharge: 0 }, dt, time);
      // combat : déclenche les animations sur les fronts montants des drapeaux reçus
      if (v.sh && !r.sh) r.fx.shove(v.shd || 1);
      if (v.hit && !r.hit && r.fx.hitT <= 0) r.fx.hit(v.lat || 1);
      r.sh = v.sh; r.hit = v.hit;
      r.fx.apply(dt, !!v.hit, time);
    }
  }
}

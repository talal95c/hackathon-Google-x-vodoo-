import * as THREE from 'three';
import { View } from './View.js';
import { Models } from './ModelRegistry.js';
import { Skins } from '../kernel/Registry.js';
import { FLAGS } from '../race/RaceCore.js';

const FX_COLORS = { laser: 0xff1744, popup: 0xe53935, virus: 0x2979ff, lag: 0x00e5ff, turbo: 0xffc400 };

function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  x.beginPath(); x.roundRect(4, 8, 248, 48, 20); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text.slice(0, 12), 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2, 0.5, 1); s.position.y = 5.6; s.renderOrder = 10;
  return s;
}

// Rivaux de la Course Royale (positions interpolées du réseau) et projectiles d'objets.
export class RivalsView extends View {
  rivals = new Map();
  shots = [];
  #f = {};

  constructor(ctx) {
    super(ctx);
    this.race = ctx.race;
    this.listen('race:countdown', () => this.#rebuild());
    this.listen('race:elim', ({ id }) => { const v = this.rivals.get(id); if (v) v.dying = 0.001; });
    this.listen('race:fx', (m) => this.#shot(m));
    this.listen('race:emote', ({ id, e }) => { const v = this.rivals.get(id); if (v) v.emote = { e, t: 2 }; });
  }

  #rebuild() {
    this.#clear();
    const p = this.race.p;
    if (!p) return;
    for (const r of p.rivals.values()) {
      const skin = Skins.has(r.skin) ? Skins.get(r.skin) : Skins.get('classic');
      const model = Models.create(skin.view.model, { ...skin.view, color: r.color });
      const root = new THREE.Group(); root.rotation.order = 'YXZ';
      root.add(model.object, nameTag(r.name, r.color));
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.7 }));
      ring.position.y = 0.06; root.add(ring);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2979ff, transparent: true, opacity: 0.25, depthWrite: false }));
      shield.position.y = 2; root.add(shield);
      this.scene.add(root);
      this.rivals.set(r.id, { root, model, shield, gait: 0, dying: 0, yaw: 0, lastX: 0 });
    }
  }

  #clear() {
    for (const v of this.rivals.values()) {
      this.scene.remove(v.root);
      v.model.dispose?.();
      v.root.traverse((o) => {
        if (o === v.model.object) return;
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
    }
    this.rivals.clear();
    for (const sh of this.shots) { this.scene.remove(sh.m); sh.m.geometry.dispose(); sh.m.material.dispose(); }
    this.shots = [];
  }

  // Position monde d'un coureur (null si inconnu)
  posOf(id, out = new THREE.Vector3()) {
    const s = this.race.posOf(id);
    if (!s) return null;
    const f = this.track.frame(s.z, this.#f);
    return out.set(f.x + f.lx * s.x, f.y + s.y + 2, f.z + f.lz * s.x);
  }

  #shot({ kind, from, target, self }) {
    if (self || !target || !FX_COLORS[kind]) return;
    const m = new THREE.Mesh(kind === 'virus' ? new THREE.IcosahedronGeometry(0.9, 0) : new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: FX_COLORS[kind] }));
    const a = this.posOf(from);
    if (!a) return;
    m.position.copy(a);
    this.scene.add(m);
    this.shots.push({ m, target, t: 0, life: kind === 'virus' ? 2.6 : 1.6, arc: kind === 'virus' ? 12 : 1 });
  }

  update(dt, time) {
    if (!this.race.p && this.rivals.size) this.#clear();
    const p = this.race.p;
    if (!p) { for (const v of this.rivals.values()) v.root.visible = false; return; }
    for (const [id, v] of this.rivals) {
      const s = p.rivalState(id);
      const alive = p.rivals.get(id)?.alive;
      if (!s || (!alive && !v.dying)) { v.root.visible = false; continue; }
      const f = this.track.frame(s.z, this.#f);
      v.root.visible = true;
      if (v.dying) {
        // « Onglet fermé » : le dino est aspiré vers le haut en tournoyant
        v.dying += dt;
        v.root.position.y += dt * 14;
        v.root.rotation.y += dt * 12;
        v.root.scale.setScalar(Math.max(0.01, 1 - v.dying / 0.9));
        if (v.dying > 0.9) { v.dying = 0; v.root.visible = false; }
        continue;
      }
      const lat = (s.x - v.lastX) / Math.max(dt, 1e-3); v.lastX = s.x;
      v.yaw += (Math.atan2(lat, Math.max(8, s.sp)) * 0.9 - v.yaw) * Math.min(1, dt * 10);
      v.root.position.set(f.x + f.lx * s.x, f.y + s.y, f.z + f.lz * s.x);
      v.root.rotation.set(s.st === 'fall' ? time * 3 : 0, f.th + v.yaw, 0);
      v.root.scale.setScalar(1);
      v.gait += dt * Math.max(2, s.sp) * 0.35;
      v.shield.visible = !!(s.f & FLAGS.shield);
      v.model.update?.({ state: s.st === 'slide' ? 'slide' : s.st, speed: s.sp, gait: v.gait, steer: 0, grounded: s.y < 0.05, vy: 0, boost: !!(s.f & FLAGS.boost), driftCharge: s.f & FLAGS.drift ? 1 : 0 }, dt, time);
    }
    const tmp = new THREE.Vector3();
    this.shots = this.shots.filter((sh) => {
      sh.t += dt;
      const k = Math.min(1, sh.t / sh.life);
      const b = this.posOf(sh.target, tmp);
      if (b) { sh.m.position.lerp(b, Math.min(1, dt / Math.max(0.05, sh.life - sh.t + dt))); sh.m.position.y = b.y + Math.sin(k * Math.PI) * sh.arc; }
      sh.m.rotation.set(time * 6, time * 5, 0);
      if (k < 1) return true;
      this.scene.remove(sh.m); sh.m.geometry.dispose(); sh.m.material.dispose();
      return false;
    });
  }
}

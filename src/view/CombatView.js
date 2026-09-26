import * as THREE from 'three';
import { View } from './View.js';
import { shoveTarget } from '../net/rules.js';

function burstGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, r = i % 2 ? .4 : (i % 6 === 0 ? 1.25 : .9);
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath(); return new THREE.ShapeGeometry(s);
}
function labelTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.translate(256, 96); g.rotate(-.09);
  g.font = 'italic 900 108px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 20; g.strokeStyle = '#272039'; g.strokeText('SLAP!', 0, 5);
  g.lineWidth = 8; g.strokeStyle = '#fff9d5'; g.strokeText('SLAP!', 0, 0);
  g.fillStyle = '#ffdb42'; g.fillText('SLAP!', 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function material(color) { return new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }); }

// Pool borné, géométries partagées : éclat BD, anneau et éclats au point du contact.
export class CombatView extends View {
  pool = []; next = 0; target = null;
  constructor(ctx, sources) {
    super(ctx); this.sources = sources; this.camera = ctx.world.camera;
    this.burstGeo = burstGeometry(); this.ringGeo = new THREE.RingGeometry(.86, 1, 40).rotateX(-Math.PI / 2);
    this.sparkGeo = new THREE.ConeGeometry(.09, 1, 4); this.labelMap = labelTexture();
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group(); group.visible = false; this.scene.add(group);
      const burst = new THREE.Mesh(this.burstGeo, material(0xffa844));
      const core = new THREE.Mesh(this.burstGeo, material(0xfff8dc)); core.scale.setScalar(.64); core.position.z = .02; burst.add(core);
      const ring = new THREE.Mesh(this.ringGeo, material(0xffe376));
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelMap, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })); label.renderOrder = 12;
      const sparks = Array.from({ length: 14 }, (_, j) => {
        const mesh = new THREE.Mesh(this.sparkGeo, material(j % 3 === 0 ? 0xff70ba : j % 3 === 1 ? 0xffd34d : 0xffffff)); group.add(mesh);
        return { mesh, velocity: new THREE.Vector3() };
      });
      group.add(burst, ring, label); this.pool.push({ group, burst, core, ring, label, sparks, age: 0, life: 0 });
    }
    this.aim = new THREE.Group(); this.scene.add(this.aim);
    this.aimRing = new THREE.Mesh(this.ringGeo, material(0xffe456)); this.aim.add(this.aimRing);
    this.bracketGeo = new THREE.BoxGeometry(.12, .06, .65);
    this.aimMat = material(0xffffff);
    for (let i = 0; i < 4; i++) {
      const corner = new THREE.Group(); corner.rotation.y = i * Math.PI / 2;
      const a = new THREE.Mesh(this.bracketGeo, this.aimMat); a.position.set(1.5, 0, 1.22);
      const b = new THREE.Mesh(this.bracketGeo, this.aimMat); b.rotation.y = Math.PI / 2; b.position.set(1.22, 0, 1.5);
      corner.add(a, b); this.aim.add(corner);
    }
    this.aim.visible = false;
    this.listen('combat:impact', e => this.impact(e));
    this.listen('game:start', () => this.reset());
    this.listen('runner:respawn', () => this.reset());
  }

  reset() {
    for (const p of this.pool) { p.life = 0; p.group.visible = false; }
    this.aim.visible = false; this.target = this.ctx.combatTarget = null;
  }

  impact(e) {
    if (!['s', 'd', 'y'].every(k => Number.isFinite(e[k])) || Math.abs(e.s - this.game.runner.z) > 100) return;
    const p = this.pool[this.next++ % this.pool.length], strong = e.kind === 'shove', f = this.track.frame(e.s, {});
    p.age = 0; p.life = strong ? .65 : .24; p.strong = strong; p.dir = e.dir || 1; p.floor = f.y;
    p.group.position.set(f.x + f.lx * (e.d - p.dir * .55), f.y + Math.max(0, e.y) + 2.2, f.z + f.lz * (e.d - p.dir * .55));
    p.group.visible = true; p.label.visible = strong;
    p.burst.material.color.setHex(e.local === 'received' ? 0xff6799 : 0xffbd42);
    p.ring.position.y = f.y + .13 - p.group.position.y;
    for (let i = 0; i < p.sparks.length; i++) {
      const a = i / p.sparks.length * Math.PI * 2;
      const spark = p.sparks[i];
      spark.velocity.set(Math.cos(a) * 6 + f.lx * p.dir * 3, 2 + Math.sin(a * 3) * 3, Math.sin(a) * 6 + f.lz * p.dir * 3).multiplyScalar(strong ? 1 : .45);
      spark.mesh.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, spark.velocity.clone().normalize());
    }
  }

  update(dt, time) {
    const r = this.game.runner;
    const rivals = this.sources.flatMap(s => s.rivals()).filter(p => p.view?.st === 'playing');
    const t = this.game.state === 'playing' ? shoveTarget({ s: r.z, d: r.x }, rivals.map(p => ({ id: p.id, alive: true, ...p.view }))) : null;
    this.target = t ? rivals.find(p => p.id === t.id) : null;
    this.ctx.combatTarget = this.target;
    const source = this.sources.find(s => s.inRace || s.active);
    const ready = source && source.shoveCooldown <= .01;
    this.aim.visible = !!this.target && ready;
    if (this.aim.visible) {
      const v = this.target.view, f = this.track.frame(v.s, {});
      this.aim.position.set(f.x + f.lx * v.d, f.y + .12, f.z + f.lz * v.d); this.aim.rotation.y = f.th;
      this.aim.scale.setScalar(1 + Math.sin(time * 8) * .06);
      this.aimRing.scale.setScalar(1.45); this.aimRing.material.opacity = .7 + Math.sin(time * 8) * .15;
    }
    for (const p of this.pool) {
      if (!p.life) continue;
      p.age += dt;
      if (p.age >= p.life) { p.group.visible = false; p.life = 0; continue; }
      const t = p.age / p.life, fade = Math.pow(1 - t, .8), scale = p.strong ? 1 : .4;
      p.burst.quaternion.copy(this.camera.quaternion); p.burst.rotateZ(-.15 + t * .35);
      p.burst.scale.setScalar((.6 + Math.min(1, t * 7) * 1.8) * scale);
      p.burst.material.opacity = Math.max(0, 1 - t * 2.5); p.core.material.opacity = p.burst.material.opacity;
      p.ring.scale.setScalar((.6 + t * 4) * scale); p.ring.material.opacity = fade * .75;
      p.label.position.set(p.dir * .4, 3 + t * 1.1, 0); const pop = .7 + Math.min(1, t * 8) * .3;
      p.label.scale.set(4.7 * pop, 1.76 * pop, 1); p.label.material.opacity = fade;
      for (const { mesh, velocity } of p.sparks) {
        mesh.position.copy(velocity).multiplyScalar(p.age); mesh.position.y -= 5 * p.age * p.age;
        mesh.scale.set(scale * fade, scale * (.5 + fade * .7), scale * fade); mesh.material.opacity = fade;
      }
    }
  }

  dispose() {
    for (const p of this.pool) { this.scene.remove(p.group); p.group.traverse(o => o.material?.dispose()); }
    this.scene.remove(this.aim);
    for (const r of [this.burstGeo, this.ringGeo, this.sparkGeo, this.labelMap, this.bracketGeo, this.aimMat, this.aimRing.material]) r.dispose();
    super.dispose();
  }
}

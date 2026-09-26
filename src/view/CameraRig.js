import * as THREE from 'three';
import { View } from './View.js';

// Caméra accrochée à la route : derrière le dino, elle regarde la route devant
// (on voit arriver les virages et les descentes). Tremblements sur les chocs.
export class CameraRig extends View {
  pos = new THREE.Vector3();
  look = new THREE.Vector3();
  shake = 0;
  snap = true;
  #fc = {}; #fl = {}; #fs = {}; #spec = { z: 0, x: 0, Y: 0, grounded: true, gait: 0 }; #t = new THREE.Vector3(); #l = new THREE.Vector3();

  constructor(ctx) {
    super(ctx);
    this.camera = ctx.world.camera;
    this.focus = ctx.focus; // position monde du dino (Vector3 partagé)
    this.listen('game:start', () => { this.snap = true; });
    this.listen('runner:hit', () => this.addShake(1));
    this.listen('runner:land', ({ impact }) => this.addShake(impact * 0.4));
    this.listen('runner:boost', () => this.addShake(0.25));
    this.listen('boss:damage', () => this.addShake(0.08));
    this.listen('runner:parry', () => this.addShake(0.65));
  }

  // Spectateur : pseudo-coureur à la position (interpolée) du rival suivi
  #follow(s) {
    const o = this.#spec, fr = this.track.frame(s.z, this.#fs);
    o.z = s.z; o.x = s.x; o.Y = fr.y + s.y; o.grounded = s.y < 0.05;
    this.focus.set(fr.x + fr.lx * s.x, o.Y, fr.z + fr.lz * s.x);
    return o;
  }

  addShake(v) { this.shake = Math.max(this.shake, v); }

  update(dt, time) {
    const g = this.game, r = g.runner, cam = this.camera, P = this.focus;
    const speed = Math.max(0, r.speed);

    if (g.state === 'menu') {
      const a = .62 + Math.sin(time * .18) * .12;
      const narrow = window.innerWidth < 760;
      const radius = narrow ? 14.2 : 9.8;
      cam.fov = 44;
      cam.setViewOffset(window.innerWidth, window.innerHeight, narrow ? 0 : -window.innerWidth * .2, narrow ? window.innerHeight * .18 : 0, window.innerWidth, window.innerHeight);
      cam.position.set(P.x + Math.sin(a) * radius, P.y + 4.5, P.z + Math.cos(a) * radius);
      cam.lookAt(P.x, P.y + 2.1, P.z);
      cam.updateProjectionMatrix();
      return;
    }
    if (cam.view?.enabled) cam.clearViewOffset();
    const spec = g.state === 'over' ? this.ctx.race?.spectate?.state : null;
    const f = g.state === 'playing' ? r : spec ? this.#follow(spec) : null;
    if (f) {
      const flight = g.worldJump ? Math.sin(g.worldJump.progress * Math.PI) : 0;
      const back = 8 + speed * 0.04 + flight * 5;
      const fc = this.track.frame(Math.max(0, f.z - back), this.#fc);
      const fl = this.track.frame(f.z + 14, this.#fl);
      const bob = f.grounded ? Math.abs(Math.cos(f.gait)) * 0.07 : 0;
      this.#t.set(fc.x + fc.lx * f.x * 0.6, Math.max(fc.y, f.Y - 1) + 4.4 + bob, fc.z + fc.lz * f.x * 0.6);
      this.#l.set(fl.x + fl.lx * f.x * 0.4, fl.y * 0.5 + f.Y * 0.5 + 2.4, fl.z + fl.lz * f.x * 0.4);
      const k = this.snap ? 1 : Math.min(1, dt * 10);
      this.pos.lerp(this.#t, k); this.look.lerp(this.#l, k);
      this.snap = false;
      cam.position.copy(this.pos);
    } else {
      // chute / fin de partie : la caméra s'arrête et regarde le dino
      this.look.lerp(this.#l.set(P.x, P.y + 1, P.z), 0.2);
      cam.position.lerp(this.pos, 0.02);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    cam.position.x += (Math.random() - 0.5) * this.shake * 0.8;
    cam.position.y += (Math.random() - 0.5) * this.shake * 0.8;
    cam.lookAt(this.look);
    const fov = 62 + (g.worldJump ? Math.sin(g.worldJump.progress * Math.PI) * 10 : 0) + Math.max(0, speed - 30) * 0.45 + (r.boost > 0 ? 8 : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.fov += (this.ctx.fx?.down ?? 0) * 0.35; // "kick" de caméra sur le temps fort
    cam.updateProjectionMatrix();
  }
}

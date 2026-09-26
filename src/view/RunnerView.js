import * as THREE from 'three';
import { View } from './View.js';
import { Models } from './ModelRegistry.js';
import { Skins } from '../kernel/Registry.js';
import { FightFx } from './fightFx.js';

// Met en scène le dino : choisit le modèle du skin, le place sur la route,
// calcule la "pose" (état d'animation) et attache les visuels d'armes.
// ctx.focus (Vector3) est mis à jour avec la position monde du dino.
export class RunnerView extends View {
  root = new THREE.Group();
  yaw = 0;
  weaponModel = null;
  #f = {};

  constructor(ctx) {
    super(ctx);
    this.focus = ctx.focus;
    this.root.rotation.order = 'YXZ';
    this.scene.add(this.root);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    this.blob.rotation.order = 'YXZ';
    this.scene.add(this.blob);
    this.setSkin(ctx.skin ?? 'classic');
    this.fx = new FightFx(this.root);
    this.listen('mp:shove', ({ dir }) => this.fx.shove(dir ?? 1));
    this.listen('runner:knocked', ({ lateral, source }) => { if (source !== 'bump' || Math.abs(lateral) > 12) this.fx.hit(lateral); });

    this.listen('game:start', ({ loadout }) => { if (loadout.skin) this.setSkin(loadout.skin); this.#clearWeapon(); });
    this.listen('skin:preview', ({ skin }) => this.setSkin(skin));
    this.listen('weapon:equip', ({ weapon }) => this.#setWeapon(weapon));
    this.listen('weapon:expire', () => this.#clearWeapon());
    this.listen('*', (type, payload) => { if (type.startsWith('runner:')) this.model.onEvent?.(type, payload); });
  }

  setSkin(id) {
    if (this.model) { this.root.remove(this.model.object); this.model.dispose?.(); }
    this.skin = Skins.get(id);
    this.model = Models.create(this.skin.view.model, this.skin.view);
    this.root.add(this.model.object);
  }

  #setWeapon(weapon) {
    this.#clearWeapon();
    this.weapon = weapon;
    this.weaponModel = Models.create(`weapon:${weapon.type}`, { weapon });
    this.root.add(this.weaponModel.object);
  }

  #clearWeapon() {
    if (!this.weaponModel) return;
    this.root.remove(this.weaponModel.object);
    this.weaponModel.dispose?.();
    this.weaponModel = null; this.weapon = null;
  }

  pose() {
    const g = this.game, r = g.runner;
    let state = 'run';
    if (g.state === 'menu') state = 'idle';
    else if (g.state === 'falling') state = 'fall';
    else if (r.stumble > 0) state = 'stumble';
    else if (!r.grounded) state = 'jump';
    else if (r.drifting) state = 'slide';
    else if (r.speed < 1.5) state = 'idle'; // le dino ne court plus tout seul : à l'arrêt
    return { state, speed: g.state === 'menu' ? 14 : Math.max(0, r.speed), gait: g.state === 'menu' ? performance.now() / 1000 * 6 : r.gait, steer: r.steer, grounded: r.grounded || g.state === 'menu', vy: r.vy, boost: r.boost > 0, driftCharge: r.driftCharge };
  }

  update(dt, time) {
    const g = this.game, r = g.runner, f = this.track.frame(r.z, this.#f);

    if (g.state === 'falling' && g.fall) {
      this.root.position.set(g.fall.x, g.fall.y, g.fall.z);
      this.root.rotation.x += dt * 2;
      this.blob.visible = false;
    } else {
      // regarde là où il va vraiment ; glissade = de travers ; choc = tremblote
      const move = Math.atan2(r.latV + r.push, Math.max(8, r.speed));
      const wobble = r.stumble > 0 ? Math.sin(r.stumble * 45) * 0.5 : 0;
      this.yaw += ((r.drifting ? r.driftDir * 0.6 : move * 0.9) + wobble - this.yaw) * Math.min(1, dt * 12);
      this.root.position.set(f.x + f.lx * r.x, r.Y, f.z + f.lz * r.x);
      this.root.rotation.y = f.th + this.yaw;
      this.root.rotation.x = r.grounded ? -Math.atan(f.slope) * 0.6 : this.root.rotation.x * 0.9;
      this.blob.visible = !g.worldJump;
      this.blob.position.set(this.root.position.x, f.y + 0.05, this.root.position.z);
      this.blob.rotation.set(-Math.atan(f.slope), f.th, 0);
      const sc = Math.max(0.3, 1 - r.y * 0.15);
      this.blob.scale.set(sc, 1, sc);
    }
    // clignote pendant l'invulnérabilité
    this.root.visible = !!g.worldJump || r.invul <= 0 || g.state !== 'playing' || Math.floor(r.invul * 16) % 2 === 0;

    this.model.update?.(this.pose(), dt, time);
    if (g.state === 'playing') this.fx.apply(dt, r.stumble > 0, time);
    if (this.weaponModel && this.weapon) this.weaponModel.update?.(this.weapon, dt, time);
    this.focus.copy(this.root.position);
  }
}

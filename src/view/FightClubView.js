import * as THREE from 'three';
import { View } from './View.js';
import { Models } from './ModelRegistry.js';
import { Skins } from '../kernel/Registry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FighterMotion, finishPose, FINISH_CONTACT } from './FightChoreography.js';

function words(text, color = '#fff2c8', width = 1024, height = 256) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d'); g.font = `900 ${height * .56}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = height * .04; g.strokeStyle = '#18192d'; g.strokeText(text, width / 2, height / 2);
  g.fillStyle = color; g.fillText(text, width / 2, height / 2);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; return map;
}

// Une vraie scène 3D, avec le renderer et le post-processing du jeu (pas de vidéo ni de deuxième WebGL).
export class FightClubView extends View {
  postFx = { rush: 0, lines: 0, blur: 0, flash: 0 };
  fighters = []; resources = new Set(); punch = [0, 0]; recoil = [0, 0]; hitKick = 0; finishHit = false;
  constructor(ctx, club) {
    super(ctx); this.club = club; this.camera = ctx.world.camera;
    this.arena = new THREE.Scene(); this.arena.background = new THREE.Color(0x171b32); this.arena.fog = new THREE.Fog(0x171b32, 27, 72);
    this.arena.environment = this.scene.environment; this.arena.environmentIntensity = .38;
    this.box = this.own(new THREE.BoxGeometry(1, 1, 1)); this.cylinder = this.own(new THREE.CylinderGeometry(1, 1, 1, 8));
    this.buildArena(); this.buildParticles(); this.buildGate(); this.buildImpactShow(); this.buildDinoCrowd();
    this.listen('club:open', () => this.open());
    this.listen('club:hit', e => { this.fighters[e.index]?.motion.tap(e.count); this.hit(e.index); });
    this.listen('club:result', () => { this.finishHit = false; this.hitKick = .5; for (const f of this.fighters) f.motion.clear(); if (this.club.result?.winner !== null) this.game.emit('club:acrobatics', {}); });
    this.listen('club:close', () => this.close());
  }
  own(r) { this.resources.add(r); return r; }
  mat(color, glow = 0) { return this.own(new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .05, emissive: color, emissiveIntensity: glow, flatShading: true })); }
  mesh(geo, mat, pos, scale, parent = this.arena) {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  buildArena() {
    const navy = this.mat(0x242e49), teal = this.mat(0x285665), floor = this.mat(0x386677), coral = this.mat(0xff7293, .25), pink = this.mat(0xff468f, 2), cyan = this.mat(0x62efe0, 2.5), gold = this.mat(0xffd061, 1.2);
    this.arena.add(new THREE.HemisphereLight(0xc1e9ff, 0x342247, 2));
    const key = new THREE.DirectionalLight(0xffe9c3, 3.5); key.position.set(-7, 14, 11); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = .04; Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 }); this.arena.add(key);
    const rim = new THREE.DirectionalLight(0x6cdeff, 2.5); rim.position.set(7, 7, -8); this.arena.add(rim);
    this.mesh(this.cylinder, navy, [0, -.48, 0], [8.8, .7, 6.5]);
    this.mesh(this.cylinder, cyan, [0, -.13, 0], [8.3, .11, 6.1]);
    this.mesh(this.cylinder, floor, [0, -.04, 0], [8.15, .12, 5.95]);
    const center = this.own(new THREE.RingGeometry(2.4, 2.52, 48).rotateX(-Math.PI / 2));
    this.mesh(center, gold, [0, .04, 0], [1, 1, 1]);
    this.mesh(this.box, navy, [0, -1.05, 0], [110, .5, 100]);
    // Trois cordes et coins capitonnés : le bord avant reste ouvert pour lire les coups.
    for (const x of [-7.1, 7.1]) for (const z of [-4.7, 4.7]) {
      this.mesh(this.box, navy, [x, 1.5, z], [.32, 3.2, .32]);
      this.mesh(this.box, coral, [x, 2.05, z], [.7, 1.1, .7]);
      this.mesh(this.box, gold, [x, 3.17, z], [.42, .13, .42]);
    }
    for (const y of [.9, 1.65, 2.4]) {
      this.mesh(this.box, coral, [0, y, -4.7], [14, .1, .1]);
      for (const x of [-7.1, 7.1]) this.mesh(this.box, teal, [x, y, 0], [.1, .1, 9.4]);
    }
    const tex = this.logoTexture = this.own(words('FIGHT CLUB', '#ffe27a'));
    this.mesh(this.box, navy, [0, 6.4, -7.1], [12, 2.6, .5]);
    const signMat = this.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    this.mesh(this.own(new THREE.PlaneGeometry(10.8, 2.7)), signMat, [0, 6.4, -6.82], [1, 1, 1]);
    this.mesh(this.box, pink, [0, 5, -6.9], [12, .13, .2]);
    for (const side of [-1, 1]) {
      const x = side * 10;
      this.mesh(this.box, navy, [x, 3, -6], [2.8, 7.5, 2]);
      for (let y = .2; y < 6; y += .65) this.mesh(this.box, y % 2 > 1 ? cyan : pink, [x, y, -4.95], [1.8, .13, .1]);
      for (let z = -3; z < 15; z += 3) this.mesh(this.box, cyan, [side * 12, .03, z], [.12, .12, 1.8]);

    }
    this.rays = new THREE.Group(); this.arena.add(this.rays);
    const rayMat = this.own(new THREE.MeshBasicMaterial({ color: 0x69fff0, transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide }));
    for (const side of [-1, 1]) {
      const ray = this.mesh(this.own(new THREE.ConeGeometry(3, 22, 4, 1, true)), rayMat, [side * 9, 10, -12], [1, 1, 1], this.rays); ray.rotation.z = side * .35;
    }
    const shockMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffdc68, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.shock = this.mesh(this.own(new THREE.RingGeometry(.92, 1, 40).rotateX(-Math.PI / 2)), shockMat, [0, .1, 0], [1, 1, 1]);
  }
  buildGate() {
    this.routeGate = new THREE.Group(); this.scene.add(this.routeGate);
    const dark = this.mat(0x242e49), glow = this.gateGlow = this.mat(0xff70a7, 1.4);
    this.gatePosts = [-1, 1].map(side => {
      const p = this.mesh(this.box, dark, [side * 8.5, 3.2, 0], [.5, 6.4, .5], this.routeGate);
      this.mesh(this.box, glow, [side * 8.5, 3.2, -.3], [.2, 5.8, .08], this.routeGate);
      return p;
    });
    this.gateBeam = this.mesh(this.box, glow, [0, 6.35, 0], [17.5, .22, .5], this.routeGate);
    const signMat = this.own(new THREE.MeshBasicMaterial({ map: this.logoTexture, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    this.mesh(this.box, dark, [0, 6.8, 0], [5.6, 1.45, .3], this.routeGate);
    const sign = this.mesh(this.own(new THREE.PlaneGeometry(5.2, 1.3)), signMat, [0, 6.8, -.17], [1, 1, 1], this.routeGate); sign.rotation.y = Math.PI;
  }
  hand(parent) {
    const group = new THREE.Group(); parent.add(group);
    const m = this.handMat ??= this.mat(0xffefd0, .15);
    this.mesh(this.box, m, [0, 0, 0], [.8, .9, .26], group);
    for (let i = 0; i < 4; i++) this.mesh(this.box, m, [(i - 1.5) * .22, .68 - Math.abs(i - 1.5) * .06, 0], [.18, .65, .24], group);
    const thumb = this.mesh(this.box, m, [-.52, -.01, 0], [.24, .64, .26], group); thumb.rotation.z = -.65;
    group.visible = false; return group;
  }
  buildParticles() {
    this.bits = []; const geo = this.own(new THREE.BoxGeometry(1, 1, 1));
    const mat = this.own(new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false }));
    this.sparks = this.own(new THREE.InstancedMesh(geo, mat, 240)); this.sparks.frustumCulled = false; this.arena.add(this.sparks);
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < 240; i++) { this.bits.push({ age: 99, life: 0, pos: new THREE.Vector3(), velocity: new THREE.Vector3() }); this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.sparks.setMatrixAt(i, this.dummy.matrix); }
    this.nextBit = 0;
    const tex = this.own(words('SLAP!', '#ffed87', 512, 192));
    this.word = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false })));
    this.slapMap = tex; this.boomMap = this.own(words('BOOM!', '#ffcc69', 512, 192));
    this.word.scale.set(3.2, 1.2, 1); this.word.visible = false; this.word.renderOrder = 10; this.arena.add(this.word);
    this.coins = new THREE.Group(); this.arena.add(this.coins);
    const coinMat = this.mat(0xffd357, .45);
    this.coinBits = Array.from({ length: 16 }, () => { const m = this.mesh(this.cylinder, coinMat, [0, 0, 0], [.17, .09, .17], this.coins); m.visible = false; return m; });
  }
  buildImpactShow() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16, r = i % 2 ? .44 : (i % 6 === 0 ? 1.4 : 1);
      if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    this.blast = new THREE.Group(); this.arena.add(this.blast);
    const geo = this.own(new THREE.ShapeGeometry(shape));
    this.blastMats = [0xff729c, 0xffc957, 0xfff8dc].map(color => this.own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })));
    this.blastLayers = this.blastMats.map((mat, i) => { const m = new THREE.Mesh(geo, mat); m.position.z = i * .025; m.rotation.z = i * .15; this.blast.add(m); return m; });
    this.blastAge = 1; this.shockAge = 1; this.blastBig = false; this.crowdEnergy = 0;
    this.hitLight = new THREE.PointLight(0xffbc68, 0, 13, 2); this.arena.add(this.hitLight);
    const smokeGeo = this.own(new THREE.IcosahedronGeometry(1, 0));
    this.smoke = Array.from({ length: 18 }, (_, i) => {
      const mat = this.own(new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffeacb : 0xc7e2ff, transparent: true, opacity: 0, depthWrite: false }));
      const mesh = new THREE.Mesh(smokeGeo, mat); mesh.visible = false; this.arena.add(mesh);
      return { mesh, t: 9, max: .6, start: new THREE.Vector3(), velocity: new THREE.Vector3() };
    }); this.nextSmoke = 0;
  }
  buildDinoCrowd() {
    // Les vrais skins, regroupés en trois meshes par dino pour les téléphones.
    const material = this.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, flatShading: true }));
    const prototypes = Skins.all().map(skin => {
      const model = Models.create(skin.view.model, skin.view), arms = model.rig?.arms ?? [];
      model.object.updateMatrixWorld(true);
      const parts = [null, ...arms].map(pivot => {
        const geometries = [], inverse = pivot ? pivot.matrixWorld.clone().invert() : new THREE.Matrix4();
        model.object.traverse(mesh => {
          if (!mesh.isMesh) return;
          let branch = mesh; while (branch && !arms.includes(branch)) branch = branch.parent;
          if ((pivot && branch !== pivot) || (!pivot && branch)) return;
          let g = mesh.geometry.clone();
          if (g.index) { const indexed = g; g = g.toNonIndexed(); indexed.dispose(); }
          for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
          const color = mesh.material.color ?? new THREE.Color(0xffffff), values = new Float32Array(g.attributes.position.count * 3);
          for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
          g.setAttribute('color', new THREE.BufferAttribute(values, 3)); geometries.push(g);
        });
        const geometry = this.own(mergeGeometries(geometries)); geometries.forEach(g => g.dispose());
        return { geometry, position: pivot ? new THREE.Vector3().setFromMatrixPosition(pivot.matrixWorld) : new THREE.Vector3() };
      });
      model.dispose?.(); return parts;
    });
    this.crowd = [];
    const stand = this.mat(0x303952), trim = this.mat(0x66dfd2, .5);
    const add = (x, y, z, rotation, index) => {
      const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = rotation; root.scale.setScalar(.55); this.arena.add(root);
      const parts = prototypes[index % prototypes.length].map(p => { const mesh = new THREE.Mesh(p.geometry, material); mesh.position.copy(p.position); root.add(mesh); return mesh; });
      this.crowd.push({ root, arms: parts.slice(1), baseY: y, phase: index * 1.7 });
    };
    let index = 0;
    for (let row = 0; row < 3; row++) {
      const y = row * 1.3, z = -7.6 - row * 2.5;
      this.mesh(this.box, stand, [0, y - .35, z], [22, .7, 2.4]);
      this.mesh(this.box, trim, [0, y, z + 1.2], [22, .08, .08]);
      for (let j = 0; j < 12; j++) add((j - 5.5) * 1.75, y + .05, z, (j - 5.5) * -.025, index++);
    }
    for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
      const x = side * (10.5 + row * 2), y = row * 1.3;
      this.mesh(this.box, stand, [x, y - .35, -.5], [1.8, .7, 10]);
      for (let j = 0; j < 5; j++) add(x, y + .05, -4.4 + j * 1.9, -side * Math.PI / 2, index++);
    }
    // Traînées courbes qui dessinent les rotations et les coups de pied.
    const arcGeo = this.own(new THREE.TorusGeometry(1.8, .055, 3, 32, Math.PI * 1.4));
    this.motionTrails = [-1, 1].map((_, i) => {
      const mat = this.own(new THREE.MeshBasicMaterial({ color: i ? 0xff79b4 : 0x74fff0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      const mesh = new THREE.Mesh(arcGeo, mat); this.arena.add(mesh); return mesh;
    });
  }

  open() {
    this.clearFighters(); this.punch = [0, 0]; this.recoil = [0, 0]; this.hitKick = 0; this.word.visible = false; this.finishHit = false;
    this.blastAge = this.shockAge = 1; this.hitLight.intensity = 0;
    for (const p of this.smoke) p.t = 9;
    for (const p of this.bits) p.life = 0;
    for (const m of this.coinBits) m.visible = false;
    for (let i = 0; i < 2; i++) {
      const f = this.club.fighters[i], skin = Skins.has(f.skin) ? Skins.get(f.skin) : Skins.get('classic');
      const model = Models.create(skin.view.model, skin.view), root = new THREE.Group(), pivot = new THREE.Group();
      pivot.position.y = 1.9; model.object.position.y = -1.9; pivot.add(model.object); root.add(pivot); this.arena.add(root);
      const hand = this.hand(this.arena);
      this.fighters.push({ root, pivot, model, hand, side: i === 0 ? -1 : 1, strike: 0, motion: new FighterMotion() });
    }
    this.world.post.setScene(this.arena);
  }
  clearFighters() {
    for (const f of this.fighters) { this.arena.remove(f.root, f.hand); f.model.dispose?.(); }
    this.fighters = [];
  }
  close() { this.world.post.setScene(this.scene); this.clearFighters(); }
  hit(index, big = false) {
    if (!this.club.active || !this.fighters[index]) return;
    this.punch[index] = big ? .42 : .2; this.recoil[1 - index] = big ? 1 : .2; this.hitKick = big ? 1 : .43;
    this.fighters[index].strike++;
    const x = this.fighters[1 - index].side * 1.9;
    this.blastAge = this.shockAge = 0; this.blastBig = big; this.crowdEnergy = big ? 1 : .55;
    this.blast.position.set(x, 3, .9); this.hitLight.position.set(x, 3.2, 1);
    this.shock.position.x = x;
    this.word.material.map = big ? this.boomMap : this.slapMap;
    for (let i = 0; i < (big ? 12 : 3); i++) {
      const p = this.smoke[this.nextSmoke++ % this.smoke.length], a = i * 2.4;
      p.t = 0; p.max = big ? 1.05 : .55; p.start.set(x, big ? 1.4 : 2.6, .2);
      p.velocity.set(Math.cos(a) * (big ? 4 : 2), .8 + Math.sin(a) * .7, Math.sin(a) * 1.5);
    }
    this.word.position.set(x, big ? 5.2 : 4.55, .5); this.word.visible = true; this.wordAge = 0;
    this.word.scale.setScalar(big ? 1.4 : 1); this.word.scale.multiply(new THREE.Vector3(3.2, 1.2, 1));
    for (let i = 0; i < (big ? 120 : 30); i++) {
      const bit = this.bits[this.nextBit++ % this.bits.length], a = i * 2.4;
      bit.age = 0; bit.life = big ? 1.25 : .55; bit.pos.set(x, 3.1, .4);
      bit.velocity.set(Math.cos(a) * (big ? 11 : 7), 3 + Math.sin(a * 1.2) * 6, Math.sin(a) * 5);
      this.sparks.setColorAt((this.nextBit - 1) % this.bits.length, new THREE.Color([0xffdc54, 0xff83ba, 0x74ffe2, 0xffffff][i % 4]));
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  update(dt, time) {
    this.routeGate.visible = !this.club.active && this.game.state === 'playing' && this.club.nextAt - this.game.runner.z < 240;
    if (this.routeGate.visible) {
      const f = this.track.frame(this.club.nextAt, {});
      this.routeGate.position.set(f.x, f.y, f.z); this.routeGate.rotation.y = f.th;
      this.routeGate.scale.x = (f.w + 1.5) / 17;
      this.gateGlow.emissiveIntensity = 1.5 + Math.max(0, Math.sin(time * 7)) * 1.5;
      this.gateBeam.scale.y = .22 + Math.max(0, Math.sin(time * 7)) * .1;
    }
    if (!this.club.active) return;
    const result = this.club.result, age = result ? (this.club.now() - this.club.resultAt) / 1000 : 0;
    if (result && !this.finishHit && age >= FINISH_CONTACT) { this.finishHit = true; if (result.winner !== null) { this.hit(result.winner, true); this.game.emit('club:finisher', result); } }
    this.hitKick *= Math.exp(-dt * 13);
    Object.assign(this.postFx, { rush: this.hitKick * .65, lines: this.hitKick * .7, blur: this.hitKick * .25 });
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i], side = f.side;
      this.punch[i] = Math.max(0, this.punch[i] - dt); this.recoil[i] = Math.max(0, this.recoil[i] - dt);
      const recoil = Math.min(1, this.recoil[i] / .2);
      const m = result && result.winner !== null ? finishPose(age, result.winner === i) : f.motion.update(dt);
      if (!result && m.kind === 'flip' && f.lastMove !== f.motion.current) this.game.emit('club:acrobatics', {});
      f.lastMove = f.motion.current;
      const winner = result?.winner === i, lost = result?.loser === i && age >= FINISH_CONTACT;
      f.root.position.set(side * (2.2 - m.forward + recoil * .15), m.jump - m.crouch + Math.sin(time * 9 + i) * .025, Math.sin(time * 3 + i) * .09);
      f.root.rotation.set(0, -side * 1.15, 0);
      f.pivot.rotation.set(m.flip, m.twist, side * recoil * .05);
      f.pivot.scale.set(1 + m.crouch * .3, 1 - m.crouch * .4, 1 + m.crouch * .3);
      const pose = { state: 'idle', speed: 0, gait: time * 3, steer: 0, grounded: m.jump < .1, vy: 0, boost: false, driftCharge: 0 };
      f.model.update?.(pose, dt, time);
      const rig = f.model.rig;
      if (rig) {
        rig.body.rotation.x = -.05 + recoil * .12 + m.lean;
        rig.body.rotation.z = Math.sin(time * 5 + i) * .025;
        rig.arms.forEach((arm, n) => {
          arm.rotation.x = -1.05 - (n === m.hand ? m.swing * 1.2 : 0) - (m.jump > .8 ? .5 : 0);
          arm.rotation.z = (n ? -1 : 1) * (.3 + m.swing * .35);
        });
        rig.legs.forEach((leg, n) => {
          leg.rotation.x = m.kick ? (n === 0 ? -1.7 * m.kick : .55 * m.kick) : m.jump > .6 ? -.65 : Math.sin(time * 9 + n * Math.PI) * .09;
          leg.rotation.z = (n ? -1 : 1) * m.kick * .12;
        });
        rig.head.rotation.x = recoil * -.18; rig.head.rotation.y = lost ? Math.sin(age * 18) * .2 : 0;
        if (winner && age > 1.65) rig.arms.forEach((arm, n) => { arm.rotation.x = -2.5; arm.rotation.z = (n ? -1 : 1) * (.5 + Math.sin(time * 12) * .15); });
      }
      // La main suit le bras ; les saltos restent lisibles sans main flottante devant le dino.
      f.hand.visible = m.swing > .12 && m.kind !== 'kick' && m.kind !== 'flip';
      if (f.hand.visible) {
        f.hand.position.set(side * (1.2 - m.swing * 2.4), 2.55 + m.jump + m.swing * (m.kind === 'uppercut' ? 1 : .3), 1.1);
        f.hand.rotation.set(-.15, side * (.7 - m.swing * .8), -side * m.swing * .65); f.hand.scale.setScalar(.9);
      }
      const trail = this.motionTrails[i]; trail.visible = m.trail > .2;
      trail.position.copy(f.root.position).add(new THREE.Vector3(0, 1.9, .7));
      trail.rotation.set(0, side * .3, -side * (m.flip + time * 2));
      trail.material.opacity = m.trail * .5; trail.scale.setScalar(m.kind === 'flip' ? 1.35 : .8);
    }

    const aspect = window.innerWidth / window.innerHeight, distance = Math.max(16.5, 13.8 / aspect);
    const zoom = result && age < FINISH_CONTACT ? Math.sin(age / FINISH_CONTACT * Math.PI) * .7 : 0;
    this.camera.clearViewOffset(); this.camera.fov = 48 - zoom * 1.5 - this.hitKick * 2;
    this.camera.position.set(Math.sin(time * .35) * .18 + Math.sin(time * 61) * this.hitKick * .25, 6.8 + distance * .07 + Math.cos(time * 51) * this.hitKick * .18, distance - zoom);
    this.camera.lookAt(0, 2.6, 0); this.camera.updateProjectionMatrix();
    this.wordAge = (this.wordAge ?? 1) + dt;
    this.word.visible = this.wordAge < .32;
    this.word.material.opacity = Math.max(0, 1 - this.wordAge / .32); this.word.position.y += dt * 2;
    this.blastAge += dt; this.shockAge += dt; this.crowdEnergy *= Math.exp(-dt * 2.5);
    const blastLife = this.blastBig ? .4 : .22, bt = this.blastAge / blastLife;
    this.blast.visible = bt < 1;
    this.blast.quaternion.copy(this.camera.quaternion);
    this.blast.scale.setScalar((this.blastBig ? 2.5 : 1.25) * (.5 + Math.min(1, bt * 5) * .6));
    this.blastLayers.forEach((mesh, i) => { mesh.scale.setScalar(1 - i * .25); mesh.material.opacity = Math.max(0, 1 - bt) * .9; mesh.rotation.z = i * .15 + bt * .25; });
    this.hitLight.intensity = Math.max(0, 1 - bt) * (this.blastBig ? 24 : 10);
    this.shock.scale.setScalar(.4 + this.shockAge * (this.blastBig ? 13 : 8));
    this.shock.material.opacity = Math.max(0, 1 - this.shockAge / (this.blastBig ? .8 : .35)) * .8;
    for (const p of this.smoke) {
      p.t += dt; p.mesh.visible = p.t < p.max;
      if (!p.mesh.visible) continue;
      const t = p.t / p.max;
      p.mesh.position.copy(p.start).addScaledVector(p.velocity, p.t); p.mesh.position.y += t * .4;
      p.mesh.scale.setScalar((.2 + t * .6) * (p.max > .6 ? 1.4 : .8)); p.mesh.material.opacity = (1 - t) * .48;
      p.mesh.rotation.set(t, t * 2, t * .5);
    }
    this.crowd.forEach(c => {
      c.root.position.y = c.baseY + Math.max(0, Math.sin(time * 12 + c.phase)) * (.12 + this.crowdEnergy * .5);
      c.arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * (1.7 + Math.sin(time * 10 + c.phase) * .5 + this.crowdEnergy * .3); });
    });
    this.rays.rotation.z = Math.sin(time * .6) * .12;
    for (let i = 0; i < this.bits.length; i++) {
      const p = this.bits[i]; p.age += dt;
      if (p.age >= p.life) this.dummy.scale.setScalar(0);
      else {
        this.dummy.position.copy(p.pos).addScaledVector(p.velocity, p.age); this.dummy.position.y -= 5 * p.age * p.age;
        this.dummy.rotation.set(p.age * 7, p.age * 4, i); this.dummy.scale.set(.2, .46, .11).multiplyScalar(1 - p.age / p.life);
      }
      this.dummy.updateMatrix(); this.sparks.setMatrixAt(i, this.dummy.matrix);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.coinBits.length; i++) {
      const m = this.coinBits[i], t = (age - 1.25 - i * .04) / .75;
      m.visible = !!result?.transfer && result.winner !== null && t > 0 && t < 1;
      if (m.visible) {
        const side = result.winner === 0 ? 1 : -1;
        m.position.set(side * (3.5 - t * 7), 2.7 + Math.sin(t * Math.PI) * 2.2, .8 + Math.sin(i * 2.4) * .35); m.rotation.z = t * 12;
      }
    }
  }
  dispose() { this.close(); this.scene.remove(this.routeGate); for (const r of this.resources) r.dispose?.(); super.dispose(); }
}

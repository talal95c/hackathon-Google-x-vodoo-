import * as THREE from 'three';

const SHOVE = .36, HIT = .52;
function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? .12 : .29;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// Animation dans un pivot séparé : ne déplace jamais les coordonnées réseau,
// les étiquettes, ni la cible de la caméra. Tous les offsets repartent de zéro.
export class FightFx {
  shoveT = 0; hitT = 0; dir = 1; hitDir = 1;
  constructor(root, headY = 4.7) {
    this.root = root; this.headY = headY;
    this.pivot = new THREE.Group(); root.add(this.pivot);
    this.materials = new Map(); this.meshes = [];
    this.starGeo = starGeometry();
    this.starMat = new THREE.MeshBasicMaterial({ color: 0xffdf51, side: THREE.DoubleSide, toneMapped: false });
    this.stars = new THREE.Group(); root.add(this.stars);
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(this.starGeo, this.starMat), a = i / 3 * Math.PI * 2;
      star.position.set(Math.cos(a) * 1.05, Math.sin(a) * .15, Math.sin(a) * 1.05);
      this.stars.add(star);
    }
    this.arcGeo = new THREE.RingGeometry(1.5, 1.84, 24, 1, -.95, 1.9).rotateX(-Math.PI / 2);
    this.arcMat = new THREE.MeshBasicMaterial({ color: 0xffe475, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    this.arc = new THREE.Mesh(this.arcGeo, this.arcMat); this.arc.position.y = 2; root.add(this.arc);
    // Gant ouvert, quatre doigts + pouce : une claque lisible même de loin.
    this.hand = new THREE.Group(); root.add(this.hand);
    this.handGeo = new THREE.BoxGeometry(1, 1, 1);
    this.handMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: .55, emissive: 0xffb34c, emissiveIntensity: .15 });
    const part = (x, y, z, sx, sy, sz, rz = 0) => {
      const mesh = new THREE.Mesh(this.handGeo, this.handMat);
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.z = rz;
      this.hand.add(mesh);
    };
    part(0, 0, 0, .95, .9, .32);
    for (let i = 0; i < 4; i++) part((i - 1.5) * .26, .65 - Math.abs(i - 1.5) * .07, 0, .22, .72 - Math.abs(i - 1.5) * .09, .29, (1.5 - i) * .08);
    part(-.62, -.02, 0, .28, .65, .3, -.75);
    part(0, -.58, 0, .7, .3, .4);
    this.flashColor = new THREE.Color(0xfff4bd); this.glowColor = new THREE.Color(0xffbd42);
    this.reset();
  }

  attachModel(object) {
    this.detachModel(); this.object = object; this.pivot.add(object);
    object.traverse(mesh => {
      if (!mesh.isMesh || !mesh.material) return;
      const original = mesh.material;
      const clone = mat => {
        if (!this.materials.has(mat)) this.materials.set(mat, mat.clone());
        return this.materials.get(mat);
      };
      mesh.material = Array.isArray(original) ? original.map(clone) : clone(original);
      this.meshes.push({ mesh, original });
    });
  }

  detachModel() {
    for (const { mesh, original } of this.meshes) mesh.material = original;
    for (const mat of this.materials.values()) mat.dispose();
    this.meshes = []; this.materials.clear();
    if (this.object) this.pivot.remove(this.object);
    this.object = null;
  }

  shove(dir) { this.shoveT = SHOVE; this.dir = Math.sign(dir) || 1; }
  hit(dir) { this.hitT = HIT; this.hitDir = Math.sign(dir) || 1; }
  reset() {
    this.shoveT = this.hitT = 0;
    this.apply(0, false, 0);
  }

  apply(dt, dazed, time) {
    const p = this.pivot;
    p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); p.scale.set(1, 1, 1);
    this.shoveT = Math.max(0, this.shoveT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    if (this.shoveT > 0) {
      const t = 1 - this.shoveT / SHOVE;
      const lunge = t < .2 ? -Math.sin(t / .2 * Math.PI) * .22 : Math.sin((t - .2) / .8 * Math.PI);
      p.position.x = this.dir * lunge * .95;
      p.rotation.z = -this.dir * lunge * .12;
      p.rotation.y = 0;
      p.scale.set(1 + lunge * .12, 1 - Math.abs(lunge) * .1, 1);
      this.arc.rotation.y = this.dir > 0 ? -.3 : Math.PI + .3;
      this.arc.scale.setScalar(.8 + t * .9);
      this.arcMat.opacity = Math.sin(t * Math.PI) * .85;
    }
    this.arc.visible = this.hand.visible = this.shoveT > 0;
    if (this.hand.visible) {
      const t = 1 - this.shoveT / SHOVE, reach = Math.sin(Math.min(1, t / .65) * Math.PI / 2);
      this.hand.position.set(this.dir * (.9 + reach * 2.1), 2.35 + Math.sin(t * Math.PI) * .3, .65 - reach * .9);
      this.hand.rotation.set(-.25, this.dir * (1.2 - reach * 2.4), -this.dir * .25);
      this.hand.scale.setScalar((.4 + Math.min(1, t * 9) * .85) * Math.min(1, (1 - t) * 6));
    }
    const k = this.hitT / HIT;
    if (k > 0) {
      p.position.y += Math.sin(k * Math.PI) * .6;
      p.rotation.z += -this.hitDir * Math.sin(k * Math.PI) * .16;
      p.position.x += this.hitDir * Math.sin(k * Math.PI) * .35;
      p.scale.y *= 1 - Math.sin(k * Math.PI) * .14;
    }
    const flash = k > .65 ? Math.pow((k - .65) / .35, 2) * .9 : 0;
    for (const [original, mat] of this.materials) {
      if (mat.color) mat.color.copy(original.color).lerp(this.flashColor, flash);
      if (mat.emissive) { mat.emissive.copy(original.emissive).lerp(this.glowColor, flash); mat.emissiveIntensity = (original.emissiveIntensity ?? 1) + flash * .8; }
    }
    this.stars.visible = dazed || k > 0;
    this.stars.position.y = this.headY + Math.sin(time * 9) * .12;
    this.stars.rotation.y = time * 7;
    for (const star of this.stars.children) star.rotation.y = -time * 7;
  }

  dispose() {
    this.detachModel();
    this.root.remove(this.pivot, this.arc, this.stars, this.hand);
    this.handGeo.dispose(); this.handMat.dispose();
    this.starGeo.dispose(); this.starMat.dispose(); this.arcGeo.dispose(); this.arcMat.dispose();
  }
}

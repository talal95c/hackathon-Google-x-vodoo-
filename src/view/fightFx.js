import * as THREE from 'three';

// Effets de combat, pour n'importe quel modèle de dino (on anime le dino entier, pas ses membres) :
//   shove(dir) : l'attaquant se jette sur le côté (penché + décalé vers sa cible) puis revient
//   hit(dir)   : la victime est projetée en tournoyant
//   étoiles qui tournent au-dessus de la tête tant qu'il est sonné
// apply() est appelé APRÈS le placement normal du dino (il ajoute l'animation par-dessus).
let STAR = null;
function starMaterial() {
  if (STAR) return STAR;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd740'; g.strokeStyle = '#ff6f00'; g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 12 : 28; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (STAR = new THREE.SpriteMaterial({ map: t, depthTest: false }));
}

const SHOVE = 0.35, HIT = 0.6;

export class FightFx {
  shoveT = 0; dir = 0; hitT = 0; hitDir = 0;

  constructor(root, headY = 4.7) {
    this.root = root;
    this.stars = new THREE.Group();
    this.stars.position.y = headY;
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(starMaterial());
      s.scale.setScalar(0.55);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
      s.renderOrder = 11;
      this.stars.add(s);
    }
    this.stars.visible = false;
    root.add(this.stars);
  }

  shove(dir) { this.shoveT = SHOVE; this.dir = Math.sign(dir) || 1; }
  hit(dir) { this.hitT = HIT; this.hitDir = Math.sign(dir) || 1; }

  apply(dt, dazed, time) {
    const r = this.root;
    if (this.shoveT > 0) {
      const p = Math.sin((1 - this.shoveT / SHOVE) * Math.PI); // 0 → 1 → 0
      r.translateX(this.dir * 1.1 * p);        // se jette vers la cible
      r.rotation.z -= this.dir * 0.55 * p;      // penché dans le coup
      r.rotation.y += this.dir * 0.35 * p;      // épaule en avant
      this.shoveT = Math.max(0, this.shoveT - dt);
    }
    if (this.hitT > 0) {
      const k = this.hitT / HIT;                // 1 → 0
      r.rotation.y += this.hitDir * k * k * 5;  // tournoie
      r.rotation.z += this.hitDir * 0.45 * k;   // bascule
      r.position.y += Math.sin(k * Math.PI) * 0.8;
      this.hitT = Math.max(0, this.hitT - dt);
    }
    this.stars.visible = dazed || this.hitT > 0;
    if (this.stars.visible) {
      this.stars.rotation.y = time * 7;
      this.stars.position.y = 4.7 + Math.sin(time * 9) * 0.12;
    }
  }
}

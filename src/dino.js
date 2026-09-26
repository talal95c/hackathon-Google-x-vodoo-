import * as THREE from 'three';

// Dino coureur, contrôle "runner" nerveux :
// - gauche/droite pilote directement la vitesse latérale (réponse immédiate)
// - la force centrifuge pousse vers l'extérieur des virages (∝ v² × courbure)
// - la glissade réduit cette poussée et charge un sprint
// Coordonnées piste : x = décalage latéral (+ = gauche), z = distance le long de la route.
export const TUNING = {
  baseSpeed: 26,        // vitesse de course au départ (m/s)
  maxBaseSpeed: 42,     // vitesse max (difficulté)
  accel: 3,             // réactivité vers la vitesse cible
  latSpeed: 13,         // vitesse latérale max (+ un peu avec la vitesse)
  latResponse: 16,      // nervosité du latéral (plus haut = plus sec)
  centrifugal: 0.2,     // poussée vers l'extérieur des virages
  driftCentrifugal: 0.4,// fraction de poussée conservée en glissade
  boostSpeed: 18,       // vitesse ajoutée pendant le sprint
  driftChargeRate: 0.9, // charge du sprint par seconde de glissade
  jumpVel: 13.5,        // impulsion de saut
  gravity: 38,
  fallGravity: 1.7,     // multiplicateur en redescente (saut plus sec)
  coyote: 0.1,          // on peut encore sauter 0.1 s après avoir quitté le sol
  jumpBuffer: 0.12,     // un appui juste avant l'atterrissage est gardé
  slopeEffect: 22,      // montée = plus lent, descente = plus rapide
};

const box = new THREE.BoxGeometry(1, 1, 1);
const GREY = 0x535353;

function part(parent, color, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color }));
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Dino {
  constructor(scene) {
    this.root = new THREE.Group();   // position + cap
    this.body = new THREE.Group();   // inclinaison / rebond
    this.root.add(this.body);
    scene.add(this.root);

    // T-rex façon pixel art Chrome, en cubes (regarde vers +z)
    const b = this.body;
    part(b, GREY, 1.4, 1.5, 1.9, 0, 2.0, 0);            // corps
    part(b, GREY, 1.0, 0.9, 0.9, 0, 2.8, 0.7);          // cou
    this.head = new THREE.Group();
    this.head.position.set(0, 3.35, 1.0);
    b.add(this.head);
    part(this.head, GREY, 1.2, 1.0, 1.7, 0, 0, 0.35);   // tête
    part(this.head, GREY, 1.2, 0.3, 0.9, 0, -0.55, 0.6); // mâchoire
    part(this.head, 0xffffff, 0.08, 0.28, 0.28, 0.61, 0.15, 0.25); // yeux
    part(this.head, 0xffffff, 0.08, 0.28, 0.28, -0.61, 0.15, 0.25);
    part(this.head, 0x111111, 0.1, 0.14, 0.14, 0.62, 0.15, 0.3);
    part(this.head, 0x111111, 0.1, 0.14, 0.14, -0.62, 0.15, 0.3);
    this.tail = new THREE.Group();
    this.tail.position.set(0, 2.1, -0.9);
    b.add(this.tail);
    part(this.tail, GREY, 0.9, 0.9, 1.1, 0, 0, -0.5);
    part(this.tail, GREY, 0.55, 0.55, 1.0, 0, -0.15, -1.4);
    this.arms = [-1, 1].map((s) => {
      const a = new THREE.Group(); a.position.set(s * 0.55, 2.2, 0.8); b.add(a);
      part(a, GREY, 0.28, 0.28, 0.6, 0, -0.1, 0.25);
      return a;
    });
    // Jambes : pivot à la hanche
    this.legs = [-1, 1].map((s) => {
      const l = new THREE.Group(); l.position.set(s * 0.42, 1.35, -0.1); b.add(l);
      part(l, GREY, 0.5, 1.0, 0.65, 0, -0.5, 0);
      part(l, GREY, 0.5, 0.3, 0.9, 0, -1.1, 0.2);
      return l;
    });

    // Ombre de contact (toujours au sol, même en saut)
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    this.blob.position.y = 0.03;
    scene.add(this.blob);

    this.reset();
  }

  reset() {
    this.x = 0; this.z = 5;
    this.Y = 0; this.vy = 0; this.y = 0;   // altitude absolue, vitesse verticale, hauteur au-dessus de la route
    this.speed = 20;                       // départ lancé
    this.latV = 0;                         // vitesse latérale pilotée
    this.push = 0;                         // poussée centrifuge courante
    this.cruise = TUNING.baseSpeed;
    this.boost = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0;
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.prevRoadVy = 0;
    this.stumble = 0; this.invul = 0;
    this.phase = 0; this.lastStep = 0; this.squash = 0;
    this.yaw = 0; this.steerVis = 0; this.slope = 0;
    this.root.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.root.visible = true;
  }

  // road : { y, vy (vitesse verticale de la route), slope, k (courbure, + = virage à gauche) }
  update(dt, input, events, road) {
    this.slope = road.slope;
    this.stumble = Math.max(0, this.stumble - dt);
    this.invul = Math.max(0, this.invul - dt);

    // --- Vertical (altitude absolue)
    if (input.jump) this.jumpBuf = TUNING.jumpBuffer;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.grounded) {
      this.Y = road.y;
      this.coyote = TUNING.coyote;
      // sommet de bosse pris trop vite : la route "tombe" plus vite que la gravité → on décolle
      const drop = (this.prevRoadVy - road.vy) / dt;
      if (drop > TUNING.gravity * 1.1 && this.speed > 15) { this.grounded = false; this.vy = this.prevRoadVy; events.push('air'); }
      else this.vy = road.vy;
    } else this.coyote = Math.max(0, this.coyote - dt);
    this.prevRoadVy = road.vy;

    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0) && this.stumble <= 0) {
      this.vy = Math.max(this.vy, road.vy) + TUNING.jumpVel;
      this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
      this.stopDrift(events, false);
      events.push('jump');
    }
    if (!this.grounded) {
      this.vy -= TUNING.gravity * (this.vy < 0 ? TUNING.fallGravity : 1) * dt;
      this.Y += this.vy * dt;
      if (this.Y <= road.y && this.vy < 0) {
        this.Y = road.y; this.grounded = true; this.squash = Math.min(1, -this.vy / 25);
        events.push('land');
      }
    }
    this.y = this.Y - road.y;

    // --- Glissade
    const steer = this.stumble > 0 ? 0 : input.steer;
    const wantDrift = input.drift && this.grounded && Math.abs(steer) > 0.2 && this.speed > 12;
    if (wantDrift && !this.drifting) { this.drifting = true; this.driftDir = Math.sign(steer); events.push('driftStart'); }
    if (this.drifting && !input.drift) this.stopDrift(events, true);
    if (this.drifting) this.driftCharge = Math.min(1.5, this.driftCharge + dt * TUNING.driftChargeRate * (0.6 + Math.abs(steer)));

    // --- Vitesse
    this.boost = Math.max(0, this.boost - dt);
    let target = this.cruise + (this.boost > 0 ? TUNING.boostSpeed : 0) - this.slope * TUNING.slopeEffect;
    if (input.brake) target *= 0.5;
    if (this.drifting) target *= 0.95;
    if (this.stumble > 0) target *= 0.6;
    this.speed += (target - this.speed) * Math.min(1, TUNING.accel * dt * (this.boost > 0 ? 2 : 1));

    // --- Latéral : pilotage direct + centrifuge
    const latMax = (TUNING.latSpeed + this.speed * 0.12) * (this.drifting ? 1.15 : 1);
    const control = this.grounded ? 1 : 0.55;
    this.latV += (steer * latMax - this.latV) * Math.min(1, dt * TUNING.latResponse * control);
    const cf = TUNING.centrifugal * (this.drifting ? TUNING.driftCentrifugal : 1) * (this.grounded ? 1 : 0.5);
    this.push = -road.k * this.speed * this.speed * cf;
    this.x += (this.latV + this.push) * dt;
    this.z += this.speed * dt;

    this.animate(dt, steer, this.speed, events);
  }

  stopDrift(events, allowBoost) {
    if (!this.drifting) return;
    this.drifting = false;
    if (allowBoost && this.driftCharge > 0.35) {
      this.boost = Math.max(this.boost, 0.5 + this.driftCharge * 1.4);
      events.push(this.driftCharge > 1 ? 'boostBig' : 'boost');
    }
    this.driftCharge = 0;
  }

  animate(dt, steer, fwd, events) {
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 10);
    const run = Math.min(1.4, fwd / 26);
    if (this.grounded) this.phase += dt * fwd * 0.42;
    const s = Math.sin(this.phase);

    const step = Math.floor(this.phase / Math.PI);
    if (this.grounded && step !== this.lastStep) { this.lastStep = step; events.push('step'); }

    // cap visuel relatif à la route : le dino regarde là où il va vraiment
    const wobble = this.stumble > 0 ? Math.sin(this.stumble * 45) * 0.5 : 0;
    const moveYaw = Math.atan2(this.latV + this.push, Math.max(8, fwd));
    this.yaw += ((this.drifting ? this.driftDir * 0.6 : moveYaw * 0.9) + wobble - this.yaw) * Math.min(1, dt * 12);

    if (this.grounded) {
      this.legs[0].rotation.x = s * 0.95 * run;
      this.legs[1].rotation.x = -s * 0.95 * run;
      this.arms[0].rotation.x = -s * 0.6;
      this.arms[1].rotation.x = s * 0.6;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.22 * run;
      this.tail.rotation.y = s * 0.25;
      this.tail.rotation.x = 0.1;
    } else {
      for (const l of this.legs) l.rotation.x += (-0.8 - l.rotation.x) * Math.min(1, dt * 14);
      for (const a of this.arms) a.rotation.x += (-1.2 - a.rotation.x) * Math.min(1, dt * 14);
      this.body.position.y = 0;
      this.tail.rotation.x = -0.4;
    }
    if (this.drifting) { this.legs[0].rotation.x = 0.8; this.legs[1].rotation.x = -0.4; }

    // écrasement à l'atterrissage, étirement en l'air
    this.squash = Math.max(0, this.squash - dt * 5);
    const stretch = this.grounded ? 1 - this.squash * 0.3 : 1 + Math.min(0.12, Math.abs(this.vy) * 0.008);
    this.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    this.body.rotation.x = 0.12 * run + (this.boost > 0 ? 0.15 : 0) + (this.stumble > 0 ? 0.4 : 0);
    this.body.rotation.z = -this.steerVis * (this.drifting ? 0.4 : 0.2);
    this.head.rotation.x = -0.1 * run + Math.sin(this.phase * 2) * 0.04;
    this.head.rotation.y = this.steerVis * 0.25;

    // clignote pendant l'invulnérabilité
    this.root.visible = this.invul <= 0 || Math.floor(this.invul * 16) % 2 === 0;
  }

  // Place le dino dans le monde. f = repère de la route en s (track.frame)
  place(f) {
    this.root.position.set(f.x + f.lx * this.x, this.Y, f.z + f.lz * this.x);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = f.th + this.yaw;
    this.root.rotation.x = this.grounded ? -Math.atan(f.slope) * 0.6 : this.root.rotation.x * 0.9;
    this.blob.position.set(this.root.position.x, f.y + 0.05, this.root.position.z);
    this.blob.rotation.set(-Math.atan(f.slope), f.th, 0, 'YXZ');
    const sc = Math.max(0.3, 1 - this.y * 0.15);
    this.blob.scale.set(sc, 1, sc);
    this.blob.visible = this.y > -0.5;
  }

  crash() {
    this.speed *= 0.65;
    this.boost = 0;
    this.drifting = false; this.driftCharge = 0;
    this.stumble = 0.35;
    this.invul = 1.1;
  }

  // Direction monde du déplacement (pour particules / chute)
  get worldYawOffset() { return this.yaw; }
}

import { RUNNER } from './config.js';
import { Stats } from './Stats.js';
import { Weapons, Effects } from './Registry.js';
import { StatusEffect } from '../weapons/StatusEffect.js';

// Le dino : physique "runner" nerveuse, armes, bonus. Aucune dépendance graphique.
//
// Coordonnées piste : x = latéral (+ = gauche), z = distance le long de la route.
// Y = altitude absolue, y = hauteur au-dessus de la route.
//
// État lu par les vues : x, z, Y, y, vy, speed, latV, push, grounded, drifting, driftDir,
// driftCharge, boost, stumble, invul, gait (cycle de course, radians), steer, weapon, effects.
export class Runner {
  constructor(game) {
    this.game = game;
    this.stats = new Stats(RUNNER);
    this.effects = new Map();
    this.weapon = null;
    this.reset();
  }

  // modifiers : [{ source, add, mul }] (skin, améliorations achetées…)
  reset(modifiers = []) {
    this.stats.clear();
    for (const m of modifiers) this.stats.set(m.source, m);
    this.effects.clear();
    this.weapon = null;

    this.x = 0; this.z = 0;
    this.Y = 0; this.vy = 0; this.y = 0;
    this.speed = RUNNER.startSpeed;
    this.cruise = RUNNER.baseSpeed;
    this.latV = 0; this.push = 0; this.steer = 0;
    this.boost = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0;
    this.slideGauge = 1;      // jauge de glissade (0 → 1)
    this.slideLock = false;   // jauge vidée : il faut relâcher SHIFT avant de reglisser
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.prevRoadVy = 0;
    this.stumble = 0; this.invul = 0;
    this.gait = 0; this.lastStep = 0;
  }

  get isInvulnerable() { return this.invul > 0 || !!this.weapon?.grantsInvulnerability; }
  get smashes() { return !!this.weapon?.smashes; }

  // --- API utilisée par les entités / armes
  hurt(source) {
    if (this.isInvulnerable) return false;
    const S = this.stats;
    this.speed *= S.get('hitSpeedFactor');
    this.boost = 0;
    this.drifting = false; this.driftCharge = 0;
    this.stumble = S.get('stumbleTime');
    this.invul = S.get('invulAfterHit');
    this.game.emit('runner:hit', { source });
    this.game.loseLife('hit');
    return true;
  }

  addBoost(seconds, source = 'drift') {
    this.boost = Math.max(this.boost, seconds);
    this.game.emit('runner:boost', { seconds, source, big: seconds > 1.8 });
  }

  equip(weaponId) {
    if (this.weapon) this.#unequip(false);
    const def = Weapons.get(weaponId);
    this.weapon = new def.class(this, def);
    this.weapon.onEquip();
    this.game.emit('weapon:equip', { weapon: this.weapon });
  }

  addEffect(effectId) {
    const existing = this.effects.get(effectId);
    if (existing) { existing.refresh(); return; }
    const def = Effects.get(effectId);
    const fx = new (def.class || StatusEffect)(this, def);
    fx.apply();
    this.effects.set(effectId, fx);
    this.game.emit('effect:add', { effect: fx });
  }

  // --- Simulation
  // intent : { steer: -1..1 (+1 = gauche), drift, brake, jump (front montant) }
  // road : { y, vy, slope, k } sous le dino
  update(dt, intent, road) {
    const S = this.stats, g = this.game;
    this.stumble = Math.max(0, this.stumble - dt);
    this.invul = Math.max(0, this.invul - dt);

    // Vertical (altitude absolue)
    if (intent.jump) this.jumpBuf = S.get('jumpBuffer');
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.grounded) {
      this.Y = road.y;
      this.coyote = S.get('coyote');
      // sommet de bosse pris trop vite : la route "tombe" plus vite que la gravité → on décolle
      const drop = (this.prevRoadVy - road.vy) / dt;
      if (drop > S.get('gravity') * 1.1 && this.speed > 15) { this.grounded = false; this.vy = this.prevRoadVy; g.emit('runner:air'); }
      else this.vy = road.vy;
    } else this.coyote = Math.max(0, this.coyote - dt);
    this.prevRoadVy = road.vy;

    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0) && this.stumble <= 0) {
      this.vy = Math.max(this.vy, road.vy) + S.get('jumpVel');
      this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
      this.#stopDrift(false);
      g.emit('runner:jump');
    }
    if (!this.grounded) {
      this.vy -= S.get('gravity') * (this.vy < 0 ? S.get('fallGravity') : 1) * dt;
      this.Y += this.vy * dt;
      if (this.Y <= road.y && this.vy < 0) {
        const impact = Math.min(1, -this.vy / 25);
        this.Y = road.y; this.grounded = true;
        g.emit('runner:land', { impact });
      }
    }
    this.y = this.Y - road.y;

    // Glissade → sprint au relâchement
    const steer = this.stumble > 0 ? 0 : intent.steer;
    this.steer = steer;
    const wantDrift = intent.drift && this.grounded && Math.abs(steer) > 0.2 && this.speed > 12;
    if (!intent.drift) this.slideLock = false;
    if (wantDrift && !this.drifting && !this.slideLock && this.slideGauge >= S.get('slideMin')) { this.drifting = true; this.driftDir = Math.sign(steer); g.emit('runner:drift', { on: true }); }
    if (this.drifting && this.slideGauge <= 0) { this.slideLock = true; this.#stopDrift(true); } // jauge vide
    else if (this.drifting && !intent.drift) this.#stopDrift(true);                              // relâché
    if (this.drifting) {
      this.driftCharge = Math.min(1.5, this.driftCharge + dt * S.get('driftChargeRate') * (0.6 + Math.abs(steer)));
      this.slideGauge = Math.max(0, this.slideGauge - dt * S.get('slideDrain'));
    } else this.slideGauge = Math.min(1, this.slideGauge + dt * S.get('slideRegen'));

    // Vitesse
    this.boost = Math.max(0, this.boost - dt);
    let target = this.cruise + (this.boost > 0 ? S.get('boostSpeed') : 0) - road.slope * S.get('slopeEffect');
    if (intent.brake) target *= 0.5;
    if (this.drifting) target *= 0.95;
    if (this.stumble > 0) target *= 0.6;
    this.speed += (target - this.speed) * Math.min(1, S.get('accel') * dt * (this.boost > 0 ? 2 : 1));

    // Latéral : pilotage direct + force centrifuge
    const latMax = (S.get('latSpeed') + this.speed * 0.12) * (this.drifting ? 1.15 : 1);
    const control = this.grounded ? 1 : S.get('airControl');
    this.latV += (steer * latMax - this.latV) * Math.min(1, dt * S.get('latResponse') * control);
    const cf = S.get('centrifugal') * (this.drifting ? S.get('driftCentrifugal') : 1) * (this.grounded ? 1 : 0.5);
    this.push = -road.k * this.speed * this.speed * cf;
    this.x += (this.latV + this.push) * dt;
    this.z += this.speed * dt;

    // Cycle de course calé sur la musique : une foulée complète (2 pas) par temps
    if (this.grounded) {
      this.gait = g.beat.beats * Math.PI * 2;
      const step = Math.floor(this.gait / Math.PI);
      if (step !== this.lastStep) { this.lastStep = step; g.emit('runner:step'); }
    }

    // Arme et bonus
    if (this.weapon) {
      this.weapon.update(dt);
      if (this.weapon.timeLeft <= 0) this.#unequip(true);
    }
    for (const [id, fx] of this.effects) {
      fx.update(dt);
      if (fx.timeLeft <= 0) { fx.remove(); this.effects.delete(id); g.emit('effect:expire', { effect: fx }); }
    }
  }

  #stopDrift(allowBoost) {
    if (!this.drifting) return;
    this.drifting = false;
    this.game.emit('runner:drift', { on: false });
    if (allowBoost && this.driftCharge > 0.35) this.addBoost(0.5 + this.driftCharge * 1.4, 'drift');
    this.driftCharge = 0;
  }

  #unequip(expired) {
    const w = this.weapon;
    this.weapon = null;
    w.onExpire();
    this.game.emit('weapon:expire', { weapon: w, expired });
  }
}

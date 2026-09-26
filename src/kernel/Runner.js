import { RUNNER, ROYALE } from './config.js';
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
// Course Royale : shoveV (poussée latérale subie/donnée), shoveCd, drafting (aspiration, posé par
// race/Participant.js), slipCharge, autopilot (s restantes de pilotage auto), tricking.
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
    this.manual = false;      // true = dans un virage dur (aspiration vers l'extérieur)
    this.boost = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0;
    this.slideGauge = 1;      // jauge de glissade (0 → 1)
    this.slideLock = false;   // jauge vidée : il faut relâcher SHIFT avant de reglisser
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.prevRoadVy = 0;
    this.stumble = 0; this.invul = 0;
    this.gait = 0; this.lastStep = 0;
    this.shoveV = 0; this.shoveCd = 0;
    this.drafting = false; this.slipCharge = 0;
    this.autopilot = 0;
    this.tricking = false; this.trickDone = false;
  }

  get isInvulnerable() { return !!this.game.worldJump || this.invul > 0 || this.game.feverTime > 0 || this.autopilot > 0 || !!this.weapon?.grantsInvulnerability; }
  get raging() { return this.effects.has('rage'); }

  // Coup d'épaule : petit dash latéral (dir +1 = gauche). Renvoie false pendant le temps de recharge.
  dash(dir) {
    if (this.shoveCd > 0 || this.stumble > 0 || !dir) return false;
    this.shoveCd = ROYALE.shove.cooldown;
    this.shoveV += Math.sign(dir) * ROYALE.shove.dash;
    this.game.emit('runner:dash', { dir: Math.sign(dir) });
    return true;
  }
  get smashes() { return this.game.feverTime > 0 || !!this.weapon?.smashes; }

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
  // road : { y, vy, slope, k, hard } sous le dino (hard = dans un virage dur)
  update(dt, intent, road) {
    const S = this.stats, g = this.game;
    this.stumble = Math.max(0, this.stumble - dt);
    this.invul = Math.max(0, this.invul - dt);
    this.shoveCd = Math.max(0, this.shoveCd - dt);
    this.autopilot = Math.max(0, this.autopilot - dt);
    if (this.autopilot > 0) {
      // Téléchargement express : le jeu pilote au centre de la route, sprint continu
      intent = { ...intent, steer: Math.max(-1, Math.min(1, (-this.x * 3 - this.push) / 10)), drift: false, brake: false, jump: false };
      this.boost = Math.max(this.boost, 0.2);
    }

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

    // Figure en l'air (Royale) : sauter une 2e fois bien au-dessus de la route → sprint à l'atterrissage
    if (intent.jump && g.royale && !this.grounded && this.coyote <= 0 && this.Y - road.y > 1.2 && !this.trickDone) {
      this.tricking = true; this.trickDone = true; this.jumpBuf = 0;
      g.emit('runner:trick');
    }
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
        if (this.tricking && this.stumble <= 0) this.addBoost(ROYALE.trickBoost, 'trick');
        this.tricking = false; this.trickDone = false;
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

    // Aspiration : rester derrière un rival charge un sprint
    if (this.drafting && this.grounded) {
      this.slipCharge += dt;
      if (this.slipCharge >= ROYALE.slipstream.charge) { this.slipCharge = 0; this.addBoost(ROYALE.slipstream.boost, 'slipstream'); }
    } else this.slipCharge = Math.max(0, this.slipCharge - dt * 2);

    // Vitesse
    this.boost = Math.max(0, this.boost - dt);
    let target = this.cruise + (this.boost > 0 ? S.get('boostSpeed') : 0) - road.slope * S.get('slopeEffect');
    if (intent.brake) target *= 0.5;
    if (this.drifting) target *= 0.95;
    if (this.stumble > 0) target *= 0.6;
    if (this.manual) target *= S.get('hardSlowdown');
    this.speed += (target - this.speed) * Math.min(1, S.get('accel') * dt * (this.boost > 0 ? 2 : 1));

    const control = this.grounded ? 1 : S.get('airControl');
    const hardDir = road.hard ? Math.sign(road.k) : 0; // +1 = virage à gauche
    if ((hardDir !== 0) !== this.manual) { this.manual = hardDir !== 0; g.emit('runner:manual', { on: this.manual, dir: hardDir }); }
    const latMax = (S.get('latSpeed') + this.speed * 0.12) * (this.drifting ? 1.15 : 1);
    this.latV += (steer * latMax - this.latV) * Math.min(1, dt * S.get('latResponse') * control);
    if (this.manual) {
      // Virage dur : aspiration constante vers l'extérieur, il faut tenir la direction du virage
      this.push = -hardDir * latMax * S.get('hardPull') * (this.drifting ? S.get('hardPullDrift') : 1);
    } else {
      const cf = S.get('centrifugal') * (this.drifting ? S.get('driftCentrifugal') : 1) * (this.grounded ? 1 : 0.5);
      this.push = -road.k * this.speed * this.speed * cf;
    }
    this.x += (this.latV + this.push + this.shoveV) * dt;
    this.shoveV *= Math.exp(-5 * dt);
    if (Math.abs(this.shoveV) < 0.05) this.shoveV = 0;
    this.z += this.speed * dt;

    // Cycle de course (animation + bruits de pas), proportionnel à la vitesse
    if (this.grounded) {
      this.gait += dt * this.speed * 0.42;
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

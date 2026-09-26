// Réactions vocales du perso (voix Gradium pré-générées, cf. scripts/voices).
// Écoute le kernel, choisit une réplique selon l'événement, sa priorité et un cooldown global :
// assez souvent pour porter l'énergie de la course, jamais au point de saouler.
//
//   const voices = new VoiceDirector(game, { player, getBest: () => profile.data.best });
//   voices.update(dt) chaque frame (danger du curseur, record en cours de run)
//
// player : { load(manifest) → Promise, play(file, character) → durée (s) | 0, stop() } (WebVoicePlayer en navigateur)

// priority : une réplique plus prioritaire (d'au moins 2) coupe celle en cours ; chance : filtre anti-spam
export const VOICE_EVENTS = {
  start:       { priority: 3, chance: 1 },
  tempo:       { priority: 3, chance: 0.9 },
  world:       { priority: 4, chance: 1 },
  parry:       { priority: 2, chance: 0.45 },
  boost:       { priority: 2, chance: 0.5 },
  coins:       { priority: 1, chance: 0.6 },
  fever:       { priority: 5, chance: 1 },
  hit:         { priority: 4, chance: 1 },
  lastLife:    { priority: 5, chance: 1 },
  danger:      { priority: 4, chance: 1 },
  escape:      { priority: 2, chance: 0.8 },
  record:      { priority: 6, chance: 1 },
  boss:        { priority: 5, chance: 1 },
  bossDown:    { priority: 5, chance: 1 },
  bossEscaped: { priority: 3, chance: 1 },
  fall:        { priority: 6, chance: 1 },
  over:        { priority: 7, chance: 1 },
  overRecord:  { priority: 7, chance: 1 },
};

export const VOICE = {
  gap: 1.2,           // silence minimal entre deux répliques (s)
  cooldown: 2.6,      // délai minimal entre deux répliques de faible priorité (s)
  eventCooldown: 7,   // une même réaction ne revient pas avant (s)
  coinChain: 10,      // pièces enchaînées pour déclencher « coins »
  dangerOn: 0.78,     // danger du curseur (0..1) déclenchant l'alerte
  dangerOff: 0.35,    // … et considéré comme semé en dessous
  tauntChance: 0.35,  // le curseur ricane au départ / quand il colle
};

export class VoiceDirector {
  constructor(game, { player, getBest = () => 0, random = Math.random } = {}) {
    this.game = game;
    this.player = player;
    this.getBest = getBest;
    this.random = random;
    this.enabled = true;
    this.lines = null;
    this.character = 'classic';
    this.#reset();
    this.#bind();
  }

  // manifest : { lines: { [perso]: { [event]: [{ file, text }] } } }
  setManifest(manifest) { this.lines = manifest?.lines ?? null; }

  setSkin(skin) { this.character = this.lines?.[skin] ? skin : 'classic'; }

  #reset() {
    this.time = 0;
    this.busyUntil = 0;
    this.current = 0;
    this.lastAt = -Infinity;
    this.eventAt = {};
    this.lastLine = {};
    this.danger = false;
    this.recordDone = false;
    this.best = 0;
    this.chain = 0;
    this.lastCoin = -Infinity;
  }

  #bind() {
    const on = (t, fn) => this.game.on(t, fn);
    on('game:start', ({ loadout }) => {
      this.#reset();
      this.best = this.getBest();
      if (loadout?.skin) this.setSkin(loadout.skin);
      this.say('start');
      if (this.random() < VOICE.tauntChance) this.#after(2.2, () => this.say('taunt', { character: 'cursor', priority: 2 }));
    });
    on('tempo', ({ level }) => { if (level > 0) this.say('tempo'); });
    on('world:jump', () => this.say('world'));
    on('runner:parry', () => this.say('parry'));
    on('runner:boost', ({ big }) => { if (big) this.say('boost'); });
    on('entity:destroy', ({ entity, reason }) => {
      if (reason !== 'collected' || (entity.type !== 'coin' && entity.type !== 'goldCoin')) return;
      this.chain = this.time - this.lastCoin < 0.8 ? this.chain + 1 : 1;
      this.lastCoin = this.time;
      if (this.chain === VOICE.coinChain) this.say('coins');
    });
    on('fever:start', () => this.say('fever'));
    on('life:lost', ({ lives }) => {
      if (lives === 1) this.say('lastLife', { force: true });
      else if (lives > 1) this.say('hit', { force: true });
    });
    on('boss:start', () => this.say('boss'));
    on('boss:defeated', () => this.say('bossDown'));
    on('boss:escaped', () => this.say('bossEscaped'));
    on('runner:fall', () => this.say('fall', { force: true }));
    on('game:over', ({ reason, score }) => {
      const record = this.best > 0 && score > this.best;
      if (reason === 'caught') {
        this.say('caught', { character: 'cursor', force: true, priority: 7 });
        this.#after(1.6, () => this.say(record ? 'overRecord' : 'over', { force: true }));
      } else this.#after(reason === 'fall' ? 0.9 : 0.4, () => this.say(record ? 'overRecord' : 'over', { force: true }));
    });
  }

  update(dt) {
    this.time += dt;
    this.#runTimers();
    const g = this.game;
    if (g.state !== 'playing') return;
    const danger = g.chaser.danger(g.sMax);
    if (!this.danger && danger >= VOICE.dangerOn) {
      this.danger = true;
      const cursor = this.random() < VOICE.tauntChance;
      this.say('danger', cursor ? { character: 'cursor' } : {});
    } else if (this.danger && danger <= VOICE.dangerOff) {
      this.danger = false;
      this.say('escape');
    }
    if (!this.recordDone && this.best > 0 && g.score > this.best) {
      this.recordDone = true;
      this.say('record');
    }
  }

  // Joue une réplique de l'événement si les règles le permettent. Renvoie la réplique jouée ou null.
  say(event, { character = this.character, force = false, priority } = {}) {
    if (!this.enabled || !this.lines) return null;
    const rule = VOICE_EVENTS[event] ?? { priority: priority ?? 3, chance: 1 };
    const prio = priority ?? rule.priority;
    const pool = this.lines[character]?.[event] ?? (character !== 'classic' ? this.lines.classic?.[event] : null);
    if (!pool?.length) return null;
    const key = `${character}:${event}`;
    if (!force) {
      if (this.random() > rule.chance) return null;
      if (this.time - (this.eventAt[key] ?? -Infinity) < VOICE.eventCooldown) return null;
      if (this.time < this.busyUntil && prio < this.current + 2) return null;
      if (this.time - this.lastAt < (prio >= 4 ? VOICE.gap : VOICE.cooldown) && this.time >= this.busyUntil && prio < this.current + 2) return null;
    } else if (this.time < this.busyUntil && prio < this.current) return null;

    // Jamais deux fois la même réplique de suite
    let i = Math.floor(this.random() * pool.length);
    if (pool.length > 1 && i === this.lastLine[key]) i = (i + 1) % pool.length;
    this.lastLine[key] = i;
    const line = pool[i];

    this.player?.stop();
    const duration = this.player?.play(line.file, character) || 1.2;
    this.eventAt[key] = this.time;
    this.lastAt = this.time;
    this.busyUntil = this.time + duration;
    this.current = prio;
    return line;
  }

  #after(delay, fn) { (this.timers ??= []).push({ at: this.time + delay, fn }); }

  #runTimers() {
    if (!this.timers?.length) return;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    due.forEach((t) => t.fn());
  }
}

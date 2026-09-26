// Bonus temporaire : applique def.modifiers aux stats du dino pendant def.duration.
// Ex : { duration: 8, modifiers: { add: { magnetRange: 12 } } }
export class StatusEffect {
  constructor(runner, def) {
    this.runner = runner;
    this.def = def;
    this.type = def.id;
    this.duration = def.duration;
    this.timeLeft = def.duration;
  }

  get source() { return `effect:${this.type}`; }
  get progress() { return this.timeLeft / this.duration; }

  apply() { this.runner.stats.set(this.source, this.def.modifiers || {}); }
  refresh() { this.timeLeft = this.duration; }
  update(dt) { this.timeLeft -= dt; }
  remove() { this.runner.stats.remove(this.source); }
}

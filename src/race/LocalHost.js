import { RaceCore } from './RaceCore.js';
import { Bot, botName } from './Bot.js';

// Course entièrement dans le navigateur (entraînement contre les bots, tests) :
// même RaceCore que le serveur, messages livrés en différé comme sur le réseau.
export class LocalHost {
  constructor({ clock = () => Date.now(), endTime, interval } = {}) {
    this.clock = clock;
    this.clients = new Map();   // id → handler(msg)
    this.bots = [];
    this.queue = [];
    this.core = new RaceCore({ now: clock, endTime, interval, send: (to, msg) => this.queue.push([to, msg]) });
  }

  // Joueur humain : renvoie la fonction d'envoi vers la course
  join({ id, name, skin }, handler) {
    this.core.addPlayer({ id, name, skin });
    this.clients.set(id, handler);
    return (msg) => this.core.onMessage(id, msg);
  }

  addBots(n, skill = 0.65) {
    for (let i = 0; i < n; i++) {
      const id = `bot${this.bots.length + 1}`, name = botName(this.bots.length);
      const bot = new Bot({ id, name, clock: this.clock, skill: skill + (i % 3) * 0.1, send: (msg) => this.core.onMessage(id, msg) });
      this.core.addPlayer({ id, name, bot: true });
      this.clients.set(id, (msg) => bot.handle(msg));
      this.bots.push(bot);
    }
  }

  start(seed) { this.core.start({ seed }); this.flush(); }

  flush() {
    const q = this.queue;
    this.queue = [];
    for (const [to, msg] of q) {
      if (to === null) for (const h of this.clients.values()) h(msg);
      else this.clients.get(to)?.(msg);
    }
  }

  update(dt) {
    for (const b of this.bots) b.update(dt);
    this.core.tick();
    this.flush();
  }
}

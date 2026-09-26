import '../src/content/index.js';
import { RaceCore } from '../src/race/RaceCore.js';
import { Bot, botName } from '../src/race/Bot.js';
import { ROYALE } from '../src/kernel/config.js';
import { CODE_ALPHABET, MIN_RACERS, QUICK_FILL_MS, RACE_TYPES } from '../src/net/protocol.js';

// Un salon = une course : jusqu'à 5 dinos (humains + bots), un RaceCore qui fait autorité.
export function makeCode(taken, rnd = Math.random) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
    if (!taken.has(c)) return c;
  }
}

export class Room {
  constructor({ code, mode = 'friends', progress, now = () => Date.now(), onEmpty = () => {}, fillMs = QUICK_FILL_MS, endTime, interval }) {
    Object.assign(this, { code, mode, progress, now, onEmpty, fillMs });
    this.clients = new Map(); // id → { send, account, name, skin }
    this.bots = [];
    this.host = null;
    this.createdAt = now();
    this.core = new RaceCore({
      now, endTime, interval,
      send: (to, msg) => this.#deliver(to, msg),
      onEnd: (results) => this.#rewards(results),
    });
  }

  get phase() { return this.core.phase; }
  get size() { return this.core.players.size; }
  get open() { return this.phase === 'lobby' && this.size < ROYALE.maxPlayers; }

  join(id, { send, account, name, skin }) {
    if (!this.open) return false;
    this.core.addPlayer({ id, name, skin, elo: account.profile.elo, trophies: account.profile.trophies });
    this.clients.set(id, { send, account, name, skin });
    this.host ??= id;
    this.broadcastLobby();
    return true;
  }

  leave(id) {
    if (!this.clients.delete(id)) return;
    this.core.removePlayer(id);
    if (this.host === id) this.host = this.clients.keys().next().value ?? null;
    if (!this.clients.size) { this.stop(); this.onEmpty(this); return; }
    this.broadcastLobby();
  }

  addBot() {
    if (!this.open) return;
    const i = this.bots.length, id = `bot-${this.code}-${i + 1}`, name = botName(i + this.code.charCodeAt(0));
    const skill = this.mode === 'ranked' ? 0.8 : 0.6 + (i % 3) * 0.1;
    const bot = new Bot({ id, name, clock: this.now, skill, send: (msg) => this.core.onMessage(id, msg) });
    this.core.addPlayer({ id, name, bot: true });
    this.bots.push(bot);
    this.broadcastLobby();
  }

  start(by) {
    if (this.phase !== 'lobby' || (by && by !== this.host && this.mode === 'friends')) return;
    while (this.size < Math.min(MIN_RACERS, ROYALE.maxPlayers) && this.mode !== 'friends') this.addBot();
    if (this.size < ROYALE.minPlayers) this.addBot();
    this.core.start({});
    let last = this.now();
    this.timer = setInterval(() => {
      const t = this.now(), dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      this.update(dt);
    }, 1000 / 60);
  }

  update(dt) {
    if (this.phase === 'lobby') {
      if (this.mode !== 'friends' && this.now() - this.createdAt >= this.fillMs) this.start();
      return;
    }
    for (const b of this.bots) b.update(dt);
    this.core.tick();
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  onMessage(id, msg) {
    if (msg.t === 'addBot' && id === this.host && this.mode === 'friends') return this.addBot();
    if (msg.t === 'start') return this.start(id);
    if (RACE_TYPES.has(msg.t)) this.core.onMessage(id, msg);
  }

  broadcastLobby() {
    const startsIn = this.mode === 'friends' ? null : Math.max(0, this.fillMs - (this.now() - this.createdAt));
    const players = this.core.list().map((p) => ({ ...p, trophies: this.core.players.get(p.id).trophies ?? null }));
    this.#deliver(null, { t: 'lobby', code: this.code, mode: this.mode, host: this.host, players, startsIn });
  }

  #deliver(to, msg) {
    if (to === null) {
      const s = JSON.stringify(msg);
      for (const c of this.clients.values()) c.send(s);
      for (const b of this.bots) b.handle(msg);
      return;
    }
    const c = this.clients.get(to);
    if (c) return c.send(JSON.stringify(msg));
    this.bots.find((b) => b.id === to)?.handle(msg);
  }

  async #rewards(results) {
    const accounts = new Map([...this.clients].map(([id, c]) => [id, c.account]));
    const rewards = await this.progress.apply({ mode: this.mode, results, players: accounts });
    for (const [id, r] of rewards) this.clients.get(id)?.send(JSON.stringify({ t: 'rewards', mode: this.mode, ...r }));
    setTimeout(() => this.stop(), 1000);
    return { mode: this.mode };
  }
}

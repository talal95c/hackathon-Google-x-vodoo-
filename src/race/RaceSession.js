import { Participant } from './Participant.js';
import { LocalHost } from './LocalHost.js';

const RACE_MSGS = new Set(['race:start', 'snaps', 'standings', 'item', 'combo', 'impulse', 'hit', 'trap', 'elim', 'race:end', 'fx', 'feed', 'emote', 'shoveHit']);

// Course en cours côté navigateur : entraînement local contre des bots (LocalHost)
// ou partie en ligne (NetClient). Les vues et la HUD lisent this.p (Participant).
export class RaceSession {
  p = null; host = null; net = null; kind = null;

  constructor(game) { this.game = game; }

  get active() { return !!this.p && this.p.phase !== 'idle'; }
  get online() { return this.kind === 'online'; }

  training({ name, skin, bots = 4, seed = (Math.random() * 2 ** 32) >>> 0 }) {
    this.leave();
    const host = new LocalHost(), id = 'me';
    const send = host.join({ id, name, skin }, (msg) => this.p?.handle(msg));
    this.p = new Participant({ game: this.game, id, name, skin, send });
    host.addBots(bots);
    this.host = host; this.kind = 'training';
    host.start(seed);
  }

  attach(net, { name, skin }) {
    this.leave();
    this.net = net; this.kind = 'online';
    this.p = new Participant({ game: this.game, id: net.id, name, skin, send: (m) => net.send(m), clock: () => net.now() });
  }

  handle(msg) { if (RACE_MSGS.has(msg.t)) this.p?.handle(msg); }

  update(dt, intent) {
    this.host?.update(dt);
    this.p.update(dt, intent);
  }

  leave() {
    this.p?.dispose();
    this.p = null; this.host = null; this.net = null; this.kind = null;
  }

  // Position (repère route : z, x, y) d'un coureur, soi compris
  posOf(id) {
    const p = this.p;
    if (!p) return null;
    if (id === p.id) {
      const r = this.game.runner;
      return this.game.state === 'playing' || this.game.state === 'falling' ? { z: r.z, x: r.x, y: r.y } : null;
    }
    return p.rivals.get(id)?.alive ? p.rivalState(id) : null;
  }

  // Éliminé : on suit le meneur
  get spectate() {
    const p = this.p;
    if (!p || (p.phase !== 'out' && p.phase !== 'done')) return null;
    const id = p.standings.find((x) => x !== p.id && p.rivals.get(x)?.alive);
    return id ? { id, name: p.rivals.get(id).name, state: p.rivalState(id) } : null;
  }

  nameOf(id) { return id === this.p?.id ? this.p.name : this.p?.rivals.get(id)?.name ?? '?'; }
  colorOf(id) { return id === this.p?.id ? this.p.color : this.p?.rivals.get(id)?.color ?? 0x888888; }
}

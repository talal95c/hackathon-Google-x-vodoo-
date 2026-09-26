import { connect } from './Net.js';
import { bumpImpulse, shoveTarget, roomCode, FIGHT } from './rules.js';

// Multijoueur "course de combat" : même graine = même route pour tous ; chaque joueur fait
// tourner son propre jeu et diffuse sa position (15 fois/s). Les rivaux sont affichés avec un
// léger retard lissé. Contacts et coups d'épaule : chacun applique ce qu'il SUBIT à son dino.
//
// Événements (mp.on) : 'lobby' (joueurs), 'status' (texte), 'start' { seed, world, delay },
// 'shove' { hit }, 'shoved' { from }, 'bump', 'results'.
const COLORS = ['#ff4f8b', '#1a73e8', '#34a853', '#fbbc04', '#a142f4', '#ff6d00', '#00bcd4'];
const SEND_EVERY = 1 / 15, RENDER_DELAY = 110, NAME_KEY = 'dino-escape-name';

export class Multiplayer {
  code = null;
  net = null;
  isHost = false;
  inRace = false;
  peers = new Map();       // id → { id, name, skin, color, samples[], view, alive, final }
  #listeners = new Map();
  #sendTimer = 0;
  #shoveCd = 0;
  #bumpCd = new Map();

  constructor(game, profile) {
    this.game = game;
    this.profile = profile;
    try { this.name = localStorage.getItem(NAME_KEY) || ''; } catch { this.name = ''; }
    if (!this.name) this.name = `Dino${Math.floor(Math.random() * 900 + 100)}`;
  }

  on(type, fn) { if (!this.#listeners.has(type)) this.#listeners.set(type, new Set()); this.#listeners.get(type).add(fn); }
  #emit(type, p) { this.#listeners.get(type)?.forEach((fn) => fn(p)); }

  get inRoom() { return !!this.net; }
  get shoveCooldown() { return this.#shoveCd / FIGHT.shoveCooldown; } // 1 → 0

  setName(n) { this.name = (n || '').trim().slice(0, 14) || this.name; try { localStorage.setItem(NAME_KEY, this.name); } catch { /* */ } this.#hello(); }

  get me() {
    return { id: this.net?.selfId, name: this.name, skin: this.profile.data.skin, color: this.color, me: true };
  }

  async create() { this.isHost = true; return this.#join(roomCode()); }
  async join(code) { this.isHost = false; return this.#join(code.toUpperCase().replace(/[^A-Z0-9]/g, '')); }

  async #join(code) {
    this.leave();
    this.code = code;
    this.#emit('status', 'Connexion au salon…');
    this.net = await connect(`dino-${code}`, {
      onPeerJoin: (id) => { this.#hello(id); this.#emit('status', 'Un joueur a rejoint !'); },
      onPeerLeave: (id) => { this.peers.delete(id); this.#emit('lobby'); },
    });
    const n = this.net;
    this.color = COLORS[[...n.selfId].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
    this.ch = { hi: n.channel('hi'), st: n.channel('st'), go: n.channel('go'), wd: n.channel('wd'), sh: n.channel('sh'), dn: n.channel('dn') };
    this.ch.hi.on((d, id) => {
      const p = this.#peer(id);
      Object.assign(p, { name: d.name, skin: d.skin, color: d.color, host: d.host });
      this.#emit('lobby');
    });
    this.ch.st.on((d, id) => {
      const p = this.#peer(id);
      p.samples.push({ ...d, t: performance.now() });
      if (p.samples.length > 30) p.samples.shift();
      if (d.st === 'playing') p.alive = true;
    });
    this.ch.wd.on((d) => { this.pendingWorld = d; });
    this.ch.go.on((d) => this.#onGo(d));
    this.ch.sh.on((d, id) => {
      if (this.game.state !== 'playing') return;
      this.game.runner.knock(d.dir * FIGHT.shovePower, { stumble: FIGHT.shoveStumble, source: 'shove' });
      this.game.emit('mp:shoved', { from: this.peers.get(id)?.name });
      this.#emit('shoved', { from: this.peers.get(id)?.name });
    });
    this.ch.dn.on((d, id) => { const p = this.#peer(id); p.alive = false; p.final = d; this.#emit('lobby'); this.#emit('results'); });
    this.#emit('status', this.isHost ? 'Partage le code : tes amis le tapent dans « Rejoindre ».' : 'Connecté ! En attente du lancement par l\'hôte…');
    this.#emit('lobby');
    return code;
  }

  #peer(id) {
    if (!this.peers.has(id)) this.peers.set(id, { id, name: '…', skin: 'classic', color: '#888', samples: [], view: null, alive: false, final: null });
    return this.peers.get(id);
  }

  #hello(to) { this.ch?.hi.send({ name: this.name, skin: this.profile.data.skin, color: this.color, host: this.isHost }, to); }

  leave() {
    this.net?.leave();
    this.net = null; this.code = null; this.inRace = false;
    this.peers.clear();
    this.#emit('lobby');
  }

  // Hôte : lance la course pour tout le monde (world = spec d'un site, ou null = mondes classiques)
  startRace(world = null) {
    if (!this.isHost) return;
    const d = { seed: (Math.random() * 2 ** 32) >>> 0, delay: 3500, world: !!world };
    if (world) this.ch.wd.send(world);
    // petit délai pour que le monde (plus lourd) arrive avant le signal de départ
    setTimeout(() => { this.ch.go.send(d); this.#onGo(d, world); }, world ? 400 : 0);
  }

  #onGo(d, localWorld) {
    this.inRace = true;
    for (const p of this.peers.values()) { p.alive = true; p.final = null; p.samples = []; }
    this.#emit('start', { seed: d.seed, delay: d.delay, world: d.world ? (localWorld ?? this.pendingWorld ?? null) : null });
  }

  // À appeler chaque frame, après game.update
  update(dt, intent) {
    if (!this.net) return;
    const g = this.game, r = g.runner;
    this.#shoveCd = Math.max(0, this.#shoveCd - dt);
    for (const [id, cd] of this.#bumpCd) this.#bumpCd.set(id, cd - dt);

    // diffusion de ma position
    if (this.inRace && (g.state === 'playing' || g.state === 'falling')) {
      this.#sendTimer -= dt;
      if (this.#sendTimer <= 0) {
        this.#sendTimer = SEND_EVERY;
        this.ch.st.send({ s: +r.z.toFixed(2), d: +r.x.toFixed(2), y: +r.y.toFixed(2), v: +r.speed.toFixed(1), lat: +(r.latV + r.push + r.knockV).toFixed(1), st: g.state, skin: this.profile.data.skin });
      }
    }

    // position affichée des rivaux (lissée, avec un léger retard)
    const now = performance.now(), at = now - RENDER_DELAY;
    for (const p of this.peers.values()) p.view = viewAt(p.samples, at, now);

    // contacts et coup d'épaule (uniquement quand je cours)
    if (g.state !== 'playing' || !this.inRace) return;
    const me = { s: r.z, d: r.x, y: r.y, lat: r.latV + r.push };
    for (const p of this.peers.values()) {
      const v = p.view;
      if (!v || v.st !== 'playing' || (this.#bumpCd.get(p.id) ?? 0) > 0) continue;
      const imp = bumpImpulse(me, v, this.net.selfId < p.id ? 1 : -1);
      if (imp) { r.knock(imp, { source: 'bump' }); this.#bumpCd.set(p.id, FIGHT.bumpCooldown); g.emit('mp:bump', {}); }
    }
    if (intent.shove && this.#shoveCd <= 0) {
      this.#shoveCd = FIGHT.shoveCooldown;
      const rivals = [...this.peers.values()].filter((p) => p.view?.st === 'playing').map((p) => ({ id: p.id, alive: true, ...p.view }));
      const t = shoveTarget(me, rivals);
      if (t) this.ch.sh.send({ dir: t.dir }, t.id);
      g.emit('mp:shove', { hit: !!t });
      this.#emit('shove', { hit: !!t });
    }
  }

  // Ma partie est finie → je préviens les autres
  finish(result) {
    if (!this.net || !this.inRace) return;
    this.ch.dn.send({ distance: result.distance, score: result.score, reason: result.reason });
    this.myFinal = result;
    this.#emit('results');
  }

  // Classement : les vivants d'abord (distance live), puis les éliminés (distance finale)
  ranking() {
    const g = this.game;
    const rows = [{ ...this.me, alive: g.state === 'playing' || g.state === 'falling', dist: g.distance }];
    for (const p of this.peers.values()) rows.push({ ...p, dist: p.final ? p.final.distance : Math.floor(p.view?.s ?? 0) });
    return rows.sort((a, b) => (b.alive - a.alive) || b.dist - a.dist);
  }
}

// Interpolation entre deux échantillons reçus ; extrapolation courte si rien de neuf
function viewAt(samples, at, now) {
  if (!samples.length) return null;
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i];
    if (a.t <= at && at <= b.t) {
      const k = (at - a.t) / Math.max(1, b.t - a.t);
      return { ...b, s: a.s + (b.s - a.s) * k, d: a.d + (b.d - a.d) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const last = samples[samples.length - 1];
  const dt = Math.min(0.5, (now - last.t) / 1000);
  return { ...last, s: last.s + (last.st === 'playing' ? last.v * dt : 0) };
}

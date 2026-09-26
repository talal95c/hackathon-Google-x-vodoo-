import { connect } from './Net.js';
import { bumpImpulse, shoveTarget, roomCode, FIGHT } from './rules.js';

// Multijoueur "course de combat" (réseau : brokers MQTT publics) : même graine = même route pour tous ; chaque joueur fait
// tourner son propre jeu et diffuse sa position (30 fois/s). Les rivaux sont affichés à leur position
// ACTUELLE PRÉDITE (dernière position reçue + vitesse × (âge du message + latence mesurée)),
// avec correction douce des écarts. Contacts et coups d'épaule : chacun applique ce qu'il SUBIT.
//
// Événements (mp.on) : 'lobby' (joueurs), 'status' (texte), 'start' { seed, delay, lane },
// 'shove' { hit }, 'shoved' { from }, 'bump', 'results'.
const COLORS = ['#ff4f8b', '#1a73e8', '#34a853', '#fbbc04', '#a142f4', '#ff6d00', '#00bcd4'];
const SEND_EVERY = 1 / 30, NAME_KEY = 'dino-escape-name';
const PING_EVERY = 1;   // s : mesure de la latence avec chaque rival
const CORRECT = 10;     // vitesse de correction des écarts de position (1/s) : pas de téléportation

export class Multiplayer {
  code = null;
  net = null;
  isHost = false;
  inRace = false;
  peers = new Map();       // id → { id, name, skin, color, last, view, rtt, alive, final }
  #listeners = new Map();
  #sendTimer = 0;
  #shoveCd = 0;
  #pingTimer = 0;
  #shoveAnim = 0; #shoveDir = 1;
  #bumpCd = new Map();      // contact avec ce rival déjà traité récemment
  #bumpRecv = new Map();    // poussée reçue de ce rival récemment

  // connectFn : injectable (tests avec un faux réseau en mémoire)
  constructor(game, profile, { connectFn = connect } = {}) {
    this.game = game;
    this.profile = profile;
    this.connectFn = connectFn;
    game.on('game:start', () => {
      this.#shoveCd = this.#shoveAnim = 0;
      this.#bumpCd.clear(); this.#bumpRecv.clear();
    });
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
    this.#emit('status', 'Connecting to the lobby…');
    this.net = await this.connectFn(`dino-${code}`, {
      onPeerJoin: (id) => { this.#hello(id); this.#emit('status', 'A player joined!'); },
      onPeerLeave: (id) => { this.peers.delete(id); this.#emit('peer:left', { id }); this.#emit('lobby'); },
    });
    const n = this.net;
    this.color = COLORS[[...n.selfId].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
    this.ch = { hi: n.channel('hi'), st: n.channel('st'), go: n.channel('go'), sh: n.channel('sh'), bp: n.channel('bp'), dn: n.channel('dn'), pg: n.channel('pg'), po: n.channel('po'), fx: n.channel('fx'), fc: n.channel('fc') };
    this.ch.fc.on((data, from) => this.#emit('duel', { data, from }));
    this.ch.hi.on((d, id) => {
      const p = this.#peer(id);
      Object.assign(p, { name: d.name, skin: d.skin, color: d.color, host: d.host });
      this.#emit('lobby');
    });
    this.ch.st.on((d, id) => {
      const p = this.#peer(id);
      p.last = { ...d, t: performance.now() };
      if (d.st === 'playing' || d.st === 'duel') p.alive = true;
    });
    // ping / pong : latence aller-retour avec chaque rival (lissée)
    this.ch.pg.on((d, id) => this.ch.po.send({ t: d.t }, id));
    this.ch.po.on((d, id) => {
      const p = this.#peer(id), rtt = performance.now() - d.t;
      p.rtt = p.rtt ? p.rtt * 0.7 + rtt * 0.3 : rtt;
    });
    this.ch.go.on((d) => this.#onGo(d));
    this.ch.fx.on((d, id) => {
      if (!this.inRace || !this.peers.has(id) || !['s', 'd', 'y', 'dir'].every(k => Number.isFinite(d[k])) || d.kind !== 'shove') return;
      this.game.emit('combat:impact', { ...d, targetId: id, local: d.sourceId === this.net.selfId ? 'dealt' : null });
    });
    this.ch.sh.on((d, id) => {
      if (this.game.state !== 'playing') return;
      this.game.runner.knock(d.dir * FIGHT.shovePower, { stumble: FIGHT.shoveStumble, source: 'shove' });
      this.#impact('shove', d.dir, id);
      this.game.emit('mp:shoved', { from: this.peers.get(id)?.name });
      this.#emit('shoved', { from: this.peers.get(id)?.name });
    });
    // Contact détecté par l'autre (sur son écran) : il m'envoie la poussée que je subis
    // Un rival m'a percuté (il fonçait vers moi sur son écran) : je subis sa poussée
    this.ch.bp.on((d, id) => {
      if (this.game.state !== 'playing' || (this.#bumpRecv.get(id) ?? 0) > 0) return;
      this.#bumpRecv.set(id, FIGHT.bumpCooldown);
      this.game.runner.knock(d.imp, { source: 'bump' });
      this.#impact('bump', Math.sign(d.imp), id);
      this.game.emit('mp:bump', {});
    });
    this.ch.dn.on((d, id) => { const p = this.#peer(id); p.alive = false; p.final = d; this.game.emit('mp:out', { name: p.name }); this.#emit('lobby'); this.#emit('results'); });
    this.#hello(); // je me présente à tout le monde une fois mes canaux prêts
    this.#emit('status', `Connected · ${this.net.transport}`);
    this.#emit('lobby');
    return code;
  }

  #peer(id) {
    if (!this.peers.has(id)) this.peers.set(id, { id, name: '…', skin: 'classic', color: '#888', last: null, view: null, rtt: 0, alive: false, final: null });
    return this.peers.get(id);
  }

  #hello(to) { this.ch?.hi.send({ name: this.name, skin: this.profile.data.skin, color: this.color, host: this.isHost }, to); }

  #impact(kind, dir, sourceId) {
    const r = this.game.runner;
    const effect = { kind, s: r.z, d: r.x, y: r.y, dir: Math.sign(dir) || 1, sourceId };
    this.game.emit('combat:impact', { ...effect, targetId: this.net.selfId, local: 'received' });
    if (kind === 'shove') this.ch.fx.send(effect);
  }

  sendDuel(data, to) { this.ch?.fc.send(data, to); }

  leave() {
    if (this.net) this.#emit('left');
    this.net?.leave();
    this.net = null; this.code = null; this.inRace = false;
    this.peers.clear();
    this.#emit('lobby');
  }

  // Hôte : lance la course pour tout le monde
  startRace() {
    if (!this.isHost) return;
    const d = { seed: (Math.random() * 2 ** 32) >>> 0, delay: 3500 };
    this.ch.go.send(d);
    this.#onGo(d);
  }

  #onGo(d) {
    this.inRace = true;
    for (const p of this.peers.values()) { p.alive = true; p.final = null; p.last = null; p.view = null; }
    // lignes de départ côte à côte, dans le même ordre chez tout le monde (tri des ids)
    const ids = [this.net.selfId, ...this.peers.keys()].sort();
    const lane = (ids.indexOf(this.net.selfId) - (ids.length - 1) / 2) * 2.6;
    this.#emit('start', { seed: d.seed, delay: d.delay, lane });
  }

  // À appeler chaque frame, après game.update
  update(dt, intent) {
    if (!this.net) return;
    const g = this.game, r = g.runner;
    this.#shoveCd = Math.max(0, this.#shoveCd - dt);
    this.#shoveAnim = Math.max(0, this.#shoveAnim - dt);
    for (const [id, cd] of this.#bumpCd) this.#bumpCd.set(id, cd - dt);
    for (const [id, cd] of this.#bumpRecv) this.#bumpRecv.set(id, cd - dt);

    // diffusion de ma position
    if (this.inRace && (g.state === 'playing' || g.state === 'falling' || g.state === 'duel')) {
      this.#sendTimer -= dt;
      if (this.#sendTimer <= 0) {
        this.#sendTimer = SEND_EVERY;
        this.ch.st.send({
          s: +r.z.toFixed(2), d: +r.x.toFixed(2), y: +r.y.toFixed(2), v: +r.speed.toFixed(1), lat: +(r.latV + r.push + r.knockV).toFixed(1),
          st: g.state, j: !!g.worldJump, c: g.coins, skin: this.profile.data.skin, l: g.lives,
          sh: this.#shoveAnim > 0 ? 1 : 0, shd: this.#shoveDir, hit: r.stumble > 0 ? 1 : 0, // animations de combat
        });
      }
    }

    // latence : un ping par seconde
    const now = performance.now();
    this.#pingTimer = (this.#pingTimer ?? 0) - dt;
    if (this.#pingTimer <= 0) { this.#pingTimer = PING_EVERY; this.ch.pg.send({ t: now }); }

    // position affichée des rivaux = position actuelle prédite, corrigée en douceur
    for (const p of this.peers.values()) p.view = predict(p, now, dt);

    // contacts et coup d'épaule (uniquement quand je cours)
    if (g.state !== 'playing' || !this.inRace) return;
    const me = { s: r.z, d: r.x, y: r.y, lat: r.latV + r.push };
    const predicted = (v) => v; // la vue est déjà la position actuelle prédite
    for (const p of this.peers.values()) {
      const v = p.view;
      if (!v || v.st !== 'playing' || (this.#bumpCd.get(p.id) ?? 0) > 0) continue;
      const other = predicted(v), tie = this.net.selfId < p.id ? 1 : -1;
      if (!bumpImpulse(me, other, tie)) continue; // pas de contact
      this.#bumpCd.set(p.id, FIGHT.bumpCooldown);
      // Celui qui fonce décide (sa vitesse est à jour chez lui) : il envoie la poussée au percuté
      // et ne subit qu'un léger recul. Sans fonceur net : chacun s'écarte un peu de son côté.
      const toOther = Math.sign(other.d - me.d) || -tie;
      const toward = me.lat * toOther;                 // ma vitesse latérale vers lui
      r.knock(-toOther * FIGHT.bumpBase * (toward > 3 ? 0.6 : 1), { source: 'bump' });
      if (toward > 3) this.ch.bp.send({ imp: toOther * (FIGHT.bumpBase + toward * FIGHT.bumpRam) }, p.id);
      this.#impact('bump', -toOther, p.id);
      g.emit('mp:bump', {});
    }
    if (intent.shove && this.#shoveCd <= 0) {
      this.#shoveCd = FIGHT.shoveCooldown;
      const rivals = [...this.peers.values()].filter((p) => p.view?.st === 'playing').map((p) => ({ id: p.id, alive: true, ...predicted(p.view) }));
      const t = shoveTarget(me, rivals);
      if (t) this.ch.sh.send({ dir: t.dir }, t.id);
      this.#shoveAnim = 0.35; this.#shoveDir = t ? t.dir : (Math.sign(r.latV) || 1);
      g.emit('mp:shove', { hit: !!t, dir: this.#shoveDir });
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

  // Rivaux à afficher (interface commune avec les PNJ : RivalView)
  rivals() { return this.inRace ? [...this.peers.values()] : []; }

  // Classement : les vivants d'abord (distance live), puis les éliminés (distance finale)
  ranking() {
    const g = this.game;
    const rows = [{ ...this.me, alive: g.state === 'playing' || g.state === 'falling' || g.state === 'duel', dist: g.distance, lives: g.lives }];
    for (const p of this.peers.values()) rows.push({ ...p, dist: p.final ? p.final.distance : Math.floor(p.view?.s ?? 0), lives: p.final ? 0 : p.last?.l });
    return rows.sort((a, b) => (b.alive - a.alive) || b.dist - a.dist);
  }
}

// Prédiction ("dead reckoning") : où est le rival MAINTENANT ?
//   cible = dernière position reçue + vitesse × (âge du message + demi-latence mesurée)
// La vue avance à la vitesse du rival à chaque frame et rattrape la cible en douceur (pas de saut),
// sauf gros écart (> 12 m, ex. après une chute) où elle se recale directement.
function predict(p, now, dt) {
  const L = p.last;
  if (!L) return null;
  const ahead = Math.min(0.35, (now - L.t) / 1000 + (p.rtt || 60) / 2000);
  const running = L.st === 'playing';
  const target = { ...L, s: L.s + (running ? L.v * ahead : 0), d: L.d + (running ? (L.lat || 0) * ahead * 0.6 : 0) };
  const v = p.view;
  if (!v || Math.abs(target.s - v.s) > 12 || v.st !== L.st) return target;
  const k = Math.min(1, dt * CORRECT);
  const s = v.s + (running ? L.v * dt : 0), d = v.d;
  return { ...target, s: s + (target.s - s) * k, d: d + (target.d - d) * k, y: v.y + (target.y - v.y) * Math.min(1, dt * 20) };
}

import { CLUB, TapDuel } from './TapDuel.js';

// Le salon arbitre un seul duel à la fois. Les deux participants ont chacun 3 s locales,
// transmettent des compteurs cumulatifs, puis l'hôte annonce un résultat unique.
export class FightClub {
  active = false; phase = 'idle'; nextAt = CLUB.firstAt; round = 0; session = null; result = null;
  constructor(game, { mp, bots, profile, now = () => performance.now() }) {
    Object.assign(this, { game, mp, bots, profile, now });
    this.closed = new Set(); this.applied = new Set();
    game.on('game:start', () => {
      this.cancel('New race', false); this.nextAt = CLUB.firstAt; this.round = 0;
      this.closed.clear(); this.applied.clear(); this.announcedAt = null;
    });
    mp.on('duel', ({ data, from }) => this.receive(data, from));
    mp.on('peer:left', ({ id }) => {
      if (this.active && !this.result && (id === this.hostId || this.fighters.some(f => f.id === id))) this.cancel('Opponent disconnected — back to the race');
    });
    mp.on('left', () => { if (this.active && this.online) this.cancel('Left the lobby', false); });
  }
  get fighters() { return this.session?.fighters ?? this.roster ?? []; }
  get counts() { return this.session?.counts ?? [0, 0]; }
  get localIndex() { return this.fighters.findIndex(f => f.id === this.meId); }
  get isHost() { return !this.online || this.mp.net?.selfId === this.hostId; }
  get remaining() { return this.session ? this.session.remaining(this.now()) / 1000 : 3; }
  get approachDistance() {
    if (this.active || this.game.state !== 'playing' || this.game.worldJump || (!this.mp.inRace && !this.bots.active)) return null;
    // En multijoueur, l'hôte déclenche le ring : les autres voient son approche.
    const host = this.mp.inRace && !this.mp.isHost ? [...this.mp.peers.values()].find(p => p.host) : null;
    const distance = Math.max(0, this.nextAt - (host?.last?.s ?? this.game.distance));
    return distance <= CLUB.approachAt ? distance : null;
  }
  get progress() { return this.session ? 1 - this.remaining / 3 : 0; }
  emit(type, data = {}) { this.game.emit(`club:${type}`, data); }
  send(type, data = {}, to) { if (this.online) this.mp.sendDuel({ type, id: this.id, ...data }, to); }

  update() {
    const now = this.now(), g = this.game;
    if (!this.active) {
      if (this.approachDistance !== null && this.announcedAt !== this.nextAt) {
        this.announcedAt = this.nextAt; this.emit('approach');
      }
      if (g.state !== 'playing' || g.worldJump || !g.runner.grounded || g.runner.stumble > 0 || g.distance < this.nextAt) return;
      if (this.mp.inRace) { if (this.mp.isHost) this.startMultiplayer(); }
      else if (this.bots.active) this.startSolo();
      return;
    }
    if (now - this.openedAt > CLUB.timeoutMs && !this.result) { this.cancel('Connection lost — duel cancelled'); return; }
    if (this.online && now >= (this.nextSend ?? 0)) {
      this.nextSend = now + 250;
      if (this.isHost && this.phase === 'matching') this.send('offer', { fighters: this.roster, checkpoint: this.checkpoint });
      if (this.isHost && this.session && !this.result) this.send('start', { fighters: this.fighters });
      if (this.result && this.isHost) this.send('result', { result: this.result });
      if (this.session && !this.result && this.localIndex >= 0) this.send('score', { count: this.counts[this.localIndex], done: this.session.phase(now) === 'judging' }, this.hostId);
    }
    if (this.session && !this.result) {
      const phase = this.session.phase(now);
      if (phase !== this.phase) { this.phase = phase; this.emit('phase', { phase }); }
      if (phase === 'intro') {
        const tick = Math.ceil((CLUB.introMs - (now - this.session.startedAt)) / 600);
        if (tick !== this.lastTick) { this.lastTick = tick; this.emit('countdown', { tick }); }
      }
      if (!this.online && phase !== 'intro') {
        while (now >= this.botNext && this.botNext < this.session.startedAt + CLUB.introMs + CLUB.tapMs) {
          this.tapAt(1, this.botNext); this.botNext += this.botInterval;
        }
      }
      if (phase === 'judging') {
        if (this.localIndex >= 0) this.session.finished[this.localIndex] = true;
        if (!this.online) this.session.finished[1] = true;
        if (this.isHost && this.session.finished.every(Boolean)) this.settle(this.session.resolve());
        else if (this.isHost && now - this.session.startedAt > CLUB.introMs + CLUB.tapMs + CLUB.networkGraceMs) this.cancel('Score missing — no loot lost');
      }
    }
    if (this.result && now - this.resultAt >= CLUB.resultMs) this.close();
  }

  startSolo() {
    if (this.active || this.game.state !== 'playing' || this.mp.inRace) return false;
    const b = this.bots.list.filter(b => b.alive).sort((a, b) => Math.abs(a.s - this.game.runner.z) - Math.abs(b.s - this.game.runner.z))[0];
    if (!b) { this.nextAt += CLUB.every; return false; }
    const roster = [{ id: 'me', name: 'YOU', skin: this.profile.data.skin, coins: this.game.coins }, { id: b.id, name: b.name, skin: b.skin, coins: b.coins ?? 12 }];
    this.online = false; this.meId = 'me'; this.hostId = 'me';
    if (!this.open(`solo-${this.game.seed}-${++this.round}`, roster, this.nextAt)) return false;
    this.begin(roster);
    this.botInterval = Math.max(130, 215 - this.round * 8 + (this.game.seed % 5) * 4);
    this.botNext = this.session.startedAt + CLUB.introMs + this.botInterval;
    return true;
  }

  startMultiplayer() {
    if (this.active || !this.mp.isHost || !this.mp.inRace || this.game.state !== 'playing') return false;
    const peers = [...this.mp.peers.values()].filter(p => p.last?.st === 'playing' && !p.last.j && p.alive);
    peers.sort((a, b) => Math.abs(a.last.s - this.game.runner.z) - Math.abs(b.last.s - this.game.runner.z));
    if (!peers.length) return false;
    const rival = peers[0]; this.online = true; this.meId = this.mp.net.selfId; this.hostId = this.meId;
    const roster = [{ id: this.meId, name: this.mp.name, skin: this.profile.data.skin }, { id: rival.id, name: rival.name, skin: rival.skin }];
    const id = `${this.meId}-${this.game.seed}-${++this.round}`;
    if (!this.open(id, roster, this.nextAt)) return false;
    this.ready = new Map([[this.meId, this.game.coins]]);
    this.send('offer', { fighters: roster, checkpoint: this.checkpoint });
    return true;
  }

  open(id, roster, checkpoint) {
    if (this.closed.has(id) || !this.game.pauseForDuel()) return false;
    this.id = id; this.roster = roster.map(f => ({ ...f })); this.checkpoint = checkpoint;
    this.active = true; this.phase = 'matching'; this.session = null; this.result = null; this.lastTick = 0;
    this.openedAt = this.now(); this.nextSend = this.openedAt + 250;
    this.emit('open'); return true;
  }

  begin(roster) {
    if (!this.active || this.session) return;
    this.session = new TapDuel(roster, this.now()); this.phase = 'intro'; this.emit('phase', { phase: 'intro' });
  }

  tap() { return this.active && this.session && this.localIndex >= 0 ? this.tapAt(this.localIndex, this.now()) : false; }
  tapAt(index, now) {
    if (!this.session.tap(index, now)) return false;
    this.emit('hit', { index, count: this.counts[index] });
    if (this.online) {
      if (this.isHost) this.send('scores', { counts: this.counts });
      else this.send('score', { count: this.counts[index], done: false }, this.hostId);
    }
    return true;
  }

  receive(d, from) {
    if (!d || typeof d.id !== 'string' || !this.mp.inRace) return;
    const host = this.mp.isHost ? this.mp.net?.selfId : [...this.mp.peers.values()].find(p => p.host)?.id;
    if (d.type === 'offer') {
      if (from !== host || this.closed.has(d.id) || !Array.isArray(d.fighters) || d.fighters.length !== 2 || !d.fighters.every(f => f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.skin === 'string') || d.fighters[0]?.id === d.fighters[1]?.id || !Number.isFinite(d.checkpoint)) return;
      if (this.active && d.id !== this.id) return;
      this.online = true; this.meId = this.mp.net?.selfId; this.hostId = host;
      if (!this.active && !this.open(d.id, d.fighters, d.checkpoint)) {
        this.mp.sendDuel({ id: d.id, type: 'reject' }, host); return;
      }
      if (this.localIndex >= 0) this.send('ready', { coins: this.game.coins }, host);
      return;
    }
    if (!this.active || this.id !== d.id) return;
    const index = this.fighters.findIndex(f => f.id === from);
    if (d.type === 'reject' && this.isHost && index >= 0 && !this.result) { this.cancel('Rival unavailable — duel postponed'); return; }
    if (d.type === 'ready' && this.isHost && index >= 0 && !this.session && Number.isInteger(d.coins) && d.coins >= 0) {
      this.ready.set(from, d.coins);
      if (this.roster.every(f => this.ready.has(f.id))) {
        const fighters = this.roster.map(f => ({ ...f, coins: this.ready.get(f.id) }));
        this.begin(fighters); this.send('start', { fighters });
      }
    } else if (d.type === 'start' && from === host && Array.isArray(d.fighters) && d.fighters.length === 2 && d.fighters.every((f, i) => f.id === this.roster[i].id && Number.isInteger(f.coins) && f.coins >= 0)) {
      this.begin(d.fighters);
    } else if (d.type === 'score' && this.isHost && index >= 0 && this.session && !this.result) {
      // Les comptes d'un participant arrivent monotones ; un paquet ancien ne rembobine jamais le score.
      const old = this.counts[index];
      const elapsed = this.now() - this.session.startedAt - CLUB.introMs;
      if (d.done && elapsed < CLUB.tapMs - 350) return;
      if (d.count > Math.max(0, Math.ceil((elapsed + 350) / CLUB.minTapMs))) return;
      if (!this.session.merge(index, d.count, d.done === true)) return;
      if (index !== this.localIndex && d.count > old) this.emit('hit', { index, count: d.count });
      this.send('scores', { counts: this.counts });
    } else if (d.type === 'scores' && from === host && this.session && !this.result && Array.isArray(d.counts)) {
      for (let i = 0; i < 2; i++) {
        if (i === this.localIndex) continue;
        const old = this.counts[i];
        if (this.session.merge(i, d.counts[i]) && d.counts[i] > old) this.emit('hit', { index: i, count: d.counts[i] });
      }
    } else if (d.type === 'result' && from === host && this.session && !this.result) {
      const result = d.result;
      if (!result || !Array.isArray(result.counts) || result.counts.length !== 2) return;
      const check = new TapDuel(this.fighters, 0);
      if (!check.merge(0, result.counts[0]) || !check.merge(1, result.counts[1])) return;
      const expected = check.resolve();
      if (expected.winner !== result.winner || expected.transfer !== result.transfer || expected.loser !== result.loser) return;
      this.settle(expected);
    } else if (d.type === 'cancel' && from === host && !this.result) this.cancel(d.reason || 'Duel cancelled', false);
  }

  settle(result) {
    if (this.result || this.applied.has(this.id)) return;
    this.applied.add(this.id); this.result = result; this.phase = 'result'; this.resultAt = this.now();
    this.session.counts = [...result.counts];
    const me = this.localIndex;
    if (result.winner !== null) {
      if (me === result.winner) this.game.coins += result.transfer;
      if (me === result.loser) {
        this.game.coins = Math.max(0, this.game.coins - result.transfer);
        this.game.runner.addEffect('fightSlow'); this.game.runner.addEffect('fightStun'); this.game.runner.speed = 0;
      }
      if (!this.online) {
        const b = this.bots.list.find(b => b.id === this.fighters[1].id);
        if (b) {
          b.coins = Math.max(0, (b.coins ?? 12) + (result.winner === 1 ? result.transfer : -result.transfer));
          if (result.loser === 1) { b.clubSlow = CLUB.slowSeconds; b.clubStun = CLUB.stunSeconds; b.speed = 0; }
        }
      }
    }
    this.emit('result', result);
    if (this.online && this.isHost) this.send('result', { result });
  }

  cancel(reason, notify = true) {
    if (!this.active) return;
    if (notify && this.isHost) this.send('cancel', { reason });
    this.emit('cancel', { reason }); this.close();
  }
  close() {
    if (!this.active) return;
    this.closed.add(this.id);
    this.nextAt = Math.max(this.checkpoint + CLUB.every, this.game.distance + 100);
    const finishedDuel = this.game.state === 'duel' && this.result?.loser !== null && !!this.result;
    this.active = false; this.phase = 'idle'; this.game.resumeFromDuel();
    // La vie est retirée à la sortie : le coup final reste visible, même avec une seule vie.
    // Un redémarrage a déjà remplacé l'état de la course et ne doit pas recevoir l'ancienne pénalité.
    if (finishedDuel && this.result.loser === this.localIndex) this.game.loseLife('fight');
    if (finishedDuel && !this.online && this.result.loser === 1) {
      const bot = this.bots.list.find(b => b.id === this.fighters[1].id);
      if (bot) {
        bot.lives = Math.max(0, (bot.lives ?? 3) - 1);
        if (!bot.lives) { bot.alive = false; bot.fall = 0; this.game.emit('bot:out', { bot: bot.name, reason: 'fight' }); }
      }
    }
    this.emit('close');
  }
}

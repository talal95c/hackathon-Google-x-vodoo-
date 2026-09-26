import { NetClient } from '../net/NetClient.js';
import { defaultServerUrl } from '../net/protocol.js';
import { rankOf, coinReward } from '../race/rules.js';

// Panneau « Course Royale » : entraînement contre des bots, salons entre amis (code),
// partie rapide et classée. Écran de résultats (podium + récompenses).
const $ = (id) => document.getElementById(id);
const hex = (n) => `#${(n ?? 0x888888).toString(16).padStart(6, '0')}`;
const ord = (n) => (n === 1 ? '1er' : `${n}e`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Lobby {
  net = null;
  lobby = null;
  account = null;
  rewards = null;

  constructor({ game, race, profile, menus, onEnter, storage = globalThis.localStorage }) {
    Object.assign(this, { game, race, profile, menus, onEnter, storage });
    menus.panels.race = $('racePanel');
    menus.screens.raceOver = $('raceOver');
    $('rName').value = storage?.getItem('dino-escape-name') || '';
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      const a = b?.dataset.action;
      if (!a?.startsWith('race')) return;
      const fn = {
        race: () => this.open(),
        'race-bots': () => this.#training(),
        'race-create': () => this.#online({ t: 'create' }),
        'race-join': () => this.#online({ t: 'join', code: $('rCode').value.trim().toUpperCase() }),
        'race-quick': () => this.#online({ t: 'quick' }),
        'race-ranked': () => this.#online({ t: 'quick', ranked: true }),
        'race-addbot': () => this.net?.send({ t: 'addBot' }),
        'race-start': () => this.net?.send({ t: 'start' }),
        'race-leave': () => this.leave(),
        'race-copy': () => navigator.clipboard?.writeText(this.#invite()),
        'race-again': () => (this.race.kind === 'training' ? this.#training() : this.open()),
        'race-menu': () => { this.leave(); this.menus.show('start'); },
      }[a];
      fn?.();
    });
    game.on('race:end', (m) => setTimeout(() => this.#results(m), 1200));
    const code = new URLSearchParams(location.search).get('room');
    if (code) { $('rCode').value = code.toUpperCase(); setTimeout(() => { this.open(); this.#online({ t: 'join', code: $('rCode').value }); }, 0); }
  }

  get name() { return ($('rName').value.trim() || 'Dino').slice(0, 16); }
  get token() {
    let t = this.storage?.getItem('dino-escape-token');
    if (!t) { t = crypto.randomUUID(); this.storage?.setItem('dino-escape-token', t); }
    return t;
  }

  open() { this.menus.show('start'); this.menus.open('race'); this.#render(); }

  status(txt) { $('rStatus').textContent = txt; }

  #training() {
    this.leave();
    this.storage?.setItem('dino-escape-name', this.name);
    this.race.training({ name: this.name, skin: this.profile.data.skin, bots: 4 });
    this.onEnter();
  }

  async #online(first) {
    if (first.t === 'join' && !/^[A-Z2-9]{4}$/.test(first.code)) return this.status('Code à 4 caractères');
    this.storage?.setItem('dino-escape-name', this.name);
    if (!this.net || this.net.status !== 'online') {
      this.status('Connexion au serveur…');
      this.net?.close();
      this.net = new NetClient(defaultServerUrl());
      this.net.onMessage((m) => this.#onNet(m));
      try {
        const w = await this.net.connect({ name: this.name, skin: this.profile.data.skin, token: this.token });
        this.account = w.profile;
      } catch {
        this.net = null;
        return this.status('Serveur injoignable. Lance « npm run server » ou joue contre les bots.');
      }
    }
    this.race.attach(this.net, { name: this.name, skin: this.profile.data.skin });
    this.net.send(first);
    this.status(first.t === 'quick' ? 'Recherche de joueurs…' : '');
  }

  #onNet(m) {
    this.race.handle(m);
    switch (m.t) {
      case 'lobby': this.lobby = m; return this.#render();
      case 'error': return this.status(m.msg);
      case 'rewards': this.rewards = m; this.account = m.profile; return this.#renderRewards();
      case 'race:start': this.lobby = null; return this.onEnter();
      case 'disconnected':
        this.net = null; this.lobby = null;
        if (this.race.online) { this.race.leave(); this.menus.show('start'); }
        return this.status('Déconnecté du serveur');
    }
  }

  leave() {
    this.net?.send({ t: 'leave' });
    this.lobby = null; this.rewards = null;
    this.race.leave();
    this.#render();
  }

  #invite() { return `${location.origin}${location.pathname}?room=${this.lobby?.code ?? ''}`; }

  #render() {
    const acc = this.account, rank = rankOf(acc?.elo ?? 1000);
    $('rProfile').innerHTML = acc ? `🏆 ${acc.trophies} · ${rank.name} (${acc.elo}) · ${acc.wins}/${acc.played} victoires` : 'Hors ligne : connecte-toi pour gagner des trophées';
    const L = this.lobby;
    $('rMenu').classList.toggle('hidden', !!L);
    $('rLobby').classList.toggle('hidden', !L);
    if (!L) return;
    const host = L.host === this.net?.id;
    $('rLobbyCode').textContent = L.mode === 'friends' ? L.code : L.mode === 'ranked' ? 'CLASSÉE' : 'PARTIE RAPIDE';
    $('rLobbyInfo').textContent = L.mode === 'friends' ? 'Partage le code ou le lien' : L.startsIn != null ? `Départ dans ${Math.ceil(L.startsIn / 1000)} s (complété par des bots)` : 'En attente…';
    $('rPlayers').innerHTML = L.players.map((p) => `<div><i style="background:${hex(p.color)}"></i>${esc(p.name)}${p.bot ? ' 🤖' : ''}${p.id === L.host ? ' 👑' : ''}${p.trophies != null ? ` <small>🏆 ${p.trophies}</small>` : ''}</div>`).join('');
    for (const id of ['rAddBot', 'rStart']) $(id).classList.toggle('hidden', !host || L.mode !== 'friends');
    $('rCopy').classList.toggle('hidden', L.mode !== 'friends');
  }

  #results({ results }) {
    const me = this.race.p?.id;
    const mine = results.find((r) => r.id === me);
    $('roTitle').textContent = mine?.place === 1 ? '🏆 VICTOIRE ROYALE !' : `${ord(mine?.place ?? results.length)} sur ${results.length}`;
    $('roPodium').innerHTML = results.map((r) => `<div class="${r.id === me ? 'me' : ''} p${r.place}"><b>${ord(r.place)}</b><i style="background:${hex(this.race.colorOf(r.id))}"></i><span>${esc(this.race.nameOf(r.id))}</span><small>${Math.round(r.distance)} m · combo ×${r.bestCombo ?? 0} · 💥${r.stats?.ringOuts ?? 0}</small></div>`).join('');
    if (this.race.kind === 'training' && mine) {
      const coins = Math.round(coinReward(mine.place, results.length) / 2);
      this.profile.earn(coins);
      $('roRewards').textContent = `+${coins} ★ (entraînement : pas de trophées)`;
    } else $('roRewards').textContent = this.rewards ? '' : 'Calcul des récompenses…';
    this.#renderRewards();
    this.menus.show('raceOver');
  }

  #renderRewards() {
    const r = this.rewards;
    if (!r) return;
    if (!r.credited) { this.profile.earn(r.coins); r.credited = true; }
    const rank = rankOf(r.profile.elo);
    $('roRewards').innerHTML = `+${r.coins} ★${r.trophies ? ` · ${r.trophies > 0 ? '+' : ''}${r.trophies} 🏆` : ''}${r.mode === 'ranked' ? ` · Elo ${r.elo >= 0 ? '+' : ''}${r.elo} → ${r.profile.elo} (${rank.name})` : ''}`;
    this.#render();
  }
}

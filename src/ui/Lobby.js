import { RaceCountdown } from './RaceCountdown.js';

// Salon multijoueur : créer une partie (code + lien), rejoindre, liste des joueurs, lancement,
// compte à rebours, classement live pendant la course et coup d'épaule.
import { Skins } from '../kernel/Registry.js';
import { skinPortraits } from './SkinPortraits.js';

const $ = (id) => document.getElementById(id);
const MAX_PLAYERS = 7; // autant que de couleurs côté réseau
const CODE_RE = /[A-Z0-9]{5}/;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Lobby {
  constructor({ mp, bots, menus, hud, onLaunch, onInteract = () => {} }) {
    Object.assign(this, { mp, bots, menus, hud, onLaunch });
    this.startCountdown = new RaceCountdown({ onStep: step => this.renderCountdown(step) });
    mp.on('left', () => this.startCountdown.cancel());
    this.el = $('mpPanel');
    menus.panels.mp = this.el;
    $('mpName').value = mp.name;
    $('mpName').addEventListener('change', (e) => { mp.setName(e.target.value); e.target.value = mp.name; this.render(); });

    document.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-mp]');
      if (!b) return;
      const a = b.dataset.mp;
      onInteract();
      if (a === 'open') this.open();
      else if (a === 'create') await this.#connect(() => mp.create());
      else if (a === 'join') { const code = this.#readCode(); if (code) await this.#connect(() => mp.join(code)); else this.status('Type the 5-letter code your friend sent you.'); }
      else if (a === 'copy') this.#copy(this.link(), 'Invite link copied! Send it to your friends.');
      else if (a === 'copycode') this.#copy(mp.code, `Code ${mp.code} copied!`);
      else if (a === 'launch') { this.menus.closePanels(); this.onLaunch(); }
      else if (a === 'leave') { mp.leave(); this.#setUrl(); this.status(''); this.render(); }
    });
    const codeInput = $('mpCode');
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.el.querySelector('[data-mp=join]').click(); });
    // Un lien d'invitation collé dans le champ → on garde juste le code
    codeInput.addEventListener('input', () => {
      const v = codeInput.value;
      const fromLink = v.includes('partie=') ? v.split('partie=')[1] : v;
      codeInput.value = fromLink.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    });
    mp.on('lobby', () => { this.render(); this.board(); });
    mp.on('status', (t) => this.status(t));
    mp.on('results', () => this.board());

    // Lien partagé : ?partie=CODE → rejoint directement
    const code = new URLSearchParams(location.search).get('partie');
    if (code) { this.open(); this.#connect(() => mp.join(code)); }
  }

  link() { const u = new URL(location.href); u.search = this.mp.code ? `?partie=${this.mp.code}` : ''; return u.toString(); }
  #setUrl() { try { history.replaceState(null, '', this.link()); } catch { /* iframe itch.io */ } }
  open() { this.menus.open('mp'); this.render(); }
  status(t) { $('mpStatus').textContent = t; }

  #readCode() { return ($('mpCode').value.toUpperCase().match(CODE_RE) || [])[0] || ''; }

  // Création / connexion : boutons désactivés le temps que le réseau réponde
  async #connect(fn) {
    this.el.classList.add('busy');
    try { await fn(); this.#setUrl(); }
    catch (err) { this.status(`Could not connect (${err?.message || err}). Try again.`); this.mp.leave(); }
    finally { this.el.classList.remove('busy'); this.render(); }
  }

  async #copy(text, ok) {
    try { await navigator.clipboard.writeText(text); this.status(ok); }
    catch { this.status(text); } // pas de presse-papiers (iframe itch.io) : on affiche le texte à copier à la main
  }

  #portrait(skin) {
    const src = skinPortraits().get(skin);
    return src ? `<img src="${src}" alt=""/>` : '<span class="mp-avatar-fallback">🦖</span>';
  }

  render() {
    const mp = this.mp, inRoom = mp.inRoom;
    $('mpJoin').classList.toggle('hidden', inRoom);
    $('mpRoom').classList.toggle('hidden', !inRoom);
    if (this.el.classList.contains('hidden')) return; // portraits générés seulement quand le panneau est visible
    if (!inRoom) {
      const skin = mp.profile.data.skin;
      $('mpMyPortrait').src = skinPortraits().get(skin) || '';
      $('mpMySkin').textContent = Skins.has(skin) ? Skins.get(skin).name : skin;
      return;
    }
    $('mpCodeShow').textContent = mp.code;
    const rows = [mp.me, ...mp.peers.values()];
    const card = (p) => {
      const host = p.me ? mp.isHost : p.host;
      const skinName = Skins.has(p.skin) ? Skins.get(p.skin).name : '';
      return `<li class="mp-player ${p.me ? 'me' : ''}" style="--c:${p.color}">
        <div class="mp-avatar">${this.#portrait(p.skin)}</div>
        <div class="mp-player-info"><b>${esc(p.name)}</b><span class="small">${esc(skinName)}${p.rtt ? ` · ${Math.round(p.rtt)} ms` : ''}</span></div>
        <div class="mp-badges">${host ? '<span class="mp-badge host">👑 Host</span>' : ''}${p.me ? '<span class="mp-badge">You</span>' : ''}</div>
      </li>`;
    };
    const empty = rows.length < MAX_PLAYERS ? `<li class="mp-player empty"><div class="mp-avatar"><span class="mp-avatar-fallback">?</span></div><div class="mp-player-info"><b>Waiting for a rival…</b><span class="small">Share the code</span></div></li>` : '';
    $('mpPlayers').innerHTML = rows.map(card).join('') + empty;
    $('mpCount').textContent = `${rows.length} player${rows.length > 1 ? 's' : ''}`;
    $('mpHint').textContent = mp.isHost
      ? (mp.peers.size ? 'Everyone is here? Hit start.' : 'Send the invite link, then start when your friends show up.')
      : 'The host starts the race for everyone.';
    $('mpLaunch').classList.toggle('hidden', !mp.isHost);
    $('mpWait').classList.toggle('hidden', mp.isHost);
    $('mpLaunch').textContent = mp.peers.size ? `⚔ Start the race · ${rows.length} players` : '⚔ Start alone (to test)';
  }

  // Le départ garde le délai réseau, même si un onglet a pris du retard.
  get countingDown() { return this.startCountdown.running; }
  countdown(delay, go) { this.startCountdown.start(delay, go); }

  renderCountdown(step) {
    const el = $('raceCountdown');
    el.classList.toggle('hidden', step === null);
    document.body.classList.toggle('counting-down', this.countingDown);
    if (step === null) return;
    el.dataset.step = String(step);
    $('countdownNumber').textContent = step === 'ready' ? 'READY' : step === 0 ? 'GO!' : String(step);
    $('countdownLabel').textContent = step === 0 ? 'MAKE YOUR ESCAPE!' : step === 1 ? 'GET SET!' : 'ON YOUR MARKS';
    el.querySelectorAll('.countdown-lights i').forEach((light, i) => {
      light.classList.toggle('lit', step !== 'ready' && (step === 0 || i < 4 - step));
    });
    el.classList.remove('countdown-hit');
    void el.offsetWidth;
    el.classList.add('countdown-hit');
    if (typeof step === 'number') this.mp.game.emit('mp:countdown', { step });
  }

  // Course en cours : multijoueur, ou solo avec PNJ
  get race() { return this.mp.inRace ? this.mp : this.bots?.active || this.bots?.list.length ? this.bots : null; }

  // Classement live (course) et HUD du coup d'épaule
  board() {
    const race = this.race, el = $('mpBoard');
    el.classList.toggle('hidden', !race);
    if (!race) return;
    el.innerHTML = race.ranking().map((p, i) => `<li class="${p.alive ? '' : 'out'}"><b>${i + 1}</b><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<em>${p.lives != null && p.alive ? `<span class="hearts">${'♥'.repeat(Math.max(0, p.lives))}</span> ` : ''}${p.alive ? `${p.dist} m` : `💀 ${p.dist} m`}${p.rtt ? ` · ${Math.round(p.rtt)} ms` : ''}</em></li>`).join('');
  }

  update() {
    const race = this.race, playing = this.mp.game.state === 'playing';
    const fighters = race === this.mp ? this.mp.peers.size : race ? race.list.length : 0;
    $('shoveBox').classList.toggle('hidden', !race || !playing || !fighters);
    if (race) { $('shoveFill').style.width = `${(1 - race.shoveCooldown) * 100}%`; this.board(); }
  }

  // Résultats de fin (ajoutés à l'écran de fin)
  resultsHtml() {
    const race = this.race;
    if (!race) return '';
    return `<ol class="mp-results">${race.ranking().map((p, i) => `<li class="${p.me ? 'me' : ''}"><b>${i + 1}</b><span class="dot" style="background:${p.color}"></span><span class="who">${esc(p.name)}</span><em>${p.alive ? `🏃 ${p.dist} m` : `💀 ${p.dist} m`}</em></li>`).join('')}</ol>`;
  }
}

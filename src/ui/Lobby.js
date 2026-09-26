// Salon multijoueur : créer une partie (code + lien), rejoindre, liste des joueurs, lancement,
// compte à rebours, classement live pendant la course et coup d'épaule.
import { Skins } from '../kernel/Registry.js';
import { skinPortraits } from './SkinPortraits.js';

const $ = (id) => document.getElementById(id);
const MAX_PLAYERS = 7; // autant que de couleurs côté réseau
const CODE_RE = /[A-Z0-9]{5}/;
const COMPACT = globalThis.matchMedia?.('(max-width: 759px), (max-height: 500px)'); // même seuil que style.css
const rowH = () => (COMPACT?.matches ? 32 : 44);
const initial = (n) => esc((n || '?').trim().charAt(0).toUpperCase());
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Lobby {
  constructor({ mp, bots, menus, hud, onLaunch }) {
    Object.assign(this, { mp, bots, menus, hud, onLaunch });
    this.el = $('mpPanel');
    menus.panels.mp = this.el;
    $('mpName').value = mp.name;
    $('mpName').addEventListener('change', (e) => { mp.setName(e.target.value); e.target.value = mp.name; this.render(); });

    document.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-mp]');
      if (!b) return;
      const a = b.dataset.mp;
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
    mp.game.on('game:start', () => { if (this.rows) { $('mpBoard').innerHTML = ''; this.rows = null; } }); // nouvelle course : pas de ▲/▼ hérités

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

  // Compte à rebours avant le départ
  countdown(delay, go) {
    [3, 2, 1].forEach((n) => setTimeout(() => this.hud.banner(`${n}`, 0.9), Math.max(0, delay - n * 1000)));
    setTimeout(() => { this.hud.banner('GO! ⚔', 0.8); go(); }, delay);
  }

  // Course en cours : multijoueur, ou solo avec PNJ
  get race() { return this.mp.inRace ? this.mp : this.bots?.active || this.bots?.list.length ? this.bots : null; }

  // Classement live (course) et HUD du coup d'épaule : lignes persistantes par joueur,
  // positionnées en translateY pour animer les dépassements.
  board() {
    const race = this.race, el = $('mpBoard');
    el.classList.toggle('hidden', !race);
    if (!race) { if (this.rows) { el.innerHTML = ''; this.rows = null; } return; }
    const rows = (this.rows ??= new Map()), ranking = race.ranking(), seen = new Set();
    const lead = Math.max(1, ...ranking.filter((p) => p.alive).map((p) => p.dist), ranking[0]?.dist || 0);
    ranking.forEach((p, i) => {
      const key = String(p.id ?? p.name);
      seen.add(key);
      let r = rows.get(key);
      if (!r) {
        const li = document.createElement('li');
        li.innerHTML = '<b class="rk"></b><span class="av"><span class="ini"></span><i class="medal"></i></span><span class="txt"><span class="nm"></span><em></em></span><i class="bar"><i></i></i><span class="delta"></span>';
        el.appendChild(li);
        r = { li, rank: i, q: (s) => li.querySelector(s), html: {} };
        rows.set(key, r);
        li.classList.add('enter');
        li.addEventListener('animationend', () => li.classList.remove('enter'), { once: true });
      }
      const set = (sel, v) => { if (r.html[sel] !== v) { r.html[sel] = v; r.q(sel).innerHTML = v; } };
      if (i !== r.rank) {
        const up = i < r.rank, d = r.q('.delta');
        d.textContent = up ? `▲${r.rank - i}` : `▼${i - r.rank}`;
        r.li.classList.remove('up', 'down'); void r.li.offsetWidth;
        r.li.classList.add(up ? 'up' : 'down');
        clearTimeout(r.t); r.t = setTimeout(() => r.li.classList.remove('up', 'down'), 1100);
        r.rank = i;
      }
      r.li.style.setProperty('--y', `${i * rowH()}px`);
      r.li.style.setProperty('--c', p.color);
      r.li.className = r.li.className.replace(/\b(p[123]|me|out)\b/g, '').trim();
      if (p.alive && i < 3) r.li.classList.add(`p${i + 1}`);
      if (p.me) r.li.classList.add('me');
      if (!p.alive) r.li.classList.add('out');
      set('.rk', `${i + 1}`);
      set('.medal', p.alive && i < 3 ? `${i + 1}` : !p.alive ? '✕' : '');
      set('.ini', initial(p.name));
      set('.nm', esc(p.name));
      set('em', `<span class="gem">◆</span>${p.dist}<small>m</small>${p.lives != null && p.alive ? `<span class="hearts">${'♥'.repeat(Math.max(0, p.lives))}</span>` : ''}${p.rtt ? `<small class="rtt">${Math.round(p.rtt)}ms</small>` : ''}`);
      r.q('.bar > i').style.transform = `scaleX(${Math.min(1, p.dist / lead)})`;
    });
    for (const [key, r] of rows) if (!seen.has(key)) { r.li.remove(); rows.delete(key); }
    el.style.height = `${ranking.length * rowH() + 34}px`;
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
    const rank = race.ranking(), score = (p) => `<span class="gem">◆</span>${p.dist} m`;
    const cls = (p, i) => `${p.me ? 'me' : ''} ${p.alive ? '' : 'out'} p${i + 1}`;
    const podium = [1, 0, 2].filter((i) => rank[i]).map((i) => { const p = rank[i]; return `<div class="pod ${cls(p, i)}" style="--c:${p.color}">
      <div class="pav"><span>${initial(p.name)}</span><i class="medal">${i + 1}</i></div>
      <div class="pname">${esc(p.name)}</div><div class="pscore">${score(p)}</div>
      <div class="block"><b>${i + 1}</b></div></div>`; }).join('');
    const rest = rank.slice(3).map((p, k) => `<li class="${cls(p, k + 3)}" style="--c:${p.color};--i:${k}"><b class="ghost">${k + 4}</b><span class="av">${initial(p.name)}</span><span class="txt"><span class="who">${esc(p.name)}</span><em>${score(p)}</em></span>${p.alive ? '' : '<span class="dead">✕</span>'}</li>`).join('');
    return `<div class="mp-results"><h3>Leaderboard</h3><div class="lb-podium">${podium}</div>${rest ? `<ol class="lb-rest">${rest}</ol>` : ''}</div>`;
  }

}

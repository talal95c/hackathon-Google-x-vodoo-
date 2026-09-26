// Salon multijoueur : créer une partie (code + lien), rejoindre, liste des joueurs, lancement,
// compte à rebours, classement live pendant la course et coup d'épaule.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Lobby {
  constructor({ mp, bots, menus, hud, onLaunch }) {
    Object.assign(this, { mp, bots, menus, hud, onLaunch });
    this.el = $('mpPanel');
    menus.panels.mp = this.el;
    $('mpName').value = mp.name;
    $('mpName').addEventListener('change', (e) => mp.setName(e.target.value));

    document.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-mp]');
      if (!b) return;
      const a = b.dataset.mp;
      if (a === 'open') this.open();
      else if (a === 'create') { await mp.create(); this.#setUrl(); this.render(); }
      else if (a === 'join') { const code = $('mpCode').value; if (code.trim()) { await mp.join(code); this.#setUrl(); this.render(); } }
      else if (a === 'copy') { try { await navigator.clipboard.writeText(this.link()); this.status('Link copied! Send it to your friends.'); } catch { this.status(this.link()); } }
      else if (a === 'launch') { this.menus.closePanels(); this.onLaunch(); }
      else if (a === 'leave') { mp.leave(); this.#setUrl(); this.render(); }
    });
    $('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.el.querySelector('[data-mp=join]').click(); });
    mp.on('lobby', () => { this.render(); this.board(); });
    mp.on('status', (t) => this.status(t));
    mp.on('results', () => this.board());
    mp.on('shoved', ({ from }) => hud.banner(`💥 ${from || 'A rival'} shoved you!`, 0.9));
    mp.on('shove', ({ hit }) => { if (!hit) hud.banner('Missed! Nobody in range', 0.7); });

    // Lien partagé : ?partie=CODE → rejoint directement
    const code = new URLSearchParams(location.search).get('partie');
    if (code) { this.open(); mp.join(code).then(() => this.render()); }
  }

  link() { const u = new URL(location.href); u.search = this.mp.code ? `?partie=${this.mp.code}` : ''; return u.toString(); }
  #setUrl() { try { history.replaceState(null, '', this.link()); } catch { /* iframe itch.io */ } }
  open() { this.menus.open('mp'); this.render(); }
  status(t) { $('mpStatus').textContent = t; }

  render() {
    const mp = this.mp, inRoom = mp.inRoom;
    $('mpJoin').classList.toggle('hidden', inRoom);
    $('mpRoom').classList.toggle('hidden', !inRoom);
    if (!inRoom) return;
    $('mpCodeShow').textContent = mp.code;
    const rows = [mp.me, ...mp.peers.values()];
    $('mpPlayers').innerHTML = rows.map((p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.me ? ' (you)' : ''}${(p.me ? mp.isHost : p.host) ? ' 👑' : ''}</li>`).join('');
    $('mpLaunch').classList.toggle('hidden', !mp.isHost);
    $('mpWait').classList.toggle('hidden', mp.isHost);
    $('mpLaunch').textContent = mp.peers.size ? `⚔ Start the race (${rows.length} players)` : '⚔ Start (solo, to test)';
  }

  // Compte à rebours avant le départ
  countdown(delay, go) {
    [3, 2, 1].forEach((n) => setTimeout(() => this.hud.banner(`${n}`, 0.9), Math.max(0, delay - n * 1000)));
    setTimeout(() => { this.hud.banner('GO! ⚔', 0.8); go(); }, delay);
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
    return `<ol class="mp-results">${race.ranking().map((p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)} — ${p.alive ? `still racing (${p.dist} m)` : `${p.dist} m`}</li>`).join('')}</ol>`;
  }
}

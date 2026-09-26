// Salon multijoueur : créer une partie (code + lien), rejoindre, liste des joueurs, lancement,
// compte à rebours, classement live pendant la course et coup d'épaule.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Lobby {
  constructor({ mp, menus, hud, onLaunch }) {
    Object.assign(this, { mp, menus, hud, onLaunch });
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
      else if (a === 'copy') { try { await navigator.clipboard.writeText(this.link()); this.status('Lien copié ! Envoie-le à tes amis.'); } catch { this.status(this.link()); } }
      else if (a === 'launch') { this.menus.closePanels(); this.onLaunch(); }
      else if (a === 'leave') { mp.leave(); this.#setUrl(); this.render(); }
    });
    $('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.el.querySelector('[data-mp=join]').click(); });
    mp.on('lobby', () => { this.render(); this.board(); });
    mp.on('status', (t) => this.status(t));
    mp.on('results', () => this.board());
    mp.on('shoved', ({ from }) => hud.banner(`💥 ${from || 'Un rival'} t'a bousculé !`, 0.9));
    mp.on('shove', ({ hit }) => { if (!hit) hud.banner('Raté ! Personne à portée', 0.7); });

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
    $('mpPlayers').innerHTML = rows.map((p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.me ? ' (toi)' : ''}${(p.me ? mp.isHost : p.host) ? ' 👑' : ''}</li>`).join('');
    $('mpLaunch').classList.toggle('hidden', !mp.isHost);
    $('mpWait').classList.toggle('hidden', mp.isHost);
    $('mpLaunch').textContent = mp.peers.size ? `⚔ Lancer la course (${rows.length} joueurs)` : '⚔ Lancer (seul pour tester)';
  }

  // Compte à rebours avant le départ
  countdown(delay, go) {
    [3, 2, 1].forEach((n) => setTimeout(() => this.hud.banner(`${n}`, 0.9), Math.max(0, delay - n * 1000)));
    setTimeout(() => { this.hud.banner('GO ! ⚔', 0.8); go(); }, delay);
  }

  // Classement live (course) et HUD du coup d'épaule
  board() {
    const mp = this.mp, el = $('mpBoard');
    el.classList.toggle('hidden', !mp.inRace);
    if (!mp.inRace) return;
    el.innerHTML = mp.ranking().map((p, i) => `<li class="${p.alive ? '' : 'out'}"><b>${i + 1}</b><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<em>${p.alive ? `${p.dist} m` : `💀 ${p.dist} m`}</em></li>`).join('');
  }

  update() {
    const mp = this.mp, racing = mp.inRace && this.mp.game.state === 'playing';
    $('shoveBox').classList.toggle('hidden', !racing || !mp.peers.size);
    $('shoveFill').style.width = `${(1 - mp.shoveCooldown) * 100}%`;
    if (mp.inRace) this.board();
  }

  // Résultats de fin (ajoutés à l'écran de fin)
  resultsHtml() {
    return `<ol class="mp-results">${this.mp.ranking().map((p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)} — ${p.alive ? `en course (${p.dist} m)` : `${p.dist} m`}</li>`).join('')}</ol>`;
  }
}

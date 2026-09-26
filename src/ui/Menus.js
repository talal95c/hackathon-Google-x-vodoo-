import { Skins, MusicThemes } from '../kernel/Registry.js';

// Écrans (titre, fin de partie) et panneaux (boutique, musique Lyria).
// Ne connaît le jeu qu'à travers des callbacks : onPlay().
const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class Menus {
  tab = 'skin';

  constructor({ game, profile, shop, lyria, music, onPlay }) {
    Object.assign(this, { game, profile, shop, lyria, music, onPlay });
    this.screens = { start: $('start'), over: $('over') };
    this.panels = { shop: $('shop'), music: $('musicPanel') };

    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.action;
      if (a === 'play') this.onPlay();
      else if (a === 'shop') this.open('shop');
      else if (a === 'music') this.open('music');
      else if (a === 'close') this.closePanels();
      else if (a === 'connect') this.#connect();
      else if (a === 'forget') { lyria.setApiKey(''); $('apiKey').value = ''; this.#renderMusic(); }
      else if (b.dataset.tab) { this.tab = b.dataset.tab; this.#renderShop(); }
      else if (b.dataset.buy) { shop.buy(b.dataset.buy); this.refresh(); }
      else if (b.dataset.skin) { profile.selectSkin(b.dataset.skin); this.refresh(); }
      else if (b.dataset.theme) { profile.selectTheme(b.dataset.theme); this.refresh(); }
    });
    lyria.onStatus(() => this.#renderMusic());
    const off = $('audioOffset');
    off.value = music.offsetMs;
    $('audioOffsetVal').textContent = `${music.offsetMs} ms`;
    off.addEventListener('input', () => { music.setOffset(+off.value); $('audioOffsetVal').textContent = `${off.value} ms`; });
    this.refresh();
  }

  get panelOpen() { return Object.values(this.panels).some((p) => !p.classList.contains('hidden')); }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    if (!name) this.closePanels();
    this.refresh();
  }

  open(name) { this.closePanels(); this.panels[name].classList.remove('hidden'); this.refresh(); }
  closePanels() { for (const p of Object.values(this.panels)) p.classList.add('hidden'); }

  showGameOver(result, { isBest, best }) {
    const TXT = {
      fall: ['ERR_404 — le dino est tombé hors de la page', 'Page introuvable.'],
      dead: ['ERR_TOO_MANY_HITS — plus de vies', 'Le dino a planté.'],
      caught: ['ERR_DINO_CAPTURED — le curseur a cliqué sur ✕', 'Onglet fermé.'],
    }[result.reason];
    $('overErr').textContent = TXT[0];
    $('overTitle').textContent = TXT[1];
    $('overScore').textContent = `${result.score} pts`;
    $('overDetails').innerHTML = `${result.distance} m · +${result.coins} ★ (total ${this.profile.coins} ★)<br/>${isBest ? '🏆 NOUVEAU RECORD !' : `Record : ${best} pts`}`;
    this.show('over');
  }

  refresh() {
    $('wallet').textContent = `★ ${this.profile.coins} pièces · skin ${Skins.get(this.profile.data.skin).name} · musique ${MusicThemes.get(this.profile.data.theme).name}`;
    this.#renderShop();
    this.#renderMusic();
  }

  #renderShop() {
    const p = this.profile, shop = this.shop;
    $('shopCoins').textContent = `★ ${p.coins}`;
    document.querySelectorAll('#shop [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    let cards = '';
    if (this.tab === 'skin') {
      for (const s of Skins.all()) {
        const owned = p.ownsSkin(s.id), sel = p.data.skin === s.id;
        const btn = sel ? '<button disabled>Équipé</button>'
          : owned ? `<button data-skin="${s.id}">Équiper</button>`
            : this.#buyButton(`skin:${s.id}`);
        cards += `<div class="card ${sel ? 'selected' : ''}"><div class="swatch" style="background:${hex(s.view.color)}"></div>
          <div class="name">${s.name}</div><div class="desc rarity-${s.rarity}">${s.rarity}${s.modifiers ? ' · bonus' : ''}</div>${btn}</div>`;
      }
    } else {
      for (const item of shop.items(this.tab)) {
        const lvl = p.upgradeLevel(item.id);
        const extra = item.category === 'music' ? `Possédé : ${p.musicCount(item.ref)}` : item.category === 'upgrade' ? `Niveau ${lvl} / ${item.maxLevel}` : '';
        cards += `<div class="card"><div class="name">${item.name}</div><div class="desc">${item.desc || ''}<br/>${extra}</div>${this.#buyButton(item.id)}</div>`;
      }
    }
    $('shopGrid').innerHTML = cards;
  }

  #buyButton(id) {
    const c = this.shop.check(id);
    if (c.reason === 'owned') return '<button disabled>Possédé</button>';
    if (c.reason === 'maxed') return '<button disabled>Max</button>';
    return `<button data-buy="${id}" ${c.ok ? '' : 'disabled'}>★ ${c.price}</button>`;
  }

  #renderMusic() {
    const l = this.lyria, p = this.profile;
    const input = $('apiKey');
    if (document.activeElement !== input) input.value = l.apiKey ? '••••••••••••' : '';
    $('lyriaStatus').textContent = l.message || (l.hasKey() ? 'Clé enregistrée' : 'Pas de clé : musique synthétisée');
    $('themeGrid').innerHTML = MusicThemes.all().map((t) => {
      const count = p.musicCount(t.id), sel = p.data.theme === t.id;
      const label = t.consumable ? `${count} partie(s)` : 'Gratuit';
      const btn = sel ? '<button disabled>Choisi</button>' : count > 0 ? `<button data-theme="${t.id}">Choisir</button>` : this.#buyButton(`music:${t.id}`);
      return `<div class="card ${sel ? 'selected' : ''}"><div class="name">🎵 ${t.name}</div><div class="desc">${label} · ${t.bpm[0]}→${t.bpm[1]} BPM</div>${btn}</div>`;
    }).join('');
  }

  async #connect() {
    const v = $('apiKey').value.trim();
    if (v && !v.startsWith('•')) this.lyria.setApiKey(v);
    await this.lyria.connect();
  }
}

import { Skins, MusicThemes } from '../kernel/Registry.js';
import { GAME } from '../kernel/config.js';
import { skinPortraits } from './SkinPortraits.js';
import './skins.css';

// Écrans (titre, fin de partie) et panneaux (boutique, musique Lyria).
// Ne connaît le jeu qu'à travers des callbacks : onPlay(), onBack() (retour depuis l'écran de fin).
const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class Menus {
  tab = 'skin';

  constructor({ game, profile, shop, lyria, music, voices, onPlay, onBack }) {
    Object.assign(this, { game, profile, shop, lyria, music, voices, onPlay, onBack });
    this.screens = { start: $('start'), over: $('over') };
    this.panels = { shop: $('shop'), music: $('musicPanel') };

    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.action;
      if (a === 'play') this.onPlay();
      else if (a === 'back') this.onBack?.();
      else if (a === 'shop') this.open('shop');
      else if (a === 'music') this.open('music');
      else if (a === 'close') this.closePanels();
      else if (a === 'connect') this.#connect();
      else if (a === 'forget') { lyria.setApiKey(''); $('apiKey').value = ''; this.#renderMusic(); }
      else if (b.dataset.tab) { this.tab = b.dataset.tab; this.#renderShop(); }
      else if (b.dataset.buy) { shop.buy(b.dataset.buy); this.refresh(); }
      else if (b.dataset.skin) { profile.selectSkin(b.dataset.skin); game.emit('skin:preview', { skin: b.dataset.skin }); this.refresh(); }
      else if (b.dataset.theme) { profile.selectTheme(b.dataset.theme); this.refresh(); }
    });
    lyria.onStatus(() => this.#renderMusic());
    const voc = $('vocals');
    voc.checked = lyria.vocals;
    voc.addEventListener('change', () => lyria.setVocals(voc.checked)); // pris en compte à la prochaine partie / au prochain palier
    const sv = $('skinVoices');
    if (sv && voices) { sv.checked = voices.enabled; sv.addEventListener('change', () => voices.setEnabled(sv.checked)); }
    const off = $('audioOffset');
    off.value = music.offsetMs;
    $('audioOffsetVal').textContent = `${music.offsetMs} ms`;
    off.addEventListener('input', () => { music.setOffset(+off.value); $('audioOffsetVal').textContent = `${off.value} ms`; });
    this.refresh();
  }

  get panelOpen() { return Object.values(this.panels).some((p) => !p.classList.contains('hidden')); }

  show(name) {
    document.body.classList.toggle('in-game', !name);
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    if (!name) this.closePanels();
    this.refresh();
  }

  open(name) { this.closePanels(); this.panels[name].classList.remove('hidden'); this.refresh(); }
  closePanels() { for (const p of Object.values(this.panels)) p.classList.add('hidden'); }

  // multi : le bouton de retour ramène au salon plutôt qu'au menu
  showGameOver(result, { isBest, best }, { multiplayer = false } = {}) {
    $('overBack').textContent = multiplayer ? '⚔ BACK TO LOBBY' : '↩ BACK TO MENU';
    const TXT = {
      fall: ['ERR_404 — the dino fell off the page', 'Page not found.'],
      dead: ['ERR_TOO_MANY_HITS — out of lives', 'The dino crashed.'],
    }[result.reason];
    $('overErr').textContent = TXT[0];
    $('overTitle').textContent = TXT[1];
    $('overScore').textContent = `${result.score} pts`;
    const tile = (v, l, cls = '') => `<div class="stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
    $('overStats').innerHTML = tile(`${result.distance} m`, 'distance') + tile(`+${result.coins} ★`, `${this.profile.coins} ★ total`)
      + (isBest ? tile('🏆', 'new best!', 'best') : tile(`${best}`, 'best score'));
    $('overRace').innerHTML = '';
    this.show('over');
  }

  refresh() {
    this.#renderShop();
    this.#renderMusic();
  }

  #renderShop() {
    const p = this.profile, shop = this.shop;
    $('shopCoins').textContent = `★ ${p.coins}`;
    document.querySelectorAll('#shop [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    let cards = '';
    if (this.tab === 'skin') {
      // Generate portraits only when the collection is actually opened.
      const portraits = this.panels.shop.classList.contains('hidden') ? null : skinPortraits();
      for (const s of Skins.all()) {
        const owned = p.ownsSkin(s.id), sel = p.data.skin === s.id;
        const btn = sel ? '<button disabled>Equipped</button>'
          : owned ? `<button data-skin="${s.id}">Equip</button>`
            : this.#buyButton(`skin:${s.id}`);
        const portrait = portraits?.get(s.id);
        cards += `<div class="card skin-card ${sel ? 'selected' : ''}" aria-label="${s.name}"><div class="skin-art">${portrait ? `<img class="skin-portrait" src="${portrait}" alt=""/>` : `<div class="swatch" style="background:${hex(s.view.color)}"></div>`}</div>
          <div class="name">${s.name}</div><div class="desc rarity-${s.rarity}">${s.description || s.rarity}${s.modifiers ? ' · bonus' : ''}</div>${s.starter ? '<span class="skin-included">In your collection</span>' : ''}${btn}</div>`;
      }
    } else {
      for (const item of shop.items(this.tab)) {
        const lvl = p.upgradeLevel(item.id);
        const extra = item.category === 'music' ? `Owned: ${p.musicCount(item.ref)}` : item.category === 'upgrade' ? `Level ${lvl} / ${item.maxLevel}` : '';
        cards += `<div class="card"><div class="name">${item.name}</div><div class="desc">${item.desc || ''}<br/>${extra}</div>${this.#buyButton(item.id)}</div>`;
      }
    }
    $('shopGrid').innerHTML = cards;
  }

  #buyButton(id) {
    const c = this.shop.check(id);
    if (c.reason === 'owned') return '<button disabled>Owned</button>';
    if (c.reason === 'maxed') return '<button disabled>Max</button>';
    return `<button data-buy="${id}" ${c.ok ? '' : 'disabled'}>★ ${c.price}</button>`;
  }

  #renderMusic() {
    const l = this.lyria, p = this.profile;
    const input = $('apiKey');
    if (document.activeElement !== input) input.value = l.apiKey ? '••••••••••••' : '';
    $('lyriaStatus').textContent = l.message || (l.hasKey() ? 'Key saved' : 'No key: synthesized music');
    $('themeGrid').innerHTML = MusicThemes.all().map((t) => {
      const count = p.musicCount(t.id), sel = p.data.theme === t.id;
      const label = count === Infinity ? (t.consumable ? 'Included with your dino' : 'Free') : `${count} run(s)`;
      const btn = sel ? '<button disabled>Selected</button>' : count > 0 ? `<button data-theme="${t.id}">Select</button>` : this.#buyButton(`music:${t.id}`);
      return `<div class="card ${sel ? 'selected' : ''}"><div class="name">🎵 ${t.name}</div><div class="desc">${label} · ${t.bpm}→${Math.round(t.bpm * GAME.tempoLevels.at(-1).ratio)} BPM</div>${btn}</div>`;
    }).join('');
  }

  async #connect() {
    const v = $('apiKey').value.trim();
    if (v && !v.startsWith('•')) this.lyria.setApiKey(v);
    await this.lyria.connect();
  }
}

import { ITEMS, EMOTES } from '../race/rules.js';
import { ROYALE } from '../kernel/config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// HUD de la Course Royale : place, chrono d'élimination, combo, objet, classement, fil d'actu.
const $ = (id) => document.getElementById(id);
const hex = (n) => `#${(n ?? 0x888888).toString(16).padStart(6, '0')}`;
const ord = (n) => (n === 1 ? '1er' : `${n}e`);

export class RaceHud {
  #feed = [];
  #alertT = 0;

  constructor(game, race, hud, input) {
    Object.assign(this, { game, race, hud, input });
    this.el = Object.fromEntries(['race', 'rPlace', 'rElim', 'rCombo', 'rComboLvl', 'rComboFill', 'rItem', 'rBoard', 'rFeed', 'rAlert', 'rCount', 'rEmotes', 'rSpec'].map((id) => [id, $(id)]));
    this.el.rItem.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressItem(); });
    this.el.rEmotes.innerHTML = EMOTES.map((e, i) => `<button data-emote="${i}">${e}</button>`).join('');
    this.el.rEmotes.addEventListener('click', (e) => { const b = e.target.closest('[data-emote]'); if (b) race.p?.emote(+b.dataset.emote); });

    const on = (t, fn) => game.on(t, fn);
    on('race:countdown', () => { this.#feed = []; this.#renderFeed(); document.body.classList.add('royale'); this.el.rSpec.classList.add('hidden'); });
    on('race:start', () => this.hud.banner('GO !', 1));
    on('race:rocket', ({ ok }) => this.hud.banner(ok ? '🚀 DÉPART TURBO !' : 'Faux départ…', 1.2));
    on('race:combo', (m) => {
      if (m.kind === 'break') return;
      const label = { overtake: 'DÉPASSEMENT', shove: 'POUSSÉE', ringout: 'ÉJECTÉ !', hit: 'TOUCHÉ', drift: 'DRIFT', trick: 'FIGURE' }[m.kind] ?? '';
      this.hud.banner(`${label} · COMBO ×${m.level}${m.rage ? ' · RAGE !' : m.freeItem ? ' · OBJET BONUS' : ''}`, 1);
      this.el.rCombo.classList.remove('pop'); void this.el.rCombo.offsetWidth; this.el.rCombo.classList.add('pop');
      navigator.vibrate?.(m.level >= ROYALE.combo.rageAt ? [30, 40, 30] : 20);
    });
    on('race:hit', ({ res, kind }) => {
      if (res === 'hit') { this.hud.flash(0.5); navigator.vibrate?.(80); }
      this.hud.banner(res === 'hit' ? `${ITEMS[kind]?.icon ?? '💥'} TOUCHÉ !` : res === 'dodged' ? 'ESQUIVÉ !' : 'BLOQUÉ 🛡', 1);
    });
    on('race:impulse', () => navigator.vibrate?.(40));
    on('race:fx', ({ target, kind, from }) => {
      if (target === race.p?.id && from !== target) { this.#alertT = 2; this.el.rAlert.textContent = `⚠ ${ITEMS[kind]?.icon ?? ''} ${ITEMS[kind]?.name ?? ''} en approche !`; }
      if (kind === 'lag' && from !== race.p?.id) this.hud.banner('📶 LAG !', 1);
    });
    on('race:feed', (m) => this.#push(m));
    on('race:elim', ({ id, place, me }) => {
      this.#push({ kind: 'elim', b: id, place });
      if (me) { this.hud.banner(`✕ ÉLIMINÉ — ${ord(place)}`, 2.5); navigator.vibrate?.([100, 60, 100]); }
    });
    on('race:emote', ({ id, e }) => this.#push({ kind: 'emote', a: id, e }));
    on('race:end', () => { this.el.rAlert.textContent = ''; });
  }

  #push(m) {
    const n = (id) => `<b style="color:${hex(this.race.colorOf(id))}">${esc(this.race.nameOf(id))}</b>`;
    const txt = {
      ringout: () => `${n(m.a)} a éjecté ${n(m.b)} 💥`,
      hit: () => `${n(m.a)} ${ITEMS[m.item]?.icon ?? ''} ${n(m.b)}`,
      steal: () => `${n(m.a)} a volé ${ITEMS[m.item]?.icon ?? ''} à ${n(m.b)}`,
      rage: () => `${n(m.a)} entre en RAGE 🔥`,
      elim: () => `✕ ${n(m.b)} éliminé (${ord(m.place)})`,
      emote: () => `${n(m.a)} : ${EMOTES[m.e] ?? ''}`,
    }[m.kind]?.();
    if (!txt) return;
    this.#feed.unshift(txt);
    this.#feed.length = Math.min(this.#feed.length, 4);
    this.#renderFeed();
  }

  #renderFeed() { this.el.rFeed.innerHTML = this.#feed.map((t) => `<div>${t}</div>`).join(''); }

  update(dt) {
    const p = this.race.p, el = this.el;
    const on = !!p && p.phase !== 'idle';
    el.race.classList.toggle('hidden', !on);
    document.body.classList.toggle('royale', on);
    if (!on) return;
    const t = p.clock();
    const cd = Math.ceil((p.startAt - t) / 1000);
    el.rCount.textContent = p.phase === 'countdown' ? (cd > ROYALE.countdown ? 'PRÊTS…' : cd > 0 ? `${cd}` : 'GO') : '';
    el.rCount.classList.toggle('hidden', p.phase !== 'countdown');
    el.rPlace.innerHTML = p.place ? `${p.place}<small>/${p.aliveCount}</small>` : '✕';
    const next = p.nextElimIn;
    el.rElim.textContent = next === null ? 'DERNIER TOUR' : `✕ DERNIER ÉLIMINÉ DANS ${Math.ceil(next)} s`;
    el.rElim.classList.toggle('warn', next !== null && next <= ROYALE.combo.window + 1);
    const lastIsMe = p.standings[p.standings.length - 1] === p.id && p.racing;
    el.rElim.classList.toggle('me', lastIsMe && next !== null && next <= ROYALE.warning);
    const c = p.combo, left = Math.max(0, c.until - p.raceTime);
    el.rCombo.classList.toggle('hidden', !c.level);
    el.rComboLvl.textContent = `COMBO ×${c.level}`;
    el.rComboFill.style.width = `${(left / ROYALE.combo.window) * 100}%`;
    const item = p.itemRoll > 0 ? ITEMS[Object.keys(ITEMS)[Math.floor(t / 80) % 9]] : p.item ? ITEMS[p.item] : null;
    el.rItem.innerHTML = item ? `<span>${item.icon}</span><small>${p.itemRoll > 0 ? '…' : item.name}</small>` : '<span class="empty">?</span>';
    el.rItem.classList.toggle('ready', !!p.item && p.itemRoll <= 0);
    el.rBoard.innerHTML = [...p.standings, ...[...p.rivals.values()].filter((r) => !r.alive).map((r) => r.id)].map((id, i) => {
      const alive = p.standings.includes(id);
      return `<div class="${id === p.id ? 'me' : ''} ${alive ? '' : 'out'}"><i style="background:${hex(this.race.colorOf(id))}"></i>${alive ? i + 1 : '✕'} ${esc(this.race.nameOf(id))}</div>`;
    }).join('');
    this.#alertT = Math.max(0, this.#alertT - dt);
    el.rAlert.classList.toggle('hidden', this.#alertT <= 0);
    const spec = this.race.spectate;
    el.rSpec.classList.toggle('hidden', !spec || p.phase === 'done');
    if (spec) el.rSpec.textContent = `👁 SPECTATEUR · ${spec.name}`;
  }
}

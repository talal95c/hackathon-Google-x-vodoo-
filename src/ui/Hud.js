import { TRACK } from '../kernel/config.js';
import { ZONES } from '../content/zones.js';
import { Weapons, Effects } from '../kernel/Registry.js';

// HUD en DOM : lit l'état du jeu chaque frame et réagit aux événements.
const $ = (id) => document.getElementById(id);

export class Hud {
  #title = '';
  #bannerTimer = 0;
  #last = {};

  constructor(game, profile) {
    this.game = game;
    this.profile = profile;
    this.el = Object.fromEntries(['hud', 'score', 'coins', 'lives', 'best', 'speed', 'boss', 'bossName', 'bossFill',
      'worldName', 'worldProgress', 'buffs', 'driftFill', 'driftLabel', 'vignette', 'flash', 'banner', 'music'].map((id) => [id, $(id)]));
    this.setBest(profile.data.best);

    const on = (t, fn) => game.on(t, fn);
    on('game:start', () => { this.#lives(false); this.el.boss.classList.add('hidden'); });
    on('tempo', ({ level }) => { if (level > 0) this.banner(`SPEED ×${game.tempo.ratio.toFixed(1)}`, 1.4); });
    on('zone', ({ number, zone }) => { this.banner(`WORLD ${Math.min(number + 1, 5)} — ${zone.name}`); this.el.hud.style.color = zone.palette.text; this.el.banner.style.color = zone.palette.text; });
    on('world:jump', ({ to }) => this.banner(`ESCAPE → ${to.name}`, 1.8));
    on('world:land', ({ zone }) => this.banner(zone.subtitle, 2.2));
    on('life:lost', () => this.#lives(true));
    on('runner:respawn', () => this.flash(0.5));
    on('runner:manual', ({ on: m, dir }) => { if (m) this.banner(dir > 0 ? '⬅ KEEP LEFT!' : 'KEEP RIGHT! ➡', 1.2); });
    on('runner:hit', () => this.flash(0.6));
    on('boss:start', ({ boss }) => { this.el.boss.classList.remove('hidden'); this.el.bossName.textContent = `⚠ ${boss.def.name}`; this.banner('BOSS!', 1.6); });
    on('boss:damage', ({ hp, max }) => { this.el.bossFill.style.width = `${(hp / max) * 100}%`; });
    on('boss:defeated', ({ reward }) => { this.el.boss.classList.add('hidden'); this.banner(`BOSS DEFEATED! +${reward} ★`, 2); this.flash(0.8); });
    on('boss:escaped', () => { this.el.boss.classList.add('hidden'); this.banner('The boss got away…', 1.6); });
    on('weapon:equip', ({ weapon }) => this.banner(`${Weapons.get(weapon.type).name.toUpperCase()} !`, 1));
    on('effect:add', ({ effect }) => this.banner(`${Effects.get(effect.type).name.toUpperCase()} !`, 1));
    on('game:over', () => this.setTitle('✕ Tab closed — Dino Race Fight Club'));
    this.#lives(false);
  }

  setBest(v) { this.el.best.textContent = `${v}`; }
  setTitle(t) { if (t !== this.#title) { document.title = t; this.#title = t; } }
  setMusicLabel(t) { this.el.music.textContent = t; }

  flash(opacity = 0.8) {
    const f = this.el.flash;
    f.style.transition = 'none'; f.style.opacity = opacity;
    requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; });
  }

  banner(text, seconds = 2) {
    this.el.banner.textContent = text;
    this.el.banner.style.opacity = 1;
    this.#bannerTimer = seconds;
  }

  #lives(hit) {
    const g = this.game, max = g.runner.stats.get('maxLives');
    this.el.lives.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < g.lives ? '' : 'lost'}">♥</span>`).join('');
    if (hit) { this.el.lives.classList.remove('hit'); void this.el.lives.offsetWidth; this.el.lives.classList.add('hit'); }
  }

  // n'écrit dans le DOM que si la valeur change
  #set(key, prop, value) { if (this.#last[key] !== value) { this.#last[key] = value; prop(value); } }

  update(dt) {
    const g = this.game, r = g.runner, el = this.el;
    this.#set('score', (v) => { el.score.textContent = v; }, `${g.distance} m`);
    this.#set('coins', (v) => { el.coins.textContent = v; }, `★ ${g.coins}`);
    this.#set('speed', (v) => { el.speed.innerHTML = `${v} <small>km/h</small>`; }, Math.round(Math.max(0, r.speed) * 3.6));

    this.#set('worldName', v => { el.worldName.textContent = v; }, `${String(g.zoneIndex + 1).padStart(2, '0')} / 05 · ${g.zone.name}`);
    el.worldProgress.style.width = `${g.zoneIndex === ZONES.length - 1 ? 100 : (g.distance % TRACK.zoneLength) / TRACK.zoneLength * 100}%`;

    // jauge de glissade (se vide en glissant, se recharge sinon) ; couleur = charge du sprint
    el.driftFill.style.width = `${r.slideGauge * 100}%`;
    el.driftFill.style.background = r.boost > 0 ? '#34a853' : r.drifting ? (r.driftCharge > 1 ? '#ff9800' : r.driftCharge > 0.35 ? '#42a5f5' : '#90caf9')
      : r.slideGauge < r.stats.get('slideMin') ? '#bdbdbd' : '#1a73e8';
    this.#set('drift', (v) => { el.driftLabel.textContent = v; }, r.boost > 0 ? 'SPRINT!' : r.drifting ? (r.driftCharge > 1 ? 'MAX SLIDE' : 'SLIDING…')
      : r.slideGauge < r.stats.get('slideMin') ? 'RECHARGING…' : 'SLIDE (SHIFT)');

    // arme + bonus actifs avec leur minuteur
    // (barre centrée en haut : le remplissage rétrécit par les deux côtés, le libellé au-dessus)
    const buffs = [];
    if (r.weapon) { const d = Weapons.get(r.weapon.type); buffs.push({ name: d.hud || d.name, p: r.weapon.progress, color: '#ff1744' }); }
    for (const fx of r.effects.values()) { const d = Effects.get(fx.type); buffs.push({ name: d.hud || d.name, p: fx.progress, color: '#aa00ff' }); }
    this.#set('buffsKey', (v) => {
      el.buffs.innerHTML = buffs.map((b) => `<div class="buff" style="color:${b.color}"><span class="buff-label">${b.name}</span><div class="bar"><div class="fill"></div></div></div>`).join('');
    }, buffs.map((b) => b.name).join('|'));
    el.buffs.querySelectorAll('.fill').forEach((f, i) => { f.style.width = `${(buffs[i]?.p ?? 0) * 100}%`; });

    if (g.state === 'playing') this.setTitle(g.boss ? '👾 BOSS!' : '🦖 HELP ME');
    if (this.#bannerTimer > 0 && (this.#bannerTimer -= dt) <= 0) el.banner.style.opacity = 0;
  }
}

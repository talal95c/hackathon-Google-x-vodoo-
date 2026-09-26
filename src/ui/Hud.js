import { GAME, TRACK } from '../kernel/config.js';
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
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    this.el = Object.fromEntries(['hud', 'score', 'coins', 'lives', 'best', 'speed', 'dangerTxt', 'dangerFill', 'boss', 'bossName', 'bossFill',
      'worldName', 'worldProgress', 'buffs', 'touchHint', 'driftFill', 'driftLabel', 'vignette', 'flash', 'banner', 'music',
      'feverGauge', 'feverText', 'feverFill', 'challengeHud'].map((id) => [id, $(id)]));
    this.setBest(profile.data.best);

    const on = (t, fn) => game.on(t, fn);
    on('game:start', () => {
      this.#lives(false);
      this.el.boss.classList.add('hidden');
      this.challengeAnnounced = false;
      this.el.touchHint.classList.remove('active');
      void this.el.touchHint.offsetWidth;
      this.el.touchHint.classList.add('active');
    });
    on('tempo', ({ level }) => { if (level > 0) this.banner(`VITESSE ×${game.tempo.ratio.toFixed(1)}`, 1.4); });
    on('zone', ({ number, zone }) => { this.banner(`MONDE ${Math.min(number + 1, 5)} — ${zone.name}`); this.el.banner.style.setProperty('--banner-color', zone.palette.text); });
    on('world:jump', ({ to }) => this.banner(`ÉVASION → ${to.name}`, 1.8));
    on('world:land', ({ zone }) => this.banner(zone.subtitle, 2.2));
    on('life:lost', () => this.#lives(true));
    on('runner:manual', ({ on: m, dir }) => { if (m) this.banner(dir > 0 ? '⬅ TIENS À GAUCHE !' : 'TIENS À DROITE ! ➡', 1.2); });
    on('runner:hit', () => this.flash(0.6));
    on('runner:parry', () => { this.banner('PARADE PARFAITE ! +25 FRÉNÉSIE', 1); this.flash(0.3); });
    on('fever:start', () => { this.banner('FRÉNÉSIE ! DÉTRUIS LES OBSTACLES', 1.8); this.flash(0.4); });
    on('boss:start', ({ boss }) => { this.el.boss.classList.remove('hidden'); this.el.bossName.textContent = `⚠ ${boss.def.name}`; this.banner('BOSS !', 1.6); });
    on('boss:damage', ({ hp, max }) => { this.el.bossFill.style.width = `${(hp / max) * 100}%`; });
    on('boss:defeated', ({ reward }) => { this.el.boss.classList.add('hidden'); this.banner(`BOSS VAINCU ! +${reward} ★`, 2); this.flash(0.8); });
    on('boss:escaped', () => { this.el.boss.classList.add('hidden'); this.banner('Le boss s\'est enfui…', 1.6); });
    on('weapon:equip', ({ weapon }) => this.banner(`${Weapons.get(weapon.type).name.toUpperCase()} !`, 1));
    on('effect:add', ({ effect }) => this.banner(`${Effects.get(effect.type).name.toUpperCase()} !`, 1));
    on('game:over', ({ reason }) => { if (reason === 'caught') this.flash(1); this.setTitle('✕ Onglet fermé — Dino Escape'); });
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
    el.feverGauge.classList.toggle('active', g.feverTime > 0);
    el.feverText.textContent = g.feverTime > 0 ? `${g.feverTime.toFixed(1)} s` : `${Math.floor(g.fever)}%`;
    el.feverFill.style.width = `${g.feverTime > 0 ? g.feverTime / GAME.feverDuration * 100 : g.fever}%`;
    const challenge = g.challenge;
    el.challengeHud.classList.toggle('hidden', !challenge || g.state !== 'playing');
    if (challenge && g.state === 'playing') {
      el.challengeHud.textContent = `${challenge.name} · ${g.challengeProgress}/${challenge.target} · +${challenge.reward} ★`;
      if (!this.challengeAnnounced && g.challengeProgress >= challenge.target) {
        this.challengeAnnounced = true;
        this.banner('DÉFI RÉUSSI !', 1.5);
      }
    }
    const gap = g.chaser.gap(g.sMax), danger = g.chaser.danger(g.sMax);
    this.#set('gap', (v) => { el.dangerTxt.textContent = `CURSEUR : ${v} m`; }, Math.max(0, Math.ceil(gap)));
    el.dangerFill.style.width = `${danger * 100}%`;
    el.vignette.style.boxShadow = `inset 0 0 160px 40px rgba(229,57,53,${Math.max(0, danger - 0.45) * 1.4})`;

    // jauge de glissade (se vide en glissant, se recharge sinon) ; couleur = charge du sprint
    el.driftFill.style.width = `${r.slideGauge * 100}%`;
    el.driftFill.style.background = r.boost > 0 ? '#34a853' : r.drifting ? (r.driftCharge > 1 ? '#ff9800' : r.driftCharge > 0.35 ? '#42a5f5' : '#90caf9')
      : r.slideGauge < r.stats.get('slideMin') ? '#bdbdbd' : '#1a73e8';
    this.#set('drift', (v) => { el.driftLabel.textContent = v; }, r.boost > 0 ? 'SPRINT !' : r.drifting ? (r.driftCharge > 1 ? 'GLISSADE MAX' : 'GLISSADE…')
      : r.slideGauge < r.stats.get('slideMin') ? 'RECHARGE…' : this.touch ? 'GLISSE · 2 DOIGTS' : 'GLISSADE (SHIFT)');

    // arme + bonus actifs avec leur minuteur
    const buffs = [];
    if (r.weapon) buffs.push({ name: Weapons.get(r.weapon.type).name, p: r.weapon.progress, color: '#ff1744' });
    for (const fx of r.effects.values()) buffs.push({ name: Effects.get(fx.type).name, p: fx.progress, color: '#aa00ff' });
    this.#set('buffsKey', (v) => {
      el.buffs.innerHTML = buffs.map((b) => `<div class="buff" style="color:${b.color}">${b.name}<div class="bar"><div class="fill"></div></div></div>`).join('');
    }, buffs.map((b) => b.name).join('|'));
    el.buffs.querySelectorAll('.fill').forEach((f, i) => { f.style.width = `${(buffs[i]?.p ?? 0) * 100}%`; });

    if (g.state === 'playing') this.setTitle(gap < 18 ? '⚠️ LE CURSEUR ARRIVE' : g.boss ? '👾 BOSS !' : '🦖 AIDEZ-MOI');
    if (this.#bannerTimer > 0 && (this.#bannerTimer -= dt) <= 0) el.banner.style.opacity = 0;
  }
}

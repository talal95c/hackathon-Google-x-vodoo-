import { View } from '../view/View.js';
import { FIGHT } from '../net/rules.js';
import './combat.css';

export class CombatHud extends View {
  timer = 0;
  constructor(ctx, race) {
    super(ctx); this.race = race;
    this.box = document.getElementById('shoveBox'); this.button = document.getElementById('shoveBtn');
    this.hint = document.createElement('div'); this.hint.className = 'combat-target'; this.box.prepend(this.hint);
    this.overlay = document.createElement('div'); this.overlay.className = 'combat-feedback';
    this.badge = document.createElement('div'); this.badge.className = 'combat-badge';
    this.title = document.createElement('strong'); this.caption = document.createElement('span');
    this.badge.append(this.title, this.caption); this.overlay.append(this.badge); document.getElementById('hud').append(this.overlay);
    this.listen('combat:impact', e => {
      if (e.kind !== 'shove' || !e.local) return;
      const received = e.local === 'received';
      this.show(received ? 'OUCH!' : 'NICE SLAP!', received ? 'Get back on your line' : 'Keep pushing!', received ? 'received' : 'dealt', e.dir);
    });
    this.listen('mp:shove', ({ hit }) => { if (!hit) this.show('DANS LE VENT', 'Rapproche-toi d’un rival', 'miss'); });
    this.listen('game:start', () => this.reset()); this.listen('runner:respawn', () => this.reset());
  }
  reset() { this.timer = 0; this.overlay.className = 'combat-feedback'; }
  show(title, caption, kind, dir = 1) {
    this.timer = kind === 'miss' ? .65 : .85;
    this.title.textContent = title; this.caption.textContent = caption;
    this.overlay.className = `combat-feedback active ${kind} ${dir > 0 ? 'from-right' : 'from-left'}`;
    this.badge.getAnimations().forEach(a => a.cancel());
    this.badge.animate([{ transform: 'translateY(8px) scale(.75) rotate(-5deg)', opacity: 0 }, { transform: 'translateY(0) scale(1.12) rotate(-3deg)', opacity: 1, offset: .3 }, { transform: 'translateY(0) scale(1) rotate(-3deg)', opacity: 1 }], { duration: 220, fill: 'both' });
  }
  update(dt) {
    this.timer = Math.max(0, this.timer - dt);
    this.overlay.classList.toggle('active', this.timer > 0 && this.game.state === 'playing');
    const race = this.race(), cd = (race?.shoveCooldown ?? 0) * FIGHT.shoveCooldown, target = this.ctx.combatTarget;
    const ready = cd <= .02;
    this.box.classList.toggle('combat-ready', ready && !!target);
    this.box.classList.toggle('combat-cooling', !ready);
    this.button.textContent = ready ? '✋ E / F · SLAP' : `✋ ${cd.toFixed(1)} s`;
    this.hint.textContent = !ready ? 'RECHARGING' : target ? `${target.name} · IN RANGE` : 'GET CLOSER TO A RIVAL';
  }
  dispose() { this.overlay.remove(); this.hint.remove(); super.dispose(); }
}

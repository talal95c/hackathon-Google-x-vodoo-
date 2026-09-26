const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const arc = x => Math.sin(clamp(x) * Math.PI);
export const FINISH_CONTACT = 1.02;
const lengths = { slap: .23, uppercut: .34, kick: .38, flip: .72 };
const neutral = () => ({ forward: 0, jump: 0, flip: 0, twist: 0, crouch: 0, kick: 0, swing: 0, lean: 0, trail: 0, active: false });

// La pose est recalculée depuis le temps du mouvement : aucune rotation ne s'accumule.
// Une rafale peut préparer le prochain coup, mais ne coupe jamais un salto en plein vol.
export class FighterMotion {
  current = null; next = null; elapsed = 0;
  tap(count) {
    const move = { kind: count % 6 === 0 ? 'flip' : count % 4 === 0 ? 'kick' : count % 3 === 0 ? 'uppercut' : 'slap', hand: count % 2 };
    if (!this.current) { this.current = move; this.elapsed = 0; }
    else if (this.next?.kind !== 'flip') this.next = move;
  }
  clear() { this.current = this.next = null; this.elapsed = 0; }
  update(dt) {
    this.elapsed += Math.max(0, dt);
    while (this.current && this.elapsed >= lengths[this.current.kind]) {
      this.elapsed -= lengths[this.current.kind]; this.current = this.next; this.next = null;
    }
    const p = neutral();
    if (!this.current) return p;
    const { kind, hand } = this.current, t = clamp(this.elapsed / lengths[kind]), beat = arc(t);
    Object.assign(p, { active: true, kind, hand, forward: beat * .48, swing: arc(t / .85), twist: (hand ? -1 : 1) * beat * .22, trail: beat });
    if (kind === 'uppercut') Object.assign(p, { jump: beat * .62, lean: -.25 * beat, forward: .7 * beat, swing: beat });
    if (kind === 'kick') Object.assign(p, { jump: beat * .55, kick: beat, forward: .85 * beat, lean: -.23 * beat });
    if (kind === 'flip') {
      const flight = clamp((t - .13) / .75);
      Object.assign(p, { jump: arc(flight) * 2.7, flip: smooth(flight) * Math.PI * 2, forward: beat * .9,
        crouch: t < .13 ? arc(t / .13) * .23 : arc((t - .88) / .12) * .16,
        kick: arc((flight - .64) / .36), swing: 0, twist: 0, trail: arc(flight) });
    }
    return p;
  }
}

export function finishPose(age, winner) {
  const p = neutral();
  if (winner) {
    const flight = clamp((age - .18) / 1.06), back = 1 - smooth((age - 1.17) / .35);
    Object.assign(p, { active: age < 1.52, jump: arc(flight) * 3.15, flip: smooth((age - .2) / .69) * Math.PI * 2,
      forward: smooth((age - .2) / .65) * 1.05 * back,
      crouch: age < .18 ? arc(age / .18) * .3 : arc((age - 1.24) / .2) * .18,
      kick: arc((age - .86) / .42), swing: 0, trail: arc(flight), kind: 'flip', hand: 0 });
  } else if (age >= FINISH_CONTACT) {
    const t = clamp((age - FINISH_CONTACT) / .95);
    Object.assign(p, { active: t < 1, forward: -1.05 * arc(t), jump: arc(t) * 1.7,
      flip: -Math.PI * 2 * smooth(t), lean: (1 - smooth(t)) * .15, trail: arc(t) * .6 });
  }
  return p;
}

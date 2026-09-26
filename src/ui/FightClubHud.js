import { View } from '../view/View.js';
import './fightclub.css';
import { CLUB } from '../fight/TapDuel.js';

export class FightClubHud extends View {
  constructor(ctx, club) {
    super(ctx); this.club = club;
    this.el = document.createElement('section'); this.el.className = 'fight-club hidden'; this.el.setAttribute('aria-label', 'Fight Club');
    this.el.innerHTML = `<header class="fc-heading"><span class="fc-kicker">RACE PAUSED · QUICK DUEL</span><h1>FIGHT <i>CLUB.</i></h1><p class="fc-rule">3 seconds. Fastest taps steal the loot.</p></header>
      <div class="fc-scoreboard"><div class="fc-player"><span class="fc-name"></span><strong class="fc-count">0</strong><small class="fc-bank"></small></div><span class="fc-vs">VS</span><div class="fc-player"><span class="fc-name"></span><strong class="fc-count">0</strong><small class="fc-bank"></small></div></div>
      <div class="fc-pulse" aria-hidden="true"></div><div class="fc-callout"><strong></strong><span></span></div>
      <div class="fc-controls"><div class="fc-time"><span></span><b></b></div><div class="fc-meter"><div></div></div><button class="fc-tap" type="button"><span class="fc-hand">✋</span><strong>TAP FAST!</strong><small>Every tap = one hit</small></button><p class="fc-footnote">Keyboard: Space or E · mobile: tap with both thumbs</p></div>
      <div class="fc-result hidden"><span class="fc-result-label"></span><strong></strong><p></p><small>Back to the race…</small></div>`;
    document.body.append(this.el);
    this.heading = this.el.querySelector('.fc-heading'); this.players = [...this.el.querySelectorAll('.fc-player')];
    this.call = this.el.querySelector('.fc-callout'); this.button = this.el.querySelector('.fc-tap'); this.result = this.el.querySelector('.fc-result');
    this.timer = this.el.querySelector('.fc-time'); this.meter = this.el.querySelector('.fc-meter > div'); this.controls = this.el.querySelector('.fc-controls');
    this.pulse = this.el.querySelector('.fc-pulse');
    this.teaser = document.createElement('div'); this.teaser.className = 'fc-teaser hidden'; document.getElementById('hud').append(this.teaser);
    this.approach = document.createElement('aside'); this.approach.className = 'fc-approach hidden';
    this.approach.innerHTML = `<div class="fc-incoming-body"><div class="fc-incoming-icon" aria-hidden="true"><span>✋</span><span>✋</span><b>VS</b></div><div class="fc-incoming-copy"><small>NEXT STOP</small><strong>FIGHT CLUB</strong><span class="fc-incoming-message" role="status">The ring is close…</span></div><div class="fc-incoming-distance" aria-hidden="true"><b></b><small>METERS</small></div></div><div class="fc-incoming-progress" aria-hidden="true"><i></i></div>`;
    document.body.append(this.approach);
    this.approachNumber = this.approach.querySelector('.fc-incoming-distance b');
    this.approachMessage = this.approach.querySelector('.fc-incoming-message');
    this.approachProgress = this.approach.querySelector('.fc-incoming-progress i');
    this.button.addEventListener('pointerdown' , e => { if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); e.stopPropagation(); club.tap(); });
    // Activation clavier/accessibilité sans compter un second click après pointerdown.
    this.button.addEventListener('click', e => { if (e.detail === 0) club.tap(); });
    this.key = e => {
      if (!club.active || !['Space', 'KeyE', 'KeyF'].includes(e.code)) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) club.tap();
    };
    window.addEventListener('keydown', this.key, true);
    this.listen('club:open', () => { document.body.classList.add('in-fight-club'); this.el.classList.remove('hidden'); this.result.classList.remove('visible'); this.result.classList.add('hidden'); this.button.disabled = true; this.call.classList.remove('fc-hit'); });
    this.listen('club:close', () => { document.body.classList.remove('in-fight-club'); this.el.classList.add('hidden'); });
    this.listen('club:hit', ({ index, count }) => {
      if (index !== club.localIndex) return;
      this.button.animate([{ transform: 'scale(.95)' }, { transform: 'scale(1)' }], { duration: 100 });
      this.players[index].querySelector('strong').animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 130 });
      this.call.classList.add('fc-hit'); this.call.querySelector('strong').textContent = count >= 20 ? 'FRENZY!' : count >= 10 ? 'KEEP HITTING!' : 'SLAP!'; this.call.querySelector('span').textContent = `COMBO ×${count}`;
      this.pulse.animate([{ opacity: .8, transform: 'scale(.9)' }, { opacity: 0, transform: 'scale(1.04)' }], { duration: 130 });
    });
    this.listen('club:result', r => {
      const won = r.winner === club.localIndex, draw = r.winner === null, watching = club.localIndex < 0;
      this.result.classList.remove('hidden'); this.result.classList.add('visible'); this.result.classList.toggle('lost', !won && !draw && !watching);
      this.result.querySelector('.fc-result-label').textContent = draw ? 'DRAW' : watching ? `${club.fighters[r.winner].name} WINS` : won ? 'YOU WIN THE DUEL' : 'REMATCH AT THE NEXT RING';
      this.result.querySelector('strong').textContent = draw ? 'WELL PLAYED!' : watching ? `${r.transfer} ★ STOLEN` : `${won ? '+' : '−'}${r.transfer} ★${won ? '' : ' · −1 ♥'}`;
      this.result.querySelector('p').textContent = draw ? 'Keep your coins. No speed penalty.' : watching ? 'Loser: −1 life, stunned 1s, then slowed 5s.' : won ? 'Rival loses 1 life, is stunned 1s, then slowed 5s.' : '−1 life. Stunned 1s, then 65% speed for 5s.';
    });
  }
  update() {
    const c = this.club, incoming = c.approachDistance;
    this.approach.classList.toggle('hidden', incoming === null);
    if (incoming !== null) {
      const close = incoming <= 60;
      this.approach.classList.toggle('fc-imminent', close);
      this.approachNumber.textContent = Math.ceil(incoming);
      const message = close ? 'GET READY TO TAP!' : 'The ring is close…';
      if (this.approachMessage.textContent !== message) this.approachMessage.textContent = message;
      this.approachProgress.style.transform = `scaleX(${1 - incoming / CLUB.approachAt})`;
    }
    this.teaser.classList.toggle('hidden', c.active || this.game.state !== 'playing' || incoming !== null);
    if (!c.active) {
      const stun = this.game.runner.effects.get('fightStun');
      this.teaser.classList.toggle('fc-stunned', !!stun);
      const dist = Math.max(0, Math.ceil(c.nextAt - this.game.distance));
      this.teaser.textContent = stun ? `✦ STUNNED · BACK IN ${stun.timeLeft.toFixed(1)} s` : `✋ FIGHT CLUB · ${dist ? `${dist} m` : 'NEXT DUEL…'}`; return;
    }
    c.fighters.forEach((f, i) => {
      this.players[i].querySelector('.fc-name').textContent = `${f.id === c.meId ? 'YOU' : f.name}`;
      this.players[i].querySelector('.fc-count').textContent = c.counts[i];
      const delta = c.result?.winner === i ? c.result.transfer : c.result?.loser === i ? -c.result.transfer : 0;
      this.players[i].querySelector('.fc-bank').textContent = `${Math.max(0, (f.coins ?? 0) + delta)} ★ IN POCKET`;
      this.players[i].classList.toggle('fc-ahead', c.counts[i] > c.counts[1 - i]);
    });
    const phase = c.phase, watching = c.localIndex < 0;
    this.button.disabled = phase !== 'tapping' || watching;
    this.controls.classList.toggle('hidden', phase === 'result'); this.call.classList.toggle('hidden', phase === 'result');
    this.call.classList.toggle('counting', phase === 'intro');
    if (phase !== 'tapping') this.call.classList.remove('fc-hit');
    if (phase === 'matching') { this.call.querySelector('strong').textContent = 'FACE OFF'; this.call.querySelector('span').textContent = 'Fighters entering the ring'; }
    if (phase === 'intro') { this.call.querySelector('strong').textContent = Math.max(1, Math.ceil((1800 - (c.now() - c.session.startedAt)) / 600)); this.call.querySelector('span').textContent = watching ? 'SPECTATING' : 'GET READY TO TAP'; }
    if (phase === 'judging') { this.call.querySelector('strong').textContent = 'STOP !'; this.call.querySelector('span').textContent = 'Counting the final hits…'; }
    if (phase === 'tapping' && !this.call.classList.contains('fc-hit')) { this.call.querySelector('strong').textContent = watching ? 'FIGHT !' : 'YOUR TURN!'; this.call.querySelector('span').textContent = watching ? 'LIVE DUEL' : 'TAP AS FAST AS YOU CAN'; }
    this.timer.querySelector('span').textContent = watching ? 'LIVE DUEL' : phase === 'tapping' ? 'FASTER!' : '3 SECONDS TO FIGHT';
    this.timer.querySelector('b').textContent = `${c.remaining.toFixed(1)} s`;
    this.meter.style.transform = `scaleX(${Math.max(0, 1 - c.progress)})`;
    this.button.querySelector('strong').textContent = watching ? 'LIVE DUEL' : phase === 'tapping' ? 'TAP FAST!' : phase === 'judging' ? 'TIME UP!' : 'READY?';
    this.button.classList.toggle('fc-hot', phase === 'tapping' && c.remaining < 1);
  }
  dispose() { window.removeEventListener('keydown', this.key, true); this.el.remove(); this.teaser.remove(); this.approach.remove(); super.dispose(); }
}

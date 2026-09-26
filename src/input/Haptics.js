// Vibrations courtes sur mobile (ignorées si l'appareil ne les gère pas).
export function bindHaptics(game) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const buzz = (p) => { try { navigator.vibrate(p); } catch { /* bloqué par le navigateur */ } };
  game.on('entity:destroy', ({ entity, reason }) => {
    if (reason !== 'collected') return;
    if (entity.type === 'goldCoin') buzz(12);
    else if (entity.type !== 'coin') buzz([18, 30, 18]);
  });
  game.on('pad:used', () => buzz(25));
  game.on('runner:parry', () => buzz(35));
  game.on('runner:hit', () => buzz([60, 40, 90]));
  game.on('game:over', () => buzz(120));
}

// Règles du combat en multijoueur (fonctions pures, testées sous Node).
// Chaque joueur est maître de son propre dino : il calcule seul ce qu'il subit.
export const FIGHT = {
  contactS: 2.2,          // distance le long de la route pour un contact (m)
  contactD: 1.9,          // distance latérale pour un contact (m)
  contactY: 2,            // écart de hauteur max (sauter par-dessus évite le contact)
  bumpBase: 5,            // poussée minimale d'un contact (m/s)
  bumpRam: 1.1,           // × vitesse latérale de l'autre vers moi : celui qui fonce pousse plus fort
  bumpCooldown: 0.4,      // un contact par rival toutes les 0,4 s
  shoveRangeS: 6,         // portée du coup d'épaule
  shoveRangeD: 5,
  shovePower: 26,         // m/s latéraux infligés
  shoveStumble: 0.3,
  shoveCooldown: 2,
};

// Poussée latérale que "me" subit au contact de "other" (0 si pas de contact).
// me/other : { s, d, y, lat } (lat = vitesse latérale, + = vers la gauche)
export function bumpImpulse(me, other, tie = 1) {
  const ds = other.s - me.s, dd = me.d - other.d;
  if (Math.abs(ds) > FIGHT.contactS || Math.abs(dd) > FIGHT.contactD || Math.abs(me.y - other.y) > FIGHT.contactY) return 0;
  const dir = dd === 0 ? tie : Math.sign(dd);            // on est repoussé loin de l'autre
  const ram = Math.max(0, other.lat * dir);               // sa vitesse vers moi
  return dir * (FIGHT.bumpBase + ram * FIGHT.bumpRam);
}

// Rival le plus proche à portée du coup d'épaule → { id, dir } (dir = sens de la poussée pour lui)
export function shoveTarget(me, rivals) {
  let best = null;
  for (const r of rivals) {
    if (!r.alive) continue;
    const ds = Math.abs(r.s - me.s), dd = r.d - me.d;
    if (ds > FIGHT.shoveRangeS || Math.abs(dd) > FIGHT.shoveRangeD) continue;
    const dist = Math.hypot(ds, dd);
    if (!best || dist < best.dist) best = { id: r.id, dir: Math.sign(dd) || 1, dist };
  }
  return best;
}

// Code de partie lisible (sans caractères ambigus)
export function roomCode(rand = Math.random) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[Math.floor(rand() * A.length)]).join('');
}

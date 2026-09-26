import { ROYALE } from '../kernel/config.js';

// Règles pures de la Course Royale (partagées client / serveur, testées sous Node).

// Instants (s depuis le départ) des éliminations pour n joueurs : la dernière tombe à endTime.
export function eliminationSchedule(n, { endTime = ROYALE.endTime, interval = ROYALE.interval, firstMin = ROYALE.firstMin } = {}) {
  const count = Math.max(0, n - 1), out = [];
  for (let k = 0; k < count; k++) out.push(Math.max(firstMin + k * 5, endTime - (count - 1 - k) * interval));
  return out;
}

// --- Objets. target : 'self' | 'ahead' | 'next' | 'leader' | 'aheadAll' | 'behind' | 'steal'
// weights[i] = poids selon la tranche de classement (0 = en tête … 3 = dernier)
export const ITEMS = {
  trap:     { name: 'Onglet piège', icon: '🗂', target: 'behind',   weights: [5, 3, 1, 0] },
  laser:    { name: 'Laser',        icon: '⚡', target: 'ahead',    weights: [3, 4, 3, 2], speed: 70, range: 80 },
  popup:    { name: 'Pop-up',       icon: '🪟', target: 'next',     weights: [0.5, 3, 4, 3], speed: 45, range: 160 },
  virus:    { name: 'Virus',        icon: '🦠', target: 'leader',   weights: [0, 0, 0.6, 1.5], eta: 2.5 },
  turbo:    { name: 'Turbo',        icon: '🚀', target: 'self',     weights: [2, 3, 4, 4] },
  firewall: { name: 'Pare-feu',     icon: '🛡', target: 'self',     weights: [4, 2, 1, 0.5] },
  lag:      { name: 'Lag',          icon: '⏳', target: 'aheadAll', weights: [0, 0.3, 1, 2] },
  express:  { name: 'Téléchargement express', icon: '⬇', target: 'self', weights: [0, 0.5, 1.5, 3] },
  copy:     { name: 'Copier-coller', icon: '📋', target: 'steal',   weights: [0.5, 1.5, 1.5, 1] },
};
export const ITEM_IDS = Object.keys(ITEMS);

// Tranche de classement : 0 = en tête, 3 = dernier (place 1..n)
export function placeBand(place, n) {
  if (n <= 1 || place <= 1) return 0;
  if (place >= n) return 3;
  return (place - 1) / (n - 1) < 0.5 ? 1 : 2;
}

// rnd : () => [0, 1[
export function rollItem(place, n, rnd) {
  const band = placeBand(place, n);
  const total = ITEM_IDS.reduce((a, id) => a + ITEMS[id].weights[band], 0);
  let x = rnd() * total;
  for (const id of ITEM_IDS) if ((x -= ITEMS[id].weights[band]) < 0) return id;
  return 'turbo';
}

// --- Combo : effet direct renvoyé au joueur à chaque palier
export function comboEffect(level, prevLevel) {
  const C = ROYALE.combo;
  return {
    level,
    boost: level * C.boostPerLevel,
    shoveMul: 1 + level * C.shovePerLevel,
    freeItem: prevLevel < C.itemAt && level >= C.itemAt,
    rage: prevLevel < C.rageAt && level >= C.rageAt,
  };
}
export const COMBO_GAIN = { overtake: 1, shove: 1, hit: 1, drift: 1, trick: 1, ringout: 2 };

// --- Récompenses (pièces de la boutique) et trophées selon la place finale
export function coinReward(place, n) {
  const base = [0, 60, 35, 22, 14, 8][Math.min(place, 5)] ?? 8;
  return Math.round(base * (0.6 + 0.1 * n));
}
export function trophyDelta(place, n) {
  if (n <= 1) return 0;
  const t = (place - 1) / (n - 1);          // 0 = vainqueur, 1 = premier éliminé
  return Math.round(30 - t * 45);           // +30 … -15
}

// --- Elo multijoueur : chaque paire de joueurs = un duel
export function eloUpdate(players, k = 32) {
  // players : [{ id, elo, place }] → Map id → delta
  const out = new Map(players.map((p) => [p.id, 0]));
  const n = players.length;
  if (n < 2) return out;
  for (const a of players) {
    let d = 0;
    for (const b of players) {
      if (a === b) continue;
      const expected = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
      const score = a.place < b.place ? 1 : a.place > b.place ? 0 : 0.5;
      d += score - expected;
    }
    out.set(a.id, Math.round((k * d) / (n - 1)));
  }
  return out;
}

export const RANKS = [
  { id: 'bronze', name: 'Bronze', min: 0 },
  { id: 'silver', name: 'Argent', min: 1100 },
  { id: 'gold', name: 'Or', min: 1300 },
  { id: 'platinum', name: 'Platine', min: 1500 },
  { id: 'diamond', name: 'Diamant', min: 1700 },
  { id: 'root', name: 'Root', min: 1900 },
];
export const rankOf = (elo) => [...RANKS].reverse().find((r) => elo >= r.min) ?? RANKS[0];
export const START_ELO = 1000;

export const PLAYER_COLORS = [0x1a73e8, 0xe53935, 0x34a853, 0xf9a825, 0x8e24aa];
export const EMOTES = ['👋', '😂', '😡', 'GG'];

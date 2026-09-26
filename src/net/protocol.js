// Protocole WebSocket partagé client / serveur (JSON, un objet { t: type, ... } par message).
//
// Salon (client → serveur) : hello { name, skin, token }, create, join { code }, quick { ranked },
//   addBot, start, leave, ping { c }
// Salon (serveur → client) : welcome { id, profile }, lobby { code, mode, host, players, startsIn },
//   pong { c, s }, error { code, msg }, rewards { coins, trophies, elo, profile }
// Course : voir src/race/RaceCore.js (messages relayés tels quels dans les deux sens).
export const PROTOCOL_VERSION = 1;
export const MODES = { friends: 'friends', quick: 'quick', ranked: 'ranked' };
export const QUICK_FILL_MS = 10000; // partie rapide : départ après 10 s, complétée par des bots
export const MIN_RACERS = 4;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RACE_TYPES = new Set(['snap', 'box', 'use', 'shove', 'fell', 'hitres', 'trapHit', 'drift', 'trick', 'emote']);

export function defaultServerUrl(loc = globalThis.location) {
  const q = new URLSearchParams(loc?.search ?? '').get('server');
  if (q) return q;
  const env = import.meta.env?.VITE_RACE_SERVER;
  if (env) return env;
  if (!loc) return 'ws://localhost:2567';
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.hostname}:2567`;
}

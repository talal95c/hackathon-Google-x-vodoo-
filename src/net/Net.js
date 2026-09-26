// Réseau pair-à-pair (WebRTC) via Trystero : la mise en relation passe par des relais Nostr
// publics → aucun serveur à déployer, compatible itch.io (site statique).
import { joinRoom, selfId } from 'trystero';

const APP_ID = 'dino-escape-voodoo-deepmind-2026'; // deux appIds différents ne se voient jamais

// STUN publics (testés : Google et Cloudflare répondent). Les TURN publics sans compte sont
// tous morts (testé) : pour les réseaux stricts (école, entreprise, 4G), mettre des identifiants
// TURN gratuits dans .env (voir .env.example) :
//   VITE_TURN_URLS=turn:a.relay.metered.ca:80,turn:a.relay.metered.ca:443?transport=tcp
//   VITE_TURN_USERNAME=…  VITE_TURN_CREDENTIAL=…
// ou VITE_METERED_APP=monapp + VITE_METERED_API_KEY=… (identifiants récupérés à la connexion)
const STUN = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// ⚠ Toujours lire les variables UNE PAR UNE : `import.meta.env` en entier serait remplacé par
// TOUTES les variables VITE_* au build (clé Gemini comprise) → fuite dans le jeu publié.
// (try/catch : sous Node, dans les tests, import.meta.env n'existe pas)
const read = (f) => { try { return f(); } catch { return undefined; } };
const TURN_URLS = read(() => import.meta.env.VITE_TURN_URLS);
const TURN_USERNAME = read(() => import.meta.env.VITE_TURN_USERNAME);
const TURN_CREDENTIAL = read(() => import.meta.env.VITE_TURN_CREDENTIAL);
const METERED_APP = read(() => import.meta.env.VITE_METERED_APP);
const METERED_API_KEY = read(() => import.meta.env.VITE_METERED_API_KEY);

async function iceServers() {
  const servers = [...STUN];
  if (TURN_URLS && TURN_USERNAME) {
    servers.push({ urls: TURN_URLS.split(',').map((u) => u.trim()), username: TURN_USERNAME, credential: TURN_CREDENTIAL });
  }
  if (METERED_APP && METERED_API_KEY) {
    try {
      const res = await fetch(`https://${METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
      servers.push(...(await res.json()));
    } catch (e) { console.warn('[Net] TURN Metered indisponible', e); }
  }
  return servers;
}

export const hasTurn = () => !!((TURN_URLS && TURN_USERNAME) || (METERED_APP && METERED_API_KEY));

export async function connect(roomId, { onPeerJoin, onPeerLeave } = {}) {
  const room = joinRoom({ appId: APP_ID, rtcConfig: { iceServers: await iceServers() } }, roomId);
  const peers = new Set();
  room.onPeerJoin = (id) => { peers.add(id); onPeerJoin?.(id); };
  room.onPeerLeave = (id) => { peers.delete(id); onPeerLeave?.(id); };
  const channel = (name) => {
    const action = room.makeAction(name);
    return {
      send: (data, to) => action.send(data, to ? { target: to } : undefined),
      on: (fn) => { action.onMessage = (data, { peerId }) => fn(data, peerId); },
    };
  };
  return { selfId, peers, channel, leave: () => room.leave() };
}

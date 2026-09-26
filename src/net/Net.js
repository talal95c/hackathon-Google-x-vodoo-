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

async function iceServers() {
  const env = import.meta.env || {};
  const servers = [...STUN];
  if (env.VITE_TURN_URLS && env.VITE_TURN_USERNAME) {
    servers.push({ urls: env.VITE_TURN_URLS.split(',').map((u) => u.trim()), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  if (env.VITE_METERED_APP && env.VITE_METERED_API_KEY) {
    try {
      const res = await fetch(`https://${env.VITE_METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${env.VITE_METERED_API_KEY}`);
      servers.push(...(await res.json()));
    } catch (e) { console.warn('[Net] TURN Metered indisponible', e); }
  }
  return servers;
}

export const hasTurn = () => {
  const env = import.meta.env || {};
  return !!((env.VITE_TURN_URLS && env.VITE_TURN_USERNAME) || (env.VITE_METERED_APP && env.VITE_METERED_API_KEY));
};

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

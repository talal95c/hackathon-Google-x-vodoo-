// Transport multijoueur via des brokers MQTT PUBLICS (WebSocket sécurisé) : aucun serveur à nous,
// aucun compte, et ça passe sur tous les réseaux (simple connexion sortante wss://), y compris
// les Wi-Fi qui isolent les appareils. Compatible itch.io. Même interface que Net.connect.
//
// Chaque joueur se connecte à TOUS les brokers en parallèle et publie sur tous : il suffit d'un
// broker commun pour se voir, et le plus rapide l'emporte pour chaque message (doublons ignorés).
// Mesuré : HiveMQ ≈ 30 ms, Mosquitto ≈ 25 ms, EMQX ≈ 190 ms d'aller-retour.
const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
];
const NS = 'dino-escape-v2';       // espace de noms des sujets (topics)
const HEARTBEAT = 2000, TIMEOUT = 7000, GRACE = 2500;

function tryConnect(mqtt, url, will) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(url, { connectTimeout: 6000, reconnectPeriod: 2000, clean: true, will });
    const timer = setTimeout(() => { c.end(true); reject(new Error('délai')); }, 7000);
    c.once('connect', () => { clearTimeout(timer); resolve(c); });
  });
}

export async function connectMqtt(roomId, { onPeerJoin, onPeerLeave } = {}) {
  const { default: mqtt } = await import('mqtt'); // chargé seulement pour le multijoueur
  const selfId = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
  const base = `${NS}/${roomId}`;
  const will = { topic: `${base}/p`, payload: JSON.stringify({ from: selfId, bye: true, n: -1 }), qos: 0 };

  // tous les brokers en parallèle : on attend le premier, puis un court délai pour les autres
  const clients = [];
  await new Promise((resolve, reject) => {
    let pending = BROKERS.length, first = false;
    for (const url of BROKERS) {
      tryConnect(mqtt, url, will)
        .then((c) => { c.broker = new URL(url).hostname; clients.push(c); if (!first) { first = true; setTimeout(resolve, GRACE); } })
        .catch((e) => console.warn(`[MQTT] ${url} indisponible`, e?.message))
        .finally(() => { if (--pending === 0) (clients.length ? resolve() : reject(new Error('aucun broker MQTT joignable'))); });
    }
  });

  const peers = new Set(), lastSeen = new Map(), handlers = new Map();
  const seen = new Set(), seenOrder = [];
  let n = 0;
  const pub = (topic, obj) => {
    const msg = JSON.stringify({ from: selfId, n: n++, ...obj });
    for (const c of clients) if (c.connected) c.publish(topic, msg, { qos: 0 });
  };
  const hello = () => pub(`${base}/p`, { hi: true });
  const leavePeer = (id) => { if (peers.delete(id)) { lastSeen.delete(id); onPeerLeave?.(id); } };

  const onMessage = (topic, buf) => {
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (!m.from || m.from === selfId) return;           // on reçoit aussi ses propres messages
    const key = `${m.from}:${m.n}`;                      // même message reçu par plusieurs brokers
    if (seen.has(key)) return;
    seen.add(key); seenOrder.push(key);
    if (seenOrder.length > 2000) seen.delete(seenOrder.shift());
    if (topic === `${base}/p`) {
      if (m.bye) return leavePeer(m.from);
      lastSeen.set(m.from, Date.now());
      if (!peers.has(m.from)) { peers.add(m.from); hello(); onPeerJoin?.(m.from); } // je me présente au nouveau
      return;
    }
    lastSeen.set(m.from, Date.now());
    handlers.get(topic.slice(topic.lastIndexOf('/') + 1))?.(m.d, m.from);
  };

  const topics = [`${base}/p`, `${base}/b/+`, `${base}/t/${selfId}/+`];
  for (const c of clients) {
    c.on('message', onMessage);
    c.on('connect', () => c.subscribe(topics, { qos: 0 })); // reconnexion : on se réabonne
    await c.subscribeAsync(topics, { qos: 0 });
  }
  hello();
  const beat = setInterval(() => {
    hello();
    const now = Date.now();
    for (const [id, t] of lastSeen) if (now - t > TIMEOUT) leavePeer(id);
  }, HEARTBEAT);

  return {
    selfId, peers, transport: `MQTT ${clients.map((c) => c.broker.split('.').slice(-2, -1)[0]).join(' + ')}`,
    channel: (ch) => ({
      send: (data, to) => pub(to ? `${base}/t/${to}/${ch}` : `${base}/b/${ch}`, { d: data }),
      on: (fn) => handlers.set(ch, fn),
    }),
    leave: () => { clearInterval(beat); pub(`${base}/p`, { bye: true }); for (const c of clients) c.end(); },
  };
}

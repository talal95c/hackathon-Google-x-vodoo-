import { PROTOCOL_VERSION } from './protocol.js';

// Connexion au serveur de course : salon, synchronisation d'horloge, relais des messages.
//   const net = new NetClient(url); net.onMessage((msg) => ...); await net.connect({ name, skin, token });
//   net.now() → heure du serveur (ms), utilisée par Participant pour caler le départ.
export class NetClient {
  #ws = null; #handlers = new Set(); #pings = [];
  offset = 0; rtt = 0; id = null; status = 'offline';

  constructor(url) { this.url = url; }

  now() { return Date.now() + this.offset; }
  onMessage(fn) { this.#handlers.add(fn); return () => this.#handlers.delete(fn); }
  send(msg) { if (this.#ws?.readyState === 1) this.#ws.send(JSON.stringify(msg)); }

  connect(hello) {
    this.close();
    this.status = 'connecting';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.#ws = ws;
      const timer = setTimeout(() => { reject(new Error('timeout')); ws.close(); }, 6000);
      ws.onopen = () => { this.send({ t: 'hello', v: PROTOCOL_VERSION, ...hello }); this.#ping(); };
      ws.onerror = () => { clearTimeout(timer); this.status = 'offline'; reject(new Error('unreachable')); };
      ws.onclose = () => {
        clearTimeout(timer); clearInterval(this.pingTimer);
        if (this.status === 'connecting') reject(new Error('closed'));
        this.status = 'offline'; this.#emit({ t: 'disconnected' });
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'pong') return this.#pong(msg);
        if (msg.t === 'welcome') { clearTimeout(timer); this.id = msg.id; this.status = 'online'; resolve(msg); }
        this.#emit(msg);
      };
      this.pingTimer = setInterval(() => this.#ping(), 2000);
    });
  }

  close() { clearInterval(this.pingTimer); if (this.#ws) { this.#ws.onclose = null; this.#ws.close(); } this.#ws = null; this.status = 'offline'; }

  #emit(msg) { for (const fn of this.#handlers) fn(msg); }
  #ping() { this.send({ t: 'ping', c: Date.now() }); }

  // Horloge : on garde l'échantillon au plus petit aller-retour parmi les derniers
  #pong({ c, s }) {
    const now = Date.now(), rtt = now - c;
    this.#pings.push({ rtt, offset: s - (c + rtt / 2) });
    if (this.#pings.length > 8) this.#pings.shift();
    const best = this.#pings.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.offset; this.rtt = best.rtt;
  }
}

// Serveur multijoueur : salon par code, bots, course complète, récompenses (vrais WebSockets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceServer } from '../server/index.js';

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  };
  const c = {
    inbox,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 8000) => new Promise((resolve, reject) => {
      const hit = inbox.find(pred);
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      const w = { pred, resolve: (m) => { clearTimeout(timer); resolve(m); } };
      waiters.push(w);
    }),
    close: () => ws.close(),
    open: new Promise((r) => { ws.onopen = r; }),
  };
  return c;
}

test('salon entre amis : code, bots, départ synchronisé, éliminations, podium et trophées', async () => {
  const srv = await createRaceServer({ port: 0, endTime: 6, interval: 1.5 });
  try {
    const a = client(srv.port), b = client(srv.port);
    await Promise.all([a.open, b.open]);
    a.send({ t: 'hello', name: 'Alice', token: 'tok-a' });
    b.send({ t: 'hello', name: 'Bob<script>', token: 'tok-b' });
    await a.wait((m) => m.t === 'welcome');
    await b.wait((m) => m.t === 'welcome');
    a.send({ t: 'create' });
    const lobby = await a.wait((m) => m.t === 'lobby');
    assert.match(lobby.code, /^[A-Z2-9]{4}$/);
    b.send({ t: 'join', code: lobby.code.toLowerCase() });
    await a.wait((m) => m.t === 'lobby' && m.players.length === 2);
    b.send({ t: 'start' }); // pas l'hôte : ignoré
    a.send({ t: 'addBot' });
    const full = await b.wait((m) => m.t === 'lobby' && m.players.length === 3);
    assert.ok(full.players.some((p) => p.name === 'Bobscript'));
    a.send({ t: 'start' });
    const [sa, sb] = await Promise.all([a.wait((m) => m.t === 'race:start'), b.wait((m) => m.t === 'race:start')]);
    assert.equal(sa.seed, sb.seed);
    assert.equal(sa.startAt, sb.startAt);
    assert.equal(sa.schedule.length, 2);
    // Alice roule, Bob reste sur place → Bob sort en premier
    const t0 = Date.now();
    const timer = setInterval(() => {
      const t = (Date.now() - sa.startAt) / 1000;
      if (t < 0) return;
      a.send({ t: 'snap', ts: t, z: 5 + t * 40, x: 0, y: 0, sp: 40, st: 'run', f: 0 });
      b.send({ t: 'snap', ts: t, z: 5, x: 0, y: 0, sp: 0, st: 'run', f: 0 });
    }, 50);
    const elim = await b.wait((m) => m.t === 'elim', 15000);
    assert.equal(elim.id, sa.players.find((p) => p.name === 'Bobscript').id);
    const end = await a.wait((m) => m.t === 'race:end', 15000);
    clearInterval(timer);
    assert.deepEqual(end.results.map((r) => r.place), [1, 2, 3]);
    assert.ok(Date.now() - t0 < 14000);
    const rw = await a.wait((m) => m.t === 'rewards');
    assert.equal(rw.trophies, 0, 'pas de trophées entre amis');
    assert.ok(rw.coins > 0 && rw.profile.played === 1);
    a.close(); b.close();
  } finally { await srv.close(); }
});

test('partie classée : complétée par des bots, Elo et trophées enregistrés pour le compte', async () => {
  const srv = await createRaceServer({ port: 0, fillMs: 200, endTime: 5, interval: 1 });
  try {
    const a = client(srv.port);
    await a.open;
    a.send({ t: 'hello', name: 'Solo', token: 'tok-solo' });
    await a.wait((m) => m.t === 'welcome');
    a.send({ t: 'quick', ranked: true });
    const start = await a.wait((m) => m.t === 'race:start', 5000);
    assert.equal(start.players.length, 4);
    const timer = setInterval(() => {
      const t = (Date.now() - start.startAt) / 1000;
      if (t >= 0) a.send({ t: 'snap', ts: t, z: 5 + t * 90, x: 0, y: 0, sp: 90, st: 'run', f: 0 });
    }, 50);
    const rw = await a.wait((m) => m.t === 'rewards', 15000);
    clearInterval(timer);
    assert.equal(rw.mode, 'ranked');
    assert.equal(rw.place, 1);
    assert.ok(rw.trophies > 0 && rw.elo > 0);
    const saved = [...srv.progress.store.map.values()][0];
    assert.equal(saved.trophies, rw.trophies);
    assert.equal(saved.elo, 1000 + rw.elo);
    a.close();
  } finally { await srv.close(); }
});

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { eloUpdate, rankOf, START_ELO } from '../src/race/rules.js';

// Progression côté serveur (trophées, Elo, pièces gagnées en ligne). Stockage interchangeable :
//   MemoryStore (tests), JsonFileStore (un fichier, suffisant pour un seul serveur Fly.io + volume).
// Un adaptateur Supabase n'a qu'à implémenter get(key) / put(key, profile).
export class MemoryStore {
  map = new Map();
  async get(key) { return this.map.get(key) ?? null; }
  async put(key, profile) { this.map.set(key, profile); }
}

export class JsonFileStore extends MemoryStore {
  constructor(path) {
    super();
    this.path = path;
    try { this.map = new Map(Object.entries(JSON.parse(readFileSync(path, 'utf8')))); } catch { /* premier lancement */ }
  }
  async put(key, profile) {
    await super.put(key, profile);
    this.flush(); // écrit avant que les récompenses soient annoncées au joueur
  }
  flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(Object.fromEntries(this.map)));
    renameSync(`${this.path}.tmp`, this.path);
  }
}

const keyOf = (token) => createHash('sha256').update(String(token)).digest('hex').slice(0, 32);
const fresh = (name) => ({ name, trophies: 0, elo: START_ELO, coins: 0, played: 0, wins: 0, bestTrophies: 0 });

export class Progress {
  constructor(store = new MemoryStore()) { this.store = store; }

  async load(token, name) {
    if (!token) return { key: null, profile: fresh(name) };
    const key = keyOf(token);
    const profile = { ...fresh(name), ...(await this.store.get(key)), name };
    return { key, profile };
  }

  static view(profile) { return { ...profile, rank: rankOf(profile.elo) }; }

  // results : sortie de RaceCore ; players : Map id → { key, profile } (humains connectés)
  #queue = Promise.resolve();

  // Résultats appliqués un par un, profils relus depuis le stockage (plusieurs onglets / parties)
  apply(args) {
    const run = this.#queue.then(() => this.#apply(args));
    this.#queue = run.catch(() => {});
    return run;
  }

  async #apply({ mode, results, players }) {
    const humans = results.filter((r) => players.has(r.id));
    for (const r of humans) {
      const acc = players.get(r.id);
      if (acc.key) Object.assign(acc.profile, await this.store.get(acc.key), { name: acc.profile.name });
    }
    const elo = mode === 'ranked'
      ? eloUpdate(results.map((r) => ({ id: r.id, place: r.place, elo: players.get(r.id)?.profile.elo ?? START_ELO })))
      : new Map();
    const out = new Map();
    for (const r of humans) {
      const acc = players.get(r.id), p = acc.profile;
      if (acc.key) Object.assign(p, await this.store.get(acc.key), { name: p.name });
      const honest = !r.suspicious;
      const dElo = honest ? elo.get(r.id) ?? 0 : 0;
      const coins = honest ? r.coins : 0;
      const trophies = mode === 'friends' || !honest ? 0 : Math.max(-p.trophies, r.trophies);
      Object.assign(p, {
        trophies: p.trophies + trophies, elo: Math.max(0, p.elo + dElo), coins: p.coins + coins,
        played: p.played + 1, wins: p.wins + (r.place === 1 ? 1 : 0),
      });
      p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
      if (acc.key) await this.store.put(acc.key, p);
      out.set(r.id, { coins, trophies, elo: dElo, place: r.place, profile: Progress.view(p) });
    }
    return out;
  }
}

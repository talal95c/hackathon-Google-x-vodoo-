// Adaptateurs de stockage : LocalStorage (navigateur) ou Memory (tests, navigation privée).
export class MemoryStorage {
  #data = new Map();
  load(key, fallback) { return this.#data.has(key) ? structuredClone(this.#data.get(key)) : fallback; }
  save(key, value) { this.#data.set(key, structuredClone(value)); }
}

export class LocalStorage {
  load(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage bloqué */ }
  }
}

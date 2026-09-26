// Stats avec modificateurs empilables.
//   valeur finale = (base + Σ add) × Π mul
// Un modificateur = { add: { clé: n }, mul: { clé: n } }, identifié par sa source
// ("skin", "effect:magnet", "upgrade:weaponTime"…) pour pouvoir le retirer.
export class Stats {
  #mods = new Map();
  #cache = null;

  constructor(base) { this.base = base; }

  set(source, mod) { this.#mods.set(source, mod); this.#cache = null; }
  remove(source) { if (this.#mods.delete(source)) this.#cache = null; }
  clear() { this.#mods.clear(); this.#cache = null; }

  get(key) {
    if (!this.#cache) this.#cache = this.#compute();
    return this.#cache[key] ?? this.base[key];
  }

  #compute() {
    const out = { ...this.base };
    for (const m of this.#mods.values()) for (const [k, v] of Object.entries(m.add || {})) out[k] = (out[k] ?? 0) + v;
    for (const m of this.#mods.values()) for (const [k, v] of Object.entries(m.mul || {})) out[k] = (out[k] ?? 1) * v;
    return out;
  }
}

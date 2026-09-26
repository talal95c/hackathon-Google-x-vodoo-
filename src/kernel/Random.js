// Générateur pseudo-aléatoire à graine (mulberry32).
// Même graine = même route : utile pour un "défi du jour", des ghosts, des tests.
export class Random {
  constructor(seed = Date.now()) { this.seed(seed); }

  seed(seed) {
    this.state = (typeof seed === 'string' ? hash(seed) : seed) >>> 0;
    return this;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) { return a + this.next() * (b - a); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h;
}

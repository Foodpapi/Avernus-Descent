// Deterministic RNG (mulberry32) + seeded helpers.
// Every run is seeded; combat and loot derive from this seed so battles are
// reproducible but fair.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const rand = mulberry32((seed == null ? Date.now() : seed) >>> 0);
  return {
    rand,
    int(min, max) { return min + Math.floor(rand() * (max - min + 1)); }, // inclusive
    pick(arr) { return arr[Math.floor(rand() * arr.length)]; },
    chance(p) { return rand() < p; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(arr, n) { return this.shuffle(arr).slice(0, n); },
    weighted(entries) { // entries: [[value, weight], ...]
      let total = 0;
      for (const [, w] of entries) total += w;
      let r = rand() * total;
      for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
      return entries[entries.length - 1][0];
    },
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedFromString(str) { return hashString(str); }

// Shared helpers used everywhere
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function round1(v) { return Math.round(v); }
export function fmt(n) { return String(Math.round(n * 10) / 10); }
export function titleCase(s) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export function uid() { return Math.random().toString(36).slice(2, 10); }

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// Weighted random sample without replacement
export function weightedSample(rng, entries, n) {
  const pool = entries.slice();
  const out = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = rng.rand() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i][1];
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool[idx][0]);
    pool.splice(idx, 1);
  }
  return out;
}

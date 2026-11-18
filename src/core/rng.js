// Small deterministic RNG (mulberry32) so a seed always yields the same level.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(entries) { // [[weight, value], ...]
      let total = 0;
      for (const [w] of entries) total += Math.max(0, w);
      let r = next() * total;
      for (const [w, v] of entries) { r -= Math.max(0, w); if (r < 0) return v; }
      return entries[entries.length - 1][1];
    },
  };
  return rng;
}

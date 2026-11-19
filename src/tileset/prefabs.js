// Curved / sloped terrain pieces. Each prefab is described only by geometry (a height
// function or a mask); pixels and collision are derived by the terrain renderer.
// Coordinates: x = 0 is where the piece starts, y = 0 is the ground surface it starts on
// (y grows downward). U is one tile in pixels.
import { TILE as U, S } from '../core/units.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mirror = (H, W) => (x) => H(W - x) - H(W);
const arcUp = (R) => (x) => -(R - Math.sqrt(Math.max(0, R * R - x * x)));

export function prefabDefs() {
  const defs = [];
  const hf = (name, W, H, opt = {}) => defs.push({ name, type: 'height', W, H, ...opt });
  const both = (up, down, W, H) => { hf(up, W, H); hf(down, W, mirror(H, W)); };

  for (const n of [1, 2, 3]) both(`ramp45_up_${n}`, `ramp45_down_${n}`, U * n, (x) => -x);
  for (const n of [1, 2]) both(`ramp22_up_${n}`, `ramp22_down_${n}`, 2 * U * n, (x) => -x / 2);
  hf('hump', 8 * U, (x) => -0.75 * U * (1 - Math.cos((2 * Math.PI * x) / (8 * U))));
  hf('dip', 8 * U, (x) => U * (1 - Math.cos((2 * Math.PI * x) / (8 * U))));
  both('roll_up', 'roll_down', 6 * U, (x) => -U * (1 - Math.cos((Math.PI * x) / (6 * U))));
  // quarter pipe: floor curving up into a vertical wall, 3 tiles tall
  both('qp_up', 'qp_down', 3 * U, arcUp(3 * U));
  // S-drop: convex lip into a concave landing, 4 tiles down
  const R2 = 2 * U;
  const sdrop = (x) => (x <= R2 ? R2 - Math.sqrt(Math.max(0, R2 * R2 - x * x)) : R2 + Math.sqrt(Math.max(0, R2 * R2 - (2 * R2 - x) ** 2)));
  both('sdrop', 'sclimb', 4 * U, sdrop);
  // kicker: short launch ramp that ends in a cliff (must be followed by a gap)
  hf('kicker', 3 * U, arcUp(4 * U), { cliff: true });

  for (const [name, R] of [['loop6', 3 * U], ['loop10', 5 * U], ['loop14', 7 * U], ['loop18', 9 * U]]) {
    const T = U, Wb = 2 * R + 2 * T, Ht = 2 * R + T, cx = Wb / 2, cy = -R;
    defs.push({
      name, type: 'mask', x0: -U, x1: Wb + U, y0: -Ht, y1: U, dy: 0, W: Wb,
      // A ring standing on the floor, not a block with a hole: the floor runs straight in at
      // ground level with open air around it, and you only cross the thin band of the ring.
      solid(x, y) {
        if (y >= 0) return true;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        return d >= R && d <= R + T;
      },
      // Lower-left quarter only exists on path B, lower-right only on path A, so the
      // floor can pass "through" the ring. See engine/physics.js for the switch rules.
      path: (x, y) => (y >= -R && y < 0 && x >= 0 && x < Wb ? (x < cx ? 'B' : 'A') : null),
      objects: [{ type: 'loop', x: 0, y: -Ht, w: Wb, h: Ht, cx, cy, r: R }],
    });
  }

  return defs.map((d) => {
    if (d.type !== 'height') return d;
    let lo = 0, hi = 0;
    for (let x = 0; x <= d.W; x++) { lo = Math.min(lo, d.H(x)); hi = Math.max(hi, d.H(x)); }
    return {
      ...d,
      x0: -U, x1: d.W + (d.cliff ? 0 : U),
      y0: Math.floor(lo / U) * U, y1: Math.max(U, Math.ceil((hi + 8 * S) / U) * U),
      dy: d.cliff ? 0 : Math.round(d.H(d.W) / U),
      solid: (x, y) => !(d.cliff && x >= d.W) && y + 0.5 >= d.H(clamp(x + 0.5, 0, d.W)),
    };
  });
}

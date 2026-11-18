// Curved / sloped terrain pieces. Each prefab is described only by geometry (a height
// function or a mask); pixels and collision are derived by the terrain renderer.
// Coordinates: x = 0 is where the piece starts, y = 0 is the ground surface it starts on
// (y grows downward), one tile = 16px.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mirror = (H, W) => (x) => H(W - x) - H(W);
const arcUp = (R) => (x) => -(R - Math.sqrt(Math.max(0, R * R - x * x)));

export function prefabDefs() {
  const defs = [];
  const hf = (name, W, H, opt = {}) => defs.push({ name, type: 'height', W, H, ...opt });
  const both = (up, down, W, H) => { hf(up, W, H); hf(down, W, mirror(H, W)); };

  for (const n of [1, 2, 3]) both(`ramp45_up_${n}`, `ramp45_down_${n}`, 16 * n, (x) => -x);
  for (const n of [1, 2]) both(`ramp22_up_${n}`, `ramp22_down_${n}`, 32 * n, (x) => -x / 2);
  hf('hump', 128, (x) => -12 * (1 - Math.cos((2 * Math.PI * x) / 128)));
  hf('dip', 128, (x) => 16 * (1 - Math.cos((2 * Math.PI * x) / 128)));
  both('roll_up', 'roll_down', 96, (x) => -16 * (1 - Math.cos((Math.PI * x) / 96)));
  // quarter pipe: floor curving up into a vertical wall, 3 tiles tall
  both('qp_up', 'qp_down', 48, arcUp(48));
  // S-drop: convex lip into a concave landing, 4 tiles down
  const sdrop = (x) => (x <= 32 ? 32 - Math.sqrt(Math.max(0, 1024 - x * x)) : 32 + Math.sqrt(Math.max(0, 1024 - (64 - x) ** 2)));
  both('sdrop', 'sclimb', 64, sdrop);
  // kicker: short launch ramp that ends in a cliff (must be followed by a gap)
  hf('kicker', 48, arcUp(64), { cliff: true });

  for (const [name, R] of [['loop6', 48], ['loop10', 80]]) {
    const T = 16, Wb = 2 * R + 2 * T, Ht = 2 * R + T, rc = 20, cx = Wb / 2, cy = -R;
    defs.push({
      name, type: 'mask', x0: -16, x1: Wb + 16, y0: -Ht, y1: 16, dy: 0, W: Wb,
      solid(x, y) {
        if (y >= 0) return true;
        if (x < 0 || x >= Wb || y < -Ht) return false;
        const px = x + 0.5, py = y + 0.5;
        if ((px - cx) ** 2 + (py - cy) ** 2 < R * R) return false;
        if (py < -Ht + rc) {
          const ccx = px < rc ? rc : px > Wb - rc ? Wb - rc : null;
          if (ccx !== null && (px - ccx) ** 2 + (py - (-Ht + rc)) ** 2 > rc * rc) return false;
        }
        return true;
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
      x0: -16, x1: d.W + (d.cliff ? 0 : 16),
      y0: Math.floor(lo / 16) * 16, y1: Math.max(16, Math.ceil((hi + 8) / 16) * 16),
      dy: d.cliff ? 0 : Math.round(d.H(d.W) / 16),
      solid: (x, y) => !(d.cliff && x >= d.W) && y + 0.5 >= d.H(clamp(x + 0.5, 0, d.W)),
    };
  });
}

// Terrain renderer: turns any solid/air mask into textured, edged ground pixels,
// and derives per-tile collision data (pixel mask + surface angles) from the same mask.
// Every ground tile, slope, quarter pipe and loop goes through this one function, which
// is why they all join without seams.
import { Img } from './img.js';
import { P } from './palette.js';
import { TILE as T, S } from '../core/units.js';

const M = 8 * S; // context margin (px) sampled around the region
const REACH = Math.ceil(6.5 * S);
const OFFS = [];
for (let y = -REACH; y <= REACH; y++) for (let x = -REACH; x <= REACH; x++) {
  const d = Math.hypot(x, y);
  if (d > 0 && d <= 6.5 * S) OFFS.push({ x, y, d });
}
OFFS.sort((a, b) => a.d - b.d);

// Tile-periodic soil texture: two wavy sediment bands plus a few pebbles.
const MK = T - 1;
const FILL = new Uint8Array(T * T).fill(P.dirt);
const fill = (x, y, c) => { FILL[(y & MK) * T + (x & MK)] = c; };
for (let x = 0; x < T; x++) for (const [base, phase] of [[T / 4, 0], [(3 * T) / 4, Math.PI]]) {
  const y = Math.round(base + (T / 14) * Math.sin((2 * Math.PI * x) / T + phase));
  for (let k = 0; k < S; k++) fill(x, y + k, P.dirtD);
  fill(x, y + S, P.dirtL);
}
for (const [x, y] of [[3, 9], [11, 1], [8, 15], [14, 6]]) { // pebbles (16px grid positions)
  const X = Math.round(x * S), Y = Math.round(y * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S + 1; i++) fill(X + i, Y + j, P.dirtX);
  for (let i = 0; i < S; i++) fill(X + i, Y - 1, P.dirtL);
}
export const soilAt = (x, y) => FILL[(y & MK) * T + (x & MK)]; // the plain soil texture, for tiles that reuse it
// turf depth variation along the surface (tile-periodic)
const TUFT = Array.from({ length: T }, (_, x) => (1 + 0.6 * Math.sin((2 * Math.PI * 3 * x) / T) + 0.4 * Math.sin((2 * Math.PI * 7 * x) / T + 1)) * S);

// depth of the ceiling crust along the surface: blunt teeth, tile-periodic
const CRUST = Array.from({ length: T }, (_, x) => { const u = ((x / T) * 4) % 1; return (0.6 + 2.6 * (1 - Math.abs(u - 0.5) * 2) ** 1.5 + 0.8 * Math.sin((2 * Math.PI * 5 * x) / T)) * S; });

export function renderTerrain(w, h, solidFn) {
  const W = w + 2 * M, H = h + 2 * M;
  const G = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) G[y * W + x] = solidFn(x - M, y - M) ? 1 : 0;
  // integral image, to skip pixels with no air anywhere near them
  const I = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0, row = 0; x < W; x++) { row += G[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
  const full = (2 * REACH + 1) ** 2;
  const buried = (x, y) => { // every pixel within REACH is solid
    const x0 = x + M - REACH, y0 = y + M - REACH, x1 = x0 + 2 * REACH + 1, y1 = y0 + 2 * REACH + 1;
    return I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0] === full;
  };
  // outside the sampled margin, clamp (geometry is assumed to continue)
  const solid = (x, y) => G[Math.min(H - 1, Math.max(0, y + M)) * W + Math.min(W - 1, Math.max(0, x + M))] === 1;
  const normal = (x, y) => { // unit vector pointing from solid toward air
    let nx = 0, ny = 0;
    for (const o of OFFS) { if (o.d > 5.5 * S) break; if (!solid(x + o.x, y + o.y)) { nx += o.x; ny += o.y; } }
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  };
  const img = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    let d = Infinity;
    if (!buried(x, y)) for (const o of OFFS) if (!solid(x + o.x, y + o.y)) { d = o.d / S; break; } // d in 16px-grid units
    let c = FILL[(y & MK) * T + (x & MK)];
    if (d < Infinity) {
      const [, ny] = normal(x, y);
      const t = Math.min(1, Math.max(0, (-ny - 0.35) / 0.4)); // 1 = faces up, 0 = wall/ceiling
      const u = Math.min(1, Math.max(0, (ny - 0.35) / 0.4));  // 1 = faces down (a ceiling)
      if (t > 0) { // turf, thinning out as the surface steepens
        const depth = 1 + (2 + TUFT[x & MK] / S) * t;
        if (d <= 1) c = P.grassL; else if (d <= depth) c = P.grass; else if (d <= depth + 1) c = P.grassD;
      } else if (u > 0) { // ceiling crust: dark lip, toothed band, bright inner seam; thins toward walls
        const depth = 1.4 + (1.2 + CRUST[x & MK] / S) * u;
        if (d <= 1) c = P.ceilD; else if (d <= depth) c = P.ceil; else if (d <= depth + 0.9) c = P.ceilL; else if (d <= depth + 1.8) c = P.dirtD;
      } else if (d <= 1) c = P.rimD; else if (d <= 2.3) c = P.rimL; else if (d <= 3.2) c = P.dirtD;
    }
    img.set(x, y, c);
  }
  return { img, solid, normal, w, h };
}

const norm360 = (deg) => Math.round((((deg % 360) + 360) % 360) * 10) / 10;

// Collision data for the tile whose top-left pixel is (px, py).
// ang[k] is the surface angle seen by a sensor cast down / right / up / left (k = 0..3).
// Angle convention: 0 = floor, 90 = right wall, 180 = ceiling, 270 = left wall; forward
// motion at angle a is (cos a, -sin a) in screen space, so a loop is run counter-clockwise.
export function tileCollision(r, px, py) {
  const mask = new Array(T).fill(0);
  let any = false;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r.solid(px + x, py + y)) { mask[y] = (mask[y] | (1 << x)) >>> 0; any = true; }
  if (!any) return null;
  const ang = [];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let k = 0; k < 4; k++) {
    const [dx, dy] = dirs[k];
    const pts = []; // (index along the surface, depth along the cast)
    for (let i = 0; i < T; i++) for (let s = 0; s < T; s++) {
      const j = dx + dy > 0 ? s : T - 1 - s;
      const x = px + (dx ? j : i), y = py + (dy ? j : i);
      if (r.solid(x, y) && !r.solid(x - dx, y - dy)) { pts.push([i, j, x, y]); break; }
    }
    if (!pts.length) { ang.push(null); continue; }
    let a;
    if (pts.length >= 3) {
      const n = pts.length;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [i, j] of pts) { sx += i; sy += j; sxx += i * i; sxy += i * j; }
      const s = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      a = [Math.atan2(-s, 1), Math.atan2(1, -s), Math.atan2(s, -1), Math.atan2(-1, s)][k];
    } else {
      let nx = 0, ny = 0;
      for (const [, , x, y] of pts) { const v = r.normal(x, y); nx += v[0]; ny += v[1]; }
      a = Math.atan2(-nx, -ny);
    }
    ang.push(norm360((a * 180) / Math.PI));
  }
  return { mask, ang };
}

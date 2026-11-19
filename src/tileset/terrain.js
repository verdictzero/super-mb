// Terrain renderer: turns any solid/air mask into patterned, edged ground pixels,
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

// Tile-periodic soil: a diamond checker in two tones, each diamond bevelled (light on its
// upper edges, dark on its lower ones) so the ground reads as glossy patterned panels.
const MK = T - 1;
const FILL = new Uint8Array(T * T);
for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
  const H = T / 2, a = (x + y) % T, b = (((x - y) % T) + T) % T; // diagonal axes, period one tile
  const ca = a % H, cb = b % H, odd = (Math.floor(a / H) + Math.floor(b / H)) % 2;
  let c = odd ? P.dirt : P.dirtD;
  if (ca < S || cb < S) c = odd ? P.dirtL : P.dirt;               // lit edges
  else if (ca >= H - S || cb >= H - S) c = odd ? P.dirtD : P.dirtX; // shaded edges
  FILL[y * T + x] = c;
}
export const soilAt = (x, y) => FILL[(y & MK) * T + (x & MK)]; // the plain soil texture, for tiles that reuse it
const STRIPE = 3 * S; // width of the diagonal stripes on floor and ceiling edges

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
      if (t > 0) { // floor edge: white gloss line, then a two-colour diagonal candy stripe; thins as it steepens
        const depth = 1.2 + 3.4 * t;
        if (d <= 1) c = P.grassL; else if (d <= depth) c = Math.floor((x + y) / STRIPE) % 2 ? P.grass : P.grassD; else if (d <= depth + 1) c = P.rimD;
      } else if (u > 0) { // ceiling edge: same idea in the ceiling colours, stripes leaning the other way
        const depth = 1.2 + 2.6 * u;
        if (d <= 1) c = P.ceilD; else if (d <= depth) c = Math.floor((x - y + 64 * T) / STRIPE) % 2 ? P.ceil : P.ceilL; else if (d <= depth + 1) c = P.rimD;
      } else if (d <= 1) c = P.rimD; else if (d <= 2.2) c = P.rimL; else if (d <= 3.2) c = P.dirtL; else if (d <= 4.2) c = P.dirtX; // chrome-like wall trim
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

// Terrain renderer: turns any solid/air mask into textured, edged ground pixels,
// and derives per-tile collision data (pixel mask + surface angles) from the same mask.
// Every ground tile, slope, quarter pipe and loop goes through this one function, which
// is why they all join without seams.
import { Img } from './img.js';
import { P } from './palette.js';

const M = 8; // context margin (px) sampled around the region
const OFFS = [];
for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
  const d = Math.hypot(x, y);
  if (d > 0 && d <= 6.5) OFFS.push({ x, y, d });
}
OFFS.sort((a, b) => a.d - b.d);

// 16x16 periodic soil texture: two wavy sediment lines plus a few pebbles.
const WAVE = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, -1, -1, -1, -1, 0];
const FILL = new Uint8Array(256).fill(P.dirt);
for (let x = 0; x < 16; x++) {
  const a = 4 + WAVE[x], b = 12 + WAVE[(x + 8) & 15];
  FILL[a * 16 + x] = P.dirtD; FILL[((a + 1) & 15) * 16 + x] = P.dirtL;
  FILL[b * 16 + x] = P.dirtD; FILL[((b + 1) & 15) * 16 + x] = P.dirtL;
}
for (const [x, y] of [[3, 9], [4, 9], [11, 1], [12, 1], [8, 15]]) FILL[y * 16 + x] = P.dirtX;
for (const [x, y] of [[3, 8], [11, 0], [14, 9]]) FILL[y * 16 + x] = P.dirtL;
const TUFT = [0, 1, 2, 1, 0, 0, 1, 2, 2, 1, 0, 1, 0, 2, 1, 0];

export function renderTerrain(w, h, solidFn) {
  const W = w + 2 * M, H = h + 2 * M;
  const S = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[y * W + x] = solidFn(x - M, y - M) ? 1 : 0;
  // outside the sampled margin, clamp (geometry is assumed to continue)
  const solid = (x, y) => S[Math.min(H - 1, Math.max(0, y + M)) * W + Math.min(W - 1, Math.max(0, x + M))] === 1;
  const normal = (x, y) => { // unit vector pointing from solid toward air
    let nx = 0, ny = 0;
    for (const o of OFFS) { if (o.d > 5.5) break; if (!solid(x + o.x, y + o.y)) { nx += o.x; ny += o.y; } }
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  };
  const img = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    let d = Infinity;
    for (const o of OFFS) if (!solid(x + o.x, y + o.y)) { d = o.d; break; }
    let c = FILL[(y & 15) * 16 + (x & 15)];
    if (d < Infinity) {
      const [, ny] = normal(x, y);
      const t = Math.min(1, Math.max(0, (-ny - 0.35) / 0.4)); // 1 = faces up, 0 = wall/ceiling
      if (t > 0) { // turf, thinning out as the surface steepens
        const depth = 1 + (2 + TUFT[x & 15]) * t;
        if (d <= 1) c = P.grassL; else if (d <= depth) c = P.grass; else if (d <= depth + 1) c = P.grassD;
      } else if (d <= 1) c = P.rimD; else if (d <= 2.3) c = P.rimL; else if (d <= 3.2) c = P.dirtD;
    }
    img.set(x, y, c);
  }
  return { img, solid, normal, w, h };
}

const norm360 = (deg) => Math.round((((deg % 360) + 360) % 360) * 10) / 10;

// Collision data for the 16x16 tile whose top-left pixel is (px, py).
// ang[k] is the surface angle seen by a sensor cast down / right / up / left (k = 0..3).
// Angle convention: 0 = floor, 90 = right wall, 180 = ceiling, 270 = left wall; forward
// motion at angle a is (cos a, -sin a) in screen space, so a loop is run counter-clockwise.
export function tileCollision(r, px, py) {
  const mask = new Array(16).fill(0);
  let any = false;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (r.solid(px + x, py + y)) { mask[y] |= 1 << x; any = true; }
  if (!any) return null;
  const ang = [];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let k = 0; k < 4; k++) {
    const [dx, dy] = dirs[k];
    const pts = []; // (index along the surface, depth along the cast)
    for (let i = 0; i < 16; i++) for (let s = 0; s < 16; s++) {
      const j = dx + dy > 0 ? s : 15 - s;
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

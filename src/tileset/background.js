// Parallax backgrounds. Each theme is a stack of horizontally tileable strips that scroll
// at different fractions of the camera speed, plus one "line scroll" strip (water) whose
// rows each scroll a little faster than the row above, giving the receding-floor effect of
// 16-bit era backdrops. Art is original and generated from the theme palette.
//
// Layer fields (pixels): y = top edge relative to the horizon line, factor = share of the
// camera's x movement (`once` layers are drawn a single time instead of tiled), drift = constant px/frame scroll (clouds). The line-scroll layer has
// factor (top row) and factor2 (bottom row). `pin: 'top'` hangs a layer from the screen top.
import { Img } from './img.js';
import { P } from './palette.js';
import { S } from '../core/units.js';
import { makeRng } from '../core/rng.js';

const W = 256; // design units; every strip is W*S pixels wide and wraps
const wrapX = (fn) => { for (const o of [-W, 0, W]) fn(o); };
// periodic ridge line: sum of triangle/sine waves with whole-number frequencies
const ridge = (terms, tri = false) => (x) => terms.reduce((h, [amp, f, ph]) => {
  const t = (x / W) * f + ph;
  return h + amp * (tri ? 1 - 2 * Math.abs(((t % 1) + 1) % 1 - 0.5) * 2 : Math.sin(2 * Math.PI * t));
}, 0);

function silhouette(h, top, body, edge, edgeC) { // top(x) = distance of the surface below the strip top
  return new Img(W, h, S).map((x, y) => { const t = top(x); return y < t ? undefined : y - t < edge ? edgeC : body; });
}
// --- geometric shape language: prisms, banded domes, lollipop trees, lozenge clouds, towers ---
function prisms(h, rng, n, light, dark, minH, maxH) { // two-faced pyramids
  const g = new Img(W, h, S);
  const list = Array.from({ length: n }, () => ({ x: rng.int(0, W), ph: rng.int(minH, maxH) })).sort((p, q) => p.ph - q.ph);
  for (const { x, ph } of list) { const w = ph * (0.5 + rng.next() * 0.35); wrapX((o) => g.poly([[x + o - w, h], [x + o, h - ph], [x + o, h]], light).poly([[x + o, h], [x + o, h - ph], [x + o + w, h]], dark)); }
  return g;
}
function ziggurats(h, rng, n, light, dark) { // stepped pyramids
  const g = new Img(W, h, S);
  for (let i = 0; i < n; i++) { const x = rng.int(0, W), steps = rng.int(3, 5), sh = rng.int(8, 12); for (let k = 0; k < steps; k++) { const w = (steps - k) * 13; wrapX((o) => g.rect(x + o - w, h - (k + 1) * sh, 2 * w, sh, k % 2 ? dark : light).rect(x + o - w, h - (k + 1) * sh, 2 * w, 2, P.bgFarL)); } }
  return g;
}
function domes(h, rng, n, a, b, gloss, rMin, rMax) { // half-buried spheres with horizontal bands and a glint
  const g = new Img(W, h, S);
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, W), r = rng.int(rMin, rMax), cy = h - r * 0.15;
    wrapX((o) => { const cx = x + o; g.map((px, py) => ((px - cx) ** 2 + (py - cy) ** 2 <= r * r ? (Math.floor((py - cy + 200) / 5) % 2 ? a : b) : undefined)).disc(cx - r * 0.4, cy - r * 0.55, r * 0.14, gloss); });
  }
  return g;
}
function lollipops(h, rng, n, stem, ball, shade, gloss) { // row of round stylised trees over a base band
  const g = new Img(W, h, S).rect(0, h - 10, W, 10, stem);
  for (let i = 0; i < n; i++) { const x = (i * W) / n + rng.int(-4, 4), r = rng.int(6, 10), top = h - 12 - rng.int(8, 18); wrapX((o) => g.rect(x + o - 1, top, 2, h - top, stem).disc(x + o, top, r, shade).disc(x + o - 1, top - 1, r - 1.5, ball).disc(x + o - r * 0.35, top - r * 0.4, r * 0.22, gloss)); }
  return g;
}
function lozenges(h, rng, count, minW, maxW) { // flat capsule clouds with a shaded underside
  const g = new Img(W, h, S);
  for (let i = 0; i < count; i++) {
    const x = rng.int(0, W), w = rng.int(minW, maxW), rows = rng.int(2, 3);
    for (let k = 0; k < rows; k++) { const y = h - 7 - k * 5, ww = w * (1 - k * 0.3), xx = x + k * 4; wrapX((o) => g.disc(xx + o, y + 2.5, 3, P.bgCloud).disc(xx + o + ww, y + 2.5, 3, P.bgCloud).rect(xx + o, y - 0.5, ww, 6.5, P.bgCloud).rect(xx + o, y + 4, ww, 2, P.bgCloudD)); }
  }
  return g;
}
function towers(h, rng, n) { // skyline with lit windows and beacons
  const g = new Img(W, h, S);
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, W), w = rng.int(12, 26), th = rng.int(h * 0.4, h - 12);
    wrapX((o) => { g.rect(x + o, h - th, w, th, P.bgFar).rect(x + o, h - th, 2, th, P.bgFarL).rect(x + o + w / 2 - 0.5, h - th - 8, 1, 8, P.bgFarL).disc(x + o + w / 2, h - th - 9, 1.4, P.bgMidL); });
    for (let wy = h - th + 5; wy < h - 4; wy += 7) for (let wx = 5; wx < w - 3; wx += 5) if (rng.chance(0.55)) { const c = rng.chance(0.3) ? P.bgMidL : P.sun; wrapX((o) => g.rect(x + o + wx, wy, 2, 3, c)); }
  }
  return g;
}
function water(h, rng) { // banded strip (bands widen toward the viewer) with glints
  const g = new Img(W, h, S).map((x, y) => (Math.floor(Math.sqrt(y + 1) * 2.2) % 2 ? P.bgWater : P.bgWaterD)).rect(0, 0, W, 1, P.bgWaterL);
  for (let i = 0; i < h * 4; i++) { const y = rng.int(1, h - 1), x = rng.int(0, W), w = rng.int(3, 6 + y); wrapX((o) => g.rect(x + o, y, w, 1, P.bgWaterL)); }
  return g;
}
function streaks(h, rng, count) { // thin horizontal cloud bars
  const g = new Img(W, h, S);
  for (let i = 0; i < count; i++) { const x = rng.int(0, W), y = rng.int(0, h - 3), w = rng.int(14, 60); wrapX((o) => g.rect(x + o, y, w, 2, P.bgCloud).rect(x + o + 4, y + 2, w - 10, 1, P.bgCloudD)); }
  return g;
}

// --- giant far-off landmarks ---
function floatingIslands(h, rng) { // garden: islands with waterfalls, hanging in the distance
  const g = new Img(W, h, S);
  for (const [x, y, w] of [[40, 34, 34], [150, 54, 46], [226, 26, 22]]) wrapX((o) => {
    g.poly([[x + o - w, y], [x + o + w, y], [x + o + w * 0.2, y + w * 0.9], [x + o - w * 0.3, y + w * 0.7]], P.bgFar).poly([[x + o, y], [x + o + w, y], [x + o + w * 0.2, y + w * 0.9]], P.bgNear);
    g.rect(x + o - w, y - 4, 2 * w, 5, P.bgMid).rect(x + o - w, y - 4, 2 * w, 1.5, P.bgMidL).rect(x + o + w * 0.45, y, 4, h - y, P.bgWaterL).rect(x + o + w * 0.45 + 1.5, y, 1.5, h - y, P.bgWater);
    for (let k = 0; k < 3; k++) g.rect(x + o - w * 0.6 + k * w * 0.5 - 0.5, y - 12 - (k % 2) * 4, 1.5, 9 + (k % 2) * 4, P.bgNearD).disc(x + o - w * 0.6 + k * w * 0.5, y - 14 - (k % 2) * 4, 4.5, P.bgMid).disc(x + o - w * 0.6 + k * w * 0.5 - 1.2, y - 15.5 - (k % 2) * 4, 1.2, P.bgMidL);
  });
  return g;
}
function megaStructures(h, rng) { // neon: colossal half-rings and spires
  const g = new Img(W, h, S);
  for (const [x, r] of [[70, 58], [200, 40]]) wrapX((o) => g.map((px, py) => { const d = Math.hypot(px - x - o, py - h); return d <= r && d >= r - 7 ? (Math.floor((Math.atan2(py - h, px - x - o) + 7) / 0.22) % 2 ? P.bgMidL : P.bgFarL) : undefined; }));
  for (const [x, w, th] of [[128, 12, h - 4], [20, 8, h * 0.7], [238, 9, h * 0.8]]) wrapX((o) => { g.poly([[x + o - w, h], [x + o, h - th], [x + o + w, h]], P.bgMid).poly([[x + o, h], [x + o, h - th], [x + o + w, h]], P.bgMidD); for (let y = h - th + 14; y < h; y += 9) g.rect(x + o - 1, y, 2, 4, P.sun); });
  return g;
}
function airships(h, rng) { // sunset: palm islets on the water and an airship
  const g = new Img(W, h, S);
  for (const [x, w] of [[50, 30], [190, 20]]) wrapX((o) => {
    g.map((px, py) => ((px - x - o) ** 2 / (w * w) + (py - h) ** 2 / 100 <= 1 ? P.bgMidD : undefined));
    for (const [dx, th] of [[-w * 0.4, 30], [w * 0.2, 42]]) { const tx = x + o + dx, ty = h - 6 - th; g.poly([[tx - 1.5, h - 6], [tx + 2, ty], [tx + 4, ty], [tx + 1.5, h - 6]], P.bgNearD); for (const [fx, fy] of [[-14, 4], [-9, -7], [3, -9], [14, -4], [15, 7], [-13, 11]]) g.poly([[tx + 3, ty], [tx + 3 + fx * 0.5, ty + fy - 3], [tx + 3 + fx, ty + fy + 3]], P.bgNear); }
  });
  wrapX((o) => g.map((px, py) => (((px - 120 - o) / 34) ** 2 + ((py - 16) / 10) ** 2 <= 1 ? (py > 19 ? P.bgMidD : P.bgMidL) : undefined)).poly([[150 + o, 16], [162 + o, 6], [162 + o, 26]], P.bgMid).rect(110 + o, 26, 18, 5, P.bgNearD).rect(113 + o, 27.5, 3, 2, P.sun).rect(120 + o, 27.5, 3, 2, P.sun));
  return g;
}
function planet(ringed) { // huge body low in the sky
  const g = new Img(W, 70, S), cx = 60, cy = 34, r = 26;
  g.map((x, y) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? ((x - cx + 10) ** 2 + (y - cy + 10) ** 2 > r * r * 1.25 ? P.bgFar : Math.floor((y + (x - cx) * 0.25 + 100) / 6) % 2 ? P.bgFarL : P.bgCloud) : undefined));
  if (ringed) g.map((x, y, c) => { const e = ((x - cx) / 44) ** 2 + ((y - cy - (x - cx) * 0.2) / 8) ** 2; return e <= 1 && e >= 0.62 && !(c && y < cy + (x - cx) * 0.2) ? P.sun : undefined; });
  else for (const [x, y, q] of [[50, 26, 5], [68, 40, 7], [56, 46, 3]]) g.disc(x, y, q, P.bgFar);
  return g.disc(cx - 11, cy - 12, 3, P.white);
}

const PAINT = {
  meadow(rng) { // garden: capsule clouds, pastel prisms, banded domes, lollipop trees
    return [
      { name: 'planet', img: planet(true), y: -96, factor: 0.01, once: true },
      { name: 'clouds-far', img: lozenges(24, rng, 7, 10, 22), y: -62, factor: 0.03, drift: 0.06 },
      { name: 'clouds-near', img: lozenges(30, rng, 5, 22, 44), y: -98, factor: 0.06, drift: 0.14 },
      { name: 'prisms', img: prisms(70, rng, 9, P.bgFarL, P.bgFar, 28, 62), y: -70, factor: 0.1 },
      { name: 'floating-islands', img: floatingIslands(84, rng), y: -84, factor: 0.2 },
      { name: 'water', img: water(40, rng), y: 0, factor: 0.14, factor2: 0.34, line: true },
      { name: 'domes', img: domes(52, rng, 7, P.bgMid, P.bgMidL, P.white, 16, 34), y: 6, factor: 0.4 },
      { name: 'trees', img: lollipops(44, rng, 11, P.bgNearD, P.bgNear, P.bgNearD, P.bgWaterL), y: 26, factor: 0.58, fill: P.ink },
    ];
  },
  cavern(rng) { // neon: lit skyline, hanging prisms, glowing banded spheres
    const hang = new Img(W, 60, S);
    for (let i = 0; i < 14; i++) { const x = rng.int(0, W), w = rng.int(6, 13), h = rng.int(18, 54); wrapX((o) => hang.poly([[x + o - w, -1], [x + o, -1], [x + o, h]], P.bgFarL).poly([[x + o, -1], [x + o + w, -1], [x + o, h]], P.bgMidD)); }
    return [
      { name: 'moon', img: planet(false), y: -92, factor: 0.01, once: true },
      { name: 'skyline', img: towers(150, rng, 11), y: -150, factor: 0.06 },
      { name: 'mega-structures', img: megaStructures(96, rng), y: -96, factor: 0.2 },
      { name: 'hanging-prisms', img: hang, y: 0, factor: 0.16, pin: 'top' },
      { name: 'lake', img: water(40, rng), y: 0, factor: 0.14, factor2: 0.34, line: true },
      { name: 'spheres', img: domes(56, rng, 6, P.bgMid, P.bgMidL, P.sunL, 14, 30), y: 4, factor: 0.4 },
      { name: 'prisms', img: prisms(44, rng, 12, P.bgFar, P.bgNearD, 14, 36), y: 26, factor: 0.58, fill: P.ink },
    ];
  },
  dusk(rng) { // sunset: banded sun, cloud bars, stepped pyramids, striped domes
    const sun = new Img(W, 80, S).disc(170, 44, 30, P.sun).disc(170, 44, 24, P.sunL);
    for (let k = 0; k < 5; k++) sun.map((x, y, c) => (c && Math.abs(y - (52 + k * 6)) < 1 + k * 0.4 ? 0 : undefined)); // banded lower half
    return [
      { name: 'sun', img: sun, y: -104, factor: 0, once: true },
      { name: 'streaks-far', img: streaks(40, rng, 14), y: -74, factor: 0.03, drift: 0.05 },
      { name: 'streaks-near', img: streaks(30, rng, 9), y: -100, factor: 0.07, drift: 0.12 },
      { name: 'ziggurats', img: ziggurats(70, rng, 4, P.bgFarL, P.bgFar), y: -70, factor: 0.1 },
      { name: 'islets-airship', img: airships(64, rng), y: -62, factor: 0.2 },
      { name: 'sea', img: water(40, rng), y: 0, factor: 0.14, factor2: 0.34, line: true },
      { name: 'domes', img: domes(52, rng, 6, P.bgMid, P.bgMidL, P.sunL, 16, 32), y: 6, factor: 0.4 },
      { name: 'trees', img: lollipops(44, rng, 9, P.bgNearD, P.bgNear, P.bgNearD, P.bgMidL), y: 26, factor: 0.58, fill: P.ink },
    ];
  },
};

// vertical placement: the horizon sits this far above the ground line the level is built on
export const HORIZON_ABOVE_GROUND = 45 * S;

const cache = {};
export function buildBackground(theme) {
  if (cache[theme]) return cache[theme];
  const layers = (PAINT[theme] || PAINT.meadow)(makeRng(theme.length * 7919)).map((l) => ({ drift: 0, ...l, y: l.y * S, w: l.img.w, h: l.img.h }));
  return (cache[theme] = { theme, width: W * S, layers });
}

// Where each visible row of a layer comes from: calls put(layer, srcY, rows, destY, offsetX)
// for runs of rows that share one horizontal offset. Used by the demo and the PNG previews.
export function layoutBackground(bg, { camX, horizon, frame = 0, viewH }, put) {
  for (const l of bg.layers) {
    const top = Math.round(l.pin === 'top' ? 0 : horizon + l.y);
    if (top >= viewH || top + l.h <= 0) { if (!l.fill) continue; }
    const off = (f) => Math.floor(camX * f + frame * l.drift);
    if (l.line) { const step = S; for (let r = 0; r < l.h; r += step) put(l, r, step, top + r, off(l.factor + ((l.factor2 - l.factor) * r) / l.h)); }
    else put(l, 0, l.h, top, off(l.factor));
    if (l.fill) put(l, -1, viewH - (top + l.h), top + l.h, 0); // solid fill below the last layer
  }
}

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

function silhouette(h, top, body, edge, edgeC, cap = null) { // top(x) = distance of the surface below the strip top
  return new Img(W, h, S).map((x, y) => {
    const t = top(x);
    if (y < t) return undefined;
    if (cap && y - t < cap.depth && t < cap.below) return cap.c;
    return y - t < edge ? edgeC : body;
  });
}
function puffs(h, rng, count, rMin, rMax) {
  const g = new Img(W, h, S);
  for (let i = 0; i < count; i++) {
    const x = rng.int(0, W), n = rng.int(2, 4), r0 = rng.int(rMin, rMax);
    for (let k = 0; k < n; k++) wrapX((o) => g.disc(x + o + k * r0 * 1.1, h - r0 * (k % 2 ? 0.75 : 0.45), r0 * (k % 2 ? 1 : 0.8), P.bgCloud));
  }
  return g.map((x, y, c) => (c && y > h - 3 ? P.bgCloudD : undefined));
}
function streaks(h, rng, count) { // thin horizontal cloud bars
  const g = new Img(W, h, S);
  for (let i = 0; i < count; i++) { const x = rng.int(0, W), y = rng.int(0, h - 3), w = rng.int(14, 60); wrapX((o) => g.rect(x + o, y, w, 2, P.bgCloud).rect(x + o + 4, y + 2, w - 10, 1, P.bgCloudD)); }
  return g;
}
function water(h, rng) {
  const g = new Img(W, h, S).rect(0, 0, W, h, P.bgWater).rect(0, 0, W, 1, P.bgWaterL);
  for (let i = 0; i < h * 5; i++) { const y = rng.int(1, h - 1), x = rng.int(0, W), w = rng.int(3, 6 + y); wrapX((o) => g.rect(x + o, y, w, 1, rng.chance(0.5) ? P.bgWaterL : P.bgWaterD)); }
  return g;
}

const PAINT = {
  meadow(rng) {
    const hills = silhouette(52, (x) => 22 + ridge([[12, 2, 0.1], [6, 5, 0.4]])(x), P.bgMid, 2, P.bgMidL);
    for (let i = 0; i < 26; i++) { const x = rng.int(0, W), y = rng.int(34, 50); wrapX((o) => hills.disc(x + o, y, rng.int(2, 3), P.bgMidD)); }
    return [
      { name: 'clouds-far', img: puffs(22, rng, 9, 4, 6), y: -62, factor: 0.03, drift: 0.06 },
      { name: 'clouds-near', img: puffs(34, rng, 6, 7, 11), y: -96, factor: 0.06, drift: 0.14 },
      { name: 'mountains', img: silhouette(70, (x) => 34 + ridge([[22, 3, 0], [10, 7, 0.3], [5, 13, 0.7]], true)(x), P.bgFar, 0, P.bgFar, { c: P.bgFarL, depth: 7, below: 22 }), y: -70, factor: 0.1 },
      { name: 'water', img: water(40, rng), y: 0, factor: 0.14, factor2: 0.34, line: true },
      { name: 'hills', img: hills, y: 6, factor: 0.4 },
      { name: 'treeline', img: silhouette(40, (x) => 10 + ridge([[5, 4, 0.2], [3, 19, 0], [2, 31, 0.5]])(x), P.bgNear, 3, P.bgNearD), y: 30, factor: 0.58, fill: P.dirtX },
    ];
  },
  cavern(rng) {
    const pillars = new Img(W, 150, S);
    for (let i = 0; i < 9; i++) { const x = rng.int(0, W), w = rng.int(10, 22); wrapX((o) => pillars.rect(x + o, 0, w, 150, P.bgFar).rect(x + o, 0, 2, 150, P.bgFarL).rect(x + o - 3, 0, w + 6, rng.int(8, 20), P.bgFar)); }
    const stal = new Img(W, 60, S);
    for (let i = 0; i < 16; i++) { const x = rng.int(0, W), w = rng.int(6, 14), h = rng.int(18, 56); wrapX((o) => stal.poly([[x + o, -1], [x + o + w, -1], [x + o + w / 2, h]], P.bgMidD)); }
    const mounds = silhouette(56, (x) => 26 + ridge([[10, 3, 0.2], [8, 8, 0.6]], true)(x), P.bgMid, 2, P.bgFarL);
    for (let i = 0; i < 12; i++) { const x = rng.int(0, W), y = rng.int(20, 40), h = rng.int(6, 12); wrapX((o) => mounds.poly([[x + o - 3, y + h], [x + o, y], [x + o + 3, y + h]], P.bgMidL).poly([[x + o, y + h], [x + o, y], [x + o + 3, y + h]], P.sunL)); }
    return [
      { name: 'pillars', img: pillars, y: -150, factor: 0.06 },
      { name: 'stalactites', img: stal, y: 0, factor: 0.16, pin: 'top' },
      { name: 'lake', img: water(40, rng), y: 0, factor: 0.14, factor2: 0.34, line: true },
      { name: 'crystal-mounds', img: mounds, y: 6, factor: 0.4 },
      { name: 'rocks', img: silhouette(40, (x) => 12 + ridge([[7, 5, 0.1], [4, 11, 0.5]], true)(x), P.bgNear, 2, P.bgMidD), y: 30, factor: 0.58, fill: P.dirtX },
    ];
  },
  dusk(rng) {
    const sun = new Img(W, 80, S).disc(170, 44, 30, P.sun).disc(170, 44, 24, P.sunL);
    for (let k = 0; k < 5; k++) sun.map((x, y, c) => (c && Math.abs(y - (52 + k * 6)) < 1 + k * 0.4 ? 0 : undefined)); // banded lower half
    const mesa = (x) => { const r = ridge([[16, 2, 0.15], [9, 5, 0.6]], true)(x); return 30 + Math.round(r / 9) * 9; }; // stepped tops
    const dunes = silhouette(52, (x) => 24 + ridge([[11, 2, 0.6], [5, 6, 0.1]])(x), P.bgMid, 2, P.bgMidL);
    return [
      { name: 'sun', img: sun, y: -104, factor: 0, once: true },
      { name: 'streaks-far', img: streaks(40, rng, 14), y: -74, factor: 0.03, drift: 0.05 },
      { name: 'streaks-near', img: streaks(30, rng, 9), y: -100, factor: 0.07, drift: 0.12 },
      { name: 'mesas', img: silhouette(70, mesa, P.bgFar, 2, P.bgFarL), y: -66, factor: 0.1 },
      { name: 'sea', img: water(40, rng), y: 0, factor: 0.14, factor2: 0.34, line: true },
      { name: 'dunes', img: dunes, y: 6, factor: 0.4 },
      { name: 'ridge', img: silhouette(40, (x) => 10 + ridge([[6, 3, 0.3], [3, 9, 0.8]], true)(x), P.bgNear, 3, P.bgNearD), y: 30, factor: 0.58, fill: P.dirtX },
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

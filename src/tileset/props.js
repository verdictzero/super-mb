// Big background set pieces. They sit in the level plane, behind the terrain, and have no
// collision. They are painted in the backdrop colours so they read as scenery, not platforms.
// Each prop is drawn on the 16-unit design grid (16 units = one tile) and rasterised at S.
import { Img } from './img.js';
import { P } from './palette.js';
import { S } from '../core/units.js';

const TAU = Math.PI * 2;
const ang = (x, y, cx, cy) => (Math.atan2(y - cy, x - cx) + TAU) % TAU;
// sphere with horizontal bands, a shaded lower-right and a glint
function ball(g, cx, cy, r, a, b, band = 6) {
  g.map((x, y) => { const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 > r * r) return undefined; return (x - cx + r * 0.45) ** 2 + (y - cy + r * 0.45) ** 2 > r * r * 1.5 ? P.bgNearD : Math.floor((y - cy + 400) / band) % 2 ? a : b; });
  return g.disc(cx - r * 0.42, cy - r * 0.48, Math.max(1.2, r * 0.13), P.white);
}
const line = (g, x0, y0, x1, y1, w, c) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2; return g.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c); };

const PAINT = {
  totem() { // stacked glossy faces
    const g = new Img(32, 88, S);
    g.poly([[2, 8], [16, 0], [30, 8]], P.bgMidL).poly([[16, 0], [30, 8], [16, 8]], P.bgMid);
    for (let k = 0; k < 5; k++) {
      const y = 8 + k * 16, a = k % 2 ? P.bgFar : P.bgMid, l = k % 2 ? P.bgFarL : P.bgMidL;
      g.rect(1, y, 30, 16, a).rect(1, y, 30, 2, l).rect(1, y, 2, 16, l).rect(1, y + 14, 30, 2, P.bgNearD).rect(29, y, 2, 16, P.bgNearD);
      g.disc(10, y + 7, 3, P.sunL).disc(21, y + 7, 3, P.sunL).disc(10.5, y + 7.5, 1.3, P.bgNearD).disc(21.5, y + 7.5, 1.3, P.bgNearD).rect(11, y + 11.5, 10, 1.5, P.bgNearD);
    }
    return g.outline(P.bgNearD);
  },
  arch() { // candy-striped gateway
    const g = new Img(112, 100, S), cx = 55.5, cy = 56;
    g.map((x, y) => {
      const r = Math.hypot(x - cx, y - cy);
      if (y <= cy && r <= 55 && r >= 39) return Math.floor(ang(x, y, cx, cy) / (Math.PI / 10)) % 2 ? P.bgMidL : P.bgMid;
      if (y > cy && (Math.abs(x - 8.5) <= 8 || Math.abs(x - 102.5) <= 8)) return Math.floor(y / 6) % 2 ? P.bgMidL : P.bgMid;
      return undefined;
    });
    g.map((x, y, c) => { const r = Math.hypot(x - cx, y - cy); return c && y <= cy && r > 52 ? P.white : undefined; });
    return ball(g, cx, 6, 6, P.sun, P.sunL, 3).outline(P.bgNearD);
  },
  bigtree() { // giant lollipop tree
    const g = new Img(72, 120, S);
    g.rect(32, 54, 8, 66, P.bgNearD).rect(32, 54, 3, 66, P.bgNear);
    line(g, 36, 84, 14, 66, 3, P.bgNearD); line(g, 36, 76, 58, 60, 3, P.bgNearD);
    ball(g, 12, 60, 9, P.bgMid, P.bgMidL, 4); ball(g, 60, 55, 10, P.bgMid, P.bgMidL, 4);
    return ball(g, 36, 34, 31, P.bgMid, P.bgMidL, 7).outline(P.bgNearD);
  },
  palm() {
    const g = new Img(80, 104, S);
    for (let i = 0; i < 12; i++) { const t = i / 12, x = 30 + 14 * t * t, y = 104 - t * 76; g.rect(x - 3.5 + t, y - 7, 7 - t * 2, 7, i % 2 ? P.bgNear : P.bgNearD); }
    const tx = 44, ty = 28;
    for (const [dx, dy, droop] of [[-36, -6, 18], [-26, -22, 8], [-4, -28, 2], [20, -24, 8], [34, -8, 18], [-30, 10, 16], [28, 10, 16]]) {
      g.poly([[tx, ty], [tx + dx * 0.5, ty + dy - 5], [tx + dx, ty + dy + droop]], P.bgMid).poly([[tx, ty], [tx + dx, ty + dy + droop], [tx + dx * 0.45, ty + dy * 0.5 + 6]], P.bgMidD);
    }
    return g.disc(41, 30, 3, P.sun).disc(47, 31, 3, P.sunL).outline(P.bgNearD);
  },
  ferris() { // big wheel on an A-frame
    const g = new Img(136, 144, S), cx = 67.5, cy = 62, R = 54;
    line(g, cx, cy, 30, 144, 5, P.bgNearD); line(g, cx, cy, 105, 144, 5, P.bgNearD); line(g, 42, 118, 93, 118, 3, P.bgNearD);
    for (let i = 0; i < 8; i++) line(g, cx, cy, cx + R * Math.cos((i * TAU) / 8), cy + R * Math.sin((i * TAU) / 8), 2, P.bgFar);
    g.map((x, y) => { const r = Math.hypot(x - cx, y - cy); return r <= R + 2 && r >= R - 2 ? P.bgFarL : r <= R * 0.62 + 1 && r >= R * 0.62 - 1 ? P.bgFar : undefined; });
    for (let i = 0; i < 8; i++) { const x = cx + R * Math.cos((i * TAU) / 8), y = cy + R * Math.sin((i * TAU) / 8); g.rect(x - 5, y, 10, 8, i % 2 ? P.sun : P.bgMidL).rect(x - 5, y, 10, 2, P.white).rect(x - 6, y - 2, 12, 2, P.bgNearD); }
    return ball(g, cx, cy, 8, P.sun, P.sunL, 3).outline(P.bgNearD);
  },
  pylon() { // signal mast with a star billboard
    const g = new Img(56, 136, S);
    g.map((x, y) => (y > 40 && Math.abs(x - 27.5) <= 3 ? (Math.floor(y / 8) % 2 ? P.bgFarL : P.bgMidL) : undefined)).poly([[14, 136], [22, 118], [33, 118], [41, 136]], P.bgNearD);
    line(g, 27.5, 60, 10, 118, 1.5, P.bgFar); line(g, 27.5, 60, 45, 118, 1.5, P.bgFar);
    g.rect(4, 8, 48, 34, P.bgNearD).rect(7, 11, 42, 28, P.bgMidD).rect(7, 11, 42, 2, P.bgFarL);
    g.poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.6 : 10.5; return [27.5 + r * Math.cos(a), 25.5 + r * Math.sin(a)]; }), P.sun);
    return g.rect(26.5, 0, 2, 8, P.bgFarL).disc(27.5, 1.5, 2.4, P.bgMidL).outline(P.bgNearD);
  },
  crystals() {
    const g = new Img(88, 100, S);
    for (const [x, h, w] of [[14, 44, 9], [72, 52, 10], [30, 72, 11], [58, 66, 10], [44, 98, 14]]) {
      g.poly([[x - w, 100], [x - w, 100 - h + w], [x, 100 - h], [x + w, 100 - h + w], [x + w, 100]], P.bgWater).poly([[x - w, 100], [x - w, 100 - h + w], [x, 100 - h], [x - 1, 100]], P.bgWaterL).poly([[x + w * 0.45, 100], [x + w, 100 - h + w], [x + w, 100]], P.bgWaterD);
      line(g, x - w * 0.5, 100 - h + w + 4, x - w * 0.5, 100 - h * 0.45, 1.4, P.white);
    }
    return g.outline(P.bgNearD);
  },
  waterfall() { // spout block pouring into foam
    const g = new Img(56, 104, S);
    g.map((x, y) => (y > 14 && x >= 14 && x <= 42 ? [P.bgWaterL, P.bgWater, P.bgWater, P.bgWaterD][Math.floor((x + Math.sin(y / 5) * 1.5) / 2.5) % 4] : undefined));
    g.rect(4, 0, 48, 16, P.bgFar).rect(4, 0, 48, 3, P.bgFarL).rect(4, 13, 48, 3, P.bgNearD).rect(12, 10, 32, 6, P.bgNearD);
    for (const [x, r] of [[12, 6], [22, 8], [34, 9], [45, 6], [28, 5]]) g.disc(x, 100, r, P.white);
    return g.outline(P.bgNearD);
  },
  balloon() {
    const g = new Img(64, 100, S), cx = 31.5, cy = 30;
    line(g, 16, 50, 26, 82, 1, P.bgNearD); line(g, 47, 50, 37, 82, 1, P.bgNearD);
    g.map((x, y) => { const r = Math.hypot(x - cx, (y - cy) * (y > cy ? 0.82 : 1)); return r <= 29 ? (Math.floor((x - cx + 200) / 7.3) % 2 ? P.sun : P.bgMidL) : undefined; });
    g.map((x, y, c) => (c && (x - cx + 12) ** 2 + (y - cy + 12) ** 2 > 1250 ? P.bgMid : undefined)).disc(21, 16, 3.4, P.white);
    return g.rect(24, 82, 15, 11, P.bgNear).rect(24, 82, 15, 2, P.bgFarL).rect(24, 91, 15, 2, P.bgNearD).outline(P.bgNearD);
  },
  blimp() {
    const g = new Img(124, 56, S), cx = 60, cy = 22;
    g.poly([[100, 22], [122, 6], [122, 38]], P.bgMid).poly([[96, 10], [112, 0], [112, 14]], P.bgMidD).rect(46, 38, 28, 9, P.bgNear).rect(50, 40, 4, 3, P.sunL).rect(58, 40, 4, 3, P.sunL).rect(66, 40, 4, 3, P.sunL);
    g.map((x, y) => { const e = ((x - cx) / 56) ** 2 + ((y - cy) / 19) ** 2; return e <= 1 ? (y - cy > 8 ? P.bgMidD : Math.floor((x + 200) / 14) % 2 ? P.bgFarL : P.bgMidL) : undefined; });
    return g.rect(20, 9, 60, 2, P.white).outline(P.bgNearD);
  },
  gear() { // half-buried cog
    const g = new Img(104, 62, S), cx = 51.5, cy = 62;
    g.map((x, y) => { const r = Math.hypot(x - cx, y - cy), a = ang(x, y, cx, cy); if (r > 40 + (Math.floor(a / (Math.PI / 9)) % 2 ? 10 : 0)) return undefined; return r < 12 ? P.bgNearD : r < 16 ? P.bgFarL : r < 30 ? P.bgFar : r < 33 ? P.bgFarL : P.bgMid; });
    for (let i = 0; i < 5; i++) { const a = Math.PI + ((i + 0.5) * Math.PI) / 5; g.disc(cx + 23 * Math.cos(a), cy + 23 * Math.sin(a), 3, P.bgNearD); }
    return g.outline(P.bgNearD);
  },
  orb() { // glossy sphere on a stepped pedestal
    const g = new Img(56, 96, S);
    for (let k = 0; k < 3; k++) g.rect(6 + k * 6, 84 - k * 12, 44 - k * 12, 12, k % 2 ? P.bgFarL : P.bgFar).rect(6 + k * 6, 84 - k * 12, 44 - k * 12, 2, P.white).rect(6 + k * 6, 94 - k * 12, 44 - k * 12, 2, P.bgNearD);
    return ball(g, 27.5, 34, 25, P.sun, P.bgMidL, 6).outline(P.bgNearD);
  },
  hoop() { // floating striped ring
    const g = new Img(72, 72, S), c = 35.5;
    g.map((x, y) => { const r = Math.hypot(x - c, y - c); return r <= 33 && r >= 23 ? (Math.floor(ang(x, y, c, c) / (Math.PI / 8)) % 2 ? P.sun : P.bgMidL) : undefined; });
    g.map((x, y, col) => { const r = Math.hypot(x - c, y - c); return col && r > 30.5 && y < c ? P.white : undefined; });
    return g.outline(P.bgNearD);
  },
  column() { // broken fluted column
    const g = new Img(40, 104, S);
    g.map((x, y) => (x >= 8 && x <= 32 && y > 14 + Math.abs(((x * 0.7) % 9) - 4.5) * 2.2 && y < 96 ? [P.bgFarL, P.bgFar, P.bgFar, P.bgMidD][Math.floor((x - 8) / 2) % 4] : undefined));
    return g.rect(3, 94, 34, 10, P.bgFar).rect(3, 94, 34, 2, P.bgFarL).rect(5, 86, 30, 8, P.bgFar).rect(5, 86, 30, 2, P.bgFarL).outline(P.bgNearD);
  },
};

// --- animated factory machinery: each takes a phase t in [0, 1) and is rendered as FRAMES frames ---
const cog = (g, cx, cy, r, teeth, rot, body, rim, hub) => { // toothed wheel with spokes, turned by `rot` radians
  g.map((x, y) => { const d = Math.hypot(x - cx, y - cy), a = ang(x, y, cx, cy) - rot; if (d > r + (Math.floor(((a % TAU) + TAU) / (Math.PI / teeth)) % 2 ? r * 0.2 : 0)) return undefined; return d < r * 0.2 ? hub : d < r * 0.3 ? rim : d < r * 0.72 ? (Math.abs(Math.sin((a * 3))) < 0.28 ? rim : undefined) : d < r * 0.82 ? rim : body; });
  return g;
};
const ANIM = {
  cogs(t) { // big gear driving a small one
    const g = new Img(120, 96, S);
    g.rect(22, 60, 12, 36, P.bgNearD).rect(82, 62, 10, 34, P.bgNearD).rect(10, 90, 100, 6, P.bgNear).rect(10, 90, 100, 2, P.bgFarL);
    cog(g, 42, 46, 34, 12, t * (TAU / 12), P.bgFar, P.bgFarL, P.bgNearD);
    cog(g, 93, 52, 17, 6, -t * (TAU / 6) + 0.26, P.bgMidL, P.sunL, P.bgNearD);
    return g.outline(P.bgNearD);
  },
  pistons(t) { // twin pistons pumping in opposite phase over a crank case
    const g = new Img(88, 112, S);
    g.rect(4, 70, 80, 42, P.bgFar).rect(4, 70, 80, 3, P.bgFarL).rect(4, 106, 80, 6, P.bgNear);
    for (let i = 0; i < 6; i++) g.disc(12 + i * 13, 100, 2, P.bgNearD);
    [0, 1].forEach((k) => {
      const x = 14 + k * 36, up = 26 * (0.5 + 0.5 * Math.sin(TAU * t + k * Math.PI));
      g.rect(x + 9, 30 + (26 - up), 6, 40 + up, P.bgFarL).rect(x + 10, 30 + (26 - up), 2, 40 + up, P.white); // rod
      g.rect(x, 12 + (26 - up), 24, 20, P.bgMidL).rect(x, 12 + (26 - up), 24, 3, P.sunL).rect(x, 28 + (26 - up), 24, 4, P.bgMidD); // head
      g.rect(x - 2, 56, 28, 16, P.bgMid).rect(x - 2, 56, 28, 2, P.bgFarL); // cylinder
    });
    return g.outline(P.bgNearD);
  },
  boiler(t) { // tank with a bubbling sight glass, a gauge and a blinking lamp
    const g = new Img(72, 104, S);
    g.rect(10, 92, 8, 12, P.bgNearD).rect(54, 92, 8, 12, P.bgNearD);
    g.map((x, y) => { const e = ((x - 35.5) / 30) ** 2 + ((y - 56) / 40) ** 2; return e <= 1 ? ((x - 22) ** 2 / 500 + (y - 36) ** 2 / 900 > 1.3 ? P.bgMidD : P.bgMid) : undefined; });
    for (const y of [34, 56, 78]) g.map((x, yy, c) => (c && Math.abs(yy - y) < 1.2 ? P.bgFarL : undefined));
    g.rect(27, 40, 10, 36, P.bgNearD).map((x, y) => { if (x < 28 || x >= 36 || y < 41 || y >= 75) return undefined; const lvl = 52 + 3 * Math.sin(TAU * t + x); return y < lvl ? P.bgNear : ((Math.floor(x * 3 + y * 5 + t * 24) % 11 === 0) ? P.bgWaterL : P.bgWater); });
    g.disc(50, 46, 7, P.bgNearD).disc(50, 46, 5.6, P.white); const na = -Math.PI * 0.75 + 0.9 * Math.sin(TAU * t) + 0.8; line(g, 50, 46, 50 + 5 * Math.cos(na), 46 + 5 * Math.sin(na), 1.2, P.bgNearD);
    g.rect(31, 8, 9, 10, P.bgFar).disc(35.5, 6, 4, Math.floor(t * 6) % 2 ? P.sun : P.bgMidD);
    return g.outline(P.bgNearD);
  },
  stack(t) { // smokestack: puffs rise and thin out
    const g = new Img(64, 150, S);
    for (let k = 0; k < 3; k++) { const u = (t + k / 3) % 1, y = 46 - u * 44, r = 5 + u * 9; g.disc(32 + Math.sin((u + k) * 5) * 6 * u + 6 * u, y, r, P.bgCloud).disc(34 + Math.sin((u + k) * 5) * 6 * u + 6 * u, y + 2, r * 0.6, P.bgCloudD); }
    g.map((x, y) => (y >= 50 && Math.abs(x - 31.5) <= 9 + (y - 50) * 0.06 ? (Math.floor(y / 12) % 2 ? P.bgMidL : P.bgNearD) : undefined)).rect(20, 48, 23, 4, P.bgFarL);
    g.map((x, y, c) => (c && y >= 52 && x < 26 ? P.bgFarL : undefined));
    return g.outline(P.bgNearD);
  },
  flywheel(t) { // engine: flywheel, crank and a sliding rod
    const g = new Img(128, 80, S), cx = 36, cy = 40, a = TAU * t, px = cx + 22 * Math.cos(a), py = cy + 22 * Math.sin(a), sx = 96 + 14 * Math.cos(a);
    g.rect(4, 72, 120, 8, P.bgNear).rect(4, 72, 120, 2, P.bgFarL).rect(30, 40, 12, 34, P.bgNearD).rect(84, 30, 40, 24, P.bgMid).rect(84, 30, 40, 3, P.bgFarL).rect(84, 50, 40, 4, P.bgMidD).rect(96, 54, 16, 18, P.bgNearD);
    cog(g, cx, cy, 30, 16, a, P.bgFar, P.bgFarL, P.bgNearD);
    line(g, px, py, sx, 42, 3, P.sunL); g.disc(px, py, 3, P.sun).rect(sx - 2, 38, 30, 8, P.bgFarL).rect(sx - 2, 38, 30, 2, P.white);
    return g.outline(P.bgNearD);
  },
  tank(t) { // storage sphere on legs: level sloshes, pipe drips
    const g = new Img(88, 120, S), cx = 43.5, cy = 46, r = 40;
    line(g, 16, 70, 8, 120, 5, P.bgNearD); line(g, 71, 70, 79, 120, 5, P.bgNearD); line(g, 43.5, 80, 43.5, 120, 5, P.bgNearD); line(g, 10, 104, 78, 104, 2, P.bgNearD);
    g.map((x, y) => { const d = Math.hypot(x - cx, y - cy); if (d > r) return undefined; const lvl = cy + 6 + 5 * Math.sin(TAU * t + x * 0.08); return d > r - 3 ? P.bgFarL : y > lvl ? (y < lvl + 2 ? P.bgWaterL : P.bgWater) : (x - cx + 14) ** 2 + (y - cy + 14) ** 2 > 1500 ? P.bgMidD : P.bgMid; });
    g.disc(cx - 16, cy - 18, 5, P.white).rect(40, 0, 7, 8, P.bgFar).rect(36, 0, 15, 3, P.bgFarL);
    const dy = 88 + ((t * 30) % 30); g.rect(43, dy, 2, 4, P.bgWaterL);
    return g.outline(P.bgNearD);
  },
  pipeworks(t) { // pipe run with liquid moving through it and a turning valve wheel
    const g = new Img(144, 72, S);
    for (const x of [14, 72, 128]) g.rect(x, 30, 8, 42, P.bgNearD).rect(x, 30, 2, 42, P.bgNear);
    for (const [y, dir] of [[10, 1], [30, -1]]) g.map((x, yy) => { if (yy < y || yy >= y + 12) return undefined; const k = Math.floor((x * dir - t * 16 + 1000) / 8) % 2; return yy < y + 2 ? P.bgFarL : yy >= y + 10 ? P.bgMidD : yy >= y + 4 && yy < y + 8 ? (k ? P.bgWater : P.bgWaterL) : P.bgMid; });
    for (const x of [40, 100]) g.rect(x, 7, 6, 18, P.bgFar).rect(x, 27, 6, 18, P.bgFar);
    cog(g, 72, 36, 11, 5, t * (TAU / 5), P.sun, P.sunL, P.bgNearD);
    return g.outline(P.bgNearD);
  },
};
export const FRAMES = 8;

// sky: floats in the air instead of standing on the ground. sink: how far the base goes into the ground (px).
const INFO = { balloon: { sky: true }, blimp: { sky: true }, hoop: { sky: true }, gear: { sink: 0 }, waterfall: { sink: 6 * S } };
export const PROP_SETS = {
  meadow: ['bigtree', 'bigtree', 'arch', 'totem', 'balloon', 'waterfall', 'orb', 'hoop', 'palm', 'ferris'],
  cavern: ['pylon', 'pylon', 'crystals', 'crystals', 'gear', 'column', 'ferris', 'orb', 'hoop', 'blimp'],
  dusk: ['palm', 'palm', 'totem', 'arch', 'blimp', 'balloon', 'ferris', 'column', 'gear', 'orb'],
  factory: ['cogs', 'pistons', 'boiler', 'stack', 'flywheel', 'tank', 'pipeworks', 'cogs', 'pistons', 'pylon', 'blimp'],
};

let cached = null;
export function buildProps() {
  if (cached) return cached;
  cached = {};
  for (const [name, paint] of Object.entries(PAINT)) { const img = paint(); cached[name] = { name, img, frames: [img], w: img.w, h: img.h, sky: false, sink: 3 * S, ...INFO[name] }; }
  for (const [name, paint] of Object.entries(ANIM)) { const frames = Array.from({ length: FRAMES }, (_, i) => paint(i / FRAMES)); cached[name] = { name, img: frames[0], frames, w: frames[0].w, h: frames[0].h, sky: false, sink: 3 * S }; }
  return cached;
}

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

// sky: floats in the air instead of standing on the ground. sink: how far the base goes into the ground (px).
const INFO = { balloon: { sky: true }, blimp: { sky: true }, hoop: { sky: true }, gear: { sink: 0 }, waterfall: { sink: 6 * S } };
export const PROP_SETS = {
  meadow: ['bigtree', 'bigtree', 'arch', 'totem', 'balloon', 'waterfall', 'orb', 'hoop', 'palm', 'ferris'],
  cavern: ['pylon', 'pylon', 'crystals', 'crystals', 'gear', 'column', 'ferris', 'orb', 'hoop', 'blimp'],
  dusk: ['palm', 'palm', 'totem', 'arch', 'blimp', 'balloon', 'ferris', 'column', 'gear', 'orb'],
};

let cached = null;
export function buildProps() {
  if (cached) return cached;
  cached = {};
  for (const [name, paint] of Object.entries(PAINT)) { const img = paint(); cached[name] = { name, img, w: img.w, h: img.h, sky: false, sink: 3 * S, ...INFO[name] }; }
  return cached;
}

// Hand-built tiles: blocks, pipes, pickups, decor and sprites. All original pixel art,
// drawn with code so the whole sheet can be re-coloured per theme.
import { Img } from './img.js';
import { P } from './palette.js';
import { TILE, S } from '../core/units.js';
import { soilAt } from './terrain.js';

// tiles are drawn on a 16-unit design grid and rasterised at S pixels per unit
const T = () => new Img(16, 16, S);

// glossy diagonal glint across the top-left of a panel
const shine = (t, x = 0, y = 0, n = 7) => t.poly([[x + 2, y + n], [x + n, y + 2], [x + n + 1.6, y + 2], [x + 2, y + n + 1.6]], P.white);
function brick() { // four bevelled glossy panels
  const t = T().rect(0, 0, 16, 16, P.ink);
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
    t.rect(x + 0.5, y + 0.5, 7, 7, P.brick).rect(x + 0.5, y + 0.5, 7, 1, P.brickL).rect(x + 0.5, y + 0.5, 1, 7, P.brickL).rect(x + 0.5, y + 6.5, 7, 1, P.brickD).rect(x + 6.5, y + 0.5, 1, 7, P.brickD);
    t.poly([[x + 2, y + 5], [x + 5, y + 2], [x + 5.8, y + 2], [x + 2, y + 5.8]], P.brickL);
  }
  return t;
}
function bevel(base, light, dark) { // chunky two-step bevel
  const t = T().rect(0, 0, 16, 16, P.ink).rect(1, 1, 14, 14, base);
  t.poly([[1, 1], [15, 1], [13, 3], [3, 3], [3, 13], [1, 15]], light).poly([[15, 15], [1, 15], [3, 13], [13, 13], [13, 3], [15, 1]], dark);
  return t;
}
function rivets(t, c) { for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) t.disc(x + 0.5, y + 0.5, 0.8, c); return t; }
function bonus() {
  const t = bevel(P.gold, P.goldL, P.goldD);
  t.map((x, y, c, i, j) => (c === P.gold && y > 8 && ((i >> 1) + (j >> 1)) % 2 === 0 ? P.orange : undefined)); // dithered lower half
  // regular five-point star: alternate outer and inner vertices every 36 degrees
  const star = (cx, cy, R) => Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.45 : R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  return t.poly(star(8, 8.6, 5), P.goldD).poly(star(7.5, 8.1, 5), P.white);
}
function used() { return rivets(bevel(P.wood, P.woodL, P.woodD), P.ink); }
function hard() {
  const t = bevel(P.stone, P.stoneL, P.stoneD);
  t.rect(5, 5, 6, 6, P.stoneD).rect(5.5, 5.5, 5, 5, P.steelL).poly([[5.5, 10.5], [10.5, 5.5], [10.5, 10.5]], P.stone);
  return shine(t, 2.5, 2.5, 3);
}
function pipe() { // 2x2 tiles: lip on top, repeatable body below
  const g = new Img(32, 32, S);
  const tube = (x, y, w, h) => {
    g.rect(x, y, w, h, P.ink).rect(x + 1, y, w - 2, h, P.pipe);
    g.rect(x + 3, y, 4, h, P.pipeL).rect(x + 4, y, 1.5, h, P.white).vline(x + 9, y, h, P.pipeL).rect(x + w - 9, y, 6, h, P.pipeD).rect(x + w - 5, y, 1, h, P.pipe); // chrome banding
  };
  tube(2, 14, 28, 18);
  g.hline(3, 14, 26, P.pipeD);
  tube(0, 0, 32, 14);
  g.hline(0, 0, 32, P.ink).hline(0, 13, 32, P.ink).hline(1, 1, 30, P.pipeL);
  return g;
}
function plank(l, r) { // thin jump-through platform
  const t = T().rect(0, 0, 16, 5, P.wood).hline(0, 0, 16, P.woodL).hline(0, 4, 16, P.ink).hline(0, 3, 16, P.woodD);
  t.vline(7, 1, 3, P.woodD);
  if (l) t.vline(0, 0, 5, P.ink).rect(2, 5, 2, 4, P.woodD);
  if (r) t.vline(15, 0, 5, P.ink).rect(12, 5, 2, 4, P.woodD);
  return t;
}
function bridge() {
  const t = T().rect(0, 0, 16, 6, P.wood).hline(0, 0, 16, P.woodL).hline(0, 5, 16, P.ink).hline(0, 4, 16, P.woodD);
  for (const x of [3, 7, 11, 15]) t.vline(x, 0, 5, P.woodD);
  return t;
}
function spikes() {
  const t = T();
  for (let s = 0; s < 4; s++) {
    const x = s * 4 - 0.5;
    t.poly([[x + 0.3, 15.5], [x + 2, 5.5], [x + 3.7, 15.5]], P.steel).poly([[x + 0.3, 15.5], [x + 2, 5.5], [x + 2, 15.5]], P.steelL);
  }
  return t.hline(0, 15, 16, P.steelD).outline(P.ink);
}
function spring() {
  const t = T().rect(2, 13, 12, 3, P.steelD).hline(2, 13, 12, P.steel);
  t.art(4, 8, ['.######.', '##....##', '.######.', '##....##', '.######.'], { '#': P.steelL });
  t.rect(1, 4, 14, 4, P.red).hline(1, 4, 14, P.yellow).hline(1, 7, 14, P.redD);
  return t.outline(P.ink);
}
function booster() { // points right; flipped for left
  const t = T().rect(0, 11, 16, 5, P.redD).hline(0, 11, 16, P.red).hline(0, 15, 16, P.ink);
  const chev = ['#..', '.#.', '..#', '.#.', '#..'];
  t.art(2, 11, chev, { '#': P.yellow }).art(3, 11, chev, { '#': P.yellow });
  t.art(8, 11, chev, { '#': P.yellow }).art(9, 11, chev, { '#': P.yellow });
  return t;
}
function gem() {
  const t = T();
  t.poly([[5.5, 1.5], [9.5, 1.5], [13.5, 5.5], [13.5, 7.5], [7.5, 13.8], [1.5, 7.5], [1.5, 5.5]], P.ink);
  t.poly([[6, 2.6], [9, 2.6], [12.4, 6], [12.4, 7.2], [7.5, 12.3], [2.6, 7.2], [2.6, 6]], P.gem);
  t.poly([[6, 2.6], [7.5, 2.6], [5.5, 7], [2.6, 7], [2.6, 6]], P.gemL);
  t.poly([[9.5, 7], [12.4, 7], [7.5, 12.3], [7.5, 10]], P.gemD);
  return t;
}
function goal() { // pole sits left of centre so the pennant fits in the same column
  const shaft = (t, y) => t.rect(4, y, 2, 16 - y, P.steel).vline(4, y, 16 - y, P.steelL).vline(3, y, 16 - y, P.ink).vline(6, y, 16 - y, P.ink);
  const pole = shaft(T(), 0);
  const top = shaft(T(), 8).disc(4.5, 5, 3.6, P.ink).disc(4.5, 5, 2.6, P.gold).set(4, 4, P.goldL);
  // banner: 2x2 tiles, swallow-tailed, hung from the top of the pole
  const flag = new Img(32, 32, S);
  flag.rect(4, 0, 2, 32, P.steel).vline(4, 0, 32, P.steelL).vline(3, 0, 32, P.ink).vline(6, 0, 32, P.ink);
  flag.poly([[6.5, 0.5], [31.5, 0.5], [25, 11.5], [31.5, 22.5], [6.5, 22.5]], P.ink);
  flag.poly([[7, 1.6], [29.4, 1.6], [23.6, 11.5], [7, 11.5]], P.red).poly([[7, 11.5], [23.6, 11.5], [29.4, 21.4], [7, 21.4]], P.redD);
  flag.rect(7, 1.6, 2, 19.8, P.yellow).disc(15.5, 11.5, 4.6, P.ink).disc(15.5, 11.5, 3.6, P.yellow).disc(14.5, 10.5, 1.2, P.white);
  return { pole, top, flag };
}
function cloud() {
  const g = new Img(48, 32, S);
  g.disc(12, 21, 8, P.white).disc(24, 14, 11, P.white).disc(36, 20, 9, P.white).rect(10, 20, 28, 9, P.white);
  return g.map((x, y, c, i, j) => (c && y > 22.5 && (y > 25.5 || ((i >> 1) + (j >> 1)) % 2) ? P.cloudD : undefined));
}
function bush() {
  const g = new Img(48, 16, S);
  g.disc(10, 16, 8, P.bush).disc(24, 14, 11, P.bush).disc(38, 16, 8, P.bush);
  g.disc(8, 13, 3, P.bushL).disc(21, 9, 4, P.bushL).disc(37, 13, 3, P.bushL);
  return g.map((x, y, c) => (c && y > 14.5 ? P.bushD : undefined)).outline(P.bushD);
}
function bgHill() {
  const g = new Img(80, 48, S);
  g.map((x, y) => { const top = 48 - 44 * Math.sin((Math.PI * (x + 0.5)) / 80) ** 0.7; return y + 0.5 < top ? undefined : y + 0.5 - top < 2 ? P.hillD : P.hill; });
  for (const [x, y] of [[30, 16], [46, 24], [24, 32], [56, 36], [40, 40]]) g.disc(x, y, 1.5, P.hillD);
  return g;
}
function hanging(seed) { // stalactites / roots that hang under a ceiling (decor only)
  const t = T(), spikes = [[[1, 9], [6, 5], [11, 12], [14.5, 4]], [[2.5, 6], [8, 14], [13, 8]], [[0.5, 4], [4.5, 11], [9.5, 6], [13.5, 10]]][seed];
  for (const [x, len] of spikes) {
    const w = 1.2 + len / 5;
    t.poly([[x - w, -1], [x + w, -1], [x + 0.3, len]], P.ceil).poly([[x - w, -1], [x - w + 1, -1], [x + 0.1, len - 1]], P.ceilL).poly([[x + w - 1, -1], [x + w, -1], [x + 0.3, len]], P.ceilD);
  }
  return t.rect(0, 0, 16, 1, P.ceilD);
}
// Bedrock: the soil texture shifted two shades darker, optionally with stones or ore in it.
const DARKER = { [P.dirt]: P.dirtD, [P.dirtL]: P.dirt, [P.dirtD]: P.dirtX, [P.dirtX]: P.dirtX };
function deep(kind) {
  const t = T().map((x, y, c, i, j) => {
    const soil = soilAt(i, j);
    if (kind === 'top') { const keep = y < 1.5 || (y < 4 && ((i >> 1) + (j >> 1)) % 2 === 0) || (y < 6.5 && (i >> 1) % 4 === 0 && (j >> 1) % 2 === 0); if (keep) return soil; }
    return DARKER[soil];
  });
  if (kind === 'stones') for (const [x, y, r] of [[4, 5, 2.6], [11, 10.5, 3.2], [5.5, 12.5, 1.6]]) t.disc(x, y, r, P.stoneD).disc(x - 0.3, y - 0.4, r - 0.8, P.stone).disc(x - r / 3, y - r / 3, r / 4, P.stoneL);
  if (kind === 'ore') for (const [x, y] of [[4, 4], [11, 6.5], [7, 12]]) t.poly([[x, y - 2.6], [x + 2.2, y], [x, y + 2.6], [x - 2.2, y]], P.gemD).poly([[x, y - 1.6], [x + 1.2, y], [x, y + 1.6], [x - 1.2, y]], P.gem).disc(x - 0.4, y - 0.5, 0.4, P.gemL);
  if (kind === 'fossil') { t.disc(8, 8, 4.4, P.stoneL).disc(8, 8, 3.2, DARKER[P.dirt]).disc(8.8, 8.4, 2.2, P.stoneL).disc(8.8, 8.4, 1.1, DARKER[P.dirt]).rect(8, 8, 5, 5, DARKER[P.dirt]).rect(11.4, 7.4, 1.2, 4, P.stoneL); }
  return t;
}
function flora() {
  const stem = (t, x, h) => t.rect(x, 16 - h, 1, h, P.bushD);
  const flower = (petal, core) => { const t = T(); stem(t, 7.5, 8).poly([[8, 13], [12, 10.5], [8.6, 12]], P.bush); for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; t.disc(7.5 + 3 * Math.cos(a), 6.5 + 3 * Math.sin(a), 2, petal); } return t.disc(7.5, 6.5, 1.6, core).outline(P.ink); };
  const tuft = T();
  for (const [x, h, lean] of [[2, 6, -2], [5, 9, -1], [8, 11, 0.5], [11, 8, 2], [14, 5, 2.5]]) tuft.poly([[x - 1.3, 16], [x + lean, 16 - h], [x + 1.3, 16]], P.grass).poly([[x - 1.3, 16], [x + lean, 16 - h], [x - 0.3, 16]], P.grassL);
  const shroom = T().rect(6.5, 9, 3, 7, P.white).rect(8.5, 9, 1, 7, P.cloudD).disc(7.5, 8, 6, P.red).map((x, y, c) => (c === P.red && y > 9.2 ? 0 : undefined));
  shroom.rect(6.5, 9.5, 3, 6.5, P.white).rect(8.5, 9.5, 1, 6.5, P.cloudD).disc(5, 5.5, 1.4, P.white).disc(9.5, 4, 1.1, P.white).disc(10.5, 7.5, 0.9, P.white).outline(P.ink);
  const crystal = T();
  for (const [x, h, w] of [[4, 8, 2.4], [8.5, 13, 3], [12.5, 6.5, 2]]) crystal.poly([[x - w, 16], [x - w, 16 - h + w], [x, 16 - h], [x + w, 16 - h + w], [x + w, 16]], P.gem).poly([[x - w, 16], [x - w, 16 - h + w], [x, 16 - h], [x - 0.3, 16]], P.gemL).poly([[x + w * 0.4, 16], [x + w, 16 - h + w], [x + w, 16]], P.gemD);
  crystal.outline(P.ink);
  const rock = T().disc(6, 14, 4.5, P.stone).disc(11, 14.5, 3.4, P.stone).disc(5, 12.5, 1.8, P.stoneL).map((x, y, c) => (c && y > 14.6 ? P.stoneD : undefined)).outline(P.ink);
  const sign = T().rect(7, 9, 2, 7, P.wood).rect(8, 9, 1, 7, P.woodD).rect(1.5, 1.5, 13, 8, P.ink).rect(2.5, 2.5, 11, 6, P.woodL).rect(2.5, 7.5, 11, 1, P.wood);
  sign.poly([[4, 4.4], [8.5, 4.4], [8.5, 2.6], [12.2, 5.5], [8.5, 8.4], [8.5, 6.6], [4, 6.6]], P.redD);
  return { flower_0: flower(P.red, P.yellow), flower_1: flower(P.white, P.orange), tuft, mushroom: shroom, crystal, rock, sign };
}
function checkpoint(on) {
  const t = T().rect(7, 6, 2, 10, P.steel).rect(7, 6, 1, 10, P.steelL).rect(5, 14, 6, 2, P.steelD);
  t.disc(7.5, 4.5, 4.2, on ? P.yellow : P.steelD).disc(6.5, 3.5, on ? 2 : 1.2, on ? P.white : P.steel);
  return t.outline(P.ink);
}
function flyer(up) {
  const t = T();
  for (const s of [-1, 1]) t.poly(up ? [[7.5 + s * 2, 8], [7.5 + s * 8, 1.5], [7.5 + s * 5, 9]] : [[7.5 + s * 2, 8], [7.5 + s * 8, 12], [7.5 + s * 4.5, 7]], P.foeL);
  t.disc(7.5, 9, 4.6, P.foe).disc(6.3, 7.6, 1.4, P.foeL).rect(5, 8, 2, 3, P.white).rect(9, 8, 2, 3, P.white).rect(6, 9, 1, 2, P.ink).rect(10, 9, 1, 2, P.ink).poly([[6.5, 12.6], [7.5, 14.6], [8.5, 12.6]], P.orange);
  return t.outline(P.ink);
}
function hero(roll) {
  const t = T().disc(7.5, 7.5, 7.6, P.ink).disc(7.5, 7.5, 6.5, P.hero);
  t.map((x, y, c) => (c === P.hero && (x - 4.5) ** 2 + (y - 4.5) ** 2 > 60 ? P.heroD : undefined)); // crescent shadow
  t.disc(5, 4.5, 1.6, P.heroL);
  if (roll) { t.rect(1, 7, 14, 2, P.heroL).rect(7, 1, 2, 14, P.heroL).set(7, 7, P.ink).set(8, 8, P.ink); }
  else { t.rect(8, 5, 2, 4, P.white).rect(12, 5, 2, 4, P.white).rect(9, 6, 1, 2, P.ink).rect(13, 6, 1, 2, P.ink); t.hline(9, 11, 4, P.heroD); }
  return t;
}
function walker(step) {
  const t = T().disc(7.5, 9, 6.4, P.foe);
  t.map((x, y, c) => (c && (y > 12.5 || y < 2.5) ? 0 : undefined));
  t.disc(5, 6, 1.5, P.foeL).hline(2, 12, 12, P.foeD);
  t.rect(4, 7, 3, 3, P.white).rect(9, 7, 3, 3, P.white).set(5, 8, P.ink).set(10, 8, P.ink).hline(3, 6, 4, P.foeD).hline(9, 6, 4, P.foeD);
  if (step) t.rect(2, 13, 4, 2, P.orange).rect(9, 13, 4, 2, P.orange); else t.rect(3, 13, 4, 2, P.orange).rect(10, 13, 4, 2, P.orange);
  return t.outline(P.ink);
}

const FULL = new Array(TILE).fill(0xffffffff);
const rows = (from, to) => FULL.map((_, y) => (y >= from * S && y < (to + 1) * S ? 0xffffffff : 0)); // rows on the design grid

// Returns [name, img, meta] triples in atlas order.
export function handTiles() {
  const out = [];
  const add = (name, img, meta) => out.push([name, img, meta]);
  const slice = (prefix, g, meta) => {
    for (let r = 0; r < g.h / TILE; r++) for (let c = 0; c < g.w / TILE; c++) add(`${prefix}_${c}_${r}`, g.sub(c * TILE, r * TILE, TILE, TILE), meta);
  };
  const block = (b) => ({ kind: 'block', block: b, mask: FULL });
  add('brick', brick(), block('brick'));
  add('bonus', bonus(), block('bonus'));
  add('used', used(), block('used'));
  add('hard', hard(), block('hard'));
  slice('pipe', pipe(), block('pipe'));
  add('bridge', bridge(), { kind: 'block', block: 'bridge', mask: rows(0, 5) });
  add('plank_l', plank(true, false), { kind: 'oneway', mask: rows(0, 4) });
  add('plank_m', plank(false, false), { kind: 'oneway', mask: rows(0, 4) });
  add('plank_r', plank(false, true), { kind: 'oneway', mask: rows(0, 4) });
  add('spikes', spikes(), { kind: 'hazard', mask: rows(8, 15) });
  add('spring', spring(), { kind: 'object' });
  const bo = booster();
  add('booster_r', bo, { kind: 'object' });
  add('booster_l', bo.flipX(), { kind: 'object' });
  add('gem', gem(), { kind: 'object' });
  const g = goal();
  add('goal_top', g.top, { kind: 'decor' }); add('goal_pole', g.pole, { kind: 'decor' });
  add('hero', hero(false), { kind: 'sprite' }); add('hero_roll', hero(true), { kind: 'sprite' });
  add('walker_0', walker(0), { kind: 'sprite' }); add('walker_1', walker(1), { kind: 'sprite' });
  slice('cloud', cloud(), { kind: 'decor' });
  slice('bush', bush(), { kind: 'decor' });
  slice('bghill', bgHill(), { kind: 'decor' });
  slice('goal_flag', g.flag, { kind: 'decor' }); // 2x2 banner
  for (let i = 0; i < 3; i++) add(`hang_${i}`, hanging(i), { kind: 'decor' });
  for (const k of ['top', 'plain', 'stones', 'ore', 'fossil']) add(`deep_${k}`, deep(k), { kind: 'ground', mask: FULL, ang: [null, null, null, null] });
  for (const [name, img] of Object.entries(flora())) add(name, img, { kind: 'decor' });
  add('check_off', checkpoint(false), { kind: 'object' }); add('check_on', checkpoint(true), { kind: 'object' });
  add('flyer_0', flyer(true), { kind: 'sprite' }); add('flyer_1', flyer(false), { kind: 'sprite' });
  return out;
}

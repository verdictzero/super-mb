// Hand-built tiles: blocks, pipes, pickups, decor and sprites. All original pixel art,
// drawn with code so the whole sheet can be re-coloured per theme.
import { Img } from './img.js';
import { P } from './palette.js';
import { TILE, S } from '../core/units.js';

// tiles are drawn on a 16-unit design grid and rasterised at S pixels per unit
const T = () => new Img(16, 16, S);

function brick() {
  const t = T().rect(0, 0, 16, 16, P.brick);
  for (let r = 0; r < 4; r++) {
    const y = r * 4;
    t.hline(0, y, 16, P.brickL).hline(0, y + 3, 16, P.brickD);
    for (const x of r % 2 ? [3, 11] : [7, 15]) t.vline(x, y, 4, P.brickD);
  }
  return t;
}
function bevel(base, light, dark) {
  const t = T().rect(0, 0, 16, 16, P.ink).rect(1, 1, 14, 14, base);
  t.hline(1, 1, 14, light).vline(1, 1, 14, light).hline(1, 14, 14, dark).vline(14, 1, 14, dark);
  return t;
}
function rivets(t, c) { for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) t.set(x, y, c); return t; }
function bonus() {
  const t = rivets(bevel(P.gold, P.goldL, P.goldD), P.goldD);
  // regular five-point star: alternate outer and inner vertices every 36 degrees
  const star = (cx, cy, R) => Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.45 : R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  return t.poly(star(8, 8.6, 5.3), P.goldD).poly(star(7.5, 8.1, 5.3), P.white);
}
function used() { return rivets(bevel(P.wood, P.woodL, P.woodD), P.ink); }
function hard() {
  const t = bevel(P.stone, P.stoneL, P.stoneD);
  t.rect(4, 4, 8, 8, P.stoneD).rect(5, 5, 7, 7, P.stoneL).rect(5, 5, 6, 6, P.stone);
  return t;
}
function pipe() { // 2x2 tiles: lip on top, repeatable body below
  const g = new Img(32, 32, S);
  const tube = (x, y, w, h) => {
    g.rect(x, y, w, h, P.ink).rect(x + 1, y, w - 2, h, P.pipe);
    g.rect(x + 3, y, 3, h, P.pipeL).vline(x + 8, y, h, P.pipeL).rect(x + w - 8, y, 5, h, P.pipeD);
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
  const flag = shaft(T(), 0);
  flag.poly([[6.5, 1.5], [15.5, 7], [6.5, 12.5]], P.ink).poly([[7, 2.6], [14, 7], [7, 7]], P.red).poly([[7, 7], [14, 7], [7, 11.4]], P.redD);
  flag.disc(9, 7, 1.2, P.yellow);
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
  add('goal_top', g.top, { kind: 'decor' }); add('goal_pole', g.pole, { kind: 'decor' }); add('goal_flag', g.flag, { kind: 'decor' });
  add('hero', hero(false), { kind: 'sprite' }); add('hero_roll', hero(true), { kind: 'sprite' });
  add('walker_0', walker(0), { kind: 'sprite' }); add('walker_1', walker(1), { kind: 'sprite' });
  slice('cloud', cloud(), { kind: 'decor' });
  slice('bush', bush(), { kind: 'decor' });
  slice('bghill', bgHill(), { kind: 'decor' });
  return out;
}

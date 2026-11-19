// Procedural level generator.
//
// 1. Pacing: the level is a chain of zones. Each zone is either a BLOCK zone (precise
//    platforming: block rows, pipes, pits, stairs) or a FLOW zone (momentum terrain:
//    boosters, rolling hills, quarter pipes, kickers, loops). `flow` sets the mix,
//    difficulty ramps with progress, and every third zone is a breather.
// 2. Grammar: a zone is filled by picking weighted pieces. Each piece is a small function
//    that drives the LevelBuilder cursor and must leave it on flat ground, so any piece
//    can follow any other. Pieces check their own preconditions (head room, how far the
//    ground may still rise or fall) and the picker steers height back toward the baseline.
//    Besides single obstacles there are layered pieces (upper decks, tunnels, bridges,
//    trenches) and combos (double loops, half-pipes, loop-into-kicker) so routes stack up.
// 3. Reachability rules come from the physics constants (RULES below): gaps, ledges and
//    pipes never exceed what a standing jump clears, and anything that needs speed
//    (loops, quarter pipes) gets a booster and run-up placed in front of it.
// 4. Validation: the finished level is played by the look-ahead bot. If it cannot reach
//    the goal, the generator retries with a derived seed, so a returned level with
//    meta.validated === true is known to be completable.
import { LevelBuilder } from './builder.js';
import { makeRng } from '../core/rng.js';
import { PHYS } from '../engine/sim.js';
import { TILE, S } from '../core/units.js';
import { playtest } from '../engine/bot.js';

const jumpPx = (PHYS.jump * PHYS.jump) / (2 * PHYS.grav);
const airFrames = (2 * PHYS.jump) / PHYS.grav;
export const RULES = {
  maxStepUp: Math.min(3, Math.floor((jumpPx - 8 * S) / TILE)),        // tiles a jump can climb
  maxPit: Math.floor((2.5 * S * airFrames) / TILE + 1e-6) - 2,               // pit a slow walking jump clears, with margin
  maxKickerGap: 9,                                              // boosted launch off a kicker
  loopHeadroom: { loop6: 8, loop10: 12, loop14: 16, loop18: 20 },                       // rows needed above the ground
};
const HEIGHT = 128, START = 74, TOP = 46, BOTTOM = HEIGHT - 28; // rows: level height, starting ground, limits for the main route
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- BLOCK pieces ----------------------------------------------------------------
const BLOCK = {
  stroll(b, r, d) { const n = r.int(4, 7); if (r.chance(d * 0.7)) { if (r.chance(0.4)) b.flyer(n - 2, 3); else b.enemy(n - 2); } if (r.chance(0.5)) b.gems(3, 1, 1); b.flat(n); },
  blockRow(b, r, d) {
    const n = r.int(3, 7);
    let row = ''; for (let i = 0; i < n; i++) row += r.chance(0.3) ? '?' : 'B';
    b.blocks(row, 4, 1);
    if (n >= 5 && r.chance(0.35)) b.blocks(r.chance(0.5) ? '?' : 'B?B', 8, 2);
    if (r.chance(0.3 + d * 0.5)) b.enemy(r.int(2, n));
    b.flat(n + 2);
  },
  pipes(b, r, d) {
    const k = r.int(1, 2 + Math.round(d));
    for (let i = 0; i < k; i++) { b.pipe(r.int(1, RULES.maxStepUp)); if (i < k - 1 && r.chance(d * 0.8)) b.enemy(2); b.flat(r.int(4, 6)); }
  },
  pit(b, r, d) { const w = r.int(2, 2 + Math.round(d * (RULES.maxPit - 2))); if (d > 0.45 && w >= 3 && r.chance(0.5)) b.flyer(w >> 1, 4); b.gems(w, 2, 0, 1.5).gap(w).flat(r.int(3, 5)); },
  stairPit(b, r, d) { const n = r.int(2, 4); b.stairs(n, 1).gap(r.int(2, 2 + Math.round(d * 2))).stairs(n, -1).flat(3); },
  ledgeUp(b, r) { const h = r.int(1, Math.min(2, RULES.maxStepUp)); if (b.g - h < b.gMin) return false; b.flat(2).step(-h).gems(2, 1, 1).flat(r.int(4, 6)); },
  ledgeDown(b, r) { const h = r.int(1, 3); if (b.g + h > b.gMax) return false; b.flat(2).step(h).flat(r.int(4, 6)); },
  spikes(b, r, d) { if (d < 0.25) return false; const n = d > 0.7 ? 2 : 1; b.flat(3).spikes(n).flat(n + 4); },
  plankPit(b, r, d) { if (d < 0.35) return false; b.blocks('___', 0, 3).gems(3, 2, 3).gap(9).flat(4); },
  // --- factory only (see FACTORY_W) ---
  conveyor(b, r, d) { const n = r.int(6, 10), dir = r.chance(0.65) ? 1 : -1; b.flat(2).gems(n - 2, 1, 1); if (r.chance(d * 0.5)) b.flyer(n >> 1, 3); b.belt(n, dir).flat(2); },
  acidVat(b, r, d) { const n = r.int(2, 2 + Math.round(d * 2)); b.flat(3).gems(n, 2, 0, 1.5).acid(n).flat(3); },
  beltVat(b, r, d) { const n = r.int(2, 3); b.flat(2).belt(4, 1).gems(n, 2, 0, 1.5).acid(n).belt(4, 1).flat(2); }, // conveyors feeding an acid vat
  press(b, r, d) { // corridor of presses: stay on the floor and they miss you
    const n = r.int(8, 12);
    if (b.g - 7 < b.gMin - 4) return false;
    b.flat(2).overhang(n, 4, 2).gems(n - 2, 1, 1);
    for (let k = 1; k + 2 < n; k += r.int(3, 4)) b.crusher(k, 4, r.int(0, 159));
    b.flat(n + 2);
  },
  ventShelf(b, r) { // ride a steam vent up to a ledge
    const h = r.int(4, 6); if (b.g - h < b.gMin) return false;
    b.vent(2, r.int(0, 139)).flat(3).step(-h).gems(3, 1, 1).flat(r.int(9, 11));
  },
  // --- layered and combined pieces ---
  upperDeck(b, r, d) { // plank steps up to a floating deck with its own pickups, hazards below
    const L = r.int(6, 10);
    b.blocks('___', 3, 1).island(L, 6, 5).gems(L - 2, 7, 6);
    if (r.chance(0.6)) b.blocks(r.chance(0.5) ? '?' : 'B?B', 10, 5 + (L >> 1) - 1);
    if (r.chance(d)) b.obj('walker', 5 + L - 2, 7);
    b.flat(6);
    if (r.chance(0.3 + d * 0.5)) b.enemy(1);
    if (d > 0.3 && r.chance(0.6)) b.gap(r.int(2, 3)); else b.flat(2);
    b.flat(L + 1);
  },
  brickTiers(b, r, d) { // staggered rows of blocks climbing away from the ground
    b.blocks(r.chance(0.5) ? 'BB?B' : 'B?BB', 4, 1).blocks(r.chance(0.5) ? '?BB' : 'BB?', 8, 4).gems(3, 9, 4);
    if (r.chance(0.5)) b.blocks('B?', 12, 8);
    if (r.chance(0.3 + d * 0.5)) b.enemy(r.int(3, 8));
    b.flat(12);
  },
  towers(b, r, d) { // block columns of mixed heights, some with pits between
    const k = r.int(3, 4);
    b.flat(1);
    for (let i = 0; i < k; i++) {
      b.column(r.int(1, RULES.maxStepUp));
      if (i < k - 1) { if (r.chance(0.25 + d * 0.5)) b.gap(2); else b.flat(r.int(2, 3)); }
    }
    b.flat(3);
  },
  pipePit(b, r, d) { b.pipe(r.int(1, 2)).gap(r.int(2, 2 + Math.round(d))).pipe(r.int(1, RULES.maxStepUp)).flat(4); },
  bridge(b, r, d) { // plank bridge over a long pit
    const w = r.int(4, 8);
    b.flat(2).blocks('='.repeat(w), 0).gems(w - 2, 1, 1);
    if (r.chance(d * 0.8)) b.enemy(w - 2);
    b.gap(w).flat(3);
  },
  tunnel(b, r, d) { // low ceiling: no room for a full jump
    const n = r.int(7, 11);
    if (b.g - 7 < b.ceiling + 1) return false;
    b.flat(2).overhang(n, 3, 3).gems(n - 2, 1, 1);
    if (r.chance(0.3 + d * 0.5)) b.enemy(n - 2);
    if (d > 0.5 && r.chance(0.5)) b.spikes(1, n >> 1);
    b.flat(n + 2);
  },
  spikeTrench(b, r, d) { // sunken spike floor crossed on planks
    if (d < 0.35 || b.g + 2 > b.gMax) return false;
    const n = r.int(4, 5);
    b.flat(2).step(2).spikes(n).blocks('__', 2, 1 + ((n - 2) >> 1)).flat(n).step(-2).flat(3);
  },
  springShelf(b, r) {
    const h = r.int(4, 6); if (b.g - h < b.gMin) return false;
    b.spring(2).flat(3).step(-h).gems(3, 1, 1).flat(r.int(12, 14)); // long shelf: the spring arc lands on it
  },
};
// ---- FLOW pieces -----------------------------------------------------------------
const run = (b, n = 5) => b.flat(1).runUp(n); // boosters + run-up
const FLOW = {
  rollers(b, r) {
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) {
      const name = r.pick(['hump', 'dip', 'hump', 'dip', b.g > b.base ? 'roll_up' : 'roll_down']);
      const p = b.ts.prefabs[name];
      if (b.g + p.dy < b.gMin || b.g + p.dy > b.gMax) continue;
      b.piece(name).gemsOnLast().flat(r.int(1, 3));
    }
    b.flat(2);
  },
  hill(b, r) {
    const kind = r.pick(['ramp22', 'ramp22', 'ramp45']), n = kind === 'ramp45' ? r.int(1, 3) : r.int(1, 2);
    if (b.g - n < b.gMin) return false;
    b.piece(`${kind}_up_${n}`).gems(3, 2, 1).flat(r.int(4, 7)).piece(`${kind}_down_${n}`).flat(3);
  },
  loop(b, r, d) {
    const name = r.chance(0.45 + d * 0.2) ? 'loop10' : 'loop6';
    if (b.g - RULES.loopHeadroom[name] < b.ceiling + 1) return false;
    run(b, 6).piece(name).gemsInLoop(name === 'loop10' ? 10 : 6).flat(r.int(4, 6));
  },
  kicker(b, r, d) {
    const w = r.int(4, 5 + Math.round(d * (RULES.maxKickerGap - 5))), drop = r.int(0, 2);
    if (b.g + drop > b.gMax) return false;
    run(b, 5).piece('kicker').gems(w, 3, 0, 2).gap(w).step(drop).flat(r.int(6, 8));
  },
  quarterPipe(b, r) { if (b.g - 3 < b.gMin) return false; run(b, 5).piece('qp_up').gems(3, 2, 1).flat(r.int(11, 13)); /* runway: the wall launches you a long way */ },
  sDrop(b, r) { if (b.g + 4 > b.gMax) return false; b.flat(3).piece('sdrop').gemsOnLast().gems(4, 1, 1).flat(r.int(6, 8)); },
  dropIn(b, r) { if (b.g + 3 > b.gMax) return false; b.flat(3).piece('qp_down').gems(4, 1, 1).flat(r.int(5, 7)); },
  // --- combos ---
  doubleLoop(b, r) {
    if (b.g - RULES.loopHeadroom.loop10 < b.ceiling + 1) return false;
    run(b, 6).piece('loop6').gemsInLoop(6).flat(2).runUp(4).piece('loop10').gemsInLoop(10).flat(r.int(4, 6));
  },
  halfPipe(b, r) { // drop in, cross the floor, launch off the far wall
    if (b.g + 3 > b.gMax) return false;
    b.flat(3).piece('qp_down').gems(3, 1, 1).runUp(r.int(5, 7)).piece('qp_up').gems(3, 2, 1).flat(r.int(11, 13));
  },
  wave(b, r) { // back-to-back humps and dips, no flats to settle on
    const k = r.int(3, 4), first = r.chance(0.5);
    run(b, 4);
    for (let i = 0; i < k; i++) b.piece((i % 2 === 0) === first ? 'hump' : 'dip').gemsOnLast();
    b.flat(3);
  },
  loopKicker(b, r, d) { // loop straight into a launch
    if (b.g - RULES.loopHeadroom.loop6 < b.ceiling + 1) return false;
    const w = r.int(5, 6 + Math.round(d * 3));
    run(b, 6).piece('loop6').gemsInLoop(6).flat(2).runUp(4).piece('kicker').gems(w, 3, 0, 2).gap(w).flat(r.int(7, 9));
  },
  rampJump(b, r, d) { // run up a ramp and leap from the high ledge
    if (b.g - 2 < b.gMin) return false;
    const w = r.int(3, 4 + Math.round(d * 2));
    b.piece('ramp45_up_2').flat(3).gems(w, 2, 0, 1.5).gap(w).step(2).flat(r.int(5, 7));
  },
  skyway(b, r, d) { // boosted straight with a gem-lined deck overhead
    const n = r.int(9, 13);
    run(b, 4);
    b.island(n - 4, 5, 2, 1).gems(n - 5, 6, 2).gems(n - 2, 1, 1);
    if (r.chance(d * 0.5)) b.spikes(1, n - 2);
    b.flat(n);
  },
  speedway(b, r, d) { run(b, 4); const n = r.int(6, 10); b.gems(n - 2, 1, 1); if (r.chance(d * 0.5)) b.spikes(1, n - 2); b.flat(n); },
};
// how each piece moves the ground: used to steer back toward the baseline height
const RISES = new Set(['ledgeUp', 'springShelf', 'quarterPipe']);
const FALLS = new Set(['ledgeDown', 'sDrop', 'dropIn', 'kicker']);

function fillZone(b, rng, table, weights, d, end) {
  let guard = 0;
  while (b.x < end && guard++ < 40) {
    const drift = b.g - b.base; // >0: ground is low, prefer rising pieces
    const all = b.theme === 'factory' && FACTORY_W.has(table) ? { ...weights, ...FACTORY_W.get(table) } : weights;
    const name = rng.weighted(Object.entries(all).map(([n, w]) => [w * (RISES.has(n) ? clamp(1 + drift / 2, 0.1, 4) : FALLS.has(n) ? clamp(1 - drift / 2, 0.1, 4) : 1), n]));
    const x0 = b.x;
    if (table[name](b, rng, d) === false) continue;
    b.log.push({ piece: name, x: x0 });
  }
}

// ---- vertical structure -------------------------------------------------------------
// Small pieces for upper tiers: nothing that changes height, nothing long.
const UPPER = {
  stroll: BLOCK.stroll, blockRow: BLOCK.blockRow, pit: BLOCK.pit, bridge: BLOCK.bridge,
  hump(b) { b.piece('hump').gemsOnLast().flat(2); },
  dip(b) { b.piece('dip').gemsOnLast().flat(2); },
  dash(b, r) { const n = r.int(6, 9); b.booster(0).gems(n - 2, 1, 1).flat(n); },
  loop(b) { if (b.g - RULES.loopHeadroom.loop6 < 3) return false; b.flat(1).runUp(5).piece('loop6').gemsInLoop(6).flat(4); },
};
// Ways up: each climbs several rows and ends on flat ground.
const ASCENT = {
  springTower(b, r) { // spring from shelf to shelf
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) { const h = r.int(5, 7); if (b.g - h < b.gMin) break; b.spring(2).flat(3).step(-h).gems(3, 1, 1).flat(r.int(7, 9)); }
    b.flat(6);
  },
  wallLaunch(b, r) { // quarter pipe at the foot of a tall wall: speed carries you up and over
    const h = r.int(5, 8);
    if (b.g - h - 3 < b.gMin) return false;
    run(b, 6).piece('qp_up').flat(1);
    for (let k = 1; k <= h; k += 2) b.obj('gem', 0, k + 1);
    b.step(-h).gems(3, 1, 1).flat(r.int(11, 13));
  },
  bigStairs(b, r, d) { // broad terraces
    const n = r.int(3, 5);
    for (let i = 0; i < n; i++) { const h = r.int(2, 3); if (b.g - h < b.gMin) break; if (r.chance(d * 0.6)) b.enemy(2); b.flat(r.int(4, 6)).step(-h).gems(2, 1, 1); }
    b.flat(5);
  },
};
// Ways down.
const DESCENT = {
  plunge(b, r) { // straight drop off a cliff, gems marking the fall line
    const n = r.int(10, 18);
    if (b.g + n > b.gMax) return false;
    b.flat(3);
    for (let k = 2; k < n; k += 2) b.obj('gem', 2, -k);
    b.step(n).flat(r.int(11, 14));
  },
  cascade(b, r, d) { // run of ledges, each a few rows lower
    const n = r.int(3, 5);
    for (let i = 0; i < n; i++) { const h = r.int(3, 5); if (b.g + h > b.gMax) break; if (r.chance(d * 0.6)) b.enemy(3); b.flat(r.int(5, 7)).step(h); }
    b.flat(5);
  },
  slalom(b, r) { // back-to-back S-drops into a quarter-pipe landing: 11 rows down, arriving fast
    if (b.g + 11 > b.gMax) return false;
    b.flat(3).piece('sdrop').gemsOnLast().flat(2).piece('sdrop').gemsOnLast().flat(2).piece('qp_down').gems(5, 1, 1).flat(r.int(8, 10));
  },
};
function tallLoop(b, r) {
  const name = b.g - RULES.loopHeadroom.loop18 >= 3 && r.chance(0.5) ? 'loop18' : 'loop14';
  if (b.g - RULES.loopHeadroom[name] < 3) return false;
  run(b, 8).piece(name).gemsInLoop(name === 'loop18' ? 18 : 14).flat(r.int(5, 8));
}

const FLOW_W = (d) => ({ rollers: 2, hill: 1.5, loop: 2, kicker: 1.2 + d, quarterPipe: 1, sDrop: 1.2, dropIn: 0.6, speedway: 0.8, doubleLoop: 1 + d, halfPipe: 1.5, wave: 1.5, loopKicker: 1 + d, rampJump: 1.2, skyway: 1.5 });
const BLOCK_W = (d) => ({ stroll: 0.8, blockRow: 1.5, pipes: 1.5, pit: 1 + d, stairPit: 1 + d, ledgeUp: 1.2, ledgeDown: 1.2, spikes: d, plankPit: 1.5 * d, springShelf: 0.8, upperDeck: 2.5, brickTiers: 1.5, towers: 1.5, pipePit: 1 + d, bridge: 1.5, tunnel: 1.5, spikeTrench: 1.5 * d });
// extra weights when the theme is the factory
const FACTORY_W = new Map();
const UPPER_W = { stroll: 1, blockRow: 2, pit: 2, bridge: 1.5, hump: 1.5, dip: 1.5, dash: 1.5, loop: 1 };
// The basement only gets pieces that cannot kill you by falling and fit under a low roof.
const UNDER = { stroll: BLOCK.stroll, hump: UPPER.hump, dip: UPPER.dip, dash: UPPER.dash, lowBlocks(b, r) { const n = r.int(3, 5); b.blocks('B?B?B'.slice(0, n), 4, 1).gems(n, 1, 1).flat(n + 2); }, hop(b) { b.flat(3).spikes(1).flat(4); } };
const UNDER_W = { stroll: 1.5, hump: 1, dip: 1, dash: 1.5, lowBlocks: 2, hop: 1 };
UPPER.conveyor = BLOCK.conveyor; UPPER.acidVat = BLOCK.acidVat; UNDER.conveyor = BLOCK.conveyor;
FACTORY_W.set(BLOCK, { conveyor: 2.5, acidVat: 2, beltVat: 1.5, press: 2.5, ventShelf: 1.5 }).set(UPPER, { conveyor: 2.5, acidVat: 2 }).set(UNDER, { conveyor: 2.5 });
const SLAB = 7, DECK = 3, BASEMENT = 18; // ground thickness under the main route / under upper tiers; rows from main route down to the basement floor

// Tiers and basements attach at "pads": clean ten-tile flats the main route leaves for them.
const pad = (b) => { const p = { x: b.x + 3, g: b.g }; b.flat(10); return p; };

// A tier above the stretch that starts at a pad. It sits above whatever the route below it
// builds (so it clears loops and block towers), starts with a hanging wall, and is reached by a
// spring beside that wall: the spring sends you straight up, the wall keeps you from drifting
// under the deck, and you step off at the top. Falling off the end or through one of its pits
// drops you back to the route below. Tiers leave pads of their own, so tiers stack on tiers.
function tier(b, rng, o, d, from, x1, level) {
  const { x, g: lg } = from, MARGIN = 16;
  const want = Math.min(x1 - x - 4, rng.int(40, 76));
  if (want < 34 || b.skyline(x - 2, x + 4) < lg) return; // nothing may hang over the pad: the launch needs open sky
  const u = Math.min(lg - 9, b.skyline(x + 2, x + 6 + want) - DECK - 3);
  if (u < 8) return;
  b.at(x, lg).springFor(0, lg - u);
  b.objects[b.objects.length - 1].lift = true;
  for (const cx of [x + 2, x + 3]) b.wall(cx, u, lg - 6); // hanging wall: guides the launch, leaves head room below
  b.at(x + 2, u); b.depth = DECK; b.base = u; b.gMin = u; b.gMax = u;
  b.gems(3, 1, 1).flat(5);
  const stop = x + 2 + want - MARGIN, pads = [];
  while (b.x < stop) {
    if (pads.length < 2 && stop - b.x > 34 && b.x - x > 10) pads.push(pad(b));
    fillZone(b, rng, UPPER, UPPER_W, d * 0.8, Math.min(stop, b.x + 22));
  }
  b.flat(2);
  const end = b.x;
  b.log.push({ piece: `tier${level + 2}`, x: x + 2 });
  if (level < 2) for (const p of pads) if (rng.chance(0.3 + 0.6 * o.vertical)) tier(b, rng, o, d, p, end - 2, level + 1);
}

// A basement under the main route between two pads: an enclosed lower route. You get in through
// a drop shaft (or any pit of the route above, which stops being lethal) and out through a
// spring well at the far end.
function basement(b, rng, o, d, entry, exit, g) {
  if (exit.x - entry.x < 40) return false;
  const floor = g + BASEMENT, xa = entry.x, xs = exit.x;
  b.at(xa - 4, floor); b.depth = 5; b.base = floor; b.gMin = floor; b.gMax = floor;
  b.flat(10);
  fillZone(b, rng, UNDER, UNDER_W, d * 0.7, xs - 4);
  while (b.x < xs + 5) b.flat(1);
  for (let k = 0; k < 2; k++) { b.wallUp(xa - 4 - k, floor - 1, g - 4); b.wallUp(xs + 3 + k, floor - 1, g - 4); } // end walls up to the ground above
  b.carve(xa, xa + 2, entry.g - 1, floor - 1);                  // drop shaft
  for (let k = 2; k < floor - entry.g; k += 3) b.objects.push({ type: 'gem', x: (xa + 1) * TILE, y: (entry.g + k) * TILE, w: TILE, h: TILE });
  b.carve(xs - 1, xs + 2, exit.g - 1, floor - 1);               // spring well back up
  for (const dx of [0, 1]) b.at(xs + 1, floor).springFor(dx, floor - exit.g + 3); // springs against the far wall, set in from the near edge so the launch is always inside the well
  b.log.push({ piece: 'basement', x: xa - 4 });
}

// A plateau: a stretch of the main route at roughly one height, with tiers stacked above it
// and sometimes a basement below.
function plateau(b, rng, o, d) {
  const g = b.g, pads = [];
  b.depth = SLAB; b.base = g; b.gMin = Math.max(TOP, g - 3); b.gMax = Math.min(BOTTOM, g + 3);
  const end = Math.min(o.length - 24, b.x + rng.int(60, 96));
  while (b.x < end) {
    pads.push(pad(b));
    const zoneEnd = Math.min(end, b.x + rng.int(22, 34));
    if (rng.chance(o.flow)) fillZone(b, rng, FLOW, FLOW_W(d), d, zoneEnd); else fillZone(b, rng, BLOCK, BLOCK_W(d), d, zoneEnd);
  }
  pads.push(pad(b));
  const x1 = b.x, gEnd = b.g;
  if (o.vertical > 0) {
    let lifts = pads.slice(0, -1);
    if (pads.length >= 3 && rng.chance(0.3 + 0.5 * o.vertical) && basement(b, rng, o, d, pads[0], pads[pads.length - 1], g) !== false) lifts = pads.slice(1, -1);
    for (const p of lifts) if (rng.chance(0.5 + 0.5 * o.vertical)) tier(b, rng, o, d, p, x1 - 2, 0);
  }
  b.at(x1, gEnd); b.depth = SLAB; b.base = gEnd;
}

function build(ts, seed, o) {
  const rng = makeRng(seed);
  const theme = o.theme || rng.pick(['meadow', 'cavern', 'dusk', 'factory']);
  const b = new LevelBuilder(ts, { name: `Seed ${o.seed}`, theme, height: HEIGHT, ground: START });
  b.log = []; b.depth = SLAB;
  b.flat(9);
  for (let sector = 0; b.x < o.length - 30; sector++) {
    const d = clamp(o.difficulty * (0.5 + 0.7 * (b.x / o.length)) * (sector % 3 === 2 ? 0.6 : 1), 0, 1);
    plateau(b, rng, o, d);
    if (b.x >= o.length - 30 || o.vertical <= 0) continue;
    // connector: change height by a lot, steering away from the top and bottom of the level
    b.gMin = TOP; b.gMax = BOTTOM; b.depth = SLAB;
    b.checkpoint(1).flat(3);
    const up = b.g > 74 ? true : b.g < 44 ? false : rng.chance(0.5);
    const table = up ? ASCENT : DESCENT, moves = 1 + (rng.chance(o.vertical) ? 1 : 0);
    for (let i = 0, guard = 0; i < moves && guard < 8; guard++) {
      const name = rng.pick(Object.keys(table)), x0 = b.x;
      if (table[name](b, rng, d) === false) continue;
      b.log.push({ piece: name, x: x0 }); i++;
    }
    if (rng.chance(0.35 + 0.4 * o.vertical)) { const x0 = b.x; if (tallLoop(b, rng) !== false) b.log.push({ piece: 'tallLoop', x: x0 }); }
  }
  b.depth = SLAB;
  b.flat(3).stairs(rng.int(3, 4), 1).flat(1).goal();
  b.decorate(rng);
  const level = b.finish();
  level.meta = { pieces: b.log };
  return level;
}

export function generateLevel(ts, opts = {}) {
  const o = { seed: 1, length: 360, difficulty: 0.5, flow: 0.5, vertical: 0.7, theme: null, validate: true, attempts: 8, ...opts };
  let level, test = null;
  for (let attempt = 0; attempt < o.attempts; attempt++) {
    level = build(ts, (o.seed * 2654435761 + attempt * 97) >>> 0, o);
    if (!o.validate) { attempt = o.attempts; break; }
    // two runs: one taking every lift to the upper tiers, one ignoring them and staying low
    test = playtest(ts, level);
    const low = test.ok ? playtest(ts, level, { noLifts: true }) : test;
    Object.assign(level.meta, { attempt, validated: test.ok && low.ok, botFrames: test.frames });
    test = { ok: test.ok && low.ok };
    if (test.ok) break;
  }
  Object.assign(level.meta, { seed: o.seed, length: o.length, difficulty: o.difficulty, flow: o.flow, vertical: o.vertical });
  return level;
}

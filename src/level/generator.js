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
// 3. Reachability rules come from the physics constants (RULES below): gaps, ledges and
//    pipes never exceed what a standing jump clears, and anything that needs speed
//    (loops, quarter pipes) gets a booster and run-up placed in front of it.
// 4. Validation: the finished level is played by the look-ahead bot. If it cannot reach
//    the goal, the generator retries with a derived seed, so a returned level with
//    meta.validated === true is known to be completable.
import { LevelBuilder } from './builder.js';
import { makeRng } from '../core/rng.js';
import { PHYS } from '../engine/sim.js';
import { playtest } from '../engine/bot.js';

const jumpPx = (PHYS.jump * PHYS.jump) / (2 * PHYS.grav);
const airFrames = (2 * PHYS.jump) / PHYS.grav;
export const RULES = {
  maxStepUp: Math.min(3, Math.floor((jumpPx - 8) / 16)),        // tiles a jump can climb
  maxPit: Math.floor((2.5 * airFrames) / 16) - 2,               // pit a slow walking jump clears, with margin
  maxKickerGap: 9,                                              // boosted launch off a kicker
  loopHeadroom: { loop6: 8, loop10: 12 },                       // rows needed above the ground
};
const HEIGHT = 30, BASE = 22, G_MIN = 15, G_MAX = 26;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- BLOCK pieces ----------------------------------------------------------------
const BLOCK = {
  stroll(b, r, d) { const n = r.int(4, 7); if (r.chance(d * 0.7)) b.enemy(n - 2); if (r.chance(0.5)) b.gems(3, 1, 1); b.flat(n); },
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
  pit(b, r, d) { const w = r.int(2, 2 + Math.round(d * (RULES.maxPit - 2))); b.gems(w, 2, 0, 1.5).gap(w).flat(r.int(3, 5)); },
  stairPit(b, r, d) { const n = r.int(2, 4); b.stairs(n, 1).gap(r.int(2, 2 + Math.round(d * 2))).stairs(n, -1).flat(3); },
  ledgeUp(b, r) { const h = r.int(1, Math.min(2, RULES.maxStepUp)); if (b.g - h < G_MIN) return false; b.flat(2).step(-h).gems(2, 1, 1).flat(r.int(4, 6)); },
  ledgeDown(b, r) { const h = r.int(1, 3); if (b.g + h > G_MAX) return false; b.flat(2).step(h).flat(r.int(4, 6)); },
  spikes(b, r, d) { if (d < 0.25) return false; const n = d > 0.7 ? 2 : 1; b.flat(3).spikes(n).flat(n + 4); },
  plankPit(b, r, d) { if (d < 0.35) return false; b.blocks('___', 0, 3).gems(3, 2, 3).gap(9).flat(4); },
  springShelf(b, r) {
    const h = r.int(4, 6); if (b.g - h < G_MIN) return false;
    b.spring(2).flat(3).step(-h).gems(3, 1, 1).flat(r.int(12, 14)); // long shelf: the spring arc lands on it
  },
};
// ---- FLOW pieces -----------------------------------------------------------------
const run = (b, n = 5) => b.flat(1).runUp(n); // boosters + run-up
const FLOW = {
  rollers(b, r) {
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) {
      const name = r.pick(['hump', 'dip', 'hump', 'dip', b.g > BASE ? 'roll_up' : 'roll_down']);
      const p = b.ts.prefabs[name];
      if (b.g + p.dy < G_MIN || b.g + p.dy > G_MAX) continue;
      b.piece(name).gemsOnLast().flat(r.int(1, 3));
    }
    b.flat(2);
  },
  hill(b, r) {
    const kind = r.pick(['ramp22', 'ramp22', 'ramp45']), n = kind === 'ramp45' ? r.int(1, 3) : r.int(1, 2);
    if (b.g - n < G_MIN) return false;
    b.piece(`${kind}_up_${n}`).gems(3, 2, 1).flat(r.int(4, 7)).piece(`${kind}_down_${n}`).flat(3);
  },
  loop(b, r, d) {
    const name = r.chance(0.45 + d * 0.2) ? 'loop10' : 'loop6';
    if (b.g - RULES.loopHeadroom[name] < b.ceiling + 1) return false;
    run(b, 6).piece(name).gemsInLoop(name === 'loop10' ? 10 : 6).flat(r.int(4, 6));
  },
  kicker(b, r, d) {
    const w = r.int(4, 5 + Math.round(d * (RULES.maxKickerGap - 5))), drop = r.int(0, 2);
    if (b.g + drop > G_MAX) return false;
    run(b, 5).piece('kicker').gems(w, 3, 0, 2).gap(w).step(drop).flat(r.int(6, 8));
  },
  quarterPipe(b, r) { if (b.g - 3 < G_MIN) return false; run(b, 5).piece('qp_up').gems(3, 2, 1).flat(r.int(11, 13)); /* runway: the wall launches you a long way */ },
  sDrop(b, r) { if (b.g + 4 > G_MAX) return false; b.flat(3).piece('sdrop').gemsOnLast().gems(4, 1, 1).flat(r.int(6, 8)); },
  dropIn(b, r) { if (b.g + 3 > G_MAX) return false; b.flat(3).piece('qp_down').gems(4, 1, 1).flat(r.int(5, 7)); },
  speedway(b, r, d) { run(b, 4); const n = r.int(6, 10); b.gems(n - 2, 1, 1); if (r.chance(d * 0.5)) b.spikes(1, n - 2); b.flat(n); },
};
// how each piece moves the ground: used to steer back toward the baseline height
const RISES = new Set(['ledgeUp', 'springShelf', 'quarterPipe']);
const FALLS = new Set(['ledgeDown', 'sDrop', 'dropIn', 'kicker']);

function fillZone(b, rng, table, weights, d, end) {
  let guard = 0;
  while (b.x < end && guard++ < 40) {
    const drift = b.g - BASE; // >0: ground is low, prefer rising pieces
    const name = rng.weighted(Object.entries(weights).map(([n, w]) => [w * (RISES.has(n) ? clamp(1 + drift / 2, 0.1, 4) : FALLS.has(n) ? clamp(1 - drift / 2, 0.1, 4) : 1), n]));
    const x0 = b.x;
    if (table[name](b, rng, d) === false) continue;
    b.log.push({ piece: name, x: x0 });
  }
}

function build(ts, seed, o) {
  const rng = makeRng(seed);
  const theme = o.theme || rng.pick(['meadow', 'cavern', 'dusk']);
  const b = new LevelBuilder(ts, { name: `Seed ${o.seed}`, theme, height: HEIGHT, ground: BASE, ceiling: theme === 'cavern' ? 2 : 0 });
  b.log = [];
  b.flat(9);
  for (let zone = 0; b.x < o.length - 20; zone++) {
    const progress = b.x / o.length;
    const d = clamp(o.difficulty * (0.5 + 0.7 * progress) * (zone % 3 === 2 ? 0.5 : 1), 0, 1);
    const end = Math.min(o.length - 20, b.x + rng.int(26, 44));
    if (rng.chance(o.flow)) {
      fillZone(b, rng, FLOW, { rollers: 3, hill: 2, loop: 2.5, kicker: 1.5 + d, quarterPipe: 1.2, sDrop: 1.2, dropIn: 0.8, speedway: 1.5 }, d, end);
    } else {
      fillZone(b, rng, BLOCK, { stroll: 1.5, blockRow: 3, pipes: 2.5, pit: 1.5 + 2 * d, stairPit: 1 + d, ledgeUp: 1.2, ledgeDown: 1.2, spikes: 1.5 * d, plankPit: 1.5 * d, springShelf: 0.8 }, d, end);
    }
  }
  b.flat(3).stairs(rng.int(3, 4), 1).flat(1).goal();
  b.decorate(rng);
  const level = b.finish();
  level.meta = { pieces: b.log };
  return level;
}

export function generateLevel(ts, opts = {}) {
  const o = { seed: 1, length: 200, difficulty: 0.5, flow: 0.5, theme: null, validate: true, attempts: 8, ...opts };
  let level, test = null;
  for (let attempt = 0; attempt < o.attempts; attempt++) {
    level = build(ts, (o.seed * 2654435761 + attempt * 97) >>> 0, o);
    if (!o.validate) { attempt = o.attempts; break; }
    test = playtest(ts, level);
    Object.assign(level.meta, { attempt, validated: test.ok, botFrames: test.frames });
    if (test.ok) break;
  }
  Object.assign(level.meta, { seed: o.seed, length: o.length, difficulty: o.difficulty, flow: o.flow });
  return level;
}

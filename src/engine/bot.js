// Playtest bot. It holds right and uses look-ahead rollouts of the real simulation to
// decide when to jump and for how long, so it needs no knowledge of the level layout.
// Used to prove a level can be finished (and for the demo's auto-play).
import { Sim, modeOf } from './sim.js';
import { S } from '../core/units.js';

const HOLDS = [2, 8, 16, 40];
const DELAYS = [0, 4, 10, 18];

// Hold right, press jump at frame `delay` for `hold` frames, stop at the first landing.
function tryJump(sim, delay, hold, max = 150) {
  const f = sim.fork();
  let jumped = false, landed = false;
  for (let i = 0; i < max; i++) {
    const jump = hold > 0 && i >= delay && i < delay + hold;
    if (jump && f.p.grounded) jumped = true;
    f.step({ right: true, jump });
    if (f.p.dead || f.p.won) break;
    if (jumped && i > delay && f.p.grounded) { landed = true; break; }
  }
  return { f, dead: f.p.dead, won: f.p.won, landed, x: f.p.won ? Infinity : f.p.x };
}
const coast = (sim, frames) => tryJump(sim, 0, 0, frames);
// Can play continue from this state? Looks up to `depth` further jumps ahead.
function viable(sim, depth) {
  const c = coast(sim, depth ? 70 : 12);
  if (!c.dead) return true;
  if (!depth) return false;
  for (const delay of DELAYS) for (const hold of HOLDS) {
    const r = tryJump(sim, delay, hold);
    if (r.won || (r.landed && viable(r.f, depth - 1))) return true;
  }
  return false;
}
// while airborne: does holding direction d lead to a landing we can continue from?
function airLanding(sim, d, hold) {
  const f = sim.fork();
  for (let i = 0; i < 200 && !f.p.grounded; i++) { f.step({ right: d > 0, left: d < 0, jump: hold-- > 0 }); if (f.p.dead) return false; if (f.p.won) return true; }
  return f.p.grounded && viable(f, 1);
}
// best jump starting `delay` frames from now whose landing can be continued from
function best(sim, delay) {
  let b = null;
  for (const hold of HOLDS) {
    const r = tryJump(sim, delay, hold);
    if ((r.won || (r.landed && viable(r.f, 1))) && (!b || r.x > b.x)) b = { x: r.x, hold };
  }
  return b;
}

export class Bot {
  constructor() { this.hold = 0; this.air = 1; }
  input(sim) {
    const p = sim.p;
    if (!p.grounded) { // steer: keep right unless that landing is fatal, then try drifting or pulling back
      if (sim.frame % 4 === 0) {
        this.air = 1;
        for (const d of [1, 0, -1]) if (airLanding(sim, d, this.hold)) { this.air = d; break; }
      }
      const jump = this.hold > 0; this.hold--;
      return { right: this.air > 0, left: this.air < 0, jump };
    }
    this.hold = 0; this.air = 1;
    if (p.jumpHeld || modeOf(p.ang) !== 0) return { right: true }; // release before the next press
    if (sim.loops.some((L) => p.x > L.x && p.x < L.x + L.w && p.y > L.y)) return { right: true };
    const base = coast(sim, 90);
    if (base.won || (!base.dead && base.x - p.x >= 8 * S)) return { right: true };
    if (base.dead && best(sim, 3)) return { right: true }; // a later jump still works: wait for the edge
    const now = best(sim, 0);
    if (now && (base.dead || now.x > base.x + 8 * S)) { this.hold = now.hold - 1; return { right: true, jump: true }; }
    return { right: true };
  }
}

// Runs the bot through a level. ok = reached the goal.
export function playtest(ts, level, { trace = false } = {}) {
  const sim = new Sim(ts, level), bot = new Bot();
  const limit = level.width * 40 + 1200;
  let bestX = 0, since = 0;
  const path = [];
  while (sim.frame < limit) {
    sim.step(bot.input(sim));
    if (trace && sim.frame % 4 === 0) path.push([Math.round(sim.p.x), Math.round(sim.p.y)]);
    if (sim.p.won) return { ok: true, frames: sim.frame, gems: sim.p.gems, path };
    if (sim.p.dead) return { ok: false, reason: sim.p.why, x: Math.round(sim.p.x), frames: sim.frame, path };
    if (sim.p.x > bestX + 1) { bestX = sim.p.x; since = 0; } else if (++since > 900) return { ok: false, reason: 'stuck', x: Math.round(sim.p.x), frames: sim.frame, path };
  }
  return { ok: false, reason: 'timeout', x: Math.round(sim.p.x), frames: sim.frame, path };
}

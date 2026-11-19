import { TILE, S } from '../core/units.js';
// Deterministic 60fps simulation: momentum physics on pixel-mask terrain.
// The player is a ball that follows surfaces through 360 degrees using per-tile angles,
// which is what makes quarter pipes and loops work. No rendering in here, so the same
// code drives the browser demo, the tests and the generator's playtest bot.
const SH = Math.log2(TILE), MK = TILE - 1;
// speeds are px/frame; everything is authored on a 16px grid and scaled by S
export const PHYS = {
  acc: 0.07 * S, dec: 0.5 * S, frc: 0.06 * S, top: 6 * S, max: 14 * S,
  jump: 5.6 * S, jumpCut: 2.5 * S, grav: 0.21875 * S, air: 0.09375 * S,
  slope: 0.125 * S, slopeFloor: 0.0875 * S, // slope pull (gentler while on floor-ish angles so 45s are walkable)
  slip: 2.5 * S,      // below this speed you fall off walls and ceilings
  boost: 10 * S, spring: 9 * S,
  r: 7 * S, sens: 5 * S,  // body radius, sensor spread
};
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // sensor direction for floor / right wall / ceiling / left wall
const RAD = Math.PI / 180;
export const modeOf = (ang) => Math.floor((((ang + 45) % 360) + 360) % 360 / 90);

export class Sim {
  constructor(ts, level) {
    this.ts = ts; this.level = level;
    this.w = level.width; this.h = level.height;
    this.reset();
  }
  reset() {
    const L = this.level;
    this.terrain = L.terrain.slice();
    this.loops = L.objects.filter((o) => o.type === 'loop');
    this.objs = L.objects.filter((o) => o.type !== 'loop').map((o) => ({ ...o, alive: true, vx: -0.4 * S }));
    this.goalX = (L.objects.find((o) => o.type === 'goal') || { x: (this.w - 2) * TILE }).x;
    this.p = { x: L.spawn.x, y: L.spawn.y, xsp: 0, ysp: 0, gsp: 0, ang: 0, grounded: false, path: 'A', lock: 0, jumping: false, jumpHeld: false, dead: false, won: false, gems: 0, spin: 0, face: 1, hitWall: false };
    this.frame = 0; this.frozen = false; this.events = [];
  }
  // cheap copy for look-ahead rollouts; never mutates the terrain
  fork() {
    const s = Object.create(Sim.prototype);
    Object.assign(s, this);
    s.p = { ...this.p }; s.objs = this.objs.map((o) => ({ ...o })); s.frozen = true; s.events = [];
    return s;
  }
  tileAt(px, py) {
    const tx = px >> SH, ty = py >> SH;
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return null;
    const id = this.terrain[ty * this.w + tx];
    return id ? this.ts.tiles[id] : null;
  }
  solid(px, py, path, oneway = false) {
    if (px < 0 || px >= this.w * TILE) return true; // level side walls
    const t = this.tileAt(px, py);
    if (!t || !t.mask) return false;
    if (t.kind === 'oneway' && !oneway) return false;
    if (t.path && t.path !== path) return false;
    return ((t.mask[py & MK] >>> (px & MK)) & 1) === 1;
  }
  // Cast from (ox, oy) along (dx, dy). Returns the index of the first solid pixel
  // (0 = origin; negative when the origin is already inside solid), or null.
  cast(ox, oy, dx, dy, path, oneway = false, limit = 24 * S) {
    const x = Math.floor(ox), y = Math.floor(oy);
    if (oneway && this.solid(x, y, path, true) && !this.solid(x, y, path, false)) oneway = false; // inside a plank: ignore it
    if (!this.solid(x, y, path, oneway)) {
      for (let i = 1; i <= limit; i++) if (this.solid(x + dx * i, y + dy * i, path, oneway)) return { i, t: this.tileAt(x + dx * i, y + dy * i), x: x + dx * i, y: y + dy * i };
      return null;
    }
    for (let j = 1; j <= TILE; j++) if (!this.solid(x - dx * j, y - dy * j, path, oneway)) return { i: 1 - j, t: this.tileAt(x - dx * (j - 1), y - dy * (j - 1)), x: x - dx * (j - 1), y: y - dy * (j - 1) };
    return { i: -TILE, t: this.tileAt(x, y), x, y };
  }
  // nearest surface under the two "foot" sensors for the given mode
  _feet(mode, oneway) {
    const p = this.p, [dx, dy] = DIRS[mode];
    let best = null;
    for (const s of [-PHYS.sens, PHYS.sens]) {
      const c = this.cast(p.x + dy * s, p.y - dx * s, dx, dy, p.path, oneway, PHYS.r + 14 * S);
      if (c && c.i - PHYS.r >= -14 * S && (!best || c.i < best.i)) best = c;
    }
    return best;
  }
  _angleFrom(hit, mode) { const a = hit.t && hit.t.ang ? hit.t.ang[mode] : null; return a == null ? mode * 90 : a; }

  step(input) {
    const p = this.p;
    if (p.dead || p.won) return;
    this.frame++;
    p.hitWall = false;
    if (p.lock > 0) p.lock--;
    const dir = p.lock > 0 ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) p.face = dir;
    const pressed = input.jump && !p.jumpHeld;
    p.jumpHeld = !!input.jump;
    if (p.grounded) this._ground(dir, pressed); else this._air(dir, input.jump);
    p.spin += (p.grounded ? p.gsp : p.xsp) / PHYS.r;
    this._paths();
    this._objects(input);
    if (p.y > this.h * TILE + 24 * S) this._die('fell');
    if (p.x >= this.goalX && !p.dead) p.won = true;
  }

  _ground(dir, jumpPressed) {
    const p = this.p, P = PHYS;
    let mode = modeOf(p.ang);
    const s = Math.sin(p.ang * RAD);
    if (mode !== 0 || Math.abs(p.gsp) > 0.05 * S || Math.abs(s) > 0.3 || dir) p.gsp -= (mode === 0 ? P.slopeFloor : P.slope) * s;
    if (dir) {
      if (p.gsp * dir < 0) { p.gsp += P.dec * dir; if (p.gsp * dir > 0) p.gsp = 0.5 * S * dir; }
      else if (mode === 0 && Math.abs(p.gsp) < P.top) p.gsp = dir * Math.min(P.top, Math.abs(p.gsp) + P.acc); // no pushing on walls: loops need real speed
    } else if (p.lock === 0) p.gsp -= Math.sign(p.gsp) * Math.min(Math.abs(p.gsp), P.frc);
    p.gsp = Math.max(-P.max, Math.min(P.max, p.gsp));

    if (jumpPressed) { // jump along the surface normal
      const a = p.ang * RAD;
      p.xsp = p.gsp * Math.cos(a) - P.jump * Math.sin(a);
      p.ysp = -p.gsp * Math.sin(a) - P.jump * Math.cos(a);
      p.grounded = false; p.jumping = true; p.ang = 0;
      return;
    }
    const n = Math.max(1, Math.ceil(Math.abs(p.gsp) / (3 * S)));
    for (let k = 0; k < n; k++) {
      const a = p.ang * RAD;
      p.x += (p.gsp * Math.cos(a)) / n; p.y -= (p.gsp * Math.sin(a)) / n;
      mode = modeOf(p.ang);
      if (mode === 0 && p.gsp) { // walls only matter while upright
        const sx = Math.sign(p.gsp), c = this.cast(p.x, p.y, sx, 0, p.path, false, P.r + 1);
        if (c && c.i < P.r) { p.x += sx * (c.i - P.r); p.gsp = 0; p.hitWall = true; }
      }
      const hit = this._feet(mode, mode === 0);
      if (!hit || hit.i - P.r > 14 * S) { this._leave(); return; }
      const [dx, dy] = DIRS[mode], adj = hit.i - P.r;
      p.x += dx * adj; p.y += dy * adj;
      p.ang = this._angleFrom(hit, mode);
      if (hit.t && hit.t.kind === 'hazard') return this._die('spikes');
    }
    if (modeOf(p.ang) !== 0 && Math.abs(p.gsp) < P.slip) { this._leave(); p.lock = 30; }
  }
  _leave() {
    const p = this.p, a = p.ang * RAD;
    p.xsp = p.gsp * Math.cos(a); p.ysp = -p.gsp * Math.sin(a);
    p.grounded = false; p.jumping = false; p.ang = 0;
  }
  _land(hit, mode) {
    const p = this.p;
    p.ang = this._angleFrom(hit, mode);
    const a = p.ang * RAD;
    p.gsp = Math.abs(Math.sin(a)) < 0.4 && mode === 0 ? p.xsp : p.xsp * Math.cos(a) - p.ysp * Math.sin(a);
    p.grounded = true; p.jumping = false;
  }
  _air(dir, jumpHeld) {
    const p = this.p, P = PHYS;
    p.ysp = Math.min(16 * S, p.ysp + P.grav);
    if (p.jumping && !jumpHeld && p.ysp < -P.jumpCut) p.ysp = -P.jumpCut;
    if (dir && p.xsp * dir < P.top) p.xsp += P.air * dir;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(p.xsp), Math.abs(p.ysp)) / (3 * S)));
    for (let k = 0; k < n; k++) {
      p.x += p.xsp / n; p.y += p.ysp / n;
      for (const sx of [-1, 1]) {
        const c = this.cast(p.x, p.y, sx, 0, p.path, false, P.r + 1);
        if (c && c.i < P.r && c.i > -P.r) { p.x += sx * (c.i - P.r); if (p.xsp * sx > 0) { p.xsp = 0; p.hitWall = true; } }
      }
      if (p.ysp >= 0) {
        const hit = this._feet(0, true);
        if (hit && hit.i - P.r <= 0) {
          const plank = hit.t && hit.t.kind === 'oneway';
          if (plank && hit.i - P.r < -(p.ysp / n) - 2 * S) continue; // came from below/inside: fall through
          if (hit.t && hit.t.kind === 'hazard') return this._die('spikes');
          p.y += hit.i - P.r;
          this._land(hit, 0);
          return;
        }
      } else {
        const hit = this._feet(2, false);
        if (hit && hit.i - P.r < 0) {
          p.y -= hit.i - P.r;
          const a = this._angleFrom(hit, 2);
          if (hit.t && hit.t.block) { this._bump(hit); p.ysp = 0; }
          else if ((a > 90 && a <= 135) || (a >= 225 && a < 270)) { this._land(hit, 2); return; } // re-attach to curved ceiling
          else p.ysp = 0;
        }
      }
    }
  }
  _bump(hit) {
    if (this.frozen) return;
    const i = (hit.y >> SH) * this.w + (hit.x >> SH), b = hit.t.block;
    if (b === 'bonus') { this.terrain[i] = this.ts.names.used; this.p.gems++; this.events.push({ type: 'bonus', x: hit.x, y: hit.y }); }
    else if (b === 'brick') { this.terrain[i] = 0; this.events.push({ type: 'brick', x: hit.x, y: hit.y }); }
  }
  // Loop path switching. Each loop's lower-left quarter is only solid on path B and its
  // lower-right quarter only on path A. Left of a loop you are on A (so you can run in
  // through the left wall and up the right side); crossing the top flips you to B so the
  // left side catches you and the right wall lets you out. Mirrored when coming from the right.
  _paths() {
    const p = this.p;
    for (const L of this.loops) {
      if (p.x < L.x - 24 * S || p.x > L.x + L.w + 24 * S || p.y < L.y - 8 * S || p.y > L.y + L.h + TILE) continue;
      if (p.x < L.x + 8 * S) p.path = 'A';
      else if (p.x > L.x + L.w - 8 * S) p.path = 'B';
      else if (p.y < L.cy) p.path = p.x < L.cx ? 'B' : 'A';
    }
  }
  _objects(input) {
    const p = this.p, P = PHYS, H = TILE / 2;
    for (const o of this.objs) {
      if (!o.alive || Math.abs(o.x - p.x) > 400 * S) continue;
      if (o.type === 'walker') {
        const f = o.vx < 0 ? -1 : 1;
        if (this.solid(Math.floor(o.x + H + f * 9 * S), o.y + H, 'A') || !this.solid(Math.floor(o.x + H + f * H), o.y + TILE + 1, 'A', true)) o.vx = -o.vx; else o.x += o.vx;
      }
      const dx = p.x - (o.x + H), dy = p.y - (o.y + H);
      if (o.type === 'goal' || Math.abs(dx) > 13 * S || Math.abs(dy) > 13 * S) continue;
      if (o.type === 'gem') { o.alive = false; p.gems++; }
      else if (o.type === 'spring' && dy < 2 * S) { p.ysp = -P.spring; p.xsp = p.grounded ? p.gsp : p.xsp; p.grounded = false; p.jumping = false; p.ang = 0; p.y -= 2 * S; }
      else if (o.type === 'booster' && p.grounded) { if (p.gsp * o.dir < P.boost) p.gsp = o.dir * P.boost; }
      else if (o.type === 'walker') {
        if (!p.grounded && p.ysp > 0 && dy < -3 * S) { o.alive = false; p.ysp = input.jump ? -P.jump : -3.5 * S; }
        else if (Math.abs(dx) < 11 * S && Math.abs(dy) < 11 * S) this._die('enemy');
      }
    }
  }
  _die(why) { this.p.dead = true; this.p.why = why; }
}

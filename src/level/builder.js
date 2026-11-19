// LevelBuilder: a left-to-right cursor API for laying out levels. Hand-made levels and
// the procedural generator both use it, so anything the generator can produce can also
// be written by hand (see examples.js).
import { TILE as T, S } from '../core/units.js';

const GROUND = -1; // placeholder, resolved to an autotile in finish()

export class LevelBuilder {
  constructor(ts, { name = 'Untitled', theme = 'meadow', height = 30, ground = 22, ceiling = 0 } = {}) {
    Object.assign(this, { ts, name, theme, height, ceiling });
    this.cols = []; this.dec = [];
    this.x = 0; this.g = ground; this.g0 = ground;
    this.objects = [];
    this.surf = []; // per column: surface y in px (for decoration), or null over pits / special pieces
  }
  _col(x) { while (this.cols.length <= x) { this.cols.push(new Int16Array(this.height)); this.dec.push(new Int16Array(this.height)); this.surf.push(null); } return this.cols[x]; }
  set(x, y, id) { if (x >= 0 && y >= 0 && y < this.height) this._col(x)[y] = id; return this; }
  get(x, y) { return x < 0 || y < 0 || y >= this.height || x >= this.cols.length ? 0 : this.cols[x][y]; }
  put(name, x, y) { return this.set(x, y, this.ts.names[name]); }
  _fill(x, from) { const c = this._col(x); for (let y = Math.max(0, from); y < this.height; y++) if (!c[y]) c[y] = GROUND; }

  // --- terrain -------------------------------------------------------------------
  flat(n = 1) { for (let i = 0; i < n; i++) { this._fill(this.x, this.g); this.surf[this.x] = this.g * T; this.x++; } return this; }
  gap(n = 1) { this._col(this.x + n - 1); this.x += n; return this; }
  step(d) { this.g += d; return this; } // negative = up
  piece(name) {
    const p = this.ts.prefabs[name];
    if (!p) throw new Error(`unknown piece ${name}`);
    if (this.x === 0 || this.surf[this.x - 1] !== this.g * T) this.flat(1); // pieces need a flat tile before them
    const x0 = this.x, g = this.g;
    for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) if (p.cells[r][c]) this.set(x0 + p.colOff + c, g + p.rowOff + r, p.cells[r][c]);
    for (let c = 0; c < p.w; c++) this._fill(x0 + p.colOff + c, g + p.rowOff + p.h);
    for (const o of p.objects) this.objects.push({ ...o, x: x0 * T + o.x, y: g * T + o.y, cx: x0 * T + o.cx, cy: g * T + o.cy });
    for (let c = 0; c < p.width; c++) this.surf[x0 + c] = null;
    this.x = x0 + p.width; this.g = g + p.dy;
    if (!p.cliff) { this.surf[this.x] = this.g * T; this.x++; } // trailing pad column
    this.last = { name, x0, g, p };
    return this;
  }

  // floating chunk of ground above the route (an upper deck); lay the route under it afterwards
  island(len, up, dx = 0, thick = 2) {
    for (let i = 0; i < len; i++) for (let k = 0; k < thick; k++) this.set(this.x + dx + i, this.g - up + k, GROUND);
    return this;
  }
  // slab of ground hanging over the route, leaving `clearance` tiles of head room (a tunnel)
  overhang(len, clearance = 3, thick = 3, dx = 0) { return this.island(len, clearance + thick, dx, thick); }
  column(h) { for (let r = 1; r <= h; r++) this.put('hard', this.x, this.g - r); return this.flat(1); }

  // --- things placed relative to the cursor (lay the ground under them afterwards) --
  blocks(pattern, up = 4, dx = 0) {
    const map = { B: 'brick', '?': 'bonus', H: 'hard', '=': 'bridge' };
    [...pattern].forEach((ch, i) => {
      if (ch === '_') { const l = pattern[i - 1] !== '_', r = pattern[i + 1] !== '_'; this.put(l ? 'plank_l' : r ? 'plank_r' : 'plank_m', this.x + dx + i, this.g - up); }
      else if (map[ch]) this.put(map[ch], this.x + dx + i, this.g - up);
    });
    return this;
  }
  pipe(h = 2) {
    for (let r = 1; r <= h; r++) for (let c = 0; c < 2; c++) this.put(`pipe_${c}_${r === h ? 0 : 1}`, this.x + c, this.g - r);
    return this.flat(2);
  }
  stairs(n, dir = 1) {
    for (let i = 0; i < n; i++) { const hgt = dir > 0 ? i + 1 : n - i; for (let r = 1; r <= hgt; r++) this.put('hard', this.x, this.g - r); this.flat(1); }
    return this;
  }
  spikes(n = 1, dx = 0) { for (let i = 0; i < n; i++) this.put('spikes', this.x + dx + i, this.g - 1); return this; }
  obj(type, dx = 0, up = 1, extra = {}) { this.objects.push({ type, x: (this.x + dx) * T, y: (this.g - up) * T, w: T, h: T, ...extra }); return this; }
  enemy(dx = 0) { return this.obj('walker', dx, 1); }
  spring(dx = 0) { return this.obj('spring', dx, 1); }
  booster(dx = 0, dir = 1) { return this.obj('booster', dx, 1, { dir }); }
  // speed section lead-in: a booster at each end of an n-tile flat, so it cannot be skipped by one jump
  runUp(n = 5) { return this.booster(0).flat(n - 1).booster(0).flat(1); }
  gems(n, up = 2, dx = 0, arc = 0) {
    for (let i = 0; i < n; i++) this.obj('gem', dx + i, up, arc ? { y: (this.g - up) * T - Math.round(arc * T * Math.sin((Math.PI * (i + 0.5)) / n)) } : {});
    return this;
  }
  // gems that follow the surface of the piece just placed
  gemsOnLast(lift = 14 * S) {
    const { x0, g, p } = this.last;
    for (let i = 0; i < p.width; i++) this.objects.push({ type: 'gem', x: (x0 + i) * T, y: Math.round(g * T + p.surface(i * T + T / 2) - lift - T), w: T, h: T });
    return this;
  }
  // ring of gems inside the loop just placed
  gemsInLoop(n = 8) {
    const L = this.objects.filter((o) => o.type === 'loop').pop();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.objects.push({ type: 'gem', x: Math.round(L.cx + Math.cos(a) * (L.r - 18 * S) - T / 2), y: Math.round(L.cy + Math.sin(a) * (L.r - 18 * S) - T / 2), w: T, h: T }); }
    return this;
  }
  goal() {
    this.flat(3);
    const x = this.x, g = this.g;
    this.put('hard', x, g - 1);
    this._col(x + 1);
    const POLE = 10, n = this.ts.names;
    for (let r = 2; r <= POLE; r++) this.dec[x][g - r] = r === POLE ? n.goal_top : n.goal_pole;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) this.dec[x + c][g - POLE + 1 + r] = n[`goal_flag_${c}_${r}`];
    this.objects.push({ type: 'goal', x: x * T, y: (g - POLE) * T, w: T, h: (POLE - 1) * T });
    return this.flat(6);
  }

  // --- finishing -------------------------------------------------------------------
  _stamp(prefix, cw, ch, x, yBottom) { // decor stamp; skipped if anything is in the way
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) { const X = x + c, Y = yBottom - ch + 1 + r; if (Y < 0 || X >= this.cols.length || this.cols[X][Y] || this.dec[X][Y]) return false; }
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) this.dec[x + c][yBottom - ch + 1 + r] = this.ts.names[`${prefix}_${c}_${r}`];
    return true;
  }
  decorate(rng, density = 1) { // clouds and distant hills come from the parallax background
    this.hang = { rng, chance: (this.theme === 'cavern' ? 0.45 : 0.2) * density }; // growths under ceilings, placed in finish()
    const w = this.cols.length;
    const flatRun = (x, n) => { for (let i = 0; i < n; i++) if (this.surf[x + i] == null || this.surf[x + i] !== this.surf[x]) return false; return true; };
    for (let x = 2; x < w - 6; x++) {
      if (rng.chance(0.1 * density) && flatRun(x, 3)) this._stamp('bush', 3, 1, x, this.surf[x] / T - 1);
    }
    return this;
  }
  finish() {
    const { ts, height: h } = this;
    const w = this.cols.length;
    for (let x = 0; x < w; x++) for (let y = 0; y < this.ceiling; y++) if (!this.cols[x][y]) this.cols[x][y] = GROUND;
    const isG = (x, y) => {
      if (y >= h) return true;
      if (y < 0) return this.ceiling > 0;
      const id = this.cols[Math.min(w - 1, Math.max(0, x))][y];
      return id === GROUND || (id > 0 && ts.tiles[id].kind === 'ground');
    };
    if (this.hang) for (let x = 0; x < w; x++) for (let y = 1; y < h; y++) { // hang decor under flat undersides of plain ground
      if (this.cols[x][y - 1] === GROUND && !this.cols[x][y] && !this.dec[x][y] && this.hang.rng.chance(this.hang.chance)) this.dec[x][y] = ts.names[`hang_${this.hang.rng.int(0, 2)}`];
    }
    const terrain = new Uint16Array(w * h), decor = new Uint16Array(w * h);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      let id = this.cols[x][y];
      if (id === GROUND) {
        let m = 0, bit = 1;
        for (const [dx, dy] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]) { if (isG(x + dx, y + dy)) m |= bit; bit <<= 1; }
        id = ts.ground[m];
      }
      terrain[y * w + x] = id; decor[y * w + x] = this.dec[x][y];
    }
    return { name: this.name, theme: this.theme, groundRow: this.g0, width: w, height: h, tile: T, terrain, decor, objects: this.objects, spawn: { x: 3.5 * T, y: this.g0 * T - T / 2 } };
  }
}

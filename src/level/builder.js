// LevelBuilder: a left-to-right cursor API for laying out levels. Hand-made levels and
// the procedural generator both use it, so anything the generator can produce can also
// be written by hand (see examples.js).
import { TILE as T, S } from '../core/units.js';
import { buildProps, PROP_SETS } from '../tileset/props.js';

const GROUND = -1;
const FLORA = { factory: ['barrel', 'barrel', 'cone', 'valve', 'rock'], meadow: ['flower_0', 'flower_1', 'tuft', 'tuft', 'mushroom', 'rock'], cavern: ['crystal', 'crystal', 'mushroom', 'rock'], dusk: ['tuft', 'rock', 'flower_1', 'tuft'] }; // placeholder, resolved to an autotile in finish()

export class LevelBuilder {
  constructor(ts, { name = 'Untitled', theme = 'meadow', height = 30, ground = 22, ceiling = 0 } = {}) {
    Object.assign(this, { ts, name, theme, height, ceiling });
    this.cols = []; this.dec = [];
    this.x = 0; this.g = ground; this.g0 = ground;
    this.objects = [];
    this.props = []; // big background set pieces: { name, x, y } in pixels (top-left)
    this.surf = []; // per column: y (px) of the flat surface most recently laid there, or null
    this.tops = []; // every flat surface cell laid, on any tier: [column, row]
    this.depth = Infinity; // how many tiles of ground go under a surface (Infinity = down to the level bottom)
    this.gMin = 8; this.gMax = height - 4; this.base = ground; // limits and target height for pieces that move the ground
  }
  _col(x) { while (this.cols.length <= x) { this.cols.push(new Int16Array(this.height)); this.dec.push(new Int16Array(this.height)); this.surf.push(null); } return this.cols[x]; }
  set(x, y, id) { if (x >= 0 && y >= 0 && y < this.height) this._col(x)[y] = id; return this; }
  get(x, y) { return x < 0 || y < 0 || y >= this.height || x >= this.cols.length ? 0 : this.cols[x][y]; }
  put(name, x, y) { return this.set(x, y, this.ts.names[name]); }
  _fill(x, from, depth = this.depth) { const c = this._col(x); for (let y = Math.max(0, from); y < Math.min(this.height, from + depth); y++) if (!c[y]) c[y] = GROUND; }
  // Move the cursor: lets one stretch of level be built several times at different heights (tiers).
  at(x, g = this.g) { this._col(x); this.x = x; this.g = g; return this; }
  // highest occupied row (terrain or object) in a column range: what a tier above must clear
  skyline(x0, x1) {
    let top = this.height;
    for (let x = Math.max(0, x0); x <= Math.min(this.cols.length - 1, x1); x++) { const c = this.cols[x]; for (let y = 0; y < top; y++) if (c[y]) { top = y; break; } }
    for (const o of this.objects) if (o.x + o.w > x0 * T && o.x < (x1 + 1) * T) top = Math.min(top, Math.floor(o.y / T));
    return top;
  }
  isFlat(x, g) { return this.surf[x] === g * T; }

  // --- terrain -------------------------------------------------------------------
  flat(n = 1) { for (let i = 0; i < n; i++) { this._fill(this.x, this.g); this.surf[this.x] = this.g * T; this.tops.push([this.x, this.g]); this.x++; } return this; }
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
    if (!p.cliff) { this.surf[this.x] = this.g * T; this.tops.push([this.x, this.g]); this.x++; } // trailing pad column
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
  flyer(dx = 0, up = 3) { return this.obj('flyer', dx, up); }          // hovers, bobbing up and down
  checkpoint(dx = 0) { return this.obj('checkpoint', dx, 1); }
  // factory pieces: conveyor belt (dir 1 = carries right), acid vat, steam vent, press
  belt(n, dir = 1) { const id = this.ts.names[dir > 0 ? 'belt_r_0' : 'belt_l_0']; for (let i = 0; i < n; i++) { this.set(this.x, this.g, id); this._fill(this.x, this.g + 1, this.depth - 1); this.surf[this.x] = null; this.x++; } return this; }
  acid(n) { for (let i = 0; i < n; i++) { this.set(this.x, this.g, this.ts.names.acid_0); this._fill(this.x, this.g + 1, this.depth - 1); this.surf[this.x] = null; this.x++; } return this; }
  vent(dx = 0, phase = 0) { return this.obj('vent', dx, 1, { phase }); }
  // hangs from a ceiling `clearance` tiles above the ground and reaches down to just over a tile above the floor
  crusher(dx = 0, clearance = 4, phase = 0) { this.objects.push({ type: 'crusher', x: (this.x + dx) * T, y: (this.g - clearance) * T, w: 2 * T, h: T, reach: Math.round((clearance - 1.3) * T), phase }); return this; }
  deco(name, dx = 0, up = 1) { this._col(this.x + dx); if (this.g - up >= 0) this.dec[this.x + dx][this.g - up] = this.ts.names[name]; return this; }
  // power: launch speed in 16px-grid units per frame; omit for the standard spring (about 11 tiles of height)
  spring(dx = 0, power) { return this.obj('spring', dx, 1, power ? { power } : {}); }
  // spring strong enough to rise `rows` tiles
  springFor(dx, rows) { return this.spring(dx, rows <= 9 ? undefined : Math.round(Math.sqrt(2 * 0.21875 * 16 * (rows + 2.5)) * 10) / 10); }
  // cut a hole through the ground: removes terrain in a column range between two rows
  carve(x0, x1, y0, y1) {
    for (let x = x0; x <= x1; x++) { const c = this._col(x); for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y++) c[y] = 0; this.surf[x] = null; }
    this.tops = this.tops.filter(([x, g]) => x < x0 || x > x1 || g < y0 || g > y1);
    return this;
  }
  // solid column from row y0 downward until it meets existing terrain (or y1)
  wall(x, y0, y1) { const c = this._col(x); for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1) && !c[y]; y++) c[y] = GROUND; return this; }
  wallUp(x, y1, y0) { const c = this._col(x); for (let y = Math.min(this.height - 1, y1); y >= Math.max(0, y0) && !c[y]; y--) c[y] = GROUND; return this; }
  booster(dx = 0, dir = 1) { return this.obj('booster', dx, 1, { dir }); }
  // speed section lead-in: a booster at each end of an n-tile flat, so it cannot be skipped by one jump
  runUp(n = 5) { if (n >= 4) this.deco('sign', 2); return this.booster(0).flat(n - 1).booster(0).flat(1); }
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
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) this.dec[x + c][yBottom - ch + 1 + r] = this.ts.names[cw * ch === 1 ? prefix : `${prefix}_${c}_${r}`];
    return true;
  }
  decorate(rng, density = 1) { // clouds and distant hills come from the parallax background
    this._scenery(rng);
    this.hang = { rng, chance: (this.theme === 'cavern' ? 0.45 : 0.2) * density }; // growths under ceilings, placed in finish()
    const flat = new Set(this.tops.map(([x, g]) => `${x},${g}`));
    for (const [x, g] of this.tops) { // every tier gets plants
      if (x < 2 || x > this.cols.length - 6) continue;
      if (rng.chance(0.1 * density) && flat.has(`${x + 1},${g}`) && flat.has(`${x + 2},${g}`)) this._stamp('bush', 3, 1, x, g - 1);
      if (rng.chance(0.16 * density)) this._stamp(rng.pick(FLORA[this.theme] || FLORA.meadow), 1, 1, x, g - 1);
    }
    return this;
  }
  // big set pieces: ground props stand on flat ground of any tier, sky props float above it
  _scenery(rng) {
    const props = buildProps(), set = PROP_SETS[this.theme] || PROP_SETS.meadow, w = this.cols.length;
    const byCol = new Map();
    for (const [x, g] of this.tops) { if (!byCol.has(x)) byCol.set(x, []); byCol.get(x).push(g); }
    let last = null;
    for (let x = rng.int(4, 8); x < w - 14; x += rng.int(4, 8)) {
      const rows = byCol.get(x);
      if (!rows) continue;
      let name = rng.pick(set);
      if (name === last) name = rng.pick(set);
      const p = props[name], ground = rng.pick(rows) * T;
      if (p.sky) this.props.push({ name, x: x * T, y: Math.max((this.ceiling + 1) * T, ground - p.h - rng.int(4, 8) * T) });
      else this.props.push({ name, x: Math.round(x * T + T / 2 - p.w / 2), y: ground - p.h + p.sink });
      last = name;
    }
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
        if (m === 255) { // buried on all sides: three tiles down the soil turns to bedrock, with the odd stone or ore
          let depth = 0;
          while (depth < 4 && y - depth - 1 >= 0 && isG(x, y - depth - 1)) depth++;
          const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          if (depth === 3) id = ts.names.deep_top;
          else if (depth > 3) id = ts.names[hash % 23 === 0 ? 'deep_ore' : hash % 17 === 0 ? 'deep_stones' : hash % 41 === 0 ? 'deep_fossil' : 'deep_plain'];
        }
      }
      terrain[y * w + x] = id; decor[y * w + x] = this.dec[x][y];
    }
    return { name: this.name, theme: this.theme, groundRow: this.g0, width: w, height: h, tile: T, terrain, decor, objects: this.objects, props: this.props, spawn: { x: 3.5 * T, y: this.g0 * T - T / 2 } };
  }
}

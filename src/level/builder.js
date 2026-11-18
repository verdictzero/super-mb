// LevelBuilder: a left-to-right cursor API for laying out levels. Hand-made levels and
// the procedural generator both use it, so anything the generator can produce can also
// be written by hand (see examples.js).
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
  flat(n = 1) { for (let i = 0; i < n; i++) { this._fill(this.x, this.g); this.surf[this.x] = this.g * 16; this.x++; } return this; }
  gap(n = 1) { this._col(this.x + n - 1); this.x += n; return this; }
  step(d) { this.g += d; return this; } // negative = up
  piece(name) {
    const p = this.ts.prefabs[name];
    if (!p) throw new Error(`unknown piece ${name}`);
    if (this.x === 0 || this.surf[this.x - 1] !== this.g * 16) this.flat(1); // pieces need a flat tile before them
    const x0 = this.x, g = this.g;
    for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) if (p.cells[r][c]) this.set(x0 + p.colOff + c, g + p.rowOff + r, p.cells[r][c]);
    for (let c = 0; c < p.w; c++) this._fill(x0 + p.colOff + c, g + p.rowOff + p.h);
    for (const o of p.objects) this.objects.push({ ...o, x: x0 * 16 + o.x, y: g * 16 + o.y, cx: x0 * 16 + o.cx, cy: g * 16 + o.cy });
    for (let c = 0; c < p.width; c++) this.surf[x0 + c] = null;
    this.x = x0 + p.width; this.g = g + p.dy;
    if (!p.cliff) { this.surf[this.x] = this.g * 16; this.x++; } // trailing pad column
    this.last = { name, x0, g, p };
    return this;
  }

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
  obj(type, dx = 0, up = 1, extra = {}) { this.objects.push({ type, x: (this.x + dx) * 16, y: (this.g - up) * 16, w: 16, h: 16, ...extra }); return this; }
  enemy(dx = 0) { return this.obj('walker', dx, 1); }
  spring(dx = 0) { return this.obj('spring', dx, 1); }
  booster(dx = 0, dir = 1) { return this.obj('booster', dx, 1, { dir }); }
  // speed section lead-in: a booster at each end of an n-tile flat, so it cannot be skipped by one jump
  runUp(n = 5) { return this.booster(0).flat(n - 1).booster(0).flat(1); }
  gems(n, up = 2, dx = 0, arc = 0) {
    for (let i = 0; i < n; i++) this.obj('gem', dx + i, up, arc ? { y: (this.g - up) * 16 - Math.round(arc * 16 * Math.sin((Math.PI * (i + 0.5)) / n)) } : {});
    return this;
  }
  // gems that follow the surface of the piece just placed
  gemsOnLast(lift = 14) {
    const { x0, g, p } = this.last;
    for (let i = 0; i < p.width; i++) this.objects.push({ type: 'gem', x: (x0 + i) * 16, y: Math.round(g * 16 + p.surface(i * 16 + 8) - lift - 16), w: 16, h: 16 });
    return this;
  }
  // ring of gems inside the loop just placed
  gemsInLoop(n = 8) {
    const L = this.objects.filter((o) => o.type === 'loop').pop();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.objects.push({ type: 'gem', x: Math.round(L.cx + Math.cos(a) * (L.r - 18) - 8), y: Math.round(L.cy + Math.sin(a) * (L.r - 18) - 8), w: 16, h: 16 }); }
    return this;
  }
  goal() {
    this.flat(3);
    const x = this.x, g = this.g;
    this.put('hard', x, g - 1);
    for (let r = 2; r <= 7; r++) this.dec[x][g - r] = this.ts.names[r === 7 ? 'goal_top' : r === 6 ? 'goal_flag' : 'goal_pole'];
    this.objects.push({ type: 'goal', x: x * 16, y: (g - 8) * 16, w: 16, h: 7 * 16 });
    return this.flat(6);
  }

  // --- finishing -------------------------------------------------------------------
  _stamp(prefix, cw, ch, x, yBottom) { // decor stamp; skipped if anything is in the way
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) { const X = x + c, Y = yBottom - ch + 1 + r; if (Y < 0 || X >= this.cols.length || this.cols[X][Y] || this.dec[X][Y]) return false; }
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) this.dec[x + c][yBottom - ch + 1 + r] = this.ts.names[`${prefix}_${c}_${r}`];
    return true;
  }
  decorate(rng, density = 1) {
    const w = this.cols.length;
    const flatRun = (x, n) => { for (let i = 0; i < n; i++) if (this.surf[x + i] == null || this.surf[x + i] !== this.surf[x]) return false; return true; };
    for (let x = 2; x < w - 6; x++) {
      if (this.theme !== 'cavern' && rng.chance(0.1 * density)) this._stamp('cloud', 3, 2, x, rng.int(Math.max(2, this.ceiling + 2), 9));
      if (rng.chance(0.07 * density) && flatRun(x, 5)) this._stamp('bghill', 5, 3, x, this.surf[x] / 16 - 1);
      if (rng.chance(0.1 * density) && flatRun(x, 3)) this._stamp('bush', 3, 1, x, this.surf[x] / 16 - 1);
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
    return { name: this.name, theme: this.theme, width: w, height: h, tile: 16, terrain, decor, objects: this.objects, spawn: { x: 3 * 16 + 8, y: this.g0 * 16 - 8 } };
  }
}

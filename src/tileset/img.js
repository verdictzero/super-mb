// Indexed-colour pixel buffer. 0 is transparent; other values are palette slots.
// With a scale s > 1 the drawing calls take coordinates on a coarse design grid (one unit =
// s pixels, fractions allowed) and rasterise at full resolution, so circles and polygons
// come out smooth while rectangles stay aligned to the grid. w, h and d are always real pixels.
export class Img {
  constructor(w, h, s = 1) { this.s = s; this.w = Math.round(w * s); this.h = Math.round(h * s); this.d = new Uint8Array(this.w * this.h); }
  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  px(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; return this; }
  get(x, y) { return this.at(Math.floor(x * this.s), Math.floor(y * this.s)); }
  set(x, y, c) { return this.rect(x, y, 1, 1, c); }
  rect(x, y, w, h, c) {
    const s = this.s, x1 = Math.round((x + w) * s), y1 = Math.round((y + h) * s);
    for (let j = Math.round(y * s); j < y1; j++) for (let i = Math.round(x * s); i < x1; i++) this.px(i, j, c);
    return this;
  }
  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }
  _real(v) { return (v + 0.5) * this.s - 0.5; } // design-grid pixel centre -> real pixel coordinate
  disc(cx, cy, r, c) {
    const X = this._real(cx), Y = this._real(cy), R = r * this.s;
    for (let j = Math.floor(Y - R); j <= Math.ceil(Y + R); j++) for (let i = Math.floor(X - R); i <= Math.ceil(X + R); i++)
      if ((i - X) ** 2 + (j - Y) ** 2 <= R * R) this.px(i, j, c);
    return this;
  }
  poly(points, c) { // filled polygon, even-odd rule
    const pts = points.map(([x, y]) => [this._real(x), this._real(y)]);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      let inside = false;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [xa, ya] = pts[a], [xb, yb] = pts[b];
        if ((ya > j) !== (yb > j) && i < ((xb - xa) * (j - ya)) / (yb - ya) + xa) inside = !inside;
      }
      if (inside) this.px(i, j, c);
    }
    return this;
  }
  // rows of text; map maps characters to palette slots ('.' / ' ' are skipped)
  art(x, y, rows, map) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (map[ch] !== undefined) this.set(x + i, y + j, map[ch]); }));
    return this;
  }
  // per-pixel pass: fn(designX, designY, colour, realX, realY) returns a new colour or undefined
  map(fn) {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const c = fn((i + 0.5) / this.s - 0.5, (j + 0.5) / this.s - 0.5, this.d[j * this.w + i], i, j);
      if (c !== undefined) this.d[j * this.w + i] = c;
    }
    return this;
  }
  // outline of colour c around every opaque pixel, one design unit thick
  outline(c) {
    for (let k = 0; k < this.s; k++) {
      const src = this.d.slice();
      const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
        if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) this.d[y * this.w + x] = c;
    }
    return this;
  }
  // the remaining helpers work in real pixels
  sub(x, y, w, h) {
    const o = new Img(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.d[j * w + i] = this.at(x + i, y + j);
    return o;
  }
  flipX() {
    const o = new Img(this.w, this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) o.d[j * this.w + i] = this.d[j * this.w + (this.w - 1 - i)];
    return o;
  }
  blit(src, x, y) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) { const c = src.d[j * src.w + i]; if (c) this.px(x + i, y + j, c); }
    return this;
  }
  isEmpty() { return this.d.every((v) => v === 0); }
}

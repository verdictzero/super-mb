// Indexed-colour pixel buffer. 0 is transparent; other values are palette slots.
export class Img {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }
  disc(cx, cy, r, c) {
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++)
      for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.set(i, j, c);
    return this;
  }
  // rows of text; map maps characters to palette slots ('.' / ' ' are skipped)
  art(x, y, rows, map) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (map[ch] !== undefined) this.set(x + i, y + j, map[ch]); }));
    return this;
  }
  // 1px outline of colour c around every opaque pixel (only onto transparent pixels)
  outline(c) {
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) this.d[y * this.w + x] = c;
    return this;
  }
  sub(x, y, w, h) {
    const o = new Img(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.d[j * w + i] = this.get(x + i, y + j);
    return o;
  }
  flipX() {
    const o = new Img(this.w, this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) o.d[j * this.w + i] = this.d[j * this.w + (this.w - 1 - i)];
    return o;
  }
  blit(src, x, y) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) { const c = src.d[j * src.w + i]; if (c) this.set(x + i, y + j, c); }
    return this;
  }
  isEmpty() { return this.d.every((v) => v === 0); }
}

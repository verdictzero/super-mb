// Flat RGBA render of a whole level (used for PNG previews and the minimap).
import { themeRGBA, skyBands } from '../tileset/palette.js';
import { TILE as T } from '../core/units.js';
import { buildProps } from '../tileset/props.js';
import { buildBackground, layoutBackground, HORIZON_ABOVE_GROUND } from '../tileset/background.js';

export const OBJECT_TILE = { gem: 'gem', spring: 'spring', walker: 'walker_0', flyer: 'flyer_0', checkpoint: 'check_off', vent: 'vent' };
export const objectTile = (o) => (o.type === 'spring' && o.power > 10 ? 'spring_hi' : o.type === 'booster' ? (o.dir < 0 ? 'booster_l' : 'booster_r') : OBJECT_TILE[o.type]);

// step > 1 renders a reduced image (every step-th pixel), for minimaps and big levels.
export function renderLevel(ts, level, theme = level.theme, step = 1) {
  const W = level.width * T, H = level.height * T, w = Math.ceil(W / step), h = Math.ceil(H / step);
  const out = new Uint8ClampedArray(w * h * 4);
  const pal = themeRGBA(theme);
  const put = (X, Y, c) => { const o = ((Y / step) * w + X / step) * 4; out[o] = pal[c * 4]; out[o + 1] = pal[c * 4 + 1]; out[o + 2] = pal[c * 4 + 2]; };
  const ok = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && X % step === 0 && Y % step === 0;
  const bands = skyBands(theme);
  for (let y = 0; y < h; y++) {
    const c = bands[Math.min(bands.length - 1, Math.floor((y / h) * bands.length))];
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; }
  }
  // parallax layers, flattened (no scrolling in a still image). In a tall level the backdrop
  // stays put on screen while the camera travels, so a still can only show it as one band.
  const tall = level.height > 40, ground = (level.groundRow || 22) * T;
  layoutBackground(buildBackground(theme), { camX: 0, horizon: ground - HORIZON_ABOVE_GROUND, viewH: H }, (l, sy, rows, dy) => {
    if (sy < 0 && tall) return;
    for (let j = 0; j < rows; j++) {
      const Y = dy + j;
      if (Y < 0 || Y >= H || Y % step) continue;
      for (let X = 0; X < W; X += step) {
        if (l.once && X >= l.w) break;
        const c = sy < 0 ? l.fill : l.img.d[(sy + j) * l.w + (X % l.w)];
        if (c) put(X, Y, c);
      }
    }
  });
  const stamp = (im, px, py) => { // any indexed image at a pixel position
    for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const c = im.d[j * im.w + i]; if (c && ok(px + i, py + j)) put(px + i, py + j, c); }
  };
  const blit = (id, px, py) => { if (id) stamp(ts.tiles[id].img, px, py); };
  const props = buildProps();
  for (const q of level.props || []) stamp(props[q.name].img, q.x, q.y); // set pieces, behind everything in the level plane
  for (const layer of [level.decor, level.terrain]) for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) blit(layer[y * level.width + x], x * T, y * T);
  for (const o of level.objects) {
    const n = objectTile(o); if (n) blit(ts.names[n], o.x, o.y);
    if (o.type === 'crusher') { blit(ts.names.crusher_head_0_0, o.x, o.y); blit(ts.names.crusher_head_1_0, o.x + T, o.y); }
  }
  blit(ts.names.hero, level.spawn.x - T / 2, level.spawn.y - T / 2);
  return { w, h, rgba: out };
}

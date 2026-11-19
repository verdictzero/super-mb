// Flat RGBA render of a whole level (used for PNG previews and the minimap).
import { themeRGBA, skyBands } from '../tileset/palette.js';
import { TILE as T } from '../core/units.js';
import { buildProps } from '../tileset/props.js';
import { buildBackground, layoutBackground, HORIZON_ABOVE_GROUND } from '../tileset/background.js';

export const OBJECT_TILE = { gem: 'gem', spring: 'spring', walker: 'walker_0', flyer: 'flyer_0', checkpoint: 'check_off' };
export const objectTile = (o) => (o.type === 'booster' ? (o.dir < 0 ? 'booster_l' : 'booster_r') : OBJECT_TILE[o.type]);

export function renderLevel(ts, level, theme = level.theme) {
  const W = level.width * T, H = level.height * T;
  const out = new Uint8ClampedArray(W * H * 4);
  const pal = themeRGBA(theme);
  const bands = skyBands(theme);
  for (let y = 0; y < H; y++) {
    const c = bands[Math.min(bands.length - 1, Math.floor((y / H) * bands.length))];
    for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; }
  }
  // parallax layers, flattened (no scrolling in a still image)
  const ground = (level.groundRow || 22) * T;
  layoutBackground(buildBackground(theme), { camX: 0, horizon: ground - HORIZON_ABOVE_GROUND, viewH: H }, (l, sy, rows, dy) => {
    for (let j = 0; j < rows; j++) {
      const Y = dy + j;
      if (Y < 0 || Y >= H) continue;
      for (let X = 0; X < W; X++) {
        if (l.once && X >= l.w) break;
        const c = sy < 0 ? l.fill : l.img.d[(sy + j) * l.w + (X % l.w)];
        if (c) { const o = (Y * W + X) * 4; out[o] = pal[c * 4]; out[o + 1] = pal[c * 4 + 1]; out[o + 2] = pal[c * 4 + 2]; }
      }
    }
  });
  const blit = (id, px, py) => {
    if (!id) return;
    const d = ts.tiles[id].img.d;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const c = d[j * T + i], X = px + i, Y = py + j;
      if (!c || X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4; out[o] = pal[c * 4]; out[o + 1] = pal[c * 4 + 1]; out[o + 2] = pal[c * 4 + 2];
    }
  };
  const props = buildProps();
  for (const q of level.props || []) { // set pieces, behind everything in the level plane
    const im = props[q.name].img;
    for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
      const c = im.d[j * im.w + i], X = q.x + i, Y = q.y + j;
      if (c && X >= 0 && Y >= 0 && X < W && Y < H) { const o = (Y * W + X) * 4; out[o] = pal[c * 4]; out[o + 1] = pal[c * 4 + 1]; out[o + 2] = pal[c * 4 + 2]; }
    }
  }
  for (const layer of [level.decor, level.terrain]) for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) blit(layer[y * level.width + x], x * T, y * T);
  for (const o of level.objects) { const n = objectTile(o); if (n) blit(ts.names[n], o.x, o.y); }
  blit(ts.names.hero, level.spawn.x - T / 2, level.spawn.y - T / 2);
  return { w: W, h: H, rgba: out };
}

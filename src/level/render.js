// Flat RGBA render of a whole level (used for PNG previews and the minimap).
import { themeRGBA, THEMES } from '../tileset/palette.js';

export const OBJECT_TILE = { gem: 'gem', spring: 'spring', walker: 'walker_0' };
export const objectTile = (o) => (o.type === 'booster' ? (o.dir < 0 ? 'booster_l' : 'booster_r') : OBJECT_TILE[o.type]);

export function renderLevel(ts, level, theme = level.theme) {
  const W = level.width * 16, H = level.height * 16;
  const out = new Uint8ClampedArray(W * H * 4);
  const pal = themeRGBA(theme);
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [top, bot] = THEMES[theme].sky.map(hex);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1), c = top.map((v, i) => Math.round(v + (bot[i] - v) * t));
    for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; }
  }
  const blit = (id, px, py) => {
    if (!id) return;
    const d = ts.tiles[id].img.d;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const c = d[j * 16 + i], X = px + i, Y = py + j;
      if (!c || X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4; out[o] = pal[c * 4]; out[o + 1] = pal[c * 4 + 1]; out[o + 2] = pal[c * 4 + 2];
    }
  };
  for (const layer of [level.decor, level.terrain]) for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) blit(layer[y * level.width + x], x * 16, y * 16);
  for (const o of level.objects) { const n = objectTile(o); if (n) blit(ts.names[n], o.x, o.y); }
  blit(ts.names.hero, level.spawn.x - 8, level.spawn.y - 8);
  return { w: W, h: H, rgba: out };
}

// Assembles the tile atlas: 47 ground autotiles, hand-drawn blocks/objects/decor, and the
// sliced prefab tiles. Pure JS (runs in Node and in the browser).
import { Img } from './img.js';
import { renderTerrain, tileCollision } from './terrain.js';
import { handTiles } from './art.js';
import { prefabDefs } from './prefabs.js';
import { themeRGBA } from './palette.js';

import { TILE } from '../core/units.js';

export { TILE };
export const COLUMNS = 32;
// neighbour bits for ground autotiling
export const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128;
export function normalizeBlob(m) {
  if (!(m & N && m & E)) m &= ~NE;
  if (!(m & S && m & E)) m &= ~SE;
  if (!(m & S && m & W)) m &= ~SW;
  if (!(m & N && m & W)) m &= ~NW;
  return m;
}
const BIT = { '0,-1': N, '1,-1': NE, '1,0': E, '1,1': SE, '0,1': S, '-1,1': SW, '-1,0': W, '-1,-1': NW };

let cached = null;
export function buildTileset() {
  if (cached) return cached;
  const tiles = [null]; // id 0 = empty; ids match Tiled gids (firstgid 1)
  const names = {};
  const keys = new Map();
  const add = (name, img, meta = {}) => {
    if (img.isEmpty() && !meta.mask) { names[name] = 0; return 0; }
    const key = [img.d.join(''), meta.mask, meta.ang, meta.kind, meta.path, meta.block].join('|');
    let id = keys.get(key);
    if (!id) { id = tiles.length; tiles.push({ id, name, img, ...meta }); keys.set(key, id); }
    names[name] = id;
    return id;
  };

  // --- ground: all 47 "blob" neighbour configurations
  const ground = new Uint16Array(256);
  for (let m = 0; m < 256; m++) {
    const n = normalizeBlob(m);
    if (n !== m) continue;
    const r = renderTerrain(TILE, TILE, (x, y) => {
      const k = `${Math.sign(Math.floor(x / TILE))},${Math.sign(Math.floor(y / TILE))}`;
      return k === '0,0' || (n & BIT[k]) !== 0;
    });
    ground[m] = add(`ground_${m}`, r.img, { kind: 'ground', ...tileCollision(r, 0, 0) });
  }
  for (let m = 0; m < 256; m++) ground[m] = ground[normalizeBlob(m)];

  for (const [name, img, meta] of handTiles()) add(name, img, meta);

  // --- prefabs
  const prefabs = {};
  for (const d of prefabDefs()) {
    const w = (d.x1 - d.x0) / TILE, h = (d.y1 - d.y0) / TILE;
    const r = renderTerrain(w * TILE, h * TILE, (x, y) => d.solid(x + d.x0, y + d.y0));
    const cells = [];
    for (let row = 0; row < h; row++) {
      const line = [];
      for (let col = 0; col < w; col++) {
        const col_ = tileCollision(r, col * TILE, row * TILE);
        if (!col_) { line.push(0); continue; }
        const path = d.path ? d.path(d.x0 + (col + 0.5) * TILE, d.y0 + (row + 0.5) * TILE) : null;
        const meta = { kind: 'ground', ...col_ };
        if (path) meta.path = path;
        line.push(add(`${d.name}:${col},${row}`, r.img.sub(col * TILE, row * TILE, TILE, TILE), meta));
      }
      cells.push(line);
    }
    prefabs[d.name] = {
      name: d.name, w, h, cells,
      colOff: d.x0 / TILE, rowOff: d.y0 / TILE, // position of cells[0][0] relative to (start column, ground row)
      width: d.W / TILE, dy: d.dy, cliff: !!d.cliff,
      objects: d.objects || [],
      // surface height (px, relative to starting ground) at a given x inside the piece
      surface: d.type === 'height' ? d.H : () => 0,
    };
  }

  cached = { tileSize: TILE, columns: COLUMNS, tiles, names, ground, prefabs, rowsCount: Math.ceil((tiles.length - 1) / COLUMNS) };
  return cached;
}

// The whole sheet as an indexed image (tile id n sits at atlas index n-1).
export function atlasImage(ts) {
  const img = new Img(ts.columns * TILE, ts.rowsCount * TILE);
  for (let id = 1; id < ts.tiles.length; id++) img.blit(ts.tiles[id].img, ((id - 1) % ts.columns) * TILE, Math.floor((id - 1) / ts.columns) * TILE);
  return img;
}
export function toRGBA(img, theme) {
  const pal = themeRGBA(theme);
  const out = new Uint8ClampedArray(img.w * img.h * 4);
  for (let i = 0; i < img.d.length; i++) { const c = img.d[i] * 4; out[i * 4] = pal[c]; out[i * 4 + 1] = pal[c + 1]; out[i * 4 + 2] = pal[c + 2]; out[i * 4 + 3] = pal[c + 3]; }
  return out;
}

// Tiled (mapeditor.org) JSON import/export, so levels and the tileset open in a standard editor.
import { objectTile } from './render.js';
import { TILE } from '../core/units.js';

export function tilesetToTiled(ts, image, imagewidth, imageheight) {
  const tiles = [];
  for (let id = 1; id < ts.tiles.length; id++) {
    const t = ts.tiles[id];
    const properties = [{ name: 'name', type: 'string', value: t.name }];
    if (t.block) properties.push({ name: 'block', type: 'string', value: t.block });
    if (t.path) properties.push({ name: 'path', type: 'string', value: t.path });
    if (t.ang) properties.push({ name: 'angles', type: 'string', value: t.ang.map((a) => (a == null ? '-' : a)).join(',') });
    tiles.push({ id: id - 1, type: t.kind, properties });
  }
  return { type: 'tileset', tiledversion: '1.10.2', version: '1.10', name: 'super-mb', image, imagewidth, imageheight, tilewidth: TILE, tileheight: TILE, margin: 0, spacing: 0, columns: ts.columns, tilecount: ts.tiles.length - 1, tiles };
}

export function levelToTiled(ts, level, tilesetSource = '../assets/tileset.tsj') {
  const layer = (id, name, data) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width: level.width, height: level.height, opacity: 1, visible: true, data: Array.from(data) });
  let oid = 1;
  const objects = level.objects.map((o) => {
    const name = objectTile(o), extra = Object.entries(o).filter(([k]) => !['type', 'x', 'y', 'w', 'h'].includes(k));
    const out = { id: oid++, name: '', type: o.type, x: o.x, y: o.y, width: o.w, height: o.h, rotation: 0, visible: true };
    if (name) { out.gid = ts.names[name]; out.y = o.y + o.h; } // tile objects are anchored bottom-left in Tiled
    if (extra.length) out.properties = extra.map(([k, v]) => ({ name: k, type: typeof v === 'number' ? 'float' : 'string', value: v }));
    return out;
  });
  objects.push({ id: oid++, name: 'spawn', type: 'spawn', x: level.spawn.x, y: level.spawn.y, width: 0, height: 0, point: true, rotation: 0, visible: true });
  return {
    type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: level.width, height: level.height, tilewidth: TILE, tileheight: TILE, nextlayerid: 4, nextobjectid: oid,
    properties: [{ name: 'name', type: 'string', value: level.name }, { name: 'theme', type: 'string', value: level.theme }],
    tilesets: [{ firstgid: 1, source: tilesetSource }],
    layers: [layer(1, 'decor', level.decor), layer(2, 'terrain', level.terrain), { id: 3, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects }],
  };
}

export function levelFromTiled(map) {
  const prop = (list, k) => ((list || []).find((p) => p.name === k) || {}).value;
  const layer = (n) => map.layers.find((l) => l.name === n);
  const level = { name: prop(map.properties, 'name') || 'Untitled', theme: prop(map.properties, 'theme') || 'meadow', width: map.width, height: map.height, tile: TILE, terrain: Uint16Array.from(layer('terrain').data), decor: Uint16Array.from(layer('decor').data), objects: [], spawn: { x: 56, y: 100 } };
  for (const o of layer('objects').objects) {
    if (o.type === 'spawn') { level.spawn = { x: o.x, y: o.y }; continue; }
    const out = { type: o.type, x: o.x, y: o.gid ? o.y - o.height : o.y, w: o.width, h: o.height };
    for (const p of o.properties || []) out[p.name] = p.value;
    level.objects.push(out);
  }
  return level;
}

// Regenerates everything under assets/, levels/, docs/ and demo/ from the sources.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildTileset, atlasImage, toRGBA } from '../src/tileset/tileset.js';
import { THEMES } from '../src/tileset/palette.js';
import { encodePNG } from '../src/core/png.js';
import { EXAMPLES } from '../src/level/examples.js';
import { generateLevel } from '../src/level/generator.js';
import { renderLevel } from '../src/level/render.js';
import { levelToTiled, tilesetToTiled } from '../src/level/tiled.js';
import { playtest } from '../src/engine/bot.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); console.log('wrote', rel); };
const json = (v) => JSON.stringify(v);

const ts = buildTileset();
const atlas = atlasImage(ts);
for (const theme of Object.keys(THEMES)) {
  out(`assets/tileset-${theme}.png`, encodePNG(atlas.w, atlas.h, toRGBA(atlas, theme)));
  // 3x contact sheet on the theme's sky colour, for the README
  const rgba = toRGBA(atlas, theme), sky = THEMES[theme].sky[0];
  for (let i = 0; i < rgba.length; i += 4) if (!rgba[i + 3]) { rgba[i] = parseInt(sky.slice(1, 3), 16); rgba[i + 1] = parseInt(sky.slice(3, 5), 16); rgba[i + 2] = parseInt(sky.slice(5, 7), 16); rgba[i + 3] = 255; }
  out(`docs/tileset-${theme}.png`, encodePNG(atlas.w, atlas.h, rgba, 3));
}
out('assets/tileset.tsj', json(tilesetToTiled(ts, 'tileset-meadow.png', atlas.w, atlas.h)));
// engine-side metadata: collision masks, angles, autotile table, prefab stamps
out('assets/tileset.json', json({
  tileSize: 16, columns: ts.columns,
  tiles: ts.tiles.map((t) => t && { id: t.id, name: t.name, kind: t.kind, block: t.block, path: t.path, mask: t.mask, ang: t.ang }),
  names: ts.names, ground: Array.from(ts.ground),
  prefabs: Object.fromEntries(Object.entries(ts.prefabs).map(([k, p]) => [k, { w: p.w, h: p.h, colOff: p.colOff, rowOff: p.rowOff, width: p.width, dy: p.dy, cliff: p.cliff, cells: p.cells, objects: p.objects }])),
}));

const levels = EXAMPLES.map((e) => ({ id: e.id, level: e.build(ts) }));
for (const [seed, flow, difficulty] of [[7, 0.2, 0.4], [21, 0.5, 0.6], [1984, 0.85, 0.8]]) levels.push({ id: `generated-${seed}`, level: generateLevel(ts, { seed, flow, difficulty }) });
for (const { id, level } of levels) {
  const test = playtest(ts, level);
  console.log(`${id}: ${level.width}x${level.height}, bot ${test.ok ? `finished in ${test.frames} frames` : `FAILED (${test.reason} at x=${test.x})`}`);
  out(`levels/${id}.tmj`, json(levelToTiled(ts, level)));
  const im = renderLevel(ts, level);
  out(`docs/${id}.png`, encodePNG(im.w, im.h, im.rgba));
}

// playable demo: one self-contained HTML file
const bundle = await build({ entryPoints: [path.join(root, 'src/web/main.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const page = fs.readFileSync(path.join(root, 'src/web/page.html'), 'utf8').replace('/*__BUNDLE__*/', () => bundle.outputFiles[0].text.replace(/<\/script/g, '<\\/script'));
out('demo/index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);
const frag = process.argv.indexOf('--fragment');
if (frag > 0) { fs.writeFileSync(process.argv[frag + 1], page); console.log('wrote fragment', process.argv[frag + 1]); }

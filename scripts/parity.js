// Prints what the bot does on each level baked for Godot, in the same format as
// godot/tests/parity.gd, so the two simulations can be compared line by line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTileset } from '../src/tileset/tileset.js';
import { Sim } from '../src/engine/sim.js';
import { Bot } from '../src/engine/bot.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../godot/assets/levels');
const ts = buildTileset(), only = process.argv.slice(2);
for (const info of JSON.parse(fs.readFileSync(path.join(dir, 'index.json')))) {
  if (only.length && !only.includes(info.id)) continue;
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `${info.id}.json`)));
  const level = { ...raw, terrain: Uint16Array.from(raw.terrain), decor: Uint16Array.from(raw.decor) };
  const sim = new Sim(ts, level), bot = new Bot(), limit = level.width * 40 + 1200;
  while (sim.frame < limit && !sim.p.dead && !sim.p.won) sim.step(bot.input(sim));
  console.log(`${info.id} frames=${sim.frame} won=${sim.p.won} dead=${sim.p.dead} gems=${sim.p.gems} x=${sim.p.x.toFixed(2)} y=${sim.p.y.toFixed(2)}`);
}

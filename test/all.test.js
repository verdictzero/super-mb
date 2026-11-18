import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTileset, normalizeBlob } from '../src/tileset/tileset.js';
import { EXAMPLES } from '../src/level/examples.js';
import { generateLevel } from '../src/level/generator.js';
import { levelToTiled, levelFromTiled } from '../src/level/tiled.js';
import { playtest } from '../src/engine/bot.js';
import { Sim } from '../src/engine/sim.js';
import { LevelBuilder } from '../src/level/builder.js';

const ts = buildTileset();

test('tileset: 47 ground autotiles, slope and loop metadata', () => {
  assert.equal(new Set(Array.from({ length: 256 }, (_, m) => normalizeBlob(m))).size, 47);
  assert.equal(new Set(ts.ground).size, 47);
  assert.deepEqual(ts.tiles[ts.names.ground_0].ang, [0, 90, 180, 270]);
  assert.equal(ts.tiles[ts.names['ramp45_up_1:1,0']].ang[0], 45);
  const paths = new Set(ts.prefabs.loop6.cells.flat().filter(Boolean).map((id) => ts.tiles[id].path));
  assert.deepEqual([...paths].sort(), ['A', 'B', undefined].sort());
});

const track = (pieces) => { const b = new LevelBuilder(ts); b.flat(12); pieces(b); b.flat(30); return b.finish(); };
const runRight = (level, frames) => {
  const sim = new Sim(ts, level);
  let topped = false;
  for (let i = 0; i < frames; i++) { sim.step({ right: true }); if (sim.p.grounded && sim.p.ang > 150 && sim.p.ang < 210) topped = true; }
  return { sim, topped };
};

for (const name of ['loop6', 'loop10']) {
  test(`${name}: a boosted run goes over the top and out the far side`, () => {
    const level = track((b) => b.runUp(6).piece(name));
    const L = level.objects.find((o) => o.type === 'loop');
    const { sim, topped } = runRight(level, 400);
    assert.ok(topped, 'was upside down on the ceiling');
    assert.ok(sim.p.x > L.x + L.w + 16, 'exited to the right');
    assert.equal(sim.p.path, 'B');
  });
}
test('loop10: from a standing start you slide back down instead of clipping through', () => {
  const b = new LevelBuilder(ts); b.flat(6).piece('loop10').flat(30);
  const level = b.finish(), L = level.objects.find((o) => o.type === 'loop');
  const sim = new Sim(ts, level);
  let topped = false;
  for (let i = 0; i < 240; i++) { sim.step({ right: true }); if (sim.p.grounded && sim.p.ang > 150 && sim.p.ang < 210) topped = true; }
  assert.ok(!topped);
  assert.ok(sim.p.x < L.x + L.w && sim.p.y < L.y + L.h + 8 && !sim.p.dead);
});
test('quarter pipe launches a fast runner upward', () => {
  const level = track((b) => b.runUp(6).piece('qp_up'));
  const sim = new Sim(ts, level);
  let minY = Infinity;
  for (let i = 0; i < 200; i++) { sim.step({ right: true }); minY = Math.min(minY, sim.p.y); }
  assert.ok(minY < level.spawn.y - 80, `peak ${level.spawn.y - minY}px above start`);
});

for (const e of EXAMPLES) test(`example ${e.id} is completable`, () => { const r = playtest(ts, e.build(ts)); assert.ok(r.ok, JSON.stringify(r)); });

test('generator: deterministic, validated, within height bounds', () => {
  const a = generateLevel(ts, { seed: 42 }), b = generateLevel(ts, { seed: 42 });
  assert.deepEqual(a.terrain, b.terrain);
  assert.notDeepEqual(a.terrain, generateLevel(ts, { seed: 43 }).terrain);
  for (let seed = 1; seed <= 30; seed++) for (const flow of [0, 0.5, 1]) {
    const L = generateLevel(ts, { seed, flow, difficulty: (seed % 5) / 4 });
    assert.ok(L.meta.validated, `seed ${seed} flow ${flow}`);
    assert.ok(L.width >= 180 && L.objects.some((o) => o.type === 'goal'));
  }
});

test('Tiled export round-trips', () => {
  const L = EXAMPLES[0].build(ts), back = levelFromTiled(JSON.parse(JSON.stringify(levelToTiled(ts, L))));
  assert.deepEqual(back.terrain, L.terrain);
  assert.equal(back.objects.length, L.objects.length);
  assert.ok(playtest(ts, back).ok);
});

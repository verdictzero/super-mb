import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTileset, normalizeBlob } from '../src/tileset/tileset.js';
import { EXAMPLES } from '../src/level/examples.js';
import { generateLevel } from '../src/level/generator.js';
import { levelToTiled, levelFromTiled } from '../src/level/tiled.js';
import { playtest } from '../src/engine/bot.js';
import { Sim } from '../src/engine/sim.js';
import { LevelBuilder } from '../src/level/builder.js';
import { TILE } from '../src/core/units.js';

const ts = buildTileset();

test('tileset: 47 ground autotiles, slope and loop metadata', () => {
  assert.equal(new Set(Array.from({ length: 256 }, (_, m) => normalizeBlob(m))).size, 47);
  assert.equal(new Set(ts.ground).size, 47);
  assert.deepEqual(ts.tiles[ts.names.ground_0].ang, [0, 90, 180, 270]);
  assert.equal(ts.tiles[ts.names['ramp45_up_1:1,0']].ang[0], 45);
  const paths = new Set(ts.prefabs.loop6.cells.flat().filter(Boolean).map((id) => ts.tiles[id].path));
  assert.deepEqual([...paths].sort(), ['A', 'B', undefined].sort());
});

const track = (pieces) => { const b = new LevelBuilder(ts, { height: 40, ground: 32 }); b.flat(12); pieces(b); b.flat(30); return b.finish(); };
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
    assert.ok(sim.p.x > L.x + L.w + TILE, 'exited to the right');
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
  assert.ok(sim.p.x < L.x + L.w && sim.p.y < L.y + L.h + TILE / 2 && !sim.p.dead);
});
test('quarter pipe launches a fast runner upward', () => {
  const level = track((b) => b.runUp(6).piece('qp_up'));
  const sim = new Sim(ts, level);
  let minY = Infinity;
  for (let i = 0; i < 200; i++) { sim.step({ right: true }); minY = Math.min(minY, sim.p.y); }
  assert.ok(minY < level.spawn.y - 5 * TILE, `peak ${level.spawn.y - minY}px above start`);
});

for (const e of EXAMPLES) test(`example ${e.id} is completable`, () => { const r = playtest(ts, e.build(ts)); assert.ok(r.ok, JSON.stringify(r)); });

test('generator: deterministic, tall, multi-tiered and validated on both routes', () => {
  const a = generateLevel(ts, { seed: 42 }), b = generateLevel(ts, { seed: 42 });
  assert.deepEqual(a.terrain, b.terrain);
  assert.notDeepEqual(a.terrain, generateLevel(ts, { seed: 43, validate: false }).terrain);
  let tiers = 0, basements = 0, tall = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const L = generateLevel(ts, { seed, flow: (seed % 3) / 2, difficulty: (seed % 5) / 4 });
    assert.ok(L.meta.validated, `seed ${seed}`);
    assert.ok(L.height >= 100 && L.width >= 300 && L.objects.some((o) => o.type === 'goal'));
    const names = L.meta.pieces.map((p) => p.piece);
    tiers += names.filter((n) => n.startsWith('tier')).length; basements += names.filter((n) => n === 'basement').length; tall += names.filter((n) => n === 'tallLoop').length;
    const rows = L.objects.filter((o) => o.type === 'gem').map((o) => o.y / TILE);
    assert.ok(Math.max(...rows) - Math.min(...rows) > 30, `seed ${seed} spans ${Math.max(...rows) - Math.min(...rows)} rows`);
  }
  assert.ok(tiers >= 8 && basements >= 2 && tall >= 3, JSON.stringify({ tiers, basements, tall }));
});
for (const name of ['loop14', 'loop18']) test(`${name}: boosted run completes the tall loop`, () => {
  const level = track((b) => b.runUp(8).piece(name));
  const L = level.objects.find((o) => o.type === 'loop');
  const { sim, topped } = runRight(level, 600);
  assert.ok(topped && sim.p.x > L.x + L.w + TILE);
});

test('Tiled export round-trips', () => {
  const L = EXAMPLES[0].build(ts), back = levelFromTiled(JSON.parse(JSON.stringify(levelToTiled(ts, L))));
  assert.deepEqual(back.terrain, L.terrain);
  assert.equal(back.objects.length, L.objects.length);
  assert.ok(playtest(ts, back).ok);
});

test('checkpoints: touching a lamp moves the respawn point', () => {
  const b = new LevelBuilder(ts); b.flat(10).checkpoint(0).flat(10).gap(40);
  const level = b.finish(), sim = new Sim(ts, level);
  for (let i = 0; i < 600 && !sim.p.dead; i++) sim.step({ right: true });
  assert.equal(sim.p.why, 'fell');
  sim.reset(true);
  assert.ok(sim.p.x > 9 * TILE && sim.objs.find((o) => o.type === 'checkpoint').on);
  sim.reset();
  assert.equal(sim.p.x, level.spawn.x);
});

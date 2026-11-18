// Three hand-made levels, written with the same builder the generator uses.
import { LevelBuilder } from './builder.js';
import { makeRng } from '../core/rng.js';

function meadowRun(ts) {
  const b = new LevelBuilder(ts, { name: 'Meadow Run', theme: 'meadow' });
  b.flat(10);
  b.blocks('B?B', 4, 2).gems(3, 1, 2).flat(8);                 // first blocks
  b.pipe(2).enemy(2).flat(5).pipe(3).flat(4);                  // pipes with a walker between
  b.gems(3, 3, 0, 1).gap(3).flat(4);                           // first pit
  b.piece('roll_up').gemsOnLast().flat(3).blocks('?B?B?', 4, 1).flat(7);
  b.piece('ramp22_down_2').flat(3);
  b.stairs(3, 1).gap(3).stairs(3, -1).flat(4);                 // stair gap
  b.piece('hump').gemsOnLast().flat(2).piece('dip').gemsOnLast().flat(3);
  b.flat(2).runUp(6).piece('loop6').gemsInLoop(6).flat(6);   // first loop
  b.enemy(3).flat(6).spikes(1, 2).flat(6);
  b.flat(1).runUp(5).piece('kicker').gems(6, 3, 0, 2).gap(6).flat(8);
  b.piece('ramp45_up_2').flat(4).blocks('BB?BB', 4, 0).flat(6).piece('ramp45_down_2').flat(4);
  b.stairs(4, 1).flat(1).goal();
  return b.decorate(makeRng(11)).finish();
}

function cavernCoil(ts) {
  const b = new LevelBuilder(ts, { name: 'Cavern Coil', theme: 'cavern', ceiling: 3 });
  b.flat(9);
  b.step(-1).flat(4).step(-1).gems(3, 2).flat(5);              // ledges up
  b.pipe(2).flat(3).spikes(2, 1).flat(6);
  b.piece('dip').gemsOnLast().flat(2).piece('dip').gemsOnLast().flat(4);
  b.flat(1).runUp(6).piece('qp_up').flat(3).blocks('?', 4, 1).flat(5); // quarter pipe wall
  b.gap(3).flat(3).gap(4).blocks('___', 0, -4).flat(4);        // pits, plank in the second
  b.piece('sdrop').gemsOnLast().flat(5).enemy(2).flat(8);
  b.runUp(7).piece('loop10').gemsInLoop(10).flat(4);
  b.piece('ramp22_up_1').flat(3).blocks('B?B', 4, 0).flat(5).piece('ramp22_down_1').flat(3);
  b.spring(2).flat(3).step(-5).gems(4, 2, 1).flat(13);          // spring up to a shelf
  b.piece('qp_down').flat(3).piece('roll_down').gemsOnLast().flat(5);
  b.pipe(3).flat(4).enemy(1).flat(4).pipe(2).flat(4);
  b.goal();
  return b.decorate(makeRng(22)).finish();
}

function duskSpeedway(ts) {
  const b = new LevelBuilder(ts, { name: 'Dusk Speedway', theme: 'dusk' });
  b.flat(8).runUp(6);
  b.piece('hump').gemsOnLast().flat(1).piece('hump').gemsOnLast().flat(3);
  b.piece('loop6').gemsInLoop(6).flat(3).runUp(5).piece('loop10').gemsInLoop(10).flat(5); // double loop
  b.piece('roll_up').gemsOnLast().flat(2).piece('roll_up').gemsOnLast().flat(4);
  b.flat(1).runUp(5).piece('kicker').gems(8, 4, 0, 2).gap(9).step(2).flat(8); // big jump down
  b.blocks('___', 3, 2).blocks('?', 7, 3).flat(8).enemy(0).flat(5);
  b.piece('sdrop').gemsOnLast().flat(3).booster(0).flat(4).piece('dip').gemsOnLast().flat(3);
  b.piece('ramp45_up_3').flat(5).gap(4).flat(4).piece('ramp22_up_2').flat(6);
  b.spikes(2, 2).flat(8).piece('ramp45_down_3').flat(3);
  b.flat(1).runUp(6).piece('qp_up').flat(6).stairs(3, 1).flat(1);
  b.goal();
  return b.decorate(makeRng(33)).finish();
}

export const EXAMPLES = [
  { id: 'meadow-run', build: meadowRun },
  { id: 'cavern-coil', build: cavernCoil },
  { id: 'dusk-speedway', build: duskSpeedway },
];

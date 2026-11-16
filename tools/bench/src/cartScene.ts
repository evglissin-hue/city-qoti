// R2E: the cart scenes of the outcome report (docs/build/cycle-r2e-bench.md, task 4, outcome 6).
// A cart hauls a load from the granary to a market stall on a small town (the Village test fixture:
// lane A, street B and a lane between them) while a stretch of road is an evening street
// (`road.setEvening`, seat 0). Two scenes: a loop (a second way round exists, so the cart should
// drive round the stretch) and a one-road town (no way round, so the cart should wait at the edge
// and deliver after 21:00). Reads carts from `state.carts`, as the traffic system keeps them.
// Depends on R2B (traffic and logistics route round evening streets); on stand-ins the cart drives
// straight through and the numbers say so.
import { content } from '@qoti/content';
import { applyTurn, createTickCtx, MAP_SIZE, Road, START_HOUR, TICKS_PER_HOUR } from '@qoti/sim';
import type { WorldState } from '@qoti/sim';
import { findById } from '../../../packages/sim/src/state/entities';
import { isFood } from '../../../packages/sim/src/state/zones';
import { ticks, toWork } from '../../../packages/sim/test/ledger/helpers';
import { place, staff, villageWith } from '../../../packages/sim/test/village/helpers';

const S = MAP_SIZE;
const H = TICKS_PER_HOUR;
/** Ticks into the sim clock for an hour of the day (06:00 is tick 0). */
const at = (hour: number): number => Math.round((hour - START_HOUR) * H);

export type CartScene = 'loop' | 'oneRoad';

export interface CartRun {
  scene: CartScene;
  /** Whether the stretch was marked an evening street. */
  marked: boolean;
  /** A cart took a job at all. */
  jobTaken: boolean;
  /** Ticks from the job taken to the delivery, or -1 for none by the end. */
  tripTicks: number;
  /** Clock hour (fractional) of the delivery, or -1. */
  deliveredAt: number;
  /** Ticks the cart stood on an evening tile between 17:00 and 21:00. */
  onEveningTiles: number;
  /** The cart was parked at its shed with no job at the end. */
  parkedAtEnd: boolean;
  /** Clock hour of the end of the run. */
  endHour: number;
}

function hourOf(w: WorldState): number {
  return ((w.tick + START_HOUR * H) % (24 * H)) / H;
}

/** Marks a lane A stretch (x from..to at z 50) an evening street, as seat 0. */
function markStretch(w: WorldState, from: number, to: number): number[] {
  const tiles: [number, number][] = [];
  for (let x = from; x <= to; x++) tiles.push([x, 50]);
  const ctx = createTickCtx(w);
  applyTurn(
    w,
    { t: w.lastTurn + 1, cmds: [{ seat: 0, seq: 1, cmd: { t: 'road.setEvening', tiles, on: true } }] },
    ctx,
  );
  return tiles.map(([x, z]) => z * S + x);
}

/** Runs one scene from 16:30 to `until` o'clock (default 23:00) and measures the cart. */
export function runCartScene(scene: CartScene, marked: boolean, until = 23): CartRun {
  const f = villageWith();
  const w = f.state;
  for (const id of f.b.storehouses) findById(w.buildings, id)!.rt!.paused = true;
  for (const fam of w.carrier.families) fam.rule = 'never';
  const shed = place(w, 'cart-shed', 88, 47);
  toWork(w, staff(w, shed, 1));
  const store = findById(w.buildings, f.b.granary)!;
  store.rt!.paused = false;
  store.rt!.workers.length = 0;
  let evening: number[] = [];
  if (scene === 'loop') {
    // A second way round: a lane down the east end, from lane A to street B.
    for (let z = 51; z < 70; z++) w.map.road[z * S + 96] = Road.lane;
    w.networkVersion++;
    if (marked) evening = markStretch(w, 82, 88);
  } else if (marked) {
    evening = markStretch(w, 50, 58);
  }
  const evenSet = new Set(evening);
  const stalls = w.buildings.filter((b) => b.def === 'market-stall');
  const stallFood = () =>
    stalls.reduce(
      (m, b) => m + content.goods.reduce((n, _g, i) => n + (isFood(i) ? b.rt!.store[i]! : 0), 0),
      0,
    );
  w.tick = at(16.5);
  const food0 = stallFood();
  const run: CartRun = {
    scene,
    marked,
    jobTaken: false,
    tripTicks: -1,
    deliveredAt: -1,
    onEveningTiles: 0,
    parkedAtEnd: false,
    endHour: 0,
  };
  let jobAt = -1;
  const total = Math.round((until - 16.5) * H);
  ticks(w, total, (s) => {
    const c = s.carts[0];
    if (!c) return;
    if (c.job && jobAt < 0) {
      jobAt = s.tick;
      run.jobTaken = true;
    }
    const hr = hourOf(s);
    if (hr >= 17 && hr < 21 && evenSet.has(c.tile) && !c.parked) run.onEveningTiles++;
    if (jobAt >= 0 && run.tripTicks < 0 && stallFood() > food0) {
      run.tripTicks = s.tick - jobAt;
      run.deliveredAt = hr;
    }
  });
  const c = w.carts[0];
  run.parkedAtEnd = !!c && c.parked && c.job === 0;
  run.endHour = hourOf(w);
  return run;
}

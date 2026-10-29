// Construction sites (docs/spec/13-ledger.md, Construction). Porters bring a site's materials
// (logistics); builders from the town hall and builder's yards walk to the site and add work,
// which keeps pace with the materials delivered so far, so a site rises through its stages
// (staked plot, foundation, frame, roof) in order. Sites are served in placement order, raised
// sites first. Builders with no site to work on repair worn buildings when the town can afford it.
import type { BuildingDef } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../constants';
import type { Building, Resident, System, TickCtx, WorldState } from '../../contracts';
import { footprintSize } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { constructionStage } from '../../view/hamlet';
import { economyDial } from '../economy/dial';
import { emitBuilding } from '../economy/emit';
import { isWorkTime } from '../economy/time';
import { markCharmDirty } from '../hearth/charm/dirty';
import { doorTile } from '../movement/api';
import { defOf } from '../logistics/stores';
import { available, finishTask, productivity, startTask, walkTo } from '../logistics/tasks';
import { storehouseReach } from '../logistics/range';
import { allowedWork, computeStatus, materialsDue } from '../production/status';

export const MAX_BUILDERS_PER_SITE = 3;
const MATCH_EVERY = 20;
const MATCH_OFFSET = 15;

export const construction: System = {
  id: 'construction',
  order: 20,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const workTime = isWorkTime(state.tick);
    tickBuilders(state, ctx, workTime);
    if (workTime && state.tick % MATCH_EVERY === MATCH_OFFSET) matchBuilders(state);
  },
};

export function isBuilderPlace(def: BuildingDef | undefined): boolean {
  return def?.jobs?.role === 'builder';
}

/** What a builder can do at a building right now. */
function workAt(state: WorldState, b: Building): 'build' | 'repair' | null {
  const rt = b.rt;
  if (!rt || rt.paused) return null;
  if (b.stage === 'construction')
    return rt.construction && rt.construction.workDone < allowedWork(rt) ? 'build' : null;
  return rt.condition < 100 && !state.economy.leanTimes ? 'repair' : null;
}

/** Builder-ticks one builder adds this tick: 1 at 100% productivity, spread evenly otherwise. */
function workUnits(r: Resident, tick: number): number {
  const p = productivity(r);
  return Math.floor(p / 100) + ((tick + r.id) % 20 < (p % 100) / 5 ? 1 : 0);
}

function tickBuilders(state: WorldState, ctx: TickCtx, workTime: boolean): void {
  for (const r of state.residents) {
    if (r.activity.kind !== 'task' || r.activity.taskId >= 0) continue;
    const b = findById(state.buildings, -r.activity.taskId);
    const what = b && workTime ? workAt(state, b) : null;
    if (!b || !what) {
      finishTask(state, r, workTime);
      continue;
    }
    const at = walkTo(state, r, doorTile(b));
    if (at === null) {
      finishTask(state, r, workTime);
      continue;
    }
    if (!at) continue;
    if (what === 'build') build(state, ctx, b, workUnits(r, state.tick));
    else repair(state, b, r);
  }
}

function build(state: WorldState, ctx: TickCtx, b: Building, units: number): void {
  const rt = b.rt!;
  const c = rt.construction!;
  const before = constructionStage(rt);
  c.workDone = Math.min(allowedWork(rt), c.workDone + units);
  if (c.workDone >= c.work && !materialsDue(rt)) {
    finish(state, ctx, b);
    return;
  }
  if (constructionStage(rt) !== before) emitBuilding(state, ctx, b);
}

function repair(state: WorldState, b: Building, r: Resident): void {
  const every = Math.max(1, Math.floor(TICKS_PER_HOUR / economyDial(state.settings.economy).repairPerHour));
  if ((state.tick + r.id) % every === 0) b.rt!.condition = Math.min(100, b.rt!.condition + 1);
}

/** A site becomes a building: runtime reset to working order, builders head back. */
export function finish(state: WorldState, ctx: TickCtx, b: Building): void {
  const rt = b.rt!;
  b.stage = 'built';
  rt.construction = null;
  rt.condition = 100;
  rt.progress = 0;
  const def = defOf(b);
  if (def) {
    const [w, d] = footprintSize(def, b.rot);
    markCharmDirty(state, [b.x - 1, b.z - 1, b.x + w, b.z + d]);
    rt.status = computeStatus(state, b, def, storehouseReach(state));
  }
  emitBuilding(state, ctx, b);
  const door = doorTile(b);
  ctx.events.push({
    e: 'notify',
    kind: 'built',
    text: finishedLine(def),
    at: [door % MAP_SIZE, Math.floor(door / MAP_SIZE)],
  });
}

const FINISHED: readonly [id: string, text: string][] = [
  ['bakery', 'The bakery is finished. Expect visitors who were just passing, every morning.'],
  ['builders-yard', "The builder's yard is open. Everyone suddenly has opinions about fences."],
  ['cottage', 'A new cottage is finished. The paint is dry, mostly.'],
  ['farmhouse', 'The farmhouse is finished. The fields are waiting to be told where they are.'],
  ['fishers-hut', "The fisher's hut is finished. The river has been warned."],
  ['foresters-lodge', "The forester's lodge is finished. Somebody has to put the trees back."],
  ['market-stall', 'A market stall is up. The awning is already doing its best.'],
  ['quarry', 'The quarry is open. It will be loud, and it will be worth it.'],
  ['sawpit', 'The sawpit is finished. Logs go in, planks come out, sawdust goes everywhere.'],
  ['storehouse', 'The new storehouse is finished. It echoes, for now.'],
  ['vegetable-plot', 'The vegetable plot is dug. The cabbages have a lot to live up to.'],
  ['well', 'The well is finished. The water tastes faintly of achievement.'],
  ['windmill', 'The windmill is finished and turning, slowly, like it means it.'],
  ['woodcutter', "The woodcutter's hut is finished. The nearest trees look nervous."],
];

function finishedLine(def: BuildingDef | undefined): string {
  if (!def) return 'Something new is finished.';
  return FINISHED.find(([id]) => id === def.id)?.[1] ?? `The ${def.name.toLowerCase()} is finished.`;
}

/** Idle builders in id order take the first site that wants work, raised sites first. */
function matchBuilders(state: WorldState): void {
  const idle: { r: Resident; home: Building }[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || !isBuilderPlace(defOf(b))) continue;
    for (const id of b.rt.workers) {
      const r = findById(state.residents, id);
      if (r && available(r, b)) idle.push({ r, home: b });
    }
  }
  if (idle.length === 0) return;
  idle.sort((a, b) => a.r.id - b.r.id);

  const crews = new Map<number, number>();
  for (const r of state.residents) {
    if (r.activity.kind === 'task' && r.activity.taskId < 0) {
      crews.set(-r.activity.taskId, (crews.get(-r.activity.taskId) ?? 0) + 1);
    }
  }
  const sites = state.buildings
    .filter((b) => b.stage === 'construction' && workAt(state, b) === 'build')
    .sort(
      (a, b) => Number(b.rt!.construction!.priority) - Number(a.rt!.construction!.priority) || a.id - b.id,
    );
  const worn = state.economy.leanTimes
    ? []
    : state.buildings
        .filter((b) => b.stage === 'built' && b.rt && b.rt.condition < 100)
        .sort((a, b) => a.rt!.condition - b.rt!.condition || a.id - b.id);

  // Playtest round three: a site a builder cannot walk to is skipped for the rest of this round,
  // so one cut-off site never keeps every builder from the others.
  const unreachable = new Set<number>();
  for (const { r } of idle) {
    for (;;) {
      let target = sites.find(
        (s) => !unreachable.has(s.id) && (crews.get(s.id) ?? 0) < MAX_BUILDERS_PER_SITE,
      );
      target ??= worn.find((s) => !unreachable.has(s.id) && !crews.has(s.id));
      if (!target) return;
      if (startTask(state, r, -target.id, doorTile(target)) === 'unreachable') {
        finishTask(state, r, false);
        unreachable.add(target.id);
        continue;
      }
      crews.set(target.id, (crews.get(target.id) ?? 0) + 1);
      break;
    }
  }
}

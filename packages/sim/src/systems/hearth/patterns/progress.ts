// Playtest round six ("two plots and a fence, and nothing happens"): for each Pattern Book page not
// found yet, the attempt in the valley that comes closest, and in plain words what it still wants.
// The Pattern Book shows it under the hint, with a way to look. It reads the detectors' own rules
// (gardenAt, wallLines, litStretches...), so what it asks for is what the page needs.
import { content, type PatternDef } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../../constants';
import type { Building, PatternProgressView, WorldState } from '../../../contracts';
import {
  buildingRect,
  decorInRect,
  expandRect,
  isHomeDef,
  rectGap2,
  tileGap2,
  within,
} from '../../../conditions/geo';
import { TREE_MATURE, treeStage } from '../../../map/layers';
import { rankAtLeast } from '../../../state/village';
import { hedgedSides, MAX_GAP, straightRuns } from './detectors/hedgerowLane';
import { gardenAt } from './detectors/kitchenGarden';
import { treePaths } from './detectors/treePlace';
import { litStretches } from './detectors/lanternWalk';
import { shoreStretches } from './detectors/promenade';
import { wallLines } from './detectors/sittingWall';
import {
  buildingHasTag,
  dist2,
  hasTag,
  param,
  spanLength,
  tagged,
  taggedAlong,
  taggedIn,
  tileOf,
} from './shared';

const S = MAP_SIZE;

/** How far along an attempt is (0 to 1), where it is, and what it still wants. */
interface Attempt {
  score: number;
  x: number;
  z: number;
  wants: string[];
}

type Explainer = (state: WorldState, def: PatternDef) => Attempt | null;

function part(have: number, need: number): number {
  return Math.min(have, need) / need;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "the Fenwicks' cottage", or "the cottage" while nobody lives there. */
function homeName(state: WorldState, home: Building): string {
  const name = (content.buildingById.get(home.def)?.name ?? 'home').toLowerCase();
  const h = state.households.find((x) => x.homeId === home.id);
  return h ? `the ${h.family}s' ${name}` : `the empty ${name}`;
}

/**
 * The most nearly finished attempt that still wants something. One that wants nothing is either
 * about to be discovered or counted differently by its detector; either way the next best gives
 * the page a hint instead of none.
 */
function best(list: Attempt[]): Attempt | null {
  let out: Attempt | null = null;
  for (const a of list) if (a.wants.length > 0 && (!out || a.score > out.score)) out = a;
  return out;
}

const kitchenGarden: Explainer = (state, def) => {
  const need = param(def, 'plots', 2);
  const within = param(def, 'within', 3);
  const list: Attempt[] = [];
  for (const home of state.buildings) {
    if (home.stage !== 'built' || !isHomeDef(content.buildingById.get(home.def))) continue;
    const g = gardenAt(state, home, within);
    if (g.plots === 0 && g.fenced === 0) continue;
    const wants: string[] = [];
    if (g.plots < need) {
      wants.push(
        `${need - g.plots} more ${need - g.plots === 1 ? 'plot' : 'plots'} by ${homeName(state, home)} (${count(g.plots, 'plot')} counted; a plot counts with at most ${within - 1} empty tiles between it and the house, or another of its plots)`,
      );
    }
    if (g.fenced === 0) wants.push('a bit of fence or hedge along the plots, a tile or two from them');
    list.push({ score: part(g.plots, need) * 0.7 + (g.fenced ? 0.3 : 0), x: home.x, z: home.z, wants });
  }
  return best(list);
};

const wellGathering: Explainer = (state, def) => {
  const benchReach = param(def, 'benchReach', 3);
  const treeReach = param(def, 'treeReach', 3);
  const homeReach = param(def, 'homeReach', 8);
  const needBenches = param(def, 'benches', 2);
  const needHomes = param(def, 'homes', 3);
  const list: Attempt[] = [];
  for (const well of state.buildings) {
    if (well.stage !== 'built' || !buildingHasTag(well.def, 'well')) continue;
    const r = buildingRect(well);
    let benches = 0;
    for (const d of taggedIn(state, expandRect(r, benchReach), 'bench')) {
      const t = tileOf(d);
      if (within(tileGap2(t % S, (t - (t % S)) / S, r), benchReach)) benches++;
    }
    let tree = taggedIn(state, expandRect(r, treeReach), 'tree').some((d) => {
      const t = tileOf(d);
      return within(tileGap2(t % S, (t - (t % S)) / S, r), treeReach);
    });
    const a = expandRect(r, treeReach);
    for (let z = a[1]; z <= a[3] && !tree; z++)
      for (let x = a[0]; x <= a[2] && !tree; x++)
        if (state.map.tree[z * S + x] && within(tileGap2(x, z, r), treeReach)) tree = true;
    let homes = 0;
    for (const b of state.buildings) {
      if (
        b.stage === 'built' &&
        isHomeDef(content.buildingById.get(b.def)) &&
        within(rectGap2(buildingRect(b), r), homeReach)
      )
        homes++;
    }
    const wants: string[] = [];
    if (benches < needBenches)
      wants.push(
        `${count(needBenches - benches, 'more bench', 'more benches')} beside the well (${benches} there now)`,
      );
    if (!tree) wants.push('a tree for shade within three steps of it (a planted one counts)');
    if (homes < needHomes)
      wants.push(`${count(needHomes - homes, 'more home')} within ${homeReach} steps (${homes} now)`);
    list.push({
      score: (part(benches, needBenches) + (tree ? 1 : 0) + part(homes, needHomes)) / 3,
      x: well.x,
      z: well.z,
      wants,
    });
  }
  return best(list);
};

const treePlace: Explainer = (state, def) => {
  const needBenches = param(def, 'benches', 2);
  const reach = param(def, 'benchReach', 640) / TILE_FP;
  const needDirs = param(def, 'paths', 2);
  const pathReach = param(def, 'pathReach', 2);
  const list: Attempt[] = [];
  // Big trees with a bench somewhere near: map trees grown full, and ornamental trees.
  const seen = new Set<number>();
  for (const bench of tagged(state, 'bench')) {
    const t = tileOf(bench);
    const bx = t % S;
    const bz = (t - bx) / S;
    const r = Math.ceil(reach) + 1;
    const trees: [number, number, number][] = [];
    for (let z = bz - r; z <= bz + r; z++)
      for (let x = bx - r; x <= bx + r; x++) {
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const v = state.map.tree[z * S + x]!;
        if (v && treeStage(v) >= TREE_MATURE)
          trees.push([z * S + x, x * TILE_FP + TILE_FP / 2, z * TILE_FP + TILE_FP / 2]);
      }
    for (const d of taggedIn(state, [bx - r, bz - r, bx + r, bz + r], 'tree'))
      trees.push([tileOf(d), d.fx, d.fz]);
    for (const [tile, fx, fz] of trees) {
      if (seen.has(tile)) continue;
      seen.add(tile);
      const tx = tile % S;
      const tz = (tile - tx) / S;
      let benches = 0;
      for (const d of taggedIn(state, [tx - r, tz - r, tx + r, tz + r], 'bench'))
        if (dist2(d.fx, d.fz, fx, fz) <= reach * reach) benches++;
      // As the detector counts them: a round reach from the trunk.
      const n = treePaths(state, tx, tz, fx, fz, pathReach).directions;
      const wants: string[] = [];
      if (benches < needBenches)
        wants.push(
          `${count(needBenches - benches, 'more bench', 'more benches')} in its shade, within two steps of the trunk`,
        );
      if (n < needDirs)
        wants.push(`paths leading off it in ${needDirs} directions (${n} now), within two steps`);
      list.push({ score: (part(benches, needBenches) + part(n, needDirs)) / 2, x: tx, z: tz, wants });
    }
  }
  return best(list);
};

const hedgerowLane: Explainer = (state, def) => {
  const minRun = param(def, 'minRun', 6);
  const minHedged = param(def, 'minHedged', 4);
  const list: Attempt[] = [];
  for (const run of straightRuns(state, 2)) {
    const sides = hedgedSides(state, run);
    const one = sides.filter((s) => s === 1 || s === 2).length;
    // Stretches of both-sided hedging as the detector splits them: more than MAX_GAP unhedged
    // tiles between two hedged ones makes two stretches, each counted on its own.
    const stretches: { first: number; count: number }[] = [];
    let last = -1;
    for (let i = 0; i < sides.length; i++) {
      if (sides[i] !== 3) continue;
      if (stretches.length === 0 || i - last - 1 > MAX_GAP) stretches.push({ first: i, count: 0 });
      stretches[stretches.length - 1]!.count++;
      last = i;
    }
    if (stretches.length === 0) {
      if (one === 0) continue;
      stretches.push({ first: 0, count: 0 });
    }
    const len = run.end - run.start + 1;
    for (const { first, count: both } of stretches) {
      const wants: string[] = [];
      if (len < minRun) wants.push(`a straight path of ${minRun} steps or more (this one runs ${len})`);
      if (both < minHedged)
        wants.push(
          `hedges on both sides along ${minHedged} steps (${both} so far${one ? `, ${one} more with a hedge on one side only` : ''}${stretches.length > 1 ? `; keep the gaps to ${MAX_GAP} steps or fewer` : ''})`,
        );
      const k = run.start + first;
      list.push({
        score: (part(len, minRun) + part(both, minHedged) * 2 + part(one, minHedged) * 0.5) / 3.5,
        x: run.horizontal ? k : run.line,
        z: run.horizontal ? run.line : k,
        wants,
      });
    }
  }
  return best(list);
};

const lanternWalk: Explainer = (state, def) => {
  const minRun = param(def, 'minRun', 10);
  const needLanterns = param(def, 'lanterns', 3);
  const list: Attempt[] = [];
  for (const comp of litStretches(state, param(def, 'reach', 1))) {
    const span = spanLength(comp);
    const lanterns = taggedAlong(state, comp, 'lantern').length;
    const wants: string[] = [];
    if (span < minRun)
      wants.push(
        `a lit path of ${minRun} steps (the longest runs ${span}; keep lanterns no more than four steps apart)`,
      );
    if (lanterns < needLanterns) wants.push(`${count(needLanterns - lanterns, 'more lantern')} along it`);
    list.push({
      score: (part(span, minRun) + part(lanterns, needLanterns)) / 2,
      x: comp[0]! % S,
      z: Math.floor(comp[0]! / S),
      wants,
    });
  }
  return best(list);
};

const promenade: Explainer = (state, def) => {
  const minRun = param(def, 'minRun', 8);
  const needBenches = param(def, 'benches', 2);
  const needLanterns = param(def, 'lanterns', 2);
  const list: Attempt[] = [];
  for (const comp of shoreStretches(state)) {
    const span = spanLength(comp);
    const benches = taggedAlong(state, comp, 'bench').length;
    const lanterns = taggedAlong(state, comp, 'lantern').length;
    const wants: string[] = [];
    if (span < minRun)
      wants.push(
        `a path along the water of ${minRun} steps (this one runs ${span}; two steps from the water at most)`,
      );
    if (benches < needBenches)
      wants.push(`${count(needBenches - benches, 'more bench', 'more benches')} along it`);
    if (lanterns < needLanterns) wants.push(`${count(needLanterns - lanterns, 'more lantern')} along it`);
    list.push({
      score: (part(span, minRun) + part(benches, needBenches) + part(lanterns, needLanterns)) / 3,
      x: comp[0]! % S,
      z: Math.floor(comp[0]! / S),
      wants,
    });
  }
  return best(list);
};

const pocketPark: Explainer = (state, def) => {
  const needTrees = param(def, 'trees', 1);
  const needFlowers = param(def, 'flowers', 2);
  const needSides = param(def, 'sides', 2);
  const m = state.map;
  const free = (x: number, z: number) =>
    x >= 0 && z >= 0 && x < S && z < S && !m.occupant[z * S + x] && !m.road[z * S + x] && !m.water[z * S + x];
  const builtAt = (x: number, z: number) => x >= 0 && z >= 0 && x < S && z < S && m.occupant[z * S + x] !== 0;
  const list: Attempt[] = [];
  for (const bench of tagged(state, 'bench')) {
    const t = tileOf(bench);
    const bx = t % S;
    const bz = (t - bx) / S;
    let found: Attempt | null = null;
    for (let s = 4; s >= 2; s--) {
      for (let z0 = bz - s + 1; z0 <= bz; z0++) {
        for (let x0 = bx - s + 1; x0 <= bx; x0++) {
          let open = true;
          for (let z = z0; z < z0 + s && open; z++)
            for (let x = x0; x < x0 + s && open; x++) open = free(x, z);
          if (!open) continue;
          let trees = 0;
          let flowers = 0;
          for (let z = z0; z < z0 + s; z++) for (let x = x0; x < x0 + s; x++) if (m.tree[z * S + x]) trees++;
          for (const d of decorInRect(state, [x0, z0, x0 + s - 1, z0 + s - 1])) {
            if (hasTag(d.def, 'tree')) trees++;
            if (hasTag(d.def, 'flower')) flowers++;
          }
          const strip = (ax: number, az: number, cx: number, cz: number) => {
            for (let z = az; z <= cz; z++) for (let x = ax; x <= cx; x++) if (builtAt(x, z)) return true;
            return false;
          };
          const x1 = x0 + s - 1;
          const z1 = z0 + s - 1;
          const sides =
            Number(strip(x0, z0 - 2, x1, z0 - 1)) +
            Number(strip(x0, z1 + 1, x1, z1 + 2)) +
            Number(strip(x0 - 2, z0, x0 - 1, z1)) +
            Number(strip(x1 + 1, z0, x1 + 2, z1));
          const wants: string[] = [];
          if (trees < needTrees) wants.push('a tree in the little square around the bench');
          if (flowers < needFlowers)
            wants.push(`${count(needFlowers - flowers, 'more flower bed')} there (${flowers} now)`);
          if (sides < needSides)
            wants.push(
              `buildings close on ${needSides} sides, within two steps (${sides} now): tuck it between them`,
            );
          const score = (part(trees, needTrees) + part(flowers, needFlowers) + part(sides, needSides)) / 3;
          if (!found || score > found.score) found = { score, x: x0, z: z0, wants };
        }
      }
    }
    list.push(
      found ?? {
        score: 0.05,
        x: bx,
        z: bz,
        wants: ['open ground around the bench: a little square with no road or building in it'],
      },
    );
  }
  return best(list);
};

const sittingWall: Explainer = (state, def) => {
  const need = param(def, 'segments', 4);
  const list: Attempt[] = [];
  for (const { line, path, greens } of wallLines(state, param(def, 'gap', 51))) {
    const wants: string[] = [];
    if (line.length < need)
      wants.push(`${need} lengths of low wall in one straight line (${line.length} now)`);
    if (!path) wants.push('a path running right along one side of the wall');
    if (greens.length === 0) wants.push('flowers or a hedge on the other side of it');
    const t = tileOf(line[0]!);
    list.push({
      score: (part(line.length, need) + (path ? 1 : 0) + (greens.length ? 1 : 0)) / 3,
      x: t % S,
      z: Math.floor(t / S),
      wants,
    });
  }
  return best(list);
};

/** Explainers by detector id (the Hamlet pages; later ranks join as they are written). */
const EXPLAINERS = new Map<string, Explainer>([
  ['hedgerowLane', hedgerowLane],
  ['kitchenGarden', kitchenGarden],
  ['lanternWalk', lanternWalk],
  ['pocketPark', pocketPark],
  ['promenade', promenade],
  ['sittingWall', sittingWall],
  ['treePlace', treePlace],
  ['wellGathering', wellGathering],
]);

/** The closest attempt at each page not yet found, for the Pattern Book. */
export function patternProgress(state: WorldState): PatternProgressView[] {
  const out: PatternProgressView[] = [];
  for (const def of content.patterns) {
    if (!rankAtLeast(state, def.rank) || state.hearth.discovered.some((d) => d.pattern === def.id)) continue;
    const explain = EXPLAINERS.get(def.detector);
    const a = explain?.(state, def);
    if (!a || a.wants.length === 0) continue;
    out.push({ pattern: def.id, x: a.x, z: a.z, wants: a.wants, progress: Math.round(a.score * 100) });
  }
  return out;
}

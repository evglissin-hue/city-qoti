// Bench for nature (C5C; docs/build/cycle-05c-nature-field-guide.md): the habitats pass (under 3 ms a
// day, scoring the whole map, the worst case), the wildlife pass (under 0.5 ms an hour at 150
// residents) on a synthetic town, and with NATURE_PLAY=1 the autoplayer on willow and hazel with every
// system on: species in the Field Guide over the first Village year (10 or more), and the money and
// labor the Hearth spent. `npm run bench -w @qoti/bench` runs the timing part.
import { content } from '@qoti/content';
import {
  createTickCtx,
  type Household,
  type Resident,
  rankAtLeast,
  rollSightings,
  TICKS_PER_HOUR,
  updateHabitats,
  type WorldState,
} from '@qoti/sim';
import { villageFixture } from '../../../packages/sim/test/fixtures/village';
import { autoplay } from './autoplay';
import { syntheticValley } from './synthetic';

export const HABITATS_BUDGET_MS = 3;
export const WILDLIFE_BUDGET_MS = 0.5;
export const SPECIES_TARGET = 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Median ms of the habitats pass scoring every chunk, and of the hourly wildlife pass. */
export function natureTimings(w: WorldState, runs = 40): { habitats: number; wildlife: number } {
  const hab: number[] = [];
  const wild: number[] = [];
  for (let k = 0; k < runs; k++) {
    w.nature.habitats.fill(0);
    const ctx = createTickCtx(w);
    let t = performance.now();
    updateHabitats(w, ctx);
    hab.push(performance.now() - t);
    // Through a day's hours, so every species' hours come up.
    w.tick += TICKS_PER_HOUR;
    t = performance.now();
    rollSightings(w, ctx);
    wild.push(performance.now() - t);
  }
  return { habitats: median(hab), wildlife: median(wild) };
}

/** The village fixture grown to `n` residents, everyone outdoors (the most chunks watched). */
export function grownVillage(n = 150): WorldState {
  const state = villageFixture().state;
  let k = 0;
  while (state.residents.length < n) {
    const src = state.households[k++ % state.households.length]!;
    const h: Household = {
      ...src,
      id: state.nextId++,
      members: [],
      pantry: [...src.pantry],
      recentFoods: [],
    };
    for (let i = 0; i < 3 && state.residents.length < n; i++) {
      const proto = state.residents.find((r) => r.householdId === src.id) ?? state.residents[0]!;
      const r: Resident = {
        ...proto,
        id: state.nextId++,
        householdId: h.id,
        needs: [...proto.needs],
        modifiers: [],
        friends: [],
        traits: [...proto.traits],
      };
      state.residents.push(r);
      h.members.push(r.id);
    }
    state.households.push(h);
  }
  for (const r of state.residents) r.inside = 0;
  return state;
}

/** The bench lines: habitats on the synthetic valley (1,000 buildings, 6,000 decor), wildlife at 150. */
export function natureBench(): { lines: string[]; failures: string[]; report: Record<string, unknown> } {
  const big = syntheticValley('bench-valley').world;
  big.settings.mode = 'standard';
  const habitats = natureTimings(big).habitats;
  const village = grownVillage();
  natureTimings(village, 2);
  const wildlife = natureTimings(village, 48).wildlife;
  const failures: string[] = [];
  if (habitats > HABITATS_BUDGET_MS) failures.push(`habitats ${habitats.toFixed(3)} ms`);
  if (wildlife > WILDLIFE_BUDGET_MS) failures.push(`wildlife ${wildlife.toFixed(3)} ms`);
  const ok = (b: boolean) => (b ? 'ok' : 'OVER');
  return {
    lines: [
      `nature          habitats ${habitats.toFixed(3)} ms a day, the whole synthetic map (budget ${HABITATS_BUDGET_MS} ms)  ${ok(habitats <= HABITATS_BUDGET_MS)}`,
      `nature          wildlife ${wildlife.toFixed(3)} ms an hour at ${village.residents.length} residents (budget ${WILDLIFE_BUDGET_MS} ms)  ${ok(wildlife <= WILDLIFE_BUDGET_MS)}`,
    ],
    failures,
    report: { habitatsMs: habitats, wildlifeMs: wildlife },
  };
}

export interface NaturePlay {
  seed: string;
  villageDay: number;
  species: number;
  names: string[];
  treasuryLow: number;
}

/** The autoplayer with every system on, through the first Village year. */
export function naturePlay(seed: string, days = 100): NaturePlay {
  let villageDay = 0;
  let treasuryLow = Infinity;
  let species = 0;
  let names: string[] = [];
  autoplay(seed, days, {
    village: true,
    onDay: (w, line) => {
      if (!villageDay && rankAtLeast(w, 'village')) {
        villageDay = line.day;
        console.log(`${seed} day ${line.day}: Village, ${w.nature.guide.length} species so far`);
      }
      if (villageDay && line.day <= villageDay + 24) {
        species = w.nature.guide.length;
        names = w.nature.guide.map((e) => content.wildlifeById.get(e.species)?.name ?? e.species);
        treasuryLow = Math.min(treasuryLow, w.economy.treasury);
      }
    },
  });
  return { seed, villageDay, species, names, treasuryLow };
}

if (process.argv[1]?.endsWith('nature.bench.ts')) {
  for (const line of natureBench().lines) console.log(line);
  if (process.env.NATURE_PLAY) {
    for (const seed of ['willow', 'hazel']) {
      const r = naturePlay(seed, Number(process.env.NATURE_DAYS ?? 100));
      console.log(
        `${seed}: Village on day ${r.villageDay}, ${r.species} species in its first year ` +
          `(${r.names.join(', ')}); lowest treasury ${(r.treasuryLow / 100).toFixed(0)} coins`,
      );
    }
  }
}

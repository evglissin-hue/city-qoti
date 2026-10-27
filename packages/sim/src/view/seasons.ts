// I3 views (C5.0): what the worker sends about seasons, weather, festivals, renown, commissions,
// the River Dock, nature, threats, the Watch, raids, trials and the guide. Pure: reads state.
// Owners extend their builders here (C5A weather and trials, C5B festivals, renown, commissions and
// the dock, C5C the Field Guide, C5D threats, the Watch and raids, C5H the guide).
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, FESTIVAL, MAP_SIZE, PENNIES_PER_COIN, SEASON_NAMES } from '../constants';
import type {
  Commission,
  CommissionView,
  DockView,
  FestivalResultView,
  FestivalView,
  FieldGuideEntry,
  FieldGuideEntryView,
  GuideView,
  RaidRecord,
  RaidResultView,
  RaidView,
  RenownView,
  SeasonCardView,
  SeasonIndex,
  ThreatView,
  TrialView,
  WatchView,
  WeatherEvent,
  WeatherEventView,
  WeatherView,
  WorldState,
} from '../contracts';
import { seasonAt } from '../state/seasons';
import { dayIndex } from '../systems/economy/time';

const goodId = (i: number): string => content.goods[i]?.id ?? '';
const tileXZ = (t: number): [number, number] => [t % MAP_SIZE, Math.floor(t / MAP_SIZE)];

export function weatherEventView(state: WorldState, v: WeatherEvent): WeatherEventView {
  return {
    id: v.id,
    event: v.event,
    name: content.eventById.get(v.event)?.name ?? v.event,
    start: v.start,
    end: v.end,
    forecastTick: v.forecastTick,
    active: state.tick >= v.start && state.tick < v.end,
  };
}

export function weatherView(state: WorldState): WeatherView {
  const w = state.weather;
  return {
    today: w.today,
    forecast: w.forecast.map((d) => [d.day, d.kind]),
    events: w.events.filter((v) => v.forecastTick <= state.tick).map((v) => weatherEventView(state, v)),
    frozen: w.river.frozen,
  };
}

/** The coming raid as both seats see it; `pressure` is for the Ledger lens only (P36). */
export function threatView(state: WorldState): ThreatView {
  const r = state.threats.scheduled;
  const today = dayIndex(state.tick);
  const shown = r !== null && state.tick >= r.telegraphTick;
  let daysLeft: number | null = null;
  if (r && shown) {
    const day = (r.year * 4 + r.season) * DAYS_PER_SEASON + (r.day - 1);
    daysLeft = Math.max(0, day - today);
  }
  return {
    band: shown ? r!.band : null,
    side: shown ? r!.side : null,
    daysLeft,
    signs: shown ? [...r!.signs] : [],
    wolvesTonight: state.threats.wolves.includes(today),
    pressure: state.threats.pressure,
  };
}

/** This season's festival and the absolute day it is held. */
export function festivalOf(state: WorldState): {
  id: string;
  name: string;
  season: SeasonIndex;
  day: number;
} {
  const { season, year } = seasonAt(state.tick);
  const id = content.seasons[season]?.festival ?? '';
  return {
    id,
    name: content.festivalById.get(id)?.name ?? id,
    season: season as SeasonIndex,
    day: (year * 4 + season) * DAYS_PER_SEASON + (FESTIVAL.day - 1),
  };
}

export function seasonCardView(state: WorldState): SeasonCardView {
  const { season, year } = seasonAt(state.tick);
  const f = festivalOf(state);
  const steps: string[] = [];
  if (state.trial && state.trial.season === season && state.trial.year === year) {
    const def = content.charterById.get(state.trial.charter)?.trial;
    if (def) steps.push(def.blurb);
  }
  return {
    season: season as SeasonIndex,
    year,
    name: `${SEASON_NAMES[season]}, year ${year + 1}`,
    festival: { id: f.id, name: f.name, day: f.day },
    steps,
    weather: weatherView(state),
    threat: threatView(state),
  };
}

export function festivalView(state: WorldState): FestivalView {
  const f = festivalOf(state);
  const p = state.festival.plan;
  const reserved = (good: number): number => p?.reserved.find(([g]) => g === good)?.[1] ?? 0;
  return {
    festival: { id: f.id, name: f.name, season: f.season },
    day: f.day,
    plan: p
      ? {
          festival: p.festival,
          site: p.site
            ? 'rect' in p.site
              ? { rect: [...p.site.rect] }
              : { pattern: p.site.pattern, anchor: p.site.anchor }
            : null,
          menu: p.menu.map(([g, q]) => [goodId(g), q, reserved(g)]),
          twist: p.twist,
          music: p.music,
          musician: p.musician,
          by: p.by,
        }
      : null,
    pieces: [...state.festival.pieces],
    live: state.festival.live,
  };
}

/** The last festival's result, or null before the first. */
export function festivalResultView(state: WorldState): FestivalResultView | null {
  const o = state.festival.outcome;
  const h = state.festival.history[state.festival.history.length - 1];
  if (!o || !h) return null;
  return {
    festival: h.festival,
    season: h.season,
    year: h.year,
    attendance: o.attendance,
    joy: { ...o.joy },
    stars: o.stars,
    twist: h.twist,
  };
}

export function renownView(state: WorldState): RenownView {
  const r = state.renown;
  const def = content.renown[r.level];
  const next = content.renown[r.level + 1];
  return {
    points: r.points,
    level: r.level,
    name: def?.name ?? '',
    next: next ? next.points : null,
    log: r.log.map((e) => ({ ...e })),
  };
}

export function commissionView(c: Commission): CommissionView {
  const def = content.commissionById.get(c.def);
  let ask = def?.name ?? c.def;
  if (def && 'goods' in def.ask) {
    ask = def.ask.goods.map(([g, q]) => `${q} ${content.goodById.get(g)?.label ?? g}`).join(', ');
  }
  return {
    id: c.id,
    def: c.def,
    name: def?.name ?? c.def,
    from: c.from,
    status: c.status,
    offeredTick: c.offeredTick,
    deadlineTick: c.deadlineTick,
    progress: c.progress,
    ask,
  };
}

export function dockView(state: WorldState): DockView {
  return {
    boats: state.dock.boats.map((b) => ({
      id: b.id,
      neighbor: b.neighbor,
      selling: b.selling.map(([g, q]) => [goodId(g), q]),
      buying: b.buying.map(([g, q]) => [goodId(g), q]),
      arriveTick: b.arriveTick,
      departTick: b.departTick,
      moored: b.tile >= 0,
    })),
    frozen: state.weather.river.frozen,
  };
}

export function fieldGuideEntryView(e: FieldGuideEntry): FieldGuideEntryView {
  const def = content.wildlifeById.get(e.species);
  return {
    species: e.species,
    name: def?.name ?? e.species,
    kind: def?.kind ?? '',
    firstTick: e.firstTick,
    seats: [...e.seats],
    count: e.count,
    flavor: def?.flavor ?? '',
  };
}

export function watchView(state: WorldState): WatchView {
  const w = state.watch;
  return {
    members: [...w.members],
    target: w.target,
    training: w.training,
    morale: w.morale,
    posture: w.posture.map(tileXZ),
    duty: [...w.duty],
    budget: w.budget / PENNIES_PER_COIN,
    strength: Math.round((w.members.length * w.training * w.morale) / 10000),
  };
}

/** The live raid, or null outside one. */
export function raidView(state: WorldState): RaidView | null {
  const r = state.raid;
  if (!r) return null;
  return {
    id: r.id,
    side: r.side,
    band: r.band,
    raiders: r.raiders.filter((x) => x.state === 'approach' || x.state === 'loot').length,
    fled: r.raiders.filter((x) => x.state === 'flee' || x.state === 'gone').length,
    captured: r.raiders.filter((x) => x.state === 'captured').length,
    bell: r.bell,
    lanterns: r.lanterns,
    captures: [...state.threats.captives],
  };
}

/** A finished raid's card. C5D adds what was stolen and the renown and morale it moved. */
export function raidResultView(rec: RaidRecord): RaidResultView {
  return {
    tick: rec.tick,
    band: rec.band,
    side: rec.side,
    stolen: [],
    damage: 0,
    captured: rec.captured,
    repelled: rec.repelled,
    renown: 0,
    morale: 0,
  };
}

/** The trial on hand, or null. */
export function trialView(state: WorldState): TrialView | null {
  const t = state.trial;
  if (!t) return null;
  const def = content.charterById.get(t.charter)?.trial;
  return {
    kind: t.kind,
    name: def?.name ?? '',
    blurb: def?.blurb ?? '',
    charter: t.charter,
    season: t.season,
    year: t.year,
    status: t.status,
    measured: t.measured.map(([k, v]) => [k, v]),
  };
}

/** A guide point's place on this valley's map: the start area, the valley gate or a storehouse. */
function guideTile(state: WorldState, place: 'start' | 'gate' | 'storehouse'): [number, number] | undefined {
  if (place === 'gate') return [...state.meta.valleyGate];
  if (place === 'start') {
    const [x0, z0, x1, z1] = state.meta.startArea;
    return [Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2)];
  }
  const b = state.buildings.find((x) => content.buildingById.get(x.def)?.tags?.includes('storehouse'));
  return b ? [b.x, b.z] : undefined;
}

/** The guide's open step, with its arrow resolved to this valley's tools, panels and tiles. */
export function guideView(state: WorldState): GuideView {
  const g = state.guide;
  const steps = content.guide.steps;
  const s = steps[Math.min(g.step, steps.length - 1)];
  let point: GuideView['point'];
  if (s?.point) {
    const { tile, ...rest } = s.point;
    const at = tile ? guideTile(state, tile) : undefined;
    point = { ...rest, ...(at && { tile: at }) };
  }
  return {
    step: g.step,
    of: steps.length,
    id: s?.id ?? '',
    lens: s?.lens ?? 'both',
    letter: s?.letter ?? '',
    hint: s?.hint ?? '',
    ...(point && { point }),
    done: steps.map((_, i) => i < g.doneTicks.length),
    hidden: [...g.hidden],
    over: g.over,
  };
}

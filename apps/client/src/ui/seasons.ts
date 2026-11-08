// I3 (C5F): words, tints and small pure helpers for the season pages: weather, the forecast, threat
// bands and sides, the Watch, festivals and the trial. Everything here reads views and content;
// nothing decides anything the sim has not already decided.
import { content, festivalTuning } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  doorTile,
  FESTIVAL,
  FESTIVAL_SITE_MARGIN,
  FESTIVAL_SITE_MIN,
  MAP_SIZE,
  SEASON_NAMES,
  START_HOUR,
  TILE_FP,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type FestivalPlanView,
  type FestivalView,
  type RaidBand,
  type RaidSide,
  type WeatherKind,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';

/** Each weather in a word or two, with a dry little line for the tooltip. */
export const WEATHER_WORD: Record<WeatherKind, { word: string; line: string }> = {
  clear: { word: 'Clear', line: 'Not a cloud worth naming.' },
  cloudy: { word: 'Cloudy', line: 'Grey, but keeping its opinions to itself.' },
  rain: { word: 'Rain', line: 'Good for the fields, less so for picnics.' },
  storm: { word: 'Storm', line: 'Roofs may take a knock. Folk stay in.' },
  fog: { word: 'Fog', line: 'Hard to see far. Warnings come a day later.' },
  snow: { word: 'Snow', line: 'Pretty, slow going, and everyone wants a fire.' },
  heat: { word: 'Heat', line: 'The wells work hard and tempers run short.' },
};

/** A raid's strength band, gently. */
export const BAND_WORD: Record<RaidBand, string> = {
  small: 'A small band',
  medium: 'A middling band',
  large: 'A large band',
};

export const SIDE_WORD: Record<RaidSide, string> = {
  n: 'the north',
  e: 'the east',
  s: 'the south',
  w: 'the west',
};

/** Signs of a coming raid, in words. */
export const SIGN_WORD: Record<string, string> = {
  tracks: 'Strange tracks on the far paths',
  crows: 'Crows gathering at the edge of the wood',
  letter: 'A merchant wrote to warn us',
};

export function signWord(sign: string): string {
  return SIGN_WORD[sign] ?? sign.replace(/-/g, ' ');
}

/** Absolute day (0 based) as "Winter, day 5". */
export function dayName(absDay: number): string {
  const season = Math.floor((absDay % DAYS_PER_YEAR) / DAYS_PER_SEASON);
  return `${SEASON_NAMES[season]}, day ${(absDay % DAYS_PER_SEASON) + 1}`;
}

/** Today's absolute day: the sim's dayIndex (tick 0 is 06:00, so the day turns at midnight). */
export function today(tick: number): number {
  return Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

/** The hour of the day (0 to 23), as the sim's hourOf. */
export function hourOfDay(tick: number): number {
  return Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR);
}

/** "today", "tomorrow", "in 3 days". */
export function whenWord(daysAhead: number): string {
  if (daysAhead <= 0) return 'tonight';
  if (daysAhead === 1) return 'tomorrow';
  return `in ${daysAhead} days`;
}

/** A tick ahead as "today", "tomorrow" or "in 3 days". */
export function inDays(tick: number, now: number): string {
  const d = today(tick) - today(now);
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

/** The season's CSS key, for paper tints and flourishes. */
export const SEASON_KEY = ['spring', 'summer', 'autumn', 'winter'] as const;

export function seasonKey(tick: number): (typeof SEASON_KEY)[number] {
  return SEASON_KEY[Math.floor((today(tick) % DAYS_PER_YEAR) / DAYS_PER_SEASON)]!;
}

export function festivalName(id: string): string {
  return content.festivalById.get(id)?.name ?? id.replace(/-/g, ' ');
}

export function twistName(id: string): string {
  return content.twistById.get(id)?.name ?? (id ? id.replace(/-/g, ' ') : 'No twist');
}

export function speciesName(id: string, name?: string): string {
  const def = content.wildlifeById.get(id);
  const raw = def?.name ?? name ?? id;
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, ' ');
}

export function neighborName(id: string): string {
  if (id === 'visitor') return 'A visitor';
  return content.neighborById.get(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Stars as a string of filled and empty ones, for titles. */
export function starsText(n: number, of = 5): string {
  return '★'.repeat(Math.max(0, Math.min(of, n))) + '☆'.repeat(Math.max(0, of - n));
}

/** The joy parts the planner and the result card show, in order. */
export const JOY_PARTS = [
  ['site', 'The site'],
  ['variety', 'Pieces'],
  ['menu', 'The menu'],
  ['music', 'Music'],
  ['twist', 'The twist'],
] as const;

export type JoyParts = Record<(typeof JOY_PARTS)[number][0], number>;

/**
 * Stars (1 to 5) from a score out of 100: the sim's rule (systems/festivals/score.ts starsFor), read
 * from the same content thresholds.
 */
export function starsFor(score: number): number {
  let stars = 1;
  for (const s of festivalTuning.stars) if (score >= s) stars++;
  return stars;
}

const clamp100 = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

/**
 * The planner's live estimate: the sim's scoring rule (systems/festivals/score.ts) read with the
 * content weights, thresholds and parts, on what the planner knows on the client. It assumes the
 * guests in reach all come (turnout 1), so the night itself can only be a little less.
 */
export function joyEstimate(opts: {
  /** Average charm over the site's tiles, on the charm layer's own scale. */
  siteCharm: number;
  /** A Pattern Book site (earns the pattern bonus). */
  pattern?: boolean;
  /** Distinct festival pieces standing on the site. */
  pieces: number;
  /** The menu as it would be put by: [good, units]. */
  menu: [good: string, qty: number][];
  attendees: number;
  music: 'none' | 'resident' | 'bandstand';
  twist: boolean;
}): { parts: JoyParts; total: number; stars: number } {
  const t = festivalTuning;
  const lines = opts.menu.filter(([, q]) => q > 0);
  const units = lines.reduce((s, [, q]) => s + q, 0);
  const variety = Math.min(1, lines.length / Math.max(1, t.menuGoods));
  const enough =
    opts.attendees > 0 ? Math.min(1, units / (opts.attendees * t.perGuest)) : lines.length > 0 ? 1 : 0;
  // Anyone but Juniper Reed with her festival music plays half the part; the estimate says so.
  const music =
    opts.music === 'bandstand'
      ? t.music.bandstand
      : opts.music === 'resident'
        ? Math.round(t.music.resident / 2)
        : t.music.none;
  const parts: JoyParts = {
    site: clamp100((opts.siteCharm * 100) / Math.max(1, t.siteCharm) + (opts.pattern ? t.patternBonus : 0)),
    variety: clamp100((opts.pieces * 100) / Math.max(1, t.varietyFull)),
    menu: clamp100(50 * variety + 50 * enough),
    music,
    twist: opts.twist ? t.twist : 0,
  };
  const w = t.weights;
  const wsum = w.site + w.variety + w.menu + w.music + w.twist;
  const joy =
    wsum > 0
      ? (parts.site * w.site +
          parts.variety * w.variety +
          parts.menu * w.menu +
          parts.music * w.music +
          parts.twist * w.twist) /
        wsum
      : 0;
  const total = clamp100(joy);
  return { parts, total, stars: starsFor(total) };
}

// --- Festival planning helpers (playtest round four) ---------------------------------------------

/** The festival's plan when it is this season's, else null (the sim's currentPlan, from the view). */
export function currentFestivalPlan(f: FestivalView | null, tick: number): FestivalPlanView | null {
  if (!f?.plan) return null;
  // The view's day is the festival day of the season it was made in: a stale view (the hours
  // between midnight and the 04:00 tidy) names last season's.
  const same = Math.floor(f.day / DAYS_PER_SEASON) === Math.floor(today(tick) / DAYS_PER_SEASON);
  return same ? f.plan : null;
}

export type FestivalPhase = 'ahead' | 'tonight' | 'live' | 'over';

/** Where the festival day stands: days ahead, the evening still to come, on now, or over. */
export function festivalPhase(f: FestivalView, tick: number): { phase: FestivalPhase; daysAhead: number } {
  const daysAhead = f.day - today(tick);
  if (daysAhead > 0) return { phase: 'ahead', daysAhead };
  if (f.live) return { phase: 'live', daysAhead: 0 };
  if (daysAhead < 0) return { phase: 'over', daysAhead };
  return { phase: hourOfDay(tick) >= FESTIVAL.to ? 'over' : 'tonight', daysAhead: 0 };
}

/** True when a plan sent now would be refused as too late (the sim's TOO_LATE). */
export function festivalTooLate(f: FestivalView, tick: number): boolean {
  return f.day === today(tick) && hourOfDay(tick) >= FESTIVAL.from;
}

/** "Festival in 2 days", "Festival tomorrow", "Festival tonight at 18:00", "Festival now", or null. */
export function festivalChipText(f: FestivalView | null, tick: number): string | null {
  if (!f || !currentFestivalPlan(f, tick)) return null;
  const { phase, daysAhead } = festivalPhase(f, tick);
  if (phase === 'over') return null;
  if (phase === 'live') return 'Festival now';
  if (phase === 'tonight') return `Festival tonight at ${FESTIVAL.from}:00`;
  return daysAhead === 1 ? 'Festival tomorrow' : `Festival in ${daysAhead} days`;
}

/** "tonight", "tomorrow" or "in 3 days" for the poster-up toast and the like. */
export function festivalWhen(f: FestivalView, tick: number): string {
  const { phase, daysAhead } = festivalPhase(f, tick);
  return phase === 'ahead' ? whenWord(daysAhead) : 'tonight';
}

/** "The poster is up: Winter Hearth Feast, in 3 days." */
export function posterUpText(f: FestivalView, tick: number): string {
  return `The poster is up: ${f.festival.name}, ${festivalWhen(f, tick)}.`;
}

type Rect4 = [number, number, number, number];

/** The tiles a plan's site covers on the client: a rect as is, a pattern site grown as the sim does. */
export function festivalSiteRect(m: Mirror, site: FestivalPlanView['site']): Rect4 | null {
  if (!site) return null;
  if ('rect' in site) return [site.rect[0], site.rect[1], site.rect[2], site.rect[3]];
  const s = m.patterns.get(site.pattern)?.sites.find((x) => x.z * MAP_SIZE + x.x === site.anchor);
  return patternSiteRect(m, site.anchor, s?.tiles ?? [], s?.members ?? []);
}

/** A pattern site's ground: its members and tiles in a box, grown by the margin and to the minimum. */
export function patternSiteRect(
  m: Mirror,
  anchor: number,
  tiles: readonly number[],
  members: readonly number[],
): Rect4 {
  let x0 = anchor % MAP_SIZE;
  let z0 = Math.floor(anchor / MAP_SIZE);
  let x1 = x0;
  let z1 = z0;
  const take = (x: number, z: number) => {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  };
  for (const t of tiles) take(t % MAP_SIZE, Math.floor(t / MAP_SIZE));
  for (const id of members) {
    const d = m.decor.get(id);
    if (d) {
      take(Math.floor(d.fx / TILE_FP), Math.floor(d.fz / TILE_FP));
      continue;
    }
    const b = m.buildings.get(id);
    if (b) take(b.x, b.z);
  }
  const g = FESTIVAL_SITE_MARGIN;
  x0 -= g;
  z0 -= g;
  x1 += g;
  z1 += g;
  while (x1 - x0 + 1 < FESTIVAL_SITE_MIN) {
    x0 -= 1;
    if (x1 - x0 + 1 < FESTIVAL_SITE_MIN) x1 += 1;
  }
  while (z1 - z0 + 1 < FESTIVAL_SITE_MIN) {
    z0 -= 1;
    if (z1 - z0 + 1 < FESTIVAL_SITE_MIN) z1 += 1;
  }
  return [Math.max(0, x0), Math.max(0, z0), Math.min(MAP_SIZE - 1, x1), Math.min(MAP_SIZE - 1, z1)];
}

/**
 * Residents whose home door is within the festival reach of the site (as the sim's inReach), and
 * those who live too far. Homeless residents count as far.
 */
export function festivalReach(m: Mirror, rect: Rect4 | null): { near: number; far: number } {
  let near = 0;
  let far = 0;
  const reach = festivalTuning.reach;
  for (const r of m.residents.values()) {
    const home = m.buildings.get(r.homeId);
    if (!rect || !home) {
      far++;
      continue;
    }
    const door = doorTile(home as unknown as Parameters<typeof doorTile>[0]);
    const x = door % MAP_SIZE;
    const z = Math.floor(door / MAP_SIZE);
    const dx = x < rect[0] ? rect[0] - x : x > rect[2] ? x - rect[2] : 0;
    const dz = z < rect[1] ? rect[1] - z : z > rect[3] ? z - rect[3] : 0;
    if (Math.max(dx, dz) <= reach) near++;
    else far++;
  }
  return { near, far };
}

type Goal = NonNullable<NonNullable<ReturnType<typeof content.twistById.get>>['goal']>;

/**
 * What a twist still needs that the town cannot supply, or null when it can be met (or only needs
 * things the planner can still do: set pieces out, put a good on the menu). Reads stock goals and
 * menu goals; pieces, the river and the weather are left to the night.
 */
export function twistNeeds(twistId: string, stock: (good: string) => number): string | null {
  const goal = content.twistById.get(twistId)?.goal;
  return goal ? goalNeeds(goal, stock) : null;
}

function need(good: string, qty: number): string {
  return `${qty} ${(content.goodById.get(good)?.name ?? good).toLowerCase()}`;
}

function goalNeeds(g: Goal, stock: (good: string) => number): string | null {
  if ('any' in g) {
    const needs = g.any.map((c) => goalNeeds(c, stock));
    return needs.every((n) => n !== null) ? needs.join(' or ') : null;
  }
  if ('all' in g) {
    for (const c of g.all) {
      const n = goalNeeds(c, stock);
      if (n) return n;
    }
    return null;
  }
  if ('stock' in g)
    return stock(g.stock.good) >= g.stock.atLeast ? null : need(g.stock.good, g.stock.atLeast);
  if ('code' in g && g.code === 'festivalMenu' && g.ref) {
    const atLeast = g.params?.find(([k]) => k === 'atLeast')?.[1] ?? 1;
    return stock(g.ref) >= atLeast ? null : need(g.ref, atLeast);
  }
  return null;
}

/** Watch training (100 to 160) as "1.2x". */
export function trainingWord(training: number): string {
  return `${(training / 100).toFixed(1)}×`;
}

/** Watch morale 0 to 100 in a word. */
export function moraleWord(morale: number): string {
  return morale >= 80 ? 'Stout' : morale >= 60 ? 'Steady' : morale >= 40 ? 'Wobbly' : 'Rattled';
}

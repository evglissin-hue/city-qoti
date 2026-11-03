// C5E: the season's look through the day. The calendar turns at midnight; the valley does not.
// `seasonBlendAt` gives the snow cover, the foliage tint and the tree weights (autumn color, bare
// branches, blossom) for a day and hour, so snow settles over the first day of winter, melts over
// the first day of spring, leaves turn and fall through autumn, and blossom opens in early spring.
// Values step at most once an in-game quarter hour (the caller drops the still frame on a step).
import { SEASON_LOOK } from '@qoti/art';
import { DAYS_PER_SEASON } from '@qoti/sim';
import { Color } from 'three';
import type { WeatherKind } from '@qoti/sim';

export interface SeasonBlend {
  /** Snow cover on upward faces and the ground, 0 to 1. */
  snow: number;
  /** Foliage tint (grass, leaf and field surfaces), as a hex color. */
  tint: number;
  /** Autumn color in deciduous crowns, 0 to 1. */
  autumn: number;
  /** Bare deciduous branches, 0 (full leaf) to 1 (winter). */
  bare: number;
  /** Blossom on deciduous and fruit trees, 0 to 1. */
  blossom: number;
}

const ORDER = ['spring', 'summer', 'autumn', 'winter'] as const;

function mixHex(a: number, b: number, k: number): number {
  return new Color(a).lerp(new Color(b), k).getHex();
}

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * The look for a season index (0 spring to 3 winter), day (1 to DAYS_PER_SEASON) and hour (with
 * its fraction, quantized to quarter hours by the caller). Pure: both seats see the same picture.
 */
export function seasonBlendAt(season: number, day: number, hour: number): SeasonBlend {
  const name = ORDER[season] ?? 'spring';
  const prev = ORDER[(season + 3) % 4]!;
  // How far through the season, 0 at its first midnight to 1 at its last.
  const through = (day - 1 + hour / 24) / DAYS_PER_SEASON;
  // The first day blends in from the season before, finishing by early evening.
  const turn = day === 1 ? smooth((hour - 2) / 16) : 1;
  const tint = mixHex(SEASON_LOOK[prev].tint, SEASON_LOOK[name].tint, turn);
  let snow = 0;
  let autumn = 0;
  let bare = 0;
  let blossom = 0;
  switch (name) {
    case 'spring':
      // The thaw: patchy by noon on the first day, gone by evening. Blossom opens on day 1 and
      // falls away by day 5; buds come before leaves.
      snow = day === 1 ? 1 - smooth((hour - 4) / 14) : 0;
      bare = day === 1 ? 1 - smooth((hour - 6) / 16) * 0.7 : day === 2 ? 0.3 - smooth(hour / 24) * 0.3 : 0;
      blossom = smooth(through * 4) * (1 - smooth((through - 0.5) * 3.2));
      break;
    case 'summer':
      // The last of the blossom drops on the first morning.
      blossom = day === 1 ? 0.15 * (1 - smooth(hour / 12)) : 0;
      break;
    case 'autumn':
      // Color builds over the first two days; branches thin from day 4.
      autumn = smooth(through * 3);
      bare = smooth((through - 0.5) * 2.2) * 0.55;
      break;
    case 'winter':
      // The first snow settles through the first day (patchy at noon, deep by evening).
      snow = day === 1 ? smooth((hour - 3) / 15) : 1;
      autumn = day === 1 ? 1 - smooth(hour / 10) : 0;
      bare = day === 1 ? 0.55 + 0.45 * smooth(hour / 10) : 1;
      break;
  }
  return { snow: Math.max(0, Math.min(1, snow)), tint, autumn, bare, blossom };
}

/**
 * C5E: the weather's look, as weights the final pass, the ground and the particles read. Gentle on
 * purpose: rain greys and cools the valley a little, a storm a little more, fog thickens the haze,
 * heat warms it and yellows the grass; nothing flashes.
 */
export interface WeatherLook {
  /** Rain or storm wetness (particles, darker ground). */
  rain: number;
  /** Snow falling (particles). */
  snowfall: number;
  /** Fog thickness in the final pass. */
  fog: number;
  /** Storm: darker sky and the wind in the trees. */
  storm: number;
  /** Overcast: how much the sky's light is softened. */
  overcast: number;
  /** Heat and drought: warm, yellowed grass and a soft shimmer. */
  dry: number;
}

export const CLEAR_WEATHER: WeatherLook = { rain: 0, snowfall: 0, fog: 0, storm: 0, overcast: 0, dry: 0 };

/** The weather's look from today's kind and whether a drought is running. */
export function weatherLookFor(kind: WeatherKind | null | undefined, drought: boolean): WeatherLook {
  const w = { ...CLEAR_WEATHER };
  switch (kind) {
    case 'cloudy':
      w.overcast = 0.45;
      break;
    case 'rain':
      w.rain = 0.7;
      w.overcast = 0.75;
      break;
    case 'storm':
      w.rain = 1;
      w.storm = 1;
      w.overcast = 1;
      break;
    case 'fog':
      w.fog = 1;
      w.overcast = 0.4;
      break;
    case 'snow':
      w.snowfall = 1;
      w.overcast = 0.55;
      break;
    case 'heat':
      w.dry = 0.6;
      break;
  }
  if (drought) w.dry = Math.max(w.dry, 1);
  return w;
}

/** Eases one look toward another (per second `rate`), so weather changes drift in over seconds. */
export function easeWeather(cur: WeatherLook, to: WeatherLook, dt: number, rate = 0.25): boolean {
  let moved = false;
  for (const k of Object.keys(CLEAR_WEATHER) as (keyof WeatherLook)[]) {
    const d = to[k] - cur[k];
    if (Math.abs(d) < 0.002) {
      if (cur[k] !== to[k]) moved = true;
      cur[k] = to[k];
      continue;
    }
    cur[k] += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    moved = true;
  }
  return moved;
}

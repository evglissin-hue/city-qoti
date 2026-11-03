// I3 (C5F): words, tints and small pure helpers for the season pages: weather, the forecast, threat
// bands and sides, the Watch, festivals and the trial. Everything here reads views and content;
// nothing decides anything the sim has not already decided.
import { content } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  SEASON_NAMES,
  TICKS_PER_DAY,
  type RaidBand,
  type RaidSide,
  type WeatherKind,
} from '@qoti/sim';

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
export const BAND_WORD: Record<RaidBand, string> = { small: 'A small band', medium: 'A middling band', large: 'A large band' };

export const SIDE_WORD: Record<RaidSide, string> = { n: 'the north', e: 'the east', s: 'the south', w: 'the west' };

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

/** Today's absolute day. */
export function today(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

/** "today", "tomorrow", "in 3 days". */
export function whenWord(daysAhead: number): string {
  if (daysAhead <= 0) return 'tonight';
  if (daysAhead === 1) return 'tomorrow';
  return `in ${daysAhead} days`;
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

/** Stars from a joy total out of 100 (the same steps the result card reads back). */
export function starsFor(joy: number): number {
  return joy >= 85 ? 5 : joy >= 68 ? 4 : joy >= 50 ? 3 : joy >= 30 ? 2 : 1;
}

/**
 * The planner's live estimate: a rough reading of the outcome rule (12-hearth.md, Festivals) from
 * what the planner knows on the client. C5B's sim decides the real joy; the estimate says "about".
 */
export function joyEstimate(opts: {
  siteCharm: number;
  pieces: number;
  menu: [good: string, qty: number][];
  attendees: number;
  music: 'none' | 'resident' | 'bandstand';
  twist: boolean;
}): { parts: JoyParts; total: number; stars: number } {
  const enough = opts.menu.reduce((s, [, q]) => s + q, 0);
  const perHead = opts.attendees > 0 ? enough / opts.attendees : 0;
  const parts: JoyParts = {
    site: Math.round(Math.max(0, Math.min(100, opts.siteCharm))),
    variety: Math.min(100, opts.pieces * 20),
    menu: Math.round(Math.min(100, opts.menu.length * 15 + Math.min(1, perHead) * 40)),
    music: opts.music === 'bandstand' ? 80 : opts.music === 'resident' ? 55 : 0,
    twist: opts.twist ? 60 : 0,
  };
  const total = Math.round(
    parts.site * 0.3 + parts.variety * 0.15 + parts.menu * 0.3 + parts.music * 0.15 + parts.twist * 0.1,
  );
  return { parts, total, stars: starsFor(total) };
}

/** Watch training (100 to 160) as "1.2x". */
export function trainingWord(training: number): string {
  return `${(training / 100).toFixed(1)}×`;
}

/** Watch morale 0 to 100 in a word. */
export function moraleWord(morale: number): string {
  return morale >= 80 ? 'Stout' : morale >= 60 ? 'Steady' : morale >= 40 ? 'Wobbly' : 'Rattled';
}

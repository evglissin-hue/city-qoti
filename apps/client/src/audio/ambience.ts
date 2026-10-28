// Ambience mixing (C5G): what is around the camera, and so which loops play, how loud, and on which
// side. Pure, so emitter choice and loudness are tested without sound; the engine samples the
// Mirror every half second and fades each voice toward these levels over about a second.
import type { WeatherKind } from '@qoti/sim';
import type { AmbienceId } from './synth/ambience';

/** At most this many ambience voices play at once. */
export const MAX_VOICES = 8;
/** Voices quieter than this are dropped. */
export const MIN_GAIN = 0.03;

/** One emitter kind's presence around the focus: how much of it, and its weighted center. */
export interface Presence {
  /** 0 to 1 for area kinds (fraction of samples), or a count for building kinds. */
  amount: number;
  /** Weighted center relative to the focus, in tiles. */
  dx: number;
  dz: number;
}

/** What the camera hears from, sampled around the focus. */
export interface AmbienceScene {
  water: Presence;
  forest: Presence;
  grass: Presence;
  /** Average height level of the samples, 0 to 1 of the map's range. */
  height: number;
  /** Working buildings by sound. */
  hammer: Presence;
  anvil: Presence;
  saw: Presence;
  /** Stalls, taverns and the trading post (busier counts more). */
  market: Presence;
  /** Homes with folk in, for the hearth's crackle on cold evenings. */
  homes: Presence;
  /** Tiles from the focus to the edge of the sampled square. */
  radius: number;
}

export interface AmbienceConditions {
  /** 0 to 24 with minutes. */
  hour: number;
  /** 0 spring to 3 winter. */
  season: number;
  weather: WeatherKind;
  frozen: boolean;
  festival: boolean;
  /** Camera distance (zoom), world units. */
  zoom: number;
  /** Camera yaw, radians (for panning). */
  yaw: number;
}

export interface EmitterLevel {
  id: AmbienceId;
  gain: number;
  /** -1 left to 1 right. */
  pan: number;
}

export function emptyPresence(): Presence {
  return { amount: 0, dx: 0, dz: 0 };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Smooth 0 to 1 window over hours [from, to), with a `ramp`-hour fade at each end; wraps past 24. */
export function hourWindow(hour: number, from: number, to: number, ramp = 1): number {
  const span = (to - from + 24) % 24;
  const into = (hour - from + 24) % 24;
  if (into >= span) return 0;
  return clamp(Math.min(into / ramp, (span - into) / ramp), 0, 1);
}

/** Pan from an offset in tiles: the camera's right is (cos yaw, -sin yaw). */
export function panOf(dx: number, dz: number, yaw: number, radius: number): number {
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  return clamp(right / Math.max(1, radius), -1, 1) * 0.8;
}

/** Quieter the farther the emitter's center is from the focus. */
export function distanceGain(p: Presence, radius: number): number {
  const d = Math.hypot(p.dx, p.dz) / Math.max(1, radius);
  return 1 / (1 + d * d * 2);
}

/** Zoomed far out, the valley's small sounds fade and the wind takes over. */
export function zoomGain(zoom: number): number {
  return clamp(1.35 - zoom / 160, 0.2, 1);
}

/** The ambience levels for a scene, loudest first, at most MAX_VOICES. */
export function mixAmbience(scene: AmbienceScene, c: AmbienceConditions): EmitterLevel[] {
  const out: EmitterLevel[] = [];
  const near = zoomGain(c.zoom);
  const wet = c.weather === 'rain' || c.weather === 'storm';
  const day = hourWindow(c.hour, 5, 20, 1);
  const work = hourWindow(c.hour, 7, 18, 0.5);
  const push = (id: AmbienceId, gain: number, p: Presence | null): void => {
    const g = clamp(gain, 0, 1);
    if (g >= MIN_GAIN) out.push({ id, gain: g, pan: p ? panOf(p.dx, p.dz, c.yaw, scene.radius) : 0 });
  };
  // How much of a kind is near, scaled by `k`, softened by its distance and the zoom.
  const level = (p: Presence, k: number): number =>
    clamp(p.amount * k, 0, 1) * distanceGain(p, scene.radius) * near;

  push('river', c.frozen ? 0 : level(scene.water, 4) * 0.8, scene.water);
  const birdSeason = c.season === 3 ? 0.25 : c.season === 0 ? 1 : 0.8;
  const dawn = 1 + 0.5 * hourWindow(c.hour, 5, 9, 1.5);
  push(
    'birds',
    wet || c.weather === 'snow' ? 0 : level(scene.forest, 2.5) * 0.4 * day * birdSeason * dawn,
    scene.forest,
  );
  const night = hourWindow(c.hour, 20, 5, 1.5);
  push(
    'crickets',
    c.season === 3 || wet ? 0 : level(scene.grass, 1.6) * 0.45 * night * (c.season === 1 ? 1 : 0.6),
    scene.grass,
  );
  const gusty = c.weather === 'storm' ? 0.5 : c.weather === 'snow' ? 0.25 : 0;
  push('wind', 0.12 + scene.height * 0.35 + (1 - near) * 0.5 + gusty, null);
  push('rain', c.weather === 'storm' ? 0.9 : c.weather === 'rain' ? 0.6 : 0, null);
  const crowd = c.festival ? 1 : level(scene.market, 0.2) * hourWindow(c.hour, 8, 20, 1) * 0.6;
  push('murmur', crowd, c.festival ? null : scene.market);
  push('hammer', level(scene.hammer, 0.5) * work * 0.5, scene.hammer);
  // A fire in the grate, close up, on winter days and every cold evening.
  const cold = c.season === 3 ? 1 : c.season === 2 ? hourWindow(c.hour, 18, 6, 1) * 0.7 : 0;
  push('hearth', level(scene.homes, 0.12) * cold * Math.max(0, 1.6 - c.zoom / 60) * 0.5, scene.homes);
  push('anvil', level(scene.anvil, 0.7) * work * 0.4, scene.anvil);
  push('saw', level(scene.saw, 0.6) * work * 0.4, scene.saw);

  out.sort((a, b) => b.gain - a.gain || (a.id < b.id ? -1 : 1));
  return out.slice(0, MAX_VOICES);
}

/** Which ambience a working building makes, by content id. */
export const WORK_SOUNDS: ReadonlyMap<string, 'anvil' | 'hammer' | 'saw' | 'market'> = new Map([
  ['builders-yard', 'hammer'],
  ['carpenter', 'hammer'],
  ['cart-shed', 'hammer'],
  ['corner-shop', 'market'],
  ['market-stall', 'market'],
  ['sawmill', 'saw'],
  ['sawpit', 'saw'],
  ['smithy', 'anvil'],
  ['tavern', 'market'],
  ['trading-post', 'market'],
  ['workshop', 'hammer'],
]);

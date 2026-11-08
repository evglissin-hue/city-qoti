// Sim events to sounds (C5G). The client watches the Mirror; each cue below says, from the scene
// before and after an update, whether it should play. One line per cue, sorted by id. Place,
// remove, ping and emote come from the session (the player's own hand), not from here. Other
// tracks call `audio().cue(id)` only for things with no event.
import type { Mirror, MirrorChange } from '../../state/mirror';
import type { SoundCueId } from '../api';

/** What the cue rules compare between updates: a few counts and flags read off the Mirror. */
export interface CueScene {
  achievements: number;
  patterns: number;
  /** Buildings still under construction. */
  sites: ReadonlySet<number>;
  /** Built buildings. */
  built: ReadonlySet<number>;
  /** Today's sales income, pennies, and the day it is for. */
  sales: number;
  day: number;
  hour: number;
  raid: boolean;
  bell: boolean;
  festival: boolean;
  wolves: boolean;
  storm: boolean;
}

export interface CueRule {
  id: SoundCueId;
  when: (prev: CueScene, next: CueScene, change: MirrorChange) => boolean;
}

export const CUE_RULES: readonly CueRule[] = [
  { id: 'achievement', when: (a, b) => b.achievements > a.achievements },
  { id: 'bell', when: (a, b) => b.bell && !a.bell },
  { id: 'built', when: (a, b) => [...a.sites].some((id) => b.built.has(id)) },
  { id: 'coins', when: (a, b) => b.day === a.day && b.sales > a.sales },
  { id: 'festival-cheer', when: (a, b, c) => (b.festival && !a.festival) || c.together.length > 0 },
  { id: 'howl', when: (a, b) => b.wolves && b.hour >= 20 && (a.hour < 20 || !a.wolves) },
  { id: 'letter', when: (_a, _b, c) => c.letters.length > 0 || c.notices.some((n) => n.kind === 'letter') },
  { id: 'pattern', when: (a, b) => b.patterns > a.patterns },
  { id: 'raid-horn', when: (a, b) => b.raid && !a.raid },
  { id: 'rank-up', when: (_a, _b, c) => c.rankUp !== null },
  { id: 'thunder', when: (a, b) => b.storm && !a.storm },
];

/** Reads the scene the rules compare off the Mirror. */
export function cueScene(m: Mirror): CueScene {
  let achievements = 0;
  for (const a of m.achievements.values()) if (a.unlocked) achievements++;
  let patterns = 0;
  for (const p of m.patterns.values()) if (p.discovered) patterns++;
  const sites = new Set<number>();
  const built = new Set<number>();
  for (const b of m.buildings.values()) (b.stage === 'construction' ? sites : built).add(b.id);
  const sales =
    m.budget.value?.today.find((l) => l.category === 'sales' && l.kind === 'income')?.pennies ?? 0;
  const clock = m.clock.value;
  return {
    achievements,
    patterns,
    sites,
    built,
    sales,
    day: clock.day,
    hour: clock.hour,
    raid: m.raid.value !== null,
    bell: m.raid.value?.bell ?? false,
    festival: m.festival.value?.live ?? false,
    wolves: m.threat.value?.wolvesTonight ?? false,
    storm: m.weather.value?.today === 'storm',
  };
}

/** The cues an update calls for. A full load (a snapshot) plays nothing. */
export function cuesFor(prev: CueScene, next: CueScene, change: MirrorChange): SoundCueId[] {
  if (change.full) return [];
  return CUE_RULES.filter((r) => r.when(prev, next, change)).map((r) => r.id);
}

/** Commands whose submission plays the player's own place or remove sound. */
export function cueForCommand(t: string): SoundCueId | null {
  if (t.endsWith('.remove') || t === 'zone.clear' || t === 'terrain.lower') return 'remove';
  if (PLACE_COMMANDS.has(t)) return 'place';
  return null;
}

const PLACE_COMMANDS: ReadonlySet<string> = new Set([
  'build.place',
  'decor.place',
  'decor.placeRun',
  'field.paint',
  'note.pin',
  'road.paint',
  'terrain.pond',
  'terrain.raise',
  'tree.plant',
  'wall.paint',
  'zone.paint',
]);

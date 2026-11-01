// Charm source table (docs/spec/12-hearth.md, Charm). Built once from content: decor and building
// `charm` fields, plus the sources that are not content pieces (trees on the map, water in view,
// height, paths, construction sites, window boxes). Every source has a type key; the no-spam rule
// keeps only the two strongest instances of a type per tile and category.
import { type CharmCategory, type CharmSource, content } from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../constants';

/** Category index order of the five layers. */
export const CAT = { nature: 0, comfort: 1, light: 2, view: 3, noise: 4 } as const;
export const CATEGORIES: readonly CharmCategory[] = ['nature', 'comfort', 'light', 'view', 'noise'];

export interface Source {
  /** Type key for the no-spam rule. */
  type: number;
  cat: number;
  /** Value by day; noise is negative. */
  value: number;
  /** Value while lanterns are lit. */
  night: number;
  /** Reach in tiles: the value falls linearly to 0 one tile past the radius. */
  radius: number;
}

function toSources(type: number, list: readonly CharmSource[] | undefined): Source[] {
  return (list ?? []).map((s) => ({
    type,
    cat: CAT[s.category],
    value: s.value,
    night: s.nightValue ?? s.value,
    radius: s.radius,
  }));
}

/** Decor sources by decor def index. */
export const DECOR_SOURCES: readonly Source[][] = content.decor.map((d, i) => toSources(i, d.charm));
/** Building sources by building def index. */
export const BUILDING_SOURCES: readonly Source[][] = content.buildings.map((b, i) =>
  toSources(content.decor.length + i, b.charm),
);

const EXTRA = content.decor.length + content.buildings.length;
// Sources that are not content pieces (tune). Values from the spec table.
export const MATURE_TREE: Source = { type: EXTRA, cat: CAT.nature, value: 3, night: 3, radius: 2 };
/** Saplings and young trees: a little green, not yet shade. */
export const YOUNG_TREE: Source = { type: EXTRA, cat: CAT.nature, value: 1, night: 1, radius: 1 };
export const CONSTRUCTION: Source = { type: EXTRA + 1, cat: CAT.noise, value: -3, night: -3, radius: 2 };
/** Customized window boxes count as a small flower piece. */
export const WINDOW_BOXES: Source = { type: EXTRA + 2, cat: CAT.nature, value: 2, night: 2, radius: 1 };
export const TYPE_COUNT = EXTRA + 3;

export const WATER_VIEW = { value: 6, radius: 3 } as const;
export const HEIGHT_VIEW = { value: 3, above: 4, window: 5 } as const;
export const PATH_COMFORT = 1;
/** I3 (C5A): the ice by a skating spot while the river is frozen: a little comfort, close by. */
export const SKATING_COMFORT = { value: 3, radius: 2 } as const;
export const VARIETY = { per: 2, max: 10, radius: 3 } as const;
export const CLUTTER = { over: 12, penalty: 5, radius: 2 } as const;
export const ENCLOSURE = { bonus: 5, reach: 4, sides: 3 } as const;

/** Index of decor defs that never count as clutter (fences, walls and hedges are boundaries). */
export const DECOR_LINEAR: readonly boolean[] = content.decor.map((d) => !!d.linear);

const MAX_PIECE_RADIUS = Math.max(
  2,
  ...content.decor.flatMap((d) => (d.charm ?? []).map((s) => s.radius)),
  ...content.buildings.flatMap((b) => (b.charm ?? []).map((s) => s.radius)),
);
const MAX_DECOR_RADIUS = Math.max(0, ...content.decor.flatMap((d) => (d.charm ?? []).map((s) => s.radius)));
const MAX_SITE_RADIUS = Math.max(0, ...content.patterns.map((p) => p.siteBonus.radius));

/** How far (in tiles) a change can move charm: a recompute covers this much around it. */
export const CHARM_REACH = Math.max(
  MAX_PIECE_RADIUS + 1,
  MAX_SITE_RADIUS + 1,
  VARIETY.radius + 1,
  ENCLOSURE.reach + 1,
  HEIGHT_VIEW.window + 1,
);

/** How far (in tiles) a decor piece can reach a tile: its sources, variety and clutter. */
export const DECOR_REACH = Math.max(MAX_DECOR_RADIUS + 1, VARIETY.radius, CLUTTER.radius);

/** Lanterns are lit from 18:00 to 07:00 (dusk to the end of dawn). */
export const LIGHTS_ON_HOUR = 18;
export const LIGHTS_OFF_HOUR = 7;

export function lanternsLit(tick: number): boolean {
  const hour = Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR);
  return hour >= LIGHTS_ON_HOUR || hour < LIGHTS_OFF_HOUR;
}

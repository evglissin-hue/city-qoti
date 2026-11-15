// V3.0: the dressing resolver (docs/spec/20-architecture.md, V3 contracts). A pure function from a
// building's shared state, the rules (packages/content/src/dressingRules.ts) and the plot's anchors
// (anchors.ts) to the pieces on its plot, in kit-local space. Deterministic from its inputs alone, so
// both seats draw the same plot and an unchanged building gives the same list.
import {
  DRESSING_MAX_PER_RULE,
  DRESSING_STATS,
  type DressingAnchor,
  type DressingCount,
  type DressingKind,
  type DressingRule,
  type DressingSeason,
  type DressingStat,
  type DressingTier,
} from '@qoti/content';
import { ANCHOR_NAMES } from './anchors';
import type { AnchorPoint, AnchorRect, AnchorRun, KitAnchors } from './kits/types';

/**
 * What the resolver knows about one building, built by the dressing layer from the Mirror (shared
 * state only). `kind` is null for anything the dressing leaves alone (roads, walls, wells).
 */
export interface DressingSubject {
  /** The building's id: placements are keyed by it. */
  id: number;
  /** Its def id. */
  def: string;
  kind: DressingKind | null;
  trade?: string;
  /** 1 to 3 for a business; 1 otherwise. */
  level: number;
  /** R2's place kind; absent on `main` (a gap until R2X). */
  place?: string;
  /** The household's tier, for a home with one. */
  tier?: DressingTier;
  season: DressingSeason;
  /** The stats a rule may scale with (`DRESSING_STATS`); a missing one reads as 0. */
  stats: Readonly<Partial<Record<DressingStat, number>>>;
}

/** One piece on a plot, in kit-local space (the same space as the kit's `build` and anchors). */
export interface Placement {
  /** The rule that placed it. */
  rule: string;
  kit: string;
  params?: Readonly<Record<string, number | string | boolean>>;
  /** On the ground at y = 0 for yard, garden, front, walls, eaves and door; sills sit at their height. */
  at: [number, number, number];
  /** Turn about +y in radians; 0 faces +z (the street), as a kit's entrance does. */
  yaw: number;
  /** About 0.9 to 1.1, so a row of the same piece does not look stamped. */
  scale: number;
  /** A per-piece seed for the kit's own variation. */
  seed: number;
}

/** A 32-bit integer hash of two values (the resolver's only source of variety). */
export function mix32(a: number, b: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A small seeded stream, 0 (inclusive) to 1 (exclusive). */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when the rule dresses this building. */
export function matches(rule: DressingRule, s: DressingSubject): boolean {
  const w = rule.who;
  if (s.kind === null) return false;
  if (w.kind && !w.kind.includes(s.kind)) return false;
  if (w.def && !w.def.includes(s.def)) return false;
  if (w.trade && (s.trade === undefined || !w.trade.includes(s.trade))) return false;
  if (w.minLevel !== undefined && s.level < w.minLevel) return false;
  if (w.place && (s.place === undefined || !w.place.includes(s.place))) return false;
  if (w.tier && (s.tier === undefined || !w.tier.includes(s.tier))) return false;
  if (w.season && !w.season.includes(s.season)) return false;
  return true;
}

/** How many pieces a count gives for this building: bounded by `max` and `DRESSING_MAX_PER_RULE`. */
export function dressingCount(c: DressingCount, s: DressingSubject): number {
  const stat = c.stat ? (s.stats[c.stat] ?? 0) : 0;
  const n = Math.floor(c.base + (c.perUnit ?? 0) * stat);
  return Math.max(0, Math.min(n, c.max, DRESSING_MAX_PER_RULE));
}

function yawOf(f: readonly [number, number]): number {
  return Math.atan2(f[0], f[1]);
}

function inRect(r: AnchorRect, u: number, v: number): [number, number, number] {
  // u runs across (at right angles to facing), v along it; both -0.5 to 0.5 of the rect.
  const [fx, fz] = r.facing;
  const ax = fz;
  const az = -fx;
  const x = r.center[0] + ax * u * r.size[0] + fx * v * r.size[1];
  const z = r.center[2] + az * u * r.size[0] + fz * v * r.size[1];
  return [x, r.center[1], z];
}

function onRun(r: AnchorRun, t: number): [number, number, number] {
  return [
    r.start[0] + (r.end[0] - r.start[0]) * t,
    r.start[1] + (r.end[1] - r.start[1]) * t,
    r.start[2] + (r.end[2] - r.start[2]) * t,
  ];
}

/**
 * The pieces on one building's plot: each rule that matches, in table order, puts its count of its
 * piece at its anchor (spread through a rect, spaced along runs, dealt round points), jittered by a
 * stream from `seed`, the building's id and the rule's seed. A rule whose anchor the plot lacks puts
 * nothing. Pure: equal inputs give equal output.
 */
export function resolveDressing(
  subject: DressingSubject,
  rules: readonly DressingRule[],
  anchors: KitAnchors,
  seed: number,
): Placement[] {
  const out: Placement[] = [];
  if (subject.kind === null) return out;
  for (const rule of rules) {
    if (!matches(rule, subject)) continue;
    const base = mix32(mix32(seed, subject.id), rule.seed);
    const rnd = stream(base);
    if (rule.chance !== undefined && rnd() >= rule.chance) continue;
    const n = dressingCount(rule.count, subject);
    if (n === 0) continue;
    const put = (at: [number, number, number], yaw: number, i: number): void => {
      out.push({
        rule: rule.id,
        kit: rule.piece.kit,
        ...(rule.piece.params ? { params: rule.piece.params } : {}),
        at,
        yaw,
        scale: 0.9 + rnd() * 0.2,
        seed: mix32(base, i),
      });
    };
    placeAt(rule.anchor, anchors, n, rnd, put);
  }
  return out;
}

function placeAt(
  anchor: DressingAnchor,
  a: KitAnchors,
  n: number,
  rnd: () => number,
  put: (at: [number, number, number], yaw: number, i: number) => void,
): void {
  const rect =
    anchor === 'yard' ? a.yard : anchor === 'front' ? a.front : anchor === 'garden' ? a.garden : null;
  if (rect !== null) {
    if (!rect) return;
    for (let i = 0; i < n; i++) {
      // Jittered cells across the rect, so pieces spread rather than heap.
      const u = (i + 0.2 + rnd() * 0.6) / n - 0.5;
      const v = (rnd() - 0.5) * 0.6;
      put(inRect(rect, u, v), yawOf(rect.facing) + (rnd() - 0.5) * 0.5, i);
    }
    return;
  }
  if (anchor === 'walls') {
    const runs = a.walls;
    if (!runs?.length) return;
    for (let i = 0; i < n; i++) {
      const run = runs[i % runs.length]!;
      const k = Math.floor(i / runs.length);
      const per = Math.ceil((n - (i % runs.length)) / runs.length);
      put(onRun(run, (k + 0.5) / per), yawOf(run.facing), i);
    }
    return;
  }
  const points: readonly AnchorPoint[] | undefined =
    anchor === 'door' ? (a.door ? [a.door] : undefined) : anchor === 'sills' ? a.sills : a.eaves;
  if (!points?.length) return;
  for (let i = 0; i < n; i++) {
    const p = points[i % points.length]!;
    // Repeats at one point step sideways along its face, alternating left and right.
    const k = Math.floor(i / points.length);
    const side = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 0.22;
    const [fx, fz] = p.facing;
    put([p.at[0] + fz * side, p.at[1], p.at[2] - fx * side], yawOf(p.facing), i);
  }
}

/**
 * A key that changes exactly when a subject's resolver input changes, for the layer's per-building
 * cache (an unchanged building keeps its placements).
 */
export function subjectKey(s: DressingSubject): string {
  let stats = '';
  for (const d of DRESSING_STATS) stats += `${s.stats[d.id] ?? 0},`;
  return `${s.def}|${s.kind ?? '-'}|${s.trade ?? ''}|${s.level}|${s.place ?? ''}|${s.tier ?? ''}|${s.season}|${stats}`;
}

/** The rules a preset draws: Low ('some') keeps only signs and stock piles (`low`), the rest all. */
export function rulesFor(level: 'some' | 'all', rules: readonly DressingRule[]): readonly DressingRule[] {
  return level === 'all' ? rules : rules.filter((r) => r.low);
}

/**
 * What is wrong with a rules table, one line each (empty when it is sound): unknown kits, anchors or
 * stats, counts out of bounds, duplicate ids, a chance outside 0 to 1. Tests run it on the shipped
 * table and on bad rules, so a bad rule fails CI.
 */
export function validateDressingRules(
  rules: readonly DressingRule[],
  isKit: (id: string) => boolean,
  isTrade: (id: string) => boolean = () => true,
  isDef: (id: string) => boolean = () => true,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const seeds = new Set<number>();
  const stats = new Set<string>(DRESSING_STATS.map((d) => d.id));
  const anchors = new Set<string>(ANCHOR_NAMES);
  for (const r of rules) {
    const at = `rule ${r.id}`;
    if (ids.has(r.id)) errors.push(`${at}: duplicate id`);
    ids.add(r.id);
    if (seeds.has(r.seed)) errors.push(`${at}: seed ${r.seed} is another rule's`);
    seeds.add(r.seed);
    if (!isKit(r.piece.kit)) errors.push(`${at}: no kit ${r.piece.kit}`);
    if (!anchors.has(r.anchor)) errors.push(`${at}: no anchor ${r.anchor}`);
    const c = r.count;
    if (c.stat !== undefined && !stats.has(c.stat)) errors.push(`${at}: no stat ${c.stat}`);
    if (c.stat === undefined && c.perUnit) errors.push(`${at}: perUnit without a stat`);
    if (!(c.base >= 0) || !(c.max >= 1) || c.max > DRESSING_MAX_PER_RULE || c.base > c.max)
      errors.push(`${at}: count out of bounds (base ${c.base}, max ${c.max})`);
    if (r.chance !== undefined && !(r.chance > 0 && r.chance <= 1)) errors.push(`${at}: chance ${r.chance}`);
    for (const t of r.who.trade ?? []) if (!isTrade(t)) errors.push(`${at}: no trade ${t}`);
    for (const d of r.who.def ?? []) if (!isDef(d)) errors.push(`${at}: no building ${d}`);
    if (r.who.minLevel !== undefined && !(r.who.minLevel >= 1 && r.who.minLevel <= 3))
      errors.push(`${at}: minLevel ${r.who.minLevel}`);
  }
  return errors;
}

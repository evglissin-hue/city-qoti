// The three R2 gap rules (docs/spec/19-evenings.md, Gaps), read once an evening at 21:10 from Village
// rank on a fair evening. Numbers come from content.gaps (threshold, openAfter, closeAfter). Each rule
// walks its candidates in sorted order and keeps `state.gaps.streaks` (sorted by kind, then subject,
// compared with `<`): a (kind, subject) has one streak, toward opening while no gap is open for it,
// toward closing while one is. A streak is deleted when its condition fails on an evaluated evening,
// when its gap opens and when its gap closes. Pure of everything but saved state and the place index.
import { content, type GapDef, type GapKind } from '@qoti/content';
import { MAP_SIZE, RoundFlags } from '../../constants';
import type { EntityId, GapStreak, PlaceId, Rot4, SeatId, TickCtx, WorldState } from '../../contracts';
import { footprintTiles } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { placeState } from '../../state/evenings';
import { dayIndex } from '../economy/time';
import { sellsTreats, treatsOnShelf } from '../market/round';
import { placeById, placesNear, placeServes } from '../places/api';
import { streetTiles } from '../places/streets';
import { closeGap, dropGap, findGap, openGap } from './api';
import { buildingCredit, placeCredit } from './credit';

/** How near a place must be to a shop to count as walking by it (the spec's "within 3 tiles"). */
const NEAR_TILES = 3;

/** One evening's pass over the rules: whether anything a viewer sees changed. */
export interface GapPass {
  state: WorldState;
  ctx: TickCtx;
  changed: boolean;
  /**
   * The rule being read may open a gap: the town can build what would close it (achievable.ts).
   * When it cannot, its opening streaks hold as they are, and open gaps still close or drop.
   */
  canOpen?: boolean;
  /**
   * R2X: whether something could close a gap of this kind about this subject where it stands (R2E's
   * placement rule, view/health.ts gapClosable). A gap nothing could close is never opened: the audit
   * flagged a shop with no room for a seat near its door.
   */
  closable?: (kind: GapKind, subject: string, tile: number) => boolean;
}

// --- streaks -------------------------------------------------------------------------------------

function before(a: GapStreak, kind: GapKind, subject: string): boolean {
  return a.kind < kind || (a.kind === kind && a.subject < subject);
}

function streakIndex(state: WorldState, kind: GapKind, subject: string): number {
  const list = state.gaps.streaks;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(list[mid]!, kind, subject)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Counts one more evening on the streak (making it at 1), marks it held tonight, returns its count. */
function bump(state: WorldState, held: Set<string>, kind: GapKind, subject: string): number {
  const list = state.gaps.streaks;
  const at = streakIndex(state, kind, subject);
  const row = list[at];
  held.add(subject);
  if (row && row.kind === kind && row.subject === subject) {
    row.n += 1;
    return row.n;
  }
  list.splice(at, 0, { kind, subject, n: 1 });
  return 1;
}

function clearStreak(state: WorldState, kind: GapKind, subject: string): void {
  const at = streakIndex(state, kind, subject);
  const row = state.gaps.streaks[at];
  if (row && row.kind === kind && row.subject === subject) state.gaps.streaks.splice(at, 1);
}

/** Deletes this kind's streaks that did not hold tonight (the condition failed, or nothing was evaluated). */
function sweep(state: WorldState, kind: GapKind, held: ReadonlySet<string>): void {
  const list = state.gaps.streaks;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (s.kind === kind && !held.has(s.subject)) list.splice(i, 1);
  }
}

// --- one subject's evening -----------------------------------------------------------------------

interface Reading {
  /** The opening condition holds tonight. */
  opens: boolean;
  /** The number the words quote (read only when a gap opens or is refreshed). */
  n: number;
  /** The closing condition holds tonight (read only while a gap is open). */
  closes: boolean;
  /** Who is credited when it closes (read only then). */
  closers: () => SeatId[];
  /** Refresh the open gap's number while the opening condition holds. */
  refresh: boolean;
}

function advance(
  pass: GapPass,
  held: Set<string>,
  def: GapDef,
  subject: string,
  tile: number,
  r: Reading,
): void {
  const { state, ctx } = pass;
  const gap = findGap(state, def.kind, subject);
  if (!gap) {
    if (!r.opens) return;
    if (pass.canOpen === false || (pass.closable && !pass.closable(def.kind, subject, tile))) {
      // Nothing the town can build would close it yet: keep the streak, open nothing.
      const at = streakIndex(state, def.kind, subject);
      const row = state.gaps.streaks[at];
      if (row && row.kind === def.kind && row.subject === subject) held.add(subject);
      return;
    }
    if (bump(state, held, def.kind, subject) < def.openAfter) return;
    clearStreak(state, def.kind, subject);
    openGap(state, ctx, def.kind, subject, tile, r.n);
    pass.changed = true;
    return;
  }
  if (r.refresh && r.opens && gap.n !== r.n) {
    gap.n = r.n;
    pass.changed = true;
  }
  if (!r.closes) return;
  if (bump(state, held, def.kind, subject) < def.closeAfter) return;
  clearStreak(state, def.kind, subject);
  closeGap(state, ctx, gap, r.closers());
  pass.changed = true;
}

/** Removes open gaps of this kind whose subject is gone: no credit, no count, no listing. */
function dropGone(pass: GapPass, kind: GapKind, gone: (subject: string) => boolean): void {
  for (const gap of [...pass.state.gaps.open]) {
    if (gap.kind !== kind || !gone(gap.subject)) continue;
    dropGap(pass.state, pass.ctx, gap);
    clearStreak(pass.state, kind, gap.subject);
    pass.changed = true;
  }
}

function last(list: readonly number[]): number {
  return list.length > 0 ? list[list.length - 1]! : 0;
}

function def(kind: GapKind): GapDef {
  return content.gapByKind.get(kind)!;
}

// --- a place with nothing to sell ----------------------------------------------------------------

function nothingToSell(pass: GapPass): void {
  const { state } = pass;
  const d = def('nothingToSell');
  const today = dayIndex(state.tick);
  const held = new Set<string>();
  dropGone(pass, d.kind, (s) => !placeState(state, s) || !placeById(state, s));
  for (const row of state.places) {
    if (row.seenDay !== today && !findGap(state, d.kind, row.id)) continue;
    const place = placeById(state, row.id);
    if (!place) continue;
    const v = last(row.visitors);
    const s = last(row.served);
    advance(pass, held, d, row.id, place.tile, {
      opens: v >= d.threshold && s === 0,
      n: v,
      closes: s > 0,
      refresh: true,
      closers: () => {
        let outlets: EntityId[] = placeServes(state, place);
        if (outlets.length === 0) {
          outlets = place.outlets.filter((id) => {
            const b = findById(state.buildings, id);
            return !!b && sellsTreats(state, b);
          });
        }
        return buildingCredit(state, outlets);
      },
    });
  }
  sweep(state, d.kind, held);
}

// --- a shop nobody passes ------------------------------------------------------------------------

function nobodyPasses(pass: GapPass): void {
  const { state } = pass;
  const d = def('nobodyPasses');
  // A place "draws" when it fills the rule's own visitor bar: the number a place with nothing to sell
  // is measured by (docs/spec/19-evenings.md, Gaps: both rows say 8+).
  const draws = def('nothingToSell').threshold;
  const held = new Set<string>();
  dropGone(pass, d.kind, (s) => !findById(state.buildings, Number(s.slice('building:'.length))));
  for (const b of state.buildings) {
    const subject = `building:${b.id}`;
    const open = findGap(state, d.kind, subject);
    if (!open && !(sellsTreats(state, b) && treatsOnShelf(state, b))) continue;
    const tile = b.z * MAP_SIZE + b.x;
    const near = placesNear(state, tile, NEAR_TILES);
    let folk = 0;
    let best: PlaceId | undefined;
    let bestVisitors = -1;
    let drawing = false;
    const rows: number[][] = [];
    for (const p of near) {
      const row = placeState(state, p.id);
      const visitors = row ? row.visitors : [];
      rows.push(visitors);
      const v = last(visitors);
      folk += v;
      if (v >= draws) drawing = true;
      if (v > bestVisitors) {
        bestVisitors = v;
        best = p.id;
      }
    }
    const opens = folk < d.threshold;
    advance(pass, held, d, subject, tile, {
      opens,
      n: opens ? rows.reduce((sum, v) => sum + v.slice(-d.openAfter).reduce((a, c) => a + c, 0), 0) : 0,
      closes: drawing,
      refresh: false,
      closers: () => placeCredit(state, best === undefined ? undefined : placeById(state, best)),
    });
  }
  sweep(state, d.kind, held);
}

// --- nowhere to go -------------------------------------------------------------------------------

interface StreetTally {
  stayed: number;
  went: number;
  /** Arrived place stops tonight by the households that went out, by place. */
  visits: Map<PlaceId, number>;
}

/** The street a home stands on: its lot's frontage, else the lowest-id street beside its footprint. */
function homeStreet(
  state: WorldState,
  home: number,
  byTile: ReadonlyMap<number, EntityId>,
): EntityId | undefined {
  const b = findById(state.buildings, home);
  if (!b) return undefined;
  const lot = b.lot !== undefined ? findById(state.lots, b.lot) : undefined;
  if (lot) {
    const onFront = byTile.get(lot.frontage);
    if (onFront !== undefined) return onFront;
  }
  const bdef = content.buildingById.get(b.def);
  if (!bdef) return undefined;
  let best: EntityId | undefined;
  for (const [x, z] of footprintTiles(bdef, b.x, b.z, b.rot as Rot4)) {
    for (const [dx, dz] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) continue;
      const s = byTile.get(nz * MAP_SIZE + nx);
      if (s !== undefined && (best === undefined || s < best)) best = s;
    }
  }
  return best;
}

function nowhereToGo(pass: GapPass): void {
  const { state } = pass;
  const d = def('nowhereToGo');
  const held = new Set<string>();
  const streetIds = new Set<EntityId>();
  const byTile = new Map<number, EntityId>();
  for (const street of state.streets) {
    streetIds.add(street.id);
    for (const t of streetTiles(state, street)) if (!byTile.has(t)) byTile.set(t, street.id);
  }
  dropGone(pass, d.kind, (s) => !streetIds.has(Number(s.slice('street:'.length))));

  const tallies = new Map<EntityId, StreetTally>();
  for (const h of state.households) {
    let planned = false;
    let went = false;
    const arrivedAt: PlaceId[] = [];
    for (const id of h.members) {
      const r = findById(state.residents, id);
      if (!r || (r.stage !== 'young' && r.stage !== 'adult') || !r.round) continue;
      planned = true;
      for (const stop of r.round) {
        if (stop.kind === 'shop' || stop.kind === 'visit' || !(stop.flags & RoundFlags.arrived)) continue;
        went = true;
        arrivedAt.push(stop.place);
      }
    }
    if (!planned) continue;
    const street = homeStreet(state, h.homeId, byTile);
    if (street === undefined) continue;
    let t = tallies.get(street);
    if (!t) {
      t = { stayed: 0, went: 0, visits: new Map() };
      tallies.set(street, t);
    }
    if (went) {
      t.went += 1;
      for (const p of arrivedAt) t.visits.set(p, (t.visits.get(p) ?? 0) + 1);
    } else t.stayed += 1;
  }

  for (const street of state.streets) {
    const t = tallies.get(street.id) ?? { stayed: 0, went: 0, visits: new Map<PlaceId, number>() };
    advance(pass, held, d, `street:${street.id}`, street.anchor, {
      opens: t.stayed >= d.threshold,
      n: t.stayed,
      closes: t.went > 0 && t.went * 2 >= t.went + t.stayed,
      refresh: true,
      closers: () => {
        let top: PlaceId | undefined;
        let most = 0;
        for (const [p, c] of t.visits) {
          if (c > most || (c === most && top !== undefined && p < top)) {
            top = p;
            most = c;
          }
        }
        return placeCredit(state, top === undefined ? undefined : placeById(state, top));
      },
    });
  }
  sweep(state, d.kind, held);
}

/**
 * R2X: a Hamlet whose growth waits on its evenings reads the nowhere-to-go rule alone, so the town is
 * told in the feed what would bring newcomers (the caller has checked the evening and the weather).
 */
export function keepQuietStreets(pass: GapPass, achievable: (kind: GapKind) => boolean): void {
  pass.canOpen = achievable('nowhereToGo');
  nowhereToGo(pass);
  pass.canOpen = true;
}

/** Reads the three R2 rules once. The caller has checked rank, the evening and the weather. */
export function keepGaps(pass: GapPass, achievable: (kind: GapKind) => boolean): void {
  pass.canOpen = achievable('nothingToSell');
  nothingToSell(pass);
  pass.canOpen = achievable('nobodyPasses');
  nobodyPasses(pass);
  pass.canOpen = achievable('nowhereToGo');
  nowhereToGo(pass);
  pass.canOpen = true;
}

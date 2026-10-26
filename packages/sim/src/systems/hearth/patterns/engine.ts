// The Pattern Book engine (docs/spec/12-hearth.md). Each pass runs every pattern's detector,
// keys instances by (pattern, anchor tile) so they stay stable, and diffs them against the stored
// sites: new sites are added, vanished ones removed with their bonus, changed ones updated. The
// first valid instance of a pattern anywhere is its discovery: a Book entry, a Chronicle line, a
// notice for both seats, unlocks and the next hint. Credit goes to the seat that placed most of the
// site's pieces (ties to whoever placed the latest piece); both seats placing pieces counts for
// Built Together. Site changes mark charm dirty so the bonus follows on the next tick.
import { chroniclePhrases, content, type PatternDef } from '@qoti/content';
import { MAP_SIZE } from '../../../constants';
import type { EntityId, PatternSite, SeatId, TickCtx, WorldState } from '../../../contracts';
import { findById } from '../../../state/entities';
import { patternView, townView } from '../../../view/hamlet';
import { chronicle } from '../../chronicle/api';
import { creditText, fill, listJoin, pick, placeName } from '../../chronicle/text';
import { markCharmDirty, markCharmSoon } from '../charm/dirty';
import { detectors } from './detectors';
import { beginPass, endPass, type SiteCandidate } from './shared';

const S = MAP_SIZE;
export const MAX_HINTS = 3;

/** Patterns in the order their hints are revealed. */
export const HINT_ORDER: readonly PatternDef[] = content.patterns
  .map((p, i) => [p, i] as const)
  .sort((a, b) => (a[0].hintOrder ?? 1000 + a[1]) - (b[0].hintOrder ?? 1000 + b[1]))
  .map(([p]) => p);

function sameList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Who placed a site's members: per-seat counts and the seat of the newest piece. */
function placedBy(
  state: WorldState,
  members: readonly EntityId[],
): { counts: number[]; latest: SeatId | -1 } {
  const counts = [0, 0, 0, 0];
  let latest: SeatId | -1 = -1;
  let latestId = 0;
  for (const id of members) {
    const piece = findById(state.decor, id) ?? findById(state.buildings, id);
    if (!piece) continue;
    counts[piece.builtBy]!++;
    if (id > latestId) {
      latestId = id;
      latest = piece.builtBy;
    }
  }
  return { counts, latest };
}

function toSite(state: WorldState, def: PatternDef, c: SiteCandidate, tick: number): PatternSite {
  const members = [...new Set(c.members)].sort((a, b) => a - b);
  const tiles = [...new Set(c.tiles)].sort((a, b) => a - b);
  const { counts } = placedBy(state, members);
  const seats: SeatId[] = [];
  for (let s = 0; s < counts.length; s++) if (counts[s]! > 0) seats.push(s as SeatId);
  return { pattern: def.id, anchor: c.anchor, members, tiles, seats, tick };
}

/** The core tiles a site's bonus radiates from. */
function siteRect(site: PatternSite): [number, number, number, number] {
  let x0 = S;
  let z0 = S;
  let x1 = -1;
  let z1 = -1;
  for (const t of [site.anchor, ...site.tiles]) {
    const x = t % S;
    const z = (t - x) / S;
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}

export interface PatternPassResult {
  added: number;
  removed: number;
  discovered: string[];
}

/** Runs every detector over the map and applies the differences. */
export function runPatterns(state: WorldState, ctx: TickCtx): PatternPassResult {
  beginPass();
  try {
    return pass(state, ctx);
  } finally {
    endPass();
  }
}

function pass(state: WorldState, ctx: TickCtx): PatternPassResult {
  const h = state.hearth;
  const result: PatternPassResult = { added: 0, removed: 0, discovered: [] };
  const next: PatternSite[] = [];
  let charmTouched = false;

  for (const def of content.patterns) {
    const detect = detectors.get(def.detector);
    const old = h.sites.filter((s) => s.pattern === def.id);
    const oldByAnchor = new Map(old.map((s) => [s.anchor, s]));
    const found = detect ? detect(state, def) : [];
    found.sort((a, b) => a.anchor - b.anchor);
    const fresh: PatternSite[] = [];
    let added = 0;
    let removed = 0;
    let changed = 0;
    for (const c of found) {
      if (fresh.length > 0 && fresh[fresh.length - 1]!.anchor === c.anchor) continue;
      const prev = oldByAnchor.get(c.anchor);
      const site = toSite(state, def, c, prev ? prev.tick : state.tick);
      if (!prev) {
        added++;
        markCharmDirty(state, siteRect(site));
      } else if (!sameList(prev.members, site.members) || !sameList(prev.tiles, site.tiles)) {
        changed++;
        markCharmDirty(state, siteRect(prev));
        markCharmDirty(state, siteRect(site));
      } else {
        site.seats = prev.seats;
      }
      fresh.push(site);
    }
    const kept = new Set(fresh.map((s) => s.anchor));
    for (const s of old) {
      if (kept.has(s.anchor)) continue;
      removed++;
      markCharmDirty(state, siteRect(s));
    }
    for (const s of fresh) next.push(s);
    if (added || removed || changed) charmTouched = true;
    result.added += added;
    result.removed += removed;

    const discovering = fresh.length > 0 && !h.discovered.some((d) => d.pattern === def.id);
    if (!discovering && !added && !removed && !changed) continue;
    // The views below read hearth.sites, so this pattern's sites are swapped in now.
    h.sites = [...h.sites.filter((s) => s.pattern !== def.id), ...fresh];
    if (discovering) {
      discover(state, ctx, def, fresh[0]!);
      result.discovered.push(def.id);
    } else {
      const e = added ? 'pattern.siteAdded' : removed ? 'pattern.siteRemoved' : 'pattern.updated';
      ctx.events.push({ e, p: patternView(state, def.id) });
    }
  }

  next.sort((a, b) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : a.anchor - b.anchor));
  h.sites = next;
  if (charmTouched) markCharmSoon(state);
  refillHints(state, ctx);
  return result;
}

function discover(state: WorldState, ctx: TickCtx, def: PatternDef, site: PatternSite): void {
  const h = state.hearth;
  const { counts, latest } = placedBy(state, site.members);
  let seat: SeatId = latest !== -1 ? latest : (state.time.connected[0] ?? 0);
  let most = -1;
  for (let s = 0; s < counts.length; s++) {
    const n = counts[s]!;
    if (n > most || (n === most && s === latest)) {
      most = n;
      seat = s as SeatId;
    }
  }
  const together = site.seats.length >= 2;
  h.discovered.push({ pattern: def.id, tick: state.tick, seat, together, anchor: site.anchor });
  if (together) state.stats.builtTogether += 1;

  const unlocked: string[] = [];
  for (const id of def.unlocks) {
    if (!h.unlocked.includes(id)) {
      h.unlocked.push(id);
      unlocked.push(id);
    }
  }
  const hinted = h.hints.indexOf(def.id);
  if (hinted >= 0) h.hints.splice(hinted, 1);

  const credited: SeatId[] = together ? site.seats : [seat];
  chronicle(state, ctx, 'pattern-discovered', {
    text: [
      ['pattern', def.name],
      ['place', placeName(state, ctx, site.anchor)],
      ['credit', creditText(state, ctx, credited)],
      ['flavor', def.flavor],
    ],
    refs: [...site.members],
    seats: [...credited],
  });
  const names = unlocked.map((id) => (content.decorById.get(id) ?? content.buildingById.get(id))?.name ?? id);
  const unlocks = names.length
    ? fill(pick(ctx, chroniclePhrases.unlocksNotice), [['pieces', listJoin(names)]])
    : '';
  const x = site.anchor % S;
  ctx.events.push({
    e: 'notify',
    kind: 'pattern',
    text: fill(pick(ctx, chroniclePhrases.patternNotice), [
      ['pattern', def.name],
      ['unlocks', unlocks],
    ]).trim(),
    at: [x, (site.anchor - x) / S],
  });
  ctx.events.push({ e: 'pattern.discovered', p: patternView(state, def.id) });
  if (unlocked.length) ctx.events.push({ e: 'town.updated', t: townView(state) });
}

/** Keeps 3 undiscovered hints visible, revealing the next in hint order. */
export function refillHints(state: WorldState, ctx: TickCtx | null): void {
  const h = state.hearth;
  const discovered = new Set(h.discovered.map((d) => d.pattern));
  for (let i = h.hints.length - 1; i >= 0; i--) if (discovered.has(h.hints[i]!)) h.hints.splice(i, 1);
  for (const p of HINT_ORDER) {
    if (h.hints.length >= MAX_HINTS) break;
    if (discovered.has(p.id) || h.hints.includes(p.id) || p.rank !== 'hamlet') continue;
    h.hints.push(p.id);
    ctx?.events.push({ e: 'pattern.updated', p: patternView(state, p.id) });
  }
}

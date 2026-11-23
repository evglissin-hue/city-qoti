// The Town Book advisor (R3X): the pair read the book together. From Village rank they look at the
// three hints (`state.townBook.hints`: ids of specialties or customs not yet found) and work toward
// the cheapest first, one action a day at most, with the moves a player has:
// - a supply custom (a place's pieces of one kind kept every night of a season): that place first
//   (`place.setPriority keep`), the carrier buying for places in the family the pieces burn when the
//   town can afford it, and a fire (brazier) beside the place when it has none and winter is coming;
// - a day custom (the same place drawing a crowd on the same day): the fitting place first, and a
//   piece of the kind it lacks (a seat, a flower bed, a lantern) beside it, to raise its draw;
// - a specialty (a Treat sold at a place of one pattern): a site of the pattern if one stands (the
//   places advisor composes the Corner Cafe), an outlet within reach (shops zoned by the place), a
//   trade that makes the Treat (a spare business pinned to it), and the place first.
// The Hearth seat (1) sends the priorities and the decor; the Ledger seat (0) the zones, pins and the
// carrier, so the Ledger's decisions count stays inside the lanes limit. Money: nothing here runs
// while the town owes the bank past its reserve, and the decor waits under `MIN_COINS`.
import { content } from '@qoti/content';
import {
  canPlaceDecor,
  loansOwed,
  placesView,
  rankAtLeast,
  TILE_FP,
  worldIndex,
  Zone,
  calendar,
  type PlaceView,
  type WorldState,
} from '@qoti/sim';
import { REPAY_RESERVE, type Planner } from '../planner';
import { idx, S } from '../town';
import { supplyPlaceFor } from './lamps';
import { PLACES_OFF_COINS } from './supplies';
import { shopsNear } from './shops';
import type { Advisor, AdvisorDef } from './types';

/** Coins under which the pair send nothing that costs. */
const MIN_COINS = 60;
/** Coins above which the carrier may buy for places for a Town Book supply custom. */
const CARRIER_COINS = PLACES_OFF_COINS + 60;
/** Days before a place's priority is touched again. */
const PRIORITY_DAYS = 4;
/** Days between two attempts at the same thing (a refusal is not retried at once). */
const RETRY_DAYS = 3;
/** The family each supply kind's goods ride in, for `carrier.setRule` (`places` buys for them). */
const FAMILY_OF: Record<string, 'fuel' | 'wares' | undefined> = {
  nightly: 'wares',
  evening: 'fuel',
  season: 'wares',
};
/** Pieces that raise a place's draw by kind (a seat, a flower, a lantern), in the order they are added. */
const KIND_PIECES: readonly { def: string; has: (def: string) => boolean }[] = [
  { def: 'bench', has: (d) => !!content.decorById.get(d)?.seats },
  { def: 'flower-bed', has: (d) => content.decorById.get(d)?.tags.includes('flower') ?? false },
  { def: 'lantern', has: (d) => content.decorById.get(d)?.supply?.kind === 'nightly' },
];

type Pt = [x: number, z: number];

/** Whether a place row id fits a custom's pattern or host. */
function fitsDef(w: WorldState, id: string, def: { pattern?: string; host?: string }): boolean {
  if (def.pattern !== undefined) return id.startsWith(`site:${def.pattern}:`);
  if (def.host !== undefined) {
    if (!id.startsWith('host:')) return false;
    const b = w.buildings.find((x) => x.id === Number(id.slice('host:'.length)));
    return b?.def === def.host;
  }
  return true;
}

class TownBook implements Advisor {
  /** Run day a place's priority was last set. */
  private readonly prio = new Map<string, number>();
  /** Run day a thing (keyed) was last tried. */
  private readonly tried = new Map<string, number>();
  /** Business ids already pinned for a Treat. */
  private readonly pinned = new Set<number>();
  /** The run day of the last Town Book action (one a day). */
  private acted = -1;
  /** Whether the purse allows a spend today. */
  private spare = false;

  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  private recent(key: string): boolean {
    return this.p.runDay - (this.tried.get(key) ?? -RETRY_DAYS) < RETRY_DAYS;
  }

  /** Runs one action, counted for the day, remembered under `key`. */
  private act(key: string, label: string, cmds: Parameters<Planner['do']>[1], seat: 0 | 1): boolean {
    if (!this.spare && cmds.some((c) => c.t !== 'place.setPriority')) return false;
    this.tried.set(key, this.p.runDay);
    const ok = this.p.do(`book: ${label}`, cmds, seat);
    if (ok) this.acted = this.p.runDay;
    return ok;
  }

  visit(v: { afternoon: boolean }): void {
    const w = this.w;
    const p = this.p;
    // The morning's look is the pair's reading; one action a day.
    if (v.afternoon || this.acted === p.runDay || !rankAtLeast(w, 'village')) return;
    // Priorities cost nothing; what costs coins waits for a purse (and a town that owes the bank, for its reserve).
    this.spare = p.coins() >= MIN_COINS && (loansOwed(w) === 0 || p.coins() >= REPAY_RESERVE);
    const places = placesView(w).places;
    const hints = w.townBook.hints;
    const rank = (id: string): number => {
      if (content.customById.get(id)?.kind === 'supply') return 0;
      if (content.customById.get(id)?.kind === 'day') return 1;
      return 2;
    };
    for (const id of [...hints].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))) {
      const custom = content.customById.get(id);
      const done =
        custom?.kind === 'supply'
          ? this.supplyCustom(custom.supply!, places)
          : custom?.kind === 'day'
            ? this.dayCustom(custom, places)
            : this.specialty(id, places);
      if (done) return;
    }
  }

  private setPriority(pl: PlaceView, why: string): boolean {
    if ((pl.priority ?? 'normal') === 'keep') return false;
    if (this.p.runDay - (this.prio.get(pl.id) ?? -PRIORITY_DAYS) < PRIORITY_DAYS) return false;
    const ok = this.act(
      `prio:${pl.id}`,
      `${pl.name} first (${why})`,
      [{ t: 'place.setPriority', id: pl.id, priority: 'keep' }],
      1,
    );
    if (ok) this.prio.set(pl.id, this.p.runDay);
    return ok;
  }

  private supplyCustom(kind: string, places: PlaceView[]): boolean {
    const w = this.w;
    const p = this.p;
    const pl = supplyPlaceFor(w, places, kind);
    if (pl && this.setPriority(pl, `kept ${kind}`)) return true;
    // The goods those pieces burn must come: the carrier buys for places when the town can afford it.
    const family = FAMILY_OF[kind];
    if (family && pl) {
      const f = w.carrier.families[family === 'fuel' ? 1 : 3];
      if (
        f &&
        !f.places &&
        loansOwed(w) === 0 &&
        p.coins() >= CARRIER_COINS &&
        !this.recent(`carrier:${family}`)
      )
        return this.act(
          `carrier:${family}`,
          `${family} bought for places (${kind} kept)`,
          [{ t: 'carrier.setRule', family, rule: f.rule, sell: f.sell, places: true }],
          0,
        );
    }
    // A fire where there is none (winter fires): a brazier beside the busiest place, from autumn.
    if (kind === 'evening' && !pl && calendar(w.tick).season >= 1 && w.hearth.unlocked.includes('brazier')) {
      const busy = [...places].sort(
        (a, b) => b.visitors.reduce((s, x) => s + x, 0) - a.visitors.reduce((s, x) => s + x, 0),
      )[0];
      if (busy && !this.recent('brazier')) return this.addPiece('brazier', busy, 'fire for the winter fires');
    }
    return false;
  }

  private dayCustom(def: { id: string; pattern?: string; host?: string }, places: PlaceView[]): boolean {
    const fit = places
      .filter((pl) => fitsDef(this.w, pl.id, def))
      .sort((a, b) => (b.visitors[b.visitors.length - 1] ?? 0) - (a.visitors[a.visitors.length - 1] ?? 0));
    const pl = fit[0];
    if (!pl) return false;
    return this.raiseDraw(pl);
  }

  /** The decor defs standing in a place (its members that are decor pieces). */
  private pieceDefs(pl: PlaceView): string[] {
    const ids = new Set(pl.members);
    return this.w.decor.filter((d) => ids.has(d.id)).map((d) => d.def);
  }

  /** A piece of the first kind the place lacks, beside it (one visit, one piece). */
  private raiseDraw(pl: PlaceView): boolean {
    const have = this.pieceDefs(pl);
    for (const k of KIND_PIECES) {
      if (have.some(k.has)) continue;
      if (this.recent(`piece:${pl.id}:${k.def}`)) continue;
      if (this.addPiece(k.def, pl, 'to raise its draw')) return true;
    }
    return false;
  }

  private addPiece(def: string, pl: PlaceView, why: string): boolean {
    const w = this.w;
    const d = content.decorById.get(def);
    if (!d) return false;
    const cx = pl.tile % S;
    const cz = Math.floor(pl.tile / S);
    const reader = worldIndex(w).reader;
    let best: Pt | null = null;
    let score = Infinity;
    for (let z = Math.max(1, cz - 3); z <= Math.min(S - 2, cz + 3); z++)
      for (let x = Math.max(1, cx - 3); x <= Math.min(S - 2, cx + 3); x++) {
        const i = idx(x, z);
        if (w.map.road[i] || w.map.zone[i] || w.map.occupant[i] || w.map.water[i]) continue;
        const fx = x * TILE_FP + TILE_FP / 2;
        const fz = z * TILE_FP + TILE_FP / 2;
        if (!canPlaceDecor(reader, d, fx, fz, (x * 31 + z) % 64).ok) continue;
        const dist = Math.abs(x - cx) + Math.abs(z - cz);
        if (dist < score) [best, score] = [[fx, fz], dist];
      }
    if (!best) {
      this.tried.set(`piece:${pl.id}:${def}`, this.p.runDay);
      return false;
    }
    const rot = (Math.floor(best[0] / TILE_FP) * 31 + Math.floor(best[1] / TILE_FP)) % 64;
    return this.act(
      `piece:${pl.id}:${def}`,
      `${def} at ${pl.name} ${why}`,
      [{ t: 'decor.place', def, fx: best[0], fz: best[1], rot }],
      1,
    );
  }

  private specialty(id: string, places: PlaceView[]): boolean {
    const w = this.w;
    const def = content.specialtyById.get(id);
    if (!def) return false;
    const site = places
      .filter((pl) => pl.id.startsWith(`site:${def.pattern}:`))
      .sort((a, b) => b.visitors.reduce((s, x) => s + x, 0) - a.visitors.reduce((s, x) => s + x, 0))[0];
    // No site of the pattern: nothing to do here (the places advisor composes the Corner Cafe).
    if (!site) return false;
    const g = content.goodIndex.get(def.good);
    if (g === undefined) return false;
    // The Treat must be made: a spare business pinned to the trade that makes it.
    const trade = content.trades.find((t) => t.makes === def.good);
    if (trade && !w.buildings.some((b) => b.trade === trade.id && b.stage === 'built')) {
      if (!this.recent(`pin:${trade.id}`)) {
        const counts = new Map<string, number>();
        const of = w.buildings.filter(
          (b) =>
            b.stage === 'built' &&
            b.trade &&
            !b.pinned &&
            content.tradeById.get(b.trade)?.zone === trade.zone,
        );
        for (const b of of) counts.set(b.trade!, (counts.get(b.trade!) ?? 0) + 1);
        const at = of
          .filter((b) => (counts.get(b.trade!) ?? 0) >= 3 && !this.pinned.has(b.id))
          .sort((a, b) => a.id - b.id)[0];
        if (at) {
          this.pinned.add(at.id);
          return this.act(
            `pin:${trade.id}`,
            `pin ${trade.id} at business ${at.id} for ${def.good}`,
            [{ t: 'build.pinRecipe', id: at.id, trade: trade.id }],
            0,
          );
        }
        this.tried.set(`pin:${trade.id}`, this.p.runDay);
      }
    }
    // An outlet in reach: shops zoned by the place when none serves it.
    if (site.serves.length === 0 && !this.recent(`shops:${site.id}`)) {
      const tiles = shopsNear(w, site);
      if (tiles && w.map.zone[tiles[0]![1] * S + tiles[0]![0]] !== Zone.shops)
        return this.act(
          `shops:${site.id}`,
          `zone shops by ${site.name} to sell ${def.good}`,
          [{ t: 'zone.paint', zone: 'shops', tiles }],
          0,
        );
      this.tried.set(`shops:${site.id}`, this.p.runDay);
    }
    return this.raiseDraw(site);
  }
}

export const townBook: AdvisorDef = {
  id: 'townBook',
  lane: 'both',
  // After the Hearth's places and lamps (62, 63), before nature (70).
  slot: 64,
  plays: (opts) => !!opts.village && content.specialties.length > 0,
  create: (p) => new TownBook(p),
};

// The supplies advisor (R3E): the Ledger makes what places burn (docs/spec/19-evenings.md, Supplies,
// and Masters). From Village rank lanterns burn candles and fires burn firewood, and the Hearth keeps
// its best places supplied; this advisor sees that the goods exist:
// - hives where the flowers allow (a spare farmstead pinned to the trade, as the village advisor pins
//   its weaver) and a chandler in reach of the honey (a spare workshop pinned), once lanterns stand
//   and the candles do not cover them;
// - firewood: from autumn, when Fuel stands under the winter mark and the fires want to draw, one more
//   forester's lodge (the land advisor already keeps lodges for timber; this only adds one for the fires);
// - the carrier for places: `carrier.setRule` with `places` for Fuel and Wares, on while the treasury
//   is comfortably above its reserve and a family's pieces rest or would (R3X: also while the town owes,
//   over the cushion with steady income), off when the treasury falls or lean times near; the family's rule and sell stay as they stand, and a
//   family flips at most once a day;
// - a master's business kept fit for level 3: its front tile cobbled to a street when the levels pass
//   wants one there (the crew has no lever of the Ledger's: a short crew is noted, nothing more).
// It places no decor and sets no place priority (the Hearth's), and sends only Ledger commands.
//
// On the stand-ins (R3A and R3B not merged) no piece rests and nobody is a master, so the first two
// and the last wait; the carrier switch reads the stock the same way the rules will once they land.
import { content } from '@qoti/content';
import {
  calendar,
  entranceTiles,
  expenses,
  income,
  habitatAt,
  levelOf,
  loansOwed,
  masterOf,
  rankAtLeast,
  roadKindLocked,
  townStock,
  Road,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { costOf, REPAY_RESERVE, VILLAGE_MARGIN, type Budget, type Planner } from '../planner';
import { G, S } from '../town';
import {
  candleStock,
  candlesMadeDaily,
  CHANDLER_DAILY,
  charterNear,
  crateStock,
  firewoodAllows,
  isLantern,
  LANTERN_FLOOR,
  lanternCover,
} from './lamps';
import type { Advisor, AdvisorDef } from './types';

/** Coins in the treasury above which the carrier may buy for places (the repayment reserve and a margin). */
export const PLACES_ON_COINS = REPAY_RESERVE + 150;
/** Coins under which the carrier stops buying for places. */
export const PLACES_OFF_COINS = REPAY_RESERVE;
/**
 * R3X: while the town owes the County Bank (a Village always does: it borrows to grow), the places switch
 * comes on over the treasury's cushion of 150 coins when the last three days' net income was not
 * negative, and goes off under 120 (where the money advisor borrows) or in lean times. The 500 above
 * is never reached in a Village, and the lamps were lit on 18 to 25 of 70 evenings.
 */
export const OWING_ON_COINS = 150;
export const OWING_OFF_COINS = 120;
/** Days of net income looked back on. */
const NET_DAYS = 3;
/**
 * Residents before the candle chain (hives, then a chandler) is pinned: a young town's farms and
 * workshops feed it (oak stalled when a farm was retooled on day 19; birch lost a third of its
 * Craftsfolk to a hive and a chandler pinned at 60 to 68 residents).
 */
export const CANDLE_POP = 30;
/** Honey in town before a chandler is pinned. */
const HONEY_MIN = 4;
/** Chandlers the town is asked for at most. */
const CHANDLERS_MAX = 3;
/** A spare farmstead is tried for hives this many times at most (the sim retools a pin whose ground fails). */
const HIVE_TRIES = 4;
/** Hives the town is asked for at most. */
const HIVES_MAX = 4;
/** The Fuel and Wares families (GOOD_FAMILIES indexes) and their ids, for `carrier.setRule`. */
const FUEL = 'fuel';
const WARES = 'wares';
const AUTUMN = 2;
const WINTER = 3;
/** Coins a street tile for a master's door may cost (stone too); under this the Ledger waits. */
const STREET_COINS = 30;

class Supplies implements Advisor {
  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  /** Net income (pennies) of the last days, by run day, newest last. */
  private readonly nets: { day: number; net: number }[] = [];
  /** The day (run day) each family's places switch last flipped. */
  private readonly flipped = new Map<string, number>();
  /** Businesses tried for hives, and the chandlers pinned (ids). */
  private readonly hiveTries: number[] = [];
  /** Masters' businesses already noted or cobbled. */
  private readonly noted = new Set<number>();

  visit(): void {
    const w = this.w;
    const village = rankAtLeast(w, content.supplies.fromRank);
    // R3X: as the Charter nears, with lanterns standing, the candle chain is begun (hives, then a
    // chandler): the County's crate lasts a week and a chandler wants honey.
    if (village || charterNear(w)) this.candles();
    if (!village) return;
    this.firewood();
    this.carrierPlaces();
    this.masters();
  }

  private lanterns(): number {
    let n = 0;
    for (const d of this.w.decor) if (isLantern(content.decorById.get(d.def))) n++;
    return n;
  }

  private fires(): number {
    let n = 0;
    for (const d of this.w.decor) {
      const s = content.decorById.get(d.def)?.supply;
      if (s?.kind === 'evening' && s.good === 'firewood') n++;
    }
    return n;
  }

  /** Businesses of a zone that a pin can spare: built, unpinned, of a trade the town has two or more of. */
  private spare(zone: 'farms' | 'crafts', keep: string, least = 3): Building[] {
    const of = this.w.buildings.filter(
      (b) => b.stage === 'built' && b.trade && !b.pinned && content.tradeById.get(b.trade)?.zone === zone,
    );
    const counts = new Map<string, number>();
    for (const b of of) counts.set(b.trade!, (counts.get(b.trade!) ?? 0) + 1);
    // A trade must have `least` (three; two while a place is short of supplies) before one is spared
    // (a pin must not thin a larder or a street's trade).
    return of.filter((b) => b.trade !== keep && counts.get(b.trade!)! >= least).sort((a, b) => a.id - b.id);
  }

  /**
   * Hives where the flowers allow, then a chandler beside the honey, while the lanterns' candles are
   * short (R3X: and as the Charter nears with lanterns standing, since the County's crate lasts a week).
   */
  private candles(): void {
    const w = this.w;
    if (w.residents.length < CANDLE_POP) return;
    const lanterns = this.lanterns();
    if (lanterns === 0) return;
    const per = content.decorById.get('lantern')?.supply?.per ?? 4;
    // A night's candles: the lanterns' and, a night in each candleNights, every household's own (they
    // buy first, at the till, so the chandler must make for both).
    const draw = Math.ceil(lanterns / per);
    const homes = Math.ceil(w.households.length / content.supplies.candleNights);
    // R3X: an open shortOfSupplies gap is the town asking for them: hazel's gaps stood open for forty days
    // with honey in hand, because no trade had three businesses to spare one; two leave one standing.
    const least = w.gaps.open.some((g) => g.kind === 'shortOfSupplies') ? 2 : 3;
    // Before the Charter the lanterns burn for nothing: the chain waits for them to be many enough to matter.
    const village = rankAtLeast(w, content.supplies.fromRank);
    if (village ? draw <= candleStock(w) + crateStock(w) / 7 + candlesMadeDaily(w) : lanterns < LANTERN_FLOOR)
      return;
    const built = (trade: string) =>
      w.buildings.filter((b) => b.trade === trade && (b.stage === 'built' || b.stage === 'construction'))
        .length;
    const chandlers = Math.min(CHANDLERS_MAX, Math.ceil((draw + homes) / CHANDLER_DAILY));
    // R3X: the hives' honey goes to the Treats shelves first and the chandler gets what they do not
    // take, so a chandler wants a hive beyond its own.
    const hivesWanted = Math.min(HIVES_MAX, chandlers + 1);
    // The bees rest in winter: hives are begun from spring to autumn (honey: spring .8, summer 1, autumn .6).
    if (
      calendar(w.tick).season < WINTER &&
      built('hives') < hivesWanted &&
      this.hiveTries.length < HIVE_TRIES
    ) {
      const flowers = content.tradeById.get('hives')?.wants.pollinators ?? 0;
      // A farmstead whose chunk's pollinators already meet the want: the sim would retool a pin that fails it.
      const at = this.spare('farms', 'hives', least).find(
        (b) => habitatAt(w, b.x, b.z, 'pollinator') >= flowers,
      );
      if (at && !this.hiveTries.includes(at.id)) {
        this.hiveTries.push(at.id);
        this.p.do(`pin hives at business ${at.id} for candles`, [
          { t: 'build.pinRecipe', id: at.id, trade: 'hives' },
        ]);
      }
    }
    // The chandler waits until honey is actually in hand (a pinned workshop with no honey makes
    // nothing and costs the town what it made before: oak stalled for ten days on it).
    const honey = (townStock(w)[G('honey')] ?? 0) >= HONEY_MIN;
    if (honey && built('chandler') < chandlers) {
      const at = this.spare('crafts', 'chandler', least)[0];
      if (at)
        this.p.do(`pin a chandler at business ${at.id} for candles`, [
          { t: 'build.pinRecipe', id: at.id, trade: 'chandler' },
        ]);
    }
  }

  /** From autumn, one more forester's lodge when Fuel stands short of the winter mark and fires want it. */
  private firewood(): void {
    const w = this.w;
    if (calendar(w.tick).season < AUTUMN || this.fires() === 0 || firewoodAllows(w)) return;
    const lodges = w.buildings.filter((b) => b.def === 'foresters-lodge');
    if (lodges.length === 0 || lodges.some((b) => b.stage === 'construction')) return;
    if (lodges.length >= 1 + Math.floor(w.residents.length / 60)) return;
    const budget: Budget = { left: 1 };
    this.p.propose({
      def: 'foresters-lodge',
      priority: 3,
      cost: costOf('foresters-lodge', VILLAGE_MARGIN),
      pressing: false,
      essential: false,
      budget,
    });
  }

  /** Whether a family's places draw is worth buying for: its pieces stand and its stock does not cover them. */
  private wanted(family: string): boolean {
    const w = this.w;
    if (family === FUEL) return this.fires() > 0 && !firewoodAllows(w);
    const lanterns = this.lanterns();
    return lanterns > 0 && lanternCover(w) < lanterns;
  }

  /** The carrier's places switch: on while money allows, off while the town owes or runs short. */
  private carrierPlaces(): void {
    const w = this.w;
    const p = this.p;
    const owes = loansOwed(w) > 0;
    // R3X: yesterday's net, once a day; flush means none of the last three days lost coins.
    if (this.nets[this.nets.length - 1]?.day !== p.runDay) {
      const y = w.economy.yesterday;
      this.nets.push({ day: p.runDay, net: income(y) - expenses(y) });
      if (this.nets.length > NET_DAYS) this.nets.shift();
    }
    const steady = this.nets.length >= NET_DAYS && this.nets.every((n) => n.net >= 0);
    for (const family of [FUEL, WARES] as const) {
      const f = w.carrier.families[family === FUEL ? 1 : 3];
      if (!f) continue;
      // At most one flip a day per family.
      if ((this.flipped.get(family) ?? -1) >= p.runDay) continue;
      const on = !!f.places;
      const coins = p.coins();
      const lean = w.economy.leanTimes;
      const goOn =
        !on &&
        !lean &&
        this.wanted(family) &&
        (owes ? coins > OWING_ON_COINS && steady : coins >= PLACES_ON_COINS);
      const goOff = on && (lean || coins < (owes ? OWING_OFF_COINS : PLACES_OFF_COINS));
      if (!goOn && !goOff) continue;
      const places = goOn;
      if (
        p.do(`${family} ${places ? 'bought' : 'no longer bought'} for places`, [
          { t: 'carrier.setRule', family, rule: f.rule, sell: f.sell, places },
        ])
      )
        this.flipped.set(family, p.runDay);
    }
  }

  /** A master's business: crew noted when short, its front cobbled to a street for level 3. */
  private masters(): void {
    const w = this.w;
    const p = this.p;
    for (const b of w.buildings) {
      if (b.stage !== 'built' || !b.trade || this.noted.has(b.id) || masterOf(w, b) === 0) continue;
      const trade = content.tradeById.get(b.trade);
      const def = content.buildingById.get(b.def);
      if (!trade || !def) continue;
      const level = levelOf(b);
      if (level >= 3) continue;
      // Crew: no lever the Ledger owns brings a hand (growth and homes do): a note for the next cycle.
      const crew = trade.crew[level - 1] ?? 0;
      if ((b.rt?.workers.length ?? 0) < crew) {
        this.noted.add(b.id);
        p.actions.push(
          `${calendar(w.tick).day}:master's ${b.trade} ${b.id} short of hands (no Ledger lever)`,
        );
        continue;
      }
      // Street: farms judge their ground, everything else the road at its door.
      if (trade.zone === 'farms' || level < 2) continue;
      const { front } = entranceTiles(def, b.x, b.z, b.rot);
      const i = front[1] * S + front[0];
      if ((w.map.road[i] ?? 0) === 0 || (w.map.road[i] ?? 0) >= Road.street) continue;
      if (roadKindLocked(w, 'street') || p.coins() < STREET_COINS + REPAY_RESERVE / 10) continue;
      this.noted.add(b.id);
      p.do(`cobble the door of master ${b.trade} ${b.id}`, [
        { t: 'road.paint', kind: 'street', tiles: [[front[0], front[1]]] },
      ]);
    }
  }
}

export const supplies: AdvisorDef = {
  id: 'supplies',
  lane: 'ledger',
  slot: 42,
  plays: (opts) => !!opts.village,
  create: (p) => new Supplies(p),
};

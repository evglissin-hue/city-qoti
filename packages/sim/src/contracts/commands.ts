// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves:
// add a new command in its own commit so merges stay trivial. Write each command on one line where
// it fits; the sender test (test/every-command-has-a-sender.test.ts) reads this union.
import type { EntityId, Lens, RoadKind, Rot4, SeatId, Speed, TreeSpecies } from './ids';
import type { ValleySettings } from './settings';
import type { FestivalSite } from './seasons';
import type { PlanItem, RequestAsk } from './village';
import type { CarrierRule, GoodFamily, SeasonPlanInput } from './zones';

export type Command =
  /** Max 256 tiles. */
  | { t: 'road.paint'; kind: RoadKind; tiles: [number, number][] }
  | { t: 'road.remove'; tiles: [number, number][] }
  /** x, z = footprint min corner. */
  | { t: 'build.place'; def: string; x: number; z: number; rot: Rot4 }
  | { t: 'build.remove'; ids: EntityId[] }
  /** Fixed point position (1 tile = 256), rotation 0 to 63. */
  | { t: 'decor.place'; def: string; fx: number; fz: number; rot: number }
  /** Linear decor, fixed point. */
  | { t: 'decor.placeRun'; def: string; from: [number, number]; to: [number, number] }
  | { t: 'decor.remove'; ids: EntityId[] }
  | { t: 'tree.plant'; species: TreeSpecies; x: number; z: number }
  | { t: 'tree.remove'; tiles: [number, number][] }
  /** Max 200 chars. */
  | { t: 'note.pin'; x: number; z: number; text: string }
  | { t: 'note.remove'; id: EntityId }
  | { t: 'time.setSpeed'; speed: Speed }
  | { t: 'seat.setProfile'; name: string; color: number; lens: Lens }
  | { t: 'valley.setSettings'; settings: Partial<ValleySettings> }
  /** sys.* commands come only from the room; the room drops any client-sent sys.*. */
  | { t: 'sys.seatJoined'; seat: SeatId }
  | { t: 'sys.seatLeft'; seat: SeatId }
  // I1 (C3.0)
  /** Paint and details (docs/spec/10-world-and-building.md, Customization phase 1). Marks the building handmade. */
  | { t: 'build.customize'; id: EntityId; custom: BuildingCustom }
  /** Raise a construction site to the front of the queue (or lower it back). */
  | { t: 'build.setPriority'; id: EntityId; priority: boolean }
  | { t: 'build.setPaused'; id: EntityId; paused: boolean }
  /** Paint wheat field tiles for a farmhouse (within its range, fertility 40+). Max 256 tiles. */
  | { t: 'field.paint'; farm: EntityId; tiles: [number, number][] }
  | { t: 'field.remove'; tiles: [number, number][] }
  // I2 (C4.0). docs/spec/20-architecture.md, "I2 contracts".
  /** Paint a zone (content zone id) on tiles. Max 256 tiles. Roads, water and buildings are skipped. */
  | { t: 'zone.paint'; zone: string; tiles: [number, number][] }
  /** Unzone tiles; lots on them go, grown buildings stay. Max 256 tiles. */
  | { t: 'zone.clear'; tiles: [number, number][] }
  /** Wage level, 80 to 120 percent. */
  | { t: 'ledger.setWageLevel'; percent: number }
  /** Income tax, 0 to 20 percent. */
  | { t: 'ledger.setTaxRate'; percent: number }
  /** Price cap in pennies (0 = none) and subsidy in percent (0 to 50) for a food. */
  | { t: 'ledger.setPriceCap'; good: string; cap: number; subsidy: number }
  /** Borrow coins from the County Bank, up to the credit limit. */
  | { t: 'loan.take'; coins: number }
  /** Repay coins on a loan (more than the balance repays it). */
  | { t: 'loan.repay'; id: EntityId; coins: number }
  /** Propose a plan: up to MAX_PLAN_ITEMS commands, drawn as ghosts until approved. */
  | { t: 'plan.add'; name: string; items: PlanItem[] }
  /** Discard a plan (either seat). */
  | { t: 'plan.remove'; id: EntityId }
  /** Approve a plan: its commands run in order where still valid and affordable. */
  | { t: 'plan.approve'; id: EntityId }
  | { t: 'plan.comment'; id: EntityId; text: string }
  /** The sending seat has looked at the plan. */
  | { t: 'plan.seen'; id: EntityId }
  /** I2 (C4D): tweak an open plan: new items (and optionally a new name); the partner sees it afresh. */
  | { t: 'plan.edit'; id: EntityId; items: PlanItem[]; name?: string }
  | { t: 'request.add'; ask: RequestAsk }
  /** Close a request by hand (goods and charm requests also close themselves when met). */
  | { t: 'request.resolve'; id: EntityId; status: 'done' | 'withdrawn' }
  /** Claim the rank once every Charter goal is met. */
  | { t: 'charter.claim' }
  /** Raise or lower land by one level. Max TERRAFORM_MAX_TILES tiles, costs per tile. */
  | { t: 'terrain.raise'; tiles: [number, number][] }
  | { t: 'terrain.lower'; tiles: [number, number][] }
  /** R1: pin a business's trade (content trade id), or null to let it choose again (13-ledger.md, Choosing a trade). */
  | { t: 'build.pinRecipe'; id: EntityId; trade: string | null }
  // I3 (C5.0). docs/spec/20-architecture.md, "I3 contracts". Owners in each handler's header.
  /** Plan this season's festival: site, menu as [good id, qty] (up to 4), twist and music (C5B). */
  | {
      t: 'festival.plan';
      site: FestivalSite | null;
      menu: [good: string, qty: number][];
      twist?: string;
      music?: 'none' | 'resident' | 'bandstand';
    }
  /** Keep a keepable festival piece as permanent decor (C5B). */
  | { t: 'festival.keepPiece'; decor: EntityId }
  | { t: 'commission.accept'; id: EntityId }
  | { t: 'commission.decline'; id: EntityId }
  /** A weekly market day (day of the season 1 to 6), or null for none (C5B). */
  | { t: 'ledger.setMarketDay'; day: number | null }
  /** Quiet hours: workshops rest in the evening, for charm and mood (C5B). */
  | { t: 'ledger.setQuietHours'; on: boolean }
  /** Dig a pond on grass tiles (C5C). Max 64 tiles. */
  | { t: 'terrain.pond'; tiles: [number, number][] }
  /** Fit a module in a slot (content module id), or null to take it off (C5C). */
  | { t: 'build.setModule'; id: EntityId; slot: string; module: string | null }
  /** Paint a run of wall pieces (palisade, stone wall) on tiles (C5D). Max 256 tiles. */
  | { t: 'wall.paint'; def: string; tiles: [number, number][] }
  | { t: 'wall.remove'; tiles: [number, number][] }
  | { t: 'gate.set'; id: EntityId; open: boolean }
  | { t: 'watch.setTarget'; size: number }
  /** Coins a day for the Watch's training and gear. */
  | { t: 'watch.setBudget'; coins: number }
  /** Up to 3 guard tiles. */
  | { t: 'watch.setPosture'; guards: [number, number][] }
  /** Ring the bell: residents go indoors and gates close (C5D). */
  | { t: 'watch.ringBell' }
  | { t: 'watch.lightLanterns' }
  /** A captured raider: offer a home or send them off (C5D). */
  | { t: 'bandit.decide'; id: EntityId; choice: 'home' | 'send' }
  /** Hide or show the first days guide for the sending seat only (C5H). */
  | { t: 'guide.setHidden'; on: boolean }
  // R1 (R1.0). docs/spec/20-architecture.md, "R1 contracts"; docs/spec/13-ledger.md.
  /** The carrier's rule for a family, and whether it sells what is over twice the reserve. */
  | { t: 'carrier.setRule'; family: GoodFamily; rule: CarrierRule; sell: boolean }
  /** The reserve for a family: days of cover (Food, Fuel, Wares, Treats) or units (Materials). */
  | { t: 'carrier.setReserve'; family: GoodFamily; reserve: number }
  /** Most coins a day the carrier may spend on imports. */
  | { t: 'carrier.setBudget'; coins: number }
  /** Answer the season card's questions; answers keep until changed. */
  | { t: 'season.setPlan'; plan: SeasonPlanInput }
  /** Pick up a decor piece and set it down elsewhere, keeping its identity (12-hearth.md, Move). */
  | { t: 'decor.move'; id: EntityId; fx: number; fz: number; rot: number }
  /** Move a hand-placed building: the builders take it down and raise it again for a third of its work. */
  | { t: 'build.move'; id: EntityId; x: number; z: number; rot: Rot4 };

/**
 * Customization fields (all optional; null clears a field back to the kit default). Swatch values
 * are palette token names from packages/art (for example 'rose', 'slate', 'teal').
 */
export interface BuildingCustom {
  wall?: string | null;
  roof?: string | null;
  /** 'tile' | 'slate' | 'thatch' | 'shingle'. */
  roofMaterial?: string | null;
  accent?: string | null;
  windowBoxes?: boolean | null;
  /** Flower color for window boxes: 'geranium' | 'rose' | 'cream' | 'cornflower' | 'buttercup' | 'mixed'. */
  windowFlowers?: string | null;
  shutters?: boolean | null;
  chimney?: boolean | null;
  /** Shop sign text, max 24 chars. */
  sign?: string | null;
}

export type CommandType = Command['t'];

/** seq: per-seat counter, echoed in command.rejected. */
export interface SeatedCommand {
  seat: SeatId;
  seq: number;
  cmd: Command;
}

export interface Turn {
  t: number;
  cmds: SeatedCommand[];
}

export type RejectReason =
  | 'OUT_OF_BOUNDS'
  | 'LOCKED_PARCEL'
  | 'WATER'
  | 'OCCUPIED'
  | 'TOO_STEEP'
  | 'NEEDS_DEPOSIT'
  | 'NEEDS_WATER_EDGE'
  | 'NEEDS_FERTILITY'
  | 'CANNOT_AFFORD'
  | 'NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'TOGETHER_ONLY'
  | 'TOO_MANY'
  | 'INVALID'
  // I1 (C3.0)
  /** Lean times: no new construction while the treasury is below zero. */
  | 'LEAN_TIMES'
  /** The piece is not unlocked yet (Pattern Book). */
  | 'LOCKED'
  /** Field tile too far from its farmhouse. */
  | 'OUT_OF_RANGE'
  /** Undo target changed since the command it inverts. */
  | 'CHANGED'
  // I2 (C4.0)
  /** Over the County Bank's credit limit. */
  | 'CREDIT_LIMIT'
  /** The Charter's goals are not all met yet. */
  | 'NOT_READY'
  // I3 (C5.0)
  /** A wall run would close residents' homes off from the roads (C5D). */
  | 'WOULD_ENCLOSE'
  /** The river is frozen (the dock, a pond on ice). */
  | 'FROZEN'
  /** There is no raid on (the bell's raid-only uses, bandit.decide). */
  | 'NO_RAID'
  // Playtest round three
  /** Nobody from the town can walk to the door: cut off by a cliff or water. */
  | 'CUT_OFF'
  // P1 (playtest)
  /** A standard valley's town hall stays: its builders raise everything else. */
  | 'HALL_STAYS'
  /** Too late for this: a festival cannot be planned once its evening has begun. */
  | 'TOO_LATE'
  // R1 (R1.0): the site rules of specialized buildings (10-world-and-building.md, From the redesign).
  /** Forester's Lodge: too few mature trees within reach. */
  | 'NEEDS_WOODS'
  /** Sawmill and River Dock: the door must be on the river's edge. */
  | 'NEEDS_RIVER'
  /** Windmill: another building stands too close. */
  | 'NEEDS_OPEN_GROUND'
  /** Granary, Storehouse, Market Stall, Market Square, Cart Shed: no road (of the right kind) at the door. */
  | 'NEEDS_ROAD'
  /** Trading Post: too far from the valley road. */
  | 'NEEDS_VALLEY_ROAD';

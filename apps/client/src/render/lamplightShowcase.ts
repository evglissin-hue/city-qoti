// Debug only (R3F): the lamplight scene, in this client's Mirror only (the sim never sees any of it),
// for the look of the lamplighter's round, candle-lit homes and the resting pieces while R3A's walk
// and settling are stand-ins. On V3B's streets showcase (`streetsShowcase.ts`), it adds:
// - the stepped row's street as a lit street: a row of homes facing the stepped row across it, a
//   verge of lanterns (a lamp post in the middle, hanging lanterns at the ends) and the lamplighter;
// - east of the block, every supplied piece beside its resting self (`19-evenings.md`, Supplies).
// It writes `supplies.updated` itself, so the lights and decor layers draw what they would from R3A.
// Reached through the lights layer (`showcase`), as the festival effects' fireworks are.
import { content, type RestKind } from '@qoti/content';
import {
  AGENT_STRIDE,
  AgentAnim,
  AgentFlags,
  MAP_SIZE,
  TILE_FP,
  TICKS_PER_DAY,
  type BuildingView,
  type EntityId,
  type SimEvent,
  type SuppliesView,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { dayOf, nightOf, tickAt } from './layers/lights';
import { streetsShowcase } from './streetsShowcase';

const FIRST_DECOR = 990_000;
const FIRST_HOME = 991_000;
/** The lamplighter's agent row id (no resident: the agents layer dresses him from the id). */
export const LAMPLIGHTER_ID = 992_001;

/**
 * Every supplied piece and its rest, a row of the lineup by kind (lamps, fires and tables, cloth,
 * water); each piece stands supplied on the left and resting on its right (+x), so a camera at yaw
 * 0 sees each pair side by side.
 */
export const LINEUP: readonly (readonly [def: string, rest: RestKind])[][] = [
  [
    ['lantern', 'unlit'],
    ['hanging-lantern', 'unlit'],
    ['lamp-post', 'unlit'],
  ],
  [
    ['bonfire', 'cold'],
    ['brazier', 'cold'],
    ['cafe-table', 'bare'],
    ['festival-table', 'bare'],
  ],
  [
    ['bunting', 'faded'],
    ['flower-arch', 'faded'],
    ['maypole', 'faded'],
    ['festival-stage', 'faded'],
  ],
  [
    ['fountain', 'dry'],
    ['birdbath', 'dry'],
  ],
];
/** Tiles between pairs along a row, between a piece and its resting self, and between rows. */
const PAIR_STEP = 3.6;
const PAIR_GAP = 1.6;
const ROW_STEP = 3;

export interface LamplightPose {
  /** The hour the light is pinned to (the caller pins it with `__qoti.setHour`). */
  hour: number;
  /** Street lamps lit so far, in round order (all of them by default). */
  lit?: number;
  /**
   * Homes with a candle tonight: a share of the street's homes spread along it (0 to 1; 0.5 by
   * default), or one row whole (`south`, the row behind the lamps; `north`, the stepped row).
   */
  candles?: number | 'south' | 'north';
  /** Street lamps with a candle tonight, the first so many in round order (all by default); the rest rest unlit. */
  supplied?: number;
  /** Show the lamplighter (by default while lamps are left to light). */
  lamplighter?: boolean;
  /** Rest the lineup's right column (true by default). */
  rest?: boolean;
}

export interface LamplightShowcase {
  /** The street's middle (tiles), its lamps' ids in round order, the lineup's middle. */
  street: [number, number];
  lamps: EntityId[];
  homes: EntityId[];
  lineup: [number, number];
  /** Each lineup row's middle (lamps, fires and tables, cloth, water). */
  rows: [number, number][];
  /** Holds the scene at an hour: the first `lit` lamps lit, the lamplighter at the next. */
  pose(p: LamplightPose): void;
  /** Lets the round play from the Mirror's clock: tonight's walk from 17:30 (sim running). */
  live(candles?: number): void;
  stop(): void;
}

/** Ticks between two lamps on the round: three tiles' walk and the `lightTicks` he stands at each. */
const GAP = content.supplies.lightTicks + 6;

export function lamplightShowcase(mirror: Mirror, cx = 96, cz = 90): LamplightShowcase {
  streetsShowcase(mirror, cx, cz);
  const bz = cz - 5;
  const roadZ = bz + 18;
  const N = MAP_SIZE;
  const height = mirror.layers.height as Uint8Array;
  const occupant = mirror.layers.occupant as Int32Array;
  const events: SimEvent[] = [];
  let did = FIRST_DECOR;
  const decor = (def: string, x: number, z: number, rot = 0): EntityId => {
    const id = did++;
    events.push({
      e: 'decor.added',
      d: { id, def, fx: Math.round(x * TILE_FP), fz: Math.round(z * TILE_FP), rot, builtBy: 0 },
    });
    return id;
  };

  // A row of homes facing the stepped row across the street, behind a verge of lamps.
  const homes: EntityId[] = [];
  const southRow: EntityId[] = [];
  const northRow: EntityId[] = [];
  let hid = FIRST_HOME;
  for (let i = 0; i < 22; i++) {
    const def = i % 3 === 1 ? 'house' : 'cottage';
    const x = cx - 22 + i * 2;
    const z = roadZ + 2;
    const b: BuildingView = {
      id: hid++,
      def,
      x,
      z,
      rot: 2,
      builtBy: 0,
      handmade: false,
      stage: 'built',
      foundation: false,
      style: i < 11 ? 'brick' : 'plaster',
    };
    const d = content.buildingById.get(def);
    const [w, dd] = d?.size ?? [2, 2];
    for (let lz = 0; lz < dd; lz++) for (let lx = 0; lx < w; lx++) occupant[(z + lz) * N + x + lx] = b.id;
    events.push({ e: 'building.added', b });
    homes.push(b.id);
    southRow.push(b.id);
  }
  // The stepped row's homes face the street too: they take candles alike.
  for (const b of mirror.buildings.values())
    if (b.z === bz + 15 && b.x >= cx - 24 && b.x <= cx + 22) {
      homes.push(b.id);
      northRow.push(b.id);
    }

  // The verge: a lantern every three tiles, a lamp post in the middle, hanging lanterns at the ends.
  const lamps: EntityId[] = [];
  const vergeZ = roadZ + 1.45;
  for (let i = 0; i < 15; i++) {
    const x = cx - 21 + i * 3;
    const def = i === 7 ? 'lamp-post' : i === 0 || i === 14 ? 'hanging-lantern' : 'lantern';
    lamps.push(decor(def, x, vergeZ, def === 'hanging-lantern' ? 48 : 0));
  }

  // The lineup: each piece supplied (left) beside its resting self (right), a row by kind.
  const lx = cx + 11;
  const lz = bz - 7;
  const resting: { id: EntityId; kind: RestKind }[] = [];
  /** The lineup's supplied lamps: lit from `litHour`, as a lamp with no walk comes on. */
  const shown: EntityId[] = [];
  /** Each lineup row's middle, for shots. */
  const rows: [number, number][] = [];
  LINEUP.forEach((pieces, row) => {
    const z = lz + row * ROW_STEP;
    pieces.forEach(([def, rest], col) => {
      const x = lx + col * PAIR_STEP;
      const id = decor(def, x, z);
      if (rest === 'unlit') shown.push(id);
      resting.push({ id: decor(def, x + PAIR_GAP, z), kind: rest });
      // A lamp post behind each pair but the lamps', so both are seen by lamplight.
      if (row > 0) shown.push(decor('lamp-post', x + PAIR_GAP / 2, z - 1.15));
    });
    rows.push([lx + ((pieces.length - 1) * PAIR_STEP + PAIR_GAP) / 2, z]);
  });
  mirror.apply({ t: mirror.lastTurn.value, events, patches: [] });

  // --- The supplies view and the lamplighter ---------------------------------------------------
  let restOn = true;
  let candleShare: number | 'south' | 'north' = 0.5;
  let supplied = Number.POSITIVE_INFINITY;
  /** Tonight's round: the night and the tick the first lamp lights. */
  let round = { night: 0, start: 0 };
  let posed: { lit: number; man: boolean } | null = null;

  const reachOf = (i: number): number => round.start + i * GAP;

  function publish(): void {
    const S = content.supplies;
    const candles = (
      candleShare === 'south'
        ? southRow
        : candleShare === 'north'
          ? northRow
          : homes.filter((_, i) => (i * 0.618) % 1 < (candleShare as number))
    ).sort((a, b) => a - b);
    const lit = posed ? posed.lit : lamps.length;
    const kept = lamps.slice(0, Math.min(lamps.length, supplied));
    const dark = lamps.slice(kept.length).map((id) => ({ id, kind: 'unlit' as const }));
    const view: SuppliesView = {
      night: round.night,
      lamps: [
        ...kept.map((id, i) => ({
          id,
          // Posed: the first `lit` reached already, the rest not before tomorrow's dawn.
          reach: posed ? (i < lit ? round.start : tickAt(round.night + 1, S.outHour) - 1) : reachOf(i),
          out: tickAt(round.night + 1, S.outHour),
        })),
        ...shown.map((id) => ({
          id,
          reach: Math.max(round.start, tickAt(round.night, S.litHour)),
          out: tickAt(round.night + 1, S.outHour),
        })),
      ].sort((a, b) => a.id - b.id),
      resting: [...(restOn ? resting : []), ...dark].sort((a, b) => a.id - b.id),
      candles,
      candleUntil: tickAt(round.night, S.candleUntilHour),
      lamplighters: { jobs: 1, held: [LAMPLIGHTER_ID] },
    };
    mirror.apply({ t: mirror.lastTurn.value, events: [{ e: 'supplies.updated', s: view }], patches: [] });
  }

  /** The lamplighter's row at a tick of tonight's round (null when he is not out). */
  function row(tick: number): Float32Array | null {
    let x: number;
    let anim: number = AgentAnim.walk;
    let heading = Math.PI / 2;
    let z = roadZ + 0.55;
    if (posed) {
      if (!posed.man) return null;
      // At the next lamp, lighting it (or past the last one, walking on).
      const i = Math.min(posed.lit, lamps.length - 1);
      x = cx - 21 + i * 3 - 0.18;
      z = roadZ + 1.02;
      anim = posed.lit < lamps.length ? AgentAnim.lightLamp : AgentAnim.walk;
      heading = posed.lit < lamps.length ? 0 : Math.PI / 2;
    } else {
      const s = tick - (nightOf(tick) - round.night) * TICKS_PER_DAY - round.start;
      const light = content.supplies.lightTicks;
      if (s < -GAP * 2 || s > lamps.length * GAP + GAP * 2) return null;
      const k = Math.floor(s / GAP);
      const into = s - k * GAP;
      const from = cx - 21 + (k - 1) * 3;
      if (into >= GAP - light && k + 1 >= 0 && k + 1 < lamps.length) {
        x = from + 3 - 0.18;
        z = roadZ + 1.02;
        anim = AgentAnim.lightLamp;
        heading = 0;
      } else {
        x = from + Math.min(1, into / Math.max(1, GAP - light)) * 3 - 0.18;
      }
    }
    const level = height[Math.floor(z) * N + Math.floor(x)] ?? 0;
    const r = new Float32Array(AGENT_STRIDE);
    r.set([LAMPLIGHTER_ID, x, z, level, heading, anim, 0, AgentFlags.lamplighter]);
    return r;
  }

  const apply = mirror.applyAgents.bind(mirror);
  const merge = (data: Float32Array): Float32Array => {
    const extra = row(mirror.tick.value);
    if (!extra) return data;
    const out = new Float32Array(data.length + extra.length);
    out.set(data);
    out.set(extra, data.length);
    return out;
  };
  mirror.applyAgents = (t, data, now) => apply(t, merge(data), now);
  /** Puts the lamplighter where he is now, with the sim held (no turns bring frames then). */
  const refresh = (): void => {
    const base = mirror.agents.latest.filter(
      (_, i) => mirror.agents.latest[i - (i % AGENT_STRIDE)] !== LAMPLIGHTER_ID,
    );
    apply(mirror.agents.t, merge(new Float32Array(base)), performance.now());
    apply(mirror.agents.t, merge(new Float32Array(base)), performance.now());
  };

  const tonight = (hour: number): number => tickAt(dayOf(mirror.tick.value), hour);

  return {
    street: [cx, roadZ + 0.5],
    lamps,
    homes,
    lineup: [lx + (3 * PAIR_STEP + PAIR_GAP) / 2, lz + ((LINEUP.length - 1) * ROW_STEP) / 2],
    rows,
    pose(p) {
      const t = tonight(p.hour);
      round = { night: nightOf(t), start: t - 1 };
      restOn = p.rest ?? true;
      candleShare = p.candles ?? 0.5;
      supplied = p.supplied ?? Number.POSITIVE_INFINITY;
      const lit = Math.max(0, Math.min(lamps.length, p.lit ?? lamps.length));
      posed = { lit, man: p.lamplighter ?? lit < lamps.length };
      publish();
      refresh();
    },
    live(candles = 0.5) {
      const S = content.supplies;
      const now = mirror.tick.value;
      // Tonight's round if it is still to come, else tomorrow's.
      let night = nightOf(now);
      if (now > tickAt(night, S.settleHour + S.settleMinute / 60) + lamps.length * GAP) night++;
      round = { night, start: tickAt(night, S.settleHour + S.settleMinute / 60) + GAP };
      candleShare = candles;
      supplied = Number.POSITIVE_INFINITY;
      posed = null;
      publish();
    },
    stop() {
      mirror.applyAgents = apply;
    },
  };
}

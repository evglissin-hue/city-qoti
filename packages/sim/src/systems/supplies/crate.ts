// The County's crate (R3X; docs/spec/19-evenings.md, Supplies): the day a town is made a Village its
// lanterns begin to burn candles, so the County sends a week of them with the rank, sized to the
// lanterns standing at the claim (`crateSize`) and set down in the Town Hall's own store. The code says
// why there and not in a storehouse or `supplies.carried`: a crate in a storehouse is restocked onto the
// shelves the next morning and bought by the households (hazel's 15 candles were 4 by the next
// evening), and `carried` lasts one day and only lifts the floor for goods that are still in stock. The
// Hall's store is no outlet, no storehouse and no source for the carrier or the porters (townStock leaves
// it out, `keepsNoGoods`), so the crate stays until the settling takes it: each night the lanterns' candles
// come from it first (settle.ts), and the carrier does not buy what the crate already covers (want.ts).
// No state of its own: the Hall's runtime already has a store.
import { content, lifePhrases } from '@qoti/content';
import type { Building, TickCtx, WorldState } from '../../contracts';
import { fillText } from '../../view/hamlet';
import { Kind, suppliedIndex } from './pieces';

const TOWN_HALL = 'town-hall';
const CANDLES = (): number => content.goodIndex.get('candles')!;

/** Lanterns standing now (the pieces that burn a candle a night). */
export function lanternsStanding(state: WorldState): number {
  const ix = suppliedIndex(state);
  let n = 0;
  for (let i = 0; i < ix.list.length; i++) if (ix.kind[i] === Kind.nightly) n++;
  return n;
}

/** Candles one night of `n` lanterns takes: `qty` for every `per`, rounded up. */
export function nightDraw(n: number): number {
  const s = content.decorById.get('lantern')?.supply;
  return Math.ceil(n / (s?.per ?? 1)) * (s?.qty ?? 1);
}

/** The crate's size for `n` lanterns: a night's draw for each of `charterCrateNights` nights (0 for no lanterns or no crate). */
export function crateSize(n: number): number {
  const nights = content.supplies.charterCrateNights ?? 0;
  return n > 0 && nights > 0 ? nightDraw(n) * nights : 0;
}

/** The Town Hall, when it stands built. */
export function townHallOf(state: WorldState): Building | undefined {
  for (const b of state.buildings) if (b.def === TOWN_HALL && b.stage === 'built' && b.rt) return b;
  return undefined;
}

/** Candles the County's crate still holds at the Town Hall. */
export function crateHeld(state: WorldState): number {
  return townHallOf(state)?.rt!.store[CANDLES()] ?? 0;
}

/** Takes up to `qty` candles from the crate (for the settling); returns what came out. */
export function takeFromCrate(state: WorldState, qty: number): number {
  const hall = townHallOf(state);
  if (!hall || qty <= 0) return 0;
  const good = CANDLES();
  const n = Math.min(qty, hall.rt!.store[good] ?? 0);
  if (n > 0) hall.rt!.store[good]! -= n;
  return n;
}

/**
 * The claim of the Village Charter: the County's crate and its letter. Run after the rank is granted;
 * does nothing for any other rank or a town whose Town Hall is not standing.
 */
export function sendCharterCrate(state: WorldState, ctx: TickCtx, rank: string): void {
  if (rank !== content.supplies.fromRank || content.supplies.charterCrateNights === undefined) return;
  const hall = townHallOf(state);
  if (!hall) return;
  const lanterns = lanternsStanding(state);
  const came = crateSize(lanterns);
  if (came > 0) hall.rt!.store[CANDLES()]! += came;
  const words = came > 0 ? lifePhrases.charterCrate.letter : lifePhrases.charterCrate.none;
  ctx.events.push({
    e: 'notify',
    kind: 'letter',
    text: fillText(words[0]!, [
      ['candles', String(came)],
      ['lanterns', String(lanterns)],
      ['nights', String(content.supplies.charterCrateNights)],
      ['town', state.settings.townName],
    ]),
  });
}

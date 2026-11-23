// R3D: the ground holds one highlight at a time, but two things want it at once: the inspector's own
// picture (a place's inked outline, a resident's round) and the Thread's route. Two layers keep
// them from clobbering one another: the thread layer wins while it is set, and the inspector's
// picture comes back when it clears.
import { MAP_SIZE } from '@qoti/sim';
import type { Session } from '../app/session';

export type GroundLayer = 'inspector' | 'thread';
export type GroundArea = NonNullable<Parameters<NonNullable<NonNullable<Session['render']>['highlight']>>[0]>;

const ORDER: GroundLayer[] = ['thread', 'inspector'];
const layers = new WeakMap<object, Map<GroundLayer, GroundArea>>();

/** Sets (or, with null, clears) a layer, then draws the top layer that is set, or clears the ground. */
export function setGroundLayer(session: Session, layer: GroundLayer, area: GroundArea | null): void {
  let held = layers.get(session);
  if (!held) layers.set(session, (held = new Map()));
  if (area) held.set(layer, area);
  else held.delete(layer);
  const top = ORDER.find((l) => held.has(l));
  session.render?.highlight?.(top ? held.get(top)! : null);
}

/** Tiles as [x, z] pairs for the highlight API. */
export function tilePairs(tiles: readonly number[]): [number, number][] {
  return tiles.map((t) => [t % MAP_SIZE, Math.floor(t / MAP_SIZE)] as [number, number]);
}

/** Which layer the ground shows now, or null (for e2e). */
export function topGroundLayer(session: Session): GroundLayer | null {
  const held = layers.get(session);
  return held ? (ORDER.find((l) => held.has(l)) ?? null) : null;
}

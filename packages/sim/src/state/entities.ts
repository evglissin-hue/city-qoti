import type { EntityId } from '../contracts';

// Entity arrays are sorted by id and ids only grow, so appends keep them sorted and lookups
// are binary searches.

export function findIndexById<T extends { id: EntityId }>(list: readonly T[], id: EntityId): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!.id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function findById<T extends { id: EntityId }>(list: readonly T[], id: EntityId): T | undefined {
  const i = findIndexById(list, id);
  return i < 0 ? undefined : list[i];
}

export function removeById<T extends { id: EntityId }>(list: T[], id: EntityId): T | undefined {
  const i = findIndexById(list, id);
  if (i < 0) return undefined;
  return list.splice(i, 1)[0];
}

// What the mocked place index and street runs return (the vi.mock factories import only this file, so
// they cannot loop back through the gaps system).
import type { Place } from '../../src/contracts';

export const injected = {
  places: [] as Place[],
  byId: new Map<string, Place>(),
  streets: new Map<number, number[]>(),
};

export function setPlaces(list: Place[]): void {
  injected.places = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
  injected.byId = new Map(injected.places.map((p) => [p.id, p]));
}

export function resetInjected(): void {
  setPlaces([]);
  injected.streets = new Map();
}

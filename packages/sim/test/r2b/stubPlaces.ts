// R2B test helper: places stubbed by hand until R2A's place pass lands (docs/build/r2-wave-notes.md,
// "a fixture with R2A's places stubbed by hand"). R2B's code reads places only through the
// cross-track API (`systems/places/api.ts`), so a test mocks that module and nothing of R2A's
// internals, and keeps working once R2A's real index replaces the stand-in:
//
//   /* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- a mock factory */
//   vi.mock('../../src/systems/places/api', async (orig) => {
//     const { stubPlacesApi } = await import('./stubPlaces'); // vi.mock is hoisted: import inside
//     return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
//   });
//   /* eslint-enable no-restricted-syntax, @typescript-eslint/consistent-type-imports */
//   ...
//   setStubPlaces([place({ id: 'seats:5', tile: 30 * S + 40, outlets: [stall.id] })]);
//
// `placeServes` and `placeDraw` keep R2A's real bodies (they read `outlets` and the shelves live
// through R2B's `treatsOnShelf`); `placesNear` and `placeById` read the stubbed list.
import { MAP_SIZE } from '../../src/constants';
import type { Place, PlaceId, WorldState } from '../../src/contracts';
import type * as PlacesApi from '../../src/systems/places/api';

let stubbed: Place[] = [];

/** Replaces the stubbed places (kept sorted by id, as the index keeps them). */
export function setStubPlaces(places: readonly Place[]): void {
  stubbed = [...places].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The stubbed places now. */
export function stubPlaces(): readonly Place[] {
  return stubbed;
}

/** A place with sensible defaults: a sitting spot of two seats, draw 50, no outlets. */
export function place(p: Partial<Place> & { id: PlaceId; tile: number }): Place {
  return {
    source: 'seats',
    def: 'bench',
    tiles: [p.tile],
    members: [],
    seats: 2,
    childSeats: 0,
    standing: 2,
    kinds: ['sit'],
    sheltered: false,
    warm: false,
    outlets: [],
    draw: 50,
    parts: { charm: 40, site: 0, pieces: 2, water: 0, lit: 0, treats: 0, winter: 0 },
    ...p,
  };
}

/** The mock factory for `systems/places/api`: real bodies, stubbed lookups. */
export function stubPlacesApi(real: typeof PlacesApi): typeof PlacesApi {
  const S = MAP_SIZE;
  return {
    ...real,
    placesNear(_state: WorldState, tile: number, radius: number): Place[] {
      const x = tile % S;
      const z = (tile - x) / S;
      return stubbed.filter((p) => {
        const px = p.tile % S;
        const pz = (p.tile - px) / S;
        return Math.abs(px - x) + Math.abs(pz - z) <= radius;
      });
    },
    placeById(_state: WorldState, id: PlaceId): Place | undefined {
      return stubbed.find((p) => p.id === id);
    },
  };
}

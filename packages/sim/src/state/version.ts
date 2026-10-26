import { MAP_SIZE } from '../constants';
import { bytesToBase64 } from './base64';
import { emptyHamletSlices } from './hamlet';

/** Bump whenever the shape of saved state changes, and add a migration with a test. */
export const SAVE_VERSION = 2;

export type SaveObject = Record<string, unknown> & { saveVersion: number };
export type Migration = (save: SaveObject) => SaveObject;

// Migration registry: migrations.get(n) upgrades a save from version n to n + 1.
// One line per migration, in version order.
// prettier-ignore
export const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [1, toV2],
]);

/**
 * v1 (I0) to v2 (I1 contracts): empty hamlet slices, zeroed charm, field and crop layers. I0
 * valleys stay sandbox valleys, so their buildings get no runtime.
 */
function toV2(save: SaveObject): SaveObject {
  const n = MAP_SIZE * MAP_SIZE;
  const zeros8 = bytesToBase64(new Uint8Array(n));
  const zeros32 = bytesToBase64(new Uint8Array(n * 4));
  const map = { ...(save.map as Record<string, string>) };
  for (const name of [
    'charm',
    'charmNature',
    'charmComfort',
    'charmLight',
    'charmView',
    'charmNoise',
    'crop',
  ]) {
    map[name] = zeros8;
  }
  map.fieldOwner = zeros32;
  return { ...save, ...emptyHamletSlices(), map, saveVersion: 2 };
}

/** Brings a parsed save up to SAVE_VERSION, one migration at a time. */
export function migrateSave(
  save: SaveObject,
  registry: ReadonlyMap<number, Migration> = migrations,
): SaveObject {
  if (typeof save.saveVersion !== 'number' || !Number.isInteger(save.saveVersion)) {
    throw new Error('Not a City Qoti save: missing saveVersion');
  }
  if (save.saveVersion > SAVE_VERSION) {
    throw new Error(`Save version ${save.saveVersion} is newer than this game (${SAVE_VERSION})`);
  }
  let current = save;
  while (current.saveVersion < SAVE_VERSION) {
    const step = registry.get(current.saveVersion);
    if (!step) throw new Error(`No migration from save version ${current.saveVersion}`);
    const next = step(current);
    if (next.saveVersion !== current.saveVersion + 1) {
      throw new Error(
        `Migration from ${current.saveVersion} must produce version ${current.saveVersion + 1}`,
      );
    }
    current = next;
  }
  return current;
}

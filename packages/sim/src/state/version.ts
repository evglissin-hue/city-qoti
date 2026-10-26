/** Bump whenever the shape of saved state changes, and add a migration with a test. */
export const SAVE_VERSION = 1;

export type SaveObject = Record<string, unknown> & { saveVersion: number };
export type Migration = (save: SaveObject) => SaveObject;

// Migration registry: migrations.get(n) upgrades a save from version n to n + 1.
// One line per migration, in version order.
// prettier-ignore
export const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
]);

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

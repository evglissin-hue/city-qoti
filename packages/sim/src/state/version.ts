// Save versions (docs/spec/21-networking-and-saves.md, Version changes and The fresh start).

/**
 * Bump whenever the shape of saved state changes, and add a migration with a test. Version 6 is R1's
 * fresh start: the zones-first Ledger changed what a town is made of, so a valley saved before it is
 * refused (OLD_VALLEY), not converted, and migrations begin again from 6.
 */
export const SAVE_VERSION = 6;

/** The oldest save this game opens: R1's fresh start. */
export const OLDEST_SAVE_VERSION = 6;

export type SaveObject = Record<string, unknown> & { saveVersion: number };
export type Migration = (save: SaveObject) => SaveObject;

/**
 * Migration registry: migrations.get(n) upgrades a save from version n to n + 1, for n >= 6.
 * One line per migration, in version order. Empty until R2.0 adds the first.
 */
// prettier-ignore
export const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
]);

/**
 * Thrown for a save from before R1 (version under 6): a valley founded under the old rules, which
 * this version cannot open. The room and the title screen answer it with OLD_VALLEY.
 */
export class OldValleyError extends Error {
  readonly code = 'OLD_VALLEY' as const;
  constructor(readonly saveVersion: number) {
    super(
      `Founded under the old rules (save version ${saveVersion}); this version opens version ${OLDEST_SAVE_VERSION} and later.`,
    );
    this.name = 'OldValleyError';
  }
}

/** True when an error is the refusal of an old valley. */
export function isOldValley(err: unknown): err is OldValleyError {
  return err instanceof OldValleyError || (err as { code?: unknown } | null)?.code === 'OLD_VALLEY';
}

/** Runs the registry's migrations from the save's version up to SAVE_VERSION. */
export function migrateSave(
  save: SaveObject,
  registry: ReadonlyMap<number, Migration> = migrations,
): SaveObject {
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

/**
 * Checks a parsed save's version and brings it up to date: a save under OLDEST_SAVE_VERSION is an
 * old valley (OldValleyError), one newer than this game is refused, the rest migrate.
 */
export function checkSaveVersion(save: SaveObject): SaveObject {
  if (typeof save.saveVersion !== 'number' || !Number.isInteger(save.saveVersion)) {
    throw new Error('Not a City Qoti save: missing saveVersion');
  }
  if (save.saveVersion < OLDEST_SAVE_VERSION) throw new OldValleyError(save.saveVersion);
  if (save.saveVersion > SAVE_VERSION) {
    throw new Error(`Save version ${save.saveVersion} is newer than this game (${SAVE_VERSION})`);
  }
  return migrateSave(save);
}

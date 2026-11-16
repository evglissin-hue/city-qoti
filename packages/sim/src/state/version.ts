// Save versions (docs/spec/21-networking-and-saves.md, Version changes and The fresh start).
import { migrate7to8 } from './migrate8';

/**
 * Bump whenever the shape of saved state changes, and add a migration with a test. Version 6 is R1's
 * fresh start: the zones-first Ledger changed what a town is made of, so a valley saved before it is
 * refused (OLD_VALLEY), not converted, and migrations begin again from 6. Version 7 (P2, the R1
 * playtest) adds the day's count of grown sites started, for the growth pass's second run at 13:00.
 * Version 8 is R2.0's: the evening round (footfall, places, gaps, street names, the evening's tally,
 * the evenings need, the lot fields and storeys, the `round` RNG stream).
 */
export const SAVE_VERSION = 8;

/** The oldest save this game opens: R1's fresh start. */
export const OLDEST_SAVE_VERSION = 6;

export type SaveObject = Record<string, unknown> & { saveVersion: number };
export type Migration = (save: SaveObject) => SaveObject;

/** 6 to 7 (P2): the demand slice counts the grown sites started today; none yet. */
function addGrowthStarts(save: SaveObject): SaveObject {
  const demand = (save.demand ?? {}) as Record<string, unknown>;
  return { ...save, saveVersion: 7, demand: { ...demand, starts: { day: -1, n: 0 } } };
}

/**
 * Migration registry: migrations.get(n) upgrades a save from version n to n + 1, for n >= 6.
 * One line per migration, in version order.
 */
// prettier-ignore
export const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [6, addGrowthStarts],
  [7, migrate7to8],
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

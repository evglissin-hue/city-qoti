// .qoti valley files (docs/spec/21-networking-and-saves.md, Export and import): a valley file is
// a serialized snapshot (gzip JSON with its saveVersion), so any later game can open it through
// the save migrations. Importing re-serializes it with this game's sim, so the room sees a snapshot
// of its own simVersion, with nobody connected yet.
import type { ImportedSnapshot } from '@qoti/protocol';
import { bytesToBase64, deserialize, serialize, SIM_VERSION, type ValleySettings } from '@qoti/sim';

export const VALLEY_FILE_EXT = '.qoti';

export interface ValleyFile {
  snapshot: ImportedSnapshot;
  seed: string;
  settings: ValleySettings;
  /** For the confirmation line: "Qoti in Riverbend, 12 residents". */
  summary: { townName: string; valleyName: string; residents: number; buildings: number; turn: number };
}

/** Reads a .qoti file's bytes. Throws a readable error when it is not a valley file. */
export function readValleyFile(bytes: Uint8Array): ValleyFile {
  let state;
  try {
    state = deserialize(bytes);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Error(/newer than this game/.test(why) ? why : 'That file is not a City Qoti valley.', {
      cause: err,
    });
  }
  state.time.connected = [];
  const data = bytesToBase64(serialize(state));
  return {
    snapshot: { t: state.lastTurn, simVersion: SIM_VERSION, data },
    seed: state.seed,
    settings: { ...state.settings },
    summary: {
      townName: state.settings.townName,
      valleyName: state.settings.valleyName,
      residents: state.residents.length,
      buildings: state.buildings.length,
      turn: state.lastTurn,
    },
  };
}

/** "qoti-riverbend-year-1-spring.qoti". */
export function valleyFileName(settings: ValleySettings, year: number, season: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${slug(settings.townName)}-${slug(settings.valleyName)}-year-${year}-${slug(season)}${VALLEY_FILE_EXT}`;
}

/** Offers bytes to the browser as a download. */
export function downloadBytes(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

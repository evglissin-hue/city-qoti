// V2.0: where this client keeps a valley's Measure this laptop runs (packages/protocol/src/perf.ts).
// Online, the relay's perf route with the seat token in an Authorization header (as the Chronicle
// pictures go, net/images.ts); solo, this device's local storage, trimmed the same way.
import { trimPerfRuns, type PerfRun, type PerfRunInput } from '@qoti/protocol';

export interface PerfTarget {
  valleyId: string;
  seat: number;
  token: string;
  mode: 'online' | 'solo';
}

export interface PerfStore {
  /** Keeps a run; false when it could not be kept (no route yet, offline, refused). */
  put(input: PerfRunInput): Promise<boolean>;
  /** Every seat's kept runs, oldest first; null when they could not be fetched. */
  list(): Promise<PerfRun[] | null>;
}

export function perfStore(target: PerfTarget, storage: Storage | null = safeLocalStorage()): PerfStore {
  return target.mode === 'online' ? new OnlinePerf(target) : new SoloPerf(target, storage);
}

function safeLocalStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

class OnlinePerf implements PerfStore {
  constructor(private readonly target: PerfTarget) {}

  private get url(): string {
    return `/api/valleys/${this.target.valleyId}/perf`;
  }

  async put(input: PerfRunInput): Promise<boolean> {
    try {
      const res = await fetch(this.url, {
        method: 'PUT',
        headers: { authorization: `Bearer ${this.target.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async list(): Promise<PerfRun[] | null> {
    try {
      const res = await fetch(this.url, { headers: { authorization: `Bearer ${this.target.token}` } });
      if (!res.ok) return null;
      const runs = ((await res.json()) as { runs?: unknown }).runs;
      return Array.isArray(runs) ? (runs as PerfRun[]) : null;
    } catch {
      return null;
    }
  }
}

/** Solo: on this device, per valley, the last three runs a seat (a solo valley has the one). */
export class SoloPerf implements PerfStore {
  constructor(
    private readonly target: PerfTarget,
    private readonly storage: Storage | null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get key(): string {
    return `qoti.perf.v1.${this.target.valleyId}`;
  }

  private read(): PerfRun[] {
    try {
      const raw = this.storage?.getItem(this.key);
      const runs: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(runs) ? (runs as PerfRun[]) : [];
    } catch {
      return [];
    }
  }

  put(input: PerfRunInput): Promise<boolean> {
    if (!this.storage) return Promise.resolve(false);
    const run: PerfRun = { ...input, seat: this.target.seat, created: this.now() };
    try {
      this.storage.setItem(this.key, JSON.stringify(trimPerfRuns([...this.read(), run])));
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  list(): Promise<PerfRun[] | null> {
    return Promise.resolve(this.storage ? this.read() : null);
  }
}

/** Runs to show: the last three of each seat, newest first. */
export function runsToShow(runs: readonly PerfRun[]): PerfRun[] {
  return trimPerfRuns(runs).sort((a, b) => b.created - a.created);
}

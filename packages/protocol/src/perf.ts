// Measure this laptop (V2.0; docs/spec/22-quality.md, Measuring the laptops): the perf tables a
// seat records with Settings, Measure this laptop, kept with the valley and never in sim state.
// One route, shared by the Worker's ValleyRoom and the dev relay (a solo valley keeps its runs on
// the device with the same trimming, `trimPerfRuns`):
//   PUT /api/valleys/<id>/perf  body: a PerfRunInput as JSON, at most MAX_PERF_CHARS
//   GET /api/valleys/<id>/perf  every seat's runs, oldest first: { runs: PerfRun[] }
// Every call needs a seat token in `Authorization: Bearer <token>`; the seat and the time come from
// the server, never the body. A valley keeps the last PERF_RUNS_PER_SEAT runs for each seat.
import { seatOf } from './images';
import type { StoredMeta } from './storage';

export const PERF_ROUTE = /^\/api\/valleys\/([0-9a-f]{32})\/perf$/;
export const PERF_RUNS_PER_SEAT = 3;
/** A run's JSON: 4 presets times 3 scenes is 12 rows and a table, well under this. */
export const MAX_PERF_CHARS = 64 * 1024;

/** Where and on what a run was taken. */
export interface PerfMachine {
  /** `navigator.userAgent`. */
  browser: string;
  /** CSS pixels (`screen.width`, `screen.height`) and `devicePixelRatio`. */
  screen: [number, number];
  pixelRatio: number;
  /** WebGL's unmasked renderer string where the browser gives one, else null. */
  gpu: string | null;
  /** The build id (`BUILD_ID` on the client). */
  build: string;
}

/** One part of a row (the camera moving, or at rest): the client's `PerfPart` (app/perf.ts). */
export interface PerfRunPart {
  frames: number;
  frameAvg: number;
  frameP95: number;
  gpuAvg: number | null;
  gpuP95: number | null;
  draws: number;
  triangles: number;
  modes?: { moving: number; still: number; idle: number };
  shadowRenders?: number;
}

/** One scene on one preset. */
export interface PerfRunRow {
  scene: string;
  quality: string;
  /** The hour the light was pinned to (11 by day, 22 at night); absent in runs from before it. */
  hour?: number;
  moving: PerfRunPart;
  idle: PerfRunPart;
}

/** What the client sends. */
export interface PerfRunInput {
  machine: PerfMachine;
  rows: PerfRunRow[];
  /** The rows as the Markdown table the panel copies. */
  table: string;
}

/** A stored run: the input, stamped by the server with the seat and the time. */
export interface PerfRun extends PerfRunInput {
  seat: number;
  /** Wall-clock ms when stored. */
  created: number;
}

/** Where a valley keeps its runs: Durable Object storage, the dev relay's file, the device. */
export interface PerfStorage {
  getPerfRuns(): Promise<PerfRun[]>;
  setPerfRuns(runs: PerfRun[]): Promise<void>;
}

/** Keeps the last `perSeat` runs of each seat, in the order they came. */
export function trimPerfRuns(runs: readonly PerfRun[], perSeat = PERF_RUNS_PER_SEAT): PerfRun[] {
  const kept = new Map<number, number>();
  const out: PerfRun[] = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]!;
    const n = kept.get(r.seat) ?? 0;
    if (n >= perSeat) continue;
    kept.set(r.seat, n + 1);
    out.push(r);
  }
  return out.reverse();
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown): boolean => v === null || isNum(v);

function isPart(p: unknown): p is PerfRunPart {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    isNum(o.frames) &&
    isNum(o.frameAvg) &&
    isNum(o.frameP95) &&
    isNumOrNull(o.gpuAvg) &&
    isNumOrNull(o.gpuP95) &&
    isNum(o.draws) &&
    isNum(o.triangles)
  );
}

/** A loose shape check on what a client sent (the size cap does the rest). */
export function isPerfRunInput(v: unknown): v is PerfRunInput {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const m = o.machine as Record<string, unknown> | undefined;
  if (!m || typeof m !== 'object') return false;
  if (typeof m.browser !== 'string' || typeof m.build !== 'string') return false;
  if (!Array.isArray(m.screen) || m.screen.length !== 2 || !m.screen.every(isNum)) return false;
  if (!isNum(m.pixelRatio) || !(m.gpu === null || typeof m.gpu === 'string')) return false;
  if (typeof o.table !== 'string' || !Array.isArray(o.rows)) return false;
  return o.rows.every((r: unknown) => {
    if (!r || typeof r !== 'object') return false;
    const row = r as Record<string, unknown>;
    return (
      typeof row.scene === 'string' &&
      typeof row.quality === 'string' &&
      (row.hour === undefined || isNum(row.hour)) &&
      isPart(row.moving) &&
      isPart(row.idle)
    );
  });
}

export interface PerfRequest {
  method: string;
  authorization: string | null;
  /** Declared length, when the transport knows it (refused early when too large). */
  contentLength: number | null;
  /** Reads the body as text, refusing past `limit` characters (returns null then). */
  body(limit: number): Promise<string | null>;
}

export interface PerfResponse {
  status: number;
  json: unknown;
}

/** The perf route, the same for the Worker and the dev relay. */
export async function handlePerf(
  req: PerfRequest,
  storage: PerfStorage,
  meta: StoredMeta | null,
  now: number,
): Promise<PerfResponse> {
  if (!meta) return { status: 404, json: { error: 'No such valley' } };
  const seat = await seatOf(meta, req.authorization);
  if (seat === null) return { status: 401, json: { error: 'A seat token is needed' } };
  if (req.method === 'GET') return { status: 200, json: { runs: await storage.getPerfRuns() } };
  if (req.method !== 'PUT') return { status: 405, json: { error: 'Method not allowed' } };
  if (req.contentLength !== null && req.contentLength > MAX_PERF_CHARS)
    return { status: 413, json: { error: 'Too large' } };
  const text = await req.body(MAX_PERF_CHARS);
  if (text === null) return { status: 413, json: { error: 'Too large' } };
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { status: 400, json: { error: 'Bad request' } };
  }
  if (!isPerfRunInput(input)) return { status: 400, json: { error: 'Not a perf run' } };
  const run: PerfRun = {
    machine: input.machine,
    rows: input.rows,
    table: input.table,
    seat,
    created: now,
  };
  const runs = trimPerfRuns([...(await storage.getPerfRuns()), run]);
  await storage.setPerfRuns(runs);
  return { status: 201, json: { stored: true, runs: runs.filter((r) => r.seat === seat).length } };
}

/** In-memory perf runs for tests and the dev relay (which saves them beside the valley). */
export class MemoryPerf implements PerfStorage {
  private runs: PerfRun[] = [];
  onChange: (() => void) | null = null;

  static restore(runs: PerfRun[]): MemoryPerf {
    const s = new MemoryPerf();
    s.runs = [...runs];
    return s;
  }

  dump(): PerfRun[] {
    return [...this.runs];
  }

  getPerfRuns(): Promise<PerfRun[]> {
    return Promise.resolve([...this.runs]);
  }

  setPerfRuns(runs: PerfRun[]): Promise<void> {
    this.runs = [...runs];
    this.onChange?.();
    return Promise.resolve();
  }
}

/** The extension's two constants (`EXT_disjoint_timer_query_webgl2`). */
interface TimerQueryExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** Queries in flight at once; a frame that finds them all busy goes untimed. */
const RING = 3;
/** Results kept for the average shown in the `?debug` overlay. */
const AVERAGE_OF = 30;
/** Raw results kept for the perf script (`__qoti.perf()`). */
const HISTORY = 600;

/**
 * GPU time per drawn frame (V1.0), from `EXT_disjoint_timer_query_webgl2` where the browser offers
 * it (desktop Chrome and Edge on most GPUs; not Safari, Firefox or a software renderer). Each drawn
 * frame sits inside one TIME_ELAPSED query; a ring of three is read back as results arrive, a
 * frame or two later, and every pending result is dropped when the GPU reports a disjoint (a
 * power state or clock change makes them meaningless). Without the extension `ms` stays null.
 */
export class GpuTimer {
  private readonly ext: TimerQueryExt | null;
  private readonly pending: WebGLQuery[] = [];
  private readonly spare: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private readonly recent: number[] = [];
  /** The latest raw results in ms, oldest first, and how many have ever arrived. */
  readonly history: number[] = [];
  total = 0;
  /** Average GPU ms of the last 30 timed frames, or null (no extension, or nothing timed yet). */
  ms: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    let ext: TimerQueryExt | null;
    try {
      ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null;
    } catch {
      ext = null;
    }
    this.ext = ext;
  }

  /** Whether this browser can time the GPU at all. */
  get available(): boolean {
    return this.ext !== null;
  }

  /** Starts timing a frame (call right before drawing it). */
  begin(): void {
    const ext = this.ext;
    if (!ext || this.active) return;
    this.poll();
    if (this.pending.length >= RING) return;
    const q = this.spare.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  /** Stops timing the frame begun by `begin` (call right after drawing it). */
  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Reads back every result that has arrived, oldest first. */
  poll(): void {
    const ext = this.ext;
    if (!ext || this.pending.length === 0) return;
    const gl = this.gl;
    // Reading the flag clears it, so once per poll. A disjoint spoils every result in flight.
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const q of this.pending.splice(0)) gl.deleteQuery(q);
      return;
    }
    while (this.pending.length > 0) {
      const q = this.pending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      this.spare.push(this.pending.shift()!);
      this.record(ns / 1e6);
    }
  }

  private record(ms: number): void {
    this.recent.push(ms);
    if (this.recent.length > AVERAGE_OF) this.recent.shift();
    this.history.push(ms);
    if (this.history.length > HISTORY) this.history.shift();
    this.total++;
    this.ms = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
  }

  dispose(): void {
    if (this.active && this.ext) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    for (const q of [...this.pending, ...this.spare, ...(this.active ? [this.active] : [])])
      this.gl.deleteQuery(q);
    this.pending.length = 0;
    this.spare.length = 0;
    this.active = null;
  }
}

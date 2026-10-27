// The sound bank (C5G): rendered sounds as AudioBuffers, made once and kept. Rendering happens in
// the audio worker; without workers it falls back to idle time on the main thread, one sound a
// slice. The frame never waits on a sound: a sound not ready yet is simply skipped.
import { RENDER_RATE } from './synth/dsp';
import { jobKey, renderJob, type RenderJob } from './synth/jobs';

/** Most notes a piece needs at once is about 40; keep a few pieces' worth plus cues and loops. */
const MAX_BUFFERS = 200;

export class SoundBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly asked = new Set<string>();
  private readonly idleQueue: RenderJob[] = [];
  private idle = false;
  private worker: Worker | null = null;

  constructor(private readonly ctx: BaseAudioContext) {
    try {
      this.worker = new Worker(new URL('./synth/render.worker.ts', import.meta.url), {
        type: 'module',
        name: 'audio',
      });
      this.worker.onmessage = (e: MessageEvent<{ key: string; data: Float32Array }>) => {
        this.asked.delete(e.data.key);
        this.store(e.data.key, e.data.data);
      };
    } catch {
      this.worker = null;
    }
  }

  get(key: string): AudioBuffer | undefined {
    const b = this.buffers.get(key);
    if (b) {
      // Most recently used last, so the oldest go first when the bank is full.
      this.buffers.delete(key);
      this.buffers.set(key, b);
    }
    return b;
  }

  has(key: string): boolean {
    return this.buffers.has(key);
  }

  /** Asks for a sound to be rendered, once. Returns its key. */
  want(job: RenderJob): string {
    const key = jobKey(job);
    if (this.buffers.has(key) || this.asked.has(key)) return key;
    this.asked.add(key);
    if (this.worker) this.worker.postMessage(job);
    else {
      this.idleQueue.push(job);
      this.schedule();
    }
    return key;
  }

  /** Sounds asked for and not back yet. */
  get pending(): number {
    return this.asked.size;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private store(key: string, data: Float32Array): void {
    const b = this.ctx.createBuffer(1, Math.max(1, data.length), RENDER_RATE);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    this.buffers.set(key, b);
    while (this.buffers.size > MAX_BUFFERS) {
      const oldest = this.buffers.keys().next().value as string;
      this.buffers.delete(oldest);
    }
  }

  private schedule(): void {
    if (this.idle || this.idleQueue.length === 0) return;
    this.idle = true;
    const run = (): void => {
      this.idle = false;
      const job = this.idleQueue.shift();
      if (job) {
        const key = jobKey(job);
        this.asked.delete(key);
        if (!this.buffers.has(key)) this.store(key, renderJob(job));
      }
      this.schedule();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
    else setTimeout(run, 50);
  }
}

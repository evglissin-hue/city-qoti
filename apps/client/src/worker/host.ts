import type { LayerPatch, SimEvent, Turn, ViewSnapshot } from '@qoti/sim';
import type { FromWorker, InitSource, ToWorker } from './messages';

export interface WorkerUpdate {
  t: number;
  tick?: number;
  events: SimEvent[];
  patches: LayerPatch[];
}

/** Main-thread handle on the sim worker. Messages keep their order, so turns posted after init wait for it. */
export class SimHost {
  private readonly worker: Worker;
  private nextReq = 1;
  private readonly snapshotWaits = new Map<number, (s: { t: number; data: Uint8Array }) => void>();
  private readonly hashWaits = new Map<number, (h: { t: number; h: string }) => void>();
  private readyWait: ((view: ViewSnapshot) => void) | null = null;
  private failWait: ((err: Error) => void) | null = null;
  onUpdate: ((u: WorkerUpdate) => void) | null = null;
  onHash: ((t: number, h: string) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'sim' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    this.worker.onerror = (e) => this.fail(e.message || 'The sim worker failed to start');
  }

  private post(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  private fail(message: string): void {
    this.failWait?.(new Error(message));
    this.failWait = null;
    this.readyWait = null;
    this.onError?.(message);
  }

  private receive(msg: FromWorker): void {
    switch (msg.k) {
      case 'ready':
        this.readyWait?.(msg.view);
        this.readyWait = null;
        this.failWait = null;
        break;
      case 'update':
        this.onUpdate?.(msg);
        break;
      case 'hash':
        if (msg.reqId !== undefined) {
          this.hashWaits.get(msg.reqId)?.({ t: msg.t, h: msg.h });
          this.hashWaits.delete(msg.reqId);
        } else {
          this.onHash?.(msg.t, msg.h);
        }
        break;
      case 'snapshot':
        this.snapshotWaits.get(msg.reqId)?.({ t: msg.t, data: msg.data });
        this.snapshotWaits.delete(msg.reqId);
        break;
      case 'agents':
        break;
      case 'error':
        this.fail(msg.message);
        break;
    }
  }

  /** Starts the world (from seed or snapshot), applies catch-up turns, resolves with its view. */
  init(source: InitSource, turns: Turn[] = []): Promise<ViewSnapshot> {
    const promise = new Promise<ViewSnapshot>((resolve, reject) => {
      this.readyWait = resolve;
      this.failWait = reject;
    });
    this.post(
      { k: 'init', source, turns },
      source.kind === 'snapshot' ? [source.data.buffer as ArrayBuffer] : [],
    );
    return promise;
  }

  turns(turns: Turn[]): void {
    this.post({ k: 'turns', turns });
  }

  snapshot(): Promise<{ t: number; data: Uint8Array }> {
    const reqId = this.nextReq++;
    const promise = new Promise<{ t: number; data: Uint8Array }>((resolve) =>
      this.snapshotWaits.set(reqId, resolve),
    );
    this.post({ k: 'snapshot', reqId });
    return promise;
  }

  hash(): Promise<{ t: number; h: string }> {
    const reqId = this.nextReq++;
    const promise = new Promise<{ t: number; h: string }>((resolve) => this.hashWaits.set(reqId, resolve));
    this.post({ k: 'hash', reqId });
    return promise;
  }

  terminate(): void {
    this.worker.terminate();
  }
}

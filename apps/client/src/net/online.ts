import { CloseCode, type C2S, type S2C } from '@qoti/protocol';
import { SIM_VERSION, type SeatId } from '@qoti/sim';
import { backoffMs } from './backoff';
import { BaseConnection } from './base';

export interface OnlineOptions {
  valleyId: string;
  seat: SeatId;
  token: string;
}

/** Closes after which retrying cannot help: a bad invite, a missing valley, or another tab took the seat. */
const FINAL_CLOSES = new Set<number>([
  CloseCode.badHello,
  CloseCode.replaced,
  CloseCode.badToken,
  CloseCode.notFound,
  CloseCode.versionMismatch,
]);

/** The room sends a turn every 100 ms; this long without a frame means the socket is gone (sleep, lost wifi). */
export const SILENCE_MS = 5000;

/**
 * RoomConnection over a WebSocket to the relay (the dev server locally, a Durable Object online).
 * It heals itself: a dropped or silent socket is replaced with exponential backoff, and each new
 * welcome carries the snapshot and log the session needs to catch up.
 */
export class OnlineRoom extends BaseConnection {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private lastFrameAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly watchdog: ReturnType<typeof setInterval>;
  /** Retry right away when the network or the tab comes back. */
  private readonly wake = () => {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  };
  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    this.checkSilence();
    this.wake();
  };

  constructor(private readonly opts: OnlineOptions) {
    super(opts.seat);
    addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.watchdog = setInterval(() => this.checkSilence(), 1000);
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    this.status.value = 'connecting';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${proto}//${location.host}/api/valleys/${encodeURIComponent(this.opts.valleyId)}/ws`,
    );
    this.ws = ws;
    this.lastFrameAt = Date.now();
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.lastFrameAt = Date.now();
      // The token travels in the first message, never in the URL.
      this.send({
        k: 'hello',
        valleyId: this.opts.valleyId,
        seat: this.opts.seat,
        token: this.opts.token,
        simVersion: SIM_VERSION,
      });
    });
    ws.addEventListener('message', (e: MessageEvent<string>) => {
      if (this.ws !== ws) return;
      this.lastFrameAt = Date.now();
      let msg: S2C;
      try {
        msg = JSON.parse(e.data) as S2C;
      } catch {
        return;
      }
      if (msg.k === 'welcome') this.attempt = 0;
      this.dispatch(msg);
    });
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.dropped(e.code);
    });
  }

  private dropped(code: number): void {
    if (this.closed) return;
    this.status.value = 'offline';
    if (FINAL_CLOSES.has(code) || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, backoffMs(this.attempt++));
  }

  /** A socket that went quiet is replaced; the browser may take minutes to notice on its own. */
  private checkSilence(): void {
    const ws = this.ws;
    if (!ws || this.closed || Date.now() - this.lastFrameAt <= SILENCE_MS) return;
    this.ws = null;
    try {
      ws.close(CloseCode.normal, 'Silent');
    } catch {
      // Already gone.
    }
    this.dropped(1006);
  }

  protected send(msg: C2S): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    if (this.closed) return;
    this.send({ k: 'bye' });
    this.closed = true;
    clearInterval(this.watchdog);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ws?.close(CloseCode.normal, 'Bye');
    this.ws = null;
    this.status.value = 'offline';
  }
}

import type { C2S, S2C } from '@qoti/protocol';
import { SIM_VERSION, type SeatId } from '@qoti/sim';
import { BaseConnection } from './base';

export interface OnlineOptions {
  valleyId: string;
  seat: SeatId;
  token: string;
}

/** RoomConnection over a WebSocket to the relay (the dev server locally, a Durable Object online). */
export class OnlineRoom extends BaseConnection {
  private readonly ws: WebSocket;
  private closed = false;

  constructor(opts: OnlineOptions) {
    super(opts.seat);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/api/valleys/${encodeURIComponent(opts.valleyId)}/ws`);
    this.ws.addEventListener('open', () => {
      // The token travels in the first message, never in the URL.
      this.send({
        k: 'hello',
        valleyId: opts.valleyId,
        seat: opts.seat,
        token: opts.token,
        simVersion: SIM_VERSION,
      });
    });
    this.ws.addEventListener('message', (e: MessageEvent<string>) => {
      let msg: S2C;
      try {
        msg = JSON.parse(e.data) as S2C;
      } catch {
        return;
      }
      this.dispatch(msg);
    });
    this.ws.addEventListener('close', () => {
      this.status.value = 'offline';
    });
  }

  protected send(msg: C2S): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.send({ k: 'bye' });
    this.ws.close(1000, 'Bye');
    this.status.value = 'offline';
  }
}

import {
  createValley,
  RoomCore,
  TURN_MS,
  type C2S,
  type Conn,
  type CreateValleyRequest,
} from '@qoti/protocol';
import { SIM_VERSION, type SeatId } from '@qoti/sim';
import { BaseConnection } from './base';
import { IdbStorage } from './idb';

/**
 * Offline solo play: the same RoomCore as online, running in the page over IndexedDB, with an
 * in-memory connection. Messages hop through a microtask, as if they crossed a wire.
 */
export class LocalRoom extends BaseConnection {
  private readonly core: RoomCore;
  private readonly conn: Conn;
  private timer: ReturnType<typeof setInterval> | null = null;

  private constructor(core: RoomCore, seat: SeatId) {
    super(seat);
    this.core = core;
    this.conn = {
      send: (msg) => queueMicrotask(() => this.dispatch(msg)),
      close: () => {
        this.status.value = 'offline';
      },
    };
  }

  /** Creates a new solo valley in IndexedDB and returns its id and seat 0 token. */
  static async create(valleyId: string, body: CreateValleyRequest): Promise<{ token: string; seed: string }> {
    const created = await createValley(new IdbStorage(valleyId), valleyId, body, Date.now());
    return { token: created.tokens[0]!, seed: created.seed };
  }

  static async open(opts: { valleyId: string; seat: SeatId; token: string }): Promise<LocalRoom> {
    const core = new RoomCore(new IdbStorage(opts.valleyId), { turnMs: TURN_MS, now: () => Date.now() });
    await core.ready();
    const room = new LocalRoom(core, opts.seat);
    core.open(room.conn);
    room.timer = setInterval(() => core.step(), TURN_MS);
    core.message(room.conn, {
      k: 'hello',
      valleyId: opts.valleyId,
      seat: opts.seat,
      token: opts.token,
      simVersion: SIM_VERSION,
    });
    return room;
  }

  protected send(msg: C2S): void {
    this.core.message(this.conn, msg);
  }

  close(): void {
    if (!this.timer) return;
    this.core.close(this.conn);
    // One more step records the leave, then the room rests.
    this.core.step();
    clearInterval(this.timer);
    this.timer = null;
    this.status.value = 'offline';
  }
}

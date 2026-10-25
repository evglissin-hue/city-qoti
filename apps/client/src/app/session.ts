import { signal } from '@preact/signals';
import type { ErrorCode, PresenceMsg, RosterEntry, ValleyMeta, Welcome } from '@qoti/protocol';
import { base64ToBytes, SIM_VERSION, type Command, type SeatId, type Speed, type Turn } from '@qoti/sim';
import type { Selection, ToolContext, UiApi } from '../input/context';
import { ToolManager } from '../input/manager';
import type { PointerInfo } from '../input/tool';
import type { RoomConnection } from '../net/connection';
import { LocalRoom } from '../net/local';
import { OnlineRoom } from '../net/online';
import { Renderer, type Quality } from '../render/renderer';
import { setPingSender, type PingKind } from '../ui/pingBus';
import { loadProfile, profileUpdate } from './profile';
import { Mirror, type MirrorChange } from '../state/mirror';
import { rejectText } from '../ui/messages';
import { createUiState } from '../ui/state';
import type { InitSource } from '../worker/messages';
import { SimHost } from '../worker/host';
import { updateRecent } from './recent';

export interface SessionTarget {
  valleyId: string;
  seat: SeatId;
  token: string;
  mode: 'online' | 'solo';
  /** Invite fragment for seat 1, when this device created the valley. */
  invite?: string;
}

const PRESENCE_MS = 200;

const ROOM_ERRORS: Partial<Record<ErrorCode, string>> = {
  BAD_TOKEN: 'That invite does not open this valley.',
  NOT_FOUND: 'That valley is not on this relay.',
  VERSION_MISMATCH: 'You and your partner are on different versions. Reload both tabs.',
  SEAT_TAKEN: 'Someone is already sitting in that seat.',
};

/**
 * One valley being played: the room connection, the sim worker, the Mirror, the renderer and
 * the tools. Boot: connect, welcome, worker init (seed or snapshot plus catch-up), mirror,
 * renderer and UI, then live turns flow to the worker.
 */
export class Session {
  readonly mirror = new Mirror();
  readonly host = new SimHost();
  readonly ui = createUiState();
  readonly phase = signal<'connecting' | 'loading' | 'ready' | 'failed'>('connecting');
  readonly error = signal<string | null>(null);
  readonly valley = signal<ValleyMeta | null>(null);
  readonly roster = signal<RosterEntry[]>([]);
  connection: RoomConnection | null = null;
  renderer: Renderer | null = null;
  tools: ToolManager | null = null;
  /** For the debug hook and tests: hashes by turn, first sight of entities, submit times. */
  readonly debug = {
    lastHash: null as { t: number; h: string } | null,
    hashes: new Map<number, string>(),
    firstSeen: new Map<string, number>(),
    lastSubmitAt: 0,
  };
  private container: HTMLElement | null = null;
  private pointerAt = { x: innerWidth / 2, y: innerHeight / 2 };
  private presence = { key: '', sentAt: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 };
  private lastSpeed: Speed = 1;
  private nextToast = 1;
  private readonly onPageHide = () => this.connection?.close();

  constructor(readonly target: SessionTarget) {}

  get seat(): SeatId {
    return this.target.seat;
  }

  async start(container: HTMLElement): Promise<void> {
    this.container = container;
    this.host.onUpdate = (u) => this.afterUpdate(this.mirror.apply(u));
    this.host.onHash = (t, h) => {
      this.debug.lastHash = { t, h };
      this.debug.hashes.set(t, h);
      this.connection?.sendHash(t, h);
    };
    this.host.onError = (message) => this.fail(`The simulation stopped: ${message}`);
    try {
      this.connection =
        this.target.mode === 'online' ? new OnlineRoom(this.target) : await LocalRoom.open(this.target);
    } catch (err) {
      this.fail(`Could not open the valley: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const c = this.connection;
    c.onWelcome((w) => void this.welcome(w));
    c.onTurn((turn: Turn) => this.host.turns([turn]));
    c.onPresence((p) => this.onPresence(p));
    c.onNeedSnapshot(() => void this.uploadSnapshot());
    c.onError((code, message) => {
      const text = ROOM_ERRORS[code] ?? message;
      if (this.phase.value === 'ready') this.toast(text);
      else this.fail(text);
    });
    c.status.subscribe((status) => {
      if (status === 'offline' && this.phase.value === 'connecting') {
        this.fail('Could not reach the relay. Is the dev server running?');
      }
    });
    addEventListener('pagehide', this.onPageHide);
  }

  private async welcome(w: Welcome): Promise<void> {
    this.valley.value = w.valley;
    this.roster.value = w.roster;
    this.phase.value = 'loading';
    // Post init now, before any live turn: the worker handles messages in order.
    const source: InitSource = w.snapshot
      ? { kind: 'snapshot', data: base64ToBytes(w.snapshot.data) }
      : { kind: 'new', seed: w.valley.seed, settings: w.valley.settings };
    const turns = [...w.log];
    const covered = turns[turns.length - 1]?.t ?? w.snapshot?.t ?? 0;
    if (w.nextTurn - 1 > covered) turns.push({ t: w.nextTurn - 1, cmds: [] });
    let view;
    try {
      view = await this.host.init(source, turns);
    } catch (err) {
      this.fail(`Could not load the valley: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.mirror.load(view);
    if (!this.renderer) this.mount();
    if (this.connection) this.connection.status.value = 'live';
    // Start in the lens this seat prefers; Tab still swaps freely afterwards.
    const mine = this.mirror.seats.value.find((v) => v.seat === this.seat);
    if (mine) {
      this.ui.lens.value = mine.lens;
      const update = profileUpdate(loadProfile(), mine);
      if (update) this.submit({ t: 'seat.setProfile', ...update, lens: mine.lens });
    }
    this.phase.value = 'ready';
    updateRecent(this.target.valleyId, {
      name: w.valley.settings.townName,
      lastPlayed: Date.now(),
      pending: false,
    });
  }

  private mount(): void {
    if (!this.container) return;
    const quality = (new URLSearchParams(location.search).get('quality') as Quality | null) ?? 'medium';
    const renderer = new Renderer(this.container, this.mirror, quality);
    this.renderer = renderer;
    const ctx: ToolContext = {
      mirror: this.mirror,
      render: renderer,
      camera: renderer.rig,
      seat: this.seat,
      submit: (cmd) => this.submit(cmd),
      ui: this.uiApi(),
    };
    setPingSender((x, z, kind) => this.sendPing(x, z, kind));
    this.tools = new ToolManager(ctx, renderer, renderer.canvas, {
      pointer: (p) => this.pointer(p),
      globalKey: (e) => this.globalKey(e),
    });
  }

  /** Send an emote over the existing emote message and show it here too. */
  sendEmote(id: string): void {
    this.showEmote(this.seat, id);
    const c = this.connection as unknown as { send?: (msg: { k: 'emote'; id: string }) => void };
    c?.send?.call(this.connection, { k: 'emote', id });
  }

  private emoteKey = 0;
  private showEmote(seat: number, id: string): void {
    const key = this.emoteKey++;
    this.ui.emotes.value = [...this.ui.emotes.value.slice(-3), { key, seat, id }];
    setTimeout(() => {
      this.ui.emotes.value = this.ui.emotes.value.filter((e) => e.key !== key);
    }, 3200);
  }

  /** Show a ping here and send it to the partner over the existing ping message. */
  sendPing(x: number, z: number, kind: PingKind): void {
    this.renderer?.ping(this.seat, x + 0.5, z + 0.5, kind);
    // RoomConnection has no ping sender yet (net/ is another cycle's), so reach the raw send.
    const c = this.connection as unknown as {
      send?: (msg: { k: 'ping'; x: number; z: number; kind: PingKind }) => void;
    };
    c?.send?.call(this.connection, { k: 'ping', x, z, kind });
  }

  submit(cmd: Command): number {
    if (!this.connection) return -1;
    this.debug.lastSubmitAt = Date.now();
    return this.connection.submit(cmd);
  }

  setSpeed(speed: Speed): void {
    if (speed > 0) this.lastSpeed = speed;
    this.submit({ t: 'time.setSpeed', speed });
  }

  /** My desired speed (what my speed buttons show as pressed). */
  myDesiredSpeed(): Speed {
    return this.mirror.seats.value.find((s) => s.seat === this.seat)?.desiredSpeed ?? 1;
  }

  togglePause(): void {
    const mine = this.myDesiredSpeed();
    this.setSpeed(mine > 0 ? 0 : this.lastSpeed);
  }

  private afterUpdate(change: MirrorChange): void {
    const now = Date.now();
    for (const key of change.added) if (!this.debug.firstSeen.has(key)) this.debug.firstSeen.set(key, now);
    for (const r of change.rejections) if (r.seat === this.seat) this.toast(rejectText(r.reason));
    const sel = this.ui.selection.value;
    if (sel && 'id' in sel) {
      const gone =
        (sel.kind === 'building' && !this.mirror.buildings.has(sel.id)) ||
        (sel.kind === 'decor' && !this.mirror.decor.has(sel.id)) ||
        (sel.kind === 'note' && !this.mirror.notes.has(sel.id));
      if (gone) this.ui.selection.value = null;
    }
  }

  private onPresence(p: PresenceMsg): void {
    switch (p.k) {
      case 'presence': {
        const cursor = p.cursor
          ? { x: p.cursor[0], z: p.cursor[1], ...(p.tool ? { tool: p.tool } : {}) }
          : null;
        this.renderer?.setPresence(p.seat, cursor);
        const next = new Map(this.ui.cursors.value);
        if (cursor) next.set(p.seat, cursor);
        else next.delete(p.seat);
        this.ui.cursors.value = next;
        break;
      }
      case 'ping':
        this.renderer?.ping(p.seat, p.x, p.z, p.kind);
        break;
      case 'roster':
        this.roster.value = p.roster;
        for (const r of p.roster) if (!r.connected) this.renderer?.setPresence(r.seat, null);
        if (p.roster.some((r) => !r.connected && this.ui.cursors.value.has(r.seat))) {
          const next = new Map(this.ui.cursors.value);
          for (const r of p.roster) if (!r.connected) next.delete(r.seat);
          this.ui.cursors.value = next;
        }
        break;
      case 'emote':
        this.showEmote(p.seat, p.id);
        break;
    }
  }

  /** Sends my cursor to the other seat: at most 5 times a second, and only when it changes. */
  private pointer(p: PointerInfo): void {
    this.pointerAt = { x: p.clientX, y: p.clientY };
    if (!p.tile || !this.connection) return;
    const tool = this.tools?.active.value ?? 'inspect';
    const key = `${p.tile.x},${p.tile.z},${tool}`;
    if (key === this.presence.key) return;
    this.presence.key = key;
    const send = () => {
      this.presence.timer = 0;
      this.presence.sentAt = Date.now();
      const [x, z, t] = this.presence.key.split(',');
      this.connection?.sendPresence({ cursor: [Number(x), Number(z)], tool: t ?? 'inspect' });
    };
    const wait = PRESENCE_MS - (Date.now() - this.presence.sentAt);
    if (wait <= 0) send();
    else if (!this.presence.timer) this.presence.timer = setTimeout(send, wait);
  }

  private globalKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case ' ':
        this.togglePause();
        return true;
      case '1':
      case '2':
      case '3':
        this.setSpeed(Number(e.key) as Speed);
        return true;
      case 'Tab':
        this.ui.lens.value = this.ui.lens.value === 'hearth' ? 'ledger' : 'hearth';
        return true;
      case 'v':
      case 'V':
        this.ui.emoteOpen.value = !this.ui.emoteOpen.value;
        return true;
      case '?':
        this.ui.helpOpen.value = !this.ui.helpOpen.value;
        return true;
      case 'Escape':
        this.ui.helpOpen.value = false;
        this.ui.settingsOpen.value = false;
        this.ui.emoteOpen.value = false;
        this.tools?.select('inspect');
        this.ui.selection.value = null;
        return true;
      default:
        return false;
    }
  }

  private async uploadSnapshot(): Promise<void> {
    const snap = await this.host.snapshot();
    this.connection?.sendSnapshot({ t: snap.t, simVersion: SIM_VERSION, data: snap.data });
  }

  toast(text: string): void {
    const id = this.nextToast++;
    const { x, y } = this.pointerAt;
    this.ui.toasts.value = [...this.ui.toasts.value.slice(-3), { id, text, x, y }];
    setTimeout(() => {
      this.ui.toasts.value = this.ui.toasts.value.filter((t) => t.id !== id);
    }, 2800);
  }

  private uiApi(): UiApi {
    return {
      toast: (text) => this.toast(text),
      confirm: (text, ok, cancel) =>
        new Promise((resolve) => {
          this.ui.dialog.value = { kind: 'confirm', text, ok, cancel, resolve };
        }),
      prompt: (title, placeholder, max) =>
        new Promise((resolve) => {
          this.ui.dialog.value = { kind: 'prompt', title, placeholder, max, resolve };
        }),
      select: (selection: Selection | null) => {
        this.ui.selection.value = selection;
      },
      lens: () => this.ui.lens.value,
    };
  }

  private fail(message: string): void {
    this.error.value = message;
    this.phase.value = 'failed';
  }

  close(): void {
    removeEventListener('pagehide', this.onPageHide);
    if (this.presence.timer) clearTimeout(this.presence.timer);
    this.connection?.close();
    this.tools?.dispose();
    setPingSender(null);
    this.renderer?.dispose();
    this.host.terminate();
  }
}

import { signal } from '@preact/signals';
import {
  DecorGrid,
  defaultSettings,
  inBounds,
  LAYER_NAMES,
  MAP_SIZE,
  pasteRect,
  type BuildingView,
  type ClockView,
  type DecorView,
  type EntityId,
  type LayerName,
  type MapReader,
  type NoteView,
  type Rect,
  type RejectReason,
  type SeatView,
  type ValleySettings,
  type ViewSnapshot,
  type WorldMeta,
} from '@qoti/sim';
import type { WorkerUpdate } from '../worker/host';

export interface Rejection {
  seat: number;
  seq: number;
  reason: RejectReason;
  detail?: string;
}

/** What changed in one update, so the renderer and UI touch only what they must. */
export interface MirrorChange {
  /** Changed rects per layer (chunk rects from LayerPatches). */
  rects: Map<LayerName, Rect[]>;
  buildings: boolean;
  decor: boolean;
  notes: boolean;
  seats: boolean;
  rejections: Rejection[];
  /** Entities that appeared in this update, as 'building:12' style keys. */
  added: string[];
  full: boolean;
}

function emptyChange(full = false): MirrorChange {
  return {
    rects: new Map(),
    buildings: full,
    decor: full,
    notes: full,
    seats: full,
    rejections: [],
    added: [],
    full,
  };
}

const START_CLOCK: ClockView = { tick: 0, speed: 0, year: 1, season: 0, day: 1, hour: 6, minute: 0 };

/**
 * The client's copy of the view: layers patched by LayerPatch, entity maps, seats, clock and a
 * decor spatial hash. Implements MapReader so the client runs the sim's placement rules on it.
 */
export class Mirror implements MapReader {
  readonly size = MAP_SIZE;
  layers = {} as Record<LayerName, Uint8Array | Int32Array>;
  readonly buildings = new Map<EntityId, BuildingView>();
  readonly decor = new Map<EntityId, DecorView>();
  readonly notes = new Map<EntityId, NoteView>();
  private grid = new DecorGrid<DecorView>(MAP_SIZE);
  meta: WorldMeta = { startArea: [0, 0, 0, 0], valleyGate: [0, 0], flow: 'ns' };
  simVersion = '';

  readonly clock = signal<ClockView>(START_CLOCK);
  readonly tick = signal(0);
  readonly lastTurn = signal(0);
  readonly seats = signal<SeatView[]>([]);
  readonly settings = signal<ValleySettings>(defaultSettings());
  /** Bumps whenever entities change, for UI lists. */
  readonly revision = signal(0);
  private readonly listeners: ((c: MirrorChange) => void)[] = [];

  constructor() {
    for (const name of LAYER_NAMES) {
      this.layers[name] =
        name === 'occupant' ? new Int32Array(MAP_SIZE * MAP_SIZE) : new Uint8Array(MAP_SIZE * MAP_SIZE);
    }
  }

  onChange(cb: (c: MirrorChange) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private emit(change: MirrorChange): void {
    for (const cb of this.listeners) cb(change);
  }

  load(view: ViewSnapshot): void {
    for (const name of LAYER_NAMES) this.layers[name] = view.layers[name];
    this.buildings.clear();
    this.decor.clear();
    this.notes.clear();
    this.grid = new DecorGrid<DecorView>(MAP_SIZE);
    for (const b of view.buildings) this.buildings.set(b.id, b);
    for (const d of view.decor) {
      this.decor.set(d.id, d);
      this.grid.add(d);
    }
    for (const n of view.notes) this.notes.set(n.id, n);
    this.meta = view.meta;
    this.simVersion = view.simVersion;
    this.seats.value = view.seats;
    this.settings.value = view.settings;
    this.clock.value = view.clock;
    this.tick.value = view.clock.tick;
    this.lastTurn.value = view.lastTurn;
    this.revision.value++;
    this.emit(emptyChange(true));
  }

  apply(u: WorkerUpdate): MirrorChange {
    const change = emptyChange();
    for (const p of u.patches) {
      pasteRect(this.layers[p.layer], p.rect, p.data);
      const list = change.rects.get(p.layer) ?? [];
      list.push(p.rect);
      change.rects.set(p.layer, list);
    }
    let seats: SeatView[] | null = null;
    for (const e of u.events) {
      switch (e.e) {
        case 'building.added':
        case 'building.updated':
          if (e.e === 'building.added') change.added.push(`building:${e.b.id}`);
          this.buildings.set(e.b.id, e.b);
          change.buildings = true;
          break;
        case 'building.removed':
          this.buildings.delete(e.id);
          change.buildings = true;
          break;
        case 'decor.added':
          this.decor.set(e.d.id, e.d);
          this.grid.add(e.d);
          change.decor = true;
          change.added.push(`decor:${e.d.id}`);
          break;
        case 'decor.removed': {
          const d = this.decor.get(e.id);
          if (d) this.grid.remove(d);
          this.decor.delete(e.id);
          change.decor = true;
          break;
        }
        case 'note.added':
          this.notes.set(e.n.id, e.n);
          change.notes = true;
          change.added.push(`note:${e.n.id}`);
          break;
        case 'note.removed':
          this.notes.delete(e.id);
          change.notes = true;
          break;
        case 'seat.updated': {
          seats ??= [...this.seats.value];
          const i = seats.findIndex((s) => s.seat === e.s.seat);
          if (i >= 0) seats[i] = e.s;
          else seats.push(e.s);
          seats.sort((a, b) => a.seat - b.seat);
          change.seats = true;
          break;
        }
        case 'settings.updated':
          this.settings.value = e.settings;
          break;
        case 'clock':
          this.clock.value = e.c;
          break;
        case 'command.rejected':
          change.rejections.push(
            e.detail === undefined
              ? { seat: e.seat, seq: e.seq, reason: e.reason }
              : { seat: e.seat, seq: e.seq, reason: e.reason, detail: e.detail },
          );
          break;
        case 'tiles.changed':
        case 'notify':
          break;
      }
    }
    if (seats) this.seats.value = seats;
    if (u.tick !== undefined) this.tick.value = u.tick;
    this.lastTurn.value = u.t;
    if (change.buildings || change.decor || change.notes) this.revision.value++;
    this.emit(change);
    return change;
  }

  /** Effective speed right now (the minimum desired speed over connected seats). */
  get speed(): number {
    return this.clock.value.speed;
  }

  treeCount(): number {
    let n = 0;
    for (const v of this.layers.tree) if (v) n++;
    return n;
  }

  roadCount(): number {
    let n = 0;
    for (const v of this.layers.road) if (v) n++;
    return n;
  }

  private read(name: LayerName, x: number, z: number): number {
    return inBounds(x, z, MAP_SIZE) ? this.layers[name][z * MAP_SIZE + x]! : 0;
  }

  height(x: number, z: number): number {
    return this.read('height', x, z);
  }
  terrain(x: number, z: number): number {
    return this.read('terrain', x, z);
  }
  water(x: number, z: number): number {
    return this.read('water', x, z);
  }
  road(x: number, z: number): number {
    return this.read('road', x, z);
  }
  tree(x: number, z: number): number {
    return this.read('tree', x, z);
  }
  occupant(x: number, z: number): number {
    return this.read('occupant', x, z);
  }
  deposit(x: number, z: number): number {
    return this.read('deposit', x, z);
  }
  fertility(x: number, z: number): number {
    return this.read('fertility', x, z);
  }
  parcelUnlocked(x: number, z: number): boolean {
    return inBounds(x, z, MAP_SIZE);
  }
  decorNear(fx: number, fz: number, radius: number): DecorView[] {
    return this.grid.near(fx, fz, radius);
  }
}

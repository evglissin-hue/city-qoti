// Per-seat undo (docs/spec/16-coop.md, Guardrails): each client keeps its own last UNDO_DEPTH
// accepted commands with their inverses. Undo submits the inverse as a new command. The client
// first checks that the target still looks the way the command left it (CHANGED otherwise); the
// sim rejects the inverse if anything else moved on.
import { signal } from '@preact/signals';
import { content } from '@qoti/content';
import {
  MAP_SIZE,
  treeSpecies,
  UNDO_DEPTH,
  type BuildingCustom,
  type BuildingView,
  type Command,
  type RejectReason,
  type RoadKind,
  type SeatId,
  type Turn,
} from '@qoti/sim';
import type { Mirror, MirrorChange } from './mirror';

export interface UndoEntry {
  /** What undoing does, for the toast ("Undid the cottage"). */
  label: string;
  inverse: Command[];
  /** True while the world still looks the way the command left it. */
  intact(m: Mirror): boolean;
}

/** What a command needs remembered from before it ran, to build its inverse later. */
type Before =
  | { t: 'none' }
  | { t: 'buildings'; views: BuildingView[] }
  | { t: 'decor'; views: { def: string; fx: number; fz: number; rot: number }[] }
  | { t: 'tiles'; values: number[] }
  | { t: 'note'; text: string; x: number; z: number }
  | { t: 'custom'; values: BuildingCustom }
  | { t: 'flag'; value: boolean };

interface Pending {
  seq: number;
  cmd: Command;
  before: Before;
  /** Turn that carried the command, once seen. */
  turn: number;
  /** Turn when submitted, to give up on commands that never show up. */
  since: number;
}

const ROAD_VALUE: Record<RoadKind, number> = { path: 1, lane: 2 };
const KIND_OF_VALUE = new Map<number, RoadKind>([
  [1, 'path'],
  [2, 'lane'],
]);
/** Give up on a command that has not arrived in this many turns (a resync or a lost message). */
const STALE_TURNS = 600;

const idx = (x: number, z: number) => z * MAP_SIZE + x;
const sameValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

function buildingName(def: string): string {
  return content.buildingById.get(def)?.name.toLowerCase() ?? 'building';
}

function decorName(def: string): string {
  return content.decorById.get(def)?.name.toLowerCase() ?? 'piece';
}

/** Commands this stack can undo, and what to remember before each runs. */
function capture(cmd: Command, m: Mirror): Before | null {
  switch (cmd.t) {
    case 'build.place':
    case 'decor.place':
    case 'decor.placeRun':
    case 'tree.plant':
    case 'note.pin':
      return { t: 'none' };
    case 'build.remove': {
      const views = cmd.ids.map((id) => m.buildings.get(id)).filter((b): b is BuildingView => !!b);
      return views.length ? { t: 'buildings', views } : null;
    }
    case 'decor.remove': {
      const views = cmd.ids
        .map((id) => m.decor.get(id))
        .filter((d) => !!d)
        .map((d) => ({ def: d.def, fx: d.fx, fz: d.fz, rot: d.rot }));
      return views.length ? { t: 'decor', views } : null;
    }
    case 'road.paint':
    case 'road.remove':
      return { t: 'tiles', values: cmd.tiles.map(([x, z]) => m.road(x, z)) };
    case 'tree.remove':
      return { t: 'tiles', values: cmd.tiles.map(([x, z]) => m.tree(x, z)) };
    case 'field.paint':
    case 'field.remove':
      return { t: 'tiles', values: cmd.tiles.map(([x, z]) => fieldOwner(m, x, z)) };
    case 'note.remove': {
      const n = m.notes.get(cmd.id);
      return n ? { t: 'note', text: n.text, x: n.x, z: n.z } : null;
    }
    case 'build.customize': {
      const b = m.buildings.get(cmd.id);
      if (!b) return null;
      const values: Record<string, string | boolean | null> = {};
      for (const key of Object.keys(cmd.custom)) values[key] = b.custom?.[key] ?? null;
      return { t: 'custom', values: values as BuildingCustom };
    }
    case 'build.setPriority': {
      const b = m.buildings.get(cmd.id);
      return b ? { t: 'flag', value: b.rt?.construction?.priority ?? false } : null;
    }
    case 'build.setPaused': {
      const b = m.buildings.get(cmd.id);
      return b ? { t: 'flag', value: b.rt?.paused ?? false } : null;
    }
    case 'ledger.setForSale': {
      const line = m.stocks.value?.lines.find((l) => l.good === cmd.good);
      return { t: 'flag', value: line?.forSale ?? false };
    }
    default:
      return null;
  }
}

function fieldOwner(m: Mirror, x: number, z: number): number {
  const layer = m.layers.fieldOwner;
  return layer && x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE ? layer[idx(x, z)]! : 0;
}

/** Groups tiles by a previous value, skipping the ones `skip` says to leave alone. */
function groupBy(tiles: [number, number][], values: number[], skip: (v: number) => boolean) {
  const groups = new Map<number, [number, number][]>();
  tiles.forEach((tile, i) => {
    const v = values[i]!;
    if (skip(v)) return;
    const list = groups.get(v) ?? [];
    list.push(tile);
    groups.set(v, list);
  });
  return groups;
}

/** Builds the inverse once a command was accepted. `change` is the update that applied it. */
function inverseOf(p: Pending, m: Mirror, change: MirrorChange, seat: SeatId): UndoEntry | null {
  const { cmd, before } = p;
  switch (cmd.t) {
    case 'build.place': {
      const b = [...m.buildings.values()].find(
        (v) =>
          change.added.includes(`building:${v.id}`) &&
          v.def === cmd.def &&
          v.x === cmd.x &&
          v.z === cmd.z &&
          v.builtBy === seat,
      );
      if (!b) return null;
      return {
        label: `the ${buildingName(cmd.def)}`,
        inverse: [{ t: 'build.remove', ids: [b.id] }],
        intact: (mm) => mm.buildings.get(b.id)?.def === b.def,
      };
    }
    case 'build.remove': {
      if (before.t !== 'buildings') return null;
      const views = before.views;
      return {
        label: views.length === 1 ? `removing the ${buildingName(views[0]!.def)}` : 'the removal',
        inverse: views.map((v) => ({ t: 'build.place', def: v.def, x: v.x, z: v.z, rot: v.rot })),
        intact: (mm) => views.every((v) => !mm.buildings.has(v.id)),
      };
    }
    case 'decor.place':
    case 'decor.placeRun': {
      const ids = [...m.decor.values()]
        .filter(
          (d) =>
            change.added.includes(`decor:${d.id}`) &&
            d.def === cmd.def &&
            d.builtBy === seat &&
            (cmd.t === 'decor.placeRun' || (d.fx === cmd.fx && d.fz === cmd.fz)),
        )
        .map((d) => d.id);
      if (!ids.length) return null;
      return {
        label: `the ${decorName(cmd.def)}`,
        inverse: [{ t: 'decor.remove', ids }],
        intact: (mm) => ids.every((id) => mm.decor.has(id)),
      };
    }
    case 'decor.remove': {
      if (before.t !== 'decor') return null;
      const views = before.views;
      return {
        label: `removing the ${decorName(views[0]!.def)}`,
        inverse: views.map((v) => ({ t: 'decor.place', def: v.def, fx: v.fx, fz: v.fz, rot: v.rot })),
        intact: () => true,
      };
    }
    case 'road.paint': {
      if (before.t !== 'tiles') return null;
      const value = ROAD_VALUE[cmd.kind];
      const changed = cmd.tiles.filter((_, i) => before.values[i] !== value);
      const values = cmd.tiles.map((_, i) => before.values[i]!).filter((v) => v !== value);
      if (!changed.length) return null;
      const inverse: Command[] = [];
      const cleared = changed.filter((_, i) => values[i] === 0);
      if (cleared.length) inverse.push({ t: 'road.remove', tiles: cleared });
      for (const [v, tiles] of groupBy(changed, values, (v) => v === 0)) {
        const kind = KIND_OF_VALUE.get(v);
        if (kind) inverse.push({ t: 'road.paint', kind, tiles });
      }
      return {
        label: `the ${cmd.kind}`,
        inverse,
        intact: (mm) => changed.every(([x, z]) => mm.road(x, z) === value),
      };
    }
    case 'road.remove': {
      if (before.t !== 'tiles') return null;
      const groups = groupBy(cmd.tiles, before.values, (v) => v === 0);
      const inverse: Command[] = [];
      for (const [v, tiles] of groups) {
        const kind = KIND_OF_VALUE.get(v);
        if (kind) inverse.push({ t: 'road.paint', kind, tiles });
      }
      if (!inverse.length) return null;
      const removed = [...groups.values()].flat();
      return {
        label: 'clearing the road',
        inverse,
        intact: (mm) => removed.every(([x, z]) => mm.road(x, z) === 0),
      };
    }
    case 'tree.plant':
      return {
        label: 'the tree',
        inverse: [{ t: 'tree.remove', tiles: [[cmd.x, cmd.z]] }],
        intact: (mm) => mm.tree(cmd.x, cmd.z) !== 0,
      };
    case 'tree.remove': {
      if (before.t !== 'tiles') return null;
      const inverse: Command[] = [];
      const felled: [number, number][] = [];
      cmd.tiles.forEach(([x, z], i) => {
        const v = before.values[i]!;
        const species = content.trees.find((t) => t.species === treeSpecies(v));
        if (!v || !species) return;
        felled.push([x, z]);
        inverse.push({ t: 'tree.plant', species: species.id as 'oak' | 'birch' | 'pine', x, z });
      });
      if (!inverse.length) return null;
      return {
        label: felled.length === 1 ? 'felling the tree (it comes back as a sapling)' : 'felling the trees',
        inverse,
        intact: (mm) => felled.every(([x, z]) => mm.tree(x, z) === 0),
      };
    }
    case 'note.pin': {
      const n = [...m.notes.values()].find(
        (v) => change.added.includes(`note:${v.id}`) && v.x === cmd.x && v.z === cmd.z && v.by === seat,
      );
      if (!n) return null;
      return {
        label: 'the note',
        inverse: [{ t: 'note.remove', id: n.id }],
        intact: (mm) => mm.notes.has(n.id),
      };
    }
    case 'note.remove': {
      if (before.t !== 'note') return null;
      return {
        label: 'removing the note',
        inverse: [{ t: 'note.pin', x: before.x, z: before.z, text: before.text }],
        intact: () => true,
      };
    }
    case 'field.paint': {
      if (before.t !== 'tiles') return null;
      const fresh = cmd.tiles.filter((_, i) => before.values[i] !== cmd.farm);
      const prev = cmd.tiles.map((_, i) => before.values[i]!).filter((v) => v !== cmd.farm);
      if (!fresh.length) return null;
      const inverse: Command[] = [];
      const cleared = fresh.filter((_, i) => prev[i] === 0);
      if (cleared.length) inverse.push({ t: 'field.remove', tiles: cleared });
      for (const [farm, tiles] of groupBy(fresh, prev, (v) => v === 0)) {
        inverse.push({ t: 'field.paint', farm, tiles });
      }
      return {
        label: 'the field',
        inverse,
        intact: (mm) => fresh.every(([x, z]) => fieldOwner(mm, x, z) === cmd.farm),
      };
    }
    case 'field.remove': {
      if (before.t !== 'tiles') return null;
      const groups = groupBy(cmd.tiles, before.values, (v) => v === 0);
      if (!groups.size) return null;
      const removed = [...groups.values()].flat();
      return {
        label: 'clearing the field',
        inverse: [...groups].map(([farm, tiles]) => ({ t: 'field.paint', farm, tiles }) as Command),
        intact: (mm) => removed.every(([x, z]) => fieldOwner(mm, x, z) === 0),
      };
    }
    case 'build.customize': {
      if (before.t !== 'custom') return null;
      const set = cmd.custom as Record<string, unknown>;
      return {
        label: `the new look for the ${buildingName(m.buildings.get(cmd.id)?.def ?? '')}`,
        inverse: [{ t: 'build.customize', id: cmd.id, custom: before.values }],
        intact: (mm) => {
          const b = mm.buildings.get(cmd.id);
          return !!b && Object.keys(set).every((k) => sameValue(b.custom?.[k], set[k]));
        },
      };
    }
    case 'build.setPriority': {
      if (before.t !== 'flag') return null;
      return {
        label: cmd.priority ? 'rushing the site' : 'easing off the site',
        inverse: [{ t: 'build.setPriority', id: cmd.id, priority: before.value }],
        intact: (mm) => mm.buildings.get(cmd.id)?.rt?.construction?.priority === cmd.priority,
      };
    }
    case 'build.setPaused': {
      if (before.t !== 'flag') return null;
      return {
        label: cmd.paused ? 'the pause' : 'the restart',
        inverse: [{ t: 'build.setPaused', id: cmd.id, paused: before.value }],
        intact: (mm) => (mm.buildings.get(cmd.id)?.rt?.paused ?? false) === cmd.paused,
      };
    }
    case 'ledger.setForSale': {
      if (before.t !== 'flag') return null;
      return {
        label: cmd.forSale ? 'putting it up for sale' : 'taking it off sale',
        inverse: [{ t: 'ledger.setForSale', good: cmd.good, forSale: before.value }],
        intact: (mm) =>
          (mm.stocks.value?.lines.find((l) => l.good === cmd.good)?.forSale ?? cmd.forSale) === cmd.forSale,
      };
    }
    default:
      return null;
  }
}

export type UndoOutcome =
  { ok: true; label: string; seqs: number[] } | { ok: false; reason: RejectReason | 'EMPTY' };

/**
 * One seat's undo stack. Feed it every submitted command (`submitted`), every turn from the room
 * (`sawTurn`) and every mirror change (`observe`); `undo` submits the latest inverse.
 */
export class UndoStack {
  private readonly entries: UndoEntry[] = [];
  private pending: Pending[] = [];
  /** Seqs of inverse commands in flight, so their rejections read as undo trouble. */
  readonly undoSeqs = new Set<number>();
  /** How many entries can be undone, for the UI. */
  readonly size = signal(0);

  constructor(
    private readonly seat: SeatId,
    private readonly depth = UNDO_DEPTH,
  ) {}

  /** Call just before submitting `cmd`; returns a token for `submitted`, or null when not undoable. */
  prepare(cmd: Command, m: Mirror): Before | null {
    return capture(cmd, m);
  }

  submitted(seq: number, cmd: Command, before: Before, lastTurn: number): void {
    if (seq < 0) return;
    this.pending.push({ seq, cmd, before, turn: 0, since: lastTurn });
  }

  /** A turn from the room, before the worker runs it: notes which turn carried each command. */
  sawTurn(turn: Turn): void {
    if (!this.pending.length) return;
    for (const c of turn.cmds) {
      if (c.seat !== this.seat) continue;
      const p = this.pending.find((x) => x.seq === c.seq);
      if (p && !p.turn) p.turn = turn.t;
    }
  }

  /** A mirror update: settles commands whose turn has run, accepted or rejected. */
  observe(change: MirrorChange, m: Mirror): void {
    const t = m.lastTurn.value;
    for (const r of change.rejections) if (r.seat === this.seat) this.undoSeqs.delete(r.seq);
    if (!this.pending.length) return;
    const rejected = new Set(change.rejections.filter((r) => r.seat === this.seat).map((r) => r.seq));
    const keep: Pending[] = [];
    for (const p of this.pending) {
      if (rejected.has(p.seq)) continue;
      if (!p.turn || p.turn > t) {
        if (t - p.since < STALE_TURNS) keep.push(p);
        continue;
      }
      const entry = inverseOf(p, m, change, this.seat);
      if (entry) this.push(entry);
    }
    this.pending = keep;
  }

  private push(entry: UndoEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.depth) this.entries.splice(0, this.entries.length - this.depth);
    this.size.value = this.entries.length;
  }

  /** Undoes the latest entry through `submit` (which must not record it again). */
  undo(m: Mirror, submit: (cmd: Command) => number): UndoOutcome {
    const entry = this.entries.pop();
    this.size.value = this.entries.length;
    if (!entry) return { ok: false, reason: 'EMPTY' };
    if (!entry.intact(m)) return { ok: false, reason: 'CHANGED' };
    const seqs = entry.inverse.map((cmd) => submit(cmd));
    for (const s of seqs) if (s >= 0) this.undoSeqs.add(s);
    return { ok: true, label: entry.label, seqs };
  }

  /** Forget everything (a resync starts the world over). */
  clear(): void {
    this.entries.length = 0;
    this.pending = [];
    this.undoSeqs.clear();
    this.size.value = 0;
  }

  /** For tests: the labels on the stack, oldest first. */
  labels(): string[] {
    return this.entries.map((e) => e.label);
  }
}

export type { Before as UndoBefore };

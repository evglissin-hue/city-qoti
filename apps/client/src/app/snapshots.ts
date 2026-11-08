// C5F: Chronicle snapshots and photo mode on the client. When a notable Chronicle entry arrives
// (MirrorChange.snapshots), the lowest connected seat's client takes a small picture with the
// renderer's `capture` (C5E) and uploads it keyed by the entry's id; the first write wins, so the
// entry gets one picture whichever seat sent it. The other seat fetches it a little later. Pictures
// never enter sim state, and a `.qoti` export leaves them out (I3).
//
// C5X part 2: C5E's renderer has `capture` and `photo`, so C5F's stand-ins (a crop of the canvas as
// drawn, photo mode that only hid the interface) are gone; with no renderer there is no picture.
import type { ChronicleSnapshot, EntityId } from '@qoti/sim';
import { snapshotStore, type SnapshotStore } from '../net/images';
import type { RenderApi } from '../render/api';
import type { MirrorChange } from '../state/mirror';
import type { UiState } from '../ui/state';

/** What C5E adds to the renderer for photo mode (all optional until it lands). */
export interface PhotoApi {
  setPhoto?(on: boolean): void;
  setDepthOfField?(amount: number): void;
  /** An hour for the picture's light only (the sim's clock never moves), or null for now. */
  setTimeOfDay?(hour: number | null): void;
  savePng?(): Promise<Blob>;
}

/** The renderer as C5F reads it: RenderApi plus C5E's photo mode and capture, when present. */
export type SeasonRender = RenderApi & {
  photo?: PhotoApi;
  capture?(opts: { focus: [number, number]; radius: number; size: [number, number] }): Promise<Blob | null>;
};

/** A thumbnail's size, the Chronicle's column width at 2x. */
export const SNAPSHOT_SIZE: [number, number] = [320, 200];
/** When the other seat looks for the picture, ms after the entry arrives. */
const FETCH_AFTER = [4000, 15000, 45000];

interface SnapshotSession {
  ui: UiState;
  render: RenderApi | null;
  seat: number;
  target: { valleyId: string; token: string; mode: 'online' | 'solo' };
  mirror: { seats: { value: { seat: number; connected: boolean }[] } };
}

const stores = new WeakMap<object, SnapshotStore>();

function storeFor(s: SnapshotSession): SnapshotStore {
  let st = stores.get(s);
  if (!st) {
    st = snapshotStore(s.target);
    stores.set(s, st);
  }
  return st;
}

/** For tests: use this store for the session. */
export function setSnapshotStore(s: object, store: SnapshotStore): void {
  stores.set(s, store);
}

export function photoApi(s: { render: RenderApi | null }): PhotoApi | null {
  return (s.render as SeasonRender | null)?.photo ?? null;
}

/** Is this client the one that takes the pictures (the lowest connected seat)? */
export function isPhotographer(s: SnapshotSession): boolean {
  const on = s.mirror.seats.value.filter((x) => x.connected).map((x) => x.seat);
  return (on.length ? Math.min(...on) : s.seat) === s.seat;
}

async function capture(s: SnapshotSession, snap: ChronicleSnapshot): Promise<Blob | null> {
  const r = s.render as SeasonRender | null;
  return r?.capture ? r.capture({ focus: snap.focus, radius: snap.radius, size: SNAPSHOT_SIZE }) : null;
}

function remember(ui: UiState, entry: EntityId, blob: Blob): void {
  if (ui.snapshots.value.has(entry) || typeof URL.createObjectURL !== 'function') return;
  const next = new Map(ui.snapshots.value);
  next.set(entry, URL.createObjectURL(blob));
  ui.snapshots.value = next;
}

/** Fetches an entry's picture into the UI. True when found. */
export async function fetchSnapshot(s: SnapshotSession, entry: EntityId): Promise<boolean> {
  if (s.ui.snapshots.value.has(entry)) return true;
  try {
    const blob = await storeFor(s).get(entry);
    if (blob) remember(s.ui, entry, blob);
    return !!blob;
  } catch {
    return false;
  }
}

/** The pictures this valley already has, on joining. */
export async function loadSnapshots(s: SnapshotSession): Promise<void> {
  try {
    const list = await storeFor(s).list();
    for (const entry of list.slice(-40)) await fetchSnapshot(s, entry);
  } catch {
    // No pictures is fine: the Chronicle reads as well without them.
  }
}

/** Takes and uploads (or waits for) the pictures of the notable entries in an update. */
export function snapshotsAfterUpdate(s: SnapshotSession, change: MirrorChange): void {
  for (const { id, snapshot } of change.snapshots) {
    if (isPhotographer(s)) {
      void (async () => {
        try {
          const blob = await capture(s, snapshot);
          if (!blob) return;
          await storeFor(s).put(id, blob);
          // Whoever won the race, show the stored one.
          if (!(await fetchSnapshot(s, id))) remember(s.ui, id, blob);
        } catch {
          // A missed picture is a shame, never a problem.
        }
      })();
    } else {
      for (const ms of FETCH_AFTER) setTimeout(() => void fetchSnapshot(s, id), ms);
    }
  }
}

/** Photo mode: tells the renderer, and saves the picture as a PNG download. */
export async function savePhoto(s: SnapshotSession & { mirror: unknown }): Promise<void> {
  const api = photoApi(s);
  const blob = api?.savePng ? await api.savePng() : null;
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `qoti-photo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

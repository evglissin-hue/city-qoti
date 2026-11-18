// V4B: the books' pictures (17-presentation.md, Storybook pictures; docs/build/v4-wave-notes.md, The
// pictures seam). Where a page's picture should look comes from shared state only (a Chronicle
// entry's snapshot focus, a Pattern Book page's site, a Town Book page's place, the village's heart
// for a season card); the picture is the renderer's `capture({ style: 'ink' })` at the slot's size,
// taken once and kept as an object URL. Nothing is captured until a slot is shown and asks: a book
// that is never opened costs nothing, and the renderer takes every capture at rest.
//
// The seam: R3D's `ui/pictures.ts` (`PictureRef`, `pictureFor`, `setPictureSource`) is not on V4's
// branches yet. Whichever of R3X and V4X lands second deletes the structural copy of `PictureRef`
// below and makes the one call at startup: `setPictureSource(inkPictureSource(session))`.
import { useEffect, useState } from 'preact/hooks';
import type { ChronicleEntryView, PatternView, PlaceView } from '@qoti/sim';
import type { RenderApi } from '../render/api';
import type { SeasonRender } from './snapshots';

/** R3D's `PictureRef` (ui/pictures.ts on cycle/r3x-integration), copied structurally until the wiring. */
export interface PictureRef {
  book: 'townBook' | 'patternBook' | 'chronicle';
  /** A Town Book page id, a pattern id, or a Chronicle entry id, as a string. */
  id: string;
}

/** A Town Book or Pattern Book slot is 240 x 180 CSS px: the picture is taken at twice that. */
export const SLOT_SIZE: [number, number] = [480, 360];
/** The printed storybook (80 x 60 mm, 60 x 45 mm): at least 1600 x 1200 px. */
export const PRINT_SIZE: [number, number] = [1600, 1200];

/** Where a picture looks: a point in tiles and how many tiles about it the picture holds. */
export interface PictureAim {
  focus: [number, number];
  radius: number;
}

/** The shared state a picture's aim is read from (the Mirror's parts, structurally). */
export interface PictureMirror {
  size: number;
  chronicle: { value: readonly ChronicleEntryView[] };
  patterns: ReadonlyMap<string, PatternView>;
  places: ReadonlyMap<string, PlaceView>;
  buildings: ReadonlyMap<unknown, { x: number; z: number }>;
  meta: { startArea: readonly [number, number, number, number] };
  /** R3C's Town Book, once R3 lands on the Mirror (absent until then). */
  townBook?: { value: { pages: readonly { id: number; place: string }[] } | null | undefined };
}

export interface PictureSession {
  render: RenderApi | null;
  mirror: PictureMirror;
}

/** The aim that frames a set of tiles (index z * size + x), with a margin. */
export function aimAtTiles(tiles: readonly number[], size: number, least = 10): PictureAim | null {
  if (!tiles.length) return null;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const t of tiles) {
    const x = t % size;
    const z = Math.floor(t / size);
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x + 1);
    z1 = Math.max(z1, z + 1);
  }
  const radius = Math.max(least, Math.max(x1 - x0, z1 - z0) / 2 + 5);
  return { focus: [(x0 + x1) / 2, (z0 + z1) / 2], radius };
}

/** Where the picture for a book's page or entry looks, from shared state; null when it has no place. */
export function aimFor(mirror: PictureMirror, ref: PictureRef): PictureAim | null {
  if (ref.book === 'chronicle') {
    const entry = mirror.chronicle.value.find((e) => String(e.id) === ref.id);
    return entry?.snapshot ? { focus: entry.snapshot.focus, radius: entry.snapshot.radius } : null;
  }
  if (ref.book === 'patternBook') {
    const view = mirror.patterns.get(ref.id);
    const site = view?.discovered ? view.sites[0] : undefined;
    if (!site) return null;
    return aimAtTiles(site.tiles, mirror.size) ?? { focus: [site.x + 0.5, site.z + 0.5], radius: 10 };
  }
  const page = mirror.townBook?.value?.pages.find((p) => String(p.id) === ref.id);
  const place = page ? mirror.places.get(page.place) : undefined;
  if (!place) return null;
  return aimAtTiles(place.tiles.length ? place.tiles : [place.tile], mirror.size);
}

/** The village's heart, for a season card: the middle of what is built, holding most of it. */
export function heartAim(mirror: PictureMirror): PictureAim {
  const [sx0, sz0, sx1, sz1] = mirror.meta.startArea;
  let box = [sx0, sz0, sx1 + 1, sz1 + 1];
  let n = 0;
  let cx = 0;
  let cz = 0;
  for (const b of mirror.buildings.values()) {
    box = [Math.min(box[0]!, b.x), Math.min(box[1]!, b.z), Math.max(box[2]!, b.x), Math.max(box[3]!, b.z)];
    cx += b.x;
    cz += b.z;
    n++;
  }
  // The middle of the buildings, not of their box: a lone farm far out never pulls the picture away.
  const focus: [number, number] = n
    ? [cx / n + 1, cz / n + 1]
    : [(box[0]! + box[2]!) / 2, (box[1]! + box[3]!) / 2];
  const half = Math.max(box[2]! - box[0]!, box[3]! - box[1]!) / 2;
  return { focus, radius: Math.min(30, Math.max(14, half * 0.6)) };
}

/** A session's ink pictures, kept: one capture per page and size, ever. */
export class InkAlbum {
  private readonly kept = new Map<string, Promise<string | null>>();
  /** Captures asked of the renderer (tests: none until a slot asks). */
  asked = 0;

  constructor(private readonly render: () => RenderApi | null) {}

  /** The picture `key` at `size`, taken now (at the renderer's next rest) or kept from before. */
  picture(key: string, aim: PictureAim, size: [number, number]): Promise<string | null> {
    const id = `${key}@${size[0]}x${size[1]}`;
    const have = this.kept.get(id);
    if (have) return have;
    const r = this.render() as SeasonRender | null;
    if (!r?.capture || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
    this.asked++;
    const p = r
      .capture({ focus: aim.focus, radius: aim.radius, size, style: 'ink' })
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    this.kept.set(id, p);
    // A miss is not kept: the next time the slot is shown it asks again.
    void p.then((url) => url === null && this.kept.delete(id));
    return p;
  }
}

const albums = new WeakMap<object, InkAlbum>();

/** The session's album (made on first use). */
export function inkAlbum(session: PictureSession): InkAlbum {
  let a = albums.get(session);
  if (!a) {
    a = new InkAlbum(() => session.render);
    albums.set(session, a);
  }
  return a;
}

/**
 * The picture source for R3D's seam: a book's page or entry in ink, at the slot's size (480 x 360),
 * or at print size (1600 x 1200) when asked with `{ print: true }` (the seam's `pictureFor` takes
 * no size; see the PR). Null when the page has no place yet or there is no renderer.
 */
export function inkPictureSource(
  session: PictureSession,
): (ref: PictureRef, opts?: { print?: boolean }) => Promise<string | null> {
  return (ref, opts) => {
    const aim = aimFor(session.mirror, ref);
    if (!aim) return Promise.resolve(null);
    return inkAlbum(session).picture(`${ref.book}:${ref.id}`, aim, opts?.print ? PRINT_SIZE : SLOT_SIZE);
  };
}

/** A season card's picture: the village's heart in ink, once per season. */
export function seasonPicture(session: PictureSession, season: number, year: number): Promise<string | null> {
  return inkAlbum(session).picture(`season:${year}:${season}`, heartAim(session.mirror), SLOT_SIZE);
}

/**
 * A slot's picture while it is shown: asks once when mounted (or when `key` changes) and never
 * after unmounting. Null until the picture comes (the slot shows its drawing meanwhile).
 */
export function useInkPicture(key: string | null, ask: () => Promise<string | null>): string | null {
  const [url, setUrl] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    void ask().then((u) => {
      if (live && u) setUrl({ key, url: u });
    });
    return () => {
      live = false;
    };
    // `ask` is rebuilt each render; the key says what it asks for.
  }, [key]);
  return url && url.key === key ? url.url : null;
}

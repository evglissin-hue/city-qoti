// The picture seam (R3.0): one place the books ask for a picture of the valley, and one place a
// source of pictures plugs in. R3D's Town Book pages and R3G's printed storybook ask `pictureFor`;
// V4B's ink-and-wash captures register with `setPictureSource` from their own module (one line at
// startup), so neither track edits the other's files. Whichever of R3X and V4X lands second makes
// that one call (docs/build/r3-wave-notes.md, The picture seam).
//
// Slots are landscape 4:3: a Town Book or Pattern Book page shows 240 x 180 CSS px; in the printed
// storybook a Chronicle entry's picture is half the text width (80 x 60 mm) and a book page's 60 x 45
// mm. A source should return at least 1600 x 1200 px for print. With no source, or when it has no
// picture, a slot falls back as the asking panel decides (a Chronicle snapshot, else an empty frame
// with the page's name).

/** What a picture is of: a book and the id of its page or entry there. */
export interface PictureRef {
  book: 'townBook' | 'patternBook' | 'chronicle';
  /** A Town Book page id, a pattern id, or a Chronicle entry id, as a string. */
  id: string;
}

/** A source of pictures: an image URL (an object URL or a data URL), or null when it has none. */
export type PictureSource = (ref: PictureRef) => Promise<string | null>;

let source: PictureSource | null = null;

/** Plugs in the source of pictures (V4B), or unplugs it with null. The last one set wins. */
export function setPictureSource(next: PictureSource | null): void {
  source = next;
}

/** The picture for a page or entry, or null when no source has one. Never throws. */
export async function pictureFor(ref: PictureRef): Promise<string | null> {
  if (!source) return null;
  try {
    return await source(ref);
  } catch {
    return null;
  }
}

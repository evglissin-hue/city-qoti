// V3.0: the endpaper map's worker (render/endpaper.ts). It draws the valley's inked map on an
// OffscreenCanvas from the compact copy the main thread posts, and returns it as an ImageBitmap, so
// no drawing ever lands on the main thread. V3D: the drawing itself is endpaperDraw.ts; this file
// handles the messages, loads Alegreya once (a worker has no page fonts) and times the drawing.
// Where OffscreenCanvas is missing it replies with no bitmap and the map stays parchment (the
// Safari decision: no main-thread fallback, see the PR).
import alegreyaItalic from '@fontsource/alegreya/files/alegreya-latin-400-italic.woff2?url';
import alegreyaBold from '@fontsource/alegreya/files/alegreya-latin-700-normal.woff2?url';
import type { EndpaperReply, EndpaperRequest } from '../render/endpaper';
import { drawMap, nightPixels, nightSize, type DrawOpts } from './endpaperDraw';

interface WorkerScope {
  onmessage: ((e: MessageEvent<EndpaperRequest>) => void) | null;
  postMessage(msg: EndpaperReply, transfer?: Transferable[]): void;
  fonts?: { add(f: unknown): void };
}

const scope = self as unknown as WorkerScope;

let fontsReady: Promise<void> | null = null;

/** Loads Alegreya into the worker once; a failed load leaves the serif fallback in the font stack. */
export function loadFonts(): Promise<void> {
  fontsReady ??= (async () => {
    try {
      if (typeof FontFace === 'undefined' || !scope.fonts) return;
      const faces = [
        new FontFace('Alegreya', `url(${alegreyaItalic})`, { style: 'italic', weight: '400' }),
        new FontFace('Alegreya', `url(${alegreyaBold})`, { style: 'normal', weight: '700' }),
      ];
      await Promise.all(faces.map((f) => f.load()));
      for (const f of faces) scope.fonts.add(f);
    } catch {
      // Georgia or the default serif will do.
    }
  })();
  return fontsReady;
}

/** Draws one map. Returns null where there is no OffscreenCanvas. */
export function drawEndpaper(req: EndpaperRequest, opts: DrawOpts = {}): ImageBitmap | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(req.size, req.size);
  const g = canvas.getContext('2d');
  if (!g) return null;
  drawMap(g, req.input, req.size, opts);
  return canvas.transferToImageBitmap();
}

/**
 * V4B: the night layer (lamplight pools) for a request, as a bitmap made straight from its pixels:
 * no canvas, so it never waits on the map's drawing. Null where `createImageBitmap` is missing.
 */
export async function drawEndpaperNight(req: EndpaperRequest): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap === 'undefined' || typeof ImageData === 'undefined') return null;
  const n = nightSize(req.size);
  return createImageBitmap(new ImageData(nightPixels(req.input, n), n, n));
}

const warmed = new Set<string>();

/**
 * Once per worker and map size, before the first timed drawing: draws the valley small (256 texels,
 * so every drawing path is compiled) and a blank valley with one tree of each kind at full size (the
 * tree glyph atlas and the paper grain for that size), outside the timing, as the fonts are. The first map is asked 20 tiles before it shows (ENDPAPER_LOOKAHEAD), so the
 * player never waits on this.
 */
function warm(req: EndpaperRequest): void {
  const key = `${req.size}:${req.input.tiles}`;
  if (warmed.has(key) || typeof OffscreenCanvas === 'undefined') return;
  warmed.add(key);
  drawEndpaper({ ...req, size: 256 })?.close();
  const n = req.input.tiles * req.input.tiles;
  const woods = new Uint8Array(n);
  for (let s = 1; s <= 3; s++) for (let st = 0; st < 4; st++) woods[s * 4 + st] = s * 8 + st;
  drawEndpaper({
    ...req,
    input: {
      ...req.input,
      heights: new Uint8Array(n),
      water: new Uint8Array(n),
      woods,
      fields: new Uint8Array(n),
      roads: new Uint8Array(n),
      terrain: new Uint8Array(n),
      roofs: [],
      plans: [],
      inks: {},
    },
  })?.close();
}

scope.onmessage = async (e) => {
  const req = e.data;
  if (req.type !== 'draw') return;
  await loadFonts();
  warm(req);
  const t0 = performance.now();
  const bitmap = drawEndpaper(req);
  // V4B: the night layer beside it, inside the same budget (`ms` counts both).
  const t1 = performance.now();
  const night = bitmap ? await drawEndpaperNight(req) : null;
  const t2 = performance.now();
  const reply: EndpaperReply = { type: 'drawn', id: req.id, bitmap, ms: t2 - t0, night, nightMs: t2 - t1 };
  scope.postMessage(
    reply,
    [bitmap, night].filter((b): b is ImageBitmap => b !== null),
  );
};

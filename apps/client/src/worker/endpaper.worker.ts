// V3.0: the endpaper map's worker (render/endpaper.ts). It draws the valley's inked map on an
// OffscreenCanvas from the compact copy the main thread posts, and returns it as an ImageBitmap, so
// no drawing ever lands on the main thread. V3D: the drawing itself is endpaperDraw.ts; this file
// handles the messages, loads Alegreya once (a worker has no page fonts) and times the drawing.
// Where OffscreenCanvas is missing it replies with no bitmap and the map stays parchment (the
// Safari decision: no main-thread fallback, see the PR).
import alegreyaItalic from '@fontsource/alegreya/files/alegreya-latin-400-italic.woff2?url';
import alegreyaBold from '@fontsource/alegreya/files/alegreya-latin-700-normal.woff2?url';
import type { EndpaperReply, EndpaperRequest } from '../render/endpaper';
import { drawMap, type DrawOpts } from './endpaperDraw';

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

scope.onmessage = async (e) => {
  const req = e.data;
  if (req.type !== 'draw') return;
  await loadFonts();
  const t0 = performance.now();
  const bitmap = drawEndpaper(req);
  const reply: EndpaperReply = { type: 'drawn', id: req.id, bitmap, ms: performance.now() - t0 };
  scope.postMessage(reply, bitmap ? [bitmap] : []);
};

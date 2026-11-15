// V3.0: the endpaper map's worker (render/endpaper.ts). It draws the valley's inked map on an
// OffscreenCanvas from the compact copy the main thread posts, and returns it as an ImageBitmap, so
// no drawing ever lands on the main thread. V3.0's stub lays plain parchment; V3D draws the map
// (17-presentation.md, The long view). Where OffscreenCanvas is missing it replies with no bitmap
// and the map stays parchment (Safari's fallback is V3D's to decide).
import type { EndpaperReply, EndpaperRequest } from '../render/endpaper';
import { PARCHMENT } from '../render/endpaper';

interface WorkerScope {
  onmessage: ((e: MessageEvent<EndpaperRequest>) => void) | null;
  postMessage(msg: EndpaperReply, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

/** Draws one map: parchment for now. Returns null where there is no OffscreenCanvas. */
export function drawEndpaper(req: EndpaperRequest): ImageBitmap | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(req.size, req.size);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = `#${PARCHMENT.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, req.size, req.size);
  return canvas.transferToImageBitmap();
}

scope.onmessage = (e) => {
  const req = e.data;
  if (req.type !== 'draw') return;
  const t0 = performance.now();
  const bitmap = drawEndpaper(req);
  const reply: EndpaperReply = { type: 'drawn', id: req.id, bitmap, ms: performance.now() - t0 };
  scope.postMessage(reply, bitmap ? [bitmap] : []);
};

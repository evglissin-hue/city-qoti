// The audio render worker (C5G): synthesizes sounds off the main thread, so a 200 ms crowd or a
// fresh piano note never costs the frame. Takes a RenderJob, returns its samples (transferred).
import { jobKey, renderJob, type RenderJob } from './jobs';

self.onmessage = (e: MessageEvent<RenderJob>) => {
  const data = renderJob(e.data);
  (self as unknown as Worker).postMessage({ key: jobKey(e.data), data }, [data.buffer]);
};

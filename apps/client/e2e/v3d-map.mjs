// V3D: draws the endpaper map alone, in a real worker, from a live valley; prints the worker's ms
// for seven drawings in a row (the first is the one a player waits on) and saves the last as a PNG.
// Needs the client dev server on QOTI_CLIENT_PORT (5234).
//   node apps/client/e2e/v3d-map.mjs <grown|fresh|another fixture> <size> <out.png>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [fixture = 'grown', size = '2048', out = 'map.png'] = process.argv.slice(2);
const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
const fx = fixture === 'fresh' ? '' : `&fixture=${fixture}`;
await page.goto(`http://localhost:${process.env.QOTI_CLIENT_PORT ?? 5234}/?debug${fx}&clean&quality=low`);
if (fixture === 'fresh') {
  await page.getByTestId('new-solo').click({ timeout: 240000 });
  await page.getByTestId('found-valley').click();
}
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
const res = await page.evaluate(async (sz) => {
  const ep = await import('/src/render/endpaper.ts');
  const mirror = window.__qoti.renderer().mirror;
  const input = ep.endpaperInput(mirror);
  const w = new Worker(new URL('/src/worker/endpaper.worker.ts', location.href), { type: 'module' });
  const times = [];
  const nightTimes = [];
  let bitmap = null;
  for (let i = 0; i < 7; i++) {
    const r = await new Promise((done) => {
      w.onmessage = (e) => done(e.data);
      w.postMessage({ type: 'draw', id: i + 1, size: sz, input });
    });
    times.push(Math.round(r.ms));
    // V4B: the night layer is drawn in the same message (its ms is inside r.ms).
    nightTimes.push(Math.round((r.nightMs ?? 0) * 10) / 10);
    bitmap = r.bitmap;
  }
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  c.getContext('2d').drawImage(bitmap, 0, 0);
  return {
    times,
    nightTimes,
    lamps: (input.lamps?.length ?? 0) / 3,
    url: c.toDataURL('image/png'),
    roofs: input.roofs.length,
  };
}, Number(size));
writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
console.log(
  out,
  'worker ms',
  res.times,
  'of which night',
  res.nightTimes,
  'roofs',
  res.roofs,
  'lamps',
  res.lamps,
);
await browser.close();

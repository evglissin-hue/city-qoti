// V4B: ink-and-wash pictures of the grown village (a script, not a spec), for looking at the ink
// pass: the renderer's `capture({ style: 'ink' })` at the books' sizes, with the plain picture of
// the same place beside it. Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT, 5262):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4b-ink.mjs [stage]
// Saves <out>/v4b-ink-<stage>-<shot>.png (QOTI_OUT, docs/build/screenshots by default). QOTI_SHOTS
// picks shots by name (comma separated); QOTI_QUALITY (medium).
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5262);
const base = `http://localhost:${clientPort}`;
const [stage = 'a'] = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const only = process.env.QOTI_SHOTS ? process.env.QOTI_SHOTS.split(',') : null;
mkdirSync(out, { recursive: true });

// where: 'street' (the high street), 'center' (the village's middle); radius in tiles.
const SHOTS = [
  { name: 'slot-street-day', where: 'street', radius: 14, size: [480, 360], hour: 11 },
  { name: 'slot-village-day', where: 'center', radius: 32, size: [480, 360], hour: 11 },
  { name: 'slot-street-golden', where: 'street', radius: 14, size: [480, 360], hour: 18 },
  { name: 'slot-street-night', where: 'street', radius: 14, size: [480, 360], hour: 22.3 },
  { name: 'chronicle-street-day', where: 'street', radius: 18, size: [320, 200], hour: 11 },
  { name: 'print-street-day', where: 'street', radius: 14, size: [1600, 1200], hour: 11 },
  { name: 'plain-street-day', where: 'street', radius: 14, size: [480, 360], hour: 11, style: 'plain' },
];

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.route('**/api/**', (r) => r.abort());
await page.addInitScript(() => {
  const t = setInterval(() => {
    if (window.__qoti?.status?.() !== 'live') return;
    window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
    clearInterval(t);
  }, 5);
});
await page.goto(
  `${base}/?debug&fixture=grown&clean&fixedres&quality=${quality}&season=summer&day=3&weather=clear`,
);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
const info = await page.evaluate(() => window.__qoti.grownInfo());
console.log('grown', JSON.stringify(info));
const places = { street: info.street ?? info.center, center: info.center };

for (const shot of SHOTS) {
  if (only && !only.includes(shot.name)) continue;
  const [fx, fz] = places[shot.where];
  const t0 = Date.now();
  const res = await page.evaluate(
    async ({ fx, fz, shot }) => {
      const q = window.__qoti;
      q.setHour(shot.hour);
      q.focusTile(Math.floor(fx), Math.floor(fz), Math.max(30, shot.radius * 2.5));
      // Let the streamed chunks about the focus come in and the light settle.
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 12; i++) await frame();
      const r = q.renderer();
      const blob = await r.capture({
        focus: [fx, fz],
        radius: shot.radius,
        size: shot.size,
        style: shot.style ?? 'ink',
      });
      if (!blob) return null;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { b64: btoa(s), ms: r.captures.lastMs, waited: r.captures.waitedFrames };
    },
    { fx, fz, shot },
  );
  if (!res) {
    console.log(shot.name, 'no picture');
    continue;
  }
  const file = `${out}/v4b-ink-${stage}-${shot.name}.png`;
  writeFileSync(file, Buffer.from(res.b64, 'base64'));
  console.log(
    `${shot.name}: ${file} (capture ${res.ms.toFixed(0)} ms, waited ${res.waited} frames, wall ${Date.now() - t0} ms)`,
  );
}
await browser.close();

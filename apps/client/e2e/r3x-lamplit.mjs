// R3X lamps: the lamplit village, as the game itself draws it (a script, not a spec). Opens a valley
// file made by `packages/sim/scripts/r3x-chair-make.ts` (modes lampweek and lampday60), runs the sim on
// to 20:30 of the next day (so the 17:30 settling happens under the sim's own rules; no lamp is
// staged), and shoots the densest lantern street near the middle of the town from the game's default
// play camera (pitch 45 degrees, yaw 0.5, the 60 tiles the session opens at), 1366 x 768, scale 1,
// medium quality, the look pinned to clear weather (`&weather=clear`: the picture only; the sim keeps
// its own weather, which does not touch the lamps).
//
//   npx tsx packages/sim/scripts/r3x-chair-make.ts <snapDir> lampweek willow    (and lampday60 willow)
//   QOTI_CLIENT_PORT=5254 QOTI_RELAY_PORT=8864 npm run dev        (in another shell)
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5254 \
//     node apps/client/e2e/r3x-lamplit.mjs <valley.qoti> <shot name> [outDir]
// e.g. ... lampweek-willow.qoti before-week   ->  <outDir>/r3x-lamplit-before-week.png
// outDir defaults to docs/build/screenshots. It prints the lanterns standing in town, in view and lit
// at 20:30 (the Mirror's supplies view: a lamp counts as lit when its reach tick has passed).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const [file, name, outArg] = process.argv.slice(2);
if (!file || !name) throw new Error('usage: r3x-lamplit.mjs <valley.qoti> <shot name> [outDir]');
const base = `http://localhost:${process.env.QOTI_CLIENT_PORT ?? 5254}`;
const out = outArg ?? fileURLToPath(new URL('../../../docs/build/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const DISTANCE = 60;
const q = (page, fn, arg) => page.evaluate(fn, arg);

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());

const clearUi = () =>
  q(page, () => {
    for (const [n, v] of [
      ['festivalCard', null],
      ['raidCard', null],
      ['almanac', null],
      ['edition', null],
      ['chapter', false],
      ['letter', null],
      ['rankUp', null],
      ['storyLetter', null],
      ['seasonCard', null],
    ])
      try {
        window.__qoti.setUi(n, v);
      } catch {
        /* not a signal here */
      }
  });
const clock = () =>
  q(page, () => {
    const c = window.__qoti.clock();
    const m = Math.floor((((c.tick + 1200) % 4800) * 60) / 200);
    return { ...c, hour: Math.floor(m / 60), minute: m % 60 };
  });

await page.goto(`${base}/?debug&quality=medium&noguide&weather=clear`);
await page.evaluate(() => document.querySelector('details.title-options')?.setAttribute('open', ''));
await page.getByTestId('open-file').setInputFiles(file);
await page.getByTestId('open-imported-solo').click();
await page.waitForFunction(() => window.__qoti?.phase?.() === 'ready', null, { timeout: 120000 });
await q(page, () => window.__qoti.submit({ t: 'valley.setSettings', settings: { eveningLingers: false } }));
await q(page, () => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
await clearUi();

// On to 20:30 of the next day with the canvas hidden (the sim runs about ten times faster).
const c0 = await clock();
console.log('opened at', `day ${c0.day} ${c0.hour}:${String(c0.minute).padStart(2, '0')}`);
await page.evaluate(() => {
  const s = document.createElement('style');
  s.id = 'lamp-fast';
  s.textContent = 'canvas,.game-ui{display:none!important}';
  document.head.append(s);
});
// A tiny viewport too: the software renderer is what slows the sim down, and it draws by pixels.
await page.setViewportSize({ width: 240, height: 160 });
await q(page, () => window.__qoti.submit({ t: 'time.setSpeed', speed: 3 }));
for (let i = 0; i < 6000; i++) {
  await page.waitForTimeout(100);
  const c = await clock().catch(() => c0);
  const past = c.day !== c0.day || c.season !== c0.season || c.year !== c0.year;
  if (past && c.hour * 60 + c.minute >= 20 * 60 + 30) break;
  if (i % 100 === 0) {
    await clearUi();
    console.log('  ..', `day ${c.day} ${c.hour}:${String(c.minute).padStart(2, '0')}`);
  }
}
await q(page, () => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
await page.evaluate(() => document.getElementById('lamp-fast')?.remove());
await page.setViewportSize({ width: 1366, height: 768 });
await clearUi();
await page.waitForTimeout(500);
const c1 = await clock();
console.log('shooting at', `day ${c1.day} ${c1.hour}:${String(c1.minute).padStart(2, '0')}`, 'tick', c1.tick);

// Lanterns: all of them, the lit ones, and the densest street near the middle of the town.
const found = await q(page, () => {
  const t = window.__qoti;
  const m = t.mirror();
  const lamps = new Map((t.supplies()?.lamps ?? []).map((l) => [l.id, l.reach]));
  const tick = t.clock().tick;
  const lanterns = [...m.decor.values()]
    .filter((d) => d.def === 'lantern')
    .map((d) => ({ id: d.id, x: d.fx / 256, z: d.fz / 256 }));
  return {
    lanterns,
    lit: [...lamps].filter(([, r]) => r <= tick).map(([id]) => id),
    tick,
    listed: lamps.size,
  };
});
const L = found.lanterns;
// The town's middle: the mean of the lantern positions (the town's street is where they stand).
const cx = L.reduce((s, l) => s + l.x, 0) / L.length;
const cz = L.reduce((s, l) => s + l.z, 0) / L.length;
let best = null;
for (const l of L) {
  const near = L.filter((o) => Math.hypot(o.x - l.x, o.z - l.z) <= 7);
  const score = near.length - 0.1 * Math.hypot(l.x - cx, l.z - cz);
  if (!best || score > best.score) best = { score, near, at: l };
}
const fx = best.near.reduce((s, l) => s + l.x, 0) / best.near.length;
const fz = best.near.reduce((s, l) => s + l.z, 0) / best.near.length;
await q(page, ([x, z, d]) => window.__qoti.focusTile(Math.floor(x), Math.floor(z), d), [fx, fz, DISTANCE]);
await page.waitForTimeout(2500);
// In view: the lanterns whose screen spot lies inside the frame.
const view = await q(
  page,
  (ids) => {
    const t = window.__qoti;
    const m = t.mirror();
    let inView = 0;
    let litInView = 0;
    for (const [id, lit] of ids) {
      const d = m.decor.get(id);
      const p = d && t.screenOfFp(d.fx, d.fz);
      if (p && p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight) {
        inView++;
        if (lit) litInView++;
      }
    }
    return { inView, litInView };
  },
  found.lanterns.map((l) => [l.id, found.lit.includes(l.id)]),
);
console.log(
  `${name}: lanterns in town ${found.lanterns.length}, lit at 20:30 ${found.lit.length} (${Math.round((100 * found.lit.length) / Math.max(1, found.lanterns.length))}%), in view ${view.inView}, lit in view ${view.litInView}; supplies view lists ${found.listed} lamps; street focus (${fx.toFixed(1)}, ${fz.toFixed(1)}) with ${best.near.length} lanterns within 7 tiles`,
);
const file2 = `${out}/r3x-lamplit-${name}.png`;
await page.screenshot({ path: file2, timeout: 240000 });
console.log('shot', file2);
await browser.close();

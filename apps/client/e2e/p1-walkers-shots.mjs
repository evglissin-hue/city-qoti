// Screenshots and timing for walkers that keep out of each other's way (P1 item 8; not a spec).
//   PORT=8887 QOTI_CLIENT_PORT=5187 QOTI_RELAY_PORT=8887 npm run dev
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5187 node apps/client/e2e/p1-walkers-shots.mjs before|after
// Saves docs/build/screenshots/p1-walkers-<tag>-lane-N.png (the folk showcase lane) and
// p1-walkers-<tag>-crowd.png (a standing crowd), and prints the agents layer's CPU ms per frame
// with 300 synthetic residents.
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5187';
const tag = process.argv[2] ?? 'after';
const timingOnly = process.argv[3] === 'timing';
const out = 'docs/build/screenshots';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${port}/?debug&clean&quality=low&fixture=village&hour=11`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
await page.keyboard.press('Space');

const center = await page.evaluate(() => window.__qoti.folkShowcase().center);
const [cx, cz] = center;
if (!timingOnly) {
  await page.evaluate(
    ([x, z]) => {
      window.__qoti.synthResidents(13, { center: [x + 9, z + 1], radius: 1.1, anim: 0 });
    },
    [cx, cz],
  );
  await page.evaluate(([x, z]) => window.__qoti.look(x + 1, z + 5.5, 9, 0, 0), [cx, cz]);
  await page.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) {
    await page.screenshot({ path: `${out}/p1-walkers-${tag}-lane-${i}.png` });
    await page.waitForTimeout(900);
  }
  await page.evaluate(([x, z]) => window.__qoti.look(x + 9, z + 1, 6, 0, 0), [cx, cz]);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/p1-walkers-${tag}-crowd.png` });
}
// CPU time of the agents layer alone: 300 residents wandering, 300 calls of frame(dt).
await page.evaluate(([x, z]) => window.__qoti.synthResidents(300, { center: [x, z], radius: 14 }), [cx, cz]);
await page.waitForTimeout(4000);
const samples = [];
for (let i = 0; i < 15; i++) samples.push(await page.evaluate(() => window.__qoti.layerCpu('agents', 200)));
samples.sort((a, b) => a - b);
console.log(
  `agents layer CPU ms per frame (300 residents), 15 runs: min ${samples[0].toFixed(3)} median ${samples[7].toFixed(3)}`,
);
await browser.close();

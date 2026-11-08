// Gallery screenshots for art review (not a spec):
//   node apps/gallery/e2e/shots.mjs <baseUrl> <outDir> <name>=<query> [<name>=<query> ...]
// for example `c3d2-residents-day=scene=residents`. QOTI_CHROMIUM points at a preinstalled
// Chromium when Playwright's bundled one is missing. SHOT_SIZE=WxH changes the viewport.
import { chromium } from '@playwright/test';

const [base, out, ...shots] = process.argv.slice(2);
const [w, h] = (process.env.SHOT_SIZE ?? '1100x700').split('x').map(Number);
const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM && { executablePath: process.env.QOTI_CHROMIUM }),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
for (const shot of shots) {
  const i = shot.indexOf('=');
  const name = shot.slice(0, i);
  const query = shot.slice(i + 1);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.error(`${name}: ${m.text()}`));
  await page.goto(`${base}/?${query}`);
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 2500));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
  await page.close();
}
await browser.close();

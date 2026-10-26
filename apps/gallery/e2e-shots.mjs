// Scratch screenshot script for the gallery lineups (not a spec). Start the gallery first
// (npx vite --port 5185 in apps/gallery), then:
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/gallery/e2e-shots.mjs <outDir> <prefix>
import { chromium } from '@playwright/test';

const base = process.env.QOTI_GALLERY ?? 'http://localhost:5185';
const out = process.argv[2] ?? 'docs/build/screenshots';
const prefix = process.argv[3] ?? 'c3d1-gallery';
const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
for (const set of ['trees', 'nature']) {
  for (const [name, night] of [
    ['day', 0],
    ['night', 1],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await page.goto(`${base}/?set=${set}&spin=0&night=${night}`);
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${out}/${prefix}-${set}-${name}.png` });
    await page.close();
  }
}
await browser.close();

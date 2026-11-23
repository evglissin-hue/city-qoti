// P3D: the title's backdrop alone (the menu hidden by a style override), 1366 x 768, day and dusk,
// live at the start and after the drift, and the painted one (WebGL removed):
//   QOTI_CLIENT_PORT=5251 npx vite --config apps/client/vite.config.ts apps/client &
//   QOTI_CLIENT_PORT=5251 node apps/client/e2e/p3d-backdrop-shots.mjs
// QOTI_ONLY=live|painted narrows it; QOTI_DRIFT_S sets the wait for the second live shot (20).
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5251);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const only = process.env.QOTI_ONLY ?? '';
const driftS = Number(process.env.QOTI_DRIFT_S ?? 20);
const extra = process.env.QOTI_QUERY ?? '';
const HIDE = `.title-card, .title-menu, .title-screen > :not(.title-backdrop) { display: none !important; }`;

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function shoot(light, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  if (mode === 'painted') {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...a) {
        if (/webgl/.test(kind)) return null;
        return get.call(this, kind, ...a);
      };
    });
  }
  await page.goto(`http://localhost:${port}/?titleLight=${light}${extra}`);
  await page.addStyleTag({ content: HIDE });
  if (mode === 'live') {
    await page.waitForSelector('[data-backdrop=live]', { timeout: 90_000 });
    console.log(light, await page.getAttribute('.title-backdrop-live', 'data-aim'));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/p3d-backdrop-${light}-start.png` });
    await page.waitForTimeout(driftS * 1000);
    await page.screenshot({ path: `${out}/p3d-backdrop-${light}-drift.png` });
  } else {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/p3d-painted-${light}.png` });
  }
  await ctx.close();
}

for (const light of ['day', 'dusk']) {
  if (!only || only === 'live') await shoot(light, 'live');
  if (!only || only === 'painted') await shoot(light, 'painted');
}
await browser.close();

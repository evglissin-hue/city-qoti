// P3D: the title's backdrop alone (the menu hidden by a style override), by day and dusk:
//   QOTI_CLIENT_PORT=5251 npx vite --config apps/client/vite.config.ts apps/client &
//   QOTI_CLIENT_PORT=5251 node apps/client/e2e/p3d-backdrop-shots.mjs
// Modes (QOTI_MODE): `framing` (default) shoots layout a ({x: 0.17, y: 0}, a left column) and b
// ({x: 0, y: 0.06}, a top wordmark with a shelf) at 1366 x 768 into p3d-backdrop-<light>-<a|b>.png;
// `painted` shoots the painted valley (WebGL removed) into p3d-painted-<light>.png; `sweep` shoots
// the framing-free view at 0, 20 and 60 s at QOTI_SIZES (1250x680,1366x768,...) into QOTI_OUT.
// QOTI_LIGHTS=day,dusk narrows the lights.
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5251);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const mode = process.env.QOTI_MODE ?? 'framing';
const lights = (process.env.QOTI_LIGHTS ?? 'day,dusk').split(',');
const sizes = (process.env.QOTI_SIZES ?? '1366x768').split(',').map((s) => s.split('x').map(Number));
const FRAMINGS = { a: { x: 0.17, y: 0 }, b: { x: 0, y: 0.06 } };
const HIDE = `.title-card, .title-menu, .title-screen > :not(.title-backdrop) { display: none !important; }`;

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function open(light, [w, h], painted = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  if (painted) {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...a) {
        if (/webgl/.test(kind)) return null;
        return get.call(this, kind, ...a);
      };
    });
  }
  await page.goto(`http://localhost:${port}/?titleLight=${light}`);
  await page.addStyleTag({ content: HIDE });
  if (!painted) {
    await page.waitForSelector('[data-backdrop=live]', { timeout: 240_000 });
    console.log(light, await page.getAttribute('.title-backdrop-live', 'data-aim'));
  }
  return { ctx, page };
}

const setFraming = (page, f) =>
  page.evaluate(async (fr) => {
    const m = await import('/src/app/title/shared.ts');
    m.backdrop.current?.setFraming(fr);
  }, f);

for (const light of lights) {
  if (mode === 'painted') {
    const { ctx, page } = await open(light, [1366, 768], true);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/p3d-painted-${light}.png` });
    await ctx.close();
  } else if (mode === 'framing') {
    const { ctx, page } = await open(light, [1366, 768]);
    for (const [name, f] of Object.entries(FRAMINGS)) {
      await setFraming(page, f);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${out}/p3d-backdrop-${light}-${name}.png` });
    }
    await ctx.close();
  } else {
    for (const size of sizes) {
      const { ctx, page } = await open(light, size);
      let at = 0;
      for (const s of [0, 20, 60]) {
        await page.waitForTimeout((s - at) * 1000 + (s === 0 ? 2500 : 0));
        at = s;
        await page.screenshot({ path: `${out}/sweep-${light}-${size.join('x')}-${s}s.png` });
      }
      await ctx.close();
    }
  }
}
await browser.close();

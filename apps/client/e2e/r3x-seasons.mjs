// R3X: the ornamental cherry follows the year (a script, not a spec). Shoots the title backdrop in
// autumn (day 3, pinned with ?debug&season=autumn&day=3) by day and the grown village at a view where cherry trees stand near the woods, in autumn
// day 3, spring day 2, summer day 3 and winter day 3, at 11:00, 1366 x 768, scale 1.
//   (npm run build -w @qoti/client; cd apps/client && npx vite preview --port 4173)
//   QOTI_CLIENT_PORT=4173 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/r3x-seasons.mjs before|after [title|autumn|spring|summer|winter ...]
// Saves docs/build/screenshots/r3x-autumn-<stage>-<name>.png. QOTI_AT=x,z frames the village shots
// on a tile (default: the westmost cherry tree, which stands nearest the western woods);
// QOTI_DIST (22) and QOTI_PITCH (40) set the camera.
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 4173);
const base = `http://localhost:${port}`;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const [stage = 'after', ...only] = process.argv.slice(2);
const SEASONS = { autumn: [2, 3], spring: [0, 2], summer: [1, 3], winter: [3, 3] };
const want = (n) => !only.length || only.includes(n);

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function settle(page, least) {
  const start = Date.now();
  await page.waitForTimeout(least);
  const counts = [];
  while (Date.now() - start < 240000) {
    counts.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let n = 0;
            const step = () =>
              ++n >= 3 ? resolve(window.__qoti.stats()?.triangles ?? 0) : requestAnimationFrame(step);
            requestAnimationFrame(step);
          }),
      ),
    );
    const last = counts.slice(-3);
    if (last.length === 3 && Math.max(...last) - Math.min(...last) <= Math.max(...last) * 0.02) return;
  }
}

if (want('title')) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${base}/?debug&season=autumn&day=3&backdrop=live&quality=low&titleLight=day`);
  await page.getByTestId('new-solo').waitFor();
  await page.locator('[data-backdrop="live"]').waitFor({ state: 'attached', timeout: 240_000 });
  await page.waitForTimeout(2400);
  await page.screenshot({
    path: `${out}/r3x-autumn-${stage}-title.png`,
    animations: 'disabled',
    timeout: 240000,
  });
  await page.close();
}

const names = Object.keys(SEASONS).filter(want);
if (names.length) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(
    `${base}/?debug&fixture=grown&clean&fixedres&quality=medium&season=autumn&day=3&weather=clear`,
  );
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  for (const name of ['Done', 'Close', 'Later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
  await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
  const cherries = await page.evaluate(() => window.__qoti.decorOf('cherry-tree'));
  console.log('cherry trees', cherries.length, JSON.stringify(cherries.slice(0, 40)));
  const at = process.env.QOTI_AT
    ? process.env.QOTI_AT.split(',').map(Number)
    : cherries.reduce((a, c) => (c[0] < a[0] ? c : a), cherries[0]);
  console.log('framing', at);
  const dist = Number(process.env.QOTI_DIST ?? 22);
  const pitch = Number(process.env.QOTI_PITCH ?? 40);
  for (const name of names) {
    const [si, day] = SEASONS[name];
    await page.evaluate(
      ([s, d]) => {
        const o = window.__qoti.renderer().lookOverride;
        o.season = s;
        o.day = d;
        o.weather = 'clear';
      },
      [si, day],
    );
    await page.waitForTimeout(3000);
    await page.evaluate(
      ([x, z, dd, p]) => {
        window.__qoti.setHour(11);
        const r = window.__qoti.renderer();
        window.__qoti.look(x, z, dd, 0, 0);
        r.rig.rotateBy(0, 10);
        r.rig.rotateBy(0, ((p - 65) * Math.PI) / 180);
        r.rig.snap();
        r.rig.apply();
      },
      [at[0], at[1], dist, pitch],
    );
    await settle(page, 4000);
    const file = `${out}/r3x-autumn-${stage}-${name}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    console.log('shot', file);
  }
}
await browser.close();

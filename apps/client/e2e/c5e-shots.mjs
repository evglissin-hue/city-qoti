// C5E seasons and weather shots (a script, not a spec): the valley in every season and weather,
// the winter and raid fixtures wide, close, at dusk and at night, at 1440 x 900 on Medium with the
// interface hidden. Serve a built client (`npx vite preview` in apps/client, QOTI_CLIENT_PORT):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c5e-shots.mjs [shot ...]
// Saves docs/build/screenshots/c5e-<shot>.png (QOTI_OUT for another folder) and prints draw calls
// and triangles. Seasons and weather are the renderer's debug pins (`?debug&season=&day=&weather=`):
// the light and look only, the sim is untouched.
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5195);
const base = `http://localhost:${port}`;
const only = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const wait = Number(process.env.QOTI_WAIT ?? 9000);

// name: [fixture, query, hour, dist, setup, at (dx, dz from the center), tilt]
const SHOTS = {
  'spring-village': ['village', 'season=spring&day=2', 11, 110, 'village'],
  'summer-village': ['village', 'season=summer&day=3', 11, 110, 'village'],
  'autumn-village': ['village', 'season=autumn&day=4', 11, 110, 'village'],
  'winter-village': ['village', 'season=winter&day=3&weather=frozen', 11, 110, 'village'],
  'winter-village-night': ['village', 'season=winter&day=3&weather=frozen', 21.5, 45, 'village'],
  'spring-town': ['village', 'season=spring&day=2', 15, 22, 'town', [5, 0], -0.22],
  'summer-town': ['village', 'season=summer&day=3', 15, 22, 'town', [5, 0], -0.22],
  'autumn-town': ['village', 'season=autumn&day=4', 15, 22, 'town', [5, 0], -0.22],
  'winter-town': ['village', 'season=winter&day=3', 15, 22, 'town', [5, 0], -0.22],
  'winter-town-night': ['village', 'season=winter&day=3', 21.5, 30, 'town', [5, 0], -0.22],
  'autumn-street': ['village', 'season=autumn&day=4', 15, 22, 'village', [-6, 0], -0.22],
  'winter-street': ['village', 'season=winter&day=3', 15, 22, 'village', [-6, 0], -0.22],
  'winter-wide': ['winter', '', 11, 80],
  'winter-close': ['winter', '', 11, 22],
  'winter-dusk': ['winter', '', 18.6, 40],
  'winter-night': ['winter', '', 21.5, 40],
  'winter-snowfall': ['winter', 'weather=snow', 13, 35],
  'rain-hamlet': ['hamlet', 'season=summer&weather=rain', 12, 40],
  'storm-hamlet': ['hamlet', 'season=autumn&weather=storm', 16, 40],
  'fog-hamlet': ['hamlet', 'season=autumn&weather=fog', 9, 50],
  'drought-hamlet': ['hamlet', 'season=summer&weather=drought', 13, 50],
  'raid-wide': ['raid', '', 19.2, 60],
  'raid-dusk': ['raid', '', 19.2, 30],
  'raid-night': ['raid', '', 22, 30],
};

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const rows = [];
for (const [name, [fixture, q, hour, dist, setup, at, tilt]] of Object.entries(SHOTS)) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&fixture=${fixture}&clean&fixedres&quality=medium${q ? `&${q}` : ''}`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  for (const label of ['Done', 'Close', 'Later']) {
    const b = page.getByRole('button', { name: label, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
  if (process.env.QOTI_HUD !== '1')
    await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
  let center = setup === 'village' ? [64, 60] : null;
  if (setup === 'village') await page.evaluate(() => window.__qoti.villageShowcase(true));
  if (setup === 'town') center = (await page.evaluate(() => window.__qoti.townShowcase())).center;
  if (!center) {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
  }
  const [x, z] = at ? [center[0] + at[0], center[1] + at[1]] : center;
  await page.evaluate(
    ([x, z, d, h, t]) => {
      window.__qoti.setHour(h);
      window.__qoti.look(x, z, d, 0, t);
    },
    [x, z, dist, hour, tilt ?? 0],
  );
  await page.waitForTimeout(wait);
  const s = await page.evaluate(() => {
    const st = window.__qoti.stats();
    return { draws: st?.drawCalls ?? 0, tris: st?.triangles ?? 0, mode: st?.mode };
  });
  const file = `${out}/c5e-${name}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  rows.push({ name, ...s });
  console.log(file, JSON.stringify(s));
  await page.close();
}
await browser.close();
console.log('\n| Shot | Draws | Triangles |\n|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.draws} | ${(r.tris / 1e6).toFixed(2)} M |`);

// C5E part 2 shots (a script, not a spec): the I3 pieces from the seasons showcase
// (`__qoti.seasonsShowcase()`): defenses whole and damaged, the trades and modules, a festival by
// day and by night, fireworks, the circus, the River Dock and the Stone Bridge, a flood, and the
// raid and winter fixtures with the new art. 1440 x 900 on Medium, the interface hidden. Serve a
// built client (`npx vite preview` in apps/client, QOTI_CLIENT_PORT):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c5e2-shots.mjs [shot ...]
// Saves docs/build/screenshots/c5e2-<shot>.png (QOTI_OUT for another folder) with draw calls and
// triangles.
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5195);
const base = `http://localhost:${port}`;
const only = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const wait = Number(process.env.QOTI_WAIT ?? 7000);

// name: [fixture, query, hour, dist, at: spot name from the showcase or [dx, dz] from its center or
// 'raiders', or { abs: [x, z] }, fireworks]
const SHOTS = {
  overview: ['hamlet', 'season=summer&day=3', 12, 36, [8, 6]],
  defenses: ['hamlet', 'season=summer&day=3', 12, 11, [2, 2]],
  watch: ['hamlet', 'season=summer&day=3', 12, 10, 'watch'],
  trades: ['hamlet', 'season=summer&day=3', 12, 12, [3, 9]],
  modules: ['hamlet', 'season=summer&day=3', 12, 12, [3, 13]],
  greens: ['hamlet', 'season=summer&day=3', 12, 6, 'greens'],
  dock: ['hamlet', 'season=summer&day=3', 12, 8, 'dock'],
  bridge: ['hamlet', 'season=summer&day=3', 12, 9, 'bridge'],
  'festival-day': ['hamlet', 'season=autumn&day=3', 14, 11, 'festival'],
  'festival-night': ['hamlet', 'season=autumn&day=3', 21.5, 12, 'festival'],
  fireworks: ['hamlet', 'season=autumn&day=3', 21.5, 30, [8, 6], true],
  circus: ['hamlet', 'season=summer&day=3', 15, 12, 'circus'],
  flood: ['hamlet', 'season=spring&day=3&flood=1', 12, 20, 'dock'],
  'winter-defenses': ['hamlet', 'season=winter&day=3&weather=frozen', 11, 11, [2, 2]],
  'winter-festival-night': ['hamlet', 'season=winter&day=3', 21.5, 12, 'festival'],
  'winter-omens': ['winter', 'omens', 12, 18, [0, -12]],
  // The raid fixture's palisade and gate (38 to 42, 45 to 49), with the raiders where they are.
  'raid-dusk': ['raid', '', 19.2, 14, { abs: [41, 49] }],
  'raid-night': ['raid', '', 22, 14, { abs: [41, 49] }],
  'raid-wide': ['raid', '', 19.2, 40, 'raiders'],
};

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const rows = [];
for (const [name, [fixture, q, hour, dist, at, fireworks]] of Object.entries(SHOTS)) {
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
  await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
  let x;
  let z;
  if (fixture === 'hamlet') {
    const sc = await page.evaluate(() => window.__qoti.seasonsShowcase());
    if (Array.isArray(at)) [x, z] = [sc.center[0] + at[0], sc.center[1] + at[1]];
    else {
      const s = sc.spots.find((p) => p[0] === at);
      [x, z] = s ? [s[1], s[2]] : sc.center;
    }
    if (fireworks) await page.evaluate(([fx, fz]) => window.__qoti.fireworks(fx, fz - 4, 3.9), [x, z]);
  } else {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    [x, z] = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
    if (Array.isArray(at)) [x, z] = [x + at[0], z + at[1]];
    if (at?.abs) [x, z] = at.abs;
    if (at === 'raiders') {
      await page.waitForTimeout(4000);
      const r = await page.evaluate(() => window.__qoti.agentsWith(256));
      if (r.length)
        [x, z] = [r.reduce((a, v) => a + v[1], 0) / r.length, r.reduce((a, v) => a + v[2], 0) / r.length];
    }
  }
  await page.evaluate(
    ([px, pz, d, h]) => {
      window.__qoti.setHour(h);
      window.__qoti.look(px, pz, d, 0, 0);
    },
    [x, z, dist, hour],
  );
  await page.waitForTimeout(wait);
  const s = await page.evaluate(() => {
    const st = window.__qoti.stats();
    return { draws: st?.drawCalls ?? 0, tris: st?.triangles ?? 0, mode: st?.mode };
  });
  const file = `${out}/c5e2-${name}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  rows.push({ name, ...s });
  console.log(file, JSON.stringify(s));
  await page.close();
}
await browser.close();
console.log('\n| Shot | Draws | Triangles |\n|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.draws} | ${(r.tris / 1e6).toFixed(2)} M |`);

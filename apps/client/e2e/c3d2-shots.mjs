// C3D-2 screenshot and render-stats script (not a spec). Starts a solo valley on a running client,
// places a little hamlet, adds synthetic residents and takes screenshots:
//   node apps/client/e2e/c3d2-shots.mjs <baseUrl> <outDir> <scenario> [...]
// Scenarios: crowd (2,000 residents, stats), hamlet (day), dusk, night, bubbles, overlays.
// QOTI_CHROMIUM points at a preinstalled Chromium.
import { chromium } from '@playwright/test';

const [base, out, ...scenarios] = process.argv.slice(2);
const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM && { executablePath: process.env.QOTI_CHROMIUM }),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const HAMLET = [
  'town-hall',
  'storehouse',
  'bakery',
  'cottage',
  'cottage',
  'farmhouse',
  'woodcutter',
  'market-stall',
  'house',
  'well',
  'windmill',
  'sawpit',
  'foresters-lodge',
  'cottage',
  'vegetable-plot',
  'builders-yard',
  'quarry',
  'fishers-hut',
];

async function open(query, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.error(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.error(`console: ${m.text()}`));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&${query}`);
  await page.getByTestId('new-solo').click();
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 120000 });
  return page;
}

async function hamlet(page, defs = HAMLET) {
  await page.evaluate(() => window.__qoti.focusStart(40));
  await page.waitForTimeout(1500);
  for (const def of defs) {
    // One at a time: each placement must land in the Mirror before the next spot is searched.
    const before = await page.evaluate(() => window.__qoti.counts().buildings);
    const ok = await page.evaluate((d) => {
      const q = window.__qoti;
      const s = q.findBuildingSpot(d, 0);
      if (s) q.submit({ t: 'build.place', def: d, x: s.x, z: s.z, rot: 0 });
      return !!s;
    }, def);
    if (ok) {
      await page
        .waitForFunction((n) => window.__qoti.counts().buildings > n, before, { timeout: 5000 })
        .catch(() => console.error(`no ${def}`));
    }
  }
  await page.evaluate(() => {
    const q = window.__qoti;
    const run = q.findRoadRun(12);
    if (run) q.submit({ t: 'road.paint', kind: 'path', tiles: run });
  });
  await page.waitForTimeout(1500);
}

/** Snaps the camera to the start area at a distance (no glide: SwiftShader draws a frame a second). */
async function view(page, distance, dx = 0, dz = 0) {
  await page.evaluate(
    ([d, ox, oz]) => {
      const r = window.__qoti.renderer();
      const [x0, z0, x1, z1] = r.mirror.meta.startArea;
      r.rig.focus((x0 + x1) / 2 + ox, (z0 + z1) / 2 + oz, d);
      r.rig.snap();
      r.invalidate();
    },
    [distance, dx, dz],
  );
  await page.waitForTimeout(2500);
}

async function stats(page, label) {
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => {
    const r = window.__qoti.renderer();
    const agents = r.layers.find((l) => l.id === 'agents');
    return { ...window.__qoti.stats(), drawn: { ...agents.drawn } };
  });
  console.log(`${label}: ${JSON.stringify(s)}`);
  return s;
}

for (const scenario of scenarios) {
  if (scenario === 'crowd') {
    const page = await open('quality=medium&hour=13');
    await hamlet(page);
    await page.evaluate(() => window.__qoti.synthResidents(2000, { radius: 34 }));
    await view(page, 60);
    await stats(page, 'crowd medium d60');
    await page.screenshot({ path: `${out}/c3d2-crowd-2000.png`, timeout: 180000 });
    await view(page, 30);
    await stats(page, 'crowd medium d30');
    await page.screenshot({ path: `${out}/c3d2-crowd-2000-close.png`, timeout: 180000 });
    await page.close();
  } else if (scenario === 'hamlet' || scenario === 'dusk' || scenario === 'night') {
    const hour = scenario === 'hamlet' ? 10.5 : scenario === 'dusk' ? 19.2 : 22.5;
    const page = await open(`quality=medium&hour=${hour}`);
    await hamlet(page);
    await page.evaluate(() => {
      window.__qoti.synthRuntime({});
      window.__qoti.synthResidents(120, { radius: 14 });
    });
    await view(page, 24);
    await stats(page, scenario);
    await page.screenshot({ path: `${out}/c3d2-hamlet-${scenario}.png`, timeout: 180000 });
    await view(page, 12);
    await page.screenshot({ path: `${out}/c3d2-hamlet-${scenario}-close.png`, timeout: 180000 });
    await page.close();
  } else if (scenario === 'sites') {
    const page = await open('quality=medium&hour=11');
    await hamlet(page, HAMLET.slice(0, 12));
    await page.evaluate(() => window.__qoti.synthRuntime({ sites: 8 }));
    await view(page, 20);
    await page.screenshot({ path: `${out}/c3d2-construction.png`, timeout: 180000 });
    await view(page, 13, -3, 0);
    await page.screenshot({ path: `${out}/c3d2-construction-close.png`, timeout: 180000 });
    await page.close();
  } else if (scenario === 'overlays') {
    const page = await open('quality=medium&hour=12');
    await hamlet(page);
    await page.evaluate(() => {
      window.__qoti.synthRuntime({ status: true, sites: 2 });
      window.__qoti.synthCharm();
      window.__qoti.synthResidents(40, { radius: 12 });
    });
    for (const kind of ['charm', 'charm:noise', 'coverage', 'flows', 'status']) {
      await page.evaluate((k) => window.__qoti.renderer().setOverlay(k), kind);
      await view(page, kind === 'charm' || kind === 'charm:noise' ? 34 : 24);
      if (kind.startsWith('charm')) await page.waitForTimeout(12000);
      await page.screenshot({ path: `${out}/c3d2-overlay-${kind.replace(':', '-')}.png`, timeout: 180000 });
    }
    await page.evaluate(() => {
      const r = window.__qoti.renderer();
      r.setOverlay(null);
      const [x0, z0, x1, z1] = r.mirror.meta.startArea;
      r.highlight({
        x: Math.floor((x0 + x1) / 2) + 3,
        z: Math.floor((z0 + z1) / 2) + 2,
        radius: 4,
        tone: 'hearth',
      });
    });
    await view(page, 20);
    await page.screenshot({ path: `${out}/c3d2-highlight.png`, timeout: 180000 });
    await page.close();
  } else if (scenario === 'bubbles') {
    const page = await open('quality=medium&hour=11');
    await hamlet(page, HAMLET.slice(0, 6));
    await page.evaluate(() => {
      window.__qoti.synthResidents(60, { radius: 9 });
      window.__qoti.renderer().setBubbles(true);
    });
    await view(page, 14);
    await page.screenshot({ path: `${out}/c3d2-bubbles.png`, timeout: 180000 });
    await page.close();
  }
}
await browser.close();

// R1E screenshots and draw counts (a script, not a spec): the village of 130 (the C4E showcase)
// dressed as an R1 town, with every business given a trade, a level and a keeper, the chain
// economy's old pieces turned into the businesses and specialized buildings that replaced them,
// then shot from the Ledger's height and close up, by day and at dusk. Needs the client dev
// server (QOTI_CLIENT_PORT, default 5225):
//   node apps/client/e2e/r1e-shots.mjs [outDir] [prefix]
// Env: QOTI_CHROMIUM (default /opt/pw-browsers/chromium), QOTI_PLAIN=1 (the showcase as it was,
// for a before count), QOTI_SHOTS=0 (counts only). Ends with the village view's perf table on Medium.
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5225);
const out = process.argv[2] ?? 'docs/build/screenshots';
const prefix = process.argv[3] ?? 'r1e';
const plain = process.env.QOTI_PLAIN === '1';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
await page.goto(`http://localhost:${port}/?debug&fixture=village&clean&quality=medium&fixedres`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
for (const name of ['Done', 'Close', 'Later']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
await page.evaluate(() => {
  window.__qoti.villageShowcase(true);
  window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
});

if (!plain) {
  const summary = await page.evaluate(async () => {
    const { currentSession } = await import('/src/app/GameView.tsx');
    const m = currentSession().mirror;
    const WORKSHOPS = ['baker', 'weaver', 'carpenter', 'chandler', 'cider-maker'];
    const FARMS = ['grain-farm', 'market-garden', 'orchard', 'dairy', 'sheep-run', 'hives'];
    const FAMILIES = [
      'Fenwick',
      'Hollis',
      'Ashdown',
      'Thornbury',
      'Pennywhistle',
      'Marsh',
      'Oakes',
      'Brightwater',
    ];
    // The chain economy's pieces become what replaced them (same footprint or smaller).
    const AS = {
      orchard: 'farmstead',
      dairy: 'farmstead',
      'sheep-pasture': 'farmstead',
      'brick-kiln': 'brickworks',
      'clay-pit': 'granary',
      cheesemaker: 'foresters-lodge',
      weaver: 'shop',
      'cider-press': 'shop',
      smithy: 'shop',
    };
    const events = [];
    let w = 0;
    let f = 0;
    let s = 0;
    let k = 0;
    const sorted = [...m.buildings.values()].sort((a, b) => a.x - b.x || a.z - b.z);
    for (const b0 of sorted) {
      const def = AS[b0.def] ?? b0.def;
      const b = { ...b0, def };
      if (def === 'workshop' || def === 'farmstead') {
        // Half the farmsteads on the street side become workshops, so all five crafts show.
        const asWorkshop = def === 'workshop' || (def === 'farmstead' && b.z > 50 && w < 6);
        b.def = asWorkshop ? 'workshop' : 'farmstead';
        b.trade = asWorkshop ? WORKSHOPS[w++ % WORKSHOPS.length] : FARMS[f++ % FARMS.length];
      } else if (def === 'shop') b.trade = 'shop';
      if (b.trade) {
        b.level = 1 + ((w + f + s++) % 3);
        b.keeperId = 900000 + k;
        m.residents.set(b.keeperId, {
          id: b.keeperId,
          given: 'Ada',
          family: FAMILIES[k++ % FAMILIES.length],
        });
      }
      if (b.def !== b0.def || b.trade) events.push({ e: 'building.updated', b });
    }
    m.apply({ t: m.lastTurn.value, events, patches: [] });
    return events.map((e) => `${e.b.def}${e.b.trade ? `:${e.b.trade}:${e.b.level}` : ''}@${e.b.x},${e.b.z}`);
  });
  console.log(summary.join('\n'));
}

async function settle() {
  await page.waitForTimeout(8000);
}

async function shot(name, hour, x, z, dist, turn = 0, tilt = 0) {
  await page.evaluate(([h]) => window.__qoti.setHour(h), [hour]);
  await page.evaluate(([a, b, d, t, l]) => window.__qoti.look(a, b, d, t, l), [x, z, dist, turn, tilt]);
  await settle();
  const st = await page.evaluate(() => {
    const s = window.__qoti.stats();
    return s ? { draws: s.drawCalls, triangles: s.triangles } : null;
  });
  if (process.env.QOTI_SHOTS !== '0')
    await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 240000 });
  console.log(`${name}: ${JSON.stringify(st)}`);
}

// The Ledger's height over the town (the perf script's village view), then the street and the farms.
await shot('town-day', 11, 64, 60, 70);
await shot('town-dusk', 19.5, 64, 60, 70);
await shot('street-day', 11, 66, 56, 26, 0.2);
await shot('street-dusk', 19.5, 66, 56, 26, 0.2);
await shot('farms-day', 11, 62, 40, 30, -0.3);
await shot('farms-dusk', 19.5, 62, 40, 30, -0.3);
// The village view's moving frames on Medium (the perf script's table), for the budget check.
await page.evaluate(([x, z]) => window.__qoti.look(x, z, 70), [64, 60]);
await page.evaluate(() => window.__qoti.setHour(11));
await settle();
const layers = await page.evaluate(() => window.__qoti.layerTriangles());
console.log('layers:', JSON.stringify(layers));
const perf = await page.evaluate(() =>
  window.__qoti.perf({ scene: 'village', move: 6, rest: 4, presets: ['medium'] }),
);
console.log(perf?.table ?? 'no perf');
await browser.close();

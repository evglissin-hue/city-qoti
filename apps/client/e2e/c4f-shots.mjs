// Screenshot script for the village UI (C4F; not a spec). Needs the client dev server:
//   QOTI_CLIENT_PORT=5186 npm run dev -w @qoti/client
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c4f-shots.mjs docs/build/screenshots [name-filter] [scales]
// Every new panel on the live village fixture (?fixture=village) with the village mocks laid over
// it (a story under way, a caravan, an innovation halfway), at 80%, 100% and 140% interface size.
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5186';
const base = `http://localhost:${port}`;
const out = process.argv[2] ?? 'docs/build/screenshots';
const only = process.argv[3] ?? '';
const scales = (process.argv[4] ?? '80,100,140').split(',').map(Number);
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const wanted = (name) => !only || name.includes(only);
const q = (page, fn, arg) => page.evaluate(fn, arg);

async function open(scale) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  // Calm motion: SwiftShader draws a frame a second, so CSS transitions would be caught halfway.
  await page.addInitScript(
    (s) => localStorage.setItem('qoti.settings.v1', JSON.stringify({ uiScale: s, reducedMotion: true })),
    scale / 100,
  );
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&clean&quality=low&fixture=village&hour=10.5`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
  await page.waitForFunction(() => window.__qoti.residentIds().length > 0);
  await q(page, () => window.__qoti.villageMocks());
  await page.keyboard.press('Space');
  await q(page, () => window.__qoti.look(60, 60, 40));
  await page.waitForTimeout(2500);
  return page;
}

async function reset(page) {
  await q(page, () => {
    const h = window.__qoti;
    h.select(null);
    h.openPanel(null);
    h.selectTool('inspect');
    h.setUi('storyLetter', null);
    h.setUi('rankUp', null);
    h.setUi('asking', false);
    h.setUi('sketch', null);
    h.setUi('planFocus', null);
    h.setUi('marketGood', null);
  });
}

for (const scale of scales) {
  const page = await open(scale);
  const snap = async (name) => {
    const file = `c4f-${name}-${scale}`;
    if (!wanted(file)) return;
    await page.mouse.move(640, 300);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${file}.png`, timeout: 120000 });
    console.log('shot', file);
  };
  const lens = (l) => q(page, (x) => window.__qoti.setLens(x), l);
  const panel = (id) => q(page, (x) => window.__qoti.openPanel(x), id);
  const ui = (name, value) => q(page, ([n, v]) => window.__qoti.setUi(n, v), [name, value]);

  // Overviews: the feeds, the pennant and the minimap in each lens.
  await lens('hearth');
  await snap('overview-hearth');
  await lens('ledger');
  await snap('overview-ledger');

  // Ledger books.
  await ui('marketTab', 'prices');
  await ui('marketGood', 'bread');
  await panel('market');
  await snap('market');
  await ui('marketTab', 'profit');
  await page.waitForTimeout(2500);
  await snap('market-profit');
  await ui('marketTab', 'prices');
  await ui('tradeTab', 'neighbors');
  await panel('trade');
  await snap('trade');
  await ui('tradeTab', 'orders');
  await page.waitForTimeout(400);
  if (wanted(`c4f-trade-orders-${scale}`)) {
    await page.getByTestId('order-planks').getByRole('button', { name: 'Change' }).click();
  }
  await snap('trade-orders');
  await ui('tradeTab', 'caravans');
  await snap('trade-caravans');
  await panel('policies');
  await snap('policies');
  await panel('notebook');
  await snap('notebook');
  await reset(page);

  // A workshop's profit in the Ledger lens.
  await q(page, () => window.__qoti.select({ kind: 'building', id: window.__qoti.buildingsOf('bakery')[0] }));
  await page.waitForTimeout(1500);
  await snap('building-profit');
  await reset(page);

  // Zoning along lane A, mid drag, with the lot sketch.
  if (wanted(`c4f-zone-${scale}`)) {
    await q(page, () => window.__qoti.look(46, 54, 22));
    await page.waitForTimeout(2000);
    await page.getByTestId('tool-zone').click();
    await page.getByTestId('variant-homes-low').click();
    const a = await q(page, () => window.__qoti.screenOf(42, 51));
    const b = await q(page, () => window.__qoti.screenOf(51, 53));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/c4f-zone-${scale}.png`, timeout: 120000 });
    console.log('shot', `c4f-zone-${scale}`);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await reset(page);
    await q(page, () => window.__qoti.look(60, 60, 40));
    await page.waitForTimeout(1500);
  }

  // Hearth: letters, a story letter, the story character, family.
  await lens('hearth');
  await panel('letters');
  await snap('letters');
  await q(page, () => window.__qoti.openLetter(-1));
  await snap('story-letter');
  await reset(page);
  await q(page, () => window.__qoti.select({ kind: 'resident', id: window.__qoti.residentIds()[0] }));
  await page.waitForTimeout(1500);
  await snap('resident');
  if (wanted(`c4f-resident-family-${scale}`)) {
    await page.getByTestId('resident-story-tab').click();
    await page.getByTestId('resident-family').scrollIntoViewIfNeeded();
  }
  await snap('resident-family');
  await reset(page);

  // Together: requests, plans with a sketch under way, the rank-up card.
  await ui('asking', true);
  await snap('ask');
  await reset(page);
  await q(page, () => window.__qoti.look(60, 56, 22));
  await page.waitForTimeout(1500);
  await page.getByTestId('tool-plan').click();
  await ui('sketch', {
    basedOn: null,
    items: [
      { cmd: { t: 'build.place', def: 'bakery', x: 55, z: 52, rot: 0 } },
      {
        cmd: {
          t: 'road.paint',
          kind: 'path',
          tiles: [
            [54, 51],
            [54, 52],
            [54, 53],
            [54, 54],
          ],
        },
      },
      { cmd: { t: 'decor.place', def: 'lantern', fx: 59 * 256 + 128, fz: 54 * 256 + 128, rot: 0 } },
    ],
  });
  await snap('plans');
  await reset(page);
  await q(page, () => window.__qoti.look(60, 60, 40));
  await q(page, () => window.__qoti.rankUp('village'));
  await snap('rank-up');
  await reset(page);

  // The Charter board in progress (the mocks' board puts the town back at Hamlet, so it goes last).
  await q(page, () => window.__qoti.villageMocks({ charter: true }));
  await panel('charter');
  await snap('charter');
  await page.close();
}

await browser.close();

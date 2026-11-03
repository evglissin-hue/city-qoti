// Screenshot script for the season pages (C5F; not a spec). Needs the client dev server:
//   QOTI_CLIENT_PORT=5196 QOTI_RELAY_PORT=8806 npm run dev -w @qoti/client
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c5f-shots.mjs docs/build/screenshots [name-filter] [scales]
// Every new panel on the live winter fixture (?fixture=winter) and the raid at dusk (?fixture=raid),
// with the I3 mocks for the history the fixtures cannot have yet (a report, results), at 80%, 100%
// and 140% interface size.
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5196';
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

async function open(scale, fixture, hour) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.addInitScript(
    (s) => localStorage.setItem('qoti.settings.v1', JSON.stringify({ uiScale: s, reducedMotion: true })),
    scale / 100,
  );
  await page.goto(`${base}/?debug&clean&quality=low&fixture=${fixture}${hour ? `&hour=${hour}` : ''}`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
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
    for (const k of ['almanac', 'raidCard', 'festivalCard', 'together']) h.setUi(k, null);
    h.setUi('photo', false);
    h.setUi('settingsOpen', false);
  });
}

for (const scale of scales) {
  for (const fixture of ['winter', 'raid']) {
    const page = await open(scale, fixture, fixture === 'winter' ? 14 : null);
    const snap = async (name, target) => {
      const file = `c5f-${name}-${scale}`;
      if (!wanted(file)) return;
      await page.mouse.move(640, 300);
      await page.waitForTimeout(900);
      const el = target ? page.getByTestId(target) : page;
      await el.screenshot({ path: `${out}/${file}.png`, timeout: 120000 });
      console.log('shot', file);
    };
    const lens = (l) => q(page, (x) => window.__qoti.setLens(x), l);
    const panel = (id) => q(page, (x) => window.__qoti.openPanel(x), id);
    const ui = (name, value) => q(page, ([n, v]) => window.__qoti.setUi(n, v), [name, value]);
    const mock = (what) => q(page, (w) => window.__qoti.seasonsMock(w), what);

    if (fixture === 'winter') {
      await lens('hearth');
      await snap('overview-winter-hearth');
      await mock('card');
      await snap('season-card');
      await mock('report');
      await snap('season-report');
      await reset(page);
      await panel('festival');
      await snap('festival');
      await mock('festival');
      await snap('festival-result');
      await reset(page);
      await panel('field-guide');
      await snap('field-guide');
      await page.locator('[data-testid^="guide-"]').first().click();
      await snap('field-guide-page');
      await reset(page);
      await panel('trial');
      await snap('trial');
      await reset(page);
      await lens('ledger');
      await snap('overview-winter-ledger');
      await panel('watch');
      await snap('watch-winter');
      await ui('tradeTab', 'dock');
      await panel('trade');
      await snap('trade-dock');
      await ui('tradeTab', 'commissions');
      await page.waitForTimeout(300);
      await snap('trade-commissions');
      await ui('tradeTab', 'neighbors');
      await panel('policies');
      await snap('policies');
      await reset(page);
      await ui('together', 'You are both here: stay for the closing dance.');
      await snap('together');
      await reset(page);
      await ui('settingsOpen', true);
      await page.waitForTimeout(300);
      await snap('settings-dials', 'valley-dials');
      await reset(page);
      await ui('photo', true);
      await snap('photo');
      await reset(page);
    } else {
      await lens('ledger');
      await snap('raid-ledger');
      await lens('hearth');
      await snap('raid-hearth');
      await lens('ledger');
      await panel('watch');
      await snap('watch-raid');
      await reset(page);
      await mock('raid');
      await snap('raid-result');
      await reset(page);
    }
    await page.close();
  }
}
await browser.close();

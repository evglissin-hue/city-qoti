// Screenshot script for the hamlet UI (not a spec). Needs the client dev server:
//   QOTI_CLIENT_PORT=5186 npm run dev -w @qoti/client
//   node apps/client/e2e/c3e-shots.mjs docs/build/screenshots [name-filter]
// The fixture valley (?fixture=hamlet&mock) shows every panel with the mocks' history laid over the
// sim's live hamlet fixture; the last shots use a fresh standard valley as a player would make it.
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5186';
const base = `http://localhost:${port}`;
const out = process.argv[2] ?? 'docs/build/screenshots';
const only = process.argv[3] ?? '';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const wanted = (name) => !only || name.includes(only);

async function open(query, { width = 1280, height = 800 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  // Calm motion: SwiftShader draws a frame a second, so CSS transitions would be caught halfway.
  await page.addInitScript(() =>
    localStorage.setItem('qoti.settings.v1', JSON.stringify({ uiScale: 1, reducedMotion: true })),
  );
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/${query}`);
  return page;
}

async function live(page) {
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 120000 });
  await page.waitForTimeout(800);
}

async function snap(page, name) {
  if (!wanted(name)) return;
  await page.mouse.move(640, 300);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  console.log('shot', name);
}

const q = (page, fn, arg) => page.evaluate(fn, arg);

async function reset(page) {
  await q(page, () => {
    const h = window.__qoti;
    h.select(null);
    h.openPanel(null);
    h.customize(null);
    h.selectTool('inspect');
  });
  await page.keyboard.press('Escape');
}

// --- The fixture hamlet with mock history ------------------------------------------------------
{
  const page = await open('?debug&clean&quality=low&fixture=hamlet&mock&hour=10.5');
  await live(page);
  await page.waitForFunction(() => window.__qoti.residentIds().length > 0);
  await q(page, () => window.__qoti.overlayMocks());
  await q(page, () => window.__qoti.focusStart(34));
  await page.waitForTimeout(2500);

  await snap(page, 'c3e-hearth-overview');

  await q(page, () => window.__qoti.select({ kind: 'resident', id: 12 }));
  await snap(page, 'c3e-resident-inspector');
  if (wanted('c3e-resident-story')) {
    await page.getByTestId('resident-story-tab').click();
    await snap(page, 'c3e-resident-story');
  }
  await reset(page);

  await q(page, () => window.__qoti.select({ kind: 'building', id: 6 }));
  await snap(page, 'c3e-building-inspector');
  await q(page, () => window.__qoti.select({ kind: 'building', id: 8 }));
  await snap(page, 'c3e-construction-site');
  await q(page, () => window.__qoti.select({ kind: 'building', id: 2 }));
  await snap(page, 'c3e-storehouse');
  await q(page, () => window.__qoti.select({ kind: 'building', id: 3 }));
  await snap(page, 'c3e-home');
  await reset(page);

  await q(page, () => window.__qoti.customize(6));
  if (wanted('c3e-customize')) {
    await page.getByTestId('swatch-wall-butter').click();
    await page.getByTestId('swatch-roof-moss').click();
    await page.getByTestId('detail-windowBoxes').click();
    await page.getByTestId('detail-shutters').click();
  }
  await snap(page, 'c3e-customize');
  await reset(page);

  await page.getByTestId('book-wishes').click();
  if (wanted('c3e-wishes')) await page.getByTestId('wish-40').click();
  await snap(page, 'c3e-wishes');
  await reset(page);

  await page.getByTestId('book-patterns').click();
  await snap(page, 'c3e-pattern-book');
  if (wanted('c3e-pattern-page')) {
    await page.getByTestId('page-well-gathering-place').click();
    await snap(page, 'c3e-pattern-page');
    await page.getByTestId('page-sitting-wall').click();
    await snap(page, 'c3e-pattern-page-hint');
  }
  await reset(page);

  await page.getByTestId('book-chronicle').click();
  await snap(page, 'c3e-chronicle');
  await reset(page);

  await page.getByTestId('book-achievements').click();
  await snap(page, 'c3e-achievements');
  await reset(page);

  await page.getByTestId('tool-decor').click();
  await snap(page, 'c3e-decor-picker');
  if (wanted('c3e-decor-locked')) {
    await page.getByTestId('decor-group-greenery').click();
    await snap(page, 'c3e-decor-locked');
  }
  await reset(page);

  await q(page, () => window.__qoti.showMockLetter());
  await snap(page, 'c3e-away-letter');
  await page.keyboard.press('Escape');

  await q(page, () => window.__qoti.setLens('ledger'));
  await snap(page, 'c3e-ledger-overview');
  await page.getByTestId('tool-building').click();
  await snap(page, 'c3e-build-picker');
  await reset(page);
  if (wanted('c3e-field-tool')) {
    // A farmhouse south of the lane, then the field tool dragging a box beside it.
    const farm = await q(page, () => {
      const h = window.__qoti;
      const spot = h.findBuildingSpot('farmhouse', 0);
      if (spot) h.submit({ t: 'build.place', def: 'farmhouse', x: spot.x, z: spot.z, rot: 0 });
      return spot;
    });
    await page.waitForFunction(() => window.__qoti.buildingsOf('farmhouse').length > 0);
    const id = await q(page, () => window.__qoti.buildingsOf('farmhouse')[0]);
    await q(page, (fid) => window.__qoti.select({ kind: 'building', id: fid }), id);
    await page.getByTestId('tool-field').click();
    const a = await q(page, ([x, z]) => window.__qoti.screenOf(x + 3, z), [farm.x, farm.z]);
    const b = await q(page, ([x, z]) => window.__qoti.screenOf(x + 6, z + 3), [farm.x, farm.z]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/c3e-field-tool.png`, timeout: 120000 });
    console.log('shot c3e-field-tool');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await reset(page);
  }
  await page.getByTestId('book-reports').click();
  for (const tab of ['stocks', 'workforce', 'budget', 'buildings']) {
    if (!wanted(`c3e-report-${tab}`)) continue;
    await page.getByTestId(`report-${tab}`).click();
    await snap(page, `c3e-report-${tab}`);
  }
  await reset(page);

  for (const scale of [0.8, 1.4]) {
    const tag = scale < 1 ? '80' : '140';
    await q(page, (s) => window.__qoti.setUiScale(s), scale);
    await q(page, () => window.__qoti.setLens('hearth'));
    await q(page, () => window.__qoti.select({ kind: 'resident', id: 12 }));
    await snap(page, `c3e-scale${tag}-resident`);
    await reset(page);
    await page.getByTestId('book-patterns').click();
    if (wanted(`c3e-scale${tag}-book`)) await page.getByTestId('page-well-gathering-place').click();
    await snap(page, `c3e-scale${tag}-book`);
    await reset(page);
    await q(page, () => window.__qoti.setLens('ledger'));
    await page.getByTestId('book-reports').click();
    await page.getByTestId('report-stocks').click();
    await snap(page, `c3e-scale${tag}-stocks`);
    await reset(page);
  }
  await q(page, () => window.__qoti.setUiScale(1));
  await page.close();
}

// --- A fresh standard valley, as a player makes it ---------------------------------------------
if (!only || only.startsWith('c3e-live')) {
  const page = await open('?debug&clean&quality=low&hour=11');
  await snap(page, 'c3e-live-title');
  if (wanted('c3e-live-title-more')) {
    await page.locator('details.title-options summary').click();
    await snap(page, 'c3e-live-title-more');
  }
  await page.getByTestId('new-solo').click();
  await live(page);
  await q(page, () => window.__qoti.focusStart(30));
  await page.waitForTimeout(2500);
  await snap(page, 'c3e-live-valley');
  const hall = await q(page, () => window.__qoti.buildingsOf('town-hall')[0]);
  await q(page, (id) => window.__qoti.select({ kind: 'building', id }), hall);
  await snap(page, 'c3e-live-town-hall');
  await reset(page);
  await q(page, () => window.__qoti.setLens('ledger'));
  await page.getByTestId('book-reports').click();
  await page.getByTestId('report-budget').click();
  await snap(page, 'c3e-live-budget');
  await page.close();
}

await browser.close();

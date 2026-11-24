import { expect, test, type Page } from '@playwright/test';
import { counts, DEBUG_QUERY, waitLive } from './helpers';

// V2.0 acceptance (docs/spec/22-quality.md, Measuring the laptops): Settings, Measure this laptop
// runs every preset in the valley on screen and in the two showcases (quick durations here, since
// the browser draws in software), shows and copies the table, keeps the run with the valley for
// this seat through the relay and lists it, and puts the valley back exactly as it was: the Mirror's
// counts, the camera and the preset. Escape stops a run at once, the valley put back again.
//
// Two sizes. By default the run is the short smoke (`?measure=smoke`, app/perf.ts): Medium only, by
// day and at night, in the valley and the two showcases (6 rows), quick durations. It proves the same
// things as the full table (panel, estimate, progress, every scene loaded and put back, numbers,
// Copy, kept per seat, Escape) in about a third of the time. `QOTI_MEASURE_FULL=1` runs the whole
// table: 18 rows (every preset by day, Medium and High at night), `?measure=quick`, 11 minutes on a
// fast host. None of v2-perf.mjs, v3-perf.mjs or v4-perf.mjs drives the Measure panel (they call
// `__qoti.perf` per preset), so this switch is the only way to run the full 18 rows in a browser.
// Players always get the real thing: no parameter, full durations.

const FULL = process.env.QOTI_MEASURE_FULL === '1';
/** Rows in the table: every preset by day plus Medium and High at night (18), or the smoke's 6. */
const ROWS = FULL ? 18 : 6;
const NIGHT_ROWS = FULL ? 2 : 1;

interface Snapshot {
  counts: { buildings: number; decor: number; notes: number; trees: number; roads: number };
  residents: number;
  quality: string;
  look: { x: number; z: number; yaw: number; distance: number };
}

async function snapshot(page: Page): Promise<Snapshot> {
  const view = await page.evaluate(() => {
    const r = (
      window.__qoti as unknown as {
        renderer(): { qualityLevel: string; rig: { look: Snapshot['look'] } };
      }
    ).renderer();
    return { quality: r.qualityLevel, look: r.rig.look, residents: window.__qoti.residentIds().length };
  });
  return { counts: await counts(page), ...view };
}

function expectSame(after: Snapshot, before: Snapshot): void {
  expect(after.counts).toEqual(before.counts);
  expect(after.residents).toBe(before.residents);
  expect(after.quality).toBe(before.quality);
  expect(after.look.x).toBeCloseTo(before.look.x, 3);
  expect(after.look.z).toBeCloseTo(before.look.z, 3);
  expect(after.look.yaw).toBeCloseTo(before.look.yaw, 3);
  expect(after.look.distance).toBeCloseTo(before.look.distance, 3);
}

test('Measure this laptop: the table, Copy, kept per seat, the valley put back; Escape stops', async ({
  browser,
}) => {
  // Full: eighteen rows and two showcases (one of 1,000 buildings and 2,000 residents) drawn in
  // software, about ten minutes here, so room for a slower CI runner. The smoke is a third of that.
  test.setTimeout(FULL ? 1_800_000 : 900_000);
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`console.${m.type()}:`, m.text());
  });
  page.on('requestfailed', (r) => console.log('requestfailed:', r.url(), r.failure()?.errorText));
  await page.goto(`/${DEBUG_QUERY}&measure=${FULL ? 'quick' : 'smoke'}`);
  await page.getByTestId('new-online').click();
  await waitLive(page);
  await page.getByRole('button', { name: 'Done' }).click();

  // Something of our own to put back: a path and a cottage, then the clock stopped so nothing moves.
  const submit = (cmd: unknown) =>
    page.evaluate((c) => (window.__qoti as unknown as { submit(cmd: unknown): number }).submit(c), cmd);
  const start = await counts(page);
  const run = await page.evaluate(() => window.__qoti.findRoadRun(4));
  expect(run).not.toBeNull();
  await submit({ t: 'road.paint', kind: 'path', tiles: run });
  await expect.poll(async () => (await counts(page)).roads).toBe(start.roads + 4);
  const spot = await page.evaluate(() => window.__qoti.findBuildingSpot('cottage', 0));
  expect(spot).not.toBeNull();
  await submit({ t: 'build.place', def: 'cottage', x: spot!.x, z: spot!.z, rot: 0 });
  await expect.poll(async () => (await counts(page)).buildings).toBe(start.buildings + 1);
  await submit({ t: 'time.setSpeed', speed: 0 });
  await expect.poll(() => page.evaluate(() => window.__qoti.clock()?.speed)).toBe(0);
  const before = await snapshot(page);

  // Settings offers it (behind the top bar's menu since R1C); it asks first, with an honest estimate.
  await page.getByTestId('menu-open').click();
  await page.getByTestId('settings-open').click();
  await page.getByTestId('measure-open').click();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.getByTestId('measure-estimate')).toContainText(
    FULL ? 'about a minute' : 'under a minute',
  );
  await expect(page.getByTestId('measure-kept')).toContainText('Nothing kept yet');
  await page.getByTestId('measure-start').click();
  await expect(page.getByTestId('measure-progress')).toBeVisible();
  await expect(page.getByTestId('measure-progress')).toContainText(new RegExp(`of ${ROWS}`));

  // A run that tripped says so at once; no sense waiting out the table's timeout for it.
  const tableTimeout = FULL ? 1_500_000 : 750_000;
  const tripped = page
    .getByTestId('measure-failed')
    .waitFor({ timeout: tableTimeout })
    .then(async () => {
      throw new Error(`Measure failed: ${await page.getByTestId('measure-failed').textContent()}`);
    });
  tripped.catch(() => {});
  // The table: every preset by day and the night presets at night, in three scenes.
  await Promise.race([
    expect(page.getByTestId('measure-row')).toHaveCount(ROWS, { timeout: tableTimeout }),
    tripped,
  ]);
  await expect(page.getByTestId('measure-done')).toContainText('back as it was');
  const table = page.getByTestId('measure-table');
  for (const scene of ['This valley', 'Village showcase', 'Town showcase'])
    await expect(table).toContainText(scene);
  // Every part caught a frame, even where one frame outlasts a quick run: no row reads as zeros.
  await expect(table).not.toContainText('0.0 / 0.0');
  // And the numbers are sane: in every row the moving average is above zero and the 95th percentile
  // at least the average (the table's first cells: moving frame ms, avg / p95), the still part is there.
  const cells = await page
    .getByTestId('measure-row')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
  expect(cells).toHaveLength(ROWS);
  for (const c of cells) {
    const [avg, p95] = c[3]!.split(' / ').map(Number);
    expect(avg).toBeGreaterThan(0);
    expect(p95).toBeGreaterThanOrEqual(avg!);
    expect(c[9]).not.toBe('n/a');
  }
  expectSame(await snapshot(page), before);

  // Kept with the valley for this seat, and listed.
  await expect(page.getByTestId('measure-saved')).toHaveAttribute('data-save', 'saved');
  await expect(page.getByTestId('measure-kept-run')).toHaveCount(1);
  await expect(page.getByTestId('measure-kept-run').first()).toContainText('You');

  // Copy puts the Markdown table on the clipboard.
  // The button says "Copied" for under two seconds, and a software-rendered page can take longer than
  // that between two polls: watch the button's text change in the page instead of polling for it.
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="measure-copy"]')!;
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    new MutationObserver(() => w.__said.push(el.textContent ?? '')).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.getByTestId('measure-copy').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __said: string[] }).__said), { timeout: 60_000 })
    .toContain('Copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('| Scene | Preset | Hour | Moving frame ms (avg / p95) |');
  expect(text.split('\n').filter((l) => /^\| (valley|village|town) \|/.test(l))).toHaveLength(ROWS);
  expect(text.split('\n').filter((l) => /^\| town \| (medium|high) \| 22:00 \|/.test(l))).toHaveLength(
    NIGHT_ROWS,
  );
  await page.getByTestId('measure-close').click();
  await expect(page.getByTestId('measure')).toHaveCount(0);

  // A second run, stopped with Escape inside the village showcase: the valley comes straight back.
  await page.getByTestId('menu-open').click();
  await page.getByTestId('settings-open').click();
  await page.getByTestId('measure-open').click();
  await expect(page.getByTestId('measure-kept-run')).toHaveCount(1);
  await page.getByTestId('measure-start').click();
  await expect(page.getByTestId('measure-progress')).toContainText('Village showcase', { timeout: 300_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('measure-stopped')).toContainText('back as it was', { timeout: 60_000 });
  await expect(page.getByTestId('measure-progress')).toHaveCount(0);
  expectSame(await snapshot(page), before);
  // A stopped run is not kept.
  await expect(page.getByTestId('measure-kept-run')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('measure')).toHaveCount(0);

  // And the valley still plays: the sim takes commands again.
  await page.evaluate(() =>
    (window.__qoti as unknown as { submit(cmd: unknown): number }).submit({ t: 'time.setSpeed', speed: 1 }),
  );
  await expect.poll(() => page.evaluate(() => window.__qoti.clock()?.speed)).toBe(1);
  await context.close();
});

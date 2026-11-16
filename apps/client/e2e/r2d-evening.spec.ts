import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { waitLive } from './helpers';

// R2D: a Village evening with places, read from the screen alone. The evening round's sim is still
// stand-ins (R2A to R2C), so `&evening` lays the mock evening over the village fixture: places at the
// wells and stalls, gaps (two open, one closed today by Bo), named streets, footfall and the edition.
// At 1250 x 800 (the owner's laptop window), by day and by lamplight.
const SHOTS = fileURLToPath(new URL('../../../docs/build/screenshots', import.meta.url));
const QUERY = '?debug&clean&quality=low&noguide&fixture=village&mock&evening';
const N = 192;

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/r2d-${name}.png`, animations: 'disabled' });
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1250, height: 800 });
  await page.goto(`/${QUERY}`);
  await waitLive(page);
  // The mocks land once the valley is up; wait for them.
  await page.waitForFunction(() => window.__qoti.places().length > 0, null, { timeout: 30_000 });
}

/** The well or stall nearest the start, and a tile of its place beside the building (not under it). */
async function aPlace(page: Page) {
  return page.evaluate((n) => {
    const p = window.__qoti.places().find((q) => q.source === 'host')!;
    const tile = p.tiles.find((t) => window.__qoti.roadAt(t % n, Math.floor(t / n)) === 0) ?? p.tile;
    return { id: p.id, name: p.name, x: tile % n, z: Math.floor(tile / n) };
  }, N);
}

test('each player can say what the other did for theirs today', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);

  for (const [light, hour] of [
    ['day', 13],
    ['lamp', 22],
  ] as const) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);

    // The Hearth: its strip says how evenings are going, the feed carries the gaps and a closed one.
    await page.getByTestId('lens-hearth').click();
    await expect(page.getByTestId('hearth-strip')).toBeVisible();
    await expect(page.getByTestId('hearth-evenings')).toContainText('27 of 40 out');
    await expect(page.getByTestId('hearth-gaps')).toContainText('2 gaps open');
    await expect(page.getByTestId('alerts')).toContainText('Closed by Bo');
    await expect(page.getByTestId('gap-tags')).toBeVisible();
    await shot(page, `hearth-${light}`);

    // The two inks: Town in the Hearth's View list stays on across the lens switch.
    await page.getByTestId('overlays').click();
    await page.getByTestId('overlay-town').click();
    await shot(page, `town-hearth-${light}`);
    await page.getByTestId('lens-ledger').click();
    await expect(page.getByTestId('overlays')).toContainText('Town');
    await expect(page.getByTestId('alerts')).toContainText('nothing to sell');
    await shot(page, `town-ledger-${light}`);
    await page.getByTestId('overlays').click();
    await page.getByTestId('overlay-town').click();
    await page.getByTestId('lens-hearth').click();
  }
  await page.evaluate(() => window.__qoti.setHour(13));

  // The edition: the day across both lanes, each seat credited by name.
  expect(await page.evaluate(() => window.__qoti.edition())).toBe(true);
  const edition = page.getByTestId('edition');
  await expect(edition).toBeVisible();
  await expect(edition).toContainText('Bo');
  await expect(edition).toContainText('Ada');
  await shot(page, 'edition-day');
  await page.evaluate(() => window.__qoti.setHour(22));
  await shot(page, 'edition-lamp');
  await page.getByTestId('edition-close').click();
  await expect(edition).toBeHidden();
  await page.evaluate(() => window.__qoti.setHour(13));
});

test('a click on a place opens its card; a resident shows their day', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await page.evaluate(() => window.__qoti.setHour(13));
  const place = await aPlace(page);
  await page.evaluate(([x, z]) => window.__qoti.focusTile(x, z, 12), [place.x, place.z] as const);
  await page.waitForTimeout(800);
  const at = await page.evaluate(([x, z]) => window.__qoti.screenOf(x, z), [place.x, place.z] as const);
  expect(at).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  const card = page.getByTestId('place-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(/its draw/i);
  await expect(page.getByTestId('place-draw-sum')).toContainText('=');
  await shot(page, 'place-card-day');
  await page.evaluate(() => window.__qoti.setHour(22));
  await shot(page, 'place-card-lamp');
  await page.keyboard.press('Escape');

  const id = await page.evaluate(() => window.__qoti.residentIds()[0]!);
  await page.evaluate((r) => window.__qoti.select({ kind: 'resident', id: r }), id);
  await expect(page.getByTestId('resident-day')).toBeVisible();
  await expect(page.getByTestId('day-words')).toContainText('Evenings:');
  await shot(page, 'day-lamp');
  await page.evaluate(() => window.__qoti.setHour(13));
  await shot(page, 'day-day');
});

test('the evening street brush marks a stretch, and undo clears it', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await page.getByTestId('lens-ledger').click();
  const run = await page.evaluate(() => window.__qoti.findRoadRun(5));
  expect(run).not.toBeNull();
  const [from, to] = [run![0]!, run![run!.length - 1]!];
  await page.evaluate(([x, z]) => window.__qoti.focusTile(x, z, 14), from);
  await page.waitForTimeout(800);
  await page.getByTestId('tool-evening').click();
  const a = await page.evaluate(([x, z]) => window.__qoti.screenOf(x, z), from);
  const b = await page.evaluate(([x, z]) => window.__qoti.screenOf(x, z), to);
  await page.mouse.move(a!.x, a!.y);
  await page.mouse.down();
  await page.mouse.move(b!.x, b!.y, { steps: 8 });
  await shot(page, 'brush');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(([x, z]) => window.__qoti.eveningAt(x, z), from)).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(([x, z]) => window.__qoti.eveningAt(x, z), from)).toBe(false);
});

test('the Hearth strip keeps to the bar at laptop widths', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  for (const width of [1250, 1280, 1366, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const lens of ['hearth', 'ledger'] as const) {
      await page.getByTestId(`lens-${lens}`).click();
      const strip = page.getByTestId(`${lens}-strip`);
      await expect(strip).toBeVisible();
      const over = await strip.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const bar = el.closest('.topbar')?.getBoundingClientRect() ?? box;
        const kids = [...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect());
        return (
          box.right > window.innerWidth ||
          kids.some((k) => k.width > 0 && (k.right > bar.right + 1 || k.bottom > bar.bottom + 1))
        );
      });
      expect(over, `${lens} strip overflows at ${width}px`).toBe(false);
    }
  }
});

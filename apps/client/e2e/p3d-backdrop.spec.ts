import { expect, test, type Page } from '@playwright/test';
import { DEBUG_QUERY, waitLive } from './helpers';

// P3D: the title's living backdrop: it fades in over the painted one, falls back to the painted one
// without WebGL, and leaves nothing running when the title does.

/** The first view's primary button: where a returning or new player lands first. */
const MENU_READY = '[data-testid=new-solo]';

/** Whatever the menu needs to start a solo valley (the menu may take more than one click). */
async function startSolo(page: Page): Promise<void> {
  await page.getByTestId('new-solo').click();
}

interface Stats {
  created: number;
  disposed: number;
  liveRenderers: number;
  liveWorkers: number;
  liveTimers: number;
  frames: number;
}

const stats = (page: Page) =>
  page.evaluate(() => ({ ...(window as unknown as { __qotiBackdrop: Stats }).__qotiBackdrop }));

async function expectQuiet(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const s = await stats(page);
      return [s.created === s.disposed, s.liveRenderers, s.liveWorkers, s.liveTimers];
    })
    .toEqual([true, 0, 0, 0]);
  const before = (await stats(page)).frames;
  await page.waitForTimeout(1000);
  expect((await stats(page)).frames).toBe(before);
  // Only the game's own WebGL canvas is left (the minimap has a 2D canvas of its own).
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  await expect(page.locator('.title-backdrop')).toHaveCount(0);
}

test('the live backdrop fades in over the painted one', async ({ page }) => {
  await page.goto('/?titleLight=day');
  // The painted one is there at once, and the menu works before the live one is ready.
  await expect(page.locator('.title-backdrop svg.painted')).toBeVisible();
  await expect(page.locator(MENU_READY)).toBeEnabled();
  await expect(page.locator('.title-backdrop')).toHaveAttribute('data-backdrop', 'live', { timeout: 90_000 });
  // It never takes focus or the pointer.
  const live = page.locator('.title-backdrop-live canvas');
  await expect(live).toHaveAttribute('tabindex', '-1');
  expect(await live.evaluate((c) => getComputedStyle(c).pointerEvents)).toBe('none');
  const marks = await page.evaluate(() => performance.getEntriesByName('qoti:backdrop-first-frame').length);
  expect(marks).toBe(1);
});

test('without WebGL the painted backdrop stays and the menu works', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...a: unknown[]
    ) {
      if (/webgl/.test(kind)) return null;
      return (get as (...args: unknown[]) => unknown).call(this, kind, ...a);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/?titleLight=dusk');
  await expect(page.locator('.title-backdrop svg.painted')).toBeVisible();
  await expect(page.locator('.title-backdrop svg.painted')).toHaveAttribute('data-light', 'dusk');
  await page.waitForTimeout(3000);
  await expect(page.locator('.title-backdrop')).toHaveAttribute('data-backdrop', 'painted');
  expect((await stats(page)).created).toBe(0);
  await expect(page.locator(MENU_READY)).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('leaving the title for a valley disposes the backdrop', async ({ page }) => {
  await page.goto(`/${DEBUG_QUERY}&titleLight=day`);
  await expect(page.locator('.title-backdrop')).toHaveAttribute('data-backdrop', 'live', { timeout: 90_000 });
  const during = await stats(page);
  expect([during.liveRenderers, during.liveWorkers]).toEqual([1, 1]);
  expect(during.liveTimers).toBeGreaterThan(0);
  await startSolo(page);
  await waitLive(page);
  await expectQuiet(page);
});

test('leaving while the backdrop is still loading leaves nothing behind', async ({ page }) => {
  await page.goto(`/${DEBUG_QUERY}&titleLight=day`);
  await expect(page.locator(MENU_READY)).toBeEnabled();
  await startSolo(page);
  await waitLive(page);
  await expectQuiet(page);
});

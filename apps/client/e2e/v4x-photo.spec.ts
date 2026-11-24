import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { waitLive } from './helpers';

// V4X: photo mode from open to a saved PNG, as a player does it (the round's "photo mode from open to
// saved PNG"; no spec covered Save PNG before). The camera button opens it and only its strip stays
// on screen; the hour slider moves the picture's light, not the valley's clock; Save PNG hands over a
// real PNG (it waits for the developed picture, at most PHOTO_DEVELOP_TIMEOUT_MS, then saves what it
// has); Escape puts the interface back. Software frames take seconds, so every wait is on a condition
// with a generous deadline, and the Save click is dispatched (Playwright's click would wait on the
// busy page for its own 30 s).

test('photo mode: open, the hour, Save PNG, back', async ({ page }) => {
  test.setTimeout(600_000);
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('/?debug&quality=medium&creative');
  await page.getByTestId('new-online').click();
  await waitLive(page);
  await page.getByRole('button', { name: 'Done' }).click();
  const clock = () => page.evaluate(() => window.__qoti.clock()?.speed);
  await page.evaluate(() =>
    (window.__qoti as unknown as { submit(c: unknown): number }).submit({ t: 'time.setSpeed', speed: 0 }),
  );
  await expect.poll(clock, { timeout: 60_000 }).toBe(0);
  const tick = () => page.evaluate(() => window.__qoti.clock()?.tick ?? null);
  const before = await tick();

  // The camera button: only the strip stays.
  await page.getByTestId('photo-open').click();
  const strip = page.getByTestId('photo-strip');
  await expect(strip).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.toolbar')).toHaveCount(0);
  await expect(page.locator('.topbar')).toHaveCount(0);

  // The hour slider changes the picture's light only.
  await page.getByTestId('photo-time').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '18';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(strip).toContainText('18:00', { timeout: 30_000 });
  expect(await tick()).toBe(before);

  // Save PNG: a real PNG, the size of the canvas or larger (photo mode may draw up to 1.5x).
  const download = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByTestId('photo-save').dispatchEvent('click');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  const path = await file.path();
  const png = readFileSync(path);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  expect(canvas).not.toBeNull();
  expect(width).toBeGreaterThanOrEqual(Math.floor(canvas!.w * 0.99));
  expect(height).toBeGreaterThanOrEqual(Math.floor(canvas!.h * 0.99));

  // Escape: the interface comes back and the strip goes.
  await page.keyboard.press('Escape');
  await expect(strip).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.toolbar')).toBeVisible({ timeout: 60_000 });
});

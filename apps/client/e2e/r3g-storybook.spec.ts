import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { layInPictures, layInTownBook, openStorybook } from './r3g-steps.mjs';

// R3G: the printed storybook of a real autoplayed Village (the charter sealed on day 23) opens from
// the chapter card, holds its parts, prints to A4 and US Letter, and leaves printing alone once closed.

const valley = fileURLToPath(new URL('./r3g-hazel.qoti', import.meta.url));

function pageCount(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

function firstMediaBox(pdf: Buffer): number[] | null {
  const m = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*([\d.\s-]+)\]/);
  return m ? m[1]!.trim().split(/\s+/).map(Number) : null;
}

test('the storybook opens with its parts, prints at A4 and Letter, and closes clean', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1250, height: 800 });
  await openStorybook(page, baseURL ?? 'http://localhost:5173', valley, async () => {
    await layInPictures(page, 6);
    await layInTownBook(page);
  });

  const panel = page.getByTestId('storybook');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Chronicle');

  const root = page.locator('.storybook-print');
  const map = root.locator('img[data-testid="storybook-map"]');
  await expect(map).toHaveCount(1);
  expect(await map.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await root.locator('[data-testid="storybook-entry-picture"] img').count()).toBeGreaterThan(0);
  await expect(root.locator('[data-testid="storybook-page-townBook"]')).toHaveCount(1);
  expect(await root.locator('[data-testid="storybook-page-patternBook"]').count()).toBeGreaterThan(0);

  // Nothing after the chapter's end is in the Chronicle part.
  const expected = await page.evaluate(() => {
    const m = window.__qoti.mirror();
    const end = m.chronicle.value.find((e: { kind: string }) => e.kind === 'trial-passed')?.tick;
    return m.chronicle.value.filter((e: { tick: number }) => end !== undefined && e.tick <= end).length;
  });
  expect(expected).toBeGreaterThan(0);
  expect(await root.locator('.sb-entry').count()).toBe(expected);

  for (const [label, width, height, key] of [
    ['A4', 595, 842, 'a4'],
    ['US Letter', 612, 792, 'letter'],
  ] as const) {
    await page.getByTestId('storybook-paper').getByLabel(label).check();
    await page.waitForTimeout(200);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    writeFileSync(testInfo.outputPath(`storybook-${key}.pdf`), pdf);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(200_000);
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(6);
    const box = firstMediaBox(pdf);
    expect(box, `${label} MediaBox`).not.toBeNull();
    expect(Math.abs(box![2]! - width)).toBeLessThan(2);
    expect(Math.abs(box![3]! - height)).toBeLessThan(2);
  }

  await page.getByTestId('storybook-close').click();
  await expect(page.getByTestId('storybook')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('qoti-storybook'))).toBe(false);
  await expect(page.locator('.storybook-print')).toHaveCount(0);
});

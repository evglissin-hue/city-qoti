// R3G: the storybook on P3B's layout. The chapter card with its Print line, the storybook open in
// both lenses by day and by lamplight, and the Books shelf with the storybook on it.
//
//   node apps/client/e2e/r3g-layout.mjs [out dir] [base url]
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { layInPictures, openStorybook } from './r3g-steps.mjs';

const out = process.argv[2] ?? fileURLToPath(new URL('../../../docs/build/screenshots/', import.meta.url));
const base = process.argv[3] ?? 'http://localhost:5248';
const valley = fileURLToPath(new URL('./r3g-hazel.qoti', import.meta.url));
mkdirSync(out, { recursive: true });

// QOTI_CHROMIUM points at a Chromium when the installed Playwright's own is missing.
const browser = await chromium.launch(
  process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1250, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));

await openStorybook(page, base, valley, async () => {
  await layInPictures(page, 14);
  await page.evaluate(() => window.__qoti.setHour(13));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/r3g-chapter-card.png` });
});

const settle = () => page.waitForTimeout(900);
for (const lens of ['hearth', 'ledger']) {
  await page.evaluate((l) => window.__qoti.setLens(l), lens);
  if ((await page.getByTestId('storybook').count()) === 0) await page.evaluate(() => window.__qoti.openPanel('storybook'));
  for (const [name, hour] of [
    ['day', 13],
    ['lamplight', 20.5],
  ]) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    await settle();
    await page.screenshot({ path: `${out}/r3g-layout-${lens}-${name}.png` });
  }
  await page.evaluate(() => window.__qoti.setHour(13));
  await page.getByTestId('books').click();
  await page.getByTestId('books-list').waitFor();
  await settle();
  await page.screenshot({ path: `${out}/r3g-shelf-${lens}.png` });
  await page.getByTestId('books').click();
}
console.log('layout shots');
await browser.close();

// R3G: prints the storybook of a real autoplayed Village to PDF, at A4 and US Letter, and turns the
// pages into images for reading. The valley is e2e/r3g-hazel.qoti (the bench's autoplayer, seed
// hazel, 30 days: the Village Charter sealed on day 23, so the chapter closes there and the days
// after it stay out of the book).
//
//   node apps/client/e2e/r3g-print.mjs [out dir] [base url]
//
// A valley opened from a file carries no Chronicle snapshots (pictures stay out of .qoti files), so
// the script takes the valley's own pictures the way the photographer would: the camera on each
// notable entry's spot, a 4:3 crop of the canvas, laid into the session's snapshots. The Town Book
// is blank until R3C finds pages, so one sample page (R3C's view shape) is laid in to show its slot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { layInPictures, layInTownBook, openStorybook } from './r3g-steps.mjs';

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
  // R3G_PICTURE_HOUR=21 takes the pictures by lamplight, to see dark pictures lifted for print.
  await layInPictures(page, 14, Number(process.env.R3G_PICTURE_HOUR ?? 13));
  await layInTownBook(page);
});
await page.screenshot({ path: `${out}/r3g-panel-1250.png` });
const lifted = await page.evaluate(() => [
  document.querySelectorAll('.storybook-print .sb-picture').length,
  document.querySelectorAll('.storybook-print .sb-picture.dim').length,
]);
console.log(`pictures ${lifted[0]}, lifted for print ${lifted[1]}`);
console.log('panel shot');

for (const paper of ['a4', 'letter']) {
  await page
    .getByTestId('storybook-paper')
    .getByLabel(paper === 'a4' ? 'A4' : 'US Letter')
    .check();
  await page.waitForTimeout(200);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const file = `${out}/r3g-storybook-${paper}.pdf`;
  writeFileSync(file, pdf);
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  console.log(paper, info.match(/Pages:\s+\d+/)?.[0], info.match(/Page size:.*/)?.[0]);
  execFileSync('pdftoppm', ['-png', '-r', '90', file, `${out}/r3g-${paper}-page`]);
}
await browser.close();

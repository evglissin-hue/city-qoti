import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { waitLive } from './helpers';

// P2-B: the top bar reads at laptop widths. For every element inside the bar: its text does not
// overflow its own box (the Charter's name may ellipsize, by design), it stays inside the bar and
// inside its own pill or chip, and the goal's words are whole.
const SHOTS = fileURLToPath(new URL('../../../docs/build/screenshots', import.meta.url));
const QUERY = '?debug&quality=low&fixture=hamlet';
const SIZES = [
  { width: 1250, height: 680 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
] as const;

interface Problem {
  what: string;
  why: string;
}

for (const { width, height } of SIZES) {
  test(`the top bar fits and reads at ${width}x${height}, in both lenses`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    await page.goto(`/${QUERY}`);
    await waitLive(page);
    await expect(page.getByTestId('goal-pill')).toBeVisible();

    for (const lens of ['ledger', 'hearth'] as const) {
      await page.getByTestId(`lens-${lens}`).click();
      await expect(page.getByTestId(`${lens}-strip`)).toBeVisible();
      await page.waitForTimeout(400);

      const problems = await page.evaluate((): Problem[] => {
        const out: Problem[] = [];
        const bar = document.querySelector('.topbar');
        if (!bar) return [{ what: '.topbar', why: 'missing' }];
        const barBox = bar.getBoundingClientRect();
        const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
        const inside = (inner: DOMRect, outer: DOMRect) =>
          inner.left >= outer.left - 1 &&
          inner.right <= outer.right + 1 &&
          inner.top >= outer.top - 1 &&
          inner.bottom <= outer.bottom + 1;
        for (const el of bar.querySelectorAll('*')) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue; // not drawn (hidden by a query)
          if (getComputedStyle(el).display === 'none') continue;
          const label = name(el);
          // The Charter's name is the one thing allowed to ellipsize.
          const ellipsizes = el.classList.contains('goal-name');
          if (!ellipsizes && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
            // Inline boxes report 0 for clientWidth; real overflow is on block and flex boxes.
            out.push({ what: label, why: `text overflows its box (${el.scrollWidth} > ${el.clientWidth})` });
          }
          if (!inside(box, barBox)) out.push({ what: label, why: 'sticks out of the top bar' });
          const holder = el.closest('.goal-pill, .balance-chip, .demand-bar, .winter-reserve, .strip-chip');
          if (holder && holder !== el && !inside(box, holder.getBoundingClientRect())) {
            out.push({ what: label, why: `sticks out of its ${name(holder)}` });
          }
        }
        return out;
      });
      expect(problems, `${width}px ${lens}: ${JSON.stringify(problems)}`).toEqual([]);

      // The goal's words are whole: no ellipsis, nothing clipped.
      const words = page.locator('[data-testid="goal-pill"] .goal-words');
      await expect(words).toBeVisible();
      const fit = await words.evaluate((el) => ({
        text: el.textContent ?? '',
        clipped: el.scrollWidth > el.clientWidth + 1,
        cut: getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth,
      }));
      expect(fit.text.length).toBeGreaterThan(0);
      expect(fit.clipped || fit.cut, `the goal "${fit.text}" is cut at ${width}px`).toBe(false);

      if (lens === 'ledger') {
        // Words on the strip: the chips say their family and days read as days.
        await expect(page.getByTestId('balance-food').locator('.chip-label')).toHaveText('Food');
        await expect(page.getByTestId('balance-materials').locator('.chip-label')).toHaveText('Materials');
        await expect(page.getByTestId('balance-food').locator('.cover-days')).toHaveText(/^\d+\+?d$/);
      }

      const box = await page.locator('.topbar').boundingBox();
      if (!box) throw new Error('no top bar');
      await page.screenshot({
        path: `${SHOTS}/p2-topbar-${width}-${lens}.png`,
        animations: 'disabled',
        clip: {
          x: 0,
          y: Math.max(0, box.y - 6),
          width,
          height: Math.min(height, box.height + 16),
        },
      });
    }
  });
}

import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { GUIDE_QUERY } from './helpers';

// C5H acceptance: a new standard valley opens the County surveyor's first letter on both seats,
// with an arrow at the tool it is about; finishing the step (a Forester's Lodge with its door on
// the lane) opens the next on both screens; one seat hiding the guide leaves it on the other; and a
// valley made with the box unticked shows nothing. Commands go in through the debug hook; the
// letters, cards and arrows are the real interface.

const shots = () => `${test.info().project.testDir}/../../../docs/build/screenshots`;

// Two SwiftShader pages on a shared machine are slow: be patient rather than flaky.
const expect = baseExpect.configure({ timeout: 120_000 });

interface GuideLike {
  step: number;
  id: string;
  hidden: boolean[];
  over: boolean;
}

const guide = (p: Page) =>
  p.evaluate(() => (window.__qoti as unknown as { guide(): GuideLike | null }).guide());
const submit = (p: Page, cmd: unknown) =>
  p.evaluate((c) => (window.__qoti as unknown as { submit(c: unknown): number }).submit(c), cmd);

async function waitLive(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240_000 });
}

async function twoSeats(browser: Browser) {
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await a.goto(`/${GUIDE_QUERY}`);
  await baseExpect(a.getByTestId('guide-new')).toBeChecked();
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const invite = new URL(link);
  invite.search = GUIDE_QUERY;
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  return { a, b };
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('the first letter, its arrow, the next step on both screens, and hiding per seat', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const { a, b } = await twoSeats(browser);

  // Both seats get the first letter, with the hint as a P.S. and the way to skip.
  for (const p of [a, b]) {
    const letter = p.getByTestId('guide-letter');
    await expect(letter).toBeVisible();
    await baseExpect(letter).toHaveAttribute('data-step', 'lane-to-gate');
    await baseExpect(letter).toContainText('Tobias Merriweather');
    await baseExpect(p.getByTestId('guide-ps')).toContainText('P.S.');
    await baseExpect(p.getByTestId('guide-skip')).toBeVisible();
  }
  await a.screenshot({ path: `${shots()}/c5h-first-letter.png` });

  // Put away, the letter becomes the corner card, and an arrow points at the lane tool (or the
  // Ledger switch when seat 0 is in the Hearth).
  for (const p of [a, b]) await p.getByTestId('guide-letter-close').click();
  for (const p of [a, b]) {
    await expect(p.getByTestId('guide-card')).toHaveAttribute('data-step', 'lane-to-gate');
    await expect(p.getByTestId('guide-arrow').first()).toBeVisible();
  }
  const targets = await a
    .getByTestId('guide-arrow')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-target')));
  expect(targets.some((t) => t === 'tool-lane' || t === 'lens-ledger')).toBe(true);
  await a.screenshot({ path: `${shots()}/c5h-card-and-arrow.png` });
  // With the tool in hand the toolbar arrow has done its job.
  await a.getByTestId('lens-ledger').click();
  await a.getByTestId('tool-lane').click();
  await expect
    .poll(() =>
      a.getByTestId('guide-arrow').evaluateAll((els) => els.map((e) => e.getAttribute('data-target'))),
    )
    .not.toContain('tool-lane');
  await a.keyboard.press('Escape');

  // A Forester's Lodge with its door on the lane: the step ticks within the hour and the next opens on both.
  const spot = await a.evaluate(() =>
    (
      window.__qoti as unknown as { findRoadSpot(d: string): { x: number; z: number; rot: number } | null }
    ).findRoadSpot('foresters-lodge'),
  );
  expect(spot).not.toBeNull();
  await submit(a, { t: 'build.place', def: 'foresters-lodge', x: spot!.x, z: spot!.z, rot: spot!.rot });
  await a.getByTestId('speed-3').click();
  await b.getByTestId('speed-3').click();
  for (const p of [a, b]) {
    await expect(p.getByTestId('guide-card')).toHaveAttribute('data-step', 'first-homes');
  }
  await a.screenshot({ path: `${shots()}/c5h-second-step.png` });

  // Seat 1 hides the guide in Settings: gone for seat 1, still there for seat 0, progress shared.
  await b.getByTestId('settings-open').click();
  await b.getByTestId('guide-setting').uncheck();
  await expect.poll(async () => (await guide(b))?.hidden[1]).toBe(true);
  await b.getByTestId('settings').locator('.actions .primary').click();
  await expect(b.getByTestId('guide-card')).toHaveCount(0);
  await expect(a.getByTestId('guide-card')).toBeVisible();
  expect((await guide(a))?.step).toBe((await guide(b))?.step);
});

test('a valley made with the box unticked shows no guide', async ({ browser }) => {
  test.setTimeout(600_000);
  const p = await (await browser.newContext()).newPage();
  await p.goto(`/${GUIDE_QUERY}`);
  await p.getByTestId('guide-new').uncheck();
  await p.getByTestId('new-solo').click();
  await waitLive(p);
  await expect.poll(async () => (await guide(p))?.over).toBe(true);
  // Give the interface a moment to have drawn anything it was going to.
  await p.waitForTimeout(2000);
  await baseExpect(p.getByTestId('guide-letter')).toHaveCount(0);
  await baseExpect(p.getByTestId('guide-card')).toHaveCount(0);
  await baseExpect(p.getByTestId('guide-arrow')).toHaveCount(0);
});

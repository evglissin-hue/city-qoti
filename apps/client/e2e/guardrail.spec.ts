import { expect, test } from '@playwright/test';
import { clickTile, counts, DEBUG_QUERY, waitLive } from './helpers';

// The two seats' pages close after the test: left open, their valley kept running in the shared
// browser through every later spec and starved the next one's start-up (hamlet's new valley).
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

// Guardrail: removing the partner's handmade decor asks first and leaves them a note.
test("removing the partner's decor asks first and leaves them a note", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await a.goto(`/${DEBUG_QUERY}`);
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();

  const b = await (await browser.newContext()).newPage();
  const invite = new URL(link);
  invite.search = DEBUG_QUERY;
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);

  // Seat 2 places a bench; seat 1 sees it.
  await b.getByTestId('tool-decor').click();
  await b.getByTestId('variant-bench').click();
  const bench = await b.evaluate(() => window.__qoti.findDecorSpot('bench'));
  expect(bench).not.toBeNull();
  await clickTile(b, bench!.tile);
  await expect.poll(async () => (await counts(a)).decor).toBe(1);
  const notesBefore = (await counts(b)).notes;

  // Seat 1 erases it: the confirmation shows, with an optional reason.
  await a.getByTestId('tool-erase').click();
  await clickTile(a, bench!.tile);
  await expect(a.getByTestId('removal-confirm')).toBeVisible();
  await a.getByTestId('removal-reason').fill('Making room for the well');
  await a.getByTestId('removal-ok').click();
  await expect(a.getByTestId('removal-confirm')).toBeHidden();

  // The bench is gone on both sides and seat 2 has a note about it.
  await expect.poll(async () => (await counts(a)).decor).toBe(0);
  await expect.poll(async () => (await counts(b)).decor).toBe(0);
  await expect.poll(async () => (await counts(b)).notes).toBe(notesBefore + 1);
});

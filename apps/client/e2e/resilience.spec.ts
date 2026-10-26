import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { DEBUG_QUERY, hashesAt, waitLive } from './helpers';

// Contexts made from the shared browser outlive their test unless closed; two seats left rendering
// in the background starve the next test's seats on a GPU-less runner.
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of contexts.splice(0)) await c.close();
});

/** Seat 0 creates an online valley, seat 1 joins it from the invite link. */
async function pair(browser: Browser): Promise<{ a: Page; b: Page; offline: (v: boolean) => Promise<void> }> {
  const contextA = await browser.newContext();
  contexts.push(contextA);
  const a = await contextA.newPage();
  await a.goto(`/${DEBUG_QUERY}`);
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();
  const contextB = await browser.newContext();
  contexts.push(contextB);
  const b = await contextB.newPage();
  const invite = new URL(link);
  invite.search = DEBUG_QUERY;
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  return { a, b, offline: (v) => contextB.setOffline(v) };
}

// Acceptance: corrupt one client, it resyncs from the longest-connected seat, hashes match again.
test('a corrupted seat resyncs and agrees again', async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b } = await pair(browser);
  await b.evaluate(() => window.__qoti.corrupt());
  await expect.poll(() => b.evaluate(() => window.__qoti.resyncs()), { timeout: 30_000 }).toBeGreaterThan(0);
  await waitLive(b);
  const from = await b.evaluate(() => window.__qoti.lastTurn());
  const h = await hashesAt(a, b, from + 1);
  expect(h.b).toBe(h.a);
});

// Acceptance: drop the network for 10 s on one client, it reconnects and catches up.
test('a seat that loses the network for 10 s reconnects and catches up', async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b, offline } = await pair(browser);
  await offline(true);
  await b.waitForTimeout(10_000);
  await offline(false);
  await expect.poll(() => b.evaluate(() => window.__qoti.status()), { timeout: 45_000 }).toBe('live');
  const turnA = await a.evaluate(() => window.__qoti.lastTurn());
  await expect
    .poll(() => b.evaluate(() => window.__qoti.lastTurn()), { timeout: 30_000 })
    .toBeGreaterThan(turnA);
  const h = await hashesAt(a, b, turnA + 1);
  expect(h.b).toBe(h.a);
});

import { expect as baseExpect, test, type Page } from '@playwright/test';
import { counts, HAMLET_QUERY, hashesAt } from './helpers';

// C4D acceptance: plans and requests round trip through the sim and both clients. Seat 0 sketches
// a plan, seat 1 sees the ghost proposal, comments and approves it, and both see the bench it
// builds; seat 1 asks seat 0 for planks and the request closes itself when the town has them; a
// text request is closed by hand by the other seat. Then a solo valley moves online and a partner
// joins it with everything in place. Commands go in through the debug hook (the panels are
// C4F's); everything else is the real relay, sims and mirrors.

// Two SwiftShader pages on a shared machine are slow: be patient rather than flaky.
const expect = baseExpect.configure({ timeout: 120_000 });

async function waitLive(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240_000 });
}

interface PlanLike {
  id: number;
  name: string;
  by: number;
  status: string;
  seenBy: number[];
  comments: { by: number; text: string }[];
  items: unknown[];
  applied?: number;
  skipped?: number;
}
interface RequestLike {
  id: number;
  from: number;
  status: string;
  text: string;
  ask: { kind: string };
}

const plans = (p: Page) => p.evaluate(() => (window.__qoti as unknown as { plans(): PlanLike[] }).plans());
const requests = (p: Page) =>
  p.evaluate(() => (window.__qoti as unknown as { requests(): RequestLike[] }).requests());
const submit = (p: Page, cmd: unknown) =>
  p.evaluate((c) => (window.__qoti as unknown as { submit(c: unknown): number }).submit(c), cmd);

async function twoSeats(browser: import('@playwright/test').Browser) {
  const a = await (await browser.newContext()).newPage();
  await a.goto(`/${HAMLET_QUERY}`);
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();
  const b = await (await browser.newContext()).newPage();
  const invite = new URL(link);
  invite.search = HAMLET_QUERY;
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  return { a, b };
}

// Each test opens its own pages; close them so the next test is not sharing the CPU with them.
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('plans and requests round trip between two seats', async ({ browser }) => {
  test.setTimeout(900_000);
  const { a, b } = await twoSeats(browser);
  expect(await a.evaluate(() => window.__qoti.mode())).toBe('standard');

  // Seat 0 sketches a bench as a plan: nothing is built yet, seat 1 sees the proposal.
  const spot = await a.evaluate(() => window.__qoti.findDecorSpot('bench'));
  expect(spot).not.toBeNull();
  const decorBefore = (await counts(b)).decor;
  const bench = { t: 'decor.place', def: 'bench', fx: spot!.fx, fz: spot!.fz, rot: 0 };
  await submit(a, { t: 'plan.add', name: 'A bench to sit on', items: [{ cmd: bench }] });
  await expect.poll(async () => (await plans(b)).map((p) => p.name)).toContain('A bench to sit on');
  const planId = (await plans(b)).find((p) => p.name === 'A bench to sit on')!.id;
  expect((await plans(b)).find((p) => p.id === planId)).toMatchObject({ by: 0, status: 'open', seenBy: [0] });
  expect((await counts(b)).decor).toBe(decorBefore);

  // Seat 1 looks, comments; seat 0 sees both.
  await submit(b, { t: 'plan.seen', id: planId });
  await submit(b, { t: 'plan.comment', id: planId, text: 'Lovely. Facing the well, though?' });
  await expect
    .poll(async () => (await plans(a)).find((p) => p.id === planId)?.comments.map((c) => c.text))
    .toEqual(['Lovely. Facing the well, though?']);
  expect((await plans(a)).find((p) => p.id === planId)!.seenBy).toEqual([0, 1]);

  // Seat 0 tweaks it (turned round); seat 1 is asked to look again.
  await submit(a, { t: 'plan.edit', id: planId, items: [{ cmd: { ...bench, rot: 32 } }] });
  await expect.poll(async () => (await plans(b)).find((p) => p.id === planId)?.seenBy).toEqual([0]);

  // Seat 1 approves: the real command runs, and both seats see the bench.
  await submit(b, { t: 'plan.approve', id: planId });
  await expect
    .poll(async () => (await plans(a)).find((p) => p.id === planId))
    .toMatchObject({ status: 'approved', applied: 1, skipped: 0 });
  await expect.poll(async () => (await counts(a)).decor).toBe(decorBefore + 1);
  await expect.poll(async () => (await counts(b)).decor).toBe(decorBefore + 1);

  // Requests: seat 1 asks for planks (the start has 50), seat 0 for something only words can do.
  await submit(b, { t: 'request.add', ask: { kind: 'goods', good: 'planks', qty: 10, byDay: 3, at: 0 } });
  await submit(a, {
    t: 'request.add',
    ask: { kind: 'text', text: 'Could we keep the meadow by the river?' },
  });
  await expect.poll(async () => (await requests(a)).length).toBe(2);
  await expect.poll(async () => (await requests(b)).length).toBe(2);
  const text = (await requests(b)).find((r) => r.ask.kind === 'text')!;
  expect(text).toMatchObject({ from: 0, status: 'open', text: 'Could we keep the meadow by the river?' });
  // Fast forward together so the hourly request pass comes round quickly.
  await a.getByTestId('speed-3').click();
  await b.getByTestId('speed-3').click();
  await expect.poll(async () => (await requests(a)).find((r) => r.ask.kind === 'goods')?.status).toBe('done');
  await expect.poll(async () => (await requests(b)).find((r) => r.ask.kind === 'goods')?.status).toBe('done');
  expect((await requests(b)).find((r) => r.ask.kind === 'goods')!.text).toContain('10 planks');
  // The text request waits for a person: seat 1 marks it done.
  expect((await requests(a)).find((r) => r.id === text.id)!.status).toBe('open');
  await submit(b, { t: 'request.resolve', id: text.id, status: 'done' });
  await expect.poll(async () => (await requests(a)).find((r) => r.id === text.id)?.status).toBe('done');

  // And both sims agree on every last plank.
  const turn = await a.evaluate(() => window.__qoti.lastTurn());
  const after = await hashesAt(a, b, turn + 50);
  expect(after.a).toBe(after.b);
});

test('a solo valley moves online and a partner joins it', async ({ browser }) => {
  test.setTimeout(900_000);
  const a = await (await browser.newContext()).newPage();
  await a.goto(`/${HAMLET_QUERY}`);
  await a.getByTestId('new-solo').click();
  await waitLive(a);
  await expect(a.getByTestId('connection')).toHaveText('Solo');
  const soloId = await a.evaluate(() => window.__qoti.valleyId());
  // Leave a mark to look for: a note by the town hall.
  const spot = await a.evaluate(() => window.__qoti.findDecorSpot('bench'));
  await submit(a, { t: 'note.pin', x: spot!.tile[0], z: spot!.tile[1], text: 'Moved, not copied.' });
  await expect.poll(async () => (await counts(a)).notes).toBe(1);
  const before = await counts(a);

  await a.getByTestId('settings-open').click();
  await a.getByTestId('move-online').click();
  await a.getByTestId('move-online-yes').click();
  // The online valley opens with the invite for seat 1 on screen.
  await expect(a.getByTestId('invite-link')).toHaveValue(/#v=[0-9a-f]{32}&s=1&k=[0-9a-f]{32}$/);

  await waitLive(a);
  const onlineId = await a.evaluate(() => window.__qoti.valleyId());
  expect(onlineId).not.toBe(soloId);
  expect(await a.evaluate(() => window.__qoti.status())).toBe('live');
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();
  expect(await counts(a)).toMatchObject({ buildings: before.buildings, notes: 1 });

  const b = await (await browser.newContext()).newPage();
  const invite = new URL(link);
  invite.search = HAMLET_QUERY;
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  expect(await counts(b)).toMatchObject({ buildings: before.buildings, notes: 1, roads: before.roads });
  expect(await b.evaluate(() => window.__qoti.mode())).toBe('standard');
  const turn = await a.evaluate(() => window.__qoti.lastTurn());
  const after = await hashesAt(a, b, turn + 50);
  expect(after.a).toBe(after.b);
});

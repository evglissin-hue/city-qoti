import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { waitLive } from './helpers';

// V4C acceptance: after 90 s without input the camera watches the town and any input puts the exact
// view back; guards keep it off; a seat's tea break sends nothing. Time is moved on with the debug
// hook (`__qotiTeaBreak.skip`) instead of waiting it out. Under Playwright tea breaks are off unless
// the URL says `teabreak`.

const expect = baseExpect.configure({ timeout: 120_000 });

const QUERY = '?debug&quality=low&noguide&teabreak&fixture=grown';
// Two seats share the sim's village fixture. A fresh hamlet paused at 06:00 has nobody out and
// nothing walked, so (rightly) nothing to watch and no tea break; the grown village has plenty, but
// a joiner catching up on it took over the 120 s `waitLive` allows on a slow CI runner.
const ONLINE_QUERY = '?debug&quality=low&noguide&teabreak&fixture=village';

interface View {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}
interface Hook {
  skip(ms: number): void;
  check(): void;
  state(): { plan: { kind: string }; still: boolean; saved: View } | null;
  idleFor(): number;
  due(): boolean;
}
type Rig = { saveView(): View; orbiting: boolean };
type Rend = { rig: Rig; camera: { position: { x: number; y: number; z: number } } };

const call = (page: Page, name: 'state' | 'due' | 'check' | 'idleFor') =>
  page.evaluate(
    (n) => (window as unknown as { __qotiTeaBreak: Record<string, () => unknown> }).__qotiTeaBreak[n]!(),
    name,
  );
const state = (p: Page) => call(p, 'state') as Promise<ReturnType<Hook['state']>>;
const due = (p: Page) => call(p, 'due') as Promise<boolean>;
const skip = (p: Page, ms: number) =>
  p.evaluate((m) => (window as unknown as { __qotiTeaBreak: Hook }).__qotiTeaBreak.skip(m), ms);
const view = (p: Page) =>
  p.evaluate(() => {
    const r = (window.__qoti as unknown as { renderer(): Rend }).renderer();
    const c = r.camera.position;
    return {
      goal: r.rig.saveView(),
      pos: [c.x, c.y, c.z] as [number, number, number],
      orbiting: r.rig.orbiting,
    };
  });

/** Puts away every card the tea break's guard lists (the grown fixture opens a festival card). */
async function closeCards(page: Page, keep: string[] = []): Promise<void> {
  await page.evaluate((keep) => {
    const w = window as unknown as {
      __qotiTeaBreak: { guards(): { open: string[] } };
      __qoti: { setUi(n: string, v: unknown): void };
    };
    const bool = ['settingsOpen', 'chapter', 'inviteOpen', 'helpOpen', 'asking'];
    for (const n of w.__qotiTeaBreak.guards().open)
      if (!keep.includes(n)) w.__qoti.setUi(n, bool.includes(n) ? false : null);
  }, keep);
}

async function open(page: Page, query = QUERY): Promise<void> {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${query}`);
  await waitLive(page);
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __qotiTeaBreak?: unknown }).__qotiTeaBreak))
    .toBe(true);
  // The grown fixture opens with a festival card up, which is itself a guard: put it away.
  await closeCards(page);
  // Let the first frames settle so the camera is at rest before the view is recorded.
  await page.waitForTimeout(1500);
}

/** Starts a tea break by skipping 90 s; waits until it runs and the camera has moved. */
async function startBreak(page: Page) {
  await skip(page, 90_000);
  await expect.poll(() => state(page)).not.toBeNull();
  const before = await view(page);
  await expect.poll(async () => (await view(page)).pos.join() !== before.pos.join()).toBe(true);
}

/** Ends any tea break, starts the idle count over and lets the camera settle before a test records its view. */
async function fresh(page: Page): Promise<void> {
  await page.keyboard.press('Shift');
  await closeCards(page);
  await page.waitForTimeout(1500);
  expect(await state(page)).toBeNull();
}

// The tests that need a live tea break share one page in the grown village (a load is most of a
// test's time on a runner); each starts from `fresh`, so none leans on what the one before left.
test.describe.serial('one seat, one page', () => {
  test.setTimeout(300_000);
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    page = await (await browser.newContext()).newPage();
    await open(page);
  });
  test.afterAll(async () => {
    await page.context().close();
  });

  for (const how of ['key', 'click', 'wheel'] as const) {
    test(`a ${how} ends the tea break and the view is exactly back`, async () => {
      await fresh(page);
      const saved = await view(page);
      await startBreak(page);
      const during = await view(page);
      expect(during.pos.join()).not.toBe(saved.pos.join());
      if (how === 'key') await page.keyboard.press('Shift');
      else if (how === 'click') await page.mouse.click(640, 400);
      else {
        await page.mouse.move(640, 400);
        await page.mouse.wheel(0, 0);
      }
      expect(await state(page)).toBeNull();
      const after = await view(page);
      expect(after.goal).toEqual(saved.goal);
      expect(after.pos).toEqual(saved.pos);
      expect(after.orbiting).toBe(false);
      // A click inspects whatever it lands on: put the card away for the next test.
      await closeCards(page);
    });
  }

  test('a pan key restores, then pans from the restored view', async () => {
    await fresh(page);
    const saved = await view(page);
    await startBreak(page);
    await page.keyboard.down('w');
    await page.waitForTimeout(600);
    await page.keyboard.up('w');
    expect(await state(page)).toBeNull();
    const after = await view(page);
    // Panned from the saved spot: the goal moved only a little off it, not off to the watched place.
    expect(Math.hypot(after.goal.x - saved.goal.x, after.goal.z - saved.goal.z)).toBeLessThan(30);
    expect(after.goal.distance).toBe(saved.goal.distance);
    expect(after.goal.yaw).toBe(saved.goal.yaw);
  });

  test('88 s alone does not start one, two more seconds do', async () => {
    await fresh(page);
    // `fresh` lets 1.5 s of real time pass after its key, and real time counts as idle too: a key
    // right here starts the count over, then a margin is left.
    await page.keyboard.press('Shift');
    await skip(page, 88_000);
    await page.waitForTimeout(600);
    expect(await state(page)).toBeNull();
    await skip(page, 2_000);
    expect(await state(page)).not.toBeNull();
  });

  test('guards: a tool in hand, a card open', async () => {
    await fresh(page);
    // A tool in hand.
    await page.evaluate(() =>
      (window.__qoti as unknown as { selectTool(id: string): void }).selectTool('erase'),
    );
    expect(await due(page)).toBe(false);
    await skip(page, 90_000);
    await page.waitForTimeout(600);
    expect(await state(page)).toBeNull();
    // A card open (the settings card), opened in the same step as the tool goes away: the idle time
    // skipped is still there, so with neither guard up the host would start a tea break at its next check.
    await page.evaluate(() => {
      const q = window.__qoti as unknown as {
        selectTool(id: string): void;
        setUi(n: string, v: unknown): void;
      };
      q.setUi('settingsOpen', true);
      q.selectTool('inspect');
    });
    await skip(page, 90_000);
    await page.waitForTimeout(600);
    expect(await state(page)).toBeNull();
    expect(await due(page)).toBe(false);
    await page.evaluate(() =>
      (window.__qoti as unknown as { setUi(n: string, v: unknown): void }).setUi('settingsOpen', false),
    );
    // Cleared guards: it does start (proves the guards were what held it back).
    await skip(page, 1_000);
    expect(await state(page)).not.toBeNull();
    await page.keyboard.press('Shift');
  });
});

test.describe('one seat', () => {
  test.setTimeout(300_000);
  test('the setting off keeps it off after a reload', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const key = 'qoti.settings.v1';
      const cur = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...cur, teaBreak: false }));
    });
    await page.reload();
    await waitLive(page);
    await expect
      .poll(() => page.evaluate(() => !!(window as unknown as { __qotiTeaBreak?: unknown }).__qotiTeaBreak))
      .toBe(true);
    await skip(page, 200_000);
    await page.waitForTimeout(600);
    expect(await due(page)).toBe(false);
    expect(await state(page)).toBeNull();
  });

  test('without teabreak in the URL it never starts under automation', async ({ page }) => {
    await open(page, '?debug&quality=low&noguide&fixture=grown');
    await skip(page, 500_000);
    await page.waitForTimeout(600);
    expect(await due(page)).toBe(false);
    expect(await state(page)).toBeNull();
  });
});

async function twoSeats(browser: Browser, onA: (a: Page) => void) {
  const a = await (await browser.newContext()).newPage();
  onA(a);
  await a.goto(`/${ONLINE_QUERY}`);
  await waitLive(a);
  await expect
    .poll(() => a.evaluate(() => !!(window as unknown as { __qotiTeaBreak?: unknown }).__qotiTeaBreak))
    .toBe(true);
  await closeCards(a);
  await a.getByTestId('speed-0').click();
  await a.getByTestId('menu-open').click();
  await a.getByTestId('settings-open').click();
  await a.getByTestId('move-online').click();
  await a.getByTestId('move-online-yes').click();
  await expect(a.getByTestId('invite-link')).toHaveValue(/#v=[0-9a-f]{32}&s=1&k=[0-9a-f]{32}$/);
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  // The grown village's festival card comes up again once the valley is online: put it away first
  // (but not the invite, whose Done button is next).
  await closeCards(a, ['inviteOpen']);
  await a.getByRole('button', { name: 'Done' }).click();
  const b = await (await browser.newContext()).newPage();
  const invite = new URL(link);
  invite.search = '?debug&quality=low&noguide&teabreak';
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  return { a, b };
}

test('two seats: one seat on a tea break sends nothing and moves nobody else', async ({ browser }) => {
  test.setTimeout(400_000);
  const sent: string[] = [];
  const watch = (ws: {
    url(): string;
    on(e: 'framesent', cb: (f: { payload: string | Buffer }) => void): void;
  }) => {
    if (ws.url().includes('/api/')) ws.on('framesent', (f) => sent.push(String(f.payload)));
  };
  // Playwright reports a socket only when it opens, so A's page is watched from its first load.
  const { a, b } = await twoSeats(browser, (a) => a.on('websocket', watch));
  try {
    await closeCards(a);
    await closeCards(b);
    // B has sat idle all through A's setup, which on a slow machine can pass 90 s, so B may be on a
    // tea break of its own by now. A key ends it and starts B's count over, leaving B a full 90 s.
    await b.keyboard.press('Shift');
    await a.waitForTimeout(1500);
    expect(await state(b)).toBeNull();

    const bView = await view(b);
    const aSubmit = await a.evaluate(() => window.__qoti.lastSubmitAt());
    // The watcher is on A's socket: going online sent frames through it.
    expect(sent.length).toBeGreaterThan(0);
    sent.length = 0;
    await startBreak(a);
    await a.waitForTimeout(2500);
    expect(await state(a)).not.toBeNull();
    // Nothing the tea break did reached the wire: no command and no presence. The only frames a seat
    // sends on its own are the lockstep hash reports (k: 'hash'); those are the sim's, not the tea break's.
    const kinds = sent.map((s) => (JSON.parse(s) as { k: string }).k);
    expect(kinds.filter((k) => k !== 'hash')).toEqual([]);
    expect(await a.evaluate(() => window.__qoti.lastSubmitAt())).toBe(aSubmit);
    expect(await view(b)).toEqual(bView);
    expect(await state(b)).toBeNull();
    await a.keyboard.press('Shift');
    expect(await state(a)).toBeNull();
  } finally {
    await a.context().close();
    await b.context().close();
  }
});

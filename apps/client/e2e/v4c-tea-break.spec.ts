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

/**
 * Waits until the camera has stopped: the same position over five animation frames (no fixed sleep,
 * however slowly the runner draws).
 */
async function cameraAtRest(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const r = (window.__qoti as unknown as { renderer(): Rend }).renderer();
    let last = '';
    let same = 0;
    const t0 = performance.now();
    while (same < 5 && performance.now() - t0 < 120_000) {
      await new Promise((res) => requestAnimationFrame(res));
      const p = r.camera.position;
      const key = `${p.x},${p.y},${p.z}`;
      same = key === last ? same + 1 : 0;
      last = key;
    }
  });
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
  // The camera at rest before the view is recorded.
  await cameraAtRest(page);
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
  await cameraAtRest(page);
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
    // Held until the view has panned (however slowly the runner draws), then let go.
    await page.keyboard.down('w');
    const moved = (v: View) => Math.hypot(v.x - saved.goal.x, v.z - saved.goal.z);
    await expect.poll(async () => moved((await view(page)).goal)).toBeGreaterThan(0);
    await page.keyboard.up('w');
    expect(await state(page)).toBeNull();
    const after = await view(page);
    // Panned from the saved spot: the goal moved only a little off it, not off to the watched place.
    expect(moved(after.goal)).toBeLessThan(30);
    expect(after.goal.distance).toBe(saved.goal.distance);
    expect(after.goal.yaw).toBe(saved.goal.yaw);
  });

  test('the interface steps back to the name and the clock, and a poke brings it back', async () => {
    await fresh(page);
    const toolbar = page.locator('.toolbar');
    const clock = page.locator('.game-ui .topbar-clock');
    const town = page.locator('.game-ui .topbar-town');
    await expect(toolbar).toBeVisible();
    await startBreak(page);
    // The slow fade has run out: the toolbar is hidden, the name and the clock stay.
    await expect(toolbar).toBeHidden({ timeout: 60_000 });
    await expect(page.locator('.game-ui.tea-break')).toHaveCount(1);
    await expect(clock).toBeVisible();
    await expect(town).toBeVisible();
    await expect(page.locator('.game-ui .topbar-speed')).toBeHidden();
    await expect(page.locator('.game-ui .topbar-town-stats')).toBeHidden();
    await page.keyboard.press('Shift');
    expect(await state(page)).toBeNull();
    await expect(toolbar).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.game-ui.tea-break')).toHaveCount(0);
    await expect(page.locator('.game-ui .topbar-speed')).toBeVisible();
  });

  test('88 s alone does not start one, two more seconds do', async () => {
    await fresh(page);
    // `fresh` waits for the camera to rest after its key, and real time counts as idle too: a key
    // right here starts the count over, then a margin is left.
    await page.keyboard.press('Shift');
    await skip(page, 88_000);
    await call(page, 'check');
    expect(await state(page)).toBeNull();
    await skip(page, 2_000);
    expect(await state(page)).not.toBeNull();
  });

  test('guards: a tool in hand, a card open, photo mode', async () => {
    await fresh(page);
    // A tool in hand.
    await page.evaluate(() =>
      (window.__qoti as unknown as { selectTool(id: string): void }).selectTool('erase'),
    );
    expect(await due(page)).toBe(false);
    await skip(page, 90_000);
    await call(page, 'check');
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
    await call(page, 'check');
    expect(await state(page)).toBeNull();
    expect(await due(page)).toBe(false);
    // Photo mode (V4B) in the same step as the card goes away: the camera is the player's to frame.
    await page.evaluate(() => {
      const q = window.__qoti as unknown as { setUi(n: string, v: unknown): void };
      q.setUi('photo', true);
      q.setUi('settingsOpen', false);
    });
    await skip(page, 90_000);
    await call(page, 'check');
    expect(await state(page)).toBeNull();
    expect(await due(page)).toBe(false);
    await page.evaluate(() =>
      (window.__qoti as unknown as { setUi(n: string, v: unknown): void }).setUi('photo', false),
    );
    // Cleared guards: it does start (proves the guards were what held it back).
    await skip(page, 1_000);
    expect(await state(page)).not.toBeNull();
    await page.keyboard.press('Shift');
  });

  test('a question that appears mid tea break ends it and puts the view back', async () => {
    await fresh(page);
    const saved = await view(page);
    await startBreak(page);
    // A dialog waiting for yes or no (as a partner's removal asks first): a decision on screen.
    await page.evaluate(() =>
      (window.__qoti as unknown as { setUi(n: string, v: unknown): void }).setUi('dialog', {
        kind: 'confirm',
        text: 'Take the bench away?',
        ok: 'Yes',
        cancel: 'No',
        resolve: () => {},
      }),
    );
    await expect.poll(() => state(page), { timeout: 5_000 }).toBeNull();
    const after = await view(page);
    expect(after.goal).toEqual(saved.goal);
    expect(after.pos).toEqual(saved.pos);
    // And none starts while it waits.
    await skip(page, 90_000);
    await call(page, 'check');
    expect(await state(page)).toBeNull();
    await page.evaluate(() =>
      (window.__qoti as unknown as { setUi(n: string, v: unknown): void }).setUi('dialog', null),
    );
  });
});

test.describe('one seat', () => {
  test.setTimeout(300_000);
  test('a raid under way: its bar asks for the bell, the lanterns or the gates, so no tea break', async ({
    page,
  }) => {
    await open(page, '?debug&quality=low&noguide&teabreak&fixture=raid');
    await expect(page.getByTestId('raid-bar')).toBeVisible();
    const waiting = await page.evaluate(
      () =>
        (window as unknown as { __qotiTeaBreak: { guards(): { waiting: string[] } } }).__qotiTeaBreak.guards()
          .waiting,
    );
    expect(waiting).toContain('raid');
    await skip(page, 200_000);
    await call(page, 'check');
    expect(await due(page)).toBe(false);
    expect(await state(page)).toBeNull();
  });

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
    await call(page, 'check');
    expect(await due(page)).toBe(false);
    expect(await state(page)).toBeNull();
  });

  test('without teabreak in the URL it never starts under automation', async ({ page }) => {
    await open(page, '?debug&quality=low&noguide&fixture=grown');
    await skip(page, 500_000);
    await call(page, 'check');
    expect(await due(page)).toBe(false);
    expect(await state(page)).toBeNull();
  });
});

type Frame = { mode: string; samples: number; goal: number; change: string | null };

/** Each drawn frame's mode and samples for `frames` drawn frames, or until the picture has settled. */
const frames = (page: Page, count: number, untilSettled: boolean) =>
  page.evaluate(
    async ([count, untilSettled]) => {
      const q = window.__qoti as unknown as {
        stats(): {
          mode: string;
          samples: number;
          sampleGoal: number;
          stillChange: string | null;
          drawn: number;
        };
      };
      const out: Frame[] = [];
      let drawn = q.stats().drawn;
      const t0 = performance.now();
      while (out.length < count && performance.now() - t0 < 240_000) {
        await new Promise((res) => requestAnimationFrame(res));
        const s = q.stats();
        if (s.drawn === drawn) continue;
        drawn = s.drawn;
        out.push({ mode: s.mode, samples: s.samples, goal: s.sampleGoal, change: s.stillChange });
        if (untilSettled && s.mode === 'idle' && s.sampleGoal > 0 && s.samples >= s.sampleGoal) break;
      }
      return out;
    },
    [count, untilSettled] as const,
  );

test("V4A's developing picture: a tea break never folds a sample, and the view put back develops from the first", async ({
  page,
}) => {
  test.setTimeout(600_000);
  // V4A's own setting (v4a-refine.spec.ts): High, refinement on whatever the software renderer's
  // timings, a small fixed canvas so it keeps up.
  await page.setViewportSize({ width: 640, height: 400 });
  await open(page, '?debug&quality=high&noguide&teabreak&fixture=grown&refine=all&fixedres');
  // And as V4A's spec sets it: the valley paused at a pinned hour, the camera at the town's middle,
  // so nothing in the town redraws the still frame while a rest is measured (on a slow runner a
  // running valley never lets the picture settle). A tea break still has the day's footfall to circle.
  await page.evaluate(() => {
    const q = window.__qoti as unknown as {
      submit(c: unknown): void;
      setHour(h: number): void;
      grownInfo(): { center: [number, number] };
      look(x: number, z: number, distance: number, turn?: number, tilt?: number): void;
    };
    q.submit({ t: 'time.setSpeed', speed: 0 });
    q.setHour(11);
    const info = q.grownInfo();
    q.look(info.center[0], info.center[1], 70, 0, 0);
  });
  await cameraAtRest(page);
  await page.keyboard.press('Shift');
  // Real time counts as idle too, and a slow runner can take over 90 s to settle: ten minutes' margin
  // on the tea break's clock, so no real tea break starts while the rest is measured.
  await skip(page, -600_000);
  // At rest the picture develops and settles.
  const rest = await frames(page, 5_000, true);
  const settled = rest[rest.length - 1]!;
  expect(settled.mode).toBe('idle');
  expect(settled.goal).toBeGreaterThan(0);
  expect(settled.samples).toBe(settled.goal);

  // A tea break: every frame a plain moving frame, no sample folded in. (A key first: the count starts
  // over on the clock as it now stands, so the skip of 90 s starts one.)
  await page.keyboard.press('Shift');
  await startBreak(page);
  const during = await frames(page, 60, false);
  expect(during.length).toBe(60);
  expect(during.filter((f) => f.mode !== 'moving' || f.samples !== 0)).toEqual([]);

  // The player's touch puts the view back: the development starts over from the first sample, never
  // from the samples of the picture before (the moving frames dropped it; the view put back is the
  // same as that picture's, so V4A names the change by what the town did meanwhile), and settles again.
  await page.keyboard.press('Shift');
  // The same margin while it settles again (the camera rests REST_MS before its first still frame).
  await skip(page, -600_000);
  expect(await state(page)).toBeNull();
  const back = await frames(page, 5_000, true);
  const first = back.findIndex((f) => f.mode !== 'moving');
  expect(first).toBeGreaterThanOrEqual(0);
  expect(back[first]!.samples).toBeLessThanOrEqual(1);
  const after = back.slice(first);
  for (let i = 1; i < after.length; i++)
    expect(after[i]!.samples).toBeGreaterThanOrEqual(after[i - 1]!.samples);
  const end = back[back.length - 1]!;
  expect(end.mode).toBe('idle');
  expect(end.samples).toBe(end.goal);
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
  // A's socket, both ways and in order: what A sends, and what the relay sends A (a request for a
  // snapshot comes this way).
  const wire: { out: boolean; k: string }[] = [];
  const kindOf = (payload: string | Buffer) => {
    try {
      return (JSON.parse(String(payload)) as { k: string }).k;
    } catch {
      return 'binary';
    }
  };
  const watch = (ws: {
    url(): string;
    on(e: 'framesent' | 'framereceived', cb: (f: { payload: string | Buffer }) => void): void;
  }) => {
    if (!ws.url().includes('/api/')) return;
    ws.on('framesent', (f) => wire.push({ out: true, k: kindOf(f.payload) }));
    ws.on('framereceived', (f) => wire.push({ out: false, k: kindOf(f.payload) }));
  };
  // Playwright reports a socket only when it opens, so A's page is watched from its first load.
  const { a, b } = await twoSeats(browser, (a) => a.on('websocket', watch));
  try {
    await closeCards(a);
    await closeCards(b);
    // B has sat idle all through A's setup, which on a slow machine can pass 90 s, so B may be on a
    // tea break of its own by now. A key ends it and starts B's count over, and ten minutes' margin
    // on B's tea-break clock keeps B from starting one however slowly the rest of the test runs.
    await b.keyboard.press('Shift');
    await skip(b, -600_000);
    await cameraAtRest(a);
    await cameraAtRest(b);
    expect(await state(b)).toBeNull();

    const bView = await view(b);
    const aSubmit = await a.evaluate(() => window.__qoti.lastSubmitAt());
    // The watcher is on A's socket: going online sent frames through it.
    expect(wire.some((f) => f.out)).toBe(true);
    const from = wire.length;
    await startBreak(a);
    // Thirty frames of A's tea break drawn, for anything it might send to show up on the wire.
    expect((await frames(a, 30, false)).length).toBe(30);
    expect(await state(a)).not.toBeNull();
    // Nothing the tea break did reached the wire: no command and no presence. What a seat sends on its
    // own is the sim's lockstep hash report (k: 'hash'), and a snapshot when the relay asks for one
    // (k: 'needSnapshot', every so many turns); every snapshot sent here answers a request before it.
    let asked = wire.slice(0, from).filter((f) => !f.out && f.k === 'needSnapshot').length;
    // (A's pause during setup sends a snapshot nobody asked for: never below none outstanding.)
    asked = Math.max(0, asked - wire.slice(0, from).filter((f) => f.out && f.k === 'snapshot').length);
    const unasked: string[] = [];
    for (const f of wire.slice(from)) {
      if (!f.out) {
        if (f.k === 'needSnapshot') asked++;
      } else if (f.k === 'snapshot' && asked > 0) asked--;
      else if (f.k !== 'hash') unasked.push(f.k);
    }
    expect(unasked).toEqual([]);
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

import { expect, test } from '@playwright/test';
import { DEBUG_QUERY, waitLive } from './helpers';

// C5G acceptance: the title screen loads no audio; the first click in the valley starts the
// context; the sliders change the bus gains; nothing complains in the console.
test('sound starts on the first gesture and follows the sliders', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const w = window as unknown as { __audioContexts: number; AudioContext: typeof AudioContext };
    w.__audioContexts = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        w.__audioContexts++;
      }
    };
  });
  // Sound files, the engine chunk and the render worker; the few small glue modules (the settings
  // store, the silent stub) ride with the app.
  const audioRequests: string[] = [];
  page.on('request', (r) => {
    if (/\.(m4a|ogg|mp3|wav)(\?|$)|audio\/engine|engine-[\w-]+\.js|render\.worker/.test(r.url()))
      audioRequests.push(r.url());
  });

  await page.goto(`/${DEBUG_QUERY}`);
  await expect(page.getByTestId('new-solo')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(
    0,
  );
  expect(audioRequests).toEqual([]);

  await page.getByTestId('new-solo').click();
  await waitLive(page);
  // Entering the valley is not yet a gesture inside it: still silent, nothing loaded.
  expect(await page.evaluate(() => window.__qoti.audio.state())).toBe('none');
  expect(audioRequests).toEqual([]);

  // A click on the valley itself (the middle of the view is always open ground or sky).
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect.poll(() => page.evaluate(() => window.__qoti.audio.state())).toBe('running');
  // The engine and its render worker are their own chunks, fetched only now.
  expect(audioRequests.some((u) => /engine|render\.worker/.test(u))).toBe(true);
  // Cues render in the worker and come back.
  await expect.poll(() => page.evaluate(() => window.__qoti.audio.pending()), { timeout: 20_000 }).toBe(0);

  const before = await page.evaluate(() => window.__qoti.audio.gains());
  expect(before!.music).toBeGreaterThan(0);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('volume-music').fill('20');
  await expect
    .poll(async () => (await page.evaluate(() => window.__qoti.audio.gains()))!.music)
    .toBeLessThan(before!.music);
  await page.getByTestId('mute').check();
  await expect
    .poll(async () => {
      const g = (await page.evaluate(() => window.__qoti.audio.gains()))!;
      return g.music + g.ambience + g.effects;
    })
    .toBe(0);
  await page.getByTestId('mute').uncheck();

  // The ambience follows the camera: something is heard in the starting valley.
  await expect
    .poll(() => page.evaluate(() => window.__qoti.audio.playing()?.ambience.length ?? 0), { timeout: 20_000 })
    .toBeGreaterThan(0);
  // Main-thread audio work stays far under its 0.3 ms a frame (it runs ten times a second).
  expect(await page.evaluate(() => window.__qoti.audio.cost())).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

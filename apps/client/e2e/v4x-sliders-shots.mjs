// V4X: photo mode's and Settings' sliders by day and by lamplight (a script, not a spec).
//   QOTI_CLIENT_PORT=5266 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4x-sliders-shots.mjs
import { chromium } from '@playwright/test';

const base = `http://localhost:${Number(process.env.QOTI_CLIENT_PORT ?? 5266)}`;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(
  `${base}/?debug&fixture=grown&clean&teabreak&quality=low&noguide&season=summer&day=3&weather=clear`,
);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));

const slide = (id, v) =>
  page.getByTestId(id).evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

for (const [name, hour] of [
  ['day', 11],
  ['lamplight', 22],
]) {
  // The interface's own lamplight follows the sim clock, so the sim is run to the hour.
  await page.evaluate((h) => window.__qoti.setHour(h), hour);
  await page.evaluate(() => window.__qoti.setUi('photo', true));
  const strip = page.getByTestId('photo-strip');
  await strip.waitFor({ timeout: 60000 });
  await slide('photo-dof', 60);
  await slide('photo-time', 12);
  await page.waitForTimeout(2500);
  console.log(name, await page.evaluate(() => document.querySelector('.game-ui').className));
  await strip.screenshot({ path: `${out}/v4x-photo-sliders-${name}.png`, timeout: 120000 });
  await page.evaluate(() => window.__qoti.setUi('photo', false));
}
await page.evaluate(() => {
  const t = window.__qotiTeaBreak;
  const empty = { settingsOpen: false, chapter: false, inviteOpen: false, helpOpen: false, asking: false };
  for (const name of t.guards().open) window.__qoti.setUi(name, name in empty ? empty[name] : null);
  window.__qoti.setUi('settingsOpen', true);
});
const settings = page.locator('.modal.settings');
await settings.waitFor({ timeout: 60000 });
const sound = page.getByTestId('sound-settings');
await sound.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);
await sound.screenshot({ path: `${out}/v4x-settings-sliders.png`, timeout: 120000 });
await browser.close();

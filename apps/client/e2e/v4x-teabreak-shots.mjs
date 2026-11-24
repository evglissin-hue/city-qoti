// V4X: the tea break with and without the interface (a script, not a spec). Needs the dev server:
//   QOTI_CLIENT_PORT=5266 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4x-teabreak-shots.mjs [day|evening ...]
// Per scene: a tea break runs; the `tea-break` class is taken off (the interface as it was before
// V4X) for the "before" shot, put back and given its slow fade for the "after" shot; then a poke
// and a shot of the interface back with the view restored.
import { chromium } from '@playwright/test';

const base = `http://localhost:${Number(process.env.QOTI_CLIENT_PORT ?? 5266)}`;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['day', 'evening'];
const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const closeCards = (page) =>
  page.evaluate(() => {
    const t = window.__qotiTeaBreak;
    const empty = { settingsOpen: false, chapter: false, inviteOpen: false, helpOpen: false, asking: false };
    for (const name of t.guards().open) window.__qoti.setUi(name, name in empty ? empty[name] : null);
  });
const view = (page) => page.evaluate(() => window.__qoti.renderer().rig.saveView());

for (const scene of scenes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(
    `${base}/?debug&fixture=grown&teabreak&quality=medium&noguide&season=summer&day=3&weather=clear`,
  );
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  await page.waitForFunction(() => !!window.__qotiTeaBreak, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await closeCards(page);
  // The light (and the interface's lamplight) is pinned to the hour: running the sim on to the evening
  // takes minutes in software and a tea break wants the picture, not the footfall.
  if (scene === 'evening') await page.evaluate(() => window.__qoti.setHour(20));
  else await page.evaluate(() => window.__qoti.setHour(11));
  await page.keyboard.press('Shift');
  await page.waitForTimeout(500);
  await closeCards(page);
  const saved = await view(page);
  await page.evaluate(() => window.__qotiTeaBreak.skip(90000));
  const plan = await page.evaluate(() => window.__qotiTeaBreak.state()?.plan);
  console.log(scene, 'plan', plan);
  await page.waitForFunction(() => document.querySelector('.game-ui.tea-break'), null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  // Before: the interface as it was (the class off; nothing re-renders it back while the string holds).
  await page.evaluate(() => document.querySelector('.game-ui').classList.remove('tea-break'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/v4x-teabreak-before-${scene}.png`, timeout: 120000 });
  await page.evaluate(() => document.querySelector('.game-ui').classList.add('tea-break'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/v4x-teabreak-after-${scene}.png`, timeout: 120000 });
  if (scene === 'evening') {
    await page.keyboard.press('Shift');
    await page.waitForTimeout(800);
    const back = await view(page);
    console.log('  view restored exactly:', JSON.stringify(saved) === JSON.stringify(back));
    await page.screenshot({ path: `${out}/v4x-teabreak-poked-${scene}.png`, timeout: 120000 });
  }
  await page.close();
}
await browser.close();

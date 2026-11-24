// R3X: the books' pictures, read from the screen (a script, not a spec). The real grown valley
// (a fixture: two Town Book pages at real places, a closed chapter, 251 Chronicle entries) is opened,
// and the Town Book, the Chronicle and the storybook are shown with the pictures the valley takes of
// itself (app/inkPictures.ts), by day (11:00) and by lamplight (19:30). A fresh page a light, so no
// picture is kept from the other. The storybook is then printed to PDF at A4 and US Letter.
//   QOTI_CLIENT_PORT=5173 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/r3x-pictures.mjs [outDir]
// Shots (1366 x 768, scale 1) go to docs/build/screenshots/r3x-pictures-<name>.png; PDFs and their
// page images go to QOTI_PDF_OUT (default: next to the shots, so pass a scratch folder).
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = `http://localhost:${process.env.QOTI_CLIENT_PORT ?? 5173}`;
const out = process.argv[2] ?? fileURLToPath(new URL('../../../docs/build/screenshots/', import.meta.url));
const pdfOut = process.env.QOTI_PDF_OUT ?? out;
mkdirSync(out, { recursive: true });
mkdirSync(pdfOut, { recursive: true });
const lights = (process.env.QOTI_LIGHTS ?? 'day,lamp').split(',');
const HOURS = { day: 11, lamp: 19.5 };

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function openValley(light) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&clean&quality=medium&noguide&fixture=grown`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
  await page.waitForTimeout(1500);
  await page.evaluate((h) => {
    for (const [n, v] of [
      ['festivalCard', null],
      ['raidCard', null],
      ['almanac', null],
      ['edition', null],
      ['chapter', false],
      ['letter', null],
      ['storyLetter', null],
      ['rankUp', null],
    ])
      window.__qoti.setUi(n, v);
    window.__qoti.setHour(h);
  }, HOURS[light]);
  return page;
}

async function shot(page, name) {
  await page.waitForTimeout(700);
  const file = `${out}/r3x-pictures-${name}.png`;
  await page.screenshot({ path: file, timeout: 240000, animations: 'disabled' });
  console.log('shot', file);
}

/** Waits until every picture slot on show has an image, or `ms` pass; reports counts. */
async function picturesIn(page, sel, ms = 90000) {
  const t0 = Date.now();
  let n = [0, 0];
  while (Date.now() - t0 < ms) {
    n = await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const imgs = [...(root?.querySelectorAll('img') ?? [])].filter(
        (i) => i.src && i.src.startsWith('blob:'),
      );
      return [imgs.length, root?.querySelectorAll('figure, .tb-picture').length ?? 0];
    }, sel);
    if (n[0] > 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);
  return n;
}

for (const light of lights) {
  // The Town Book and the Chronicle.
  const page = await openValley(light);
  const places = await page.evaluate(() =>
    window.__qoti.mirror().townBook.value.pages.map((p) => `${p.id}:${p.name}@${p.place}`),
  );
  console.log(light, 'town book pages', JSON.stringify(places));
  await page.evaluate(() => window.__qoti.openPanel('town-book'));
  await page.getByTestId('town-book').waitFor({ timeout: 30000 });
  console.log(light, 'town book pictures', await picturesIn(page, '[data-testid="town-book"]'));
  await shot(page, `townbook-contents-${light}`);
  const next = page.getByTestId('town-book-next');
  if (await next.count()) {
    await next.first().click();
    console.log(
      light,
      'town book page 2 pictures',
      await picturesIn(page, '[data-testid="town-book"]', 40000),
    );
    await shot(page, `townbook-${light}`);
  }
  await page.evaluate(() => window.__qoti.openPanel('chronicle'));
  await page.getByTestId('chronicle-entries').waitFor({ timeout: 30000 });
  console.log(
    light,
    'chronicle pictures',
    await picturesIn(page, '[data-testid="chronicle-entries"]', 60000),
  );
  await shot(page, `chronicle-natural-${light}`);
  const figs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="chronicle-picture-"]')].map((f) => ({
      id: f.getAttribute('data-testid'),
      img: !!f.querySelector('img[src^="blob:"], img[src^="data:"]'),
    })),
  );
  console.log(light, 'chronicle figures', JSON.stringify(figs));

  // A valley opened from a fixture carries no stored Chronicle snapshots (the game takes them as entries
  // arrive: ink, 320 x 200, at the entry's own spot), so lay in what play would have kept, by this
  // light: the six newest older-day entries that carry a snapshot aim (the panel's top) and the first
  // eight of the Village chapter (the storybook's).
  const seeded = await page.evaluate(async () => {
    const m = window.__qoti.mirror();
    const ui = window.__qoti.ui();
    const r = window.__qoti.renderer();
    const today = Math.floor(m.tick.value / 1440);
    const all = m.chronicle.value.filter((e) => e.snapshot);
    const end = m.chronicle.value.find((e) => e.kind === 'trial-passed')?.tick ?? m.tick.value;
    const newest = all.filter((e) => Math.floor(e.tick / 1440) !== today).slice(-6);
    const first = all.filter((e) => e.tick <= end).slice(0, 8);
    const picks = [...new Map([...newest, ...first].map((e) => [e.id, e])).values()];
    const next = new Map(ui.snapshots.value);
    for (const e of picks) {
      const blob = await r.capture({
        focus: e.snapshot.focus,
        radius: e.snapshot.radius,
        size: [320, 200],
        style: 'ink',
      });
      if (blob) next.set(e.id, URL.createObjectURL(blob));
    }
    ui.snapshots.value = next;
    return picks.map((e) => `${e.id}:${e.kind}@day${Math.floor(e.tick / 1440)}`);
  });
  console.log(light, 'stored snapshots laid in', JSON.stringify(seeded));
  await page.evaluate(() => window.__qoti.openPanel(null));
  await page.evaluate(() => window.__qoti.openPanel('chronicle'));
  await page.getByTestId('chronicle-entries').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  // The pictures are under entries a few screens down: bring the first one to the top of the panel.
  await page.evaluate(() =>
    document.querySelector('[data-testid^="chronicle-picture-"]')?.scrollIntoView({ block: 'start' }),
  );
  await shot(page, `chronicle-${light}`);
  const figs2 = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="chronicle-picture-"]')].map((f) => ({
      id: f.getAttribute('data-testid'),
      img: !!f.querySelector('img[src^="blob:"], img[src^="data:"]'),
    })),
  );
  console.log(light, 'chronicle figures (stored)', JSON.stringify(figs2));

  if (process.env.QOTI_NO_BOOK === '1') {
    await page.close();
    continue;
  }
  // The storybook, and its print.
  await page.evaluate(() => window.__qoti.openPanel('storybook'));
  await page.getByTestId('storybook').waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelector('.storybook')?.getAttribute('data-ready') === 'yes',
    null,
    {
      timeout: 120000,
    },
  );
  await page.waitForTimeout(3000);
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('.storybook-print img')) await img.decode().catch(() => {});
  });
  const sb = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.storybook-print img')];
    const srcs = imgs.map((i) => i.src);
    return {
      imgs: imgs.length,
      pictures: document.querySelectorAll('.storybook-print .sb-picture').length,
      dim: document.querySelectorAll('.storybook-print .sb-picture.dim').length,
      repeats: srcs.length - new Set(srcs).size,
    };
  });
  console.log(light, 'storybook', JSON.stringify(sb));
  await shot(page, `storybook-${light}`);
  // Print-size pictures are inked only when Print is pressed (the dialog stubbed), as the coordinator's
  // c78b0e18 flow: wait for data-inked, then decode and make the PDF.
  await page.evaluate(() => {
    window.print = () => {};
  });
  const t0 = Date.now();
  await page.getByTestId('storybook-print-button').click();
  await page.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="storybook-print-button"]');
      return b?.getAttribute('data-inked') === 'yes' && /Print the storybook/.test(b.textContent ?? '');
    },
    null,
    { timeout: 300000 },
  );
  console.log(light, 'print pictures inked in', Math.round((Date.now() - t0) / 1000), 's');
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('.storybook-print img')) await img.decode().catch(() => {});
  });
  const pr = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.storybook-print .sb-picture img')];
    const srcs = imgs.map((i) => i.src);
    return {
      pictureImgs: imgs.length,
      repeats: srcs.length - new Set(srcs).size,
      sizes: imgs.map((i) => `${i.naturalWidth}x${i.naturalHeight}`),
    };
  });
  console.log(light, 'printed pictures', JSON.stringify(pr));
  for (const paper of ['a4', 'letter']) {
    await page
      .getByTestId('storybook-paper')
      .getByLabel(paper === 'a4' ? 'A4' : 'US Letter')
      .check({ timeout: 300000 });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="storybook-print-button"]')?.getAttribute('data-inked') ===
          'yes' &&
        /Print the storybook/.test(
          document.querySelector('[data-testid="storybook-print-button"]')?.textContent ?? '',
        ),
      null,
      { timeout: 300000 },
    );
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('.storybook-print img')) await img.decode().catch(() => {});
    });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const file = `${pdfOut}/r3x-storybook-${light}-${paper}.pdf`;
    writeFileSync(file, pdf);
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    console.log(light, paper, info.match(/Pages:\s+\d+/)?.[0], info.match(/Page size:.*/)?.[0]);
    execFileSync('pdftoppm', ['-png', '-r', '90', file, `${pdfOut}/r3x-storybook-${light}-${paper}-page`]);
  }
  await page.close();
}
await browser.close();

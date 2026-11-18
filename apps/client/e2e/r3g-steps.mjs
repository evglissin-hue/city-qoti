// R3G: the steps the storybook's e2e and its print script share: open a valley file, open the
// storybook from the chapter card, lay in the valley's own pictures and a sample Town Book page.

/** Opens the valley file solo, lets the chapter card show, and opens the storybook from it. */
export async function openStorybook(page, base, file, before = async () => {}) {
  await page.goto(`${base}/?debug`);
  // The file opener lives under the title's "More" fold.
  await page.evaluate(() => document.querySelector('details.title-options')?.setAttribute('open', ''));
  await page.getByTestId('open-file').setInputFiles(file);
  await page.getByTestId('open-imported-solo').click();
  await page.waitForFunction(() => window.__qoti?.phase?.() === 'ready', null, { timeout: 60_000 });
  // Paused, so nothing new is written while the book is read.
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
  await page.getByTestId('chapter').waitFor({ state: 'attached', timeout: 30_000 });
  // Read the cards that queued ahead of it (a festival's morning after, the almanac), so the
  // chapter is the one on show.
  await page.evaluate(() => {
    const ui = window.__qoti.ui();
    for (const k of ['letter', 'edition', 'festivalCard', 'raidCard', 'rankUp', 'almanac', 'storyLetter']) {
      if (ui[k] && ui[k].value)
        ui[k].value = k === 'letter' ? null : typeof ui[k].value === 'boolean' ? false : null;
    }
  });
  await page.getByTestId('chapter').waitFor({ state: 'visible', timeout: 10_000 });
  await before();
  await page.getByTestId('chapter-storybook').click();
  await page.getByTestId('storybook').waitFor();
  await page.waitForFunction(
    () => document.querySelector('.storybook')?.getAttribute('data-ready') === 'yes',
    null,
    { timeout: 60_000 },
  );
  // Every picture decoded before the print.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('.storybook-print img')) await img.decode().catch(() => {});
  });
}

/**
 * Takes up to `n` of the chapter's notable entries' pictures the photographer's way: the camera on
 * the entry's spot, a 4:3 crop of the canvas at the middle, as the session's snapshot of that entry.
 */
export async function layInPictures(page, n) {
  const shots = await page.evaluate((n) => {
    const m = window.__qoti.mirror();
    const end = m.chronicle.value.find((e) => e.kind === 'trial-passed')?.tick ?? m.tick.value;
    return m.chronicle.value
      .filter((e) => e.snapshot && e.tick <= end)
      .slice(0, n)
      .map((e) => ({ id: e.id, x: e.snapshot.focus[0], z: e.snapshot.focus[1], r: e.snapshot.radius }));
  }, n);
  const ui = await page.evaluate(() => !!window.__qoti.ui());
  if (!ui) return 0;
  // The chapter card covers the view: hide the interface while the pictures are taken.
  // Only the valley in the frame, by daylight, as a Chronicle picture is taken.
  const hide = await page.addStyleTag({
    content: '#app * { visibility: hidden !important; } #app canvas { visibility: visible !important; }',
  });
  await hide.evaluate((el) => el.setAttribute('id', 'r3g-hide'));
  await page.evaluate(() => window.__qoti.setHour(13));
  const vp = page.viewportSize();
  const h = Math.round(vp.height * 0.7);
  const w = Math.round((h * 4) / 3);
  const clip = { x: Math.round((vp.width - w) / 2), y: Math.round((vp.height - h) / 2), width: w, height: h };
  for (const s of shots) {
    await page.evaluate(({ x, z, r }) => window.__qoti.focusTile(x, z, Math.max(14, r * 1.6)), s);
    await page.waitForTimeout(900);
    const png = await page.screenshot({ clip, type: 'jpeg', quality: 88 });
    const url = `data:image/jpeg;base64,${png.toString('base64')}`;
    await page.evaluate(
      ({ id, url }) => {
        const ui = window.__qoti.ui();
        const next = new Map(ui.snapshots.value);
        next.set(id, url);
        ui.snapshots.value = next;
      },
      { id: s.id, url },
    );
  }
  await page.evaluate(() => {
    document.getElementById('r3g-hide')?.remove();
    window.__qoti.setHour(null);
  });
  return shots.length;
}

/** One sample Town Book page (R3C's view shape), dated inside the chapter, until R3C finds real ones. */
export async function layInTownBook(page) {
  await page.evaluate(() => {
    const m = window.__qoti.mirror();
    const view = {
      pages: [
        {
          id: 900001,
          kind: 'specialty',
          def: 'sample',
          place: 1,
          good: 0,
          name: 'Mill Green Apple Cake',
          day: 19,
          seats: [0],
          leaning: 'garden',
          placeName: 'Mill Green',
          text: 'Folk walk the long way round on purpose, and come home with crumbs on their coats.',
          together: false,
        },
      ],
      hints: [],
      callings: [],
      leanings: [1, 0, 0],
    };
    if (m.townBook && 'value' in m.townBook) m.townBook.value = view;
    else m.townBook = { value: view };
  });
}

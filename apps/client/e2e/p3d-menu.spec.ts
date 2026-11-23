import { expect, test, type Page } from '@playwright/test';
import { DEBUG_QUERY, waitLive } from './helpers';

// P3D: the front door. A menu of choices first; the form for making a valley is the second step.

async function leaveToTitle(page: Page) {
  await page.getByTestId('menu-open').click();
  await page.getByTestId('leave').click();
  await expect(page.getByTestId('new-solo')).toBeVisible();
}

async function foundSolo(page: Page, town: string) {
  await page.getByTestId('new-solo').click();
  await page.getByTestId('town-name').fill(town);
  await page.getByTestId('found-valley').click();
  await waitLive(page);
}

const recentCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('qoti.recent');
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });

test('the menu is usable at once, before any backdrop is ready', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/?quality=low');
  await expect(page.getByTestId('new-online')).toBeEnabled({ timeout: 1000 });
  await expect(page.getByTestId('new-solo')).toBeEnabled({ timeout: 1000 });
  await expect(page.getByTestId('title-settings-open')).toBeVisible();
  // The form is not the first view.
  await expect(page.getByTestId('town-name')).toHaveCount(0);
  await expect(page.getByTestId('your-name')).toHaveCount(0);
});

test('the second step has a way back, and Escape too; nothing is created and fields keep their words', async ({
  page,
}) => {
  await page.goto('/?quality=low');
  await page.getByTestId('new-solo').click();
  await expect(page.getByTestId('found-valley')).toHaveText('Found the valley');
  await page.getByTestId('town-name').fill('Keepsake');
  await page.getByTestId('title-back').click();
  await expect(page.getByTestId('new-solo')).toBeVisible();
  await expect(page.getByTestId('town-name')).toHaveCount(0);
  expect(await recentCount(page)).toBe(0);

  // Switching mode in place, and Escape back again.
  await page.getByTestId('new-online').click();
  await expect(page.getByTestId('town-name')).toHaveValue('Keepsake');
  await expect(page.getByTestId('found-valley')).toContainText('invite a friend');
  await page.getByTestId('mode-solo').click();
  await expect(page.getByTestId('found-valley')).toHaveText('Found the valley');
  await page.getByTestId('mode-online').click();
  await expect(page.getByTestId('found-valley')).toContainText('invite a friend');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('new-solo')).toBeVisible();
  await expect(page.getByTestId('found-valley')).toHaveCount(0);
  expect(await recentCount(page)).toBe(0);

  // The creative box and the dials sit on the second step too.
  await page.getByTestId('new-solo').click();
  await page.getByTestId('creative').check();
  await expect(page.getByTestId('guide-new')).toHaveCount(0);
  await page.getByTestId('title-back').click();
  await page.getByTestId('new-solo').click();
  await expect(page.getByTestId('creative')).toBeChecked();
});

test('Continue opens the most recent valley with its season and day; Enter founds and continues', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${DEBUG_QUERY}`);

  // First valley, founded with the mouse.
  await foundSolo(page, 'Alderbrook');
  await leaveToTitle(page);

  // Second valley, founded with Enter from inside a text field.
  await page.getByTestId('new-solo').click();
  await page.getByTestId('town-name').fill('Bramblewick');
  await page.getByTestId('town-name').press('Enter');
  await waitLive(page);
  const second = await page.evaluate(() => window.__qoti.valleyId());
  await leaveToTitle(page);

  // Continue names the second, with a season and a day, and the other is one step away.
  const card = page.locator('[data-testid^="continue-"]').first();
  await expect(card).toContainText('Bramblewick');
  await expect(card).toContainText(/(Spring|Summer|Autumn|Winter), day \d+/);
  await expect(card).toContainText('Solo');
  await expect(card).toHaveAttribute('data-testid', `continue-${second}`);
  await expect(page.getByTestId('more-valleys')).toHaveText('Other valleys (1)');
  await page.getByTestId('more-valleys').click();
  await expect(page.locator('[data-testid^="continue-"]')).toHaveCount(2);
  await page.getByTestId('title-back').click();

  // Enter on the menu, with nothing focused, takes Continue.
  await page.mouse.click(900, 400);
  await page.keyboard.press('Enter');
  await waitLive(page);
  expect(await page.evaluate(() => window.__qoti.valleyId())).toBe(second);
  await leaveToTitle(page);

  // And a click does the same.
  await page.locator('[data-testid^="continue-"]').first().click();
  await waitLive(page);
  expect(await page.evaluate(() => window.__qoti.valleyId())).toBe(second);
});

test('settings open from the title and Escape closes them', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('title-settings-open').click();
  const card = page.getByTestId('title-settings');
  await expect(card).toBeVisible();
  await page.getByTestId('quality-high').click();
  expect(await page.evaluate(() => localStorage.getItem('qoti.quality.v1'))).toBe('high');
  await expect(card.getByTestId('ui-scale')).toBeVisible();
  await expect(card.getByTestId('reduced-motion')).toBeVisible();
  await expect(card.getByTestId('sound-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  // The menu is still the menu.
  await expect(page.getByTestId('new-solo')).toBeVisible();
  // Done closes too.
  await page.getByTestId('title-settings-open').click();
  await page.getByTestId('title-settings-done').click();
  await expect(card).toHaveCount(0);
});

test('a pasted invite link shows the Join card; anything else is turned away kindly', async ({ page }) => {
  await page.goto('/?quality=low');
  await expect(page.getByTestId('join')).toHaveCount(0);
  await page.getByTestId('invite-paste-open').click();
  await page.getByTestId('invite-paste').fill('definitely not an invite');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('invite-paste-error')).toBeVisible();
  // Escape closes the field.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('invite-paste')).toHaveCount(0);

  await page.getByTestId('invite-paste-open').click();
  await page.getByTestId('invite-paste').fill('http://localhost:5173/#v=pasted1&s=1&k=sometoken');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('join')).toBeVisible();
  await expect(page.getByTestId('invite-paste-open')).toHaveCount(0);
  const pending = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('qoti.recent') ?? '[]') as {
      valleyId: string;
      seat: number;
      pending?: boolean;
    }[];
    return list.find((v) => v.pending);
  });
  expect(pending).toMatchObject({ valleyId: 'pasted1', seat: 1 });

  // The name can be changed in place, right on the card.
  await page.getByTestId('join-change').click();
  await page.getByTestId('your-name').fill('Wren');
  await expect(page.getByText('You will arrive as Wren')).toBeVisible();
});

test('the valleys list shows an old valley with its words, and Save its file works', async ({ page }) => {
  await page.goto('/?quality=low');
  const bytesB64 = await page.evaluate(async () => {
    const json = JSON.stringify({ saveVersion: 5, seed: 'old', note: 'a version 5 snapshot' });
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const data = btoa(bin);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('qoti-valley-p3dold', 2);
      req.onupgradeneeded = () => {
        for (const [name, key] of [
          ['meta', null],
          ['turns', 't'],
          ['snapshots', 't'],
          ['images', 'entry'],
        ] as const)
          req.result.createObjectStore(name, key ? { keyPath: key } : undefined);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['snapshots'], 'readwrite');
      tx.objectStore('snapshots').put({ t: 10, simVersion: 'old', label: null, created: 1, data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(
      'qoti.recent',
      JSON.stringify([
        {
          valleyId: 'p3dold',
          seat: 0,
          token: 't',
          mode: 'solo',
          name: 'Fernhollow',
          lastPlayed: Date.now(),
          old: true,
        },
      ]),
    );
    return data;
  });
  await page.reload();
  // Only an old valley: there is no Continue card, and the valleys link still shows it.
  await expect(page.locator('[data-testid^="continue-"]')).toHaveCount(0);
  await page.getByTestId('more-valleys').click();
  const row = page.getByTestId('old-p3dold');
  await expect(row).toContainText('Founded under the old rules. It cannot be opened in this version.');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('old-save-p3dold').click(),
  ]);
  expect(download.suggestedFilename()).toBe('fernhollow.qoti');
  expect(bytesB64.length).toBeGreaterThan(0);
  // Escape steps back to the menu.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('new-solo')).toBeVisible();
  await page.getByTestId('more-valleys').click();
  await page.getByTestId('old-remove-p3dold').click();
  await page.getByTestId('forget-yes-p3dold').click();
  await expect(page.getByTestId('old-p3dold')).toHaveCount(0);
});

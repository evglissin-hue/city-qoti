import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const SHOTS = '/tmp/claude-0/-home-user-city-qoti/b1f93f80-85dc-5dd0-b969-6d447cec667f/scratchpad/shots';

// R1C: a valley founded under the old rules is listed grayed, with Save its file and Remove.
test('an old solo valley is listed grayed and its file can be saved', async ({ page }) => {
  await page.goto('/');
  const bytesB64 = await page.evaluate(async () => {
    const json = JSON.stringify({ saveVersion: 5, seed: 'old', note: 'a version 5 snapshot' });
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const data = btoa(bin);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('qoti-valley-oldone', 2);
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
        { valleyId: 'oldone', seat: 0, token: 't', mode: 'solo', name: 'Fernhollow', lastPlayed: Date.now() },
      ]),
    );
    return data;
  });
  await page.reload();
  const row = page.getByTestId('old-oldone');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Founded under the old rules. It cannot be opened in this version.');
  await expect(page.getByTestId('continue-oldone')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/title-old.png` });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('old-save-oldone').click(),
  ]);
  expect(download.suggestedFilename()).toBe('fernhollow.qoti');
  const saved = readFileSync(await download.path());
  expect(saved.toString('base64')).toBe(bytesB64);

  await page.getByTestId('old-remove-oldone').click();
  await page.screenshot({ path: `${SHOTS}/title-old-remove.png` });
  await page.getByTestId('forget-yes-oldone').click();
  await expect(page.getByTestId('old-oldone')).toHaveCount(0);
});

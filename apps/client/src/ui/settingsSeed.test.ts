// @vitest-environment happy-dom
// P1 (playtest item 13): Settings shows the valley seed to share, and the recent list remembers it.
import { signal } from '@preact/signals';
import type { ValleyMeta } from '@qoti/protocol';
import { valleyNameFor } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findRecent, listRecent, rememberValley, updateRecent } from '../app/recent';
import { mockSession } from './mocks/session';
import { SettingsPanel } from './SettingsPanel';
import { mount, type Mounted } from './test/dom';

let view: Mounted | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  view?.unmount();
  view = null;
});

describe('the seed in Settings', () => {
  it('says the seed, how to share it, and offers a copy button', async () => {
    const { session } = mockSession();
    const settings = { ...session.mirror.settings.value, valleyName: valleyNameFor('abc123def456') };
    (session as { valley: unknown }).valley = signal<ValleyMeta>({
      id: 'mock',
      seed: 'abc123def456',
      settings,
      createdAt: 0,
    });
    session.ui.settingsOpen.value = true;
    view = await mount(h(SettingsPanel, { session }));
    const line = view.get('valley-seed').textContent ?? '';
    expect(line).toContain(
      'Valley seed: abc123def456. Share it and a friend can found the very same valley.',
    );
    expect(view.find('copy-seed')).not.toBeNull();
    expect(line).not.toMatch(/—/);
  });

  it('shows nothing before the valley meta arrives', async () => {
    const { session } = mockSession();
    session.ui.settingsOpen.value = true;
    view = await mount(h(SettingsPanel, { session }));
    expect(view.find('valley-seed')).toBeNull();
  });
});

describe('the recent list', () => {
  it('remembers seed and rank for display', () => {
    rememberValley({
      valleyId: 'v1',
      seat: 0,
      token: 't',
      mode: 'solo',
      name: 'Qoti',
      lastPlayed: 1,
      seed: 'abc',
    });
    expect(findRecent('v1')?.seed).toBe('abc');
    updateRecent('v1', { rank: 'village' });
    expect(listRecent()[0]).toMatchObject({ seed: 'abc', rank: 'village' });
  });
});

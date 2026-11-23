import { describe, expect, it } from 'vitest';
import { copy } from '../../ui/copy';
import type { RecentValley } from '../recent';
import { createBody, inviteFromText, type NewValleyForm } from './actions';
import { sharedWith, whereItStands } from './describe';

const form = (over: Partial<NewValleyForm> = {}): NewValleyForm => ({
  seed: '',
  town: '',
  creative: false,
  economy: 'standard',
  threat: 'standard',
  guide: true,
  ...over,
});

const valley = (over: Partial<RecentValley> = {}): RecentValley => ({
  valleyId: 'v',
  seat: 0,
  token: 't',
  mode: 'solo',
  name: 'Thistlecombe',
  lastPlayed: 0,
  ...over,
});

describe('the invite pasted into the title', () => {
  const fragment = 'v=abc123&s=1&k=secret';
  it('takes a whole link, a fragment or the bare pairs', () => {
    for (const text of [
      `https://qoti.example/play/#${fragment}`,
      `  #${fragment}\n`,
      fragment,
      `http://localhost:5173/?debug#${fragment}`,
    ]) {
      expect(inviteFromText(text)).toEqual({ valleyId: 'abc123', seat: 1, token: 'secret' });
    }
  });
  it('turns anything else away', () => {
    for (const text of ['', '   ', 'hello', 'https://qoti.example/', '#v=abc&s=9&k=x', '#v=abc&s=1']) {
      expect(inviteFromText(text)).toBeNull();
    }
  });
});

describe('the request the second step makes', () => {
  it('founds a standard valley with the guide, a town name and a seed when given', () => {
    const body = createBody(form({ town: '  Elderwick ', seed: ' marrow ' }));
    expect(body.seed).toBe('marrow');
    expect(body.settings).toMatchObject({
      mode: 'standard',
      economy: 'standard',
      threat: 'standard',
      guide: true,
      townName: 'Elderwick',
    });
  });
  it('leaves the seed and town to chance when empty, and drops the guide without it', () => {
    const body = createBody(form({ guide: false }));
    expect('seed' in body).toBe(false);
    expect('townName' in body.settings).toBe(false);
    expect(body.settings.guide).toBe(false);
  });
  it('makes a creative valley a quiet sandbox, whatever the dials say', () => {
    const body = createBody(form({ creative: true, threat: 'fierce' }));
    expect(body.settings.mode).toBe('sandbox');
    expect(body.settings.threat).toBe('peaceful');
    expect('guide' in body.settings).toBe(false);
  });
});

describe('what Continue says about a valley', () => {
  it('names the season and day, and the year once it is past the first', () => {
    expect(whereItStands(valley({ season: 2, day: 12, year: 1 }))).toBe('Autumn, day 12');
    expect(whereItStands(valley({ season: 0, day: 3, year: 2 }))).toBe('Spring, day 3, year 2');
  });
  it('says nothing for a valley stored before the title kept them', () => {
    expect(whereItStands(valley())).toBeNull();
    expect(whereItStands(valley({ season: 9, day: 1 }))).toBeNull();
  });
  it('says who it is shared with: Solo, the partner by name, or For two', () => {
    expect(sharedWith(valley())).toBe(copy.title.solo);
    expect(sharedWith(valley({ mode: 'online', partner: 'Juniper' }))).toBe('with Juniper');
    expect(sharedWith(valley({ mode: 'online' }))).toBe(copy.title.online);
  });
});

describe('the title strings', () => {
  it('use no em dashes and no exclamation marks', () => {
    const walk = (v: unknown): string[] =>
      typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(walk) : [];
    for (const [key, value] of Object.entries(copy.title)) {
      const strings =
        typeof value === 'function' ? [String((value as (x: never) => string)(1 as never))] : walk(value);
      for (const s of strings) {
        expect(s, key).not.toContain(String.fromCharCode(0x2014));
        expect(s, key).not.toContain('!');
      }
    }
  });
});

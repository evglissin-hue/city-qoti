import { content, type BuildingDef } from '@qoti/content';
import type { BuildingView, HouseholdView } from '@qoti/sim';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decorLine, doingLine, familiesText, homesBeside, kindWord } from './buildingWords';

/** The stock lines the inspector used to fall back on, and the vague words a card must not wear. */
const STOCK = [
  'Standing there being useful',
  'Humming along',
  'A home, lived in',
  'Makes the place look lived in',
  'Helps keep the valley safe',
  'A workplace still finding its work',
];
/** Kind labels too vague to be true of anything but a few defs; each exception has its reason. */
const VAGUE_KIND = ['Service', 'Building'];
const VAGUE_KIND_OK: Record<string, string> = {};

/** Defs allowed a plain line. Short and explicit; empty means every def says something specific. */
const PLAIN_OK: Record<string, string> = {};

const def = (id: string): BuildingDef => content.buildingById.get(id)!;
const bed = (id: number, x: number, z: number): BuildingView => ({
  id,
  def: 'garden-bed',
  x,
  z,
  rot: 0,
  builtBy: 0,
  handmade: true,
  stage: 'built',
  foundation: false,
});
const home = (id: number, x: number, z: number, d = 'cottage'): BuildingView => ({
  ...bed(id, x, z),
  def: d,
});
const hh = (id: number, homeId: number, family: string): HouseholdView => ({
  id,
  family,
  members: [],
  homeId,
  tier: 'settler' as HouseholdView['tier'],
  pantryFood: 0,
});

describe('the garden bed card (P3A)', () => {
  const g = def('garden-bed');
  it('wears a true kind label', () => {
    expect(kindWord(g)).toBe('Garden');
  });
  it('says no home is beside it, and what to do', () => {
    const line = doingLine(g, { beside: { families: [], empty: 0 } })!;
    expect(line).toMatch(/^No door within reach\. Set it beside a home, within 3 tiles/);
  });
  it('names the family it gives to, and that it rests in winter', () => {
    const line = doingLine(g, { beside: { families: ['Thorne'], empty: 0 } })!;
    expect(line).toContain('Gives the Thorne family vegetables with supper');
    expect(line).toContain('rests in winter');
    expect(line).toContain('lifts the charm within 2 tiles');
  });
  it('says it is resting in winter and when it returns', () => {
    const line = doingLine(g, { beside: { families: ['Thorne', 'Pike'], empty: 0 }, winter: true })!;
    expect(line).toContain('Resting for the winter. Come spring it gives the Thorne and Pike families');
  });
  it('waits for a family when the home beside it is empty', () => {
    const line = doingLine(g, { beside: { families: [], empty: 1 } })!;
    expect(line).toContain('has no family yet');
  });
  it('finds homes the way the sim does: within 3 tiles of the footprint, built homes only', () => {
    const inReach = home(2, 4, 0); // the bed spans x 0..1; a home at x 4 is 3 tiles off
    const outOfReach = home(3, 5, 0);
    const emptyHome = home(4, 3, 3);
    const site = { ...home(5, 2, 2), stage: 'construction' as const };
    const found = homesBeside(
      bed(1, 0, 0),
      [bed(1, 0, 0), inReach, outOfReach, emptyHome, site],
      [hh(1, 2, 'Wren'), hh(2, 3, 'Far')],
    );
    expect(found.families).toEqual(['Wren']);
    expect(found.empty).toBe(1);
  });
  it('families read in words', () => {
    expect(familiesText(['A'])).toBe('the A family');
    expect(familiesText(['A', 'B', 'C'])).toBe('the A, B and C families');
  });
});

describe('every inspectable building says something true (P3A class test)', () => {
  const homeFacts = { family: 'Thorne' };
  for (const d of content.buildings) {
    it(`${d.id}: a specific line and a fitting kind label`, () => {
      const line = doingLine(d, d.housing ? homeFacts : {});
      if (!PLAIN_OK[d.id]) {
        expect(line, `${d.id} would get only a stock fallback`).toBeTruthy();
        for (const s of STOCK) expect(line!.startsWith(s), `${d.id}: "${line}"`).toBe(false);
      }
      const kind = kindWord(d);
      if (VAGUE_KIND.includes(kind)) expect(VAGUE_KIND_OK[d.id], `${d.id} is labeled "${kind}"`).toBeTruthy();
      if (d.category === 'home') expect(kind).toBe('Home');
    });
  }
  it('the class test would catch a def that carries nothing to say', () => {
    const blank: BuildingDef = { ...def('shed'), id: 'blank', category: 'service' };
    expect(doingLine(blank)).toBeNull();
    expect(VAGUE_KIND).toContain(kindWord(blank));
  });
  it('a business says its trade, not its building', () => {
    const t = content.trades[0]!;
    expect(doingLine(def(t.building), { tradeBlurb: t.blurb })).toContain(t.blurb.replace(/\.$/, ''));
    expect(kindWord(def(t.building), t.id)).toBe('Business');
  });
  it('writes every line without em dashes', () => {
    const lines: string[] = [];
    for (const d of content.buildings) {
      lines.push(kindWord(d), doingLine(d, { family: 'Thorne', beside: { families: [], empty: 0 } }) ?? '');
    }
    for (const d of content.decor) lines.push(decorLine(d) ?? '');
    for (const l of lines) expect(l).not.toContain('—');
    if (process.env['QOTI_DUMP_WORDS']) {
      writeFileSync(
        process.env['QOTI_DUMP_WORDS'],
        [
          ...content.buildings.map((d) => `${d.id} [${kindWord(d)}] ${doingLine(d, { family: 'Thorne' })}`),
          ...content.decor.map((d) => `decor ${d.id}: ${decorLine(d)}`),
        ].join('\n'),
      );
    }
  });
});

describe('every decor piece says what it does (P3A class test)', () => {
  for (const d of content.decor) {
    it(`${d.id}`, () => {
      const line = decorLine(d);
      expect(line, `${d.id} has no charm, slows, festival role or written words`).toBeTruthy();
    });
  }
});

// Hearth content (C3B): enough variety in every text, only placeholders the sim fills, no em
// dashes, and swatches the customize command can validate.
import { describe, expect, it } from 'vitest';
import { chroniclePhrases } from './chronicle';
import { achievements, chronicle, patterns, swatches, wishes } from './index';

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const EM_DASH = /\u2014|\u2013/;
const BRITISH = /\b(colour|favour|honour|neighbour|centre|grey|travell|organis|realis)/i;

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

function clean(text: string, allowed: readonly string[], where: string): void {
  expect(text, where).not.toMatch(EM_DASH);
  expect(text, where).not.toMatch(BRITISH);
  expect(text.trim(), where).toBe(text);
  for (const p of placeholders(text)) expect(allowed, `${where}: {${p}}`).toContain(p);
}

describe('swatches', () => {
  it('cover every customization group with kebab-case ids unique within the group', () => {
    for (const group of ['wall', 'roof', 'roofMaterial', 'accent'] as const) {
      const ids = swatches.filter((s) => s.group === group).map((s) => s.id);
      expect(ids.length, group).toBeGreaterThanOrEqual(4);
      expect(new Set(ids).size, group).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(KEBAB);
    }
    for (const s of swatches) expect(s.token.length, s.id).toBeGreaterThan(0);
  });
});

describe('wishes', () => {
  it('have at least three ways to ask, three ways to thank and three digest lines', () => {
    for (const w of wishes) {
      expect(w.text.length, w.id).toBeGreaterThanOrEqual(3);
      expect(w.thanks.length, w.id).toBeGreaterThanOrEqual(3);
      expect(w.digest?.length ?? 0, w.id).toBeGreaterThanOrEqual(3);
      for (const t of w.text) clean(t, ['name', 'family', 'place', 'work', 'species'], w.id);
      // Letters are signed by the sim, so they do not name the writer themselves.
      for (const t of w.thanks) clean(t, ['family', 'place'], `${w.id} thanks`);
      for (const t of w.digest ?? []) clean(t, ['name', 'family'], `${w.id} digest`);
      for (const t of w.text) expect(t, w.id).toMatch(/\{name\}/);
      expect(w.reward.mood).toBeGreaterThan(0);
    }
  });
});

describe('the Chronicle', () => {
  const PARAMS: Record<string, string[]> = {
    achievement: ['achievement', 'description', 'credit'],
    'first-of': ['good'],
    founding: ['season', 'founders'],
    'household-arrived': ['family', 'place'],
    'household-left': ['family', 'place'],
    'pattern-discovered': ['pattern', 'place', 'credit', 'flavor'],
    'season-summary': ['season', 'year', 'people', 'coins', 'pages', 'wishes', 'books'],
    'wishes-digest': ['wishes', 'examples'],
    // I2 (C4D): lives, the rank-up and story characters.
    birth: ['child', 'parents'],
    'rank-up': ['proclamation', 'rank', 'credit'],
    seaside: ['name'],
    'story-arrived': ['name'],
    'story-finale': ['name'],
    wedding: ['a', 'b', 'when'],
  };

  it('has at least three variants per kind, using only the params its callers pass', () => {
    for (const c of chronicle) {
      expect(c.text.length, c.kind).toBeGreaterThanOrEqual(3);
      const allowed = [...(PARAMS[c.kind] ?? []), 'town', 'valley'];
      for (const t of c.text) clean(t, allowed, c.kind);
      // A credit reads "Ada and Bo, between them": it has to end its sentence.
      for (const t of c.text) if (t.includes('{credit}')) expect(t, c.kind).toMatch(/\{credit\}\./);
    }
  });

  it('has phrases for everything the sim stitches together', () => {
    for (const list of [
      chroniclePhrases.booksSurplus,
      chroniclePhrases.booksDeficit,
      chroniclePhrases.booksQuiet,
      chroniclePhrases.letterSignoff,
      chroniclePhrases.curiousPostscript,
      chroniclePhrases.awayDays,
      chroniclePhrases.awayQuiet,
      chroniclePhrases.atHome,
      chroniclePhrases.inTheOpen,
    ]) {
      expect(list.length).toBeGreaterThan(0);
      for (const t of list) clean(t, ['name', 'family', 'hint', 'days', 'building', 'n'], t);
    }
    expect(chroniclePhrases.numbers[12]).toBe('twelve');
  });
});

describe('patterns and achievements', () => {
  it('reveal hints in a fixed order and read cleanly', () => {
    const order = patterns.map((p) => p.hintOrder).sort((a, b) => a! - b!);
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    for (const p of patterns) {
      clean(p.hint, [], p.id);
      clean(p.flavor, [], p.id);
      expect(p.flavor.endsWith('.'), p.id).toBe(true);
    }
    for (const a of achievements) {
      clean(a.description, [], a.id);
      expect(a.description.endsWith('.'), a.id).toBe(true);
    }
  });
});

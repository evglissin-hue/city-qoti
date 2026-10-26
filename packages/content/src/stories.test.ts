// Story characters and life lines (C4D): well-formed arcs, characters made of real species and
// compatible traits, letters that use only {town}, hints with no placeholders, and clean words.
import { describe, expect, it } from 'vitest';
import { content, lifePhrases, stories } from './index';

const EM_DASH = /—|–/;
const BRITISH = /\b(colour|favour|honour|neighbour|centre|grey|travell|organis|realis|fulfil\b|whilst)/i;

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

function clean(text: string, allowed: readonly string[], where: string): void {
  expect(text, where).not.toMatch(EM_DASH);
  expect(text, where).not.toMatch(BRITISH);
  expect(text, where).not.toMatch(/ {2}/);
  for (const p of placeholders(text)) expect(allowed, `${where}: {${p}}`).toContain(p);
}

describe('story arcs', () => {
  it('have unique ids, four to six steps and a finale that gives something', () => {
    expect(new Set(stories.map((a) => a.id)).size).toBe(stories.length);
    for (const a of stories) {
      expect(a.steps.length, a.id).toBeGreaterThanOrEqual(4);
      expect(a.steps.length, a.id).toBeLessThanOrEqual(6);
      expect(a.finale.unlock?.length ?? 0, a.id).toBeGreaterThan(0);
      for (const s of a.steps) expect(Object.keys(s.reward).length, a.id).toBeGreaterThan(0);
    }
  });

  it('are about real species with compatible traits and their own names', () => {
    const names = new Set<string>();
    for (const a of stories) {
      const c = a.character;
      expect(content.speciesById.has(c.species), a.id).toBe(true);
      expect(c.traits.length, a.id).toBe(3);
      for (const t of c.traits) {
        const def = content.traitById.get(t);
        expect(def, `${a.id} ${t}`).toBeDefined();
        for (const u of c.traits) expect(def!.clashes, `${a.id}: ${t} and ${u}`).not.toContain(u);
      }
      names.add(`${c.given} ${c.family}`);
      clean(c.bio, [], `${a.id} bio`);
    }
    expect(names.size).toBe(stories.length);
  });

  it('write letters that only use {town}, and hints that use nothing', () => {
    for (const a of stories) {
      const letters = [a.hello, ...a.steps.map((s) => s.letter), a.finale.letter];
      for (const l of letters) {
        clean(l, ['town'], a.id);
        // A greeting, a body and a sign-off, one per line.
        expect(l.split('\n').length, a.id).toBeGreaterThanOrEqual(4);
      }
      expect(new Set(letters).size, a.id).toBe(letters.length);
      for (const s of a.steps) clean(s.hint, [], `${a.id} hint`);
    }
  });
});

describe('life lines', () => {
  it('have variety and only the placeholders the sim fills', () => {
    const lists: [string, readonly string[], string[]][] = [
      ['couple', lifePhrases.couple, ['a', 'b', 'town']],
      ['movedIn', lifePhrases.movedIn, ['place']],
      ['together', lifePhrases.together, ['a', 'b', 'place']],
      ['apprentice', lifePhrases.apprentice, ['name', 'place']],
      ['trained', lifePhrases.trained, ['name', 'place']],
      ['retired', lifePhrases.retired, ['name', 'place']],
      ['charterReady', lifePhrases.charterReady, ['rank']],
    ];
    for (const [name, list, allowed] of lists) {
      expect(list.length, name).toBeGreaterThanOrEqual(name === 'charterReady' ? 1 : 2);
      for (const t of list) clean(t, allowed, name);
    }
    for (const t of [lifePhrases.planApproved, lifePhrases.planPartly, lifePhrases.planNone]) {
      clean(t, ['who', 'plan', 'applied', 'skipped'], 'plans');
    }
    clean(lifePhrases.requestDone, ['what'], 'requests');
  });
});

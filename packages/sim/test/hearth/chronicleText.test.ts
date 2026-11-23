// The class of Chronicle text bugs R3G's printed storybook showed: "1 stars", "23 residents of us",
// and a lowercase start right after a period. Every kind and variant is filled with counts of 1 and
// 2 and with awkward strings, using the same fillText the sim uses.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { fillText } from '../../src/view/hamlet';

/** Params whose value carries its own noun ("1 star", "2 stars"); the template must not add one. */
const COUNTED: [string, string, string][] = [
  ['stars', 'star', 'stars'],
  ['guests', 'resident', 'residents'],
  ['people', 'resident', 'residents'],
  ['coins', 'coin', 'coins'],
  ['pages', 'page', 'pages'],
  ['wishes', 'wish', 'wishes'],
  ['hands', 'hand', 'hands'],
];
/** Plural nouns the templates use; "1 <one of these>" is always wrong. */
const PLURALS = ['stars', 'coins', 'hands', 'residents', 'pages', 'wishes', 'books', 'guests', 'families'];
const PLAIN = ['year', 'level'];

function paramsFor(n: number): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, one, many] of COUNTED) out.push([k, `${n} ${n === 1 ? one : many}`]);
  for (const k of PLAIN) out.push([k, String(n)]);
  return out;
}

const LOWER_PROBES: [string, string][] = [
  ['founders', 'the founders'],
  ['business', 'the Thistle bakery'],
  ['credit', 'ada'],
  ['books', 'one book'],
  ['examples', 'a bench by the river'],
  ['why', 'a quiet spell'],
  ['more', 'a little more of everything'],
  ['flavor', 'it smelled of rain'],
  ['description', 'a plaque'],
];

describe('chronicle templates read right at any count', () => {
  const all = content.chronicle.flatMap((t) => t.text.map((text, i) => ({ kind: t.kind, i, text })));

  it('have no plural noun after a placeholder that already carries its noun, and no "of us" tail', () => {
    for (const { kind, i, text } of all) {
      for (const [k] of COUNTED) {
        expect(text, `${kind}#${i}: {${k}} then a noun`).not.toMatch(
          new RegExp(`\\{${k}\\}\\s+(${PLURALS.join('|')})\\b`),
        );
      }
      expect(text, `${kind}#${i}`).not.toMatch(/\{\w+\}\s+of us\b/);
    }
  });

  for (const n of [1, 2]) {
    it(`fill cleanly with counts of ${n}`, () => {
      for (const { kind, i, text } of all) {
        const given = new Set([...paramsFor(n), ...LOWER_PROBES].map(([k]) => k));
        const rest = [...text.matchAll(/\{(\w+)\}/g)]
          .map((m) => m[1]!)
          .filter((k) => !given.has(k) && k !== 'town' && k !== 'valley')
          .map((k): [string, string] => [k, 'Clover']);
        const params: [string, string][] = [...paramsFor(n), ...LOWER_PROBES, ...rest];
        const out = fillText(text, [...params, ['town', 'Qoti'], ['valley', 'Hazel Vale']]);
        const where = `${kind}#${i}: ${out}`;
        expect(out, where).not.toMatch(/\{\w+\}/);
        expect(out, where).not.toMatch(new RegExp(`\\b1 (${PLURALS.join('|')})\\b`));
        expect(out, where).not.toMatch(/\b\d+ \w+ of us\b/);
        expect(out, where).not.toMatch(/[.!?] [a-z]/);
        expect(out, where).not.toMatch(/^[a-z]/);
        expect(out, where).not.toMatch(/ {2}/);
        expect(out, where).not.toMatch(/—|–/);
      }
    });
  }

  it('fillText capitalizes a value that starts a sentence', () => {
    expect(fillText('First edition. {founders} unrolled a map.', [['founders', 'the founders']])).toBe(
      'First edition. The founders unrolled a map.',
    );
    expect(fillText('Plans in {founders}.', [['founders', 'the founders']])).toBe('Plans in the founders.');
  });
});

// P1 player's chair: the Flower trellis card read "+6% work at a orchard". Every boosting piece's
// line takes the right article.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { boostText } from './decorText';

describe('decor boost lines', () => {
  it('say "an" before a vowel and "a" before anything else, for every boosting piece', () => {
    const lines = content.decor.map((d) => boostText(d)).filter((t): t is string => t !== null);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/ at a [aeiou]/);
      expect(line).not.toMatch(/ at an [^aeiou]/);
    }
  });
});

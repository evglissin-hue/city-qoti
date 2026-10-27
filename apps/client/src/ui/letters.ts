// Story letters (I2, C4F): the whole correspondence of a story arc, rebuilt from content up to its
// current step, with the arrival ticks of the ones that came this visit. Arcs the content does not
// know yet (the C4.0 mocks) fall back to the letters the Mirror received.
import { content } from '@qoti/content';
import type { LetterView, StoryView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';

export function letterKey(l: { arc: string; step: number }): string {
  return `${l.arc}:${l.step}`;
}

/** Fills {town} and {seat} (the reader's name). */
export function fillLetter(text: string, town: string, reader: string): string {
  return text.split('{town}').join(town).split('{seat}').join(reader);
}

/** Every letter of a story so far, oldest first. */
export function lettersOf(m: Mirror, s: StoryView, reader: string): LetterView[] {
  const arc = content.storyById.get(s.arc);
  const received = m.letters.value.filter((l) => l.arc === s.arc);
  if (!arc || s.step < 0) return received;
  const town = m.settings.value.townName;
  const tickOf = (step: number) => received.find((l) => l.step === step)?.tick ?? -1;
  const out: LetterView[] = [];
  const add = (step: number, text: string) =>
    out.push({
      arc: s.arc,
      from: s.name,
      residentId: s.residentId,
      text: fillLetter(text, town, reader),
      tick: tickOf(step),
      step,
    });
  add(-1, arc.hello);
  const last = Math.min(s.step, arc.steps.length - 1);
  for (let i = 0; i <= last; i++) add(i, arc.steps[i]!.letter);
  if (s.step >= arc.steps.length) add(arc.steps.length, arc.finale.letter);
  return out;
}

/** The story a letter belongs to, from the Mirror. */
export function storyOf(m: Mirror, l: LetterView): StoryView | undefined {
  return m.stories.get(l.arc);
}

/** "Step 2 of 5", "Hello", "The last letter". */
export function stepWord(step: number, steps: number): string {
  if (step < 0) return 'A hello';
  if (steps > 0 && step >= steps) return 'The last letter';
  return `Step ${step + 1} of ${steps}`;
}

// Working days by trade (R3B; docs/spec/19-evenings.md, Masters): `Resident.craft` is a list of
// [trade, days] sorted by trade with `<`. Days are only ever added, so they are kept across winters
// and changes of work.
import type { Resident } from '../../contracts';

/** The resident's working days in a trade (a trade id, or a specialized building's def id). */
export function craftDays(r: Resident, key: string): number {
  if (!r.craft) return 0;
  for (const [trade, days] of r.craft) if (trade === key) return days;
  return 0;
}

/** Adds `n` working days to a trade, keeping the list sorted by trade. */
export function addCraft(r: Resident, key: string, n: number): void {
  if (n <= 0) return;
  const craft = (r.craft ??= []);
  let i = 0;
  while (i < craft.length && craft[i]![0] < key) i++;
  if (i < craft.length && craft[i]![0] === key) craft[i]![1] += n;
  else craft.splice(i, 0, [key, n]);
}

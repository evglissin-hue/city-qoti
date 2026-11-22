// R3H: the inspector's level line for a specialized building that climbs (BuildingDetail.climb).
// Pure words over the sim's numbers: what the next level needs, how far along it is, what a slide
// would cost. The sim names the gains ("a fourth hand"); this module only puts them in sentences.
import { content, type BuildingDef } from '@qoti/content';
import { joinWords, specializedName, type SpecializedClimbView } from '@qoti/sim';
import { goodName, pluralName } from '../format';

const NUMBER_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function numberWord(n: number): string {
  return NUMBER_WORD[n] ?? String(n);
}

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** The trade the building serves, lowercase and plural ("bakers"), or a plain fallback. */
function servedTrade(def: BuildingDef): string {
  const trade = content.tradeById.get(def.enables?.[0] ?? '');
  return trade ? pluralName(trade.name).toLowerCase() : 'businesses';
}

/** What a good day is for this building, as a noun phrase: "timber carried off". */
function goodDay(climb: SpecializedClimbView, def: BuildingDef): string {
  switch (climb.good) {
    case 'carried': {
      const made = def.methods?.[0]?.outputs[0]?.[0];
      return `${made ? goodName(made).toLowerCase() : 'goods'} carried off`;
    }
    case 'customers':
      return `${climb.today.need} or more customers`;
    case 'served': {
      const trade = content.tradeById.get(def.enables?.[0] ?? '');
      const raw = trade?.method?.inputs[0]?.[0];
      return `${servedTrade(def)} kept in ${raw ? goodName(raw).toLowerCase() : 'supplies'}`;
    }
    case 'full':
      return 'a half-full store with every porter in';
  }
}

/** The level line: what the next level needs and how far along it is, or what a slide would cost. */
export function climbLine(climb: SpecializedClimbView, def: BuildingDef): string {
  const name = specializedName(def);
  if (climb.resting) {
    const water = def.placement?.some((r) => r.kind === 'river' || r.kind === 'waterEdge');
    return water
      ? 'Resting while the river is frozen; its days wait for the thaw.'
      : 'Resting out of season; its days wait for better weather.';
  }
  if (climb.surplus && climb.days >= 0) {
    const made = def.methods?.[0]?.outputs[0]?.[0];
    const what = made ? goodName(made).toLowerCase() : 'goods';
    return `The town has more ${what} than it can use, so ${name} has no call to grow.`;
  }
  if (climb.days < 0) {
    const left = Math.max(1, climb.downDays + climb.days);
    const lose = climb.lose.length ? `, giving up ${joinWords(climb.lose)}` : '';
    const poor = climb.surplus ? 'A poor day, with more in store than the town can use' : 'A poor day';
    return `${poor}: ${numberWord(left)} more in a row and ${name} slips back to level ${Math.max(1, climb.level - 1)}${lose}.`;
  }
  if (climb.level >= climb.max) return `Level ${climb.level}, as big as a ${def.name.toLowerCase()} gets.`;
  const left = Math.max(1, climb.upDays - climb.days);
  const more = `${cap(numberWord(left))} more good ${left === 1 ? 'day' : 'days'}`;
  const brings = climb.next.length ? `: ${joinWords(climb.next)}` : '';
  return `${more} of ${goodDay(climb, def)} and ${name} grows to level ${climb.level + 1}${brings}.`;
}

/** Today's count against the mark, or null when there is nothing to say. */
export function todayLine(climb: SpecializedClimbView, def?: BuildingDef): string | null {
  const { have, need } = climb.today;
  switch (climb.good) {
    case 'carried':
      return need > 0 ? `Today: ${have} of ${need} carried off.` : null;
    case 'customers':
      return `Today: ${have} ${have === 1 ? 'customer' : 'customers'} of ${need}.`;
    case 'served':
      return need > 0
        ? `Today: ${have} of ${need} ${def ? servedTrade(def) : 'businesses'} kept supplied.`
        : null;
    case 'full':
      return `In store: ${have.toLocaleString('en-US')} of the ${need.toLocaleString('en-US')} a good day needs.`;
  }
}

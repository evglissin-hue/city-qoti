// The season report's weather, harvest and warmth lines (C5A), and the season card's lines that
// make winter visible early (the larder and the woodpile from autumn on). Pure: reads state. The
// report is built at 23:02 on the season's last day, so `economy.season` still holds this season.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, SEASON_NAMES } from '../../constants';
import type { SeasonReportLine, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { dayIndex } from '../../systems/economy/time';
import { larder } from '../../systems/seasons/stores';

function good(id: string): number {
  return content.goodIndex.get(id) ?? -1;
}

/** Firewood in the storehouses and the households' pantries. */
export function woodpile(state: WorldState): number {
  const g = good('firewood');
  if (g < 0) return 0;
  let n = 0;
  for (const b of state.buildings) if (b.rt) n += (b.rt.store[g] ?? 0) + (b.rt.output[g] ?? 0);
  for (const h of state.households) n += h.pantry[g] ?? 0;
  return n;
}

/** Days the larder would feed the town (one unit a resident a day). */
export function larderDays(state: WorldState): number {
  return Math.floor(larder(state) / Math.max(1, state.residents.length));
}

/** Days the woodpile would warm the town (one firewood a household a day). */
export function woodDays(state: WorldState): number {
  return Math.floor(woodpile(state) / Math.max(1, state.households.length));
}

/** Season card lines (autumn and winter): the larder and the woodpile against the winter ahead. */
export function weatherCardLines(state: WorldState): string[] {
  const { season } = seasonAt(state.tick);
  if (season < 2) return [];
  const food = larderDays(state);
  const wood = woodDays(state);
  const winter = DAYS_PER_SEASON;
  const lines = [`Winter stores: ${food} days of food and ${wood} of firewood, for a winter of ${winter}.`];
  if (season === 2 && (food < winter || wood < winter)) {
    lines.push(
      food < winter
        ? 'Nothing grows in winter and the river freezes: bring in the harvest and keep the wheat.'
        : 'Every hearth burns a firewood a day in winter: a chopping shed turns logs into firewood.',
    );
  }
  return lines;
}

/** Events that ran this season, oldest first (the latest of each kind is kept). */
function eventsThisSeason(state: WorldState): string[] {
  const today = dayIndex(state.tick);
  const first = today - (seasonAt(state.tick).day - 1);
  const out: string[] = [];
  for (const v of state.weather.events) {
    const d = dayIndex(v.start);
    if (d >= first && d <= today && v.start <= state.tick)
      out.push(content.eventById.get(v.event)?.name ?? v.event);
  }
  return out;
}

export function weatherLines(state: WorldState): { hearth: SeasonReportLine[]; ledger: SeasonReportLine[] } {
  const hearth: SeasonReportLine[] = [];
  const ledger: SeasonReportLine[] = [];
  const { season } = seasonAt(state.tick);
  const name = SEASON_NAMES[season] ?? '';
  for (const e of eventsThisSeason(state))
    hearth.push({ track: 'weather', text: `${e} this ${name.toLowerCase()}.` });
  if (season === 3) {
    const w = state.warmth;
    if (w.coldHouseholdDays === 0) {
      hearth.push({ track: 'weather', text: 'Nobody was cold this winter.' });
    } else {
      hearth.push({
        track: 'weather',
        text: 'Some hearths went cold this winter.',
        value: w.coldHouseholdDays,
      });
    }
    if (state.weather.river.frozenTick >= 0) {
      const days = dayIndex(state.tick) - dayIndex(state.weather.river.frozenTick) + 1;
      hearth.push({ track: 'weather', text: 'Days the river was frozen (and skated on).', value: days });
    }
    const fw = good('firewood');
    if (fw >= 0)
      ledger.push({
        track: 'weather',
        text: 'Firewood burned and used.',
        value: state.economy.season.consumed[fw] ?? 0,
      });
  }
  const wheat = good('wheat');
  if (wheat >= 0 && (season === 2 || season === 3)) {
    ledger.push({
      track: 'weather',
      text: 'Wheat brought in.',
      value: state.economy.season.produced[wheat] ?? 0,
    });
  }
  ledger.push({ track: 'weather', text: 'Days of food in the larder.', value: larderDays(state) });
  return { hearth, ledger };
}

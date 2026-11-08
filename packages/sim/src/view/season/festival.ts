// The season report's festival, renown, commission and dock lines (C5B). Pure: reads state. Built
// at 23:02 on the season's last day, after the festival, so the history holds tonight's.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, FESTIVAL, TICKS_PER_DAY } from '../../constants';
import { hourOf } from '../../systems/economy/time';
import type { SeasonReportLine, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';

export function festivalLines(state: WorldState): {
  hearth: SeasonReportLine[];
  ledger: SeasonReportLine[];
} {
  const hearth: SeasonReportLine[] = [];
  const ledger: SeasonReportLine[] = [];
  const { season, year } = seasonAt(state.tick);
  const last = state.festival.history[state.festival.history.length - 1];
  const name = content.festivalById.get(content.seasons[season]?.festival ?? '')?.name ?? 'The festival';
  if (last && last.season === season && last.year === year) {
    const o = state.festival.outcome;
    const guests = o ? ` with ${o.attendance} guests` : '';
    hearth.push({ track: 'festival', text: `${name}${guests}.`, value: last.stars });
  } else if (seasonAt(state.tick).day === FESTIVAL.day && hourOf(state.tick) >= FESTIVAL.to) {
    hearth.push({
      track: 'festival',
      text: `${name} was a quiet evening this year. There is always the next one.`,
    });
  }
  const since = Math.max(0, state.tick - DAYS_PER_SEASON * TICKS_PER_DAY);
  let renown = 0;
  for (const e of state.renown.log) if (e.tick > since) renown += e.points;
  if (renown > 0) {
    const level = content.renown[state.renown.level]?.name ?? '';
    hearth.push({
      track: 'festival',
      text: `Renown grew by ${renown}: the valley calls the town ${level}.`,
      value: renown,
    });
  }
  const eaten = eatenTonight(state);
  if (eaten > 0) ledger.push({ track: 'festival', text: 'Menu goods eaten at the festival.', value: eaten });
  let done = 0;
  for (const c of state.commissions.list) if (c.status === 'done' && c.deadlineTick > since) done++;
  if (done > 0) ledger.push({ track: 'festival', text: 'Commissions delivered this season.', value: done });
  let boats = 0;
  for (const l of state.dock.log) if (l.tick > since) boats += Math.abs(l.qty);
  if (boats > 0)
    ledger.push({
      track: 'festival',
      text: 'Units carried by boat to and from the River Dock.',
      value: boats,
    });
  return { hearth, ledger };
}

function eatenTonight(state: WorldState): number {
  const { season, year } = seasonAt(state.tick);
  const last = state.festival.history[state.festival.history.length - 1];
  if (!last || last.season !== season || last.year !== year) return 0;
  return state.festival.outcome?.eaten ?? 0;
}

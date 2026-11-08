// The season report's nature lines (C5C): new Field Guide pages, where the habitats are strong, and
// for the Ledger what the bees added and what summer pests took. Pure: reads state. Built at 23:02 on
// the season's last day, so `economy.season` still holds this season.
import { content } from '@qoti/content';
import { HABITAT_IDS } from '../../constants';
import type { SeasonReportLine, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { dayIndex } from '../../systems/economy/time';
import { isCropGrower, pollinatorPermille, SUMMER } from '../../systems/nature/effects';
import { CHUNKS } from '../../systems/nature/habitats';
import { listJoin } from '../../systems/chronicle/text';

/** A chunk counts as good habitat from this score. */
export const GOOD_HABITAT = 60;

function lower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Species first seen this season, in Field Guide order. */
export function newSpecies(state: WorldState): string[] {
  const today = dayIndex(state.tick);
  const first = today - (seasonAt(state.tick).day - 1);
  return state.nature.guide.filter((e) => dayIndex(e.firstTick) >= first).map((e) => e.species);
}

/** Chunks of good habitat, per habitat, in HABITAT_IDS order. */
export function goodHabitats(state: WorldState): number[] {
  return HABITAT_IDS.map((_, h) => {
    let n = 0;
    for (let c = 0; c < CHUNKS; c++) if ((state.nature.habitats[h * CHUNKS + c] ?? 0) >= GOOD_HABITAT) n++;
    return n;
  });
}

export function natureLines(state: WorldState): { hearth: SeasonReportLine[]; ledger: SeasonReportLine[] } {
  const hearth: SeasonReportLine[] = [];
  const ledger: SeasonReportLine[] = [];
  const fresh = newSpecies(state);
  if (fresh.length > 0) {
    const names = fresh.map((id) => lower(content.wildlifeById.get(id)?.name ?? id));
    hearth.push({
      track: 'nature',
      text: `New in the Field Guide: ${listJoin(names)}.`,
      value: fresh.length,
    });
  } else if (state.nature.guide.length > 0 && state.nature.guide.length < content.wildlife.length) {
    hearth.push({
      track: 'nature',
      text: 'No new pages in the Field Guide this season. The hints know where to look.',
    });
  }
  const good = goodHabitats(state);
  const parts: string[] = [];
  content.habitats.forEach((h, i) => {
    if (good[i]! > 0) parts.push(`${lower(h.name)} in ${good[i]}`);
  });
  if (parts.length > 0) {
    hearth.push({
      track: 'nature',
      text: `Good habitat, by corners of the valley: ${listJoin(parts)}.`,
      value: good.reduce((a, b) => a + b, 0),
    });
  }

  let growers = 0;
  let lift = 0;
  for (const b of state.buildings) {
    const def = content.buildingById.get(b.def);
    if (b.stage !== 'built' || !b.rt || !isCropGrower(def)) continue;
    growers++;
    lift += pollinatorPermille(state, b, def) - 1000;
  }
  if (growers > 0) {
    const pct = Math.round(lift / growers / 10);
    ledger.push({
      track: 'nature',
      text:
        pct > 0
          ? `Bees lifted farm and orchard yields by ${pct}% on average.`
          : 'No bees to speak of near the farms: flowers by the fields would lift the yields.',
      value: pct,
    });
  }
  const honey = content.goodIndex.get('honey');
  const made = honey === undefined ? 0 : (state.economy.season.produced[honey] ?? 0);
  if (made > 0) ledger.push({ track: 'nature', text: `The apiaries made ${made} honey.`, value: made });
  if (seasonAt(state.tick).season === SUMMER && state.nature.pests.length > 0) {
    const avg = Math.round(
      state.nature.pests.reduce((a, [, p]) => a + p, 0) / state.nature.pests.length / 10,
    );
    ledger.push({
      track: 'nature',
      text:
        avg > 0
          ? `Summer pests took ${avg}% of the crops. Songbirds and frogs near the fields eat them.`
          : 'Summer pests found nothing to eat: the birds and frogs saw to that.',
      value: avg,
    });
  }
  return { hearth, ledger };
}

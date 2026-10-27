// Mock I3 views for UI work (C5.0), built from the sim's winter and threat fixtures
// (packages/sim/test/fixtures/winter.ts and threat.ts) with the sim's own view builders, so ids,
// names and numbers match the live ?debug&fixture=winter and =raid valleys exactly. On top: a little
// history the fixtures cannot have yet (a season report, a festival result, a raid's card, a
// commission and a boat, a guide step). C5F builds the I3 pages against these first.
import {
  commissionView,
  dockView,
  festivalView,
  fieldGuideEntryView,
  guideView,
  raidResultView,
  raidView,
  renownView,
  seasonCardView,
  threatView,
  trialView,
  watchView,
  weatherView,
  type CommissionView,
  type DockView,
  type FestivalResultView,
  type FestivalView,
  type FieldGuideEntryView,
  type GuideView,
  type RaidResultView,
  type RaidView,
  type RenownView,
  type SeasonCardView,
  type SeasonReportView,
  type ThreatView,
  type TrialView,
  type WatchView,
  type WeatherView,
} from '@qoti/sim';
import { raidAtDusk, threatFixture } from '../../../../../packages/sim/test/fixtures/threat';
import { winterFixture } from '../../../../../packages/sim/test/fixtures/winter';

const winter = winterFixture();
const w = winter.state;
const threat = threatFixture();
const dusk = raidAtDusk();

// History the fixtures lack: a commission offered, a boat moored before the ice, a captive.
w.commissions.list.push({
  id: w.nextId++,
  def: 'millhaven-coats',
  from: 'millhaven',
  status: 'offered',
  offeredTick: w.tick - 4800,
  deadlineTick: 0,
  progress: 0,
});
w.dock.boats.push({
  id: w.nextId++,
  neighbor: 'millhaven',
  selling: [[0, 20]],
  buying: [[5, 10]],
  arriveTick: w.tick - 9600,
  departTick: w.tick - 4800,
  tile: -1,
});
dusk.state.threats.captives.push(dusk.raiders[0]!);

export const winterIds = {
  households: winter.village.households,
  cold: winter.cold,
  watch: winter.watch,
  bathHouse: winter.bathHouse,
  watchHouse: winter.watchHouse,
};
export const threatIds = {
  gate: threat.gate,
  watchtower: threat.watchtower,
  watchHouse: threat.watchHouse,
  raiders: dusk.raiders,
};

export const mockSeasonCard: SeasonCardView = seasonCardView(w);
export const mockWeather: WeatherView = weatherView(w);
export const mockFestival: FestivalView = festivalView(w);
export const mockRenown: RenownView = renownView(w);
export const mockCommissions: CommissionView[] = w.commissions.list.map(commissionView);
export const mockDock: DockView = dockView(w);
export const mockFieldGuide: FieldGuideEntryView[] = w.nature.guide.map(fieldGuideEntryView);
export const mockTrial: TrialView = trialView(w)!;
export const mockWinterWatch: WatchView = watchView(w);
export const mockThreat: ThreatView = threatView(threat.state);
export const mockWatch: WatchView = watchView(threat.state);
export const mockRaid: RaidView = raidView(dusk.state)!;
export const mockRaidResult: RaidResultView = {
  ...raidResultView({
    tick: dusk.state.tick + 1200,
    band: 'medium',
    side: 'n',
    stolen: 6,
    captured: 2,
    repelled: true,
  }),
  stolen: [['bread', 6]],
  damage: 12,
  renown: 3,
  morale: 8,
};

export const mockFestivalResult: FestivalResultView = {
  festival: 'harvest-supper',
  season: 2,
  year: 1,
  attendance: 52,
  joy: { site: 70, variety: 55, menu: 80, music: 40, twist: 65 },
  stars: 4,
  twist: 'harvest-display',
};

export const mockSeasonReport: SeasonReportView = {
  season: 2,
  year: 1,
  hearth: [
    {
      track: 'festival',
      text: 'The Harvest Supper earned four stars. The marrow is still talked about.',
      value: 4,
    },
    { track: 'nature', text: 'A robin moved into the hedge by the well.', value: 1 },
  ],
  ledger: [
    { track: 'weather', text: 'An early frost took a third of the wheat still in the fields.', value: 12 },
    { track: 'threat', text: 'No raid this season. The Watch practiced looking stern.' },
  ],
};

/** A guide step as C5H will send it (the stub guide's letters are empty until then). */
export const mockGuide: GuideView = {
  ...guideView(w),
  step: 1,
  id: 'first-homes',
  lens: 'ledger',
  letter:
    'Dear both,\nA lane is a fine start, but nobody moves in to admire a lane.\nTwo homes, please, near the start.\nTobias Merriweather, County Surveyor',
  hint: 'Build two cottages along the lane.',
  point: { tool: 'build' },
  done: [true, false, false, false, false, false, false, false],
  over: false,
};

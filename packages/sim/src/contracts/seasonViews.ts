// I3 view contracts (C5.0): what the worker sends the client about seasons, weather, festivals,
// renown, commissions, the River Dock, nature, threats, the Watch, raids, trials and the guide.
// docs/spec/20-architecture.md, "I3 contracts". Views name goods and content by id, never by index.
import type { EntityId, SeatId } from './ids';
import type { RaidBand, RaidSide, SeasonIndex, WeatherKind } from './seasons';

export interface WeatherEventView {
  id: EntityId;
  /** Content event id. */
  event: string;
  name: string;
  start: number;
  end: number;
  forecastTick: number;
  /** Running now. */
  active: boolean;
}

/** Weather in the top bar and the barometer. */
export interface WeatherView {
  today: WeatherKind;
  /** Up to 2 days ahead, nearest first: [absolute day, kind]. */
  forecast: [day: number, kind: WeatherKind][];
  events: WeatherEventView[];
  frozen: boolean;
}

/** What a seat sees of a coming raid. The Hearth lens never shows raw pressure (P36). */
export interface ThreatView {
  /** Telegraphed raid, or null when none is coming. */
  band: RaidBand | null;
  side: RaidSide | null;
  /** Whole days until it comes (0 = tonight). */
  daysLeft: number | null;
  /** Signs seen so far: 'tracks', 'crows', 'letter'. */
  signs: string[];
  /** Wolves are expected tonight. */
  wolvesTonight: boolean;
  /** Ledger lens only: pressure in permille of the threshold. */
  pressure?: number;
}

/** The season card that opens each evening (C5F draws it). */
export interface SeasonCardView {
  season: SeasonIndex;
  year: number;
  name: string;
  /** This season's festival and its absolute day. */
  festival: { id: string; name: string; day: number };
  /** Lines for the Charter or trial steps that matter this season. */
  steps: string[];
  weather: WeatherView;
  threat: ThreatView;
}

/** One line of the season report, from one track's builder in view/season/. */
export interface SeasonReportLine {
  track: 'weather' | 'festival' | 'nature' | 'threat';
  text: string;
  /** A number worth showing beside the line (stars, species, units lost). */
  value?: number;
}

/** The two-page season report that closes a season. */
export interface SeasonReportView {
  season: SeasonIndex;
  year: number;
  hearth: SeasonReportLine[];
  ledger: SeasonReportLine[];
}

export interface FestivalPlanView {
  festival: string;
  /** 'rect' with x0, z0, x1, z1, or 'pattern' with its id and anchor tile. */
  site: { rect: [number, number, number, number] } | { pattern: string; anchor: number } | null;
  /** Goods by id: [good, wanted, reserved]. */
  menu: [good: string, qty: number, reserved: number][];
  twist: string;
  music: 'none' | 'resident' | 'bandstand';
  musician: EntityId;
  by: SeatId;
}

export interface FestivalView {
  /** This season's festival. */
  festival: { id: string; name: string; season: SeasonIndex };
  /** Absolute day it is held. */
  day: number;
  plan: FestivalPlanView | null;
  pieces: EntityId[];
  live: boolean;
}

export interface FestivalResultView {
  festival: string;
  season: SeasonIndex;
  year: number;
  attendance: number;
  joy: { site: number; variety: number; menu: number; music: number; twist: number };
  stars: number;
  twist: string;
}

export interface RenownView {
  points: number;
  level: number;
  name: string;
  /** Points needed for the next level, null at the top. */
  next: number | null;
  log: { tick: number; source: string; points: number }[];
}

export interface CommissionView {
  id: EntityId;
  def: string;
  name: string;
  from: string;
  status: 'offered' | 'accepted' | 'done' | 'declined' | 'expired';
  offeredTick: number;
  deadlineTick: number;
  progress: number;
  /** Readable ask ("12 pies to Millhaven"). */
  ask: string;
}

export interface DockView {
  boats: {
    id: EntityId;
    neighbor: string;
    selling: [good: string, qty: number][];
    buying: [good: string, qty: number][];
    arriveTick: number;
    departTick: number;
    moored: boolean;
  }[];
  /** The river is frozen: no boats until spring. */
  frozen: boolean;
}

export interface FieldGuideEntryView {
  species: string;
  name: string;
  kind: string;
  firstTick: number;
  seats: SeatId[];
  count: number;
  flavor: string;
}

export interface WatchView {
  members: EntityId[];
  target: number;
  training: number;
  morale: number;
  /** Guard tiles as [x, z]. */
  posture: [number, number][];
  duty: EntityId[];
  /** Coins a day. */
  budget: number;
  /** Members x training x morale, as a whole number for the panel. */
  strength: number;
}

/** The live raid, for its few controls (C5F). */
export interface RaidView {
  id: EntityId;
  side: RaidSide;
  band: RaidBand;
  raiders: number;
  fled: number;
  captured: number;
  bell: boolean;
  lanterns: boolean;
  /** Captured raiders waiting for bandit.decide. */
  captures: EntityId[];
}

export interface RaidResultView {
  tick: number;
  band: RaidBand;
  side: RaidSide;
  stolen: [good: string, qty: number][];
  /** Condition points lost across buildings. */
  damage: number;
  captured: number;
  repelled: boolean;
  renown: number;
  /** Watch morale change. */
  morale: number;
}

export interface TrialView {
  kind: 'winter' | 'raid' | 'flood';
  name: string;
  blurb: string;
  charter: string;
  season: SeasonIndex;
  year: number;
  status: 'upcoming' | 'running' | 'passed' | 'failed';
  measured: [name: string, value: number][];
}

/** The first days guide's open step (C5H). */
export interface GuideView {
  /** Index of the open step, `of` when done. */
  step: number;
  of: number;
  id: string;
  lens: 'hearth' | 'ledger' | 'both';
  letter: string;
  hint: string;
  point?: { tool?: string; panel?: string; overlay?: string; tile?: [number, number] };
  /** Steps done, in order. */
  done: boolean[];
  /** Per seat: hidden by that seat. */
  hidden: boolean[];
  over: boolean;
}

/** A snapshot the lowest connected seat's client captures for a notable Chronicle entry (C5E, C5F). */
export interface ChronicleSnapshot {
  /** World tile to center on. */
  focus: [number, number];
  /** Tiles around it to frame. */
  radius: number;
}

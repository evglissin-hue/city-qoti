// Words for hamlet facts: needs, moods, stages, statuses and categories. Warm and dry.
import { BuildingStatus, MOOD_BAND_NAMES } from '@qoti/sim';

export const NEED_LABEL: Record<string, string> = {
  food: 'Food',
  water: 'Water',
  shelter: 'Shelter',
  belonging: 'Belonging',
  beauty: 'Beauty',
  // I2 (C4F)
  goods: 'Goods',
  social: 'Company',
  health: 'Health',
  education: 'Schooling',
};

export const MOOD_WORD = MOOD_BAND_NAMES;

/** A line under the mood band, so the band reads like a person rather than a number. */
export const MOOD_LINE = [
  'Thinking about leaving. Thinking about it loudly.',
  'Not having a good week.',
  'Fine. Just fine.',
  'Quite content, thank you.',
  'Practically glowing.',
] as const;

export const STAGE_WORD: Record<string, string> = {
  child: 'child',
  young: 'young',
  adult: 'adult',
  elder: 'elder',
};

export const CONSTRUCTION_STAGES = ['Staked plot', 'Foundation', 'Frame', 'Roof'] as const;

/** Readable building status, by BuildingStatus bit, for when the worker has not answered yet. */
export const STATUS_WORDS: [bit: number, text: string][] = [
  [BuildingStatus.noWorkers, 'Nobody works here yet'],
  [BuildingStatus.missingInput, 'Waiting for inputs'],
  [BuildingStatus.outputFull, 'Output is piling up'],
  [BuildingStatus.noRoad, 'No road at the door'],
  [BuildingStatus.noPorters, 'No porters yet'],
  [BuildingStatus.paused, 'Paused'],
  [BuildingStatus.disrepair, 'In disrepair'],
  [BuildingStatus.waitingMaterials, 'Waiting for materials'],
  [BuildingStatus.waitingBuilders, 'Waiting for builders'],
  [BuildingStatus.noTrees, 'No mature trees in reach'],
  [BuildingStatus.noFields, 'No fields to tend'],
  [BuildingStatus.fallow, 'Fields lie ready for spring'],
];

/** Status bits that mean a building is idle (the Ledger's idle alerts). */
export const IDLE_BITS =
  BuildingStatus.noWorkers |
  BuildingStatus.missingInput |
  BuildingStatus.outputFull |
  BuildingStatus.noRoad |
  BuildingStatus.noPorters |
  BuildingStatus.noTrees |
  BuildingStatus.noFields;

export function statusWords(bits: number): string[] {
  return STATUS_WORDS.filter(([bit]) => bits & bit).map(([, text]) => text);
}

export const CATEGORY_WORD: Record<string, string> = {
  home: 'Home',
  production: 'Workshop',
  storage: 'Storage',
  service: 'Service',
  civic: 'Civic',
  landmark: 'Landmark',
  defense: 'Defense',
};

/** History kinds the baseline sim sends as bare ids, in words. */
export const HISTORY_WORD: Record<string, string> = {
  arrived: 'Arrived in the valley',
  job: 'Started a new job',
  'job-lost': 'Lost their job',
  friend: 'Made a friend',
  moved: 'Moved house',
  wish: 'Made a wish',
  'wish-granted': 'Had a wish come true',
  'wish-expired': 'Let a wish go',
  born: 'Was born in the valley',
  'grew-up': 'Grew up a little',
  // I2 (C4F)
  couple: 'Fell for someone',
  wedding: 'Got married',
  birth: 'Welcomed a baby',
  apprentice: 'Took up an apprenticeship',
  retired: 'Retired',
  seaside: 'Moved to the seaside',
  'tier-up': 'Moved up in the world',
  'tier-down': 'Tightened the belt',
};

export const TIER_WORD: Record<string, string> = {
  settler: 'Settler',
  craftsfolk: 'Craftsfolk',
  merchant: 'Merchant',
  patron: 'Patron',
};

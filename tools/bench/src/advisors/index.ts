// The autoplayer's advisors (C5.0): one line each, alphabetical. Visit order is each advisor's
// `slot`, not its place here. An I3 track adds its advisor (seasons, festivals, nature, threats) as
// `advisors/<area>.ts` with a line below; its `plays` checks that its system exists, so a run plays
// every system it finds.
import { charter } from './charter';
import { festivals } from './festivals';
import { guide } from './guide';
import { hamlet } from './hamlet';
import { hearth } from './hearth';
import { lamps } from './lamps';
import { land } from './land';
import { money } from './money';
import { nature } from './nature';
import { places } from './places';
import { plan } from './plan';
import { shops } from './shops';
import { supplies } from './supplies';
import { together } from './together';
import type { AdvisorDef } from './types';
import { village } from './village';
import { watch } from './watch';

export type { Advisor, AdvisorDef, AutoplayOptions, Visit } from './types';

// prettier-ignore
export const advisors: readonly AdvisorDef[] = [
  charter,
  festivals,
  guide,
  hamlet,
  hearth,
  lamps,
  land,
  money,
  nature,
  places,
  plan,
  shops,
  supplies,
  together,
  village,
  watch,
];

// The autoplayer's advisors (C5.0): one line each, alphabetical. Visit order is each advisor's
// `slot`, not its place here. An I3 track adds its advisor (seasons, festivals, nature, threats) as
// `advisors/<area>.ts` with a line below; its `plays` checks that its system exists, so a run plays
// every system it finds.
import { charter } from './charter';
import { festivals } from './festivals';
import { guide } from './guide';
import { hamlet } from './hamlet';
import { hearth } from './hearth';
import { money } from './money';
import { nature } from './nature';
import { seasons } from './seasons';
import { street } from './street';
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
  money,
  nature,
  seasons,
  street,
  together,
  village,
  watch,
];

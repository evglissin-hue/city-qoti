// Festival commands (C5.0 baseline; C5B owns festivals). docs/spec/12-hearth.md, Festivals. The plan
// is this season's: a site (open ground of 6x6 or more with no building, water or tree on it, or a
// pattern site standing now), up to four goods on the menu, a twist (never the last festival's) and
// music (a musician in town, or the bandstand once Juniper Reed has given the town one). Goods
// already put by that leave the menu go back to the storehouses. C5B's systems put the menu by at
// noon on day 6, run the evening and tidy the pieces.
import { content } from '@qoti/content';
import { FESTIVAL, FESTIVAL_MENU_MAX, MAP_SIZE } from '../constants';
import type { FestivalSite, RejectReason, SeasonIndex, WorldState } from '../contracts';
import { inBounds } from '../map/layers';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { seasonAt } from '../state/seasons';
import { hourOf } from '../systems/economy/time';
import {
  hasBandstand,
  isFestivalDay,
  musicianFor,
  RESERVE_HOUR,
  reserveMenu,
  returnReserved,
} from '../systems/festivals/api';
import {
  FESTIVAL_SITE_MIN,
  openGround,
  patternSiteOf,
  rectCenter,
  siteRect,
} from '../systems/festivals/site';
import { festivalView } from '../view/seasons';
import type { HandlerFor } from './util';

/** Festival sites: at least FESTIVAL_SITE_MIN tiles a side (systems/festivals/site), at most this. */
export { FESTIVAL_SITE_MIN };
export const FESTIVAL_SITE_MAX = 24;
const MAX_MENU_QTY = 500;
const MUSIC = ['none', 'resident', 'bandstand'];

function checkSite(state: WorldState, site: unknown): RejectReason | null {
  if (site === null) return null;
  if (typeof site !== 'object' || Array.isArray(site)) return 'INVALID';
  const s = site as FestivalSite;
  if ('rect' in s) {
    const r = s.rect;
    if (!Array.isArray(r) || r.length !== 4 || !r.every(isInt)) return 'INVALID';
    const [x0, z0, x1, z1] = r;
    if (!inBounds(x0, z0, MAP_SIZE) || !inBounds(x1, z1, MAP_SIZE)) return 'OUT_OF_BOUNDS';
    const w = x1 - x0 + 1;
    const d = z1 - z0 + 1;
    if (w < FESTIVAL_SITE_MIN || d < FESTIVAL_SITE_MIN) return 'INVALID';
    if (w > FESTIVAL_SITE_MAX || d > FESTIVAL_SITE_MAX) return 'TOO_MANY';
    return isStandard(state) ? openGround(state, [x0, z0, x1, z1]) : null;
  }
  if ('pattern' in s) {
    if (!content.patternById.has(s.pattern) || !isInt(s.anchor)) return 'INVALID';
    return patternSiteOf(state, s.pattern, s.anchor) ? null : 'NOT_FOUND';
  }
  return 'INVALID';
}

function checkMenu(menu: unknown): RejectReason | null {
  if (!Array.isArray(menu)) return 'INVALID';
  if (menu.length > FESTIVAL_MENU_MAX) return 'TOO_MANY';
  const seen = new Set<string>();
  for (const line of menu) {
    if (!Array.isArray(line) || line.length !== 2) return 'INVALID';
    const [good, qty] = line as [unknown, unknown];
    if (typeof good !== 'string' || !content.goodById.has(good) || seen.has(good)) return 'INVALID';
    if (!isInt(qty) || qty < 1 || qty > MAX_MENU_QTY) return 'INVALID';
    seen.add(good);
  }
  return null;
}

function seasonNow(state: WorldState): { season: SeasonIndex; year: number } {
  const { season, year } = seasonAt(state.tick);
  return { season: season as SeasonIndex, year };
}

export const plan: HandlerFor<'festival.plan'> = {
  type: 'festival.plan',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    // The evening has begun (or is over): a plan now would never be held.
    if (isFestivalDay(state) && hourOf(state.tick) >= FESTIVAL.from) return 'TOO_LATE';
    const bad = checkSite(state, cmd.site) ?? checkMenu(cmd.menu);
    if (bad) return bad;
    if (cmd.twist !== undefined && cmd.twist !== '') {
      const t = typeof cmd.twist === 'string' ? content.twistById.get(cmd.twist) : undefined;
      if (!t) return 'INVALID';
      if (t.seasons && !t.seasons.includes(seasonNow(state).season)) return 'NOT_ALLOWED';
      // The twist rotates: never the same as the last festival's.
      const last = state.festival.history[state.festival.history.length - 1];
      if (last && last.twist === cmd.twist) return 'NOT_ALLOWED';
    }
    if (cmd.music !== undefined && !MUSIC.includes(cmd.music)) return 'INVALID';
    if (cmd.music === 'resident' && !musicianFor(state)) return 'NOT_FOUND';
    if (cmd.music === 'bandstand' && !hasBandstand(state)) return 'LOCKED';
    return state.festival.live ? 'NOT_ALLOWED' : null;
  },
  apply(state, seat, cmd, ctx) {
    const { season, year } = seasonNow(state);
    const old = state.festival.plan;
    const menu = cmd.menu.map(([g, q]) => [content.goodIndex.get(g)!, q] as [number, number]);
    // What is already put by for goods still on the menu stays put by (up to the new quantity);
    // the rest goes back to the storehouses.
    const same = old && old.season === season && old.year === year;
    const reserved: [number, number][] = [];
    const back: [number, number][] = [];
    for (const [g, q] of old?.reserved ?? []) {
      const keep = same ? Math.min(q, menu.find(([m]) => m === g)?.[1] ?? 0) : 0;
      if (keep > 0) reserved.push([g, keep]);
      if (q > keep) back.push([g, q - keep]);
    }
    if (back.length > 0) {
      const r = old ? siteRect(state, old.site) : null;
      const [cx, cz] = r ? rectCenter(r) : [MAP_SIZE >> 1, MAP_SIZE >> 1];
      returnReserved(state, back, cz * MAP_SIZE + cx);
    }
    state.festival.plan = {
      festival: content.seasons[season]?.festival ?? '',
      season,
      year,
      site: cmd.site === null ? null : 'rect' in cmd.site ? { rect: [...cmd.site.rect] } : { ...cmd.site },
      menu,
      reserved,
      twist: cmd.twist ?? '',
      music: cmd.music ?? 'none',
      musician: cmd.music === 'resident' ? musicianFor(state) : 0,
      by: seat,
      tick: state.tick,
    };
    // Planned on the festival day after the menu hour: the noon pass has gone, so put it by now.
    if (isFestivalDay(state) && hourOf(state.tick) >= RESERVE_HOUR) reserveMenu(state, null);
    ctx.events.push({ e: 'festival.updated', f: festivalView(state) });
  },
};

export const keepPiece: HandlerFor<'festival.keepPiece'> = {
  type: 'festival.keepPiece',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.decor)) return 'INVALID';
    const d = findById(state.decor, cmd.decor);
    if (!d?.festival) return 'NOT_FOUND';
    if (d.festival.kept) return 'INVALID';
    return content.decorById.get(d.def)?.festival?.keepable ? null : 'NOT_ALLOWED';
  },
  apply(state, _seat, cmd, ctx) {
    const d = findById(state.decor, cmd.decor)!;
    // Kept pieces stay as ordinary decor from now on.
    d.festival = { kept: true };
    state.festival.pieces = state.festival.pieces.filter((id) => id !== cmd.decor);
    ctx.events.push({ e: 'festival.updated', f: festivalView(state) });
  },
};

// Festival commands (C5.0 baseline; C5B owns festivals). docs/spec/12-hearth.md, Festivals. The plan
// is this season's: a site (open ground of 6x6 or more, or a pattern site), up to four goods on the
// menu, a twist and music. C5B reserves the menu, places and tidies the pieces, and runs the night.
import { content } from '@qoti/content';
import { FESTIVAL_MENU_MAX, MAP_SIZE } from '../constants';
import type { FestivalSite, RejectReason, SeasonIndex, WorldState } from '../contracts';
import { inBounds } from '../map/layers';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { seasonAt } from '../state/seasons';
import { festivalView } from '../view/seasons';
import type { HandlerFor } from './util';

/** Festival sites: at least this many tiles a side, at most the larger. */
export const FESTIVAL_SITE_MIN = 6;
export const FESTIVAL_SITE_MAX = 24;
const MAX_MENU_QTY = 500;
const MUSIC = ['none', 'resident', 'bandstand'];

function checkSite(site: unknown): RejectReason | null {
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
    return w > FESTIVAL_SITE_MAX || d > FESTIVAL_SITE_MAX ? 'TOO_MANY' : null;
  }
  if ('pattern' in s) {
    if (!content.patternById.has(s.pattern) || !isInt(s.anchor)) return 'INVALID';
    return null;
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
    const bad = checkSite(cmd.site) ?? checkMenu(cmd.menu);
    if (bad) return bad;
    if (cmd.twist !== undefined && cmd.twist !== '') {
      const t = typeof cmd.twist === 'string' ? content.twistById.get(cmd.twist) : undefined;
      if (!t) return 'INVALID';
      if (t.seasons && !t.seasons.includes(seasonNow(state).season)) return 'NOT_ALLOWED';
    }
    if (cmd.music !== undefined && !MUSIC.includes(cmd.music)) return 'INVALID';
    return state.festival.live ? 'NOT_ALLOWED' : null;
  },
  apply(state, seat, cmd, ctx) {
    const { season, year } = seasonNow(state);
    const old = state.festival.plan;
    const menu = cmd.menu.map(([g, q]) => [content.goodIndex.get(g)!, q] as [number, number]);
    // What is already put by for goods still on the menu stays put by (C5B reserves the rest).
    const reserved = (old?.reserved ?? []).filter(([g]) => menu.some(([m]) => m === g));
    state.festival.plan = {
      festival: content.seasons[season]?.festival ?? '',
      season,
      year,
      site: cmd.site === null ? null : 'rect' in cmd.site ? { rect: [...cmd.site.rect] } : { ...cmd.site },
      menu,
      reserved,
      twist: cmd.twist ?? '',
      music: cmd.music ?? 'none',
      musician: old?.musician ?? 0,
      by: seat,
      tick: state.tick,
    };
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
    d.festival = { kept: true };
    state.festival.pieces = state.festival.pieces.filter((id) => id !== cmd.decor);
    ctx.events.push({ e: 'festival.updated', f: festivalView(state) });
  },
};

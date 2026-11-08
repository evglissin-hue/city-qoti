// The Watch (C5.0 baseline; C5D owns it). docs/spec/14-challenge.md, The Watch and Raid resolution.
// The Ledger sets the target size, the budget and up to three guard points; during a raid either
// seat may ring the bell and light every lantern (P35: those are the only raid controls).
import { MAP_SIZE, PENNIES_PER_COIN, WATCH_POSTURE_MAX } from '../constants';
import { inBounds } from '../map/layers';
import { isInt, isTile } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { rankAtLeast } from '../state/village';
import { raidView, watchView } from '../view/seasons';
import type { HandlerFor } from './util';

/** Most Watch members a valley may ask for, and the most coins a day it may spend on them. */
export const WATCH_MAX = 40;
export const WATCH_BUDGET_MAX = 50;

const watchAllowed = (state: Parameters<typeof rankAtLeast>[0]) =>
  isStandard(state) && rankAtLeast(state, 'village');

export const setTarget: HandlerFor<'watch.setTarget'> = {
  type: 'watch.setTarget',
  validate(state, _seat, cmd) {
    if (!watchAllowed(state)) return 'NOT_ALLOWED';
    return isInt(cmd.size) && cmd.size >= 0 && cmd.size <= WATCH_MAX ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.watch.target = cmd.size;
    ctx.events.push({ e: 'watch.updated', w: watchView(state) });
  },
};

export const setBudget: HandlerFor<'watch.setBudget'> = {
  type: 'watch.setBudget',
  validate(state, _seat, cmd) {
    if (!watchAllowed(state)) return 'NOT_ALLOWED';
    return isInt(cmd.coins) && cmd.coins >= 0 && cmd.coins <= WATCH_BUDGET_MAX ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.watch.budget = cmd.coins * PENNIES_PER_COIN;
    ctx.events.push({ e: 'watch.updated', w: watchView(state) });
  },
};

export const setPosture: HandlerFor<'watch.setPosture'> = {
  type: 'watch.setPosture',
  validate(state, _seat, cmd) {
    if (!watchAllowed(state)) return 'NOT_ALLOWED';
    if (!Array.isArray(cmd.guards)) return 'INVALID';
    if (cmd.guards.length > WATCH_POSTURE_MAX) return 'TOO_MANY';
    for (const t of cmd.guards) {
      if (!isTile(t)) return 'INVALID';
      if (!inBounds(t[0], t[1], MAP_SIZE)) return 'OUT_OF_BOUNDS';
    }
    return null;
  },
  apply(state, _seat, cmd, ctx) {
    state.watch.posture = cmd.guards.map(([x, z]) => z * MAP_SIZE + x);
    ctx.events.push({ e: 'watch.updated', w: watchView(state) });
  },
};

export const ringBell: HandlerFor<'watch.ringBell'> = {
  type: 'watch.ringBell',
  validate: (state) => (state.raid ? (state.raid.bell ? 'INVALID' : null) : 'NO_RAID'),
  apply(state, _seat, _cmd, ctx) {
    state.raid!.bell = true;
    ctx.events.push({ e: 'raid.updated', r: raidView(state)! });
  },
};

export const lightLanterns: HandlerFor<'watch.lightLanterns'> = {
  type: 'watch.lightLanterns',
  validate: (state) => (state.raid ? (state.raid.lanterns ? 'INVALID' : null) : 'NO_RAID'),
  apply(state, _seat, _cmd, ctx) {
    state.raid!.lanterns = true;
    ctx.events.push({ e: 'raid.updated', r: raidView(state)! });
  },
};

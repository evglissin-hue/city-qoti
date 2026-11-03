// Captured bandits (C5.0 baseline; C5D). docs/spec/14-challenge.md, Captured bandits: either seat
// offers them a home (a household of one in a vacant home, any species, with the Reformed trait
// and bond 0: Reformed folk work 10% harder, and the Chronicle tells their small story) or sends
// them off (renown +1). Bandits are a gang, not a species. A home needs a vacant one.
import { content } from '@qoti/content';
import { isInt } from '../rules/geometry';
import { addRenown } from '../systems/renown/api';
import { chronicle } from '../systems/chronicle/api';
import { moveResident } from '../systems/movement/api';
import { createHousehold } from '../systems/residents/generate';
import { gateTile } from '../systems/residents/lifecycle';
import { doorOf, vacantHomes } from '../systems/residents/places';
import { announceHousehold, announceResident, announceTown } from '../systems/residents/records';
import { raidView, threatView } from '../view/seasons';
import type { HandlerFor } from './util';

/** Renown for sending a captured bandit off. */
export const SEND_OFF_RENOWN = 1;

export const decide: HandlerFor<'bandit.decide'> = {
  type: 'bandit.decide',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || (cmd.choice !== 'home' && cmd.choice !== 'send')) return 'INVALID';
    if (!state.threats.captives.includes(cmd.id)) return 'NOT_FOUND';
    if (cmd.choice === 'home' && vacantHomes(state).length === 0) return 'NOT_ALLOWED';
    return null;
  },
  apply(state, _seat, cmd, ctx) {
    state.threats.captives = state.threats.captives.filter((id) => id !== cmd.id);
    if (cmd.choice === 'send') {
      addRenown(state, ctx, SEND_OFF_RENOWN, 'send-off');
      chronicle(state, ctx, 'bandit-sent', { text: [], variant: cmd.id });
    } else {
      const rng = ctx.rng('threats');
      const home = vacantHomes(state)[0]!.building;
      const species = content.species[rng.int(content.species.length)]!.id;
      const { household, members } = createHousehold(state, rng, {
        species,
        stages: ['adult'],
        homeId: home.id,
        tile: gateTile(state),
        inside: 0,
        activity: { kind: 'arrive' },
      });
      const r = members[0]!;
      r.traits = [r.traits[0]!, 'reformed'];
      r.reformed = true;
      r.bond = 0;
      moveResident(state, r, doorOf(state, home.id), 'arrive');
      announceResident(state, ctx, r);
      announceHousehold(state, ctx, household.id, true);
      announceTown(state, ctx);
      chronicle(state, ctx, 'bandit-home', {
        text: [['name', `${r.given} ${r.family}`]],
        refs: [r.id, home.id],
        variant: cmd.id,
      });
    }
    ctx.events.push({ e: 'threat.updated', t: threatView(state) });
    // C5F: during a raid the live view lists the captures too, so both seats' cards close.
    if (state.raid) ctx.events.push({ e: 'raid.updated', r: raidView(state)! });
  },
};

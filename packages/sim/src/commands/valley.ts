import { MAX_VALLEY_NAME_CHARS } from '../constants';
import type { ValleySettings } from '../contracts';
import { isStandard } from '../state/hamlet';
import { chronicle } from '../systems/chronicle/api';
import { type HandlerFor, trimmed } from './util';

/** I3 (C5.0): how the threat dial reads in the partner's notice and the Chronicle. */
const THREAT_WORDS: [threat: ValleySettings['threat'], word: string][] = [
  ['peaceful', 'Peaceful'],
  ['standard', 'Standard'],
  ['fierce', 'Fierce'],
];

const MODES = ['sandbox', 'standard'];
const ECONOMIES = ['gentle', 'standard', 'thoughtful'];
const THREATS = ['peaceful', 'standard', 'fierce'];

export const setSettings: HandlerFor<'valley.setSettings'> = {
  type: 'valley.setSettings',
  validate(state, _seat, cmd) {
    const s = cmd.settings as Partial<ValleySettings> | null;
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return 'INVALID';
    // A valley keeps the mode it was created with: sandbox and standard state differ in shape.
    if (s.mode !== undefined && s.mode !== state.settings.mode) return 'NOT_ALLOWED';
    let fields = 0;
    if (s.mode !== undefined && (fields++, !MODES.includes(s.mode))) return 'INVALID';
    if (s.economy !== undefined && (fields++, !ECONOMIES.includes(s.economy))) return 'INVALID';
    if (s.threat !== undefined && (fields++, !THREATS.includes(s.threat))) return 'INVALID';
    if (s.togetherOnly !== undefined && (fields++, typeof s.togetherOnly !== 'boolean')) return 'INVALID';
    if (s.townName !== undefined && (fields++, trimmed(s.townName, MAX_VALLEY_NAME_CHARS) === null))
      return 'INVALID';
    if (s.valleyName !== undefined && (fields++, trimmed(s.valleyName, MAX_VALLEY_NAME_CHARS) === null)) {
      return 'INVALID';
    }
    if (s.guide !== undefined && (fields++, typeof s.guide !== 'boolean')) return 'INVALID';
    return fields > 0 ? null : 'INVALID';
  },
  apply(state, seat, cmd, ctx) {
    // Field by field: the sim never iterates object keys.
    const s = cmd.settings;
    const out = state.settings;
    if (s.mode !== undefined) out.mode = s.mode;
    if (s.economy !== undefined) out.economy = s.economy;
    if (s.threat !== undefined && s.threat !== out.threat) {
      out.threat = s.threat;
      // I3 (C5.0): the partner hears of it, and the Chronicle notes it (14-challenge.md, dials).
      const word = THREAT_WORDS.find(([t]) => t === s.threat)?.[1] ?? s.threat;
      const who = state.seats.find((x) => x.seat === seat)?.name || 'Someone';
      for (const other of state.time.connected) {
        if (other === seat) continue;
        ctx.events.push({
          e: 'notify',
          kind: 'settings',
          text: `${who} set the threat dial to ${word}.`,
          seat: other,
        });
      }
      if (isStandard(state)) {
        chronicle(state, ctx, 'threat-dial', {
          text: [
            ['who', who],
            ['dial', word],
          ],
          seats: [seat],
        });
      }
    }
    if (s.togetherOnly !== undefined) out.togetherOnly = s.togetherOnly;
    if (s.townName !== undefined) out.townName = trimmed(s.townName, MAX_VALLEY_NAME_CHARS)!;
    if (s.valleyName !== undefined) out.valleyName = trimmed(s.valleyName, MAX_VALLEY_NAME_CHARS)!;
    if (s.guide !== undefined) out.guide = s.guide;
    ctx.events.push({ e: 'settings.updated', settings: { ...out } });
  },
};

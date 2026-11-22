// V4.0: a test scene for V4A, the handshake with R3F (docs/build/v4-wave-notes.md, Handshakes).
// R3F's lamplighter lights the lanterns one by one between 17:30 and 18:00: each is a light map
// change, batched per tick, and every static change goes through `ctx.invalidate()`. With the
// refinement on, each one redraws the still frame at rest, and the picture must not pop or restart
// visibly as each lamp lights. This plays that at rest without R3F: lamps along a line about a
// point, one more lit every `everyMs`, each a light map write plus a shadowless static change (what
// the lights layer does when a lantern lights). Debug only: `__qoti.lampSequence()`, and
// `v4-shots.mjs`'s `lamps` scene. The scene writes to the light map only, never the sim.
import type { LightDisc, LightMapWriter } from './lightMap';

/** The light map source the scene writes (its own, so it never touches a layer's discs). */
export const LAMP_SEQUENCE_SOURCE = 'v4-lamp-sequence';
/** A lantern's pool, as the lights layer draws a `lamp-post` (`layers/lights.ts`, LAMP_SHAPE). */
const POOL: Pick<LightDisc, 'radius' | 'intensity' | 'color'> = {
  radius: 2.4,
  intensity: 1.25,
  color: 0xffc27a,
};

export interface LampSequenceOptions {
  /** The point the row of lamps runs through, in tiles (the view's focus by default). */
  center: [number, number];
  /** How many lamps (12 by default), lit in order from one end. */
  count?: number;
  /** Ms between one lamp and the next (400 by default: half an hour of lamplighting in five seconds). */
  everyMs?: number;
  /** Tiles between lamps (3 by default: a grown street's lamp posts). */
  spacing?: number;
  /** The row's direction in radians on the ground (0 runs along x). */
  angle?: number;
}

/** The lamps of a sequence, in the order they light. Pure. */
export function lampSequenceDiscs(opts: LampSequenceOptions): LightDisc[] {
  const count = Math.max(1, Math.floor(opts.count ?? 12));
  const spacing = opts.spacing ?? 3;
  const angle = opts.angle ?? 0;
  const [cx, cz] = opts.center;
  const dx = Math.cos(angle) * spacing;
  const dz = Math.sin(angle) * spacing;
  const first = -(count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: cx + (first + i) * dx,
    z: cz + (first + i) * dz,
    ...POOL,
  }));
}

/** What the scene needs from the renderer: the light map's writer and the static-change door. */
export interface LampSequenceTarget {
  env: { lightWriter: LightMapWriter };
  invalidateStatic(source?: string, shadowless?: boolean): void;
}

export interface LampSequence {
  /** Lamps lit so far. */
  lit(): number;
  /** Stops lighting and puts every lamp of the scene out again. */
  stop(): void;
}

/** Lights the lamps one by one from now (none lit at the start), then stays lit until `stop`. */
export function startLampSequence(target: LampSequenceTarget, opts: LampSequenceOptions): LampSequence {
  const discs = lampSequenceDiscs(opts);
  let lit = 0;
  const step = (): void => {
    if (lit >= discs.length) {
      clearInterval(timer);
      return;
    }
    lit++;
    if (target.env.lightWriter.set(LAMP_SEQUENCE_SOURCE, discs.slice(0, lit)))
      target.invalidateStatic(LAMP_SEQUENCE_SOURCE, true);
  };
  const timer = setInterval(step, Math.max(16, opts.everyMs ?? 400));
  return {
    lit: () => lit,
    stop: () => {
      clearInterval(timer);
      if (target.env.lightWriter.clear(LAMP_SEQUENCE_SOURCE))
        target.invalidateStatic(LAMP_SEQUENCE_SOURCE, true);
    },
  };
}

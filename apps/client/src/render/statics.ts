// V2A: what the renderer counts about static changes (renderer.ts). Every static change drops the
// still frame (`revision`); only one that can move a caster re-renders the cached sun shadows
// (`casters`). A layer that only changes light (the lights layer, V2B's meadow carpet) says so with
// `RenderLayer.shadowless`, so the lamplighter's round and a window's quarter-hour step redraw the
// still frame without drawing the shadow map again (docs/build/v2-wave-notes.md, Cache invalidation).

/** The renderer's static-change counters. */
export class StaticRevisions {
  /** Bumped by every static change: part of the still frame's key. */
  revision = 0;
  /** Bumped by static changes that can move a sun shadow caster: the shadow map's trigger. */
  casters = 0;
  /**
   * When a caster change last came from an `invalidate` (ms; `-Infinity` before any). While the
   * camera moves, the shadow map re-renders once such a change has settled.
   */
  contentAt = -Infinity;
  /** What bumped `revision`, by source (a layer id, or `renderer`). */
  readonly bySource = new Map<string, number>();

  /**
   * Notes one static change from `source`. `shadowless` changes leave the shadow trigger alone;
   * `now` (ms) is given for a change that came through `invalidate` (a layer's `frame()` returning
   * true passes none, as before V2A).
   */
  note(source: string, shadowless = false, now?: number): void {
    this.revision++;
    this.bySource.set(source, (this.bySource.get(source) ?? 0) + 1);
    if (shadowless) return;
    this.casters++;
    if (now !== undefined) this.contentAt = now;
  }
}

/**
 * During camera moves, a caster change from `invalidate` re-renders the shadow map once it has
 * settled for this long (ms), so chunk rebuilds a frame or two later are in it.
 */
export const CONTENT_SETTLE_MS = 300;

/**
 * Whether static content asks the shadow map to render (renderer.ts `planShadows`): at rest, any
 * caster change since it last rendered (`renderedAt` is `casters` then); while moving, a caster
 * change from `invalidate` that has settled. Shadowless changes never count.
 */
export function shadowContentDue(
  s: StaticRevisions,
  renderedAt: number,
  shadowAt: number,
  now: number,
  resting: boolean,
): boolean {
  if (resting) return s.casters !== renderedAt;
  return s.contentAt > shadowAt && now - s.contentAt > CONTENT_SETTLE_MS;
}

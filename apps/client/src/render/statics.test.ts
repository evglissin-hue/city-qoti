import { DirectionalLight, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ShadowCache, type ShadowView } from './shadows';
import { CONTENT_SETTLE_MS, shadowContentDue, StaticRevisions } from './statics';

const view: ShadowView = {
  target: new Vector3(96, 0, 96),
  distance: 60,
  sunDir: new Vector3(0.4, 0.8, 0.45).normalize(),
  size: 2048,
};

/** The renderer's frame, as far as the still frame and the shadow map go (renderer.ts drawLean). */
class Frames {
  readonly statics = new StaticRevisions();
  readonly shadows = new ShadowCache();
  private readonly light = new DirectionalLight();
  private stillKey = '';
  private shadowStatic = -1;
  private shadowAt = -Infinity;
  stills = 0;

  frame(now: number, resting: boolean): void {
    const reason = this.shadows.due(
      view,
      shadowContentDue(this.statics, this.shadowStatic, this.shadowAt, now, resting),
    );
    if (reason) {
      this.shadows.apply(this.light, view, reason);
      this.shadowStatic = this.statics.casters;
      this.shadowAt = now;
    }
    const key = `${this.statics.revision}|${this.shadows.renders}`;
    if (resting && key !== this.stillKey) {
      this.stillKey = key;
      this.stills++;
    }
  }
}

describe('a static change without a shadow render (V2A)', () => {
  it('redraws the still frame and renders no shadow for a shadowless change', () => {
    const f = new Frames();
    f.frame(0, true);
    expect(f.shadows.renders).toBe(1);
    expect(f.stills).toBe(1);
    // The lights layer reports a change (a window's quarter-hour step) at rest.
    f.statics.note('lights', true, 10);
    f.frame(16, true);
    expect(f.stills).toBe(2);
    expect(f.shadows.renders).toBe(1);
    // And while the camera moves, a settled shadowless change never asks for one either.
    f.statics.note('lights', true, 20);
    f.frame(20 + CONTENT_SETTLE_MS + 1, false);
    expect(f.shadows.renders).toBe(1);
    expect(f.statics.bySource.get('lights')).toBe(2);
  });

  it('still renders the shadow map for a change that can move a caster', () => {
    const f = new Frames();
    f.frame(0, true);
    f.statics.note('buildings', false, 10);
    f.frame(16, true);
    expect(f.shadows.renders).toBe(2);
    expect(f.stills).toBe(2);
    // A layer's frame() reporting a change (no time given) counts at rest, as before V2A.
    f.statics.note('decor');
    f.frame(32, true);
    expect(f.shadows.renders).toBe(3);
  });

  it('waits for a caster change to settle while the camera moves', () => {
    const f = new Frames();
    f.frame(0, false);
    f.statics.note('buildings', false, 100);
    f.frame(150, false);
    expect(f.shadows.renders).toBe(1);
    f.frame(100 + CONTENT_SETTLE_MS + 1, false);
    expect(f.shadows.renders).toBe(2);
  });
});

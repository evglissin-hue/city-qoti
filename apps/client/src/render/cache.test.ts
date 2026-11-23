import { PerspectiveCamera, Scene, type Material, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { describe, expect, it } from 'vitest';
import { REST_MS, StillCache, type RefineContext } from './cache';
import { MOVING_LAYER } from './layerTags';
import { colorTarget, deviceSize, fullScreenTriangle, type LeanFrame } from './post';
import type { RefineJitter } from './refine';

describe('the still-frame cache (V1D)', () => {
  it('rests only once the camera has been still for REST_MS, and only when the preset keeps one', () => {
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    c.noteMove(1000);
    expect(c.resting(1000 + REST_MS)).toBe(false);
    c.enabled = true;
    expect(c.resting(1000 + REST_MS - 1)).toBe(false);
    expect(c.resting(1000 + REST_MS)).toBe(true);
    c.noteMove(1300);
    expect(c.resting(1400)).toBe(false);
  });

  it('holds nothing until a still frame is kept', () => {
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    expect(c.valid('')).toBe(false);
    expect(c.valid('1|medium|3|4|5|6')).toBe(false);
  });

  it('restores from a full-screen mesh on the moving layer, drawn first and hidden by default', () => {
    const scene = new Scene();
    const c = new StillCache(scene, new PerspectiveCamera());
    expect(scene.children).toContain(c.restore);
    expect(c.restore.visible).toBe(false);
    expect(c.restore.layers.mask).toBe(1 << MOVING_LAYER);
    expect(c.restore.renderOrder).toBeLessThan(-1000);
    expect(c.restore.frustumCulled).toBe(false);
    c.dispose();
    expect(scene.children).not.toContain(c.restore);
  });
});

describe('the lean frame graph (V1D)', () => {
  it('covers the screen with one triangle whose uv runs 0 to 1 across it', () => {
    const g = fullScreenTriangle();
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    expect(p.count).toBe(3);
    // Clip space -1..1 maps to uv 0..1 along both axes (uv = (pos + 1) / 2).
    for (let i = 0; i < 3; i++) {
      expect(uv.getX(i)).toBeCloseTo((p.getX(i) + 1) / 2);
      expect(uv.getY(i)).toBeCloseTo((p.getY(i) + 1) / 2);
    }
  });

  it('sizes targets in device pixels, never below 2', () => {
    expect(deviceSize(1440, 900, 1)).toEqual([1440, 900]);
    expect(deviceSize(1440, 900, 0.72)).toEqual([1037, 648]);
    expect(deviceSize(1, 1, 0.5)).toEqual([2, 2]);
  });
});

/**
 * A frame graph that records its passes and never touches a GPU, with a still target of 8 x 4
 * (three's targets need no context until drawn).
 */
function fakeFrame(): { frame: LeanFrame; passes: string[]; still: WebGLRenderTarget } {
  const passes: string[] = [];
  const still = colorTarget(8, 4, 'half', { depth: true, depthTexture: true });
  const frame = {
    format: 'half',
    pass: (m: Material) => passes.push(m.name),
    target: () => still,
  } as unknown as LeanFrame;
  return { frame, passes, still };
}

describe('V4A: the developing still frame', () => {
  const renderer = {} as WebGLRenderer;

  function developed(goal: number) {
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    c.enabled = true;
    const f = fakeFrame();
    const jitters: number[] = [];
    const ctx: RefineContext = {
      renderer,
      frame: f.frame,
      draw: (j: RefineJitter) => jitters.push(j.index),
    };
    c.keep(renderer, f.frame, f.still, 'k1', 'first');
    c.goal = goal;
    return { c, f, ctx, jitters };
  }

  it('folds one jittered sample a frame into the kept picture until the goal, then settles', () => {
    const { c, f, ctx, jitters } = developed(3);
    const plain = c.picture;
    const key = c.pictureKey('k1');
    expect(c.developing('k1')).toBe(true);
    expect(c.refine(1, ctx)).toBe(1);
    expect(jitters).toEqual([1]);
    // The developing picture is shown, not the plain still; its stamp (the bloom's) has not moved.
    expect(c.picture).not.toBe(plain);
    expect(c.pictureKey('k1')).toBe(key);
    expect(c.refine(1, ctx)).toBe(1);
    expect(c.refine(1, ctx)).toBe(1);
    expect(jitters).toEqual([1, 2, 3]);
    expect(c.samples).toBe(3);
    expect(c.developing('k1')).toBe(false);
    expect(c.refine(1, ctx)).toBe(0);
    // Settled: resolved once into the frame's own format, and the bloom is built again from it.
    expect(f.passes.filter((p) => p === 'StillShow')).toHaveLength(1);
    expect(c.pictureKey('k1')).not.toBe(key);
    c.dispose();
  });

  it('folds a lamp lighting into what has developed, without resetting the samples to 0', () => {
    const { c, f, ctx, jitters } = developed(4);
    c.refine(1, ctx);
    c.refine(1, ctx);
    expect(c.samples).toBe(2);
    c.keep(renderer, f.frame, f.still, 'k2', 'lamps');
    expect(c.lastChange).toBe('lamps');
    expect(c.samples).toBe(2);
    expect(f.passes).toContain('StillRebase');
    // The development carries on from where it was, with the jitter sequence running on.
    c.goal = c.samples + 4;
    c.refine(1, ctx);
    expect(jitters).toEqual([1, 2, 3]);
    expect(c.samples).toBe(3);
    c.dispose();
  });

  it('folds a light step, a content change and a shadow render in too', () => {
    for (const change of ['light', 'content', 'shadows'] as const) {
      const { c, f, ctx } = developed(4);
      c.refine(1, ctx);
      c.keep(renderer, f.frame, f.still, 'k2', change);
      expect(c.samples).toBe(1);
      c.dispose();
    }
  });

  it('starts over for the first still frame, a new view or new targets', () => {
    for (const change of ['first', 'view', 'targets'] as const) {
      const { c, f, ctx } = developed(4);
      const plain = c.picture;
      c.refine(1, ctx);
      expect(c.picture).not.toBe(plain);
      const passes = f.passes.length;
      c.keep(renderer, f.frame, f.still, 'k2', change);
      expect(c.samples).toBe(0);
      expect(f.passes.slice(passes)).not.toContain('StillRebase');
      // The plain still frame is on show again (the camera moved, so this is a new picture).
      expect(c.picture).toBe(plain);
      c.dispose();
    }
  });

  it('treats a change before any sample as a fresh still frame (nothing developed to fold into)', () => {
    const { c, f } = developed(4);
    c.keep(renderer, f.frame, f.still, 'k2', 'lamps');
    expect(c.samples).toBe(0);
    expect(f.passes).not.toContain('StillRebase');
    c.dispose();
  });

  it('settles where it is when the governor gives a fold-in nothing more to develop', () => {
    const { c, f, ctx } = developed(2);
    c.refine(1, ctx);
    c.refine(1, ctx);
    const shows = f.passes.filter((p) => p === 'StillShow').length;
    c.keep(renderer, f.frame, f.still, 'k2', 'lamps');
    c.goal = c.samples;
    c.settle(f.frame);
    expect(f.passes.filter((p) => p === 'StillShow').length).toBe(shows + 1);
    c.dispose();
  });
});

describe('V4A: sky samples', () => {
  const renderer = {} as WebGLRenderer;

  it('draws one sample in four as what the sky sees, into sums of their own, and starts them over on a restart', () => {
    const c = new StillCache(new Scene(), new PerspectiveCamera());
    c.enabled = true;
    const f = fakeFrame();
    const drawn: number[] = [];
    const skies: number[] = [];
    const ctx: RefineContext = {
      renderer,
      frame: f.frame,
      draw: (j: RefineJitter) => drawn.push(j.index),
      drawSky: (j: RefineJitter) => skies.push(j.index),
    };
    c.keep(renderer, f.frame, f.still, 'k1', 'first');
    c.goal = 8;
    for (let i = 0; i < 8; i++) c.refine(1, ctx);
    expect(skies).toEqual([4, 8]);
    expect(drawn).toEqual([1, 2, 3, 5, 6, 7]);
    // The first sky sample writes the sums, the next adds to them; settling bakes the shade in.
    expect(f.passes.filter((p) => p === 'StillSkyFirst')).toHaveLength(1);
    expect(f.passes.filter((p) => p === 'StillSkyAdd')).toHaveLength(1);
    expect(f.passes).toContain('StillShowSky');
    // A content change weighs the sums down (fresh sky samples count for more there).
    c.keep(renderer, f.frame, f.still, 'k2', 'content');
    expect(f.passes).toContain('StillSkyDecay');
    // A new view starts the sums over.
    c.keep(renderer, f.frame, f.still, 'k3', 'view');
    c.goal = 4;
    for (let i = 0; i < 4; i++) c.refine(1, ctx);
    expect(f.passes.filter((p) => p === 'StillSkyFirst')).toHaveLength(2);
    c.dispose();
  });
});

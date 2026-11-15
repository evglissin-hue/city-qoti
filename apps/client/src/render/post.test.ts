// V2X: the bloom at rest is built once from the still frame and reused by idle frames.
import { WebGLRenderTarget, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { LeanFrame, restBloomFresh } from './post';

/** Enough of a WebGLRenderer for LeanFrame's passes; counts the full-screen draws. */
function fakeRenderer(): { renderer: WebGLRenderer; draws: () => number } {
  let draws = 0;
  const r = {
    capabilities: { maxSamples: 4 },
    extensions: { has: () => false },
    autoClear: true,
    setRenderTarget() {},
    getRenderTarget() {
      return null;
    },
    render() {
      draws++;
    },
  };
  return { renderer: r as unknown as WebGLRenderer, draws: () => draws };
}

function nightFrame() {
  const fake = fakeRenderer();
  const lean = new LeanFrame(fake.renderer, 4);
  lean.configure({ width: 400, height: 300, movingRatio: 1, stillRatio: 2, msaa: 4, stillDepth: true });
  lean.setNight(1);
  lean.setViewDistance(0); // no tilt-shift blur, so only the bloom chain and the final pass draw
  return { lean, draws: fake.draws, picture: new WebGLRenderTarget(800, 600) };
}

describe('the bloom at rest (V2X)', () => {
  it('is built once for a still frame and reused by the idle frames after it', () => {
    const { lean, draws, picture } = nightFrame();
    const target = lean.target('still');
    lean.finish(target, { picture, key: 'a' });
    expect(lean.bloomBuilds).toBe(1);
    const first = draws();
    lean.finish(target, { picture, key: 'a' });
    lean.finish(target, { picture, key: 'a' });
    expect(lean.bloomBuilds).toBe(1);
    // An idle frame is the final pass alone: the bright pass and its blur rounds are skipped.
    expect((draws() - first) / 2).toBe(1);
  });

  it('is built again for a new still frame, a new threshold or new targets', () => {
    const { lean, picture } = nightFrame();
    const target = lean.target('still');
    lean.finish(target, { picture, key: 'a' });
    lean.finish(target, { picture, key: 'b' });
    expect(lean.bloomBuilds).toBe(2);
    lean.setNight(0.6);
    lean.finish(target, { picture, key: 'b' });
    expect(lean.bloomBuilds).toBe(3);
    lean.configure({ width: 500, height: 300, movingRatio: 1, stillRatio: 2, msaa: 4, stillDepth: true });
    lean.finish(lean.target('still'), { picture, key: 'b' });
    expect(lean.bloomBuilds).toBe(4);
  });

  it('is live on a moving frame or while something moving glows, and built again at rest after', () => {
    const { lean, picture } = nightFrame();
    const target = lean.target('still');
    lean.finish(target, { picture, key: 'a' });
    lean.finish(target);
    lean.finish(target);
    expect(lean.bloomBuilds).toBe(3);
    // The live builds wrote over the rest bloom, so the next idle frame builds it again.
    lean.finish(target, { picture, key: 'a' });
    expect(lean.bloomBuilds).toBe(4);
    lean.finish(target, { picture, key: 'a' });
    expect(lean.bloomBuilds).toBe(4);
  });

  it('builds nothing by day, when the bloom is off', () => {
    const { lean, picture } = nightFrame();
    lean.setNight(0);
    lean.finish(lean.target('still'), { picture, key: 'a' });
    lean.finish(lean.target('still'));
    expect(lean.bloomBuilds).toBe(0);
  });

  it('compares picture, threshold and targets', () => {
    const s = { key: 'k', threshold: 0.7, revision: 1 };
    expect(restBloomFresh(null, s)).toBe(false);
    expect(restBloomFresh(s, { ...s })).toBe(true);
    expect(restBloomFresh(s, { ...s, key: 'j' })).toBe(false);
    expect(restBloomFresh(s, { ...s, threshold: 0.71 })).toBe(false);
    expect(restBloomFresh(s, { ...s, revision: 2 })).toBe(false);
  });
});

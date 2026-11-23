// V4B: photo mode saves the developed picture (17-presentation.md, Camera; docs/build/v4-wave-notes.md,
// Photo mode at 64 samples). Save PNG lays the canvas out at one and a half times the still frame's
// resolution, which starts a fresh rest; the governor then develops it to PHOTO_SAMPLES (V4A), and
// the PNG is taken once the samples reach the goal, or after a timeout with what it has.

/** The longest Save PNG waits for the picture to develop before it saves what it has, ms. */
export const PHOTO_DEVELOP_TIMEOUT_MS = 4000;

/** What the wait reads from `RenderStats`. */
export interface DevelopStats {
  samples: number;
  sampleGoal: number;
  /** Still frames drawn so far: the wait counts only a still drawn after it began (the new size). */
  stillRenders: number;
}

/**
 * Waits frame by frame until a still frame drawn after the call has developed to its goal (true),
 * or until `timeoutMs` has passed (false: save what there is). `frame` resolves on the next frame.
 */
export async function untilDeveloped(
  stats: () => DevelopStats,
  frame: () => Promise<unknown>,
  now: () => number,
  timeoutMs = PHOTO_DEVELOP_TIMEOUT_MS,
): Promise<boolean> {
  const start = now();
  const first = stats().stillRenders;
  while (now() - start < timeoutMs) {
    await frame();
    const s = stats();
    if (s.stillRenders > first && s.sampleGoal > 0 && s.samples >= s.sampleGoal) return true;
  }
  return false;
}

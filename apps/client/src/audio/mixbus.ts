// The master chain and the music bus EQ (mix and master pass). Kept apart from the engine so a test
// can run a loud signal through the same chain in an OfflineAudioContext.
//
// master gain -> glue compressor -> makeup -> limiter -> trim -> soft clipper -> destination
//
// Chrome's DynamicsCompressor adds a hidden makeup gain of (1 / gain at full scale) ^ 0.6, so the
// makeup constants below pull that back to about unity for quiet input.

/** The soft clipper's linear region ends here, and its output never passes CEILING (-1 dBFS). */
export const CLIP_KNEE = 0.8;
export const CEILING = 0.89;
/** Compensation for the hidden makeup gain of the glue compressor and of the limiter. */
export const GLUE_MAKEUP = 0.6;
export const LIMIT_TRIM = 0.875;

/** The soft clipper's transfer curve: linear to CLIP_KNEE, then a smooth knee that settles at CEILING. */
export function clipperCurve(points = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const span = CEILING - CLIP_KNEE;
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= CLIP_KNEE ? a : CLIP_KNEE + span * Math.tanh((a - CLIP_KNEE) / span);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** Builds the master chain into `destination`; connect the buses to the returned input. */
export function buildMasterChain(ctx: BaseAudioContext, destination: AudioNode = ctx.destination): GainNode {
  const input = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 6;
  glue.ratio.value = 2;
  glue.attack.value = 0.025;
  glue.release.value = 0.25;
  const makeup = ctx.createGain();
  makeup.gain.value = GLUE_MAKEUP;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  const trim = ctx.createGain();
  trim.gain.value = LIMIT_TRIM;
  const clip = ctx.createWaveShaper();
  clip.curve = clipperCurve();
  clip.oversample = '4x';
  input.connect(glue).connect(makeup).connect(limiter).connect(trim).connect(clip).connect(destination);
  return input;
}

/** The music bus EQ: a steep low cut, a little less low-mid, a little more air. Returns both ends. */
export function buildMusicEq(ctx: BaseAudioContext): { input: AudioNode; output: AudioNode } {
  const hp1 = ctx.createBiquadFilter();
  hp1.type = 'highpass';
  hp1.frequency.value = 35;
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 35;
  const mud = ctx.createBiquadFilter();
  mud.type = 'peaking';
  mud.frequency.value = 300;
  mud.Q.value = 0.8;
  mud.gain.value = -2;
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 8000;
  air.gain.value = 2;
  hp1.connect(hp2).connect(mud).connect(air);
  return { input: hp1, output: air };
}

/** A highpass for the ambience bus. */
export function buildAmbienceHighpass(ctx: BaseAudioContext): BiquadFilterNode {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 40;
  return hp;
}

/**
 * The room reverb's shaping: a short pre-delay and a highpass before the convolver, a lowpass after.
 * Connect sends to `input`; `output` feeds the master.
 */
export function buildReverb(
  ctx: BaseAudioContext,
  impulse: AudioBuffer,
): { input: AudioNode; output: AudioNode } {
  const pre = ctx.createDelay(0.05);
  pre.delayTime.value = 0.018;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 200;
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 8000;
  pre.connect(hp).connect(conv).connect(lp);
  return { input: pre, output: lp };
}

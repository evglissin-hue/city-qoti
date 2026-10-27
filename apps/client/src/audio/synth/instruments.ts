// The band (C5G), synthesized with care for how real instruments make their sound:
// - a nylon guitar and an upright bass: tuned plucked strings (Karplus-Strong with a fractional
//   delay, so every note is in tune) with the pluck point, a soft fingertip and a wooden body;
// - a felt piano: up to 24 stretched partials per note from a hammer's spectrum, two strings a
//   hair apart for the slow beating, and the double decay (a quick fall, then a long ring);
// - an electric piano: two-operator FM (the warm tone and the bell of the tine);
// - mallets (marimba, vibraphone, celesta, glockenspiel, kalimba): struck bars, modal partials;
// - a flute with breath, and soft strings for pads; brushes, a ride and a shaker.
// Each note renders once (per loudness layer) into a Float32Array; the engine caches it.
import {
  Biquad,
  OnePole,
  Partial,
  RENDER_RATE,
  TunedString,
  attack,
  dcBlock,
  fadeEdges,
  midiToHz,
  noise,
  normalize,
  seeded,
  t60Per,
} from './dsp';

export type Instrument =
  | 'bass'
  | 'brush'
  | 'celesta'
  | 'epiano'
  | 'flute'
  | 'glock'
  | 'guitar'
  | 'kalimba'
  | 'marimba'
  | 'piano'
  | 'ride'
  | 'shaker'
  | 'strings'
  | 'vibes';

export const INSTRUMENTS: readonly Instrument[] = [
  'bass',
  'brush',
  'celesta',
  'epiano',
  'flute',
  'glock',
  'guitar',
  'kalimba',
  'marimba',
  'piano',
  'ride',
  'shaker',
  'strings',
  'vibes',
];

/** Instruments with no pitch (the midi number picks a variation). */
export const UNPITCHED: ReadonlySet<Instrument> = new Set(['brush', 'ride', 'shaker']);

/** How a note ends: sustained instruments are held and released; struck ones ring out. */
export const SUSTAINED: ReadonlySet<Instrument> = new Set(['flute', 'strings']);

/** Seconds a note's buffer lasts at this pitch (high notes ring shorter). */
export function noteSeconds(inst: Instrument, midi: number): number {
  const hi = Math.max(0, Math.min(1, (midi - 48) / 40));
  switch (inst) {
    case 'piano':
      return 4.2 - 2.2 * hi;
    case 'guitar':
      return 3 - 1.2 * hi;
    case 'bass':
      return 2.2;
    case 'epiano':
      return 3.2 - 1.2 * hi;
    case 'vibes':
      return 3.5;
    case 'marimba':
      return 1.4 - 0.6 * hi;
    case 'celesta':
    case 'glock':
      return 2.4;
    case 'kalimba':
      return 2;
    case 'flute':
      return 3.2;
    case 'strings':
      return 5;
    case 'brush':
      return 0.5;
    case 'ride':
      return 1.6;
    case 'shaker':
      return 0.18;
  }
}

const len = (s: number): number => Math.floor(s * RENDER_RATE);

// --- Plucked strings ------------------------------------------------------------------------------

/** A finger's pluck: noise, softened by the fingertip, with the pluck point's comb notch. */
function pluckBurst(period: number, soft: number, position: number, seed: number): Float32Array {
  const rand = seeded(seed);
  const out = new Float32Array(period);
  const lp = new OnePole(800 + (1 - soft) * 6000);
  for (let i = 0; i < period; i++) out[i] = lp.run(noise(rand));
  // Plucking a fraction `position` along the string cancels the harmonics with a node there.
  const d = Math.max(1, Math.round(period * position));
  const combed = new Float32Array(period);
  for (let i = 0; i < period; i++) combed[i] = out[i]! - (i >= d ? out[i - d]! : 0) * 0.9;
  let mean = 0;
  for (const v of combed) mean += v / period;
  for (let i = 0; i < period; i++) combed[i] = combed[i]! - mean;
  return combed;
}

function guitar(midi: number, layer: number): Float32Array {
  const f = midiToHz(midi);
  const n = len(noteSeconds('guitar', midi));
  const out = new Float32Array(n);
  const t60 = 3.4 * Math.pow(220 / f, 0.35);
  // Two strings a hair apart would be a twelve-string; one string, slightly detuned body modes.
  const s = new TunedString(f, t60, 0.55 + layer * 0.2);
  s.excite(pluckBurst(s.period + 2, layer ? 0.45 : 0.7, 0.18, midi * 31 + layer));
  // The wooden body: air resonance near 100 Hz and top plate modes around 200 and 400.
  const air = new Biquad('peak', 105, 4, 5);
  const top = new Biquad('peak', 215, 3, 3);
  const plate = new Biquad('peak', 430, 2.5, 2);
  const nylon = new Biquad('lowpass', 4200 + layer * 1800, 0.6);
  for (let i = 0; i < n; i++) out[i] = nylon.run(plate.run(top.run(air.run(s.run()))));
  return fadeEdges(dcBlock(normalize(out, 0.8)), 0.001, 0.08);
}

function bass(midi: number, layer: number): Float32Array {
  const f = midiToHz(midi);
  const n = len(noteSeconds('bass', midi));
  const out = new Float32Array(n);
  const s = new TunedString(f, 1.8 * Math.pow(55 / f, 0.25), 0.25 + layer * 0.15);
  s.excite(pluckBurst(s.period + 2, 0.85, 0.3, midi * 17 + layer));
  // The finger's thump against the fingerboard, and the big body's warmth.
  const thump = new Partial(f, 0.35, t60Per(0.12));
  const body = new Biquad('peak', 90, 2, 4);
  const lp = new Biquad('lowpass', 1100 + layer * 500, 0.7);
  for (let i = 0; i < n; i++) out[i] = lp.run(body.run(s.run() + thump.run() * attack(i, 0.004)));
  return fadeEdges(dcBlock(normalize(out, 0.85)), 0.002, 0.1);
}

// --- Piano ----------------------------------------------------------------------------------------

function piano(midi: number, layer: number): Float32Array {
  const f = midiToHz(midi);
  const n = len(noteSeconds('piano', midi));
  const out = new Float32Array(n);
  const rand = seeded(midi * 13 + layer);
  // Stiffness stretches the partials, more in the treble.
  const B = Math.min(0.004, 0.00012 * Math.exp(0.055 * (midi - 33)));
  // The felt hammer is a lowpass on the string's spectrum; a harder blow opens it.
  const hammerHz = (layer ? 4200 : 2600) * Math.pow(f / 262, 0.35);
  const ceiling = layer ? 12000 : 9000;
  const parts: Partial[] = [];
  const detune = 0.0006 + rand() * 0.0005;
  // Tuned so the partials that set the pitch we hear (more of them on low notes) sit on the note.
  const kRef2 = Math.max(10, Math.min(80, 5000 / f));
  const tuning = 1 / Math.sqrt(1 + kRef2 * B);
  for (let k = 1; k <= 18; k++) {
    const fk = f * k * Math.sqrt(1 + B * k * k) * tuning;
    if (fk > Math.min(ceiling, RENDER_RATE * 0.45)) break;
    // The hammer strikes about an eighth of the way along: the 8th, 16th... partials go quiet.
    const strike = Math.abs(Math.sin((Math.PI * k) / 8.3));
    const amp = (strike * 0.85 + 0.15) / Math.pow(k, 0.6) / (1 + (fk / hammerHz) ** 2);
    // Two decays: a quick prompt sound, then the long aftersound, both shorter up high.
    const reg = Math.pow(220 / f, 0.45);
    const long = (7 * reg) / (1 + 0.18 * (k - 1));
    const quick = long / 5;
    const phase = rand() * 6.28;
    parts.push(new Partial(fk, amp * 0.55, t60Per(quick), phase));
    parts.push(new Partial(fk * (1 + detune), amp * 0.45, t60Per(long), phase + 1));
    // The third string's slow beating matters only where it can be heard, in the low partials.
    if (k <= 5) parts.push(new Partial(fk * (1 - detune * 0.7), amp * 0.15, t60Per(long * 0.9), phase + 2));
  }
  const hammer = new Biquad('bandpass', Math.min(3500, f * 3), 0.7);
  const board = new Biquad('peak', 180, 1.5, 2);
  const tone = new Biquad('lowpass', Math.min(13000, f * (layer ? 16 : 10) + 2500), 0.6);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    const knock = i < 220 ? hammer.run(noise(rand)) * (1 - i / 220) * (layer ? 0.2 : 0.08) : 0;
    out[i] = tone.run(board.run(s * attack(i, 0.0025) + knock));
  }
  return fadeEdges(dcBlock(normalize(out, 0.75)), 0.001, 0.1);
}

// --- Electric piano -------------------------------------------------------------------------------

function epiano(midi: number, layer: number): Float32Array {
  const f = midiToHz(midi);
  const n = len(noteSeconds('epiano', midi));
  const out = new Float32Array(n);
  const w = (2 * Math.PI * f) / RENDER_RATE;
  const decay = 2.2 * Math.pow(220 / f, 0.4);
  const idx = layer ? 1.6 : 0.9;
  let pc = 0;
  let pm = 0;
  let pt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RENDER_RATE;
    const env = Math.exp(-t / decay) * attack(i, 0.002);
    // The warm body: carrier at the note, modulator at the note, index falling with time.
    const index = idx * Math.exp(-t / 0.5) + 0.25;
    const m = Math.sin(pm) * index;
    const body = Math.sin(pc + m);
    // The tine's bell: a high modulator ratio that fades within a fraction of a second.
    const tine = Math.sin(pc + Math.sin(pt) * (layer ? 1.2 : 0.6) * Math.exp(-t / 0.08)) - Math.sin(pc);
    out[i] = (body + tine * 0.6) * env;
    pc += w;
    pm += w;
    pt += w * 14;
  }
  return fadeEdges(dcBlock(normalize(out, 0.7)), 0.001, 0.1);
}

// --- Mallets --------------------------------------------------------------------------------------

/** A struck bar: modal partials [ratio, amplitude, seconds to fall 60 dB] and a mallet tap. */
function bar(
  midi: number,
  layer: number,
  modes: [number, number, number][],
  seconds: number,
  malletHz: number,
  tremolo = 0,
): Float32Array {
  const f = midiToHz(midi);
  const n = len(seconds);
  const out = new Float32Array(n);
  const rand = seeded(midi * 7 + layer + modes.length * 101);
  const reg = Math.pow(440 / f, 0.3);
  const parts = modes
    .filter(([r]) => f * r < RENDER_RATE * 0.45)
    .map(
      ([r, a, t], k) => new Partial(f * r, a * (k === 0 || layer ? 1 : 0.6), t60Per(t * reg), rand() * 6.28),
    );
  const tap = new Biquad('bandpass', malletHz, 1.2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    const knock = i < 120 ? tap.run(noise(rand)) * (1 - i / 120) * 0.15 : 0;
    const trem = tremolo ? 1 - tremolo * (0.5 + 0.5 * Math.sin((2 * Math.PI * 5.2 * i) / RENDER_RATE)) : 1;
    out[i] = (s * attack(i, 0.0015) + knock) * trem;
  }
  return fadeEdges(dcBlock(normalize(out, 0.7)), 0.001, 0.05);
}

const marimba = (m: number, l: number) =>
  bar(
    m,
    l,
    [
      [1, 1, 0.9],
      [3.99, 0.22, 0.25],
      [10.7, 0.05, 0.08],
    ],
    noteSeconds('marimba', m),
    900,
  );
const vibes = (m: number, l: number) =>
  bar(
    m,
    l,
    [
      [1, 1, 3.2],
      [3.98, 0.18, 0.9],
      [10.2, 0.04, 0.2],
    ],
    noteSeconds('vibes', m),
    2500,
    0.22,
  );
const celesta = (m: number, l: number) =>
  bar(
    m,
    l,
    [
      [1, 1, 1.8],
      [3.0, 0.3, 0.5],
      [4.1, 0.15, 0.25],
      [6.1, 0.08, 0.12],
    ],
    noteSeconds('celesta', m),
    3000,
  );
const glock = (m: number, l: number) =>
  bar(
    m,
    l,
    [
      [1, 1, 2.2],
      [2.71, 0.3, 0.8],
      [5.15, 0.12, 0.4],
      [8.43, 0.05, 0.2],
    ],
    noteSeconds('glock', m),
    5000,
  );
const kalimba = (m: number, l: number) =>
  bar(
    m,
    l,
    [
      [1, 1, 1.5],
      [5.8, 0.18, 0.15],
      [6.6, 0.06, 0.1],
    ],
    noteSeconds('kalimba', m),
    1800,
  );

// --- Flute and strings ----------------------------------------------------------------------------

function flute(midi: number, layer: number): Float32Array {
  const f = midiToHz(midi);
  const n = len(noteSeconds('flute', midi));
  const out = new Float32Array(n);
  const rand = seeded(midi * 3 + layer);
  const breath = new Biquad('bandpass', f * 2, 3);
  const chiff = new Biquad('bandpass', f * 3, 2);
  const harm = [1, 0.42, 0.16, 0.08, 0.03];
  const ph = harm.map(() => rand() * 6.28);
  const w = (2 * Math.PI * f) / RENDER_RATE;
  let vib = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RENDER_RATE;
    // Vibrato blooms after the note settles, as players do.
    const depth = 0.004 * Math.min(1, Math.max(0, (t - 0.35) / 0.5));
    vib += (2 * Math.PI * 5) / RENDER_RATE;
    const bend = 1 + depth * Math.sin(vib);
    let s = 0;
    for (let h = 0; h < harm.length; h++) {
      ph[h] = ph[h]! + w * (h + 1) * bend;
      s += Math.sin(ph[h]!) * harm[h]!;
    }
    const swell = Math.min(1, t / 0.07) * (0.92 + 0.08 * Math.sin(t * 2.1));
    const air = breath.run(noise(rand)) * 0.12;
    const start = t < 0.06 ? chiff.run(noise(rand)) * (1 - t / 0.06) * 0.35 : 0;
    out[i] = (s * swell + air * swell + start) * (layer ? 1 : 0.8);
  }
  return fadeEdges(dcBlock(normalize(out, 0.7)), 0.002, 0.15);
}

function strings(midi: number, layer: number): Float32Array {
  const f = midiToHz(midi);
  const n = len(noteSeconds('strings', midi));
  const out = new Float32Array(n);
  const rand = seeded(midi * 5 + layer);
  // Three players a few cents apart, each a soft sawtooth (harmonics falling as 1/k).
  const voices = [-0.0035, 0, 0.004].map((d) => {
    const parts: Partial[] = [];
    for (let k = 1; k <= 10 && f * k < 5000; k++)
      parts.push(new Partial(f * k * (1 + d), 1 / k, 1, rand() * 6.28));
    return parts;
  });
  const lp = new Biquad('lowpass', 1800 + layer * 900, 0.6);
  const body = new Biquad('peak', 500, 1, 2);
  for (let i = 0; i < n; i++) {
    const t = i / RENDER_RATE;
    let s = 0;
    for (const v of voices) for (const p of v) s += p.run();
    const env = Math.min(1, t / 0.45);
    out[i] = body.run(lp.run(s)) * env;
  }
  return fadeEdges(dcBlock(normalize(out, 0.6)), 0.002, 0.3);
}

// --- Drums ----------------------------------------------------------------------------------------

function brush(variant: number): Float32Array {
  const rand = seeded(variant * 101);
  const n = len(noteSeconds('brush', 0));
  const out = new Float32Array(n);
  const bp = new Biquad('bandpass', 4200 + variant * 300, 0.7);
  const hp = new Biquad('highpass', 1500);
  const skin = new Partial(185 + variant * 4, 0.25, t60Per(0.12));
  // A swish: wires drawn across the head, then the tap.
  for (let i = 0; i < n; i++) {
    const t = i / RENDER_RATE;
    const swish = Math.min(1, t / 0.03) * Math.exp(-t / 0.09);
    out[i] = hp.run(bp.run(noise(rand))) * swish + skin.run() * Math.exp(-t / 0.05);
  }
  return fadeEdges(normalize(out, 0.6), 0.002, 0.05);
}

function ride(variant: number): Float32Array {
  const rand = seeded(variant * 211);
  const n = len(noteSeconds('ride', 0));
  const out = new Float32Array(n);
  // A cymbal's shimmer: many inharmonic partials, plus the stick's ping.
  const ratios = [1, 1.47, 1.83, 2.31, 2.76, 3.39, 4.03, 4.71];
  const base = 410 + variant * 9;
  const parts = ratios.map(
    (r, k) => new Partial(base * r * 2.2, 0.3 / (1 + k * 0.3), t60Per(1.3 - k * 0.1), rand() * 6.28),
  );
  const hp = new Biquad('highpass', 2500);
  const ping = new Partial(base * 7.1, 0.25, t60Per(0.25));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p.run();
    const wash = noise(rand) * 0.15 * Math.exp(-i / (0.4 * RENDER_RATE));
    out[i] = hp.run(s + wash) + ping.run();
  }
  return fadeEdges(normalize(out, 0.5), 0.001, 0.1);
}

function shaker(variant: number): Float32Array {
  const rand = seeded(variant * 307);
  const n = len(noteSeconds('shaker', 0));
  const out = new Float32Array(n);
  const bp = new Biquad('bandpass', 7000 + variant * 400, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / RENDER_RATE;
    const env = Math.min(1, t / 0.015) * Math.exp(-t / 0.04);
    out[i] = bp.run(noise(rand)) * env;
  }
  return fadeEdges(normalize(out, 0.5), 0.001, 0.02);
}

/**
 * Renders one note. `layer` 0 is a soft touch and 1 a firm one (brighter, not just louder).
 * Unpitched instruments read `midi` as a variation (1 to 4).
 */
export function renderNote(inst: Instrument, midi: number, layer = 1): Float32Array {
  switch (inst) {
    case 'bass':
      return bass(midi, layer);
    case 'brush':
      return brush(midi);
    case 'celesta':
      return celesta(midi, layer);
    case 'epiano':
      return epiano(midi, layer);
    case 'flute':
      return flute(midi, layer);
    case 'glock':
      return glock(midi, layer);
    case 'guitar':
      return guitar(midi, layer);
    case 'kalimba':
      return kalimba(midi, layer);
    case 'marimba':
      return marimba(midi, layer);
    case 'piano':
      return piano(midi, layer);
    case 'ride':
      return ride(midi);
    case 'shaker':
      return shaker(midi);
    case 'strings':
      return strings(midi, layer);
    case 'vibes':
      return vibes(midi, layer);
  }
}

/** Mix level of each instrument, so a mezzo note on any of them sits at a similar loudness. */
export const INSTRUMENT_LEVEL: Record<Instrument, number> = {
  bass: 0.95,
  brush: 1.0,
  celesta: 0.8,
  epiano: 0.75,
  flute: 0.6,
  glock: 0.9,
  guitar: 1.4,
  kalimba: 0.9,
  marimba: 0.85,
  piano: 0.9,
  ride: 0.7,
  shaker: 0.75,
  strings: 0.4,
  vibes: 0.7,
};

/** Seconds of release when a held note ends (a damper, a lifted finger, a bow leaving). */
export const RELEASE: Record<Instrument, number> = {
  bass: 0.12,
  brush: 0.1,
  celesta: 0.6,
  epiano: 0.15,
  flute: 0.12,
  glock: 0.8,
  guitar: 0.25,
  kalimba: 0.5,
  marimba: 0.3,
  piano: 0.12,
  ride: 0.4,
  shaker: 0.05,
  strings: 0.6,
  vibes: 0.9,
};

/** Where each instrument sits, -1 left to 1 right (pianos also spread by pitch). */
export const INSTRUMENT_PAN: Record<Instrument, number> = {
  bass: 0,
  brush: 0.25,
  celesta: 0.3,
  epiano: -0.2,
  flute: 0.2,
  glock: 0.35,
  guitar: -0.25,
  kalimba: 0.2,
  marimba: 0.15,
  piano: 0,
  ride: 0.35,
  shaker: 0.4,
  strings: -0.3,
  vibes: 0.2,
};

// Renders a listening preview of the synthesized music, ambience and cues to a WAV file (C5G):
// `npm run audio:preview -- out.wav`. It mixes each piece exactly as the engine schedules it
// (gain, pan, release), with a stereo room standing in for the engine's reverb.
import { writeFileSync } from 'node:fs';
import type { SoundCueId } from '../../apps/client/src/audio/api';
import { compose } from '../../apps/client/src/audio/composer';
import { STYLES } from '../../apps/client/src/audio/director';
import { noteGain, noteJob, notePan, noteRelease } from '../../apps/client/src/audio/music';
import { renderAmbience, type AmbienceId } from '../../apps/client/src/audio/synth/ambience';
import { renderCue } from '../../apps/client/src/audio/synth/cues';
import { RENDER_RATE } from '../../apps/client/src/audio/synth/dsp';
import { jobKey, renderJob } from '../../apps/client/src/audio/synth/jobs';

const RATE = RENDER_RATE;
const only = process.env.QOTI_PREVIEW_STYLES?.split(',');
const segments: {
  label: string;
  style: string;
  seed: number;
  key: number;
  ambience: [AmbienceId, number][];
}[] = [
  {
    label: 'spring morning',
    style: 'morning',
    seed: 3,
    key: 50,
    ambience: [
      ['birds', 0.55],
      ['river', 0.35],
    ],
  },
  { label: 'summer morning', style: 'summer-morning', seed: 11, key: 53, ambience: [['birds', 0.5]] },
  {
    label: 'summer afternoon',
    style: 'afternoon',
    seed: 8,
    key: 48,
    ambience: [
      ['murmur', 0.3],
      ['hammer', 0.2],
    ],
  },
  {
    label: 'autumn afternoon',
    style: 'autumn',
    seed: 2,
    key: 55,
    ambience: [
      ['wind', 0.35],
      ['rain', 0.45],
    ],
  },
  {
    label: 'summer evening',
    style: 'evening',
    seed: 5,
    key: 51,
    ambience: [
      ['crickets', 0.3],
      ['river', 0.25],
    ],
  },
  { label: 'night', style: 'night', seed: 6, key: 46, ambience: [['crickets', 0.3]] },
  { label: 'winter morning', style: 'winter-morning', seed: 9, key: 50, ambience: [['wind', 0.3]] },
  {
    label: 'winter evening',
    style: 'waltz',
    seed: 4,
    key: 51,
    ambience: [
      ['hearth', 0.45],
      ['wind', 0.25],
    ],
  },
].filter((s) => !only || only.includes(s.style));

const cache = new Map<string, Float32Array>();
function sample(n: Parameters<typeof noteJob>[0]): Float32Array {
  const job = noteJob(n);
  const k = jobKey(job);
  let b = cache.get(k);
  if (!b) cache.set(k, (b = renderJob(job)));
  return b;
}

const parts: { L: Float32Array; R: Float32Array }[] = [];
for (const seg of segments) {
  const style = STYLES.find((s) => s.id === seg.style)!;
  const piece = compose({ style, seed: seg.seed, key: seg.key });
  const len = Math.floor((piece.seconds + 1) * RATE);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (const n of piece.notes) {
    const buf = sample(n);
    const at = Math.floor(n.time * RATE);
    const g = noteGain(n);
    const pan = notePan(n);
    const gl = g * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = g * Math.sin(((pan + 1) * Math.PI) / 4);
    const rel = noteRelease(n);
    const relAt = rel.at * RATE;
    const tau = Math.max(1, rel.tau * RATE);
    for (let j = 0; j < buf.length && at + j < len; j++) {
      const e = j < relAt ? 1 : Math.exp(-(j - relAt) / tau);
      if (e < 1e-4) break;
      L[at + j] += buf[j]! * gl * e;
      R[at + j] += buf[j]! * gr * e;
    }
  }
  // At the default sliders the ambience bus is about 1.35 times the music bus.
  for (const [id, gain] of process.env.QOTI_PREVIEW_DRY ? [] : seg.ambience) {
    const loop = renderAmbience(id);
    const g = gain * 1.35;
    for (let j = 0; j < len; j++) {
      const v = loop[j % loop.length]! * g * Math.min(1, j / RATE, (len - j) / RATE);
      L[j] += v;
      R[j] += v;
    }
  }
  parts.push({ L, R });
  console.log(
    `${seg.label}: ${style.id}, ${piece.tempo} bpm, ${piece.bars} bars, ${piece.seconds.toFixed(0)} s`,
  );
}

if (!process.env.QOTI_PREVIEW_NO_CUES) {
  const ids: SoundCueId[] = [
    'place',
    'remove',
    'built',
    'coins',
    'letter',
    'ping',
    'emote',
    'pattern',
    'achievement',
    'rank-up',
    'bell',
    'howl',
    'festival-cheer',
    'raid-horn',
    'skates',
    'thunder',
  ];
  const bufs = ids.map((id) => renderCue(id));
  const gap = Math.floor(0.7 * RATE);
  const L = new Float32Array(bufs.reduce((a, b) => a + b.length + gap, 0));
  let at = 0;
  for (const b of bufs) {
    for (let i = 0; i < b.length; i++) L[at + i] = b[i]! * 0.5;
    at += b.length + gap;
  }
  parts.push({ L, R: L.slice() });
}

// Join, then a stereo room: early reflections and a damped diffuse tail (Schroeder-Moorer).
const total = parts.reduce((a, p) => a + p.L.length, 0);
const L = new Float32Array(total);
const R = new Float32Array(total);
let o = 0;
for (const p of parts) {
  L.set(p.L, o);
  R.set(p.R, o);
  o += p.L.length;
}
function room(x: Float32Array, spread: number): Float32Array {
  const out = new Float32Array(x.length);
  const combs = [0.0297, 0.0371, 0.0411, 0.0437, 0.0491, 0.0533].map((d) => Math.floor((d + spread) * RATE));
  for (const n of combs) {
    const buf = new Float32Array(x.length);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const fb = i >= n ? buf[i - n]! : 0;
      lp += (fb - lp) * 0.45;
      buf[i] = x[i]! + lp * 0.8;
    }
    for (let i = 0; i < x.length; i++) out[i] += buf[i]!;
  }
  for (const d of [0.005, 0.0017]) {
    const n = Math.floor(d * RATE);
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const xd = i >= n ? out[i - n]! : 0;
      const yd = i >= n ? y[i - n]! : 0;
      y[i] = -0.7 * out[i]! + xd + 0.7 * yd;
    }
    out.set(y);
  }
  return out;
}
const wl = room(L, 0);
const wr = room(R, 0.0011);
let peak = 0;
for (let i = 0; i < total; i++) {
  L[i] += wl[i]! * 0.045;
  R[i] += wr[i]! * 0.045;
  peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
}
const k = 0.89 / peak;
const data = Buffer.alloc(44 + total * 4);
data.write('RIFF', 0);
data.writeUInt32LE(36 + total * 4, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(RATE, 24);
data.writeUInt32LE(RATE * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(total * 4, 40);
for (let i = 0; i < total; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i]! * k)) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i]! * k)) * 32767), 46 + i * 4);
}
const out = process.argv[2] ?? 'qoti-audio-preview.wav';
writeFileSync(out, data);
console.log(`wrote ${out}: ${(total / RATE).toFixed(0)} s, ${cache.size} notes rendered`);

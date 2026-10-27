// Renders a preview of the synthesized music and ambience to a WAV file, for listening outside the
// game (C5G): `npx tsx tools/audio/demo.ts out.wav`. It mixes the same composer and instruments
// the engine uses, with a simple reverb standing in for the engine's room.
import { writeFileSync } from 'node:fs';
import { compose } from '../../apps/client/src/audio/composer';
import { STYLES } from '../../apps/client/src/audio/director';
import { INSTRUMENT_TRIM, VOICE_MIX, instrumentFor } from '../../apps/client/src/audio/music';
import { renderAmbience, type AmbienceId } from '../../apps/client/src/audio/synth/ambience';
import { renderCue } from '../../apps/client/src/audio/synth/cues';
import { RENDER_RATE } from '../../apps/client/src/audio/synth/dsp';
import { NOTE_SECONDS, renderNote } from '../../apps/client/src/audio/synth/instruments';
import type { SoundCueId } from '../../apps/client/src/audio/api';

const RATE = RENDER_RATE;

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
      ['birds', 0.6],
      ['river', 0.5],
    ],
  },
  {
    label: 'summer afternoon',
    style: 'afternoon',
    seed: 8,
    key: 53,
    ambience: [
      ['murmur', 0.4],
      ['hammer', 0.3],
      ['anvil', 0.2],
    ],
  },
  {
    label: 'summer evening',
    style: 'evening',
    seed: 5,
    key: 48,
    ambience: [
      ['crickets', 0.4],
      ['river', 0.3],
    ],
  },
  {
    label: 'autumn afternoon',
    style: 'autumn',
    seed: 2,
    key: 55,
    ambience: [
      ['wind', 0.4],
      ['rain', 0.6],
    ],
  },
  { label: 'winter evening', style: 'waltz', seed: 4, key: 51, ambience: [['wind', 0.5]] },
  {
    label: 'night',
    style: 'night',
    seed: 6,
    key: 46,
    ambience: [
      ['crickets', 0.35],
      ['river', 0.3],
    ],
  },
];

const cache = new Map<string, Float32Array>();
const note = (inst: Parameters<typeof renderNote>[0], midi: number): Float32Array => {
  const k = `${inst}:${midi}`;
  let b = cache.get(k);
  if (!b) cache.set(k, (b = renderNote(inst, midi)));
  return b;
};

const parts: { L: Float32Array; R: Float32Array }[] = [];
let total = 0;
for (const seg of segments) {
  const style = STYLES.find((s) => s.id === seg.style)!;
  const piece = compose({ style, seed: seg.seed, key: seg.key });
  const len = Math.floor((piece.seconds + 2) * RATE);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const spb = 60 / piece.tempo;
  piece.notes.forEach((n, i) => {
    const inst = instrumentFor(n.voice, style);
    const buf = note(inst, inst === 'brush' ? 1 + (i % 4) : n.midi);
    const at = Math.floor((n.beat * spb + (n.voice === 'bass' ? 0 : (Math.random() - 0.5) * 0.016)) * RATE);
    const ring = Math.min(NOTE_SECONDS[inst], n.len * spb + 0.25) * RATE;
    const { gain, pan } = VOICE_MIX[n.voice];
    const g = n.vel * gain * INSTRUMENT_TRIM[inst] * (0.9 + Math.random() * 0.2);
    const gl = g * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = g * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let j = 0; j < buf.length && at + j < len; j++) {
      const rel = j < ring ? 1 : Math.exp(-(j - ring) / (0.12 * RATE));
      L[at + j] += buf[j]! * gl * rel;
      R[at + j] += buf[j]! * gr * rel;
    }
  });
  for (const [id, gain] of process.env.QOTI_DEMO_DRY ? [] : seg.ambience) {
    const loop = renderAmbience(id);
    // At the default sliders the ambience bus is about 1.35 times the music bus.
    const g = gain * 1.35;
    for (let j = 0; j < len; j++) {
      const v = loop[j % loop.length]! * g * Math.min(1, j / RATE, (len - j) / RATE);
      L[j] += v;
      R[j] += v;
    }
  }
  parts.push({ L, R });
  total += len;
  console.log(`${seg.label}: ${style.id}, ${piece.tempo} bpm, ${piece.seconds.toFixed(0)} s`);
}

// The cues, one after another, at the end.
const cueIds: SoundCueId[] = [
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
{
  const bufs = cueIds.map((id) => renderCue(id));
  const len = bufs.reduce((a, b) => a + b.length + Math.floor(0.6 * RATE), 0);
  const L = new Float32Array(len);
  let at = 0;
  for (const b of bufs) {
    L.set(
      b.map((v) => v * 0.5),
      at,
    );
    at += b.length + Math.floor(0.6 * RATE);
  }
  parts.push({ L, R: L.slice() });
  total += len;
}

// Join, add a simple room (a few comb filters), and limit.
const L = new Float32Array(total);
const R = new Float32Array(total);
let o = 0;
for (const p of parts) {
  L.set(p.L, o);
  R.set(p.R, o);
  o += p.L.length;
}
function room(x: Float32Array, delays: number[]): Float32Array {
  const out = new Float32Array(x.length);
  for (const d of delays) {
    const n = Math.floor(d * RATE);
    const buf = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) buf[i] = x[i]! + (i >= n ? buf[i - n]! * 0.72 : 0);
    for (let i = 0; i < x.length; i++) out[i] += buf[i]! * 0.06;
  }
  return out;
}
const wl = room(L, [0.0297, 0.0371, 0.0411, 0.0437]);
const wr = room(R, [0.0311, 0.0353, 0.0429, 0.0451]);
let peak = 0;
for (let i = 0; i < total; i++) {
  L[i] += wl[i]!;
  R[i] += wr[i]!;
  peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
}
const k = 0.9 / peak;

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
console.log(`wrote ${out}: ${(total / RATE).toFixed(0)} s`);

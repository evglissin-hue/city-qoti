// Builds the band's sampled instruments from a checkout of the VS Chamber Orchestra: Community
// Edition (CC0, https://github.com/sgossner/VSCO-2-CE): `npm run audio:samples -- <checkout>`.
// For each note it picks, it checks the pitch (and keeps the few cents a player was off), trims the
// silence before the attack, cuts the note to a useful length, matches the instrument's loudness to
// the synthesized one it stands in for (so the mix keeps its balance), and writes mono AAC to
// apps/client/public/audio/samples. It also writes the zone table the sampler reads
// (apps/client/src/audio/sampler.zones.ts) and the credits. A fresh clone needs only the folders
// named in SOURCES (`git sparse-checkout` or a partial clone keeps the download small).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_RATE } from '../../apps/client/src/audio/synth/dsp';
import { renderNote, type Instrument } from '../../apps/client/src/audio/synth/instruments';

const RATE = 44100;
const BITRATE = '64k';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'apps', 'client', 'public', 'audio', 'samples');
const zonesFile = join(root, 'apps', 'client', 'src', 'audio', 'sampler.zones.ts');

const vsco = process.argv[2];
if (!vsco) throw new Error('usage: npm run audio:samples -- <path to a VSCO-2-CE checkout>');

interface Pick {
  /** Path inside the checkout. */
  path: string;
  /** The note as named (MIDI). */
  midi: number;
  layer: 0 | 1;
  /** A short name for the output file. */
  name: string;
}

interface Source {
  inst: Instrument;
  /** Seconds kept of each note, low and high (struck notes ring shorter up high). */
  seconds: [number, number];
  /** Where in the note the pitch is read, seconds after the attack. */
  settle: number;
  picks: () => Pick[];
}

const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C#2' → MIDI, with VSCO's octave numbering (C3 is middle C) unless `sci` (C4 is). */
function noteMidi(name: string, sci = false): number {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  return PCS[m[1]!]! + (m[2] ? 1 : 0) + 12 * (Number(m[3]) + (sci ? 1 : 2));
}

function list(dir: string): string[] {
  return readdirSync(join(vsco, dir))
    .filter((f) => f.endsWith('.wav'))
    .sort();
}

/** Files named like `<prefix><note><rest>`; `layerOf` reads the dynamic from the rest (or skips it). */
function byNote(
  dir: string,
  re: RegExp,
  layerOf: (rest: string) => 0 | 1 | null,
  opts: { sci?: boolean; keep?: (midi: number) => boolean; tag?: string } = {},
): Pick[] {
  const out: Pick[] = [];
  for (const f of list(dir)) {
    const m = re.exec(f);
    if (!m) continue;
    const layer = layerOf(m[2] ?? '');
    if (layer === null) continue;
    const midi = noteMidi(m[1]!, opts.sci);
    if (opts.keep && !opts.keep(midi)) continue;
    if (out.some((p) => p.midi === midi && p.layer === layer)) continue;
    out.push({ path: join(dir, f), midi, layer, name: `${opts.tag ?? ''}${midi}-${layer}` });
  }
  return out;
}

const SOURCES: Source[] = [
  {
    inst: 'piano',
    seconds: [6, 3],
    settle: 0.15,
    // Ivy Audio's upright, every major third; the softest two of its three dynamics.
    picks: () => {
      const out: Pick[] = [];
      for (let i = 0; i <= 44; i += 2) {
        const midi = 21 + 2 * i;
        if (midi < 29 || midi > 105) continue;
        const n = String(i).padStart(3, '0');
        for (const layer of [0, 1] as const)
          out.push({
            path: join('Keys/Upright Piano', `Player_dyn${layer + 1}_rr1_${n}.wav`),
            midi,
            layer,
            name: `${midi}-${layer}`,
          });
      }
      return out;
    },
  },
  {
    inst: 'bass',
    seconds: [2.4, 2],
    settle: 0.12,
    picks: () =>
      byNote('Strings/Solo Contrabass/Pizz', /^BKCtbss_Pizz_([A-G]#?\d)_(v\d_rr\d)\.wav$/, (r) =>
        r === 'v1_rr1' ? 0 : r === 'v3_rr1' ? 1 : null,
      ),
  },
  {
    inst: 'strings',
    seconds: [8, 8],
    settle: 0.6,
    // A section for each register: cellos low, violas in the middle, violins on top.
    picks: () => [
      ...byNote(
        'Strings/Cello Section/susvib',
        /^susvib_([A-G]#?\d)_(v\d)_1\.wav$/,
        (r) => (r === 'v1' ? 0 : r === 'v3' ? 1 : null),
        { keep: (m) => m <= 53, tag: 'vc' },
      ),
      ...byNote(
        'Strings/Viola Section/susvib',
        /^ViolaEns_susvib_([A-G]#?\d)_(v\d)_1\.wav$/,
        (r) => (r === 'v1' ? 0 : r === 'v2' ? 1 : null),
        { keep: (m) => m >= 54 && m <= 65, tag: 'va' },
      ),
      ...byNote(
        'Strings/Violin Section/susVib',
        /^VlnEns_susVib_([A-G]#?\d)_(v\d)\.wav$/,
        (r) => (r === 'v1' ? 0 : r === 'v2' ? 1 : null),
        { keep: (m) => m >= 66, tag: 'vn' },
      ),
    ],
  },
  {
    inst: 'flute',
    seconds: [6, 6],
    settle: 0.5,
    picks: () =>
      byNote('Woodwinds/Flute/susNV', /^LDFlute_susNV_([A-G]#?\d)_(v\d)_1\.wav$/, (r) =>
        r === 'v1' ? 0 : r === 'v3' || r === 'v2' ? 1 : null,
      ),
  },
  {
    inst: 'clarinet',
    seconds: [6, 6],
    settle: 0.5,
    picks: () =>
      byNote('Woodwinds/Clarinet/susLong', /^DCClar_susLong_([A-G]#?\d)_(v\d)_rr1_sum\.wav$/, (r) =>
        r === 'v1' ? 0 : r === 'v3' ? 1 : null,
      ),
  },
  {
    inst: 'marimba',
    seconds: [2.6, 1.6],
    settle: 0.08,
    picks: () => byNote('Percussion/Marimba', /^Marimba_hit_Outrigger_([A-G]#?\d)_(loud)_01\.wav$/, () => 0),
  },
  {
    inst: 'harp',
    seconds: [5, 3],
    settle: 0.15,
    picks: () =>
      byNote('Strings/Harp', /^KSHarp_([A-G]#?\d)_(\w+)\.wav$/, () => 0, {
        sci: true,
        keep: (m) => m >= 36 && m <= 96,
      }),
  },
];

function decode(file: string): Float32Array {
  const buf = execFileSync(
    'ffmpeg',
    ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 },
  );
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4).slice();
}

/**
 * The pitch (MIDI, fractional) of the window at `from`, by YIN, searched within a semitone and a
 * half of the named note so an overtone or the octave below never fools it; NaN if it is unclear.
 */
function pitch(x: Float32Array, from: number, named: number): number {
  const N = 4096;
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const minL = Math.floor(RATE / hz(named + 1.5));
  const maxL = Math.ceil(RATE / hz(named - 1.5));
  if (from + N + maxL + 2 > x.length) return NaN;
  const d = new Float64Array(maxL + 2);
  for (let t = 1; t <= maxL + 1; t++) {
    let s = 0;
    for (let i = 0; i < N; i++) {
      const v = x[from + i]! - x[from + i + t]!;
      s += v * v;
    }
    d[t] = s;
  }
  const c = new Float64Array(maxL + 2);
  c[0] = 1;
  let run = 0;
  for (let t = 1; t <= maxL + 1; t++) {
    run += d[t]!;
    c[t] = (d[t]! * t) / (run || 1);
  }
  let best = minL;
  for (let t = minL; t <= maxL; t++) if (c[t]! < c[best]!) best = t;
  if (c[best]! > 0.3 || best === minL || best === maxL) return NaN;
  const a = c[best - 1]!;
  const b = c[best]!;
  const e = c[best + 1]!;
  const den = a - 2 * b + e;
  const off = den !== 0 ? (a - e) / (2 * den) : 0;
  return 69 + 12 * Math.log2(RATE / (best + off) / 440);
}

function rms(x: Float32Array, rate: number, seconds = 1): number {
  const n = Math.min(x.length, Math.floor(rate * seconds));
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, n));
}

/** From just before the attack, at most `seconds` long, faded at both ends, peak at 0.9. */
function shape(x: Float32Array, seconds: number): Float32Array {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let on = 0;
  while (on < x.length && Math.abs(x[on]!) < peak * 0.02) on++;
  const pre = Math.floor(0.004 * RATE);
  const start = Math.max(0, on - pre);
  let end = Math.min(x.length, start + Math.floor(seconds * RATE));
  // Leave off the silence after a short note.
  while (end > start + RATE * 0.3 && Math.abs(x[end - 1]!) < peak * 1e-4) end--;
  const out = x.slice(start, end);
  for (let i = 0; i < Math.min(pre, out.length); i++) out[i] = out[i]! * (i / pre);
  const tail = Math.min(out.length, Math.floor(0.3 * RATE));
  for (let i = 0; i < tail; i++) {
    const k = out.length - 1 - i;
    out[k] = out[k]! * (0.5 - 0.5 * Math.cos((Math.PI * i) / tail));
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! * 0.9) / peak;
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

rmSync(outDir, { recursive: true, force: true });
const work = mkdtempSync(join(tmpdir(), 'qoti-samples-'));
const table: string[] = [];
const credits: string[] = [];
let bytes = 0;
let files = 0;
for (const src of SOURCES) {
  const picks = src.picks();
  if (!picks.length) throw new Error(`${src.inst}: no samples found`);
  const lo = Math.min(...picks.map((p) => p.midi));
  const hi = Math.max(...picks.map((p) => p.midi));
  const shaped = picks.map((p) => {
    const t = hi > lo ? (p.midi - lo) / (hi - lo) : 0;
    const secs = src.seconds[0] + (src.seconds[1] - src.seconds[0]) * t;
    return shape(decode(join(vsco, p.path)), secs);
  });
  // What each note really sounds (a recording can sit a little off its name).
  const heard = shaped.map((x, i) => pitch(x, Math.floor(src.settle * RATE), picks[i]!.midi));
  const ratios: number[] = [];
  mkdirSync(join(outDir, src.inst), { recursive: true });
  const zones: string[] = [];
  picks.forEach((p, i) => {
    const rootMidi = p.midi;
    const dev = heard[i]! - rootMidi;
    // Close to its name, or a clean semitone off (a mislabeled file): trust the ear. Otherwise the
    // tracker is unsure, and the note keeps its name.
    const clean = !isNaN(dev) && (Math.abs(dev) < 0.5 || Math.abs(dev - Math.round(dev)) < 0.15);
    const cents = clean ? Math.round(dev * 100) : 0;
    if (!clean) console.warn(`${src.inst} ${p.path}: no clear pitch, kept as named (${rootMidi})`);
    else if (Math.abs(dev) > 0.4)
      console.warn(`${src.inst} ${p.path}: sounds ${heard[i]!.toFixed(2)}, named ${rootMidi}`);
    const x = shaped[i]!;
    const synth = renderNote(src.inst, rootMidi, p.layer);
    ratios.push(rms(synth, RENDER_RATE) / rms(x, RATE));
    const raw = join(work, `${src.inst}-${p.name}.f32`);
    writeFileSync(raw, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
    const file = `${src.inst}/${src.inst === 'strings' ? p.name : `${rootMidi}-${p.layer}`}.m4a`;
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'f32le',
      '-ar',
      String(RATE),
      '-ac',
      '1',
      '-i',
      raw,
      '-c:a',
      'aac',
      '-b:a',
      BITRATE,
      join(outDir, file),
    ]);
    bytes += statSync(join(outDir, file)).size;
    files++;
    zones.push(`[${rootMidi}, ${p.layer}, '${file}', ${cents}]`);
    credits.push(`- \`${file}\`: ${p.path}`);
  });
  const gain = median(ratios);
  table.push(`  ${src.inst}: { gain: ${gain.toFixed(3)}, zones: [${zones.join(', ')}] },`);
  console.log(`${src.inst}: ${picks.length} notes, ${lo} to ${hi}, gain ${gain.toFixed(2)}`);
}
rmSync(work, { recursive: true, force: true });

writeFileSync(
  zonesFile,
  [
    '// Generated by `npm run audio:samples` (tools/audio/samples.ts); do not edit by hand.',
    "import type { Instrument } from './synth/instruments';",
    '',
    '/** A recorded note: its pitch (MIDI), touch layer, file under /audio/samples, and cents sharp. */',
    'export type Zone = readonly [root: number, layer: number, file: string, cents: number];',
    '',
    '/** The sampled instruments: a gain that matches the synthesized level, and their notes. */',
    'export const SAMPLED: Partial<Record<Instrument, { gain: number; zones: readonly Zone[] }>> = {',
    ...table,
    '};',
    '',
  ].join('\n'),
);
execFileSync('npx', ['prettier', '--write', zonesFile], { cwd: root, stdio: 'inherit' });

writeFileSync(
  join(outDir, 'CREDITS.md'),
  [
    '# Sampled instruments',
    '',
    'Generated by `npm run audio:samples` (tools/audio/samples.ts); do not edit by hand.',
    '',
    'From the VS Chamber Orchestra: Community Edition (VSCO-2 CE) by Versilian Studios, released under CC0 1.0',
    '(https://github.com/sgossner/VSCO-2-CE). Recorded by Sam Gossner and Simon Dalzell, sample cutting by',
    'Elan Hickler (Soundemote); the upright piano was sampled by Simon Dalzell of Ivy Audio. Trimmed, cut',
    'to length, mixed to mono and encoded as AAC for the game.',
    '',
    ...credits,
    '',
  ].join('\n'),
);
console.log(`${files} files, ${(bytes / 1e6).toFixed(2)} MB`);

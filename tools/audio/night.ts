// Renders listening previews of a summer night (a meadow, a pond, the edge of a wood) and prints
// their numbers: `npx tsx tools/audio/night.ts <dir>`. Each scene is mixed with the engine's own
// rules (mixAmbience, the loops at their loudness, panning), with the outdoor space's early
// reflections added from the same impulse response (its tail is left out, being quiet).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  emptyPresence,
  mixAmbience,
  type AmbienceScene,
  type Presence,
} from '../../apps/client/src/audio/ambience';
import { outdoorImpulse, renderAmbience } from '../../apps/client/src/audio/synth/ambience';
import { RENDER_RATE } from '../../apps/client/src/audio/synth/dsp';
import { stats } from './stats';

const RATE = RENDER_RATE;
const SECONDS = 60;
const near = (amount: number, dx: number): Presence => ({ amount, dx, dz: 0 });

const scenes: { name: string; scene: Partial<AmbienceScene> }[] = [
  { name: 'meadow', scene: { grass: near(0.55, 3) } },
  { name: 'pond', scene: { grass: near(0.3, 4), water: near(0.14, 7) } },
  { name: 'wood-edge', scene: { grass: near(0.3, 3), forest: near(0.35, -9) } },
];

const ir = outdoorImpulse(RATE);
const taps: [number, number, number][] = [];
for (let c = 0; c < 2; c++)
  for (let i = 0; i < ir[c]!.length && taps.length < 40; i++)
    if (Math.abs(ir[c]![i]!) > 0.1) taps.push([c, i, ir[c]![i]! * 0.3 * 0.4]);

const dir = process.argv[2] ?? '.';
mkdirSync(dir, { recursive: true });
for (const { name, scene } of scenes) {
  const full: AmbienceScene = {
    water: emptyPresence(),
    forest: emptyPresence(),
    grass: emptyPresence(),
    height: 0.1,
    hammer: emptyPresence(),
    anvil: emptyPresence(),
    saw: emptyPresence(),
    market: emptyPresence(),
    homes: emptyPresence(),
    radius: 30,
    ...scene,
  };
  const levels = mixAmbience(full, {
    hour: 23,
    season: 1,
    weather: 'clear',
    frozen: false,
    festival: false,
    zoom: 60,
    yaw: 0,
    night: 1,
  });
  const len = SECONDS * RATE;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const solo = new Map<string, Float32Array>();
  for (const lv of levels) {
    const loop = renderAmbience(lv.id);
    const s = new Float32Array(len);
    const a = ((lv.pan + 1) * Math.PI) / 4;
    for (let i = 0; i < len; i++) {
      const v = loop[i % loop.length]! * lv.gain;
      s[i] = v;
      L[i] += v * Math.cos(a);
      R[i] += v * Math.sin(a);
    }
    solo.set(lv.id, s);
  }
  const dryL = L.slice();
  const dryR = R.slice();
  for (const [c, at, g] of taps) {
    const [src, dst] = c === 0 ? [dryL, L] : [dryR, R];
    for (let i = at; i < len; i++) dst[i] += src[i - at]! * g;
  }
  const mix = stats(L);
  console.log(
    `${name}: ${levels.map((l) => `${l.id} ${l.gain.toFixed(2)}`).join(', ')}\n  mix rms ${mix.rmsDb.toFixed(1)} dBFS, peak ${mix.peak.toFixed(3)}`,
  );
  const c = solo.get('crickets');
  if (c)
    console.log(
      `  crickets (as mixed): centroid ${stats(c).centroid.toFixed(0)} Hz, rms ${stats(c).rmsDb.toFixed(1)} dBFS`,
    );
  const data = Buffer.alloc(44 + len * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + len * 4, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(len * 4, 40);
  // Written as mixed (no normalizing), so the levels are the engine's.
  for (let i = 0; i < len; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i]!)) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i]!)) * 32767), 46 + i * 4);
  }
  writeFileSync(join(dir, `night-${name}.wav`), data);
}

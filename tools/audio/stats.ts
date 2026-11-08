// Numbers for a rendered ambience loop (RMS, peak, spectral centroid, length):
// `npx tsx tools/audio/stats.ts [id ...]` prints one row per loop id.
import { renderAmbience, type AmbienceId } from '../../apps/client/src/audio/synth/ambience';
import { RENDER_RATE } from '../../apps/client/src/audio/synth/dsp';

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
}

export function stats(buf: Float32Array): { rmsDb: number; peak: number; centroid: number } {
  let sum = 0;
  let peak = 0;
  for (const v of buf) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const N = 4096;
  const power = new Float64Array(N / 2);
  for (let at = 0; at + N <= buf.length; at += N) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = buf[at + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) power[k] = power[k]! + re[k]! * re[k]! + im[k]! * im[k]!;
  }
  let num = 0;
  let den = 0;
  for (let k = 1; k < N / 2; k++) {
    const mag = Math.sqrt(power[k]!);
    num += mag * ((k * RENDER_RATE) / N);
    den += mag;
  }
  return {
    rmsDb: 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-12),
    peak,
    centroid: den > 0 ? num / den : 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of process.argv.slice(2)) {
    const b = renderAmbience(id as AmbienceId);
    const s = stats(b);
    console.log(
      `${id}: ${(b.length / RENDER_RATE).toFixed(1)} s, rms ${s.rmsDb.toFixed(1)} dBFS, peak ${s.peak.toFixed(3)}, centroid ${s.centroid.toFixed(0)} Hz`,
    );
  }
}

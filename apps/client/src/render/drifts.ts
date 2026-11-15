// V2B: the flower drift mask. Wildflowers grow in drifts a few tiles across with bare ground
// between them. The nature layer (instanced flowers, near) and the ground texture (painted dots,
// far) both ask this one function, so the two levels agree on where the flowers are. Plain
// arithmetic over `hash2` only: no state and no Math.random, so both laptops get the same drifts.
import { hash2 } from './coords';

const COARSE = 6;
const FINE = 2.5;
const SALT_COARSE = 301;
const SALT_FINE = 302;
const SALT_HUE = 303;
/** The densest a drift gets, as a multiplier on today's flower density. */
const PEAK = 1.75;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Smooth value noise over the tile grid with cells `scale` tiles wide. */
function noise(x: number, z: number, scale: number, salt: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const ux = fx - ix;
  const uz = fz - iz;
  const sx = ux * ux * (3 - 2 * ux);
  const sz = uz * uz * (3 - 2 * uz);
  const a = hash2(ix, iz, salt);
  const b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt);
  const d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * Multiplier on flower density at tile (x, z), 0 to about 1.75: near 0 between drifts, rising over a
 * tile or so to the drift's heart. Drifts are 3 to 7 tiles across and irregular; about a third of
 * open ground is inside one.
 */
export function flowerDrift(x: number, z: number): number {
  const n = noise(x, z, COARSE, SALT_COARSE) * 0.65 + noise(x, z, FINE, SALT_FINE) * 0.35;
  return smooth(0.47, 0.7, n) * PEAK;
}

/**
 * Which of the five flower colors (0 to 4) a drift is made of. Value noise peaks at its lattice
 * points, so the hue is the hash of the nearest coarse lattice point: constant across a drift and
 * shared by its neighbors.
 */
export function driftHue(x: number, z: number): number {
  const lx = Math.round(x / COARSE);
  const lz = Math.round(z / COARSE);
  return Math.min(4, Math.floor(hash2(lx, lz, SALT_HUE) * 5));
}

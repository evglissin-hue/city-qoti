import { DECOR_ROTATIONS } from '../constants';

// Unit vectors for the 64 decor rotations, scaled by 16384. Precomputed because the sim may
// not call Math.cos or Math.sin. Rotation k points a piece's local +x axis along
// (DIR_COS[k], DIR_SIN[k]) in world (x, z); the renderer applies rotation.y = -k * 2pi / 64.

// prettier-ignore
export const DIR_COS: readonly number[] = [
  16384, 16305, 16069, 15679, 15137, 14449, 13623, 12665, 11585, 10394, 9102, 7723, 6270, 4756, 3196, 1606,
  0, -1606, -3196, -4756, -6270, -7723, -9102, -10394, -11585, -12665, -13623, -14449, -15137, -15679, -16069, -16305,
  -16384, -16305, -16069, -15679, -15137, -14449, -13623, -12665, -11585, -10394, -9102, -7723, -6270, -4756, -3196, -1606,
  0, 1606, 3196, 4756, 6270, 7723, 9102, 10394, 11585, 12665, 13623, 14449, 15137, 15679, 16069, 16305,
];

// prettier-ignore
export const DIR_SIN: readonly number[] = [
  0, 1606, 3196, 4756, 6270, 7723, 9102, 10394, 11585, 12665, 13623, 14449, 15137, 15679, 16069, 16305,
  16384, 16305, 16069, 15679, 15137, 14449, 13623, 12665, 11585, 10394, 9102, 7723, 6270, 4756, 3196, 1606,
  0, -1606, -3196, -4756, -6270, -7723, -9102, -10394, -11585, -12665, -13623, -14449, -15137, -15679, -16069, -16305,
  -16384, -16305, -16069, -15679, -15137, -14449, -13623, -12665, -11585, -10394, -9102, -7723, -6270, -4756, -3196, -1606,
];

/** The decor rotation (0 to 63) closest to the direction (dx, dz). Ties pick the lower index. */
export function rotationForDirection(dx: number, dz: number): number {
  let best = 0;
  let bestDot = -Infinity;
  for (let k = 0; k < DECOR_ROTATIONS; k++) {
    const dot = dx * DIR_COS[k]! + dz * DIR_SIN[k]!;
    if (dot > bestDot) {
      bestDot = dot;
      best = k;
    }
  }
  return best;
}

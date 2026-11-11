// Marks a tool lays on the ground for a moment (I2, C4F): the zone tool's lot preview. The
// blueprint layer (Blueprints.tsx) draws them as inked outlines over the valley.
import { signal } from '@preact/signals';

export interface GroundMark {
  /** Footprint min corner and size, tiles. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** CSS color of the ink. */
  ink: string;
  /** The side the door faces (toward the road), for a little step mark. */
  door?: 'n' | 'e' | 's' | 'w';
  dashed?: boolean;
  /** A wash with no outline (zoned ground). */
  fill?: boolean;
  /**
   * R1C: a reach ring instead of a lot: a circle of this many tiles around the footprint's center
   * (the Specialized shelf's "how far does it serve", drawn as a pencil sketch of the road reach).
   */
  ring?: number;
}

export const groundMarks = signal<GroundMark[]>([]);

/** A short line drawn with the marks ("About 4 lots along the lane"). */
export const groundNote = signal<string | null>(null);

export function setGroundMarks(marks: GroundMark[], note: string | null = null): void {
  groundMarks.value = marks;
  groundNote.value = note;
}

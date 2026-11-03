// V1.0: the pattern texture array interface. The kit material (V1A) and the ground shader (V1C)
// sample one texture array with a layer per surface id (surface.ts) plus the noise layer, laid on
// each face as the surface table says. Generated in code at load, never authored (P46), so V1A
// writes the generators here; until then every layer is flat, and a material that samples it
// changes nothing on screen.
import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { PATTERN_LAYERS } from './surface';

/**
 * What each texel holds (RGBA8):
 * - R: a luminance multiplier, 128 meaning 1 (0 is black, 255 just under 2).
 * - G: the accent mask, 0 to 255, mixing toward the surface's accent color (mortar, stripes).
 * - B: a secondary value, such as the hue of a flower.
 * - A: the color mask, used by the flowers layer only (its RGB is then the flower's color).
 */
export const PATTERN_CHANNELS = { luminance: 0, accent: 1, secondary: 2, mask: 3 } as const;

/** R value that leaves a color as it is. */
export const PATTERN_ONE = 128;

/** Default edge of one layer in texels. */
export const PATTERN_SIZE = 256;

/**
 * The pattern array: `size` x `size` texels per layer, one layer per surface id and the noise layer
 * last (`PATTERN_LAYERS`), RGBA8, mipmapped, repeating. The stub fills every layer flat (R 128, G B
 * A 0). Create it once and share it: about 5 MB, plus a third again for the mipmaps.
 */
export function createPatternArray(size = PATTERN_SIZE): DataArrayTexture {
  const texels = size * size * PATTERN_LAYERS;
  const data = new Uint8Array(texels * 4);
  for (let i = 0; i < texels; i++) data[i * 4] = PATTERN_ONE;
  const tex = new DataArrayTexture(data, size, size, PATTERN_LAYERS);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

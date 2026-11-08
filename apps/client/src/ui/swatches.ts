// Customization swatches by group. Ids are the values build.customize carries; content lists them
// flat (packages/content/src/swatches.ts, each with its group and a palette token), and
// `swatchGroups` groups them and looks each token up in the art palette. The spec's tokens below
// stand in for any group content leaves empty.
import { palette } from '@qoti/art';
import { content } from '@qoti/content';

export interface Swatch {
  id: string;
  label: string;
  hex: string;
}

export interface SwatchGroups {
  wall: Swatch[];
  roof: Swatch[];
  roofMaterial: Swatch[];
  accent: Swatch[];
  flowers: Swatch[];
}

const FALLBACK: SwatchGroups = {
  wall: [
    { id: 'cream', label: 'Cream', hex: '#f1e6cf' },
    { id: 'rose', label: 'Rose', hex: '#ebc7b9' },
    { id: 'sage', label: 'Sage', hex: '#c9d3b4' },
    { id: 'sky', label: 'Sky', hex: '#bfd0d8' },
    { id: 'butter', label: 'Butter', hex: '#f0dda0' },
  ],
  roof: [
    { id: 'terracotta', label: 'Terracotta', hex: '#c0643e' },
    { id: 'slate', label: 'Slate', hex: '#5e6b7a' },
    { id: 'thatch', label: 'Thatch', hex: '#c9a35f' },
    { id: 'moss', label: 'Moss', hex: '#6e7f4e' },
    { id: 'plum', label: 'Plum', hex: '#7a5468' },
  ],
  roofMaterial: [
    { id: 'tile', label: 'Tile', hex: '#c0643e' },
    { id: 'slate', label: 'Slate', hex: '#5e6b7a' },
    { id: 'thatch', label: 'Thatch', hex: '#c9a35f' },
    { id: 'shingle', label: 'Shingle', hex: '#8a6448' },
  ],
  accent: [
    { id: 'teal', label: 'Teal', hex: '#3f7f7a' },
    { id: 'red', label: 'Red', hex: '#a8473b' },
    { id: 'mustard', label: 'Mustard', hex: '#d6a73e' },
    { id: 'navy', label: 'Navy', hex: '#34506b' },
    { id: 'white', label: 'White', hex: '#f7f4ec' },
  ],
  flowers: [
    { id: 'geranium', label: 'Geranium', hex: '#d6403a' },
    { id: 'rose', label: 'Rose', hex: '#f2b8c6' },
    { id: 'cream', label: 'Cream', hex: '#f7f4ec' },
    { id: 'cornflower', label: 'Cornflower', hex: '#5b86d6' },
    { id: 'buttercup', label: 'Buttercup', hex: '#f3d35b' },
    { id: 'mixed', label: 'Mixed', hex: '#8f7fd9' },
  ],
};

const GROUPS = Object.keys(FALLBACK) as (keyof SwatchGroups)[];

function tokenHex(token: string, fallback: string): string {
  const v = (palette as unknown as Record<string, unknown>)[token];
  return typeof v === 'number' ? `#${v.toString(16).padStart(6, '0')}` : fallback;
}

let cached: SwatchGroups | null = null;

/**
 * The swatch groups: content's flat list grouped by each swatch's own group, colors from the art
 * palette. (It once read content as if it were already grouped by name and so always showed the
 * fallback list; the client test keeps it honest.)
 */
export function swatchGroups(): SwatchGroups {
  if (cached) return cached;
  const out: SwatchGroups = { wall: [], roof: [], roofMaterial: [], accent: [], flowers: [] };
  for (const s of content.swatches) {
    const list = out[s.group];
    if (!list) continue;
    const fallback = FALLBACK[s.group].find((f) => f.id === s.id)?.hex ?? '#cccccc';
    list.push({ id: s.id, label: s.name, hex: tokenHex(s.token, fallback) });
  }
  for (const g of GROUPS) if (out[g].length === 0) out[g] = FALLBACK[g];
  cached = out;
  return out;
}

export function swatchHex(
  group: keyof SwatchGroups,
  id: string | undefined | null,
  fallback: string,
): string {
  if (!id) return fallback;
  return swatchGroups()[group].find((s) => s.id === id)?.hex ?? fallback;
}

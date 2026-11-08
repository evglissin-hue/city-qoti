// Customization swatches by group. Ids are palette token names (docs/spec/17-presentation.md,
// Palette), the values build.customize carries. When packages/content grows its own swatch list
// (C3B), `swatchGroups` reads it from there; until then these are the spec's tokens.
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
};

type ContentSwatch = {
  id: string;
  name?: string;
  label?: string;
  hex?: string | number;
  color?: string | number;
};

function toHex(v: string | number | undefined, fallback: string): string {
  if (typeof v === 'number') return `#${v.toString(16).padStart(6, '0')}`;
  return typeof v === 'string' && v ? v : fallback;
}

/** The swatch groups, from content when it has them (C3B), else the spec's palette tokens. */
export function swatchGroups(): SwatchGroups {
  const from = (content as unknown as { swatches?: Partial<Record<keyof SwatchGroups, ContentSwatch[]>> })
    .swatches;
  if (!from || typeof from !== 'object') return FALLBACK;
  const pick = (key: keyof SwatchGroups): Swatch[] => {
    const list = from[key];
    if (!Array.isArray(list) || !list.length) return FALLBACK[key];
    return list.map((s) => ({
      id: s.id,
      label: s.label ?? s.name ?? s.id,
      hex: toHex(s.hex ?? s.color, FALLBACK[key].find((f) => f.id === s.id)?.hex ?? '#cccccc'),
    }));
  };
  return {
    wall: pick('wall'),
    roof: pick('roof'),
    roofMaterial: pick('roofMaterial'),
    accent: pick('accent'),
  };
}

export function swatchHex(
  group: keyof SwatchGroups,
  id: string | undefined | null,
  fallback: string,
): string {
  if (!id) return fallback;
  return swatchGroups()[group].find((s) => s.id === id)?.hex ?? fallback;
}

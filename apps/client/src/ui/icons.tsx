// Hand-inked line-art icons for the toolbar, keyed by tool id. Tools without an entry fall back
// to their own text glyph.
import type { JSX } from 'preact';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.7,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

function svg(children: JSX.Element | JSX.Element[]) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...S}>
      {children}
    </svg>
  );
}

// prettier-ignore
const ICONS: Record<string, () => JSX.Element> = {
  building: () => svg([<path key="r" d="M3.5 11.5 12 4l8.5 7.5" />, <path key="w" d="M5.5 10v9.5h13V10" />, <path key="d" d="M10 19.5v-5h4v5" />]),
  decor: () => svg([<circle key="c" cx="12" cy="10" r="2.2" />, <path key="p" d="M12 7.8c0-2.6 3-2.6 3-.4M14.2 10c2.6 0 2.6 3 .4 3M12 12.2c0 2.6-3 2.6-3 .4M9.8 10c-2.6 0-2.6-3-.4-3" />, <path key="s" d="M12 12.5V20M12 17c-2 0-3.5-1-4-2.5" />]),
  erase: () => svg([<path key="a" d="M7 17.5h10" />, <path key="b" d="M6.5 13.5 13 7l4 4-6.5 6.5H8.5z" />]),
  fence: () => svg([<path key="a" d="M6 20V7l1.5-2L9 7v13M15 20V7l1.5-2L18 7v13" />, <path key="b" d="M4 10.5h16M4 15.5h16" />]),
  inspect: () => svg([<circle key="c" cx="10.5" cy="10.5" r="5.5" />, <path key="h" d="m15 15 4.5 4.5" />]),
  note: () => svg([<path key="p" d="M6 4.5h9l3 3v12H6z" />, <path key="l" d="M9 10h6M9 13.5h6M9 17h3.5" />]),
  path: () => svg([<path key="a" d="M5 20c2-5 4-6 7-8s5-4 6-8" stroke-dasharray="2.5 3" />]),
  road: () => svg([<path key="a" d="M7 20 10 4M17 20 14 4" />, <path key="b" d="M12 18.5v-2M12 13v-2M12 7.5v-2" />]),
  tree: () => svg([<path key="t" d="M12 20v-6" />, <path key="c" d="M12 3.5c-3.5 0-5.5 2.6-5.5 5.4 0 2.8 2.3 5.1 5.5 5.1s5.5-2.3 5.5-5.1c0-2.8-2-5.4-5.5-5.4z" />]),
};

export function ToolIcon({ id, fallback }: { id: string; fallback: string }) {
  const icon = ICONS[id];
  return icon ? icon() : <>{fallback}</>;
}

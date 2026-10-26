// Hand-inked line-art icons for the toolbar and panels, keyed by id. Tools without an entry fall
// back to their own text glyph.
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
  achievements: () => svg([<circle key="c" cx="12" cy="9.5" r="5" />, <path key="r" d="m9 13.8-2 6.2 3-1.2 2 2.2 2-2.2 3 1.2-2-6.2" />, <path key="s" d="m12 7.2.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" />]),
  building: () => svg([<path key="r" d="M3.5 11.5 12 4l8.5 7.5" />, <path key="w" d="M5.5 10v9.5h13V10" />, <path key="d" d="M10 19.5v-5h4v5" />]),
  charm: () => svg([<path key="h" d="M12 19.5s-6.5-4-6.5-8.6A3.4 3.4 0 0 1 12 9.1a3.4 3.4 0 0 1 6.5 1.8c0 4.6-6.5 8.6-6.5 8.6z" />, <path key="s" d="M12 9V5.5M10 4.5c1 .3 1.6.6 2 1 .4-.4 1-.7 2-1" />]),
  chronicle: () => svg([<path key="p" d="M5 5.5h11.5v12.5a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2z" />, <path key="e" d="M16.5 9h2.5v9a2 2 0 0 1-2 2" />, <path key="l" d="M8 9h5.5M8 12h5.5M8 15h3.5" />]),
  coin: () => svg([<ellipse key="a" cx="12" cy="12" rx="7.5" ry="7.5" />, <ellipse key="b" cx="12" cy="12" rx="4.8" ry="4.8" stroke-dasharray="1.6 1.8" />, <path key="c" d="M12 9.5v5" />]),
  coverage: () => svg([<path key="d" d="M12 5.5c2.6 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1.4-4 4-7z" />, <path key="r" d="M4 15.5a9 4.5 0 0 0 16 0" stroke-dasharray="2 2.4" />]),
  customize: () => svg([<path key="b" d="M14.5 4.5 19.5 9.5 11 18l-3.6.6.6-3.6z" />, <path key="h" d="m13 6 5 5" />, <path key="d" d="M4.5 19.5c1.2 0 2-.5 2.4-1.5" />]),
  decor: () => svg([<circle key="c" cx="12" cy="10" r="2.2" />, <path key="p" d="M12 7.8c0-2.6 3-2.6 3-.4M14.2 10c2.6 0 2.6 3 .4 3M12 12.2c0 2.6-3 2.6-3 .4M9.8 10c-2.6 0-2.6-3-.4-3" />, <path key="s" d="M12 12.5V20M12 17c-2 0-3.5-1-4-2.5" />]),
  erase: () => svg([<path key="a" d="M7 17.5h10" />, <path key="b" d="M6.5 13.5 13 7l4 4-6.5 6.5H8.5z" />]),
  eye: () => svg([<path key="a" d="M3.5 12s3-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3 5.5-8.5 5.5S3.5 12 3.5 12z" />, <circle key="b" cx="12" cy="12" r="2.4" />]),
  fence: () => svg([<path key="a" d="M6 20V7l1.5-2L9 7v13M15 20V7l1.5-2L18 7v13" />, <path key="b" d="M4 10.5h16M4 15.5h16" />]),
  field: () => svg([<path key="s" d="M12 20V7" />, <path key="l" d="M12 8.5c-2-.3-3-1.6-3-3.5 2 .2 3 1.5 3 3.5zM12 8.5c2-.3 3-1.6 3-3.5-2 .2-3 1.5-3 3.5zM12 12.5c-2-.3-3-1.6-3-3.5 2 .2 3 1.5 3 3.5zM12 12.5c2-.3 3-1.6 3-3.5-2 .2-3 1.5-3 3.5zM12 16.5c-2-.3-3-1.6-3-3.5 2 .2 3 1.5 3 3.5zM12 16.5c2-.3 3-1.6 3-3.5-2 .2-3 1.5-3 3.5z" />, <path key="g" d="M4 20.5h16" />]),
  flows: () => svg([<path key="a" d="M4 8.5h11.5M12.5 5.5l3 3-3 3" />, <path key="b" d="M20 15.5H8.5M11.5 12.5l-3 3 3 3" />]),
  heart: () => svg([<path key="h" d="M12 19s-7-4.3-7-9.2A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 1.8C19 14.7 12 19 12 19z" />]),
  home: () => svg([<path key="r" d="M4.5 11 12 5l7.5 6" />, <path key="w" d="M6.5 9.5v9h11v-9" />, <path key="d" d="M10.5 18.5v-4h3v4" />]),
  inspect: () => svg([<circle key="c" cx="10.5" cy="10.5" r="5.5" />, <path key="h" d="m15 15 4.5 4.5" />]),
  letter: () => svg([<rect key="r" x="4" y="6.5" width="16" height="11" rx="1.5" />, <path key="f" d="m4.5 7.5 7.5 6 7.5-6" />]),
  lock: () => svg([<rect key="b" x="6" y="11" width="12" height="8.5" rx="1.8" />, <path key="s" d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" />, <path key="k" d="M12 14.5v2" />]),
  note: () => svg([<path key="p" d="M6 4.5h9l3 3v12H6z" />, <path key="l" d="M9 10h6M9 13.5h6M9 17h3.5" />]),
  path: () => svg([<path key="a" d="M5 20c2-5 4-6 7-8s5-4 6-8" stroke-dasharray="2.5 3" />]),
  patterns: () => svg([<path key="a" d="M12 6.5c-2-1.6-4.6-2-7.5-1.5v13c2.9-.5 5.5-.1 7.5 1.5 2-1.6 4.6-2 7.5-1.5V5c-2.9-.5-5.5-.1-7.5 1.5z" />, <path key="b" d="M12 6.5v13" />, <path key="c" d="M7 9c1 0 2 .2 3 .6M7 12c1 0 2 .2 3 .6M14 9.6c1-.4 2-.6 3-.6" />]),
  people: () => svg([<circle key="a" cx="9" cy="8.5" r="2.8" />, <path key="b" d="M3.8 19c.4-3.4 2.4-5.5 5.2-5.5s4.8 2.1 5.2 5.5" />, <circle key="c" cx="16.5" cy="9.5" r="2.2" />, <path key="d" d="M15.5 13.6c2.4-.3 4.3 1.4 4.7 4.4" />]),
  ping: () => svg([<circle key="a" cx="12" cy="12" r="2.5" />, <path key="b" d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10" />]),
  reports: () => svg([<path key="b" d="M5.5 4.5h10l3 3v12h-13z" />, <path key="c" d="M8.5 16.5v-3M11.5 16.5v-6M14.5 16.5v-4.5" />, <path key="l" d="M8 8h4" />]),
  road: () => svg([<path key="a" d="M7 20 10 4M17 20 14 4" />, <path key="b" d="M12 18.5v-2M12 13v-2M12 7.5v-2" />]),
  status: () => svg([<path key="b" d="M7 16.5V11a5 5 0 0 1 10 0v5.5l1.5 1.5h-13z" />, <path key="c" d="M10.5 20.5h3" />]),
  tree: () => svg([<path key="t" d="M12 20v-6" />, <path key="c" d="M12 3.5c-3.5 0-5.5 2.6-5.5 5.4 0 2.8 2.3 5.1 5.5 5.1s5.5-2.3 5.5-5.1c0-2.8-2-5.4-5.5-5.4z" />]),
  undo: () => svg([<path key="a" d="M8.5 7 5 10.5 8.5 14" />, <path key="b" d="M5.5 10.5h8a5 5 0 0 1 0 10H10" />]),
  wishes: () => svg([<path key="s" d="m12 4 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" />]),
};

export function ToolIcon({ id, fallback }: { id: string; fallback: string }) {
  const icon = ICONS[id];
  return icon ? icon() : <>{fallback}</>;
}

/** A small inline icon by id (panels and chips). Unknown ids draw nothing. */
export function Glyph({ id, class: cls }: { id: string; class?: string }) {
  const icon = ICONS[id];
  return icon ? <span class={`glyph ${cls ?? ''}`}>{icon()}</span> : null;
}

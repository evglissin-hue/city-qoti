// Hand-inked line-art icons for the toolbar and panels, keyed by id. Tools without an entry fall
// back to their own text glyph.
import type { JSX } from 'preact';
import { GoodIcon } from './goodIcons';

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
  apprentice: () => svg([<path key="h" d="M5 19.5 13.5 11" />, <path key="b" d="m12 8.5 3.5-3.5 4 4-3.5 3.5z" />, <path key="s" d="M14.5 13.5 18 17" stroke-dasharray="1.5 2" />]),
  autumn: () => svg([<path key="l" d="M5 19c0-8 4-13 14-14 0 9-4 14-12 14z" />, <path key="v" d="m5 19 8-8" />]),
  baby: () => svg([<path key="c" d="M4.5 12.5h15a7.5 6 0 0 1-15 0z" />, <path key="h" d="M7 12.5a5 5 0 0 1 9.5-2.2" />, <circle key="f" cx="10" cy="9.6" r="1.6" />, <path key="r" d="M6.5 18.5 5.5 20.5M17.5 18.5l1 2" />]),
  bell: () => svg([<path key="b" d="M6.5 16.5c1-1.2 1.5-3 1.5-5.5a4 4 0 0 1 8 0c0 2.5.5 4.3 1.5 5.5z" />, <path key="c" d="M10.5 19a1.6 1.6 0 0 0 3 0" />, <path key="t" d="M12 4.5V7" />]),
  building: () => svg([<path key="r" d="M3.5 11.5 12 4l8.5 7.5" />, <path key="w" d="M5.5 10v9.5h13V10" />, <path key="d" d="M10 19.5v-5h4v5" />]),
  caravan: () => svg([<path key="b" d="M3.5 15.5V9.5h11v6" />, <path key="c" d="M5 9.5c.5-3 3-4.5 4.5-4.5S13.5 6.5 14 9.5" />, <path key="s" d="M14.5 12h3.5l2.5 3.5h-17" />, <circle key="w1" cx="7.5" cy="17.5" r="2" />, <circle key="w2" cx="16" cy="17.5" r="2" />]),
  cart: () => svg([<path key="b" d="M3.5 7.5H6l2 8h9l1.7-6H7.2" />, <circle key="a" cx="9.5" cy="18.8" r="1.4" />, <circle key="c" cx="16" cy="18.8" r="1.4" />, <path key="h" d="M3.5 7.5h-1" />]),
  charm: () => svg([<path key="h" d="M12 19.5s-6.5-4-6.5-8.6A3.4 3.4 0 0 1 12 9.1a3.4 3.4 0 0 1 6.5 1.8c0 4.6-6.5 8.6-6.5 8.6z" />, <path key="s" d="M12 9V5.5M10 4.5c1 .3 1.6.6 2 1 .4-.4 1-.7 2-1" />]),
  chart: () => svg([<path key="a" d="M4.5 4.5v15h15" />, <path key="l" d="m7.5 15 3.5-4.5 3 2.5 4.5-6" />, <circle key="d" cx="18.5" cy="7" r="1.1" />]),
  charter: () => svg([<path key="p" d="M6.5 4.5h10a2 2 0 0 1 2 2v9" />, <path key="s" d="M6.5 4.5a2 2 0 0 0-2 2v1.5h2" />, <path key="b" d="M6.5 4.5v13a2 2 0 0 0 2 2h7" />, <path key="l" d="M9.5 8.5h6M9.5 11.5h6" />, <circle key="seal" cx="17" cy="17" r="2.6" />, <path key="r" d="m15.8 19.3-.8 2.2M18.2 19.3l.8 2.2" />]),
  check: () => svg([<path key="c" d="m5.5 12.5 4 4 9-9.5" />]),
  chronicle: () => svg([<path key="p" d="M5 5.5h11.5v12.5a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2z" />, <path key="e" d="M16.5 9h2.5v9a2 2 0 0 1-2 2" />, <path key="l" d="M8 9h5.5M8 12h5.5M8 15h3.5" />]),
  coin: () => svg([<ellipse key="a" cx="12" cy="12" rx="7.5" ry="7.5" />, <ellipse key="b" cx="12" cy="12" rx="4.8" ry="4.8" stroke-dasharray="1.6 1.8" />, <path key="c" d="M12 9.5v5" />]),
  comment: () => svg([<path key="b" d="M5 6.5h14v9h-7.5L7.5 19v-3.5H5z" />, <path key="l" d="M8.5 10h7M8.5 12.5h4.5" />]),
  compass: () => svg([<circle key="c" cx="12" cy="12" r="8" />, <path key="n" d="m12 6.5 2 5.5-2 5.5-2-5.5z" />, <path key="t" d="M12 2.5v1.5M12 20v1.5" />]),
  coverage: () => svg([<path key="d" d="M12 5.5c2.6 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1.4-4 4-7z" />, <path key="r" d="M4 15.5a9 4.5 0 0 0 16 0" stroke-dasharray="2 2.4" />]),
  customize: () => svg([<path key="b" d="M14.5 4.5 19.5 9.5 11 18l-3.6.6.6-3.6z" />, <path key="h" d="m13 6 5 5" />, <path key="d" d="M4.5 19.5c1.2 0 2-.5 2.4-1.5" />]),
  decor: () => svg([<circle key="c" cx="12" cy="10" r="2.2" />, <path key="p" d="M12 7.8c0-2.6 3-2.6 3-.4M14.2 10c2.6 0 2.6 3 .4 3M12 12.2c0 2.6-3 2.6-3 .4M9.8 10c-2.6 0-2.6-3-.4-3" />, <path key="s" d="M12 12.5V20M12 17c-2 0-3.5-1-4-2.5" />]),
  dock: () => svg([<path key="w" d="M3 17.5q2.2-1.5 4.5 0t4.5 0 4.5 0 4.5 0" />, <path key="p" d="M5 14h14M7 14v-3M12 14v-3M17 14v-3" />, <path key="b" d="M9 8.5h6l-1 2.5h-4z" />, <path key="m" d="M12 8.5V4.5l3 2.2" />]),
  earthworks: () => svg([<path key="m" d="M3.5 20.5h17" />, <path key="h" d="M5.5 20.5c1.2-3.6 3.4-5.5 6.5-5.5s5.3 1.9 6.5 5.5" />, <path key="s" d="M17 3.5 12.8 11" />, <path key="g" d="M15.4 4.6l3-1.6" />, <path key="b" d="M10.6 10l3.9 2.2-1.6 2.8-3.9-2.2z" />]),
  erase: () => svg([<path key="a" d="M7 17.5h10" />, <path key="b" d="M6.5 13.5 13 7l4 4-6.5 6.5H8.5z" />]),
  exit: () => svg([<path key="d" d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />, <path key="a" d="M10 12h9.5M16 8.5l3.5 3.5-3.5 3.5" />]),
  eye: () => svg([<path key="a" d="M3.5 12s3-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3 5.5-8.5 5.5S3.5 12 3.5 12z" />, <circle key="b" cx="12" cy="12" r="2.4" />]),
  fast: () => svg([<path key="a" d="M5 6.5v11l7-5.5z" />, <path key="b" d="M12 6.5v11l7-5.5z" />]),
  faster: () => svg([<path key="a" d="M3.5 7v10l5-5z" />, <path key="b" d="M9.5 7v10l5-5z" />, <path key="c" d="M15.5 7v10l5-5z" />]),
  fence: () => svg([<path key="a" d="M6 20V7l1.5-2L9 7v13M15 20V7l1.5-2L18 7v13" />, <path key="b" d="M4 10.5h16M4 15.5h16" />]),
  festival: () => svg([<path key="s" d="M3.5 6q8.5 5 17 0" />, <path key="f" d="m6 7.4 1 3 1.2-2.6M11 8.6l1 3 1-3M15.8 7.7l1 2.8 1.2-2.9" />, <path key="t" d="M6 20.5 12 13l6 7.5z" />, <path key="d" d="M12 13v7.5" />]),
  field: () => svg([<path key="s" d="M12 20V7" />, <path key="l" d="M12 8.5c-2-.3-3-1.6-3-3.5 2 .2 3 1.5 3 3.5zM12 8.5c2-.3 3-1.6 3-3.5-2 .2-3 1.5-3 3.5zM12 12.5c-2-.3-3-1.6-3-3.5 2 .2 3 1.5 3 3.5zM12 12.5c2-.3 3-1.6 3-3.5-2 .2-3 1.5-3 3.5zM12 16.5c-2-.3-3-1.6-3-3.5 2 .2 3 1.5 3 3.5zM12 16.5c2-.3 3-1.6 3-3.5-2 .2-3 1.5-3 3.5z" />, <path key="g" d="M4 20.5h16" />]),
  fieldguide: () => svg([<path key="b" d="M5.5 4.5h11a2 2 0 0 1 2 2v13h-11a2 2 0 0 1-2-2z" />, <path key="s" d="M5.5 17.5a2 2 0 0 1 2-2h11" />, <path key="l" d="M9.5 12.5c0-3 2-4.5 4.5-4.5 0 2.8-1.6 4.5-4.5 4.5zM9.5 12.5l2.6-2.6" />]),
  floodplain: () => svg([<path key="r" d="M8.5 11 12 7.5l3.5 3.5" />, <path key="w" d="M3.5 14.5q2.2-1.5 4.5 0t4.5 0 4.5 0 3.5 0M3.5 18.5q2.2-1.5 4.5 0t4.5 0 4.5 0 3.5 0" />]),
  flows: () => svg([<path key="a" d="M4 8.5h11.5M12.5 5.5l3 3-3 3" />, <path key="b" d="M20 15.5H8.5M11.5 12.5l-3 3 3 3" />]),
  guard: () => svg([<path key="p" d="M12 20.5s-5.5-4.6-5.5-9a5.5 5.5 0 0 1 11 0c0 4.4-5.5 9-5.5 9z" />, <path key="s" d="M12 8.2v4.6M10 10.5h4" />]),
  habitats: () => svg([<path key="n" d="M4.5 15c0 2.6 3 4.5 7.5 4.5s7.5-1.9 7.5-4.5z" />, <ellipse key="e" cx="12" cy="11.5" rx="2.4" ry="3.2" />, <path key="t" d="M6 13c-1-2-.8-4 .5-5.5M18 13c1-2 .8-4-.5-5.5" />]),
  heart: () => svg([<path key="h" d="M12 19s-7-4.3-7-9.2A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 1.8C19 14.7 12 19 12 19z" />]),
  home: () => svg([<path key="r" d="M4.5 11 12 5l7.5 6" />, <path key="w" d="M6.5 9.5v9h11v-9" />, <path key="d" d="M10.5 18.5v-4h3v4" />]),
  inspect: () => svg([<circle key="c" cx="10.5" cy="10.5" r="5.5" />, <path key="h" d="m15 15 4.5 4.5" />]),
  land: () => svg([<path key="p" d="M4 17.5 9 14l6 2.5 5-3.5" />, <path key="f" d="M8.5 13V6.5l4 1.5-4 1.5" />, <circle key="c" cx="16.5" cy="9" r="2.3" />]),
  lantern: () => svg([<path key="h" d="M12 3.5v2M9.5 5.5h5" />, <path key="g" d="M8.5 7.5h7l-.8 9.5H9.3z" />, <path key="f" d="M12 10.5c-1 1.2-1 2.6 0 3.5 1-.9 1-2.3 0-3.5z" />, <path key="b" d="M9 19.5h6" />]),
  invite: () => svg([<circle key="a" cx="10" cy="8.5" r="3" />, <path key="b" d="M4.5 19.5c.4-3.6 2.6-5.7 5.5-5.7s5.1 2.1 5.5 5.7" />, <path key="c" d="M18.5 8v5M16 10.5h5" />]),
  letter: () => svg([<rect key="r" x="4" y="6.5" width="16" height="11" rx="1.5" />, <path key="f" d="m4.5 7.5 7.5 6 7.5-6" />]),
  loan: () => svg([<path key="r" d="M4 9.5 12 5l8 4.5" />, <path key="b" d="M5 9.5h14" />, <path key="p" d="M6.5 11v6M10 11v6M14 11v6M17.5 11v6" />, <path key="f" d="M4 19h16" />]),
  lock: () => svg([<rect key="b" x="6" y="11" width="12" height="8.5" rx="1.8" />, <path key="s" d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" />, <path key="k" d="M12 14.5v2" />]),
  map: () => svg([<path key="m" d="m4 6.5 5-2 6 2 5-2v13l-5 2-6-2-5 2z" />, <path key="f" d="M9 4.5v13M15 6.5v13" />, <path key="x" d="m11.2 10.2 1.6 1.6m0-1.6-1.6 1.6" />]),
  market: () => svg([<path key="a" d="M4 9.5 5.5 5h13L20 9.5" />, <path key="s" d="M4 9.5c0 1.4 1.2 2 2 2s2-.6 2-2c0 1.4 1.2 2 2 2s2-.6 2-2c0 1.4 1.2 2 2 2s2-.6 2-2c0 1.4 1.2 2 2 2s2-.6 2-2" />, <path key="p" d="M5.5 11.5v8M18.5 11.5v8M4 19.5h16" />, <path key="c" d="M9.5 19.5v-4.5h5v4.5" />]),
  move: () => svg([<path key="v" d="M12 4v16M4 12h16" />, <path key="n" d="m9.5 6.5 2.5-2.5 2.5 2.5M9.5 17.5l2.5 2.5 2.5-2.5M6.5 9.5 4 12l2.5 2.5M17.5 9.5 20 12l-2.5 2.5" />]),
  needs: () => svg([<path key="r" d="M4.5 11.5 12 5.5l7.5 6" />, <path key="w" d="M6.5 10v9.5h11V10" />, <path key="h" d="M12 17.5s-2.6-1.6-2.6-3.4a1.4 1.4 0 0 1 2.6-.6 1.4 1.4 0 0 1 2.6.6c0 1.8-2.6 3.4-2.6 3.4z" />]),
  note: () => svg([<path key="p" d="M6 4.5h9l3 3v12H6z" />, <path key="l" d="M9 10h6M9 13.5h6M9 17h3.5" />]),
  notebook: () => svg([<path key="b" d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.6.5 1 1.2 1 2v.5h4.4v-.5c0-.8.4-1.5 1-2A5.5 5.5 0 0 0 12 3.5z" />, <path key="s" d="M10 18.5h4M10.7 20.5h2.6" />, <path key="f" d="M11 9.5 12 12l1-2.5" />]),
  path: () => svg([<path key="a" d="M5 20c2-5 4-6 7-8s5-4 6-8" stroke-dasharray="2.5 3" />]),
  patterns: () => svg([<path key="a" d="M12 6.5c-2-1.6-4.6-2-7.5-1.5v13c2.9-.5 5.5-.1 7.5 1.5 2-1.6 4.6-2 7.5-1.5V5c-2.9-.5-5.5-.1-7.5 1.5z" />, <path key="b" d="M12 6.5v13" />, <path key="c" d="M7 9c1 0 2 .2 3 .6M7 12c1 0 2 .2 3 .6M14 9.6c1-.4 2-.6 3-.6" />]),
  pause: () => svg([<path key="a" d="M9 6v12M15 6v12" stroke-width="2.4" />]),
  people: () => svg([<circle key="a" cx="9" cy="8.5" r="2.8" />, <path key="b" d="M3.8 19c.4-3.4 2.4-5.5 5.2-5.5s4.8 2.1 5.2 5.5" />, <circle key="c" cx="16.5" cy="9.5" r="2.2" />, <path key="d" d="M15.5 13.6c2.4-.3 4.3 1.4 4.7 4.4" />]),
  photo: () => svg([<path key="c" d="M4 8.5h3.5l1.5-2.5h6l1.5 2.5H20v10H4z" />, <circle key="l" cx="12" cy="13" r="3.2" />]),
  ping: () => svg([<circle key="a" cx="12" cy="12" r="2.5" />, <path key="b" d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10" />]),
  plan: () => svg([<rect key="s" x="4" y="5" width="16" height="14" rx="1.2" />, <path key="g" d="M4 9.5h16M9 5v14" stroke-dasharray="1.4 2" />, <path key="h" d="M11.5 16.5v-4.5l2.5-2 2.5 2v4.5z" />]),
  play: () => svg([<path key="a" d="M8 5.5v13l10.5-6.5z" />]),
  policies: () => svg([<path key="q" d="M19.5 4c-5 1-8.5 5-9.5 10l1.5 1.5c5-1 9-4.5 10-9.5z" />, <path key="n" d="M10 14 5.5 18.5" />, <path key="l" d="M4 20.5h7" />, <path key="v" d="M14 9.5l-3.5 3.5" />]),
  pond: () => svg([<ellipse key="p" cx="12" cy="14.5" rx="8" ry="4.5" />, <path key="r" d="M9 14q1.5-1 3 0t3 0" />, <path key="g" d="M17.5 10V5.5M19.5 10.5V7M15.8 10.4V8" />]),
  rank: () => svg([<path key="f" d="M6.5 20.5V4" />, <path key="b" d="M6.5 4.5h11l-2.5 3.5 2.5 3.5h-11" />, <path key="g" d="M4.5 20.5h4" />]),
  reports: () => svg([<path key="b" d="M5.5 4.5h10l3 3v12h-13z" />, <path key="c" d="M8.5 16.5v-3M11.5 16.5v-6M14.5 16.5v-4.5" />, <path key="l" d="M8 8h4" />]),
  requests: () => svg([<path key="b" d="M4.5 5.5h10v7h-5L6.5 15v-2.5h-2z" />, <path key="r" d="M14.5 9.5h5v6.5h-1.5V18.5L15 16h-4.5v-1.5" />, <path key="q" d="M8 8h3.5M8 10h2" />]),
  rings: () => svg([<circle key="a" cx="9.5" cy="13.5" r="4.5" />, <circle key="b" cx="14.5" cy="13.5" r="4.5" />, <path key="g" d="m14.5 6 1-1.5 1 1.5-1 1.5z" />]),
  road: () => svg([<path key="a" d="M7 20 10 4M17 20 14 4" />, <path key="b" d="M12 18.5v-2M12 13v-2M12 7.5v-2" />]),
  seaside: () => svg([<circle key="s" cx="15.5" cy="8" r="3" />, <path key="w" d="M3.5 15c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4 .5M3.5 19c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4 .5" />]),
  settings: () => svg([<path key="a" d="M4.5 7.5h2.7M10.8 7.5h8.7M4.5 12h8.7M16.8 12h2.7M4.5 16.5h1.7M9.8 16.5h9.7" />, <circle key="b" cx="9" cy="7.5" r="1.8" />, <circle key="c" cx="15" cy="12" r="1.8" />, <circle key="d" cx="8" cy="16.5" r="1.8" />]),
  snowflake: () => svg([<path key="a" d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5" />, <path key="b" d="m10 5 2 1.5L14 5M10 19l2-1.5 2 1.5" />]),
  soilstone: () => svg([<path key="g" d="M3.5 19h17" />, <path key="s" d="M5.5 19c0-3.2 1.6-5.5 4-5.5s4 2.3 4 5.5z" />, <path key="p" d="M17 19v-5.5M17 14.5c-1.8 0-2.8-1-3-2.5 1.8 0 2.8 1 3 2.5zM17 13.5c1.8 0 2.8-1 3-2.5-1.8 0-2.8 1-3 2.5z" />]),
  spring: () => svg([<path key="s" d="M12 20.5v-9" />, <path key="a" d="M12 12c-4 0-6-2-6-5.5 4 0 6 2 6 5.5z" />, <path key="b" d="M12 15c3.5 0 5.5-1.6 5.5-4.5-3.5 0-5.5 1.6-5.5 4.5z" />]),
  status: () => svg([<path key="b" d="M7 16.5V11a5 5 0 0 1 10 0v5.5l1.5 1.5h-13z" />, <path key="c" d="M10.5 20.5h3" />]),
  stores: () => svg([<path key="r" d="M4 10 12 4.5 20 10v9.5H4z" />, <path key="d" d="M9 19.5v-5h6v5M9 14.5h6" />]),
  street: () => svg([<path key="a" d="M5 20 8 4M19 20 16 4" />, <path key="c" d="M8.5 17.5h3M12.5 17.5h3M9 13.5h2.5M12.5 13.5h2.5M9.7 9.5h2M12.5 9.5h2M10.2 6h1.6M12.4 6h1.4" />]),
  summer: () => svg([<circle key="s" cx="12" cy="12" r="3.4" />, <path key="r" d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />]),
  threat: () => svg([<path key="s" d="M12 3.5 19 6v5.5c0 4-3 7-7 9-4-2-7-5-7-9V6z" />, <path key="e" d="M12 8.5v4M12 15.6v.1" />]),
  trade: () => svg([<path key="s" d="M12 4v15.5" />, <path key="b" d="M8 19.5h8" />, <path key="a" d="M5 7h14" />, <path key="l" d="m5 7-2.5 6h5zM19 7l-2.5 6h5z" />, <path key="t" d="M2.5 13a2.5 1.4 0 0 0 5 0M16.5 13a2.5 1.4 0 0 0 5 0" />]),
  traffic: () => svg([<circle key="w" cx="8" cy="15.5" r="3" />, <path key="s" d="M8 12.5v6M5 15.5h6" />, <path key="b" d="M11 13h7.5l-1-4.5H11z" />, <path key="a" d="M15 19h4.5M17.5 17l2 2-2 2" />]),
  tree: () => svg([<path key="t" d="M12 20v-6" />, <path key="c" d="M12 3.5c-3.5 0-5.5 2.6-5.5 5.4 0 2.8 2.3 5.1 5.5 5.1s5.5-2.3 5.5-5.1c0-2.8-2-5.4-5.5-5.4z" />]),
  trial: () => svg([<circle key="s" cx="12" cy="10" r="5.5" />, <path key="c" d="m9.6 10 1.7 1.7 3.2-3.4" />, <path key="r" d="m9 15 -1.5 5.5L12 18.5l4.5 2-1.5-5.5" />]),
  undo: () => svg([<path key="a" d="M8.5 7 5 10.5 8.5 14" />, <path key="b" d="M5.5 10.5h8a5 5 0 0 1 0 10H10" />]),
  wages: () => svg([<path key="p" d="M8.5 7.5h7l2.5 4.5c1.5 3 0 7.5-6 7.5s-7.5-4.5-6-7.5z" />, <path key="t" d="M9 7.5 7.5 4.5h9L15 7.5" />, <path key="c" d="M12 11v5M10.5 12.2c.4-.9 3-.9 3 .3 0 1.4-3 .8-3 2.2 0 1.2 2.6 1.2 3 .3" />]),
  wall: () => svg([<path key="w" d="M3.5 19.5v-8h17v8" />, <path key="t" d="M3.5 11.5V9h3v2.5M10.5 11.5V9h3v2.5M17.5 11.5V9h3v2.5" />, <path key="c" d="M3.5 15.5h17M8 11.5v4M15 11.5v4M11.5 15.5v4" />]),
  warmth: () => svg([<path key="f" d="M12 20.5c-3.2 0-5-2.1-5-4.8 0-2.6 2-4 2.8-6.2 1 .8 1.6 1.6 1.8 2.6.8-1.3 1.2-3 1-5.1 3 2 5.4 5 5.4 8.7 0 2.7-2 4.8-6 4.8z" />, <path key="i" d="M12 20.5c-1.4 0-2.2-.9-2.2-2 0-1.3 1-1.8 1.5-3 1 .8 2.9 1.7 2.9 3 0 1.1-.8 2-2.2 2z" />]),
  watch: () => svg([<path key="b" d="M5.5 3.5h13v17h-13z" />, <circle key="p" cx="12" cy="5.6" r=".9" />, <path key="l" d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4.5" />]),
  winter: () => svg([<path key="a" d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5" />, <path key="b" d="m10 5 2 1.5L14 5M10 19l2-1.5 2 1.5" />]),
  wishes: () => svg([<path key="s" d="m12 4 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" />]),
  zone: () => svg([<rect key="a" x="4" y="4" width="7" height="7" rx="1" />, <rect key="b" x="13" y="4" width="7" height="7" rx="1" stroke-dasharray="2 1.6" />, <rect key="c" x="4" y="13" width="7" height="7" rx="1" stroke-dasharray="2 1.6" />, <path key="d" d="M13 13h7v7h-7z" />, <path key="h" d="m14.5 18 2-2 2 2" />]),
  zones: () => svg([<rect key="a" x="4.5" y="4.5" width="6.5" height="6.5" rx="1" />, <rect key="b" x="13" y="4.5" width="6.5" height="6.5" rx="1" stroke-dasharray="2 1.8" />, <rect key="c" x="4.5" y="13" width="15" height="6.5" rx="1" />]),
};

// The Cart lane tool's id is "lane"; it wears the cart.
ICONS.lane = ICONS.cart!;

/**
 * A tool's icon: by its id, else by the icon it names. P1 player's chair: Earthworks (id "terrain",
 * icon "earthworks") showed the word "earthworks" in the Ledger's toolbar.
 */
export function toolIcon(id: string, icon: string): (() => JSX.Element) | null {
  return ICONS[id] ?? ICONS[icon] ?? null;
}

export function ToolIcon({ id, fallback }: { id: string; fallback: string }) {
  const icon = toolIcon(id, fallback);
  return icon ? icon() : <>{fallback}</>;
}

/** A small inline icon by id (panels and chips). Unknown ids draw nothing. */
export function Glyph({ id, class: cls }: { id: string; class?: string }) {
  // "good:bread" borrows a good's own portrait (alerts name the good they are about).
  if (id.startsWith('good:')) return <GoodIcon good={id.slice(5)} class={cls} />;
  const icon = ICONS[id];
  return icon ? <span class={`glyph ${cls ?? ''}`}>{icon()}</span> : null;
}

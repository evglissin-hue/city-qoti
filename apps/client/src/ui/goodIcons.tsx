// Little inked portraits of the goods, for the market, trade and request pages. One line-art
// drawing per good id, in the same hand as the toolbar icons; unknown goods fall back to a dot.
import type { JSX } from 'preact';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.6,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

// prettier-ignore
const GOODS: Record<string, JSX.Element[]> = {
  apples: [<path key="a" d="M12 8.5c-1.5-1-5.5-1.3-6.3 2.6-.8 4 1.8 8.4 4.3 8.4.9 0 1.3-.5 2-.5s1.1.5 2 .5c2.5 0 5.1-4.4 4.3-8.4-.8-3.9-4.8-3.6-6.3-2.6z" />, <path key="s" d="M12 8.5c0-1.6.4-3 1.4-4" />, <path key="l" d="M12.6 6.2c1.4-1.6 3.4-1.4 4-.8-.8 1.4-2.6 1.6-4 .8z" />],
  bread: [<path key="l" d="M4 15.5c0-4 3.6-7 8-7s8 3 8 7c0 1.4-.9 2.5-2.2 2.5H6.2C4.9 18 4 16.9 4 15.5z" />, <path key="s" d="m8.5 11 1.5 2.5M11.5 10.5l1.5 2.5M14.5 11l1.5 2.5" />],
  bricks: [<rect key="r" x="4" y="6.5" width="16" height="11" rx="1" />, <path key="m" d="M4 10.2h16M4 13.8h16M9.5 6.5v3.7M15 6.5v3.7M7 10.2v3.6M12.5 10.2v3.6M17.5 10.2v3.6M9.5 13.8v3.7M15 13.8v3.7" />],
  cheese: [<path key="w" d="M4 16.5V12l11-5.5 5 3.5v6.5z" />, <path key="t" d="M4 12h16" />, <circle key="a" cx="8.5" cy="14.5" r="1" />, <circle key="b" cx="14" cy="13.8" r="1.3" />, <circle key="c" cx="17.5" cy="15.6" r=".7" />],
  cider: [<path key="b" d="M10 3.5h4v3c0 1 2 2 2 4.5v8.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V11c0-2.5 2-3.5 2-4.5z" />, <path key="l" d="M8 13h8" />, <path key="a" d="M10.8 15.8a1.2 1.2 0 0 0 2.4 0c0-.8-1.2-1.6-1.2-1.6s-1.2.8-1.2 1.6z" />],
  clay: [<path key="p" d="M6 10.5h12l-1.5 8h-9z" />, <path key="r" d="M5 10.5h14" />, <path key="c" d="M8.5 10.5c.3-2.3 1.6-3.5 3.5-3.5s3.2 1.2 3.5 3.5" />, <path key="h" d="M10 7.5c.4-1 1-1.5 2-1.5" />],
  cloth: [<path key="r" d="M4.5 8.5h12a3 3 0 0 1 0 6h-12z" />, <path key="e" d="M16.5 14.5c-1.6 0-3-1.3-3-3s1.4-3 3-3" />, <path key="t" d="M4.5 14.5v4l3-1.5 3 1.5v-4" />],
  firewood: [<path key="a" d="m4.5 17 13-7M6.5 20l13-7" />, <path key="b" d="m19.5 17-13-7M17.5 20l-13-7" />, <path key="f" d="M12 9.5c-1.5-1.5-.8-3.5 0-5 .4 1.2 2 1.8 2 3.5a2 2 0 0 1-2 1.5z" />],
  fish: [<path key="b" d="M3.5 12c2-3 5-4.5 8.5-4.5S17.5 9.5 19 12c-1.5 2.5-3.5 4.5-7 4.5S5.5 15 3.5 12z" />, <path key="t" d="M19 12l2-3v6z" />, <circle key="e" cx="8" cy="11.2" r=".9" />, <path key="g" d="M11 9.5c.8 1.6.8 3.4 0 5" />],
  flour: [<path key="s" d="M7 7.5c0-1 1-2 1.5-2.5h7c.5.5 1.5 1.5 1.5 2.5v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />, <path key="t" d="M8.5 5c1 .8 2.2 1.2 3.5 1.2S14.5 5.8 15.5 5" />, <path key="w" d="M12 10.5v5M10.2 11.8 12 13l1.8-1.2M10.2 14l1.8 1.2 1.8-1.2" />],
  herbs: [<path key="s" d="M12 20.5V8" />, <path key="a" d="M12 11.5c-2.8 0-4.5-1.8-4.8-4.5 2.8 0 4.5 1.8 4.8 4.5zM12 15c2.8 0 4.5-1.8 4.8-4.5-2.8 0-4.5 1.8-4.8 4.5zM12 8c1.4-.4 2.4-1.8 2.4-3.6-1.4.4-2.4 1.8-2.4 3.6z" />, <path key="r" d="M9 20.5h6" />],
  logs: [<circle key="a" cx="8" cy="15.5" r="3.5" />, <circle key="b" cx="16" cy="15.5" r="3.5" />, <circle key="c" cx="12" cy="8.5" r="3.5" />, <circle key="d" cx="8" cy="15.5" r="1.2" />, <circle key="e" cx="16" cy="15.5" r="1.2" />, <circle key="f" cx="12" cy="8.5" r="1.2" />],
  milk: [<path key="j" d="M9 4.5h6v2.5l2 3v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9l2-3z" />, <path key="l" d="M7 13c1.7-.8 3.3.8 5 0s3.3-.8 5 0" />, <path key="h" d="M17 11c1.6 0 2.5 1 2.5 2.5S18.6 16 17 16" />],
  planks: [<path key="a" d="m4 13 12-6 4 2-12 6z" />, <path key="b" d="M4 13v2.5l4 2 12-6V9" />, <path key="c" d="M8 15v2.5" />, <path key="g" d="m9 10.5 3 1.5M12.5 9l2 1" />],
  stone: [<path key="a" d="M4 17.5c-.3-3.5 1.5-6.5 4.5-7.5 3-.8 5 .8 5.5 3.5.4 2.2-.5 4-1.5 4z" />, <path key="b" d="M12.5 17.5h6.5c1-2-.2-5-2.6-5.5-1.4-.3-2.6.2-3.4 1" />, <path key="c" d="M7 13.5l1.5 1" />],
  tools: [<path key="h" d="M6 19.5 14 11.5" />, <path key="b" d="M12.5 6.5c1.8-1.8 4.2-2.2 6-1.5l-2.5 2.5 1.5 1.5L20 6.5c.7 1.8.3 4.2-1.5 6-1.4 1.4-3.3 1.8-5 1.2" />],
  vegetables: [<path key="c" d="M8.5 9.5c2-1 4.5-.5 5.5 1s.5 4-1.5 5L5 19z" />, <path key="l" d="M13.5 10c.5-2 1.5-4 3.5-5M14 10.5c1.5-1 3.5-1.5 5.5-.8M14 10.5c.2-1.8 0-3.6-.8-5" />, <path key="r" d="m8.5 13 1.3 1M10.5 11.5l1 .8" />],
  wheat: [<path key="s" d="M12 20.5V9" />, <path key="g" d="M12 9c-1.4-.6-2-1.8-2-3.4 1.4.6 2 1.8 2 3.4zm0 0c1.4-.6 2-1.8 2-3.4-1.4.6-2 1.8-2 3.4zM12 12.5c-1.4-.6-2-1.8-2-3.4 1.4.6 2 1.8 2 3.4zm0 0c1.4-.6 2-1.8 2-3.4-1.4.6-2 1.8-2 3.4zM12 16c-1.4-.6-2-1.8-2-3.4 1.4.6 2 1.8 2 3.4zm0 0c1.4-.6 2-1.8 2-3.4-1.4.6-2 1.8-2 3.4z" />, <path key="t" d="M12 6V3.5" />],
  wool: [<path key="c" d="M6.5 16.5a3 3 0 0 1-.5-5.9 3.5 3.5 0 0 1 5.8-3 3.5 3.5 0 0 1 6.2 2 3 3 0 0 1-.5 6.9z" />, <path key="k" d="M9 12.5c.8-.8 1.8-.8 2.5 0M13 12c.8-.8 1.8-.8 2.5 0" />],
  yarn: [<circle key="b" cx="11" cy="12.5" r="6" />, <path key="w" d="M6.5 9.5c3 0 6.5 2 8.5 6.5M5.5 13.5c3-.5 6 .5 8 4M8.5 7.5c3.5 1 6 3.5 8 7.5" />, <path key="t" d="M16.5 15.5c1.5 1.5 2.5 3 4 3.5" />],
};

/** A good's little portrait in its ink, sized by the surrounding font. */
export function GoodIcon({ good, class: cls }: { good: string; class?: string }) {
  const parts = GOODS[good];
  return (
    <span class={`good-icon good-${good} ${cls ?? ''}`} aria-hidden="true">
      {parts ? (
        <svg viewBox="0 0 24 24" {...S}>
          {parts}
        </svg>
      ) : (
        <i class="good-dot" />
      )}
    </span>
  );
}

/** True when the good has its own drawing. */
export function hasGoodIcon(good: string): boolean {
  return good in GOODS;
}

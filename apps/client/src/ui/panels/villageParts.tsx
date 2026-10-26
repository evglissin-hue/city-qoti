// Small shared pieces for the village panels (I2, C4F): an inked price chart, steppers, coin
// amounts, lane tags and a dial. Same paper and ink as parts.tsx.
import type { ComponentChildren } from 'preact';
import { Glyph } from '../icons';
import { LANE_WORD, priceText } from '../village';

/** "2.6" with a little coin in front. */
export function Price({ pennies, class: cls }: { pennies: number; class?: string }) {
  return (
    <span class={`price ${cls ?? ''}`}>
      <Glyph id="coin" />
      {priceText(pennies)}
    </span>
  );
}

/** A lane's colored tag: Hearth, Ledger or Together. */
export function LaneTag({ lane }: { lane: 'hearth' | 'ledger' | 'shared' }) {
  return <span class={`lane-tag ${lane}`}>{LANE_WORD[lane]}</span>;
}

/** A value with minus and plus buttons. `format` shows it; `onChange` gets the next value. */
export function Stepper({
  value,
  min,
  max,
  step,
  format,
  onChange,
  testid,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => ComponentChildren;
  onChange: (v: number) => void;
  testid?: string;
  label?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <span class="stepper" data-testid={testid} role="group" aria-label={label}>
      <button
        type="button"
        class="step"
        aria-label="Less"
        disabled={value <= min}
        data-testid={testid ? `${testid}-less` : undefined}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <b class="step-value">{format ? format(value) : value}</b>
      <button
        type="button"
        class="step"
        aria-label="More"
        disabled={value >= max}
        data-testid={testid ? `${testid}-more` : undefined}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </span>
  );
}

/** A row of choices, one pressed (wage levels, tax rates, loan sizes). */
export function Dial<T extends string | number>({
  options,
  value,
  onChange,
  testid,
  label,
}: {
  options: readonly { value: T; label: ComponentChildren; title?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  testid?: string;
  label?: string;
}) {
  return (
    <div class="dial village-dial" role="radiogroup" aria-label={label} data-testid={testid}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          class={value === o.value ? 'active' : ''}
          title={o.title}
          disabled={o.disabled}
          data-testid={testid ? `${testid}-${o.value}` : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Daily prices drawn large: an inked line with a soft wash under it, the usual price as a dashed
 * rule, a cap as a rose rule, and today's price as a dot with its value.
 */
export function PriceChart({
  values,
  base,
  cap = 0,
  width = 320,
  height = 128,
}: {
  values: number[];
  base: number;
  cap?: number;
  width?: number;
  height?: number;
}) {
  const padL = 30;
  const padR = 34;
  const padT = 10;
  const padB = 18;
  const all = [...values, base, ...(cap > 0 ? [cap] : [])];
  const top = Math.max(...all) * 1.12;
  const bottom = Math.max(0, Math.min(...all) * 0.8);
  const span = top - bottom || 1;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const x = (i: number) => padL + (values.length < 2 ? iw : (i / (values.length - 1)) * iw);
  const y = (v: number) => padT + ih - ((v - bottom) / span) * ih;
  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = last ? `${d} L${last[0].toFixed(1)} ${padT + ih} L${padL} ${padT + ih} Z` : '';
  const ticks = [bottom + span * 0.15, bottom + span * 0.5, bottom + span * 0.85];
  const days = values.length;
  return (
    <svg
      class="price-chart"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Price over the last ${days} ${days === 1 ? 'day' : 'days'}`}
      data-testid="price-chart"
    >
      <defs>
        <linearGradient id="price-wash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--ochre)" stop-opacity="0.32" />
          <stop offset="100%" stop-color="var(--ochre)" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t} class="chart-grid">
          <line x1={padL} x2={padL + iw} y1={y(t)} y2={y(t)} />
          <text x={padL - 5} y={y(t) + 3.5} text-anchor="end">
            {priceText(t)}
          </text>
        </g>
      ))}
      <line class="chart-axis" x1={padL} x2={padL + iw} y1={padT + ih} y2={padT + ih} />
      <g class="chart-base">
        <line x1={padL} x2={padL + iw} y1={y(base)} y2={y(base)} />
        <text x={padL + iw + 4} y={y(base) + 3.5}>
          usual
        </text>
      </g>
      {cap > 0 && (
        <g class="chart-cap">
          <line x1={padL} x2={padL + iw} y1={y(cap)} y2={y(cap)} />
          <text x={padL + iw + 4} y={y(cap) + 3.5}>
            cap
          </text>
        </g>
      )}
      {area && <path d={area} fill="url(#price-wash)" />}
      {d && <path class="chart-line" d={d} />}
      {last && <circle class="chart-dot" cx={last[0]} cy={last[1]} r="3.2" />}
      <text class="chart-x" x={padL} y={height - 4}>
        {days > 1 ? `${days - 1} ${days === 2 ? 'day' : 'days'} ago` : ''}
      </text>
      <text class="chart-x" x={padL + iw} y={height - 4} text-anchor="end">
        today
      </text>
    </svg>
  );
}

/** A soft banner for things that are not open yet ("Zoning comes with the Village Charter"). */
export function Locked({ children, testid }: { children: ComponentChildren; testid?: string }) {
  return (
    <p class="locked-note" data-testid={testid}>
      <Glyph id="lock" />
      <span>{children}</span>
    </p>
  );
}

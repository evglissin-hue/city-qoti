// I3 (C5F): small inked illustrations for the season pages: a vignette per season for the almanac
// headers, weather glyphs for the top bar and forecast, line art per kind of creature for the Field
// Guide, a compass arrow for a coming raid, wax seals and stars. Plain SVG in the ink of the panels.
import type { RaidSide, WeatherKind } from '@qoti/sim';

const INK = 'var(--ink-line)';

/** A season's header vignette: blossom, sun and lanterns, sheaves, a snowy roof. */
export function SeasonVignette({ season, class: cls }: { season: number; class?: string }) {
  return (
    <svg class={`season-vignette s${season} ${cls ?? ''}`} viewBox="0 0 220 70" aria-hidden="true">
      <path d="M0 58 Q55 48 110 56 T220 54 V70 H0Z" class="v-ground" />
      {season === 0 && (
        <g>
          <path d="M40 58 V34" stroke={INK} stroke-width="2" />
          {[
            [40, 30],
            [32, 36],
            [48, 36],
            [36, 26],
            [45, 25],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" class="v-blossom" stroke={INK} stroke-width="1" />
          ))}
          <path d="M150 58 V40 M150 44 l-8 -6 M150 48 l9 -7" stroke={INK} stroke-width="1.6" fill="none" />
          <path d="M96 22 q5 -6 10 0 q5 -6 10 0" stroke={INK} stroke-width="1.4" fill="none" />
          <path d="M178 30 q4 -5 8 0 q4 -5 8 0" stroke={INK} stroke-width="1.2" fill="none" />
        </g>
      )}
      {season === 1 && (
        <g>
          <circle cx="182" cy="20" r="11" class="v-sun" stroke={INK} stroke-width="1.2" />
          <path d="M20 26 Q110 44 200 26" stroke={INK} stroke-width="1" fill="none" />
          {[44, 76, 108, 140, 172].map((x, i) => (
            <g key={i}>
              <path d={`M${x} ${30 + (i % 2) * 3} v6`} stroke={INK} stroke-width="1" />
              <ellipse
                cx={x}
                cy={40 + (i % 2) * 3}
                rx="5"
                ry="6"
                class="v-lantern"
                stroke={INK}
                stroke-width="1"
              />
            </g>
          ))}
        </g>
      )}
      {season === 2 && (
        <g>
          {[50, 74, 150].map((x, i) => (
            <g key={i}>
              <path
                d={`M${x} 58 L${x - 8} 30 M${x} 58 L${x} 26 M${x} 58 L${x + 8} 30`}
                stroke={INK}
                stroke-width="1.6"
              />
              <path d={`M${x - 7} 46 h14`} stroke={INK} stroke-width="2.4" class="v-band" />
            </g>
          ))}
          <circle cx="112" cy="50" r="8" class="v-apple" stroke={INK} stroke-width="1.2" />
          <path d="M112 42 q2 -5 6 -5" stroke={INK} stroke-width="1.2" fill="none" />
          <path d="M184 22 l4 6 l-6 1z M196 34 l3 5 l-5 0z" class="v-leaf" stroke={INK} stroke-width="0.8" />
        </g>
      )}
      {season === 3 && (
        <g>
          <path d="M80 58 V38 L110 18 L140 38 V58Z" class="v-house" stroke={INK} stroke-width="1.6" />
          <path d="M74 40 L110 14 L146 40" class="v-snowroof" stroke={INK} stroke-width="1.6" fill="none" />
          <rect x="102" y="42" width="12" height="10" class="v-window" stroke={INK} stroke-width="1.2" />
          <path d="M128 24 v-10 h6 v14" class="v-house" stroke={INK} stroke-width="1.2" />
          <path
            d="M131 10 q-4 -5 1 -9 q4 -3 0 -7"
            stroke={INK}
            stroke-width="0.9"
            fill="none"
            class="v-smoke"
          />
          {[
            [24, 18],
            [46, 30],
            [176, 16],
            [196, 34],
            [160, 44],
            [30, 44],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.8" class="v-flake" />
          ))}
        </g>
      )}
    </svg>
  );
}

/** A weather glyph, line art. */
export function WeatherGlyph({ kind, class: cls }: { kind: WeatherKind; class?: string }) {
  const cloud = <path d="M6 16 a4 4 0 0 1 1 -8 a5 5 0 0 1 9 -1 a4 4 0 0 1 2 9z" class="w-cloud" />;
  return (
    <svg
      class={`weather-glyph w-${kind} ${cls ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {kind === 'clear' && (
        <>
          <circle cx="12" cy="12" r="4" class="w-sun" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
        </>
      )}
      {kind === 'cloudy' && cloud}
      {kind === 'rain' && (
        <>
          {cloud}
          <path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" />
        </>
      )}
      {kind === 'storm' && (
        <>
          {cloud}
          <path d="M12 17l-2 3h3l-2 3" />
        </>
      )}
      {kind === 'fog' && <path d="M4 9h16M3 13h18M5 17h14" />}
      {kind === 'snow' && (
        <>
          {cloud}
          <path d="M8 20h.01M12 21h.01M16 20h.01M10 22.5h.01M14 22.5h.01" stroke-width="2.4" />
        </>
      )}
      {kind === 'heat' && (
        <>
          <circle cx="12" cy="9" r="4" class="w-sun" />
          <path d="M6 18q2 -2 4 0t4 0t4 0M6 21q2 -2 4 0t4 0t4 0" />
        </>
      )}
    </svg>
  );
}

/** Line art for a Field Guide page by kind of creature (C5C's content names the species). */
export function CreatureArt({ kind, seed = 0 }: { kind: string; seed?: number }) {
  const tilt = (seed % 7) - 3;
  return (
    <svg class={`creature-art k-${kind || 'bird'}`} viewBox="0 0 120 90" aria-hidden="true">
      <g
        transform={`rotate(${tilt} 60 45)`}
        fill="none"
        stroke={INK}
        stroke-width="1.5"
        stroke-linecap="round"
      >
        {(kind === 'bird' || !kind) && (
          <>
            <path
              d="M30 52 q10 -24 36 -18 q14 3 22 -6 q-2 12 -12 16 q-4 18 -26 18 q-12 0 -20 -10z"
              class="c-fill"
            />
            <circle cx="78" cy="34" r="1.8" fill={INK} />
            <path d="M86 32 l8 2 l-8 2" />
            <path d="M40 54 q-12 6 -18 2 q8 -2 10 -8" />
            <path d="M56 68 v8 M64 68 v8 M52 76 h8 M60 76 h8" />
            <path d="M42 46 q12 -6 22 0" />
          </>
        )}
        {kind === 'insect' && (
          <>
            <ellipse cx="60" cy="48" rx="8" ry="16" class="c-fill" />
            <path d="M52 40 q-30 -20 -28 6 q2 16 28 2 M68 40 q30 -20 28 6 q-2 16 -28 2" class="c-wing" />
            <path d="M56 32 q-4 -10 -10 -12 M64 32 q4 -10 10 -12" />
            <path d="M54 50 h12 M54 56 h12" />
          </>
        )}
        {kind === 'amphibian' && (
          <>
            <path d="M34 56 q0 -20 26 -22 q26 2 26 22 q-26 10 -52 0z" class="c-fill" />
            <circle cx="50" cy="36" r="5" class="c-fill" />
            <circle cx="70" cy="36" r="5" class="c-fill" />
            <path d="M34 56 q-10 6 -12 14 M86 56 q10 6 12 14 M44 60 q2 6 6 8 M76 60 q-2 6 -6 8" />
          </>
        )}
        {kind === 'fish' && (
          <>
            <path d="M24 46 q24 -22 56 0 q-32 22 -56 0z" class="c-fill" />
            <path d="M80 46 l16 -12 v24z" />
            <circle cx="36" cy="44" r="1.8" fill={INK} />
            <path d="M48 38 q6 8 0 16" />
          </>
        )}
        {kind === 'mammal' && (
          <>
            <path d="M28 60 q0 -24 30 -24 q24 0 30 16 q8 0 10 8 q-30 10 -70 0z" class="c-fill" />
            <path d="M84 44 l4 -10 l4 10" />
            <circle cx="92" cy="50" r="1.6" fill={INK} />
            <path d="M28 58 q-14 -4 -16 -16" />
          </>
        )}
      </g>
    </svg>
  );
}

/** An arrow at the edge of the map pointing the way a raid will come. */
export function CompassArrow({ side }: { side: RaidSide }) {
  const rot = { n: 0, e: 90, s: 180, w: 270 }[side];
  return (
    <svg class="compass" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="var(--paper-light)" stroke={INK} stroke-width="1.4" />
      <g transform={`rotate(${rot} 20 20)`}>
        <path d="M20 6 L26 22 L20 19 L14 22Z" fill="var(--ochre)" stroke={INK} stroke-width="1.2" />
        <path d="M20 34 L24 24 L20 25 L16 24Z" fill="none" stroke={INK} stroke-width="1" />
      </g>
      <text x="20" y="5.5" text-anchor="middle" font-size="5" fill={INK}>
        N
      </text>
    </svg>
  );
}

/** A wax seal: pressed on a passed trial, left blank on one still to come. */
export function Seal({ pressed, label }: { pressed: boolean; label?: string }) {
  return (
    <svg class={`seal ${pressed ? 'pressed' : 'blank'}`} viewBox="0 0 60 60" role="img" aria-label={label}>
      <path
        d="M30 4 l6 5 l8 -1 l3 7 l7 3 l-1 8 l5 6 l-5 6 l1 8 l-7 3 l-3 7 l-8 -1 l-6 5 l-6 -5 l-8 1 l-3 -7 l-7 -3 l1 -8 l-5 -6 l5 -6 l-1 -8 l7 -3 l3 -7 l8 1z"
        class="seal-wax"
        stroke={INK}
        stroke-width="1.2"
      />
      <circle cx="30" cy="30" r="14" fill="none" stroke={INK} stroke-width="1" class="seal-ring" />
      {pressed && (
        <path d="M22 30 l6 6 l11 -12" fill="none" stroke={INK} stroke-width="2.4" stroke-linecap="round" />
      )}
    </svg>
  );
}

/** Up to five stars, filled to `n`. */
export function Stars({ n, of = 5, testid }: { n: number; of?: number; testid?: string }) {
  return (
    <span class="stars" aria-label={`${n} of ${of} stars`} data-testid={testid} data-stars={n}>
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" class={i < n ? 'on' : 'off'} aria-hidden="true">
          <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
        </svg>
      ))}
    </span>
  );
}

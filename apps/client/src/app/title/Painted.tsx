// P3D: the painted backdrop. It shows at once, before any script for the live valley has loaded, and
// stays when there is no WebGL. Layered sage hills, a river, a small village in the hand of the
// title's cottage mark, a sky that goes from blue to a warm horizon by day and from deep blue to rose
// and amber at dusk, with windows lit. The upper third is left clear for a wordmark.
import type { JSX } from 'preact';
import type { TitleLight } from './shared';

interface Palette {
  sky: [number, string][];
  glow: string;
  glowAt: [number, number];
  far: string;
  farTop: string;
  mid: string;
  midTop: string;
  near: string;
  nearer: string;
  water: [string, string];
  waterShine: string;
  wall: string;
  wallShade: string;
  roofs: string[];
  door: string;
  window: string;
  smoke: string;
  leaf: [string, string, string];
  ink: string;
  cloud: string;
}

const DAY: Palette = {
  sky: [
    [0, '#8dc1e3'],
    [0.28, '#a9d3e8'],
    [0.5, '#cfe6e6'],
    [0.66, '#f3e6c4'],
    [0.78, '#f6dcae'],
  ],
  glow: '#fff1c4',
  glowAt: [1180, 480],
  far: '#b3cdc0',
  farTop: '#c2d8cc',
  mid: '#a3c394',
  midTop: '#bcd5a6',
  near: '#8db27c',
  nearer: '#7ba46a',
  water: ['#9bd0e4', '#7fb9d6'],
  waterShine: '#e6f6fa',
  wall: '#fbf1dc',
  wallShade: '#ecdcba',
  roofs: ['#d98a76', '#c97b5e', '#b99062', '#8aa3b4'],
  door: '#c48a3f',
  window: '#f5d98a',
  smoke: '#9a8a7a',
  leaf: ['#9dbb84', '#a9c48e', '#86a96f'],
  ink: '#5a4231',
  cloud: '#ffffff',
};

const DUSK: Palette = {
  sky: [
    [0, '#18254f'],
    [0.26, '#2c3a73'],
    [0.46, '#6a5489'],
    [0.62, '#c9778a'],
    [0.74, '#f0a273'],
    [0.82, '#f6c77f'],
  ],
  glow: '#ffd89a',
  glowAt: [1060, 520],
  far: '#5f5f93',
  farTop: '#7a6a9c',
  mid: '#4f6585',
  midTop: '#7b6f93',
  near: '#3f5a62',
  nearer: '#2f4a4c',
  water: ['#d98a8e', '#6d70a6'],
  waterShine: '#f6c9a2',
  wall: '#d9c3b6',
  wallShade: '#b39aa0',
  roofs: ['#a8596a', '#94566a', '#8c7060', '#566c8a'],
  door: '#7a5a46',
  window: '#f5d98a',
  smoke: '#b8a0b0',
  leaf: ['#4b6a62', '#55766a', '#3e5c56'],
  ink: '#2f2a45',
  cloud: '#f0a8a0',
};

interface CottageProps {
  x: number;
  y: number;
  s: number;
  roof: string;
  p: Palette;
  lit: boolean;
  flip?: boolean;
  smoke?: boolean;
  delay?: number;
}

/** The cottage mark's house (92 x 64 box), placed with its foot at (x, y), `s` times the size. */
function Cottage({ x, y, s, roof, p, lit, flip, smoke, delay = 0 }: CottageProps): JSX.Element {
  const sx = flip ? -s : s;
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${s}) translate(-46 -58)`}>
      <ellipse cx="46" cy="58" rx="34" ry="4" fill={p.ink} opacity="0.16" stroke="none" />
      <g
        fill="none"
        stroke={p.ink}
        stroke-width={1.7 / s}
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.96"
      >
        <path d="M26 56 V 32 L 46 16 L 66 32 V 56 Z" fill={p.wall} />
        <path d="M46 16 L 66 32 V 56 H 56 Z" fill={p.wallShade} stroke="none" opacity="0.55" />
        <path d="M22 34 L 46 13 L 70 34" fill={roof} />
        <path d="M40 56 V 43 a 6 6 0 0 1 12 0 V 56" fill={p.door} />
        {lit && (
          <>
            <circle cx="33.5" cy="40.5" r="11" fill={p.window} opacity="0.34" stroke="none" />
            <circle cx="58.5" cy="40.5" r="11" fill={p.window} opacity="0.34" stroke="none" />
          </>
        )}
        <rect x="30" y="37" width="7" height="7" rx="1.5" fill={p.window} />
        <rect x="55" y="37" width="7" height="7" rx="1.5" fill={p.window} />
        <path d="M58 22 V 12 h 6 V 27" fill={p.wall} />
      </g>
      {smoke && (
        <g
          class="painted-smoke"
          style={{ 'animation-delay': `${delay}s` }}
          fill="none"
          stroke={p.smoke}
          stroke-width={2.4 / s}
          stroke-linecap="round"
          opacity="0.75"
        >
          <path d="M61 9 c -4 -3, 4 -6, 0 -10 c -4 -4, 4 -7, 0 -11" />
        </g>
      )}
    </g>
  );
}

interface TreeProps {
  x: number;
  y: number;
  s: number;
  p: Palette;
  tone?: 0 | 1 | 2;
  lit?: boolean;
}

/** A round tree in the cottage mark's hand. */
function Tree({ x, y, s, p, tone = 0 }: TreeProps): JSX.Element {
  const c = p.leaf[tone]!;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="9" ry="2.4" fill={p.ink} opacity="0.14" />
      <path d="M0 0 V -9" stroke={p.ink} stroke-width={1.6} stroke-linecap="round" fill="none" />
      <circle cx="0" cy="-17" r="9.5" fill={c} stroke={p.ink} stroke-width="1.4" />
      <circle cx="-3" cy="-20" r="4.2" fill="#ffffff" opacity="0.14" />
    </g>
  );
}

function Stars(): JSX.Element {
  // A fixed scatter, so a repaint never moves them; the clearest sky is up here.
  const pts: [number, number, number][] = [
    [140, 90, 1.6],
    [310, 160, 1.2],
    [420, 60, 1.8],
    [560, 130, 1.2],
    [690, 70, 1.4],
    [820, 180, 1.1],
    [930, 50, 1.7],
    [1040, 120, 1.3],
    [1180, 70, 1.9],
    [1290, 160, 1.2],
    [1400, 90, 1.5],
    [1500, 200, 1.2],
    [220, 250, 1.1],
    [980, 250, 1.1],
    [1340, 280, 1.3],
    [60, 190, 1.3],
    [760, 280, 1],
    [1520, 60, 1.6],
  ];
  return (
    <g fill="#fff6dc">
      {pts.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} opacity={0.5 + (i % 4) * 0.12} />
      ))}
    </g>
  );
}

function Clouds({ p, dusk }: { p: Palette; dusk: boolean }): JSX.Element {
  const o = dusk ? 0.5 : 0.85;
  return (
    <g fill={p.cloud} opacity={o}>
      <g class="painted-cloud">
        <ellipse cx="250" cy="250" rx="130" ry="26" />
        <ellipse cx="320" cy="232" rx="80" ry="22" />
        <ellipse cx="190" cy="236" rx="60" ry="18" />
      </g>
      <g class="painted-cloud slow">
        <ellipse cx="1330" cy="190" rx="110" ry="22" />
        <ellipse cx="1400" cy="174" rx="64" ry="18" />
      </g>
      <ellipse cx="760" cy="395" rx="150" ry="14" opacity="0.7" />
    </g>
  );
}

export function Painted({ light }: { light: TitleLight }): JSX.Element {
  const dusk = light === 'dusk';
  const p = dusk ? DUSK : DAY;
  return (
    <svg
      class="painted"
      data-light={light}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="pt-sky" x1="0" y1="0" x2="0" y2="1">
          {p.sky.map(([at, c]) => (
            <stop key={at} offset={at} stop-color={c} />
          ))}
        </linearGradient>
        <radialGradient id="pt-glow" cx={p.glowAt[0]} cy={p.glowAt[1]} r="620" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color={p.glow} stop-opacity={dusk ? 0.85 : 0.9} />
          <stop offset="0.35" stop-color={p.glow} stop-opacity={dusk ? 0.35 : 0.4} />
          <stop offset="1" stop-color={p.glow} stop-opacity="0" />
        </radialGradient>
        <linearGradient id="pt-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={p.midTop} />
          <stop offset="0.35" stop-color={p.mid} />
          <stop offset="1" stop-color={p.near} />
        </linearGradient>
        <linearGradient id="pt-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={p.water[0]} />
          <stop offset="1" stop-color={p.water[1]} />
        </linearGradient>
        <linearGradient id="pt-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={p.sky[p.sky.length - 1]![1]} stop-opacity="0" />
          <stop offset="1" stop-color={p.sky[p.sky.length - 1]![1]} stop-opacity={dusk ? 0.5 : 0.6} />
        </linearGradient>
        <filter id="pt-glow-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {/* A faint film of noise over the sky, so the long gradients never band. */}
        <filter id="pt-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill="url(#pt-sky)" />
      <rect width="1600" height="900" fill="url(#pt-glow)" />
      {dusk && <Stars />}
      <Clouds p={p} dusk={dusk} />

      {/* Far hills, blue with distance. */}
      <path
        d="M-40 520 C 80 470, 190 440, 320 462 C 430 480, 520 430, 650 424 C 760 420, 830 470, 950 458 C 1070 446, 1150 400, 1280 410 C 1400 420, 1500 460, 1640 436 V 640 H -40 Z"
        fill={p.far}
      />
      <path
        d="M-40 540 C 120 500, 250 520, 380 500 C 520 478, 600 520, 740 512 C 880 504, 960 470, 1100 480 C 1240 490, 1400 530, 1640 500 V 640 H -40 Z"
        fill={p.farTop}
        opacity="0.9"
      />
      <rect y="420" width="1600" height="230" fill="url(#pt-haze)" />

      {/* The valley floor the village sits on. */}
      <path
        d="M-40 590 C 140 560, 300 566, 470 548 C 640 530, 760 556, 940 546 C 1110 536, 1250 552, 1400 540 C 1500 532, 1580 540, 1640 546 V 900 H -40 Z"
        fill="url(#pt-floor)"
      />

      {/* The river, narrow far off and wide near, with a little shine on it. */}
      <path
        d="M896 548 C 884 572, 840 590, 846 612 C 852 640, 940 650, 920 690 C 900 730, 780 740, 770 790 C 762 840, 840 860, 820 900 H 1180 C 1160 860, 1120 830, 1140 790 C 1160 744, 1060 716, 1050 680 C 1040 640, 1010 620, 960 604 C 934 592, 912 566, 906 548 Z"
        fill="url(#pt-water)"
      />
      <path
        d="M896 548 C 884 572, 840 590, 846 612 C 852 640, 940 650, 920 690 C 900 730, 780 740, 770 790 C 762 840, 840 860, 820 900"
        fill="none"
        stroke={p.waterShine}
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.5"
      />
      <g fill="none" stroke={p.waterShine} stroke-width="3" stroke-linecap="round" opacity="0.6">
        <path d="M900 640 q 26 -6 52 0" />
        <path d="M880 700 q 34 -8 70 0" />
        <path d="M960 760 q 30 -8 60 0" />
        <path d="M900 830 q 40 -10 84 0" />
      </g>

      {/* The village: three rows, small and far to larger and near, trees between, a bridge. */}
      <g>
        {[
          [350, 566, 0.8, 1],
          [452, 570, 0.9, 0],
          [1380, 568, 0.9, 2],
          [1450, 574, 1, 1],
          [1010, 578, 0.8, 0],
          [800, 580, 0.9, 1],
          [560, 650, 1.3, 2],
          [1330, 648, 1.4, 1],
        ].map(([x, y, s, t], i) => (
          <Tree key={`t${i}`} x={x!} y={y!} s={s!} p={p} tone={t as 0 | 1 | 2} />
        ))}
        <Cottage x={520} y={576} s={0.95} roof={p.roofs[0]!} p={p} lit={dusk} smoke delay={0} />
        <Cottage x={632} y={568} s={0.82} roof={p.roofs[2]!} p={p} lit={dusk} flip />
        <Cottage x={724} y={578} s={0.92} roof={p.roofs[1]!} p={p} lit={dusk} smoke delay={-3} />
        <Cottage x={1070} y={572} s={0.84} roof={p.roofs[3]!} p={p} lit={dusk} flip smoke delay={-5} />
        <Cottage x={1170} y={580} s={0.96} roof={p.roofs[0]!} p={p} lit={dusk} />
        <Cottage x={1272} y={570} s={0.8} roof={p.roofs[1]!} p={p} lit={dusk} flip smoke delay={-8} />
        <Cottage x={470} y={650} s={1.35} roof={p.roofs[1]!} p={p} lit={dusk} flip smoke delay={-2} />
        <Cottage x={640} y={664} s={1.5} roof={p.roofs[3]!} p={p} lit={dusk} />
        <Cottage x={780} y={650} s={1.25} roof={p.roofs[0]!} p={p} lit={dusk} flip smoke delay={-6} />
        <Cottage x={1060} y={668} s={1.45} roof={p.roofs[2]!} p={p} lit={dusk} smoke delay={-4} />
        <Cottage x={1190} y={654} s={1.3} roof={p.roofs[0]!} p={p} lit={dusk} flip />
        <Cottage x={1310} y={672} s={1.55} roof={p.roofs[1]!} p={p} lit={dusk} smoke delay={-7} />
        {/* A little bridge over the river. */}
        <path
          d="M836 636 q 44 -22 96 -4"
          fill="none"
          stroke={p.ink}
          stroke-width="4.5"
          stroke-linecap="round"
        />
        <path
          d="M836 640 q 44 -22 96 -4"
          fill="none"
          stroke={p.roofs[2]}
          stroke-width="5"
          stroke-linecap="round"
        />
      </g>

      {/* Nearer hills, with the village's front row of trees and a track. */}
      <path
        d="M-40 700 C 80 650, 210 640, 350 668 C 480 694, 560 740, 700 760 C 760 768, 800 790, 800 900 H -40 Z"
        fill={p.near}
      />
      <path
        d="M1640 690 C 1520 640, 1400 636, 1290 672 C 1190 704, 1150 744, 1110 790 C 1090 820, 1090 860, 1096 900 H 1640 Z"
        fill={p.near}
      />
      <path d="M-40 790 C 100 760, 230 770, 340 810 C 420 838, 480 870, 520 900 H -40 Z" fill={p.nearer} />
      <path
        d="M1640 800 C 1540 770, 1430 786, 1350 826 C 1300 850, 1270 880, 1260 900 H 1640 Z"
        fill={p.nearer}
      />
      <path
        d="M330 700 C 400 720, 470 760, 560 790"
        fill="none"
        stroke={dusk ? '#8a7a82' : '#ecd9ae'}
        stroke-width="5"
        stroke-linecap="round"
        opacity="0.8"
      />
      <Tree x={150} y={690} s={2.0} p={p} tone={0} />
      <Tree x={250} y={680} s={1.6} p={p} tone={1} />
      <Tree x={60} y={760} s={2.6} p={p} tone={2} />
      <Tree x={410} y={780} s={1.9} p={p} tone={1} />
      <Tree x={1500} y={700} s={2.2} p={p} tone={1} />
      <Tree x={1400} y={706} s={1.5} p={p} tone={0} />
      <Tree x={1540} y={800} s={2.8} p={p} tone={2} />
      <Tree x={1300} y={800} s={2} p={p} tone={0} />

      {/* Dusk lamps along the front: a few warm points. */}
      {dusk && (
        <g fill={p.window}>
          {[
            [420, 700],
            [700, 700],
            [1000, 690],
            [1240, 700],
            [830, 640],
            [950, 640],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="14" opacity="0.22" filter="url(#pt-glow-blur)" />
              <circle cx={x} cy={y} r="3" opacity="0.95" />
            </g>
          ))}
        </g>
      )}

      <rect
        width="1600"
        height="900"
        filter="url(#pt-grain)"
        opacity={dusk ? 0.1 : 0.075}
        style={{ 'mix-blend-mode': 'overlay' }}
      />
    </svg>
  );
}

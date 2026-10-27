// Residents: the seven woodland folk from one parametric body (docs/spec/17-presentation.md,
// "Residents"). About 0.3 tile tall with storybook proportions: a round body in a little vest, a
// big head, and species parts (ears, snouts, tails, stripes, spines). Fur and clothes are tinted
// per instance (see rig.ts paint channels), so one mesh per species and level of detail serves the
// whole town. Hats, aprons and scarves are separate meshes worn on top, by job and tier.
import type { BufferGeometry } from 'three';
import { seeded, type V3 } from '../geometry';
import { palette } from '../palette';
import { PAINT, RIG, RigBuilder, type Channel, type Rig } from '../rig';
import type { Kit } from './types';

export type SpeciesId = 'badger' | 'fox' | 'hedgehog' | 'mouse' | 'otter' | 'rabbit' | 'squirrel';
export type ResidentDetail = 'full' | 'simple' | 'dot';
export type HatKind =
  'baker' | 'beret' | 'bowler' | 'cap' | 'captain' | 'felt' | 'souwester' | 'straw' | 'top' | 'wide';
/**
 * C4E: story characters' signature pieces (a satchel, a long scarf, goggles, a lute, a shawl) and
 * the sling a parent carries a baby in.
 */
export type ExtraKind =
  | 'apron'
  | 'bow'
  | 'goggles'
  | 'kerchief'
  | 'longscarf'
  | 'lute'
  | 'overalls'
  | 'satchel'
  | 'scarf'
  | 'shawl'
  | 'skirt'
  | 'sling'
  | `hat:${HatKind}`;

export const SPECIES_IDS: readonly SpeciesId[] = [
  'badger',
  'fox',
  'hedgehog',
  'mouse',
  'otter',
  'rabbit',
  'squirrel',
];
export const HAT_KINDS: readonly HatKind[] = [
  'baker',
  'beret',
  'bowler',
  'cap',
  'captain',
  'felt',
  'souwester',
  'straw',
  'top',
  'wide',
];
export const EXTRA_KINDS: readonly ExtraKind[] = [
  'apron',
  'bow',
  'goggles',
  'kerchief',
  'longscarf',
  'lute',
  'overalls',
  'satchel',
  'scarf',
  'shawl',
  'skirt',
  'sling',
  ...HAT_KINDS.map((h) => `hat:${h}` as const),
];

interface SpeciesArt {
  /** Body proportions (x, y, z), applied by the instance matrix so clothes fit too. */
  scale: V3;
  /** Fur palettes: [main, light]. A resident's look seed picks one. */
  furs: [number, number][];
  /** Snout length and width factor. */
  snout: [number, number];
  nose: number;
  /** Paws and feet: null for fur colored. */
  socks: number | null;
}

const INK = 0x2a221c;
const PINK = 0xe2a29a;
/** C4P: a catchlight in each eye and a touch of blush, so faces look awake. */
const GLINT = 0xfbf8f0;
const BLUSH = 0xe6a19b;
const NOSE_DARK = 0x3a2c26;

export const SPECIES_ART: Record<SpeciesId, SpeciesArt> = {
  badger: {
    scale: [1.14, 0.96, 1.1],
    furs: [
      [0x8b8783, 0xf2eee8],
      [0x77736f, 0xebe7e0],
      [0x9d978f, 0xf6f2ea],
    ],
    snout: [0.034, 1],
    nose: NOSE_DARK,
    socks: 0x34302d,
  },
  fox: {
    scale: [0.96, 1.04, 0.98],
    furs: [
      [0xc9652d, 0xf4ece0],
      [0xd57b38, 0xf6efe4],
      [0xb85a2b, 0xefe4d4],
      [0xcf9a5e, 0xf5ede0],
    ],
    snout: [0.042, 0.85],
    nose: NOSE_DARK,
    socks: 0x3d2b22,
  },
  hedgehog: {
    scale: [1.06, 0.92, 1.04],
    furs: [
      [0x6e5541, 0xdcc6a6],
      [0x5f4a3a, 0xd3bb98],
      [0x7e6550, 0xe2cfb2],
    ],
    snout: [0.04, 0.8],
    nose: NOSE_DARK,
    socks: null,
  },
  mouse: {
    scale: [0.86, 0.86, 0.86],
    furs: [
      [0xa79a8d, 0xf1e6dc],
      [0x8d7b6a, 0xe9dccf],
      [0xc8b49c, 0xf6eee4],
      [0x9b8f86, 0xece6e0],
    ],
    snout: [0.032, 0.85],
    nose: PINK,
    socks: null,
  },
  otter: {
    scale: [0.94, 1.04, 0.96],
    furs: [
      [0x6f4c35, 0xd6bd9c],
      [0x7d5a3f, 0xe2cba9],
      [0x5d4130, 0xc9ad8b],
    ],
    snout: [0.026, 1.3],
    nose: NOSE_DARK,
    socks: null,
  },
  rabbit: {
    scale: [1, 1, 1],
    furs: [
      [0x9c7a5b, 0xeadfcf],
      [0x8e8a84, 0xe9e5de],
      [0xd8c2a0, 0xf6efe2],
      [0x7a5a43, 0xe0cdb5],
    ],
    snout: [0.022, 1],
    nose: PINK,
    socks: null,
  },
  squirrel: {
    scale: [0.92, 0.95, 0.92],
    furs: [
      [0xa9552c, 0xf0dcc0],
      [0xb8683a, 0xf3e3c8],
      [0x8f8b88, 0xeeeae4],
    ],
    snout: [0.024, 0.95],
    nose: NOSE_DARK,
    socks: null,
  },
};

export function isSpecies(id: string): id is SpeciesId {
  return (SPECIES_IDS as readonly string[]).includes(id);
}

const fur: Channel = { hex: 0xffffff, paint: PAINT.fur };
const furLight: Channel = { hex: 0xffffff, paint: PAINT.furLight };
const cloth: Channel = { hex: 0xffffff, paint: PAINT.cloth };
const fixed = (hex: number, rig: Rig = RIG.none): Channel => ({ hex, rig });
const onRig = (ch: Channel, rig: Rig): Channel => ({ ...ch, rig });

// Shared body numbers (figure space: feet at y 0, facing +z).
const TORSO_C: V3 = [0, 0.105, 0];
const TORSO_R: V3 = [0.07, 0.085, 0.062];
const HEAD_C: V3 = [0, 0.212, 0.008];
const HEAD_R: V3 = [0.066, 0.06, 0.06];

/** The head: fur with species face markings, painted per face. */
function head(b: RigBuilder, sp: SpeciesId): void {
  // C4P: ten slices (was eight) so the head reads round at the default camera.
  b.ellipsoid(HEAD_C, HEAD_R, 10, 4, (nx, _ny, nz, ring) => {
    const front = nz > 0.55;
    const diag = nz > 0.2 && Math.abs(nx) > 0.35 && Math.abs(nx) < 0.85;
    switch (sp) {
      case 'badger':
        // White face with two dark stripes running up over the eyes, grey behind.
        if (diag && ring <= 2) return fixed(INK);
        return nz > -0.3 ? furLight : fur;
      case 'fox':
      case 'otter':
        return front && ring >= 2 ? furLight : fur;
      case 'hedgehog':
        return nz > -0.1 && ring >= 1 ? furLight : fur;
      case 'squirrel':
      case 'mouse':
      case 'rabbit':
        return front && ring === 3 ? furLight : fur;
    }
  });
}

function face(b: RigBuilder, sp: SpeciesId): void {
  const art = SPECIES_ART[sp];
  const [len, w] = art.snout;
  const mz = 0.052 + len / 2;
  const muzzle = sp === 'badger' ? furLight : sp === 'hedgehog' ? furLight : furLight;
  b.ellipsoid([0, 0.196, mz], [0.028 * w, 0.022, len], 6, 3, () => muzzle);
  b.nub([0, 0.2, mz + len * 0.92], [0.011, 0.009, 0.008], fixed(art.nose));
  for (const s of [1, -1]) {
    // C4P: round eyes (were diamonds).
    b.ellipsoid([0.026 * s, 0.226, 0.058], [0.0105, 0.013, 0.008], 6, 2, () => fixed(INK));
    // C4P: the catchlight sits up and out, as if the sun were over one shoulder.
    b.nub([0.029 * s, 0.231, 0.0655], [0.0036, 0.0036, 0.002], fixed(GLINT));
    // Blush: a soft patch on each cheek, turned out with the face.
    if (sp !== 'badger' && sp !== 'otter') {
      const [cx, cy, cz] = [0.041 * s, 0.203, 0.0565];
      const [ux, uz] = [0.0105 * 0.82, -0.0105 * 0.57 * s];
      b.quad(
        [cx - ux, cy - 0.0055, cz - uz],
        [cx + ux, cy - 0.0055, cz + uz],
        [cx + ux, cy + 0.0055, cz + uz],
        [cx - ux, cy + 0.0055, cz - uz],
        fixed(BLUSH),
        [0.57 * s, 0, 0.82],
      );
    }
  }
}

function limbs(b: RigBuilder, sp: SpeciesId, simple = false): void {
  const sock = SPECIES_ART[sp].socks;
  for (const s of [1, -1]) {
    const arm = s > 0 ? RIG.armL : RIG.armR;
    const foot = s > 0 ? RIG.footL : RIG.footR;
    const armCh = sock !== null ? fixed(sock, arm) : onRig(fur, arm);
    const footCh = sock !== null ? fixed(sock, foot) : onRig(fur, foot);
    if (simple) {
      b.nub([0.074 * s, 0.112, 0.012], [0.02, 0.04, 0.02], armCh);
      continue;
    }
    // Arms hang from the shoulders, slightly forward; little domed feet with flat soles.
    b.ellipsoid([0.073 * s, 0.11, 0.012], [0.021, 0.044, 0.023], 5, 3, () => armCh);
    b.ellipsoid(
      [0.034 * s, 0.0, 0.024],
      [0.027, 0.03, 0.036],
      6,
      2,
      () => footCh,
      Math.PI / 6,
      0,
      Math.PI / 2,
    );
  }
}

function torso(b: RigBuilder, sp: SpeciesId, seg = 8, rings = 5): void {
  const lightFront = sp !== 'badger';
  b.ellipsoid(TORSO_C, TORSO_R, seg, rings, (_nx, _ny, nz, ring) => {
    // A little buttoned vest from the shoulders to the waist, with a V of light chest fur at the
    // neck; below it the round tummy in fur.
    const band = Math.floor((ring * 5) / rings);
    if (band <= 1) return band === 1 && nz > 0.7 && lightFront ? furLight : cloth;
    if (band === 2) return cloth;
    return nz > 0.4 && lightFront ? furLight : fur;
  });
  if (seg >= 8) {
    for (const y of [0.118, 0.094]) b.nub([0, y, 0.062], [0.006, 0.006, 0.004], fixed(palette.mustard));
  }
}

function ears(b: RigBuilder, sp: SpeciesId, simple: boolean): void {
  const e = RIG.ears;
  const seg = simple ? 4 : 6;
  for (const s of [1, -1]) {
    switch (sp) {
      case 'rabbit':
        b.ellipsoid([0.026 * s, 0.322, -0.006], [0.019, 0.072, 0.011], seg, simple ? 2 : 3, () =>
          onRig(fur, e),
        );
        if (!simple)
          b.ellipsoid([0.026 * s, 0.318, 0.0], [0.011, 0.054, 0.007], 4, 2, (_x, _y, nz) =>
            nz > 0 ? fixed(PINK, e) : null,
          );
        break;
      case 'mouse':
        b.ellipsoid([0.052 * s, 0.274, -0.008], [0.037, 0.037, 0.011], seg, simple ? 2 : 3, () =>
          onRig(fur, e),
        );
        if (!simple)
          b.ellipsoid([0.052 * s, 0.272, -0.002], [0.025, 0.025, 0.007], 6, 2, (_x, _y, nz) =>
            nz > 0 ? fixed(PINK, e) : null,
          );
        break;
      case 'fox':
        b.tube(
          [
            [0.034 * s, 0.25, 0],
            [0.044 * s, 0.295, -0.003],
            [0.052 * s, 0.33, -0.006],
          ],
          [0.026, 0.016, 0],
          simple ? 3 : 4,
          (i) => (i === 1 ? fixed(INK, e) : onRig(fur, e)),
        );
        break;
      case 'squirrel':
        b.tube(
          [
            [0.036 * s, 0.25, -0.004],
            [0.046 * s, 0.31, -0.008],
          ],
          [0.02, 0],
          simple ? 3 : 4,
          onRig(fur, e),
        );
        if (!simple) b.nub([0.047 * s, 0.315, -0.008], [0.008, 0.016, 0.008], fixed(0x5a3422, e));
        break;
      case 'badger':
        b.nub([0.05 * s, 0.258, -0.01], [0.017, 0.016, 0.009], fixed(0x3a3532, e));
        break;
      case 'otter':
        b.nub([0.054 * s, 0.248, -0.006], [0.012, 0.012, 0.008], onRig(fur, e));
        break;
      case 'hedgehog':
        b.nub([0.05 * s, 0.25, 0.012], [0.012, 0.012, 0.008], onRig(furLight, e));
        break;
    }
  }
}

function tail(b: RigBuilder, sp: SpeciesId, simple: boolean): void {
  const t = RIG.tail;
  const n = simple ? 3 : 5;
  switch (sp) {
    case 'rabbit':
      b.ellipsoid([0, 0.07, -0.072], [0.028, 0.026, 0.024], simple ? 4 : 6, 2, () => onRig(furLight, t));
      break;
    case 'badger':
      b.nub([0, 0.06, -0.066], [0.022, 0.018, 0.03], onRig(fur, t));
      break;
    case 'hedgehog':
      b.nub([0, 0.05, -0.07], [0.012, 0.01, 0.016], onRig(fur, t));
      break;
    case 'otter':
      b.tube(
        [
          [0, 0.06, -0.05],
          [0, 0.035, -0.12],
          [0, 0.02, -0.18],
          [0, 0.016, -0.22],
        ],
        [0.034, 0.026, 0.016, 0],
        n,
        onRig(fur, t),
      );
      break;
    case 'fox':
      b.tube(
        [
          [0, 0.065, -0.05],
          [0, 0.07, -0.1],
          [0, 0.062, -0.16],
          [0, 0.05, -0.205],
          [0, 0.044, -0.225],
        ],
        [0.022, 0.044, 0.044, 0.028, 0],
        n,
        (i) => (i >= 3 ? onRig(furLight, t) : onRig(fur, t)),
      );
      break;
    case 'mouse':
      b.tube(
        [
          [0, 0.04, -0.05],
          [0, 0.02, -0.12],
          [0.03, 0.025, -0.18],
          [0.05, 0.06, -0.2],
        ],
        [0.008, 0.007, 0.005, 0.002],
        3,
        fixed(PINK, t),
      );
      break;
    case 'squirrel':
      // The big curl: up the back, over the top and a little forward.
      b.tube(
        [
          [0, 0.05, -0.055],
          [0, 0.1, -0.12],
          [0, 0.18, -0.135],
          [0, 0.255, -0.11],
          [0, 0.3, -0.06],
          [0, 0.305, -0.02],
        ],
        [0.024, 0.044, 0.05, 0.046, 0.034, 0],
        n,
        (i) => (i === 3 ? onRig(furLight, t) : onRig(fur, t)),
      );
      break;
  }
}

/** Hedgehog spines: a jagged dome over the back and the back of the head. */
function spines(b: RigBuilder, simple: boolean): void {
  const c: V3 = [0, 0.158, -0.012];
  const r: V3 = [0.086, 0.13, 0.086];
  const rings = simple ? 3 : 5;
  const seg = simple ? 6 : 10;
  const t1 = Math.PI * 0.72;
  const spike = (i: number, j: number): number => (simple ? 1.05 : (i + j) % 2 === 0 ? 1.18 : 0.98);
  const at = (i: number, j: number): V3 => {
    const t = (t1 * i) / rings;
    const p = (j / seg) * Math.PI * 2;
    const k = i === 0 ? 1.1 : spike(i, j);
    return [
      c[0] + r[0] * k * Math.sin(t) * Math.sin(p),
      c[1] + r[1] * k * Math.cos(t),
      c[2] + r[2] * k * Math.sin(t) * Math.cos(p),
    ];
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const pm = ((j + 0.5) / seg) * Math.PI * 2;
      // Only the back half (and the crown): the face stays clear.
      if (Math.cos(pm) > 0.25 && i > 0) continue;
      const tm = (t1 * (i + 0.5)) / rings;
      const out: V3 = [Math.sin(tm) * Math.sin(pm), Math.cos(tm), Math.sin(tm) * Math.cos(pm)];
      const ch = (i + j) % 3 === 0 && !simple ? fixed(0xd7c3a4) : fur;
      if (i === 0) b.tri(at(0, j), at(1, j), at(1, j + 1), ch, out);
      else b.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), ch, out);
    }
  }
}

function buildFull(sp: SpeciesId): RigBuilder {
  const b = new RigBuilder();
  limbs(b, sp);
  torso(b, sp);
  head(b, sp);
  face(b, sp);
  ears(b, sp, false);
  tail(b, sp, false);
  if (sp === 'hedgehog') spines(b, false);
  return b;
}

function buildSimple(sp: SpeciesId): RigBuilder {
  const b = new RigBuilder();
  torso(b, sp, 6, 3);
  b.ellipsoid(HEAD_C, HEAD_R, 6, 2, () => fur);
  b.nub([0, 0.198, 0.07], [0.024, 0.02, 0.022], furLight);
  ears(b, sp, true);
  tail(b, sp, true);
  if (sp === 'hedgehog') spines(b, true);
  return b;
}

function buildDot(): RigBuilder {
  const b = new RigBuilder();
  b.ellipsoid([0, 0.14, 0], [0.075, 0.14, 0.075], 4, 2, (_x, ny) => (ny > 0 ? cloth : fur), Math.PI / 4);
  return b;
}

/**
 * Geometry for one species at a level of detail, with `paint` and `rig` attributes for the
 * resident material. Full is about 260 triangles, simple about 60 and the dot 8.
 */
export function residentGeometry(species: string, detail: ResidentDetail = 'full'): BufferGeometry {
  const sp: SpeciesId = isSpecies(species) ? species : 'rabbit';
  const b = detail === 'dot' ? buildDot() : detail === 'simple' ? buildSimple(sp) : buildFull(sp);
  return b.build(0.3);
}

// --- Clothes worn on top: aprons, scarves and hats. All cloth-tinted, rigid. --------------------

function apron(b: RigBuilder): void {
  // A bib-and-skirt panel hanging off the chest, with a waist tie.
  b.ellipsoid(TORSO_C, [0.0735, 0.088, 0.066], 8, 1, () => cloth, Math.PI / 8, 1.52, 1.66);
  b.quad(
    [-0.046, 0.15, 0.058],
    [0.046, 0.15, 0.058],
    [0.05, 0.03, 0.05],
    [-0.05, 0.03, 0.05],
    cloth,
    [0, 0, 1],
  );
  b.quad(
    [-0.046, 0.15, 0.053],
    [0.046, 0.15, 0.053],
    [0.05, 0.03, 0.045],
    [-0.05, 0.03, 0.045],
    cloth,
    [0, 0, -1],
  );
  b.box(-0.05, 0.026, 0.044, 0.05, 0.034, 0.052, cloth);
  b.box(-0.02, 0.07, 0.058, 0.02, 0.1, 0.064, cloth);
}

function scarf(b: RigBuilder): void {
  b.ellipsoid([0, 0.172, 0.004], [0.062, 0.024, 0.06], 8, 2, () => cloth, Math.PI / 8, 0.9, 2.25);
  b.box(0.02, 0.1, 0.05, 0.044, 0.168, 0.066, cloth);
  b.box(0.018, 0.098, 0.05, 0.046, 0.108, 0.068, fixed(0xf7f4ec));
}

function hat(b: RigBuilder, kind: HatKind): void {
  const y = 0.262;
  const band = fixed(palette.accentRed);
  switch (kind) {
    case 'cap':
      b.ellipsoid(
        [0, y - 0.004, 0.004],
        [0.066, 0.032, 0.064],
        8,
        2,
        () => cloth,
        Math.PI / 8,
        0,
        Math.PI / 2,
      );
      b.ellipsoid([0, y - 0.002, 0.058], [0.044, 0.007, 0.03], 6, 2, () => cloth, Math.PI / 6, 0, Math.PI);
      break;
    case 'straw':
      b.ellipsoid([0, y, 0.004], [0.11, 0.009, 0.11], 10, 2, () => cloth);
      b.ellipsoid(
        [0, y + 0.006, 0.004],
        [0.048, 0.04, 0.048],
        8,
        2,
        () => cloth,
        Math.PI / 8,
        0,
        Math.PI / 2,
      );
      b.ellipsoid([0, y + 0.012, 0.004], [0.0495, 0.012, 0.0495], 8, 1, () => band, Math.PI / 8, 1.3, 1.62);
      break;
    case 'souwester':
      b.ellipsoid([0, y - 0.004, -0.008], [0.09, 0.022, 0.096], 10, 2, () => cloth);
      b.ellipsoid([0, y + 0.004, 0], [0.06, 0.046, 0.06], 8, 2, () => cloth, Math.PI / 8, 0, Math.PI / 2);
      break;
    case 'felt':
      b.ellipsoid([0, y, 0.004], [0.085, 0.008, 0.085], 8, 2, () => cloth);
      b.tube(
        [
          [0, y, 0.004],
          [0, y + 0.05, -0.002],
          [0, y + 0.072, -0.008],
        ],
        [0.05, 0.036, 0],
        6,
        cloth,
      );
      b.nub([0.042, y + 0.03, -0.02], [0.006, 0.03, 0.006], fixed(palette.accentRed));
      break;
    case 'bowler':
      b.ellipsoid([0, y, 0.004], [0.074, 0.007, 0.074], 8, 2, () => cloth);
      b.ellipsoid(
        [0, y + 0.002, 0.004],
        [0.052, 0.05, 0.052],
        8,
        2,
        () => cloth,
        Math.PI / 8,
        0,
        Math.PI / 2,
      );
      break;
    case 'top':
      b.ellipsoid([0, y, 0.004], [0.074, 0.007, 0.074], 8, 2, () => cloth);
      b.tube(
        [
          [0, y, 0.004],
          [0, y + 0.08, 0.004],
        ],
        [0.042, 0.047],
        8,
        cloth,
      );
      b.ellipsoid(
        [0, y + 0.08, 0.004],
        [0.047, 0.004, 0.047],
        8,
        2,
        () => cloth,
        Math.PI / 8,
        0,
        Math.PI / 2,
      );
      b.tube(
        [
          [0, y + 0.006, 0.004],
          [0, y + 0.02, 0.004],
        ],
        [0.0435, 0.0445],
        8,
        fixed(INK),
      );
      break;
    case 'wide':
      // A wide-brimmed traveling hat with a pheasant feather in the band.
      b.ellipsoid([0, y + 0.002, 0.004], [0.12, 0.008, 0.12], 12, 2, () => cloth);
      b.ellipsoid(
        [0, y + 0.006, 0.004],
        [0.055, 0.048, 0.055],
        8,
        2,
        () => cloth,
        Math.PI / 8,
        0,
        Math.PI / 2,
      );
      b.ellipsoid(
        [0, y + 0.012, 0.004],
        [0.0565, 0.012, 0.0565],
        8,
        1,
        () => fixed(INK),
        Math.PI / 8,
        1.3,
        1.62,
      );
      b.tube(
        [
          [0.05, y + 0.02, -0.01],
          [0.08, y + 0.07, -0.05],
          [0.095, y + 0.1, -0.1],
        ],
        [0.008, 0.01, 0.0],
        4,
        fixed(0xb8693a),
      );
      break;
    case 'beret':
      b.ellipsoid([0.012, y + 0.008, 0.0], [0.075, 0.022, 0.07], 10, 2, () => cloth);
      b.nub([0.012, y + 0.03, 0.0], [0.008, 0.012, 0.008], cloth);
      break;
    case 'captain':
      b.tube(
        [
          [0, y - 0.004, 0.004],
          [0, y + 0.028, 0.004],
        ],
        [0.058, 0.064],
        8,
        cloth,
      );
      b.ellipsoid(
        [0, y + 0.03, 0.004],
        [0.066, 0.012, 0.066],
        8,
        2,
        () => fixed(0xf7f4ec),
        Math.PI / 8,
        0,
        Math.PI / 2,
      );
      b.ellipsoid([0, y - 0.002, 0.06], [0.05, 0.006, 0.03], 6, 2, () => fixed(INK), Math.PI / 6, 0, Math.PI);
      b.nub([0, y + 0.014, 0.066], [0.01, 0.008, 0.004], fixed(palette.mustard));
      break;
    case 'baker':
      b.tube(
        [
          [0, y - 0.004, 0.004],
          [0, y + 0.03, 0.004],
        ],
        [0.056, 0.058],
        8,
        cloth,
      );
      b.ellipsoid([0, y + 0.05, 0.004], [0.066, 0.04, 0.066], 8, 3, () => cloth);
      break;
  }
}

const LEATHER_DARK = 0x6b4a30;
const BRASS = 0xc9a24a;

/** A bag on a strap across the body: the strap from the left shoulder, the bag at the right hip. */
function satchel(b: RigBuilder): void {
  b.tube(
    [
      [0.05, 0.17, 0.045],
      [0.0, 0.12, 0.068],
      [-0.055, 0.07, 0.05],
    ],
    [0.008, 0.008, 0.008],
    4,
    fixed(LEATHER_DARK),
  );
  b.tube(
    [
      [0.05, 0.17, -0.04],
      [0.0, 0.12, -0.064],
      [-0.055, 0.07, -0.045],
    ],
    [0.007, 0.007, 0.007],
    4,
    fixed(LEATHER_DARK),
  );
  b.box(-0.085, 0.035, -0.035, -0.06, 0.09, 0.04, cloth);
  b.box(-0.088, 0.065, -0.037, -0.058, 0.092, 0.042, fixed(LEATHER_DARK));
  b.box(-0.09, 0.07, 0.0, -0.087, 0.08, 0.008, fixed(BRASS));
}

/** A long knitted scarf: wound at the neck, its tails flying out behind. */
function longScarf(b: RigBuilder): void {
  b.ellipsoid([0, 0.172, 0.004], [0.064, 0.026, 0.062], 8, 2, () => cloth, Math.PI / 8, 0.9, 2.25);
  b.tube(
    [
      [0.03, 0.17, -0.05],
      [0.04, 0.15, -0.09],
      [0.05, 0.12, -0.13],
    ],
    [0.014, 0.013, 0.011],
    4,
    cloth,
  );
  b.tube(
    [
      [0.02, 0.165, 0.055],
      [0.03, 0.12, 0.07],
      [0.03, 0.08, 0.068],
    ],
    [0.013, 0.012, 0.012],
    4,
    cloth,
  );
  for (const y of [0.1, 0.12]) b.box(0.018, y, 0.064, 0.044, y + 0.006, 0.08, fixed(0xf7f4ec));
}

/** Brass goggles pushed up on the forehead, an inventor's badge of office. */
function goggles(b: RigBuilder): void {
  b.ellipsoid([0, 0.235, 0.006], [0.068, 0.012, 0.064], 10, 1, () => fixed(LEATHER_DARK), 0, 1.2, 1.94);
  for (const sx of [-1, 1]) {
    b.tube(
      [
        [sx * 0.026, 0.245, 0.058],
        [sx * 0.026, 0.245, 0.072],
      ],
      [0.02, 0.019],
      8,
      fixed(BRASS),
    );
    b.ellipsoid([sx * 0.026, 0.245, 0.073], [0.015, 0.015, 0.003], 8, 1, () => fixed(0x9fd0d8));
  }
}

/** A lute slung on the back, neck up over the shoulder. */
function lute(b: RigBuilder): void {
  b.ellipsoid([0.01, 0.1, -0.085], [0.045, 0.06, 0.022], 8, 3, () => fixed(0xb98a5a));
  b.ellipsoid([0.01, 0.1, -0.063], [0.012, 0.012, 0.002], 6, 1, () => fixed(INK));
  b.tube(
    [
      [0.01, 0.15, -0.08],
      [0.035, 0.24, -0.075],
      [0.045, 0.27, -0.08],
    ],
    [0.008, 0.007, 0.01],
    4,
    fixed(0x8a5a3a),
  );
  b.tube(
    [
      [0.055, 0.17, 0.04],
      [0.0, 0.13, 0.066],
      [-0.05, 0.09, 0.05],
    ],
    [0.005, 0.005, 0.005],
    3,
    cloth,
  );
}

/** A knitted shawl round the shoulders, fringed in front. */
function shawl(b: RigBuilder): void {
  b.ellipsoid([0, 0.15, 0.0], [0.08, 0.05, 0.072], 10, 2, () => cloth, Math.PI / 10, 0.2, 1.7);
  b.nub([0, 0.12, 0.07], [0.02, 0.02, 0.008], fixed(palette.mustard));
}

/** A sling across the chest with a baby snug inside, peeking out. */
function sling(b: RigBuilder): void {
  b.tube(
    [
      [0.055, 0.17, -0.04],
      [0.06, 0.15, 0.03],
      [0.0, 0.08, 0.075],
      [-0.06, 0.07, 0.03],
    ],
    [0.012, 0.012, 0.03, 0.012],
    6,
    cloth,
  );
  b.ellipsoid([0.0, 0.1, 0.085], [0.032, 0.028, 0.026], 6, 3, () => fixed(0xf3ead8));
  b.ellipsoid([0.0, 0.128, 0.088], [0.022, 0.02, 0.02], 6, 3, () => fixed(0xd8c2a0));
  for (const sx of [-1, 1]) b.nub([sx * 0.014, 0.15, 0.084], [0.006, 0.012, 0.005], fixed(0xd8c2a0));
  b.nub([0, 0.126, 0.107], [0.004, 0.004, 0.003], fixed(INK));
}

/** C4P: a skirt flaring from the waist, so a vest becomes a dress. */
function skirt(b: RigBuilder): void {
  b.tube(
    [
      [0, 0.08, 0],
      [0, 0.058, 0.002],
      [0, 0.032, 0.004],
    ],
    [0.067, 0.081, 0.093],
    10,
    cloth,
  );
  // A darker hem band, so the flare reads from above.
  b.tube(
    [
      [0, 0.04, 0.0035],
      [0, 0.031, 0.004],
    ],
    [0.0905, 0.0945],
    10,
    { ...cloth, shade: 0.72 },
  );
}

/** C4P: overalls: trousers over the tummy, a bib in front and straps over the shoulders. */
function overalls(b: RigBuilder): void {
  b.ellipsoid(TORSO_C, [0.0728, 0.0878, 0.0648], 8, 2, () => cloth, Math.PI / 8, 1.85, Math.PI);
  for (const [z, out] of [
    [0.0655, 1],
    [0.0605, -1],
  ] as const)
    b.quad(
      [-0.033, 0.134, z - 0.004],
      [0.033, 0.134, z - 0.004],
      [0.036, 0.072, z],
      [-0.036, 0.072, z],
      cloth,
      [0, 0, out],
    );
  for (const s of [1, -1]) {
    b.tube(
      [
        [0.027 * s, 0.132, 0.06],
        [0.042 * s, 0.168, 0.036],
        [0.046 * s, 0.181, -0.008],
        [0.038 * s, 0.14, -0.058],
      ],
      [0.0065, 0.0065, 0.0065, 0.0065],
      3,
      cloth,
    );
    b.nub([0.026 * s, 0.128, 0.067], [0.0055, 0.0055, 0.003], fixed(palette.mustard));
  }
}

/** C4P: a neckerchief knotted at the throat, its point down the chest. */
function kerchief(b: RigBuilder): void {
  b.ellipsoid([0, 0.172, 0.004], [0.06, 0.012, 0.058], 8, 1, () => cloth, Math.PI / 8, 1.2, 1.95);
  b.tri([-0.032, 0.176, 0.056], [0.032, 0.176, 0.056], [0, 0.128, 0.069], cloth, [0, 0.2, 1]);
  b.tri([-0.032, 0.176, 0.052], [0.032, 0.176, 0.052], [0, 0.128, 0.064], cloth, [0, -0.2, -1]);
  b.nub([0, 0.17, 0.063], [0.008, 0.007, 0.005], cloth);
}

/** C4P: a hair bow worn to one side, between the ears. */
function bow(b: RigBuilder): void {
  const c: V3 = [-0.03, 0.262, 0.03];
  for (const s of [1, -1]) b.nub([c[0] + 0.013 * s, c[1], c[2]], [0.013, 0.0095, 0.006], cloth);
  b.nub(c, [0.006, 0.0065, 0.0065], cloth);
}

/** Geometry for something worn on top of the body (an apron, a scarf, a hat, a satchel...). */
export function extraGeometry(kind: ExtraKind): BufferGeometry {
  const b = new RigBuilder();
  if (kind === 'apron') apron(b);
  else if (kind === 'bow') bow(b);
  else if (kind === 'kerchief') kerchief(b);
  else if (kind === 'overalls') overalls(b);
  else if (kind === 'skirt') skirt(b);
  else if (kind === 'scarf') scarf(b);
  else if (kind === 'satchel') satchel(b);
  else if (kind === 'longscarf') longScarf(b);
  else if (kind === 'goggles') goggles(b);
  else if (kind === 'lute') lute(b);
  else if (kind === 'shawl') shawl(b);
  else if (kind === 'sling') sling(b);
  else hat(b, kind.slice(4) as HatKind);
  return b.build(0.3);
}

/**
 * C4E: the signature outfit of a story character by species (docs/spec/11-residents.md, Story
 * characters), so they can be picked out of a crowd: Pippa Quill the inventor (mouse) in goggles
 * with a satchel of tools, Odette Fenwick the merchant (fox) in a wide hat with a ledger bag,
 * Juniper Reed the musician (rabbit) in a beret and a long scarf with a lute, and the later cast.
 */
export function storyOutfit(species: string): { kind: ExtraKind; color: number }[] {
  switch (species) {
    case 'mouse':
      return [
        { kind: 'hat:cap', color: palette.teal },
        { kind: 'goggles', color: BRASS },
        { kind: 'satchel', color: 0x9a6b43 },
      ];
    case 'fox':
      return [
        { kind: 'hat:wide', color: palette.roofPlum },
        { kind: 'longscarf', color: palette.mustard },
        { kind: 'satchel', color: 0x34506b },
      ];
    case 'rabbit':
      return [
        { kind: 'hat:beret', color: palette.accentRed },
        { kind: 'longscarf', color: 0x7fa7c4 },
        { kind: 'lute', color: 0x6e8a5a },
      ];
    case 'otter':
      return [
        { kind: 'hat:captain', color: palette.navy },
        { kind: 'longscarf', color: palette.accentRed },
      ];
    case 'hedgehog':
      return [
        { kind: 'shawl', color: 0x8fa37a },
        { kind: 'satchel', color: 0x6e8a5a },
      ];
    default:
      return [
        { kind: 'hat:wide', color: 0x6b4f3a },
        { kind: 'longscarf', color: palette.teal },
        { kind: 'satchel', color: 0x9a6b43 },
      ];
  }
}

// --- Looks: fur and clothes from the look seed, job and tier. ------------------------------------

/** Cozy clothing colors, picked by the look seed. */
export const CLOTH_COLORS: readonly number[] = [
  palette.teal,
  palette.accentRed,
  palette.mustard,
  palette.navy,
  0x8fa37a, // sage green
  0xd48a86, // dusty rose
  palette.roofPlum,
  0x7fa7c4, // sky
  0xb8693a, // rust
  0x9f8fc4, // lilac
  palette.roofMoss,
  0x5f8fb0, // cornflower
];

const STRAW = 0xd9b96a;
const CREAM = 0xf3ead8;
const LEATHER = 0x8a5a3a;

export interface ResidentLookInput {
  species: string;
  look: number;
  /** Life stage: children are smaller. */
  stage?: string;
  /** Tier id: craftsfolk and up wear a little more. */
  tier?: string;
  /** Building def id of the workplace, for work clothes. */
  job?: string;
  /** C4E: a story character, dressed in their signature outfit. */
  story?: boolean;
}

export interface ResidentLook {
  species: SpeciesId;
  fur: number;
  furLight: number;
  /** Vest color. */
  cloth: number;
  /** Overall figure scale (species proportions times the child factor). */
  scale: V3;
  extras: { kind: ExtraKind; color: number }[];
}

const CHILD_SCALE = 0.7;

const DENIMS = [0x4f6d8f, 0x5d7a99, 0x7a5a3e] as const;
const BOWS = [palette.accentRed, 0xd48a86, palette.mustard, 0xf7f4ec] as const;
/** Workplaces whose hands mostly wear overalls (fields, pens and yards). */
const OVERALLS_JOBS: ReadonlySet<string> = new Set([
  'builders-yard',
  'clay-pit',
  'dairy',
  'farmhouse',
  'farmstead',
  'herb-garden',
  'orchard',
  'sheep-pasture',
  'vegetable-plot',
]);

/**
 * C4P: the everyday outfit over the vest: a skirt (so some wear dresses), overalls for field and
 * yard hands, a neckerchief, a hair bow. Story characters keep their signature outfit.
 */
function dressUp(
  extras: { kind: ExtraKind; color: number }[],
  input: ResidentLookInput,
  outfit: number,
  accent: number,
  second: number,
): void {
  if (input.story && input.stage !== 'child') return;
  const has = (k: (kind: ExtraKind) => boolean): boolean => extras.some((e) => k(e.kind));
  const apron = has((k) => k === 'apron');
  const hat = has((k) => k.startsWith('hat:'));
  const neck = has((k) => k === 'scarf' || k === 'longscarf' || k === 'shawl');
  if (input.stage === 'child') {
    if (outfit < 0.3) extras.push({ kind: 'skirt', color: second });
    if (accent > 0.72 && !hat)
      extras.push({ kind: 'bow', color: BOWS[Math.floor(outfit * 97) % BOWS.length]! });
    return;
  }
  const denim = DENIMS[Math.floor(outfit * 997) % DENIMS.length]!;
  const fieldHand = !!input.job && OVERALLS_JOBS.has(input.job);
  if (!apron && (fieldHand ? outfit < 0.65 : outfit >= 0.32 && outfit < 0.42))
    extras.push({ kind: 'overalls', color: denim });
  else if (outfit < 0.32) extras.push({ kind: 'skirt', color: second });
  if (accent < 0.2 && !neck) extras.push({ kind: 'kerchief', color: second });
  else if (accent > 0.86 && !hat)
    extras.push({ kind: 'bow', color: BOWS[Math.floor(outfit * 97) % BOWS.length]! });
}

/**
 * Fur and clothes for a resident, deterministic from the look seed. Work clothes follow the job:
 * bakers in white aprons and toques, farmers in straw hats, fishers in sou'westers.
 */
export function residentLook(input: ResidentLookInput): ResidentLook {
  const sp: SpeciesId = isSpecies(input.species) ? input.species : 'rabbit';
  const art = SPECIES_ART[sp];
  const rnd = seeded(input.look * 7919 + 13);
  const [f, fl] = art.furs[Math.floor(rnd() * art.furs.length)]!;
  const cloth = CLOTH_COLORS[Math.floor(rnd() * CLOTH_COLORS.length)]!;
  const other =
    CLOTH_COLORS[(CLOTH_COLORS.indexOf(cloth) + 3 + Math.floor(rnd() * 6)) % CLOTH_COLORS.length]!;
  const child = input.stage === 'child';
  const k = child ? CHILD_SCALE : 1;
  const extras: { kind: ExtraKind; color: number }[] = [];
  const roll = rnd();
  // C4P: rolls for the everyday outfit come after the I1 ones, so fur, vest and work clothes stay
  // what they were for every resident.
  const outfit = rnd();
  const accent = rnd();
  let second = CLOTH_COLORS[Math.floor(rnd() * CLOTH_COLORS.length)]!;
  if (second === cloth) second = CLOTH_COLORS[(CLOTH_COLORS.indexOf(cloth) + 5) % CLOTH_COLORS.length]!;
  if (!child) {
    switch (input.job) {
      case 'bakery':
        extras.push({ kind: 'apron', color: CREAM }, { kind: 'hat:baker', color: 0xfbf8f2 });
        break;
      case 'farmhouse':
      case 'vegetable-plot':
        extras.push({ kind: 'hat:straw', color: STRAW });
        if (roll < 0.5) extras.push({ kind: 'scarf', color: other });
        break;
      case 'fishers-hut':
        extras.push({ kind: 'hat:souwester', color: palette.mustard });
        break;
      case 'foresters-lodge':
      case 'woodcutter':
        extras.push({ kind: 'hat:felt', color: roll < 0.5 ? 0x4f6a3e : 0x6b4f3a });
        break;
      case 'quarry':
      case 'sawpit':
        extras.push({ kind: 'apron', color: LEATHER }, { kind: 'hat:cap', color: other });
        break;
      case 'builders-yard':
      case 'town-hall':
        extras.push({ kind: 'hat:cap', color: other });
        if (roll < 0.4) extras.push({ kind: 'apron', color: LEATHER });
        break;
      case 'windmill':
        extras.push({ kind: 'apron', color: CREAM }, { kind: 'hat:cap', color: 0xe9e1d2 });
        break;
      case 'market-stall':
        extras.push({ kind: 'apron', color: 0xe9eef2 });
        if (roll < 0.5) extras.push({ kind: 'scarf', color: other });
        break;
      case 'storehouse':
        extras.push({ kind: roll < 0.5 ? 'hat:cap' : 'scarf', color: other });
        break;
      default:
        if (roll < 0.3) extras.push({ kind: 'scarf', color: other });
        else if (roll < 0.45) extras.push({ kind: 'hat:cap', color: other });
    }
    // Tier details: the better off dress up a little.
    const hasHat = extras.some((e) => e.kind.startsWith('hat:'));
    if (input.tier === 'merchant' && !hasHat) extras.push({ kind: 'hat:bowler', color: 0x3b3229 });
    if (input.tier === 'patron') {
      for (let i = extras.length - 1; i >= 0; i--)
        if (extras[i]!.kind.startsWith('hat:')) extras.splice(i, 1);
      extras.push({ kind: 'hat:top', color: 0x2f2a33 });
    }
    if (input.tier === 'craftsfolk' && !extras.some((e) => e.kind === 'scarf') && roll > 0.5)
      extras.push({ kind: 'scarf', color: other });
  } else if (roll < 0.35) {
    extras.push({ kind: 'scarf', color: other });
  }
  dressUp(extras, input, outfit, accent, second);
  if (input.story && !child) {
    extras.length = 0;
    extras.push(...storyOutfit(sp));
  }
  return {
    species: sp,
    fur: f,
    furLight: fl,
    cloth,
    scale: [art.scale[0] * k, art.scale[1] * k, art.scale[2] * k],
    extras,
  };
}

/**
 * The `resident` kit (content species name it in `art.kit`): one figure with its tints baked in,
 * for the gallery and anything that wants a single still resident. Params: species, look.
 */
export const resident: Kit = {
  id: 'resident',
  kind: 'decor',
  build(opts) {
    const species = String(opts?.params?.species ?? 'rabbit');
    const lookSeed = Number(opts?.params?.look ?? opts?.seed ?? 1);
    const look = residentLook({ species, look: lookSeed });
    const b = opts?.lod === 'low' ? buildSimple(look.species) : buildFull(look.species);
    const g = b.build(0.3, { cloth: look.cloth, fur: look.fur, furLight: look.furLight });
    return g.scale(look.scale[0], look.scale[1], look.scale[2]);
  },
};
